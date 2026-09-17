import type { DeskMode, WatchItem } from "./types";

export const MODE_COPY: Record<
  DeskMode,
  { kicker: string; title: string; blurb: string }
> = {
  treasury: {
    kicker: "Wallet / fintech ops",
    title: "Treasury desk",
    blurb:
      "Watch hot wallets and company treasuries. Live mentions, USD book, transfer trail — no indexer.",
  },
  protocol: {
    kicker: "DeFi on-call",
    title: "Protocol desk",
    blurb:
      "Watch vaults, tip routers, and admin — not the whole DEX. Failed txs surface first.",
  },
};

/** Narrow on purpose. Free LaserStream is standard methods only; don't subscribe to Jupiter. */
export const PRESETS: Record<DeskMode, WatchItem[]> = {
  treasury: [
    {
      address: "5tzFkiKscXHK5ZXCGbXZxdw7gTjjD1mBwuoFbhUvuAi9",
      label: "Binance hot",
      role: "Exchange treasury",
    },
    {
      address: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
      label: "Binance 3",
      role: "Exchange flow",
    },
  ],
  protocol: [
    {
      address: "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
      label: "Jito tips",
      role: "Network pulse",
    },
    {
      address: "MarBmsSgKXdrN1egZf5sqe1TMai9K1rChYNDJgjq7aD",
      label: "Marinade",
      role: "LST program",
    },
  ],
};

export const MAX_WATCH = 5;
