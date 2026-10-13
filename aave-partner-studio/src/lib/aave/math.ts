export const RAY = 10n ** 27n;
export const SECONDS_PER_YEAR = 31_536_000;

export { rayToApy } from "@/widget/abi";

export function rayToApr(rate: bigint): number {
  return Number(rate) / 1e27;
}

/** Balance after `seconds` at a constant APY. */
export function grow(amount: number, apy: number, seconds: number): number {
  return amount * Math.pow(1 + apy, seconds / SECONDS_PER_YEAR);
}

/** Reads a little-endian bit range from Aave's packed reserve configuration. */
export function configBits(config: bigint, from: number, width: number): number {
  return Number((config >> BigInt(from)) & ((1n << BigInt(width)) - 1n));
}

export function fmtUsd(value: number, opts: { compact?: boolean; decimals?: number } = {}): string {
  if (opts.compact && Math.abs(value) >= 10_000) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", notation: "compact", maximumFractionDigits: 1 }).format(value);
  }
  const decimals = opts.decimals ?? (Math.abs(value) < 1 && value !== 0 ? 4 : 2);
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

export function fmtPct(value: number, decimals = 2): string {
  return `${(value * 100).toFixed(decimals)}%`;
}

export function fmtNum(value: number, decimals = 2): string {
  return new Intl.NumberFormat("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value);
}

export function fmtCompact(value: number): string {
  return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}
