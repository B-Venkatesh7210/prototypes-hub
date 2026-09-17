export function shorten(addr: string, size = 4) {
  if (!addr) return "—";
  if (addr.length <= size * 2 + 1) return addr;
  return `${addr.slice(0, size)}…${addr.slice(-size)}`;
}

export function isPubkey(value: string) {
  return /^[1-9A-HJ-NP-Za-km-z]{32,44}$/.test(value.trim());
}

export function formatSol(value: number, digits = 4) {
  if (!Number.isFinite(value)) return "—";
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 1_000) return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  if (abs > 0 && abs < 0.0001) return value.toExponential(2);
  return value.toLocaleString(undefined, { maximumFractionDigits: digits });
}

export function lamportsToSol(lamports: number) {
  return lamports / 1_000_000_000;
}

export function formatUsd(value: number | null | undefined) {
  if (value == null || Number.isNaN(value)) return "—";
  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: Math.abs(value) < 10 ? 2 : 0,
  });
}

export function formatTokenAmount(value: number | string | undefined) {
  const n = typeof value === "string" ? Number(value) : value;
  if (n == null || Number.isNaN(n)) return "—";
  return formatSol(n, n >= 1 ? 2 : 4);
}

export function timeAgo(ts: number) {
  const delta = Math.max(0, Date.now() - ts);
  if (delta < 1000) return "now";
  if (delta < 60_000) return `${Math.floor(delta / 1000)}s`;
  if (delta < 3_600_000) return `${Math.floor(delta / 60_000)}m`;
  return `${Math.floor(delta / 3_600_000)}h`;
}

export function formatSlot(slot: number) {
  return slot.toLocaleString("en-US");
}

export function txTypeLabel(type?: string) {
  if (!type) return "TX";
  return type.replaceAll("_", " ");
}

const MINT_SYMBOLS: Record<string, string> = {
  So11111111111111111111111111111111111111111: "SOL",
  So11111111111111111111111111111111111111112: "wSOL",
  EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v: "USDC",
  Es9vMFrzaCERmJfrF4H2FYD4KCoNkY11McCe8BenwNYB: "USDT",
  JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN: "JUP",
  mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So: "mSOL",
  J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn: "JitoSOL",
};

export const NATIVE_SOL_MINT = "So11111111111111111111111111111111111111111";

export function mintSymbol(mint?: string, fallback?: string | null) {
  if (fallback) return fallback;
  if (!mint) return "UNK";
  return MINT_SYMBOLS[mint] ?? shorten(mint, 4);
}
