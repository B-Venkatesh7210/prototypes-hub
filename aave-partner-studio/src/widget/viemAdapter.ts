import type { Account, Chain, PublicClient, Transport, WalletClient } from "viem";
import { approveIfNeeded, readPosition, supply, toUnits, withdraw, type ReserveRef } from "./aave";
import type { EarnAdapter } from "./types";

type PrincipalStore = { get(): number; set(value: number): void };

/** Keeps the user's net deposits in localStorage so the widget can show interest earned. */
export function localPrincipal(key: string): PrincipalStore {
  return {
    get: () => Number(globalThis.localStorage?.getItem(key) ?? 0) || 0,
    set: (value) => globalThis.localStorage?.setItem(key, String(Math.max(0, value))),
  };
}

/**
 * Non-custodial adapter: the user's own (embedded or connected) wallet signs approve + supply on Base.
 * Works with any viem WalletClient, so Privy, Dynamic, Coinbase Smart Wallet or wagmi all plug in.
 */
export function createViemEarnAdapter(opts: {
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain, Account>;
  reserve: ReserveRef;
  principal?: PrincipalStore;
}): EarnAdapter {
  const { publicClient, walletClient, reserve } = opts;
  const account = walletClient.account.address;
  const principal = opts.principal ?? localPrincipal(`aave-earn:${reserve.symbol}:${account}`);

  return {
    async getState() {
      const pos = await readPosition(publicClient, reserve, account);
      return { asset: reserve.symbol, wallet: pos.wallet, deposited: pos.deposited, principal: principal.get(), apy: pos.apy, account };
    },
    async deposit(amount, onStep) {
      const units = toUnits(amount, reserve.decimals);
      const approval = await approveIfNeeded(publicClient, walletClient, reserve, units);
      onStep?.("approve", approval ?? undefined);
      const hash = await supply(publicClient, walletClient, reserve, units);
      onStep?.("supply", hash);
      principal.set(principal.get() + amount);
    },
    async withdraw(amount, onStep) {
      const hash = await withdraw(publicClient, walletClient, reserve, amount === "max" ? "max" : toUnits(amount, reserve.decimals));
      onStep?.("withdraw", hash);
      principal.set(amount === "max" ? 0 : principal.get() - amount);
    },
  };
}
