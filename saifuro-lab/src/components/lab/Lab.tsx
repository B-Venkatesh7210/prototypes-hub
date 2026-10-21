"use client";

import { useCallback, useEffect, useState } from "react";
import type { LabState } from "@/lib/lab/state";
import { AgentPanel } from "./AgentPanel";
import { SaifuroPanel } from "./SaifuroPanel";
import { SellerPanel } from "./SellerPanel";

export type Post = (path: string, body: unknown) => Promise<boolean>;

export function Lab() {
  const [state, setState] = useState<LabState | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/lab/state", { cache: "no-store" });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? res.statusText);
      setState(body);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const post: Post = useCallback(
    async (path, body) => {
      setError(null);
      const res = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
      if (!res.ok) setError(((await res.json().catch(() => ({}))) as { error?: string }).error ?? `${res.status}`);
      await refresh();
      return res.ok;
    },
    [refresh],
  );

  const fast = !!state?.busy || (state?.pendingReviews.length ?? 0) > 0;
  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const tick = async () => {
      await refresh();
      if (!stop) timer = setTimeout(tick, fast ? 700 : 5000);
    };
    void tick();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [refresh, fast]);

  return (
    <main className="mx-auto max-w-[1500px] px-4 pb-10 pt-6 sm:px-6">
      <Intro state={state} />
      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-lg border border-deny/40 bg-deny/10 px-4 py-2.5 text-sm text-deny">
          <span className="flex-1">{error}</span>
          <button className="text-deny/70 hover:text-deny" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}
      {state ? (
        <div className="grid gap-4 lg:h-[calc(100vh-19rem)] lg:min-h-[600px] lg:grid-cols-[1.15fr_1fr_1fr]">
          <AgentPanel state={state} post={post} />
          <SaifuroPanel state={state} post={post} />
          <SellerPanel state={state} post={post} />
        </div>
      ) : (
        <div className="grid h-96 place-items-center rounded-xl border border-line text-muted">{error ? "Could not load the lab." : "Starting the lab…"}</div>
      )}
    </main>
  );
}

const FLOW = [
  { n: "1", who: "Agent", text: "requests a paid dataset" },
  { n: "2", who: "Seller", text: "answers 402 with a price" },
  { n: "3", who: "Saifuro", text: "checks the mandate, signs a verdict" },
  { n: "4", who: "Agent", text: "signs the x402 payment only on allow" },
  { n: "5", who: "Seller", text: "verifies the verdict, settles, serves" },
];

function Intro({ state }: { state: LabState | null }) {
  const st = state?.status;
  return (
    <div className="mb-5 grid gap-4 lg:grid-cols-[1fr_auto] lg:items-end">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-bright sm:text-[28px]">An AI agent with a wallet, and a mandate it can&apos;t talk its way past.</h1>
        <p className="mt-2 max-w-3xl text-sm leading-relaxed text-muted">
          The agent buys market data from a paid API over <span className="text-text">x402</span>. Before it signs any payment,{" "}
          <span className="text-text">Saifuro</span> decides whether the operator&apos;s mandate allows it. The seller then checks Saifuro&apos;s signed verdict
          (12 steps) before it settles on <span className="text-text">Base Sepolia</span>. A limit written in a prompt is a request. A mandate is enforced.
        </p>
        <ol className="mt-4 flex flex-wrap gap-1.5 text-xs">
          {FLOW.map((f) => (
            <li key={f.n} className="flex items-center gap-1.5 rounded-full border border-line bg-surface py-1 pl-1 pr-3">
              <span className="grid h-5 w-5 place-items-center rounded-full bg-raised font-mono text-[10px] text-muted">{f.n}</span>
              <span className="font-medium text-bright">{f.who}</span>
              <span className="text-muted">{f.text}</span>
            </li>
          ))}
        </ol>
      </div>
      {st && (
        <dl className="grid grid-cols-3 gap-2 text-xs lg:w-[30rem]">
          <Status label="Saifuro" ok={st.saifuro.kind === "saifuro"} value={st.saifuro.kind === "saifuro" ? "api.saifuro.com" : "Local emulator"} hint={st.saifuro.issuer} />
          <Status
            label="Payments"
            ok={st.payments.mode === "live"}
            value={st.payments.mode === "live" ? `Base Sepolia · ${st.payments.balance} USDC` : "Simulated"}
            hint={st.payments.mode === "live" ? `Buyer ${st.payments.buyer}` : st.payments.reason}
            link={st.payments.mode === "live" ? { href: `${st.explorer}/address/${st.payments.buyer}`, label: "Wallet ↗" } : { href: st.faucet, label: "Faucet ↗" }}
          />
          <Status label="Agent model" ok={st.ai.enabled} value={st.ai.enabled ? (st.ai.model ?? "on") : "Scripted only"} hint={st.ai.enabled ? "OpenAI-compatible via AI SDK" : "Set AI_API_KEY for free-form chat"} />
        </dl>
      )}
    </div>
  );
}

function Status({ label, value, hint, ok, link }: { label: string; value: string; hint?: string; ok: boolean; link?: { href: string; label: string } }) {
  return (
    <div className="min-w-0 rounded-lg border border-line bg-surface px-3 py-2" title={hint}>
      <dt className="flex items-center gap-1.5 text-dim">
        <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-allow" : "bg-review"}`} />
        {label}
      </dt>
      <dd className="mt-0.5 flex items-baseline gap-2 font-medium text-bright">
        <span className="truncate">{value}</span>
        {link && (
          <a href={link.href} target="_blank" rel="noreferrer" className="ml-auto shrink-0 font-normal text-info hover:underline">
            {link.label}
          </a>
        )}
      </dd>
    </div>
  );
}
