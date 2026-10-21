"use client";

import { useEffect, useMemo, useState } from "react";
import type { Check } from "@/kit/verdict/verify.ts";
import { Button, CheckList, decodeJwt, InfoTip, Json, Panel, Pill, SectionLabel, Tip } from "../ui";

type Result = { valid: boolean; step: number | null; reason: string | null; checks: Check[]; header?: unknown; claims?: unknown; issuers: string[] };
type Vector = { id: string; description: string; mode: string; expected: { valid: boolean; step?: number }; got: { valid: boolean; step: number | null }; matches: boolean; sameStep: boolean };
type Report = {
  source: string;
  title?: string;
  ms: number;
  total: number;
  matched: number;
  sameStep: number;
  results: Vector[];
  jwks: { kid: string }[] | { error: string };
  sample: { token: string; receivedAt: number };
};

type Form = {
  token: string;
  mode: "settle" | "record";
  amount: string;
  currency: string;
  recipient: string;
  mandates: string;
  testingOnly: boolean;
  receivedAt: string;
};

const EMPTY: Form = { token: "", mode: "settle", amount: "", currency: "USDC", recipient: "", mandates: "", testingOnly: true, receivedAt: "" };

const MODES = {
  settle: { label: "Settle", tip: "Before you deliver. All 12 steps, checked against the payment you're about to accept." },
  record: { label: "Record", tip: "Auditing a stored verdict. Steps 1–7, with the time window checked against when you received it." },
} as const;

const toLocalInput = (unix: number) => new Date(unix * 1000).toISOString().slice(0, 19);

async function postVerify(f: Form): Promise<Result> {
  const res = await fetch("/api/inspector/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: f.token,
      mode: f.mode,
      payment: f.mode === "settle" ? { amount: f.amount.trim(), currency: f.currency.trim(), recipient: f.recipient.trim() } : undefined,
      agreedMandates: f.mandates
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      testingOnly: f.testingOnly,
      receivedAt: f.mode === "record" && f.receivedAt ? Math.floor(Date.parse(`${f.receivedAt}Z`) / 1000) : null,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.error);
  return body;
}

