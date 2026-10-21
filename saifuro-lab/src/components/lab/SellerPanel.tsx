"use client";

import { useState } from "react";
import type { LabState } from "@/lib/lab/state";
import { CheckList, InfoTip, Panel, Pill, SectionLabel, short, time, VerdictBadge } from "../ui";

type SellerEvent = LabState["seller"][number];

export function SellerPanel({ state }: { state: LabState }) {
  const events = state.seller;
  return (
    <Panel
      kicker="Seller · x402 resource server"
      title="Market data API"
      info="GET /api/seller/data/:id. Before it settles a payment, the seller runs the 12 verification steps of draft-dias-agent-payment-verdicts. No valid verdict, no settlement."
    >
      <div className="scroll-thin min-h-0 flex-1 overflow-y-auto px-5 py-4">
        <SectionLabel right={<span className="font-mono text-[11.5px] text-faint">{events.length}</span>}>Paid requests</SectionLabel>
        {events.length === 0 ? (
          <p className="rounded-md border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-muted">No paid requests yet.</p>
        ) : (
          <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
            {events.map((e, i) => (
              <EventRow key={e.id} e={e} defaultOpen={i === 0} explorer={state.status.explorer} />
            ))}
          </ul>
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
  const p = e.payment;
  const status = ok ? "200 served" : p?.status === "failed" ? "402 not settled" : "403 refused";

  return (
    <li className="slide-in bg-surface">
      <button onClick={() => setOpen(!shown)} className="flex w-full items-center gap-2.5 px-3 pb-1 pt-2.5 text-left transition hover:bg-subtle" aria-expanded={shown}>
        <span className="font-mono text-[11.5px] text-faint">{time(e.at)}</span>
        <Pill tone={ok ? "ok" : "bad"} mono>
          {status}
        </Pill>
        <span className="truncate text-[13px] font-medium text-ink">{e.label ?? e.dataset}</span>
        <span className="shrink-0 font-mono text-[12px] text-muted">{e.price} USDC</span>
        <span className={`ml-auto text-faint transition-transform ${shown ? "rotate-90" : ""}`}>›</span>
      </button>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 pb-2.5 text-[12.5px]">
        {e.verdict && <VerdictBadge verdict={e.verdict} />}
        {failed ? (
          <span className="text-deny">
            step {failed.step} · {failed.name}: {failed.detail}
          </span>
        ) : (
          <Payment e={e} explorer={explorer} />
        )}
      </div>
      {shown && e.checks && (
        <div className="border-t border-line bg-subtle/50 px-3 py-3">
          <CheckList checks={e.checks} dense />
          {p?.payer && <p className="mt-2 font-mono text-[11.5px] text-faint">payer {p.payer}</p>}
        </div>
      )}
    </li>
  );
}

function Payment({ e, explorer }: { e: SellerEvent; explorer: string }) {
  const p = e.payment;
  if (!p) return e.reason ? <span className="text-muted">{e.reason}</span> : null;
  if (p.status === "settled")
    return (
      <span className="flex items-center gap-1.5 text-allow">
        Settled on Base Sepolia
        {p.transaction && (
          <a
            href={`${explorer}/tx/${p.transaction}`}
            target="_blank"
            rel="noreferrer"
            className="font-mono text-accent hover:underline"
          >
            {short(p.transaction, 8, 6)} ↗
          </a>
        )}
      </span>
    );
  if (p.status === "simulated")
    return (
      <span className="flex items-center gap-1.5 text-muted">
        Settlement simulated <InfoTip content="The buyer wallet had no test USDC, so the seller skipped the facilitator." />
      </span>
    );
  if (p.status === "failed") return <span className="text-deny">Settlement failed: {p.error ?? "facilitator error"}</span>;
  return <span className="text-muted">Not submitted for settlement</span>;
}
