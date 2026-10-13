import { maxUint256, parseUnits, type Account, type Address, type Chain, type Hash, type PublicClient, type Transport, type WalletClient } from "viem";
import { erc20Abi, poolAbi, rayToApy } from "./abi";

export type ReserveRef = {
  pool: Address;
  asset: Address;
  aToken: Address;
  decimals: number;
  symbol: string;
};

export type Position = { wallet: number; deposited: number; apy: number; timestamp: number };

/** Wallet balance, aToken balance and supply APY in one round trip. */
export async function readPosition(client: PublicClient, reserve: ReserveRef, account: Address): Promise<Position> {
  const [wallet, deposited, data] = await client.multicall({
    allowFailure: false,
    contracts: [
      { address: reserve.asset, abi: erc20Abi, functionName: "balanceOf", args: [account] },
      { address: reserve.aToken, abi: erc20Abi, functionName: "balanceOf", args: [account] },
      { address: reserve.pool, abi: poolAbi, functionName: "getReserveData", args: [reserve.asset] },
    ],
  });
  const block = await client.getBlock();
  const scale = 10 ** reserve.decimals;
  return {
    wallet: Number(wallet) / scale,
    deposited: Number(deposited) / scale,
    apy: rayToApy(data.currentLiquidityRate),
    timestamp: Number(block.timestamp) * 1000,
  };
}

type Signer = WalletClient<Transport, Chain, Account>;

export function toUnits(amount: number, decimals: number): bigint {
  return parseUnits(amount.toFixed(decimals), decimals);
}

/** Step 1 of a deposit: let the Pool pull the tokens. Skipped (returns null) when the allowance already covers it. */
export async function approveIfNeeded(client: PublicClient, signer: Signer, reserve: ReserveRef, amount: bigint): Promise<Hash | null> {
  const allowance = await client.readContract({
    address: reserve.asset,
    abi: erc20Abi,
    functionName: "allowance",
    args: [signer.account.address, reserve.pool],
  });
  if (allowance >= amount) return null;
  const hash = await signer.writeContract({ address: reserve.asset, abi: erc20Abi, functionName: "approve", args: [reserve.pool, amount] });
  await client.waitForTransactionReceipt({ hash });
  return hash;
}

/** Step 2: supply to Aave. The user receives aTokens 1:1, which grow as interest accrues. */
export async function supply(client: PublicClient, signer: Signer, reserve: ReserveRef, amount: bigint): Promise<Hash> {
  const hash = await signer.writeContract({
    address: reserve.pool,
    abi: poolAbi,
    functionName: "supply",
    args: [reserve.asset, amount, signer.account.address, 0],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Supply transaction reverted.");
  return hash;
}

/** Burns aTokens and returns the underlying. "max" withdraws everything including interest earned up to this block. */
export async function withdraw(client: PublicClient, signer: Signer, reserve: ReserveRef, amount: bigint | "max"): Promise<Hash> {
  const hash = await signer.writeContract({
    address: reserve.pool,
    abi: poolAbi,
    functionName: "withdraw",
    args: [reserve.asset, amount === "max" ? maxUint256 : amount, signer.account.address],
  });
  const receipt = await client.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("Withdraw transaction reverted.");
  return hash;
}