export function Inspector() {
  const [form, setForm] = useState<Form>(EMPTY);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [from, setFrom] = useState<string | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("inspector:prefill");
    void fetch("/api/inspector/vectors")
      .then((r) => r.json())
      .then(setReport)
      .catch(() => setReport(null));
    if (!raw) return;
    sessionStorage.removeItem("inspector:prefill");
    const p = JSON.parse(raw) as { token: string; payment: { amount: string; currency: string; recipient: string }; agreedMandates: string[] };
    const next: Form = { ...EMPTY, token: p.token, amount: p.payment.amount, currency: p.payment.currency, recipient: p.payment.recipient, mandates: p.agreedMandates.join(", ") };
    void postVerify(next)
      .then(setResult)
      .catch((e: Error) => setError(e.message));
    queueMicrotask(() => {
      setForm(next);
      setFrom("the lab");
    });
  }, []);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));
  const decoded = useMemo(() => (form.token.trim() ? decodeJwt(form.token.trim()) : null), [form.token]);

  async function verify(f: Form = form) {
    setBusy(true);
    setError(null);
    try {
      setResult(await postVerify(f));
    } catch (e) {
      setError((e as Error).message);
      setResult(null);
    } finally {
      setBusy(false);
    }
  }

  const loadSample = () => {
    if (!report) return;
    const next: Form = { ...EMPTY, token: report.sample.token, mode: "record", receivedAt: toLocalInput(report.sample.receivedAt), testingOnly: false };
    setForm(next);
    setFrom("Saifuro's docs");
    void verify(next);
  };

  const tamper = () => {
    const parts = form.token.trim().split(".");
    const d = decodeJwt(form.token.trim());
    if (!d || parts.length !== 3) return;
    const claims = d.claims as { request?: { amount?: number } };
    if (claims.request) claims.request.amount = 900;
    const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(claims))))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");
    const next = { ...form, token: `${parts[0]}.${b64}.${parts[2]}`, amount: form.mode === "settle" ? "900" : form.amount };
    setForm(next);
    void verify(next);
  };

  return (
    <main className="mx-auto max-w-[1440px] px-6 pb-16">
      <section className="pb-6 pt-8">
        <div className="kicker">draft-dias-agent-payment-verdicts §6</div>
        <h1 className="mt-2 text-[34px] font-semibold leading-[1.1] tracking-[-0.035em] text-ink">Verdict Inspector</h1>
        <div className="mt-2.5 flex items-center gap-2.5 text-[15px] text-body">
          See exactly what a seller&apos;s verifier sees, step by step.
          <InfoTip content="Keys come from Saifuro's live JWKS, or this lab's emulator for sandbox tokens. The same verifier ships in the kit and passes Saifuro's official test vectors." />
          <a href="https://docs.saifuro.com/reference/verify-a-verdict" target="_blank" rel="noreferrer" className="text-[13px] font-medium text-accent hover:underline">
            Spec ↗
          </a>
        </div>
      </section>

      <div className="grid items-start gap-4 lg:grid-cols-2">
        <Panel
          kicker="Input"
          title="Token and payment"
          info="Paste a verdict, or open a decision in the Lab and choose Verify. Settle mode also needs the payment the token should cover."
          actions={
            <>
              <Button size="sm" onClick={loadSample} disabled={!report}>
                Saifuro&apos;s sample
              </Button>
              <Tip content="Sets request.amount to 900 and keeps the original signature.">
                <Button size="sm" variant="danger" onClick={tamper} disabled={!decoded}>
                  Tamper
                </Button>
              </Tip>
            </>
          }
        >
          <form
            className="space-y-4 p-5"
            onSubmit={(e) => {
              e.preventDefault();
              void verify();
            }}
          >
            <div>
              <div className="mb-1.5 flex items-center justify-between text-[12px] text-muted">
                <span>Verdict token</span>
                {from && <Pill tone="info">from {from}</Pill>}
              </div>
              <textarea
                value={form.token}
                onChange={(e) => set("token", e.target.value)}
                rows={5}
                spellCheck={false}
                placeholder="eyJhbGciOiJFUzI1NiIs…"
                className="w-full resize-y break-all rounded-md border border-line-strong bg-surface p-3 font-mono text-[12px] leading-relaxed text-ink placeholder:text-faint focus:border-ink focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="inline-flex rounded-md border border-line-strong bg-subtle p-0.5">
                {(Object.keys(MODES) as (keyof typeof MODES)[]).map((m) => (
                  <Tip key={m} content={MODES[m].tip}>
                    <button
                      type="button"
                      onClick={() => set("mode", m)}
                      className={`h-8 rounded-[5px] px-4 text-[13px] font-medium transition ${form.mode === m ? "bg-surface text-ink shadow-[0_1px_2px_rgb(15_30_51/0.08)]" : "text-muted hover:text-ink"}`}
                    >
                      {MODES[m].label}
                    </button>
                  </Tip>
                ))}
              </div>
              <span className="text-[12.5px] text-muted">{form.mode === "settle" ? "Steps 1–12" : "Steps 1–7"}</span>
            </div>

            {form.mode === "settle" ? (
              <div className="grid grid-cols-[7rem_6rem_1fr] gap-3">
                <Field label="Amount" value={form.amount} onChange={(v) => set("amount", v)} placeholder="0.01" />
                <Field label="Currency" value={form.currency} onChange={(v) => set("currency", v)} />
                <Field label="Recipient" value={form.recipient} onChange={(v) => set("recipient", v)} placeholder="0x… or vendor:acme" />
                <Field
                  label="Agreed mandates"
                  info="Step 8. The mandates you've agreed to accept from this operator. Leave empty to skip."
                  value={form.mandates}
                  onChange={(v) => set("mandates", v)}
                  placeholder="mnd_…, mnd_…"
                  className="col-span-2"
                />
                <div className="flex items-center gap-2 self-end pb-2.5 text-[13px] text-ink">
                  <label className="flex items-center gap-2">
                    <input type="checkbox" checked={form.testingOnly} onChange={(e) => set("testingOnly", e.target.checked)} className="accent-[#0f1e33]" />
                    Sandbox keys
                  </label>
                  <InfoTip content="Accept keys whose kid starts with sandbox-. Sandbox and production share one JWKS." />
                </div>
              </div>
            ) : (
              <Field
                label="Received at (UTC)"
                info="Record mode checks the token's time window against when you received it, not against now."
                value={form.receivedAt}
                onChange={(v) => set("receivedAt", v)}
                placeholder="2026-09-03T08:45:00"
              />
            )}

            <div className="flex items-center gap-3 pt-1">
              <Button type="submit" variant="primary" disabled={busy || !form.token.trim()}>
                {busy ? "Verifying…" : "Verify"}
              </Button>
              {error && <span className="text-[13px] text-deny">{error}</span>}
            </div>
          </form>

          {decoded && (
            <div className="space-y-3 border-t border-line p-5">
              <div>
                <SectionLabel>Header</SectionLabel>
                <Json value={decoded.header} />
              </div>
              <div>
                <SectionLabel>Claims</SectionLabel>
                <Json value={decoded.claims} />
              </div>
            </div>
          )}
        </Panel>

        <Panel
          kicker="Result"
          title={result ? (result.valid ? "Accept" : `Reject at step ${result.step}`) : "Not verified yet"}
          info="Every step is shown: passed, failed, skipped (doesn't apply in this mode), or not reached after the first failure."
          actions={result && <Pill tone={result.valid ? "ok" : "bad"}>{result.valid ? "valid" : "invalid"}</Pill>}
        >
          <div className="space-y-4 p-5">
            {result ? (
              <>
                <div className={`rounded-md border px-4 py-3.5 ${result.valid ? "border-allow/25 bg-allow-soft" : "border-deny/25 bg-deny-soft"}`}>
                  <div className={`text-[16px] font-semibold ${result.valid ? "text-allow" : "text-deny"}`}>{result.valid ? "Safe to act on" : "Do not deliver"}</div>
                  <p className="mt-0.5 text-[13.5px] text-body">
                    {result.valid
                      ? form.mode === "settle"
                        ? "Every check passed. Settle the payment, then deliver."
                        : "Authentic and issued in time. Steps 8–12 don't apply to stored records."
                      : result.reason}
                  </p>
                </div>
                <CheckList checks={result.checks} />
                <p className="flex items-center gap-2 text-[12px] text-muted">
                  Trusted issuers
                  {result.issuers.map((i) => (
                    <span key={i} className="font-mono text-body">
                      {i}
                    </span>
                  ))}
                </p>
              </>
            ) : (
              <div className="grid min-h-60 place-items-center rounded-md border border-dashed border-line-strong text-center">
                <div>
                  <p className="text-[14px] font-medium text-ink">Paste a token and press Verify</p>
                  <p className="mt-1 text-[13px] text-muted">or load Saifuro&apos;s sample to see a real production verdict.</p>
                </div>
              </div>
            )}
          </div>
        </Panel>
      </div>

      <Conformance report={report} />
    </main>
  );
}

