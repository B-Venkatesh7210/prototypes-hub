"use client";

import { useEffect, useMemo, useState } from "react";
import type { Check } from "@/kit/verdict/verify.ts";
import { Button, CheckList, decodeJwt, Json, Panel } from "../ui";

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
    <main className="mx-auto max-w-[1500px] px-4 pb-12 pt-6 sm:px-6">
      <div className="mb-5 max-w-3xl">
        <h1 className="text-2xl font-semibold tracking-tight text-bright">Verdict Inspector</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Paste a Saifuro verdict token and see what a seller&apos;s verifier sees: the 12 steps of{" "}
          <a href="https://docs.saifuro.com/reference/verify-a-verdict" target="_blank" rel="noreferrer" className="text-info hover:underline">
            draft-dias-agent-payment-verdicts §6
          </a>
          , in order, with the first failure and why. Keys come from Saifuro&apos;s live JWKS, or this lab&apos;s emulator for sandbox tokens. The same verifier ships in the kit and
          passes all of Saifuro&apos;s official test vectors.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
        <Panel
          kicker="Input"
          title="Token and the payment it should cover"
          actions={
            <>
              <Button size="sm" onClick={loadSample} disabled={!report}>
                Saifuro&apos;s sample
              </Button>
              <Button size="sm" tone="danger" onClick={tamper} disabled={!decoded} title="Change request.amount to 900 and keep the signature">
                Tamper amount
              </Button>
            </>
          }
        >
          <form
            className="space-y-3 p-4"
            onSubmit={(e) => {
              e.preventDefault();
              void verify();
            }}
          >
            {from && <p className="text-xs text-info">Loaded from {from}.</p>}
            <textarea
              value={form.token}
              onChange={(e) => set("token", e.target.value)}
              rows={6}
              spellCheck={false}
              placeholder="eyJhbGciOiJFUzI1NiIs…   (or open a decision in the Lab and choose “Verify in Inspector”)"
              className="w-full resize-y break-all rounded-md border border-line-strong bg-bg p-3 font-mono text-[11.5px] leading-relaxed text-bright placeholder:text-dim focus:border-dim focus:outline-none"
            />
            <div className="flex gap-1 rounded-md bg-bg p-1 text-xs">
              {(["settle", "record"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set("mode", m)}
                  className={`flex-1 rounded px-3 py-1.5 transition ${form.mode === m ? "bg-raised text-bright" : "text-muted hover:text-bright"}`}
                >
                  {m === "settle" ? "Settle: before I deliver" : "Record: checking a stored verdict"}
                </button>
              ))}
            </div>
            {form.mode === "settle" ? (
              <div className="grid grid-cols-[1fr_6rem] gap-2 sm:grid-cols-[8rem_6rem_1fr]">
                <Field label="Amount" value={form.amount} onChange={(v) => set("amount", v)} placeholder="0.01" />
                <Field label="Currency" value={form.currency} onChange={(v) => set("currency", v)} />
                <Field label="Recipient" value={form.recipient} onChange={(v) => set("recipient", v)} placeholder="0x… or vendor:acme" className="col-span-2 sm:col-span-1" />
                <Field label="Agreed mandates (step 8)" value={form.mandates} onChange={(v) => set("mandates", v)} placeholder="mnd_…, mnd_…" className="col-span-2 sm:col-span-2" />
                <label className="flex items-end gap-2 pb-2 text-xs text-muted">
                  <input type="checkbox" checked={form.testingOnly} onChange={(e) => set("testingOnly", e.target.checked)} className="accent-[#c7f36b]" />
                  Accept sandbox keys
                </label>
              </div>
            ) : (
              <Field
                label="Received at (UTC). Record mode checks the time window against when you received it."
                value={form.receivedAt}
                onChange={(v) => set("receivedAt", v)}
                placeholder="2026-09-03T08:45:00"
              />
            )}
            <div className="flex items-center gap-3">
              <Button type="submit" tone="primary" disabled={busy || !form.token.trim()}>
                {busy ? "Verifying…" : "Verify"}
              </Button>
              {error && <span className="text-xs text-deny">{error}</span>}
            </div>
          </form>
          {decoded && (
            <div className="grid gap-2 border-t border-line p-4 sm:grid-cols-[auto_1fr]">
              <div className="text-[11px] uppercase tracking-wider text-dim">Header</div>
              <Json value={decoded.header} />
              <div className="text-[11px] uppercase tracking-wider text-dim">Claims</div>
              <Json value={decoded.claims} />
            </div>
          )}
        </Panel>

        <Panel kicker="Result" title={result ? (result.valid ? "Accept" : `Reject at step ${result.step}`) : "Run a verification"}>
          <div className="space-y-3 p-4">
            {result ? (
              <>
                <div className={`rounded-lg border px-4 py-3 ${result.valid ? "border-allow/40 bg-allow/8" : "border-deny/40 bg-deny/8"}`}>
                  <div className={`text-lg font-semibold ${result.valid ? "text-allow" : "text-deny"}`}>{result.valid ? "Valid: safe to act on" : "Invalid: do not deliver"}</div>
                  <p className="mt-0.5 text-sm text-muted">
                    {result.valid
                      ? form.mode === "settle"
                        ? "Every check passed. Settle the payment, then deliver."
                        : "Authentic and issued in time. Steps 8 to 12 do not apply to stored records."
                      : result.reason}
                  </p>
                </div>
                <CheckList checks={result.checks} />
                <p className="text-[11px] text-dim">Trusted issuers: {result.issuers.join(" · ")}</p>
              </>
            ) : (
              <p className="text-sm text-dim">The result shows every step: passed, failed, skipped (not applied in this mode), or not reached after the first failure.</p>
            )}
          </div>
        </Panel>
      </div>

      <Conformance report={report} />
    </main>
  );
}

