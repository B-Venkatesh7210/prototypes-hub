import type { Address, PublicClient } from "viem";
import { erc20Abi, oracleAbi, poolAbi, providerAbi, ADDRESSES_PROVIDER } from "@/lib/aave/constants";
import { configBits, rayToApy } from "@/lib/aave/math";
import type { Market, MarketsSnapshot } from "@/lib/types";
import { baseClient } from "./chain";

const TTL_MS = 60_000;
const g = globalThis as { __markets?: { at: number; data: Promise<MarketsSnapshot> } };

/** Live Aave v3 reserves on Base, cached for a minute. */
export function getMarkets(): Promise<MarketsSnapshot> {
  const cached = g.__markets;
  if (cached && Date.now() - cached.at < TTL_MS) return cached.data;
  const data = readMarkets(baseClient());
  g.__markets = { at: Date.now(), data };
  data.catch(() => {
    if (g.__markets?.data === data) g.__markets = undefined;
  });
  return data;
}

export async function getMarket(symbol: string): Promise<Market | null> {
  const { markets } = await getMarkets();
  return markets.find((m) => m.symbol === symbol) ?? null;
}

async function readMarkets(client: PublicClient): Promise<MarketsSnapshot> {
  const [pool, oracle] = await Promise.all([
    client.readContract({ address: ADDRESSES_PROVIDER, abi: providerAbi, functionName: "getPool" }),
    client.readContract({ address: ADDRESSES_PROVIDER, abi: providerAbi, functionName: "getPriceOracle" }),
  ]);
  const [assets, blockNumber] = await Promise.all([
    client.readContract({ address: pool, abi: poolAbi, functionName: "getReservesList" }),
    client.getBlockNumber(),
  ]);

  const first = await client.multicall({
    allowFailure: false,
    contracts: assets.flatMap((asset) => [
      { address: asset, abi: erc20Abi, functionName: "symbol" },
      { address: asset, abi: erc20Abi, functionName: "decimals" },
      { address: pool, abi: poolAbi, functionName: "getReserveData", args: [asset] },
      { address: oracle, abi: oracleAbi, functionName: "getAssetPrice", args: [asset] },
    ]),
  });

  const reserves = assets.map((asset, i) => {
    const [symbol, decimals, data, price] = first.slice(i * 4, i * 4 + 4) as [
      string,
      number,
      { configuration: bigint; currentLiquidityRate: bigint; currentVariableBorrowRate: bigint; aTokenAddress: Address; variableDebtTokenAddress: Address },
      bigint,
    ];
    return { asset, symbol, decimals, data, price };
  });

  const totals = await client.multicall({
    allowFailure: false,
    contracts: reserves.flatMap((r) => [
      { address: r.data.aTokenAddress, abi: erc20Abi, functionName: "totalSupply" },
      { address: r.data.variableDebtTokenAddress, abi: erc20Abi, functionName: "totalSupply" },
    ]),
  });

  const markets: Market[] = reserves.map((r, i) => {
    const scale = 10 ** r.decimals;
    const supplied = Number(totals[i * 2] as bigint) / scale;
    const borrowed = Number(totals[i * 2 + 1] as bigint) / scale;
    const cfg = r.data.configuration;
    return {
      symbol: r.symbol,
      address: r.asset,
      decimals: r.decimals,
      aToken: r.data.aTokenAddress,
      priceUsd: Number(r.price) / 1e8,
      supplyApy: rayToApy(r.data.currentLiquidityRate),
      borrowApy: rayToApy(r.data.currentVariableBorrowRate),
      totalSupplied: supplied,
      totalBorrowed: borrowed,
      utilization: supplied > 0 ? borrowed / supplied : 0,
      reserveFactor: configBits(cfg, 64, 16) / 10_000,
      supplyCap: configBits(cfg, 116, 36),
      ltv: configBits(cfg, 0, 16) / 10_000,
      liquidationThreshold: configBits(cfg, 16, 16) / 10_000,
      active: configBits(cfg, 56, 1) === 1,
      frozen: configBits(cfg, 57, 1) === 1,
      paused: configBits(cfg, 60, 1) === 1,
    };
  });

  return { chain: "base", pool, blockNumber: blockNumber.toString(), fetchedAt: Date.now(), markets };
}
