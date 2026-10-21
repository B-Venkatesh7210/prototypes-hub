"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Decision } from "@/kit/client.ts";
import type { LabState } from "@/lib/lab/state";
import { Button, CopyButton, decodeJwt, InfoTip, Json, Panel, Pill, SectionLabel, short, time, VerdictBadge } from "../ui";
import type { Post } from "./Lab";

const VERDICT_MEANING: Record<string, string> = {
  allow: "Within the mandate. The token is good for 5 minutes.",
  review: "Above review_above. Waits up to 24 hours for the mandate's approver.",
  deny_limit: "Over the per-purchase limit, or the rolling 30-day total.",
  deny_velocity: "More than 10 decisions for this agent in 60 seconds.",
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
      info="Saifuro decides; it doesn't move money or block anything itself. In enforce mode the buyer refuses to sign on anything but allow, and the seller refuses to settle without a valid verdict."
      actions={<Pill mono>mode: enforce</Pill>}
    >
      <div className="scroll-thin min-h-0 flex-1 divide-y divide-line overflow-y-auto">
        <section className="px-5 py-4">
          <SectionLabel
            info="The operator's rules for this agent. Mandates can't be edited, only revoked and replaced."
            right={
              <div className="flex gap-2">
                {m?.status === "active" && (
                  <Button size="sm" variant="danger" disabled={!!state.busy} onClick={() => void post("/api/lab/mandate", { action: "revoke" })}>
                    Revoke
                  </Button>
                )}
                <Button size="sm" onClick={() => setEditing((e) => !e)}>
                  {editing ? "Cancel" : "New mandate"}
                </Button>
              </div>
            }
          >
            Mandate
          </SectionLabel>
          {m ? (
            <>
              <div className="mb-3 flex items-center gap-2">
                <span className="font-mono text-[13px] text-ink">{m.mandate}</span>
                <Pill tone={m.status === "active" ? "ok" : "bad"}>{m.status}</Pill>
              </div>
              <dl className="grid grid-cols-3 gap-x-4 gap-y-3">
                <Field label="Per purchase" value={`${m.limits.per_transaction} USDC`} />
                <Field label="Per 30 days" value={`${m.limits.per_month ?? "–"} USDC`} />
                <Field label="Review above" value={m.review_above !== undefined ? `${m.review_above} USDC` : "–"} />
                <Field label="Categories" value={m.categories.join(", ")} />
                <Field label="Approver" value={m.principal.replace("role:", "")} />
                <Field label="Expires" value={m.expires} />
              </dl>
              {cap > 0 && (
                <div className="mt-4">
                  <div className="flex justify-between text-[12px]">
                    <span className="text-muted">Allowed in the last 30 days</span>
                    <span className="font-mono text-body">
                      {spent.toFixed(3)} / {cap} USDC
                    </span>
                  </div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-subtle">
                    <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${Math.min(100, (spent / cap) * 100)}%` }} />
                  </div>
                </div>
              )}
              <p className="mt-3 text-[12px] text-faint">
                Saifuro rule: more than 10 decisions in 60 seconds is denied with <span className="font-mono">deny_velocity</span>. Applies to every mandate.
              </p>
            </>
          ) : (
            <p className="text-[13px] text-muted">No mandate.</p>
          )}
          {editing && <MandateForm onSubmit={async (v) => (await post("/api/lab/mandate", { action: "new", ...v })) && setEditing(false)} />}
        </section>

        {state.pendingReviews.length > 0 && (
          <section className="bg-review-soft/60 px-5 py-4">
            <SectionLabel info="Approving issues a fresh allow that supersedes the review. Denying issues nothing.">Needs your approval</SectionLabel>
            <div className="space-y-2">
              {state.pendingReviews.map((d) => (
                <div key={d.decision} className="slide-in rounded-md border border-review/30 bg-surface p-3.5">
                  <div className="flex items-baseline gap-2">
                    <span className="text-[18px] font-semibold tracking-[-0.01em] text-ink">{d.request.amount} USDC</span>
                    <span className="text-[13px] text-muted">{d.request.category}</span>
                    <span className="ml-auto font-mono text-[11.5px] text-faint">{d.review?.review}</span>
                  </div>
                  <p className="mt-1 text-[12.5px] text-body">
                    {d.reason} · to <span className="font-mono">{short(d.request.recipient)}</span>
                  </p>
                  <div className="mt-3 flex gap-2">
                    <Button size="sm" variant="primary" onClick={() => void post("/api/lab/review", { review: d.review!.review, action: "approve" })}>
                      Approve
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => void post("/api/lab/review", { review: d.review!.review, action: "deny" })}>
                      Deny
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="px-5 py-4">
          <SectionLabel
            info="GET /v1/decisions. Every authorization, allowed or not, with its signed verdict. Click a row to decode it or verify it in the Inspector."
            right={<span className="font-mono text-[11.5px] text-faint">{state.decisions.length}</span>}
          >
            Decision log
          </SectionLabel>
          {state.decisions.length === 0 ? (
            <p className="rounded-md border border-dashed border-line-strong px-4 py-5 text-center text-[13px] text-muted">No decisions yet.</p>
          ) : (
            <ul className="divide-y divide-line overflow-hidden rounded-md border border-line">
              {state.decisions.map((d) => (
                <DecisionRow key={d.decision} d={d} />
              ))}
            </ul>
          )}
        </section>
      </div>
    </Panel>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[12px] text-muted">{label}</dt>
      <dd className="mt-0.5 break-words text-[13.5px] font-medium text-ink">{value}</dd>
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
    <li className="slide-in bg-surface">
      <button onClick={() => setOpen((o) => !o)} className="w-full px-3 py-2.5 text-left transition hover:bg-subtle" aria-expanded={open}>
        <div className="flex items-center gap-2.5">
          <span className="font-mono text-[11.5px] text-faint">{time(d.issued_at)}</span>
          <VerdictBadge verdict={d.verdict} />
          <span className="font-mono text-[12.5px] text-ink">{d.request.amount}</span>
          <span className="text-[12px] text-muted">{d.request.category}</span>
          {d.supersedes && <Pill tone="info">supersedes</Pill>}
          <span className={`ml-auto text-faint transition-transform ${open ? "rotate-90" : ""}`}>›</span>
        </div>
        <p className="mt-1 text-[12.5px] leading-snug text-body">{d.reason}</p>
      </button>
      {open && (
        <div className="space-y-2.5 border-t border-line bg-subtle/50 px-3 py-3">
          <p className="text-[12.5px] text-body">{VERDICT_MEANING[d.verdict]}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[11.5px] text-faint">
              {d.decision}
              {d.supersedes && ` ← ${d.supersedes}`}
            </span>
            <span className="ml-auto flex gap-2">
              <CopyButton text={d.verdict_token} label="Copy token" />
              <Button size="sm" variant="primary" onClick={inspect}>
                Verify →
              </Button>
            </span>
          </div>
          {decoded && <Json value={decoded.claims} />}
        </div>
      )}
    </li>
  );
}

function MandateForm({ onSubmit }: { onSubmit: (v: { per_transaction: number; per_month: number; review_above: number; categories: string[] }) => void }) {
  const [v, setV] = useState({ per_transaction: "0.5", per_month: "5", review_above: "0.2" });
  const [cats, setCats] = useState<string[]>(["data"]);
  const field = (k: keyof typeof v, label: string) => (
    <label className="text-[12px] text-muted">
      {label}
      <input
        value={v[k]}
        onChange={(e) => setV({ ...v, [k]: e.target.value })}
        inputMode="decimal"
        className="mt-1 h-9 w-full rounded-md border border-line-strong bg-surface px-2.5 font-mono text-[13px] text-ink focus:border-ink focus:outline-none"
      />
    </label>
  );
  return (
    <form
      className="mt-4 space-y-3 rounded-md border border-line bg-subtle/60 p-3.5"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({ per_transaction: Number(v.per_transaction), per_month: Number(v.per_month), review_above: Number(v.review_above), categories: cats });
      }}
    >
      <div className="grid grid-cols-3 gap-2.5">
        {field("per_transaction", "Per purchase")}
        {field("per_month", "Per 30 days")}
        {field("review_above", "Review above")}
      </div>
      <div className="flex items-center gap-4 text-[13px] text-ink">
        {["data", "compute"].map((c) => (
          <label key={c} className="flex items-center gap-1.5">
            <input type="checkbox" checked={cats.includes(c)} onChange={(e) => setCats(e.target.checked ? [...cats, c] : cats.filter((x) => x !== c))} className="accent-[#0f1e33]" />
            {c}
          </label>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <InfoTip content="Revokes the current mandate and issues this one." />
          <Button type="submit" size="sm" variant="primary" disabled={cats.length === 0}>
            Issue mandate
          </Button>
        </span>
      </div>
    </form>
  );
}
