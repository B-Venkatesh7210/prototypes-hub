"use client";

import { fmtPct, fmtUsd } from "@/lib/aave/math";
import { useMarkets } from "@/lib/client/hooks";

const SHOWN = ["USDC", "EURC", "GHO", "WETH", "cbBTC"];

/** Live Aave v3 Base rates, straight from the Pool contract. */
export function MarketStrip() {
  const { snapshot, error } = useMarkets();
  const markets = SHOWN.map((s) => snapshot?.markets.find((m) => m.symbol === s)).filter(Boolean);

  return (
    <div className="rounded-2xl border border-line bg-surface/60">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <p className="flex items-center gap-2 font-mono text-[0.6875rem] tracking-[0.12em] text-muted uppercase">
          <span className="relative flex h-1.5 w-1.5">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-good opacity-60" />
            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-good" />
          </span>
          Aave v3 · Base · live
        </p>
        <p className="font-mono text-[0.6875rem] text-dim">{snapshot ? `block ${Number(snapshot.blockNumber).toLocaleString("en-US")}` : error ? "offline" : "loading…"}</p>
      </div>
      <div className="grid grid-cols-2 divide-line sm:grid-cols-5 sm:divide-x">
        {(markets.length ? markets : SHOWN.map(() => null)).map((m, i) => (
          <div key={m?.symbol ?? i} className="px-4 py-3">
            <p className="text-xs text-muted">{m?.symbol ?? "—"}</p>
            <p className="mt-0.5 font-mono text-lg font-medium">{m ? fmtPct(m.supplyApy) : "—"}</p>
            <p className="font-mono text-[0.6875rem] text-dim">{m ? `${fmtUsd(m.totalSupplied * m.priceUsd, { compact: true })} supplied` : " "}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
