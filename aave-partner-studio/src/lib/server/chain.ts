import { createPublicClient, http, type PublicClient } from "viem";
import { base } from "viem/chains";

export function baseRpcUrl(): string {
  return process.env.BASE_RPC_URL?.trim() || "https://mainnet.base.org";
}

/** Fork RPC (local Anvil or a Tenderly Virtual TestNet). Unset means the sandbox simulates with live rates. */
export function forkRpcUrl(): string | null {
  return process.env.FORK_RPC_URL?.trim() || null;
}

const g = globalThis as { __baseClient?: PublicClient };

/** Read-only client for Base mainnet. */
export function baseClient(): PublicClient {
  g.__baseClient ??= createPublicClient({ chain: base, transport: http(baseRpcUrl(), { batch: true, timeout: 12_000 }) }) as PublicClient;
  return g.__baseClient;
}