function Field({
  label,
  info,
  value,
  onChange,
  placeholder,
  className = "",
}: {
  label: string;
  info?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-1.5 flex items-center gap-1.5 text-[12px] text-muted">
        {label}
        {info && <InfoTip content={info} />}
      </div>
      <input
        aria-label={label}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="h-10 w-full rounded-md border border-line-strong bg-surface px-3 font-mono text-[13px] text-ink placeholder:text-faint focus:border-ink focus:outline-none"
      />
    </div>
  );
}

const cell = (v: Vector) => (!v.matches ? "bg-deny" : v.expected.valid ? "bg-accent" : "bg-[#b9c7d8]");

function Conformance({ report }: { report: Report | null }) {
  const [hover, setHover] = useState<Vector | null>(null);
  return (
    <Panel
      kicker="Conformance"
      title="Saifuro's official test vectors"
      info="Every vector from Saifuro's published suite, run through the kit's verifier on page load."
      className="mt-4"
      actions={
        report && (
          <a href={report.source} target="_blank" rel="noreferrer" className="text-[13px] font-medium text-accent hover:underline">
            Source ↗
          </a>
        )
      }
    >
      {!report ? (
        <p className="p-5 text-[13px] text-muted">Running the vectors…</p>
      ) : (
        <div className="grid gap-6 p-5 lg:grid-cols-[19rem_1fr]">
          <div className="space-y-4">
            <div>
              <div className="text-[40px] font-semibold leading-none tracking-[-0.03em] text-ink">
                {report.matched}
                <span className="text-faint">/{report.total}</span>
              </div>
              <p className="mt-2 text-[13.5px] text-body">
                match, {report.sameStep} on the exact step · {report.ms} ms
              </p>
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[12px] text-muted">
              <Legend cls="bg-accent">Valid, accepted</Legend>
              <Legend cls="bg-[#b9c7d8]">Invalid, rejected</Legend>
              <Legend cls="bg-deny">Mismatch</Legend>
            </div>
            <div className="min-h-28 rounded-md border border-line bg-subtle p-3.5 text-[12.5px]">
              {hover ? (
                <>
                  <div className="font-mono text-[12px] font-medium text-ink">{hover.id}</div>
                  <p className="mt-1 text-body">{hover.description}</p>
                  <p className="mt-2 font-mono text-[11.5px] text-muted">
                    {hover.mode} · expected {hover.expected.valid ? "accept" : `reject@${hover.expected.step}`} · got {hover.got.valid ? "accept" : `reject@${hover.got.step}`}
                  </p>
                </>
              ) : (
                <span className="text-muted">Hover a cell to see the vector.</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted">
              Live JWKS
              {"error" in report.jwks ? (
                <span className="text-deny">{report.jwks.error}</span>
              ) : (
                report.jwks.map((k) => (
                  <Pill key={k.kid} mono>
                    {k.kid}
                  </Pill>
                ))
              )}
            </div>
          </div>
          <div className="flex flex-wrap content-start gap-1" onMouseLeave={() => setHover(null)}>
            {report.results.map((v) => (
              <div
                key={v.id}
                onMouseEnter={() => setHover(v)}
                className={`h-[22px] w-[22px] rounded-[4px] transition hover:scale-125 ${cell(v)} ${v.matches && !v.sameStep ? "opacity-50" : ""} ${hover?.id === v.id ? "ring-2 ring-ink ring-offset-1" : ""}`}
              />
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}

function Legend({ cls, children }: { cls: string; children: React.ReactNode }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-[3px] ${cls}`} />
      {children}
    </span>
  );
}
