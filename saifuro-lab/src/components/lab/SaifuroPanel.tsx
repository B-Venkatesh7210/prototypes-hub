"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Decision } from "@/kit/client.ts";
import type { LabState } from "@/lib/lab/state";
import { Button, CopyButton, decodeJwt, Json, Panel, short, time, VerdictBadge } from "../ui";
import type { Post } from "./Lab";

export const VERDICT_MEANING: Record<string, string> = {
  allow: "Within the mandate. The token is good for 5 minutes.",
  review: "Above review_above. Waits up to 24 hours for the mandate's principal.",
  deny_limit: "Over the per-transaction limit, or the rolling 30-day total.",
  deny_velocity: "10 or more decisions for this agent in the last 60 seconds.",
  deny_category: "The category isn't on the mandate's allowed list.",
  deny_expired: "The mandate passed its expiry date.",
  deny_revoked: "An operator revoked the mandate.",
  deny_no_mandate: "No mandate in this currency, or the agent is disabled.",
};

export function SaifuroPanel({ state, post }: { state: LabState; post: Post }) {
  const m = state.mandate;
  const [editing, setEditing] = useState(false);
  const spent = state.decisions.filter((d) => d.mandate === m?.mandate && d.verdict === "allow").reduce((s, d) => s + Math.round(d.request.amount * 1e6), 0) / 1e6;
  const cap = m?.limits.per_month ?? 0;

  return (
    <Panel
      kicker="Authorization"
      title="Saifuro"
      actions={<span className="rounded bg-raised px-1.5 py-0.5 font-mono text-[11px] text-muted">mode: enforce</span>}
    >
      <div className="scroll-thin flex-1 space-y-4 overflow-y-auto p-4">
        {/* Mandate */}
        <div className="rounded-lg border border-line bg-raised/50 p-3">
          <div className="flex items-center gap-2">
            <span className="text-xs text-dim">Mandate</span>
            <span className="font-mono text-xs text-bright">{m?.mandate ?? "none"}</span>
            {m && (
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide ${m.status === "active" ? "bg-allow/12 text-allow" : "bg-deny/12 text-deny"}`}>{m.status}</span>
            )}
            <div className="ml-auto flex gap-1.5">
              {m?.status === "active" && (
                <Button size="sm" tone="danger" disabled={!!state.busy} onClick={() => void post("/api/lab/mandate", { action: "revoke" })}>
                  Revoke
                </Button>
              )}
              <Button size="sm" onClick={() => setEditing((e) => !e)}>
                {editing ? "Cancel" : "New mandate"}
              </Button>
            </div>
          </div>
          {m && (
            <>
              <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                <Limit label="Per purchase" value={`${m.limits.per_transaction} USDC`} />
                <Limit label="Per 30 days" value={`${m.limits.per_month ?? "–"} USDC`} />
                <Limit label="Review above" value={m.review_above !== undefined ? `${m.review_above} USDC` : "–"} />
                <Limit label="Categories" value={m.categories.join(", ")} />
                <Limit label="Approver" value={m.principal} />
                <Limit label="Expires" value={m.expires} />
              </dl>
              {cap > 0 && (
                <div className="mt-3">
                  <div className="flex justify-between text-[11px] text-dim">
                    <span>Allowed in the last 30 days</span>
                    <span className="font-mono text-muted">
                      {spent.toFixed(3)} / {cap} USDC
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-bg">
                    <div className="h-full rounded-full bg-allow transition-all" style={{ width: `${Math.min(100, (spent / cap) * 100)}%` }} />
                  </div>
                </div>
              )}
            </>
          )}
          {editing && <MandateForm onSubmit={async (v) => (await post("/api/lab/mandate", { action: "new", ...v })) && setEditing(false)} />}
        </div>

        {/* Reviews */}
        {state.pendingReviews.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-xs font-medium uppercase tracking-wider text-review">Waiting for you</h3>
            {state.pendingReviews.map((d) => (
              <div key={d.decision} className="slide-in rounded-lg border border-review/40 bg-review/8 p-3">
                <div className="flex items-baseline gap-2">
                  <span className="text-lg font-semibold text-bright">{d.request.amount} USDC</span>
                  <span className="text-xs text-muted">{d.request.category}</span>
                  <span className="ml-auto font-mono text-[11px] text-dim">{d.review?.review}</span>
                </div>
                <p className="mt-1 text-xs text-muted">
                  {d.reason}. To <span className="font-mono">{short(d.request.recipient)}</span>. You are acting as {d.review?.waits_for}.
                </p>
                <div className="mt-2.5 flex gap-2">
                  <Button tone="ok" size="sm" onClick={() => void post("/api/lab/review", { review: d.review!.review, action: "approve" })}>
                    Approve
                  </Button>
                  <Button tone="danger" size="sm" onClick={() => void post("/api/lab/review", { review: d.review!.review, action: "deny" })}>
                    Deny
                  </Button>
                  <span className="ml-auto self-center text-[11px] text-dim">Approving issues a new allow that supersedes this decision.</span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Decisions */}
        <div>
          <h3 className="mb-2 flex items-center text-xs font-medium uppercase tracking-wider text-dim">
            Decision log <span className="ml-1.5 font-mono normal-case tracking-normal">({state.decisions.length})</span>
            <span className="ml-auto font-mono text-[10px] normal-case tracking-normal">GET /v1/decisions?agent=…</span>
          </h3>
          {state.decisions.length === 0 ? (
            <p className="rounded-lg border border-dashed border-line p-4 text-center text-xs text-dim">Every authorization, allowed or not, is recorded here with a signed verdict.</p>
          ) : (
            <ul className="space-y-1.5">
              {state.decisions.map((d) => (
                <DecisionRow key={d.decision} d={d} />
              ))}
            </ul>
          )}
        </div>
      </div>
    </Panel>
  );
}

function Limit({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-dim">{label}</dt>
      <dd className="truncate font-medium text-text" title={value}>
        {value}
      </dd>
    </div>
  );
}

function DecisionRow({ d }: { d: Decision }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const decoded = open ? decodeJwt(d.verdict_token) : null;

  const inspect = () => {
    sessionStorage.setItem(
      "inspector:prefill",
      JSON.stringify({
        token: d.verdict_token,
        mode: "settle",
        payment: { amount: String(d.request.amount), currency: d.request.currency, recipient: d.request.recipient },
        agreedMandates: d.mandate ? [d.mandate] : [],
        testingOnly: true,
      }),
    );
    router.push("/inspector");
  };

  return (
    <li className="slide-in rounded-lg border border-line bg-raised/40">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-2.5 py-2 text-left" title={VERDICT_MEANING[d.verdict]}>
        <VerdictBadge verdict={d.verdict} />
        <span className="font-mono text-xs text-bright">{d.request.amount}</span>
        <span className="text-xs text-dim">{d.request.category}</span>
        {d.supersedes && <span className="rounded bg-info/12 px-1 text-[10px] text-info">supersedes</span>}
        <span className="ml-auto font-mono text-[11px] text-dim">{time(d.issued_at)}</span>
        <span className={`text-dim transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </button>
      <p className="-mt-1 truncate px-2.5 pb-2 text-[11.5px] text-muted">{d.reason}</p>
      {open && (
        <div className="space-y-2 border-t border-line p-2.5">
          <p className="text-[11.5px] text-muted">{VERDICT_MEANING[d.verdict]}</p>
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="font-mono text-dim">{d.decision}</span>
            {d.supersedes && <span className="font-mono text-dim">← {d.supersedes}</span>}
            <span className="ml-auto flex gap-1.5">
              <CopyButton text={d.verdict_token} label="Copy token" />
              <button onClick={inspect} className="rounded border border-info/40 px-1.5 py-0.5 text-info hover:bg-info/10">
                Verify in Inspector →
              </button>
            </span>
          </div>
          {decoded && (
            <>
              <Json value={decoded.header} />
              <Json value={decoded.claims} />
            </>
          )}
        </div>
      )}
    </li>
  );
}

function MandateForm({ onSubmit }: { onSubmit: (v: { per_transaction: number; per_month: number; review_above: number; categories: string[] }) => void }) {
  const [v, setV] = useState({ per_transaction: "0.5", per_month: "5", review_above: "0.2" });
  const [cats, setCats] = useState<string[]>(["data"]);
  const field = (k: keyof typeof v, label: string) => (
    <label className="text-[11px] text-dim">
      {label}
      <input
        value={v[k]}
        onChange={(e) => setV({ ...v, [k]: e.target.value })}
        inputMode="decimal"
        className="mt-0.5 w-full rounded border border-line-strong bg-bg px-2 py-1 font-mono text-xs text-bright focus:border-dim focus:outline-none"
      />
    </label>
  );
  return (
    <form
      className="mt-3 space-y-2.5 border-t border-line pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ per_transaction: Number(v.per_transaction), per_month: Number(v.per_month), review_above: Number(v.review_above), categories: cats });
      }}
    >
      <div className="grid grid-cols-3 gap-2">
        {field("per_transaction", "Per purchase")}
        {field("per_month", "Per 30 days")}
        {field("review_above", "Review above")}
      </div>
      <div className="flex items-center gap-3 text-xs text-muted">
        <span className="text-[11px] text-dim">Categories</span>
        {["data", "compute"].map((c) => (
          <label key={c} className="flex items-center gap-1.5">
            <input type="checkbox" checked={cats.includes(c)} onChange={(e) => setCats(e.target.checked ? [...cats, c] : cats.filter((x) => x !== c))} className="accent-[#c7f36b]" />
            {c}
          </label>
        ))}
        <span className="ml-auto">
          <Button type="submit" size="sm" tone="primary" disabled={cats.length === 0}>
            Issue mandate
          </Button>
        </span>
      </div>
      <p className="text-[11px] text-dim">Mandates can&apos;t be edited, only revoked. This revokes the current one and issues a new one.</p>
    </form>
  );
}
