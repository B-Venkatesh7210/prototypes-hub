import { parseAbi, type Address } from "viem";

/** Aave v3 on Base. Pool and oracle are read from the addresses provider at runtime; these are the verified values. */
export const BASE_CHAIN_ID = 8453;
export const ADDRESSES_PROVIDER: Address = "0xe20fCBdBfFC4Dd138cE8b2E6FBb6CB49777ad64D";
export const POOL: Address = "0xA238Dd80C259a72e81d7e4664a9801593F98d1c5";

/** Assets a partner can offer as an "Earn" product: dollar and euro stablecoins. */
export const EARN_SYMBOLS = ["USDC", "EURC", "GHO", "USDbC"] as const;
export type EarnSymbol = (typeof EARN_SYMBOLS)[number];

export const providerAbi = parseAbi([
  "function getPool() view returns (address)",
  "function getPriceOracle() view returns (address)",
]);

export const oracleAbi = parseAbi(["function getAssetPrice(address asset) view returns (uint256)"]);

export { erc20Abi, poolAbi } from "@/widget/abi";