function Field({ label, value, onChange, placeholder, className = "" }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <label className={`block text-[11px] text-dim ${className}`}>
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        className="mt-0.5 w-full rounded border border-line-strong bg-bg px-2 py-1.5 font-mono text-xs text-bright placeholder:text-dim focus:border-dim focus:outline-none"
      />
    </label>
  );
}

function Conformance({ report }: { report: Report | null }) {
  const [hover, setHover] = useState<Vector | null>(null);
  return (
    <Panel kicker="Conformance" title="Saifuro's official test vectors" className="mt-4">
      {!report ? (
        <p className="p-4 text-sm text-dim">Running the vectors…</p>
      ) : (
        <div className="grid gap-4 p-4 lg:grid-cols-[18rem_1fr]">
          <div className="space-y-3 text-sm">
            <div className="text-3xl font-semibold text-bright">
              {report.matched}
              <span className="text-dim">/{report.total}</span>
            </div>
            <p className="text-muted">
              vectors match the expected result, {report.sameStep} on the exact step, in {report.ms} ms. Fetched from{" "}
              <a href="https://docs.saifuro.com/verdict-test-vectors.json" target="_blank" rel="noreferrer" className="break-all text-info hover:underline">
                {report.source.replace("https://", "")}
              </a>
              .
            </p>
            <div className="text-xs text-dim">
              Live JWKS keys:{" "}
              {"error" in report.jwks ? <span className="text-deny">{report.jwks.error}</span> : report.jwks.map((k) => <code key={k.kid} className="mr-1.5 text-muted">{k.kid}</code>)}
            </div>
            <div className="min-h-24 rounded-lg border border-line bg-bg p-3 text-xs">
              {hover ? (
                <>
                  <div className="font-mono text-bright">{hover.id}</div>
                  <p className="mt-1 text-muted">{hover.description}</p>
                  <p className="mt-1.5 font-mono text-dim">
                    {hover.mode} · expected {hover.expected.valid ? "accept" : `reject@${hover.expected.step}`} · got {hover.got.valid ? "accept" : `reject@${hover.got.step}`}
                  </p>
                </>
              ) : (
                <span className="text-dim">Hover a cell. Green outline: valid tokens accepted. Red outline: invalid tokens rejected at the right step.</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap content-start gap-1">
            {report.results.map((v) => (
              <div
                key={v.id}
                onMouseEnter={() => setHover(v)}
                className={`h-5 w-5 rounded-[3px] border ${!v.matches ? "border-review bg-review" : v.expected.valid ? "border-allow/70 bg-allow/25" : "border-deny/60 bg-deny/15"} ${v.matches && !v.sameStep ? "opacity-60" : ""}`}
                title={v.id}
              />
            ))}
          </div>
        </div>
      )}
    </Panel>
  );
}
