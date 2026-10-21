import "server-only";
import { createPublicClient, erc20Abi, formatUnits, http, type Address } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";

export const NETWORK = "eip155:84532" as const;
export const USDC_BASE_SEPOLIA: Address = "0x036CbD53842c5426634e7929541eC2318f3dCF7e";
export const EXPLORER = "https://sepolia.basescan.org";
export const FAUCET = "https://faucet.circle.com";

export function facilitatorUrl() {
  return process.env.X402_FACILITATOR_URL?.trim() || "https://x402.org/facilitator";
}

export function buyerAccount() {
  const key = process.env.BUYER_PRIVATE_KEY?.trim();
  return key ? privateKeyToAccount(key as `0x${string}`) : null;
}

export function sellerAddress(): Address | null {
  const a = process.env.SELLER_ADDRESS?.trim();
  return a && /^0x[0-9a-fA-F]{40}$/.test(a) ? (a as Address) : null;
}

const client = createPublicClient({ chain: baseSepolia, transport: http(process.env.BASE_SEPOLIA_RPC_URL?.trim() || "https://sepolia.base.org") });

let balanceCache: { at: number; address: string; value: string | null } | null = null;

/** Buyer's testnet USDC, cached for 15 seconds. Null if the RPC can't be reached. */
export async function buyerUsdc(force = false): Promise<string | null> {
  const buyer = buyerAccount();
  if (!buyer) return null;
  if (!force && balanceCache && balanceCache.address === buyer.address && Date.now() - balanceCache.at < 15_000) return balanceCache.value;
  let value: string | null = null;
  try {
    const raw = await client.readContract({ address: USDC_BASE_SEPOLIA, abi: erc20Abi, functionName: "balanceOf", args: [buyer.address] });
    value = formatUnits(raw, 6);
  } catch {
    value = null;
  }
  balanceCache = { at: Date.now(), address: buyer.address, value };
  return value;
}

export type PaymentsMode = { mode: "live" | "simulated"; reason?: string; buyer?: string; seller?: string; balance?: string | null };

/**
 * Live: real x402 settlement on Base Sepolia through the facilitator. Simulated: same headers and checks,
 * but the seller skips settlement. X402_MODE=live|simulated forces one; by default the lab goes live as
 * soon as the buyer wallet holds testnet USDC.
 */
export async function paymentsMode(): Promise<PaymentsMode> {
  const buyer = buyerAccount()?.address;
  const seller = sellerAddress() ?? undefined;
  const forced = process.env.X402_MODE?.trim();
  if (!buyer || !seller) return { mode: "simulated", reason: "BUYER_PRIVATE_KEY and SELLER_ADDRESS are not both set", buyer, seller };
  if (forced === "simulated") return { mode: "simulated", reason: "X402_MODE=simulated", buyer, seller };
  const balance = await buyerUsdc();
  if (forced === "live") return { mode: "live", buyer, seller, balance };
  if (balance === null) return { mode: "simulated", reason: "Base Sepolia RPC unreachable", buyer, seller, balance };
  if (Number(balance) < 0.01) return { mode: "simulated", reason: "buyer wallet has no testnet USDC yet", buyer, seller, balance };
  return { mode: "live", buyer, seller, balance };
}
