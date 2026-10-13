import { randomBytes } from "node:crypto";
import {
  createPublicClient,
  createWalletClient,
  defineChain,
  http,
  keccak256,
  parseEther,
  toBytes,
  toHex,
  type Address,
  type PublicClient,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { base } from "viem/chains";
import { erc20Abi, POOL } from "@/lib/aave/constants";
import { approveIfNeeded, readPosition, supply, toUnits, withdraw, type ReserveRef } from "@/widget/aave";
import type { EarnState } from "@/widget/types";
import { forkRpcUrl } from "./chain";
import { getMarket } from "./markets";

/** Starting balance for every sandbox wallet. */
export const SANDBOX_FUNDS = 10_000;
const MAX_WARP_SECONDS = 2 * 365 * 24 * 3600;

type Fork = { url: string; chainId: number; kind: "anvil" | "hardhat" | "tenderly"; client: PublicClient };

const g = globalThis as {
  __fork?: Promise<Fork | null>;
  __forkFailedAt?: number;
  __sandboxSecret?: string;
  __principal?: Map<string, number>;
  __forkLock?: Promise<unknown>;
};

/** Fork-wide cheat calls (impersonation, balance setting) must not interleave between sessions. */
function exclusive<T>(work: () => Promise<T>): Promise<T> {
  const run = (g.__forkLock ?? Promise.resolve()).catch(() => undefined).then(work);
  g.__forkLock = run.catch(() => undefined);
  return run;
}

export class SandboxError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

/** Connects to FORK_RPC_URL once. If it was unreachable, tries again after 30 s. */
function fork(): Promise<Fork | null> {
  const url = forkRpcUrl();
  if (!url) return Promise.resolve(null);
  const retry = g.__forkFailedAt !== undefined && Date.now() - g.__forkFailedAt > 30_000;
  if (g.__fork && !retry) return g.__fork;
  g.__forkFailedAt = undefined;
  g.__fork = connect(url).then((f) => {
    if (!f) g.__forkFailedAt = Date.now();
    return f;
  });
  return g.__fork;
}

async function connect(url: string): Promise<Fork | null> {
  try {
    const probe = createPublicClient({ transport: http(url, { timeout: 5_000 }) });
    const [chainId, version] = await Promise.all([
      probe.getChainId(),
      (probe.request({ method: "web3_clientVersion" } as never) as Promise<string>).catch(() => ""),
    ]);
    const chain = defineChain({ ...base, id: chainId, rpcUrls: { default: { http: [url] } } });
    const kind = /anvil/i.test(version) ? "anvil" : /hardhat/i.test(version) ? "hardhat" : "tenderly";
    const client = createPublicClient({ chain, transport: http(url, { timeout: 30_000 }) }) as PublicClient;
    return { url, chainId, kind, client };
  } catch (err) {
    console.warn("[sandbox] fork RPC unreachable:", err instanceof Error ? err.message : err);
    return null;
  }
}

export async function sandboxInfo(): Promise<{ mode: "fork" | "simulated"; chainId?: number; note?: string }> {
  if (!forkRpcUrl()) return { mode: "simulated" };
  const f = await fork();
  return f ? { mode: "fork", chainId: f.chainId } : { mode: "simulated", note: "FORK_RPC_URL is set but not reachable." };
}

export function newSessionId(): string {
  return randomBytes(16).toString("hex");
}

/** Each browser session gets its own throwaway wallet, derived from a server secret so nothing is stored. */
function walletFor(f: Fork, sid: string) {
  g.__sandboxSecret ??= process.env.SANDBOX_SECRET?.trim() || randomBytes(32).toString("hex");
  const account = privateKeyToAccount(keccak256(toBytes(`${g.__sandboxSecret}:${sid}`)));
  return createWalletClient({ account, chain: f.client.chain!, transport: http(f.url, { timeout: 30_000 }) });
}

async function reserveFor(symbol: string): Promise<ReserveRef> {
  const market = await getMarket(symbol);
  if (!market) throw new SandboxError(`${symbol} is not listed on Aave v3 Base.`);
  return { pool: POOL, asset: market.address, aToken: market.aToken, decimals: market.decimals, symbol };
}

async function rpc(f: Fork, method: string, params: unknown[]) {
  return f.client.request({ method, params } as never);
}

async function setEth(f: Fork, to: Address, wei: bigint) {
  if (f.kind === "tenderly") await rpc(f, "tenderly_setBalance", [[to], toHex(wei)]);
  else await rpc(f, `${f.kind}_setBalance`, [to, toHex(wei)]);
}

/** Gives the wallet tokens. Tenderly can set balances directly; on Anvil we borrow them from the aToken, which holds the market's liquidity. */
async function setTokens(f: Fork, reserve: ReserveRef, to: Address, amount: bigint) {
  if (f.kind === "tenderly") {
    await rpc(f, "tenderly_setErc20Balance", [reserve.asset, to, toHex(amount)]);
    return;
  }
  const holder = reserve.aToken;
  await rpc(f, `${f.kind}_impersonateAccount`, [holder]);
  try {
    await setEth(f, holder, parseEther("1"));
    const signer = createWalletClient({ account: holder, chain: f.client.chain!, transport: http(f.url) });
    const hash = await signer.writeContract({ address: reserve.asset, abi: erc20Abi, functionName: "transfer", args: [to, amount] });
    await f.client.waitForTransactionReceipt({ hash });
  } finally {
    await rpc(f, `${f.kind}_stopImpersonatingAccount`, [holder]).catch(() => undefined);
  }
}

function principalMap() {
  g.__principal ??= new Map();
  return g.__principal;
}

async function requireFork(): Promise<Fork> {
  const f = await fork();
  if (!f) throw new SandboxError("The fork sandbox is not running. Set FORK_RPC_URL (see README).", 503);
  return f;
}

/** Reads the session wallet's position, funding it on first use. */
export async function sandboxState(sid: string, symbol: string): Promise<EarnState> {
  const f = await requireFork();
  const signer = walletFor(f, sid);
  const reserve = await reserveFor(symbol);
  const address = signer.account.address;

  const key = `${sid}:${symbol}`;
  let pos = await readPosition(f.client, reserve, address);
  if (!principalMap().has(key) && pos.wallet === 0 && pos.deposited === 0) {
    await exclusive(async () => {
      if (principalMap().has(key)) return;
      const gas = await f.client.getBalance({ address });
      if (gas < parseEther("0.05")) await setEth(f, address, parseEther("1"));
      await setTokens(f, reserve, address, toUnits(SANDBOX_FUNDS, reserve.decimals));
      principalMap().set(key, 0);
    });
    pos = await readPosition(f.client, reserve, address);
  }
  return { asset: symbol, wallet: pos.wallet, deposited: pos.deposited, principal: principalMap().get(key) ?? 0, apy: pos.apy, account: address };
}

export async function sandboxApprove(sid: string, symbol: string, amount: number) {
  const f = await requireFork();
  const reserve = await reserveFor(symbol);
  return approveIfNeeded(f.client, walletFor(f, sid), reserve, toUnits(amount, reserve.decimals));
}

export async function sandboxSupply(sid: string, symbol: string, amount: number) {
  const f = await requireFork();
  const reserve = await reserveFor(symbol);
  const hash = await supply(f.client, walletFor(f, sid), reserve, toUnits(amount, reserve.decimals));
  const key = `${sid}:${symbol}`;
  principalMap().set(key, (principalMap().get(key) ?? 0) + amount);
  return hash;
}

export async function sandboxWithdraw(sid: string, symbol: string, amount: number | "max") {
  const f = await requireFork();
  const reserve = await reserveFor(symbol);
  const hash = await withdraw(f.client, walletFor(f, sid), reserve, amount === "max" ? "max" : toUnits(amount, reserve.decimals));
  const key = `${sid}:${symbol}`;
  principalMap().set(key, amount === "max" ? 0 : Math.max(0, (principalMap().get(key) ?? 0) - amount));
  return hash;
}

/** Moves the fork's clock forward. Interest accrues on the next block because aToken balances read the time-based liquidity index. */
export async function sandboxWarp(seconds: number) {
  const f = await requireFork();
  const s = Math.round(Math.min(Math.max(seconds, 60), MAX_WARP_SECONDS));
  await exclusive(async () => {
    await rpc(f, "evm_increaseTime", [f.kind === "tenderly" ? toHex(s) : s]);
    await rpc(f, "evm_mine", []);
  });
  const block = await f.client.getBlock();
  return { seconds: s, timestamp: Number(block.timestamp) * 1000 };
}
