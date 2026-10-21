"use client";

import { useState } from "react";
import { SCENARIOS, type ScenarioId } from "@/lib/lab/scenario-list";
import type { LabState } from "@/lib/lab/state";
import { CheckList, Panel, short, time, VerdictBadge } from "../ui";
import type { Post } from "./Lab";

const ATTACKS = (Object.keys(SCENARIOS) as ScenarioId[]).filter((id) => SCENARIOS[id].side === "seller");

type SellerEvent = LabState["seller"][number];

export function SellerPanel({ state, post }: { state: LabState; post: Post }) {
  const events = state.seller;
  return (
    <Panel kicker="Seller · x402 resource server" title="Market data API" actions={<span className="font-mono text-[11px] text-dim">GET /api/seller/data/:id</span>}>
      <div className="border-b border-line p-3">
        <div className="mb-2 text-[11px] text-dim">Attack the seller with a real approval from this session:</div>
        <div className="grid grid-cols-3 gap-1.5">
          {ATTACKS.map((id) => (
            <button
              key={id}
              disabled={!!state.busy}
              onClick={() => void post("/api/lab/run", { scenario: id })}
              title={SCENARIOS[id].blurb}
              className="rounded-lg border border-deny/25 bg-deny/5 p-2 text-left transition hover:border-deny/50 hover:bg-deny/10 disabled:cursor-not-allowed disabled:opacity-40"
            >
              <div className="flex items-center justify-between">
                <span className="text-[13px] font-medium text-bright">{SCENARIOS[id].title}</span>
                <span className="font-mono text-[10px] text-dim">{SCENARIOS[id].expect}</span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-muted">{SCENARIOS[id].blurb}</p>
            </button>
          ))}
        </div>
      </div>
      <div className="scroll-thin flex-1 space-y-2 overflow-y-auto p-4">
        {events.length === 0 ? (
          <div className="rounded-lg border border-dashed border-line p-4 text-center text-xs leading-relaxed text-dim">
            Paid requests land here. For each one the seller runs the 12 verification steps of draft-dias-agent-payment-verdicts, then settles the x402 payment and
            serves the data. No valid verdict, no settlement.
          </div>
        ) : (
          events.map((e, i) => <EventRow key={e.id} e={e} defaultOpen={i === 0} explorer={state.status.explorer} />)
        )}
      </div>
    </Panel>
  );
}

function EventRow({ e, defaultOpen, explorer }: { e: SellerEvent; defaultOpen: boolean; explorer: string }) {
  const [open, setOpen] = useState<boolean | null>(null);
  const shown = open ?? defaultOpen;
  const failed = e.checks?.find((c) => c.status === "fail");
  const ok = e.outcome === "delivered";
  return (
    <div className={`slide-in rounded-lg border ${ok ? "border-line" : "border-deny/30"} bg-raised/40`}>
      <button onClick={() => setOpen(!shown)} className="w-full px-3 py-2 text-left">
        <div className="flex items-center gap-2">
          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${ok ? "bg-allow/12 text-allow" : "bg-deny/12 text-deny"}`}>{ok ? "200 served" : e.payment?.status === "failed" ? "402 not settled" : "403 refused"}</span>
          <span className="truncate text-sm font-medium text-bright">{e.label ?? e.dataset}</span>
          <span className="font-mono text-xs text-dim">{e.price} USDC</span>
          <span className="ml-auto font-mono text-[11px] text-dim">{time(e.at)}</span>
          <span className={`text-dim transition-transform ${shown ? "rotate-90" : ""}`}>›</span>
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-muted">
          {e.verdict && <VerdictBadge verdict={e.verdict} className="!text-[10px]" />}
          {failed ? (
            <span className="text-deny">
              Step {failed.step} · {failed.name}: {failed.detail}
            </span>
          ) : (
            e.reason && <span>{e.reason}</span>
          )}
        </div>
      </button>
      {shown && (
        <div className="space-y-2 border-t border-line p-3">
          {e.checks && <CheckList checks={e.checks} dense />}
          <Payment e={e} explorer={explorer} />
        </div>
      )}
    </div>
  );
}

function Payment({ e, explorer }: { e: SellerEvent; explorer: string }) {
  const p = e.payment;
  if (!p) return null;
  const text = {
    settled: "Settled on Base Sepolia",
    simulated: "Settlement simulated: the buyer wallet has no testnet USDC",
    failed: `Settlement failed: ${p.error ?? "facilitator error"}`,
    not_attempted: "Payment never submitted to the facilitator: the verdict failed first",
  }[p.status];
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-md px-2.5 py-1.5 text-[11.5px] ${p.status === "settled" ? "bg-allow/8 text-allow" : p.status === "failed" ? "bg-deny/8 text-deny" : "bg-bg text-muted"}`}>
      <span>{text}</span>
      {p.transaction && (
        <a href={`${explorer}/tx/${p.transaction}`} target="_blank" rel="noreferrer" className="font-mono text-info hover:underline">
          {short(p.transaction, 10, 6)} ↗
        </a>
      )}
      {p.payer && <span className="ml-auto font-mono text-dim">from {short(p.payer)}</span>}
    </div>
  );
}
