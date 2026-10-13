"use client";

import { useState } from "react";
import { Card, Eyebrow, Pill } from "@/components/ui/primitives";
import type { Blueprint, Custody } from "@/lib/types";

type Node = { title: string; body: string; who: "partner" | "user" | "aave" | "vendor" };

const WHO_STYLE: Record<Node["who"], string> = {
  user: "border-white/15",
  partner: "border-[#7fe3ea]/35",
  vendor: "border-warn/30",
  aave: "border-aave-purple/50 bg-aave-purple/[0.06]",
};

function flows(bp: Blueprint): Record<Custody, { nodes: Node[]; decisions: string[] }> {
  const name = bp.partner.name;
  const a = bp.recommendation.asset;
  return {
    embedded: {
      nodes: [
        { title: "User", body: `Taps "${bp.copy.cta}" in the ${name} app`, who: "user" },
        { title: "<AaveEarn />", body: "Renders balance, APY, deposit and withdraw", who: "partner" },
        { title: "Embedded wallet", body: "Privy, Dynamic or a Coinbase Smart Wallet signs, gas sponsored", who: "vendor" },
        { title: "Aave v3 Pool · Base", body: `approve + supply ${a}`, who: "aave" },
        { title: `a${a} in user's wallet`, body: "Balance grows every second", who: "aave" },
      ],
      decisions: [
        "Gas: sponsor with a paymaster so users never need ETH",
        "Batch approve + supply into one smart-wallet call",
        `${name}'s backend only indexes balances for display and analytics`,
        "Recovery: email or passkey login decides how 'bank-like' it feels",
      ],
    },
    omnibus: {
      nodes: [
        { title: "User", body: `Taps "${bp.copy.cta}" in the ${name} app`, who: "user" },
        { title: "<AaveEarn />", body: "Same widget, adapter calls the backend", who: "partner" },
        { title: `${name} backend`, body: "Ledger of scaled balances, fee on yield, limits", who: "partner" },
        { title: "Treasury wallet", body: "MPC or multisig with policy controls", who: "vendor" },
        { title: "Aave v3 Pool · Base", body: `supply ${a}, hold a${a}`, who: "aave" },
      ],
      decisions: [
        "Store scaled balances (amount ÷ liquidity index) so interest needs no per-user writes",
        "Net deposits and withdrawals in batches to save gas",
        "Keep a liquidity buffer for instant withdrawals during high utilization",
        "Reconcile ledger total vs. treasury aToken balance every block or hour",
      ],
    },
  };
}

export function ArchitectureTab({ bp }: { bp: Blueprint }) {
  const recommended = bp.recommendation.custody;
  const [custody, setCustody] = useState<Custody>(recommended);
  const flow = flows(bp)[custody];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center gap-2">
        {(["embedded", "omnibus"] as const).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCustody(c)}
            className={`flex cursor-pointer items-center gap-2 rounded-xl border px-4 py-2 text-sm transition-colors ${
              custody === c ? "border-white/25 bg-white/[0.05] text-bright" : "border-line text-muted hover:text-bright"
            }`}
          >
            {c === "embedded" ? "Embedded wallets (non-custodial)" : "Omnibus (partner custody)"}
            {c === recommended ? <Pill tone="aave">recommended</Pill> : null}
          </button>
        ))}
      </div>

      <Card className="p-6">
        <div className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
          {flow.nodes.map((n, i) => (
            <div key={n.title} className="flex flex-col items-center gap-3 lg:flex-1 lg:flex-row">
              <div className={`w-full rounded-2xl border p-4 ${WHO_STYLE[n.who]}`}>
                <p className="font-mono text-[0.6875rem] tracking-wider text-dim uppercase">{n.who === "vendor" ? "infra" : n.who}</p>
                <p className="mt-1 font-semibold">{n.title}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{n.body}</p>
              </div>
              {i < flow.nodes.length - 1 ? <span className="text-dim lg:shrink-0">{"→"}</span> : null}
            </div>
          ))}
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <Eyebrow>Design decisions</Eyebrow>
          <ul className="mt-3 space-y-2.5">
            {flow.decisions.map((d) => (
              <li key={d} className="flex gap-2.5 text-sm leading-relaxed text-muted">
                <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-aave-teal" />
                {d}
              </li>
            ))}
          </ul>
        </Card>
        <Card className="p-5">
          <Eyebrow>Why {recommended === "embedded" ? "embedded" : "omnibus"} for {bp.partner.name}</Eyebrow>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {recommended === "embedded"
              ? `${bp.partner.name}'s users can own their funds directly, which keeps ${bp.partner.name} out of custody and lets the integration ship without a new licence in most markets. The trade-off is wallet UX, which embedded wallets with passkeys now largely solve.`
              : `${bp.partner.name} already holds customer balances, so pooled custody keeps the experience identical to today and lets it take a fee on yield. The trade-off is regulatory: offering yield on held balances needs legal review in ${bp.partner.region === "Global" ? "each market" : bp.partner.region}.`}
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The widget and the Aave calls are identical in both models; only the adapter changes. Switching later is a backend change, not a product change.
          </p>
        </Card>
      </div>
    </div>
  );
}
