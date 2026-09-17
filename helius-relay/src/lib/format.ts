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
