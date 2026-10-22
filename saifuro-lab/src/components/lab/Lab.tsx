"use client";

import { useCallback, useEffect, useState } from "react";
import type { LabState } from "@/lib/lab/state";
import { InfoTip, Tip } from "../ui";
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
    <main className="mx-auto max-w-[1440px] px-6 pb-12">
      <section className="flex flex-wrap items-end justify-between gap-x-10 gap-y-5 pb-6 pt-7">
        <div>
          <div className="kicker">Saifuro × x402 · Base Sepolia</div>
          <h1 className="mt-2 text-[34px] font-semibold leading-[1.1] tracking-[-0.035em] text-ink">An agent with a wallet, under a mandate.</h1>
          <div className="mt-2.5 flex items-center gap-2.5 text-[15px] text-body">
            A limit in a prompt is a request. A mandate is enforced.
            <HowItWorks />
          </div>
        </div>
        {state && <StatusStrip state={state} />}
      </section>

      {error && (
        <div className="mb-4 flex items-start gap-3 rounded-md border border-deny/30 bg-deny-soft px-4 py-2.5 text-sm text-deny">
          <span className="flex-1">{error}</span>
          <button className="opacity-70 hover:opacity-100" onClick={() => setError(null)} aria-label="Dismiss">
            ✕
          </button>
        </div>
      )}

      {state ? (
        <>
          <AgentPanel state={state} post={post} />
          <div className="mt-4 grid gap-4 lg:h-[640px] lg:grid-cols-2">
            <SaifuroPanel state={state} post={post} />
            <SellerPanel state={state} />
          </div>
        </>
      ) : (
        <div className="grid min-h-96 place-items-center rounded-md border border-line bg-surface text-sm text-muted">
          {error ? "Could not load the lab." : "Starting the lab…"}
        </div>
      )}
    </main>
  );
}

const FLOW = [
  ["Agent", "requests a paid dataset"],
  ["Seller", "answers 402 with a price"],
  ["Saifuro", "checks the mandate and signs a verdict"],
  ["Agent", "signs the x402 payment only on allow"],
  ["Seller", "verifies the verdict, settles, serves"],
];

function HowItWorks() {
  return (
    <Tip
      content={
        <ol className="space-y-1">
          {FLOW.map(([who, what], i) => (
            <li key={i} className="flex gap-2">
              <span className="font-mono text-white/50">{i + 1}</span>
              <span>
                <b className="font-semibold">{who}</b> {what}
              </span>
            </li>
          ))}
        </ol>
      }
    >
      <button type="button" className="inline-flex items-center gap-1.5 rounded-md border border-line-strong bg-surface px-2.5 py-1 text-[13px] font-medium text-ink hover:border-faint">
        How it works
        <span className="text-faint">?</span>
      </button>
    </Tip>
  );
}

function StatusStrip({ state }: { state: LabState }) {
  const st = state.status;
  return (
    <dl className="grid divide-y divide-line rounded-md border border-line bg-surface md:flex md:divide-x md:divide-y-0">
      <Status label="Saifuro" ok={st.saifuro.kind === "saifuro"} info={st.saifuro.kind === "saifuro" ? st.saifuro.baseUrl : "A spec-faithful local emulator of the Saifuro API. Set SAIFURO_API_URL to use the real one."}>
        {st.saifuro.kind === "saifuro" ? "api.saifuro.com" : "Local emulator"}
      </Status>
      <Status label="Agent model" ok={st.ai.enabled} info={st.ai.enabled ? "Any OpenAI-compatible endpoint, through the AI SDK" : "Set AI_API_KEY for free-form chat"}>
        {st.ai.enabled ? (st.ai.model ?? "on") : "Scripted only"}
      </Status>
    </dl>
  );
}

function Status({ label, ok, info, children }: { label: string; ok: boolean; info?: string; children: React.ReactNode }) {
  return (
    <div className="px-4 py-2.5">
      <dt className="flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-allow" : "bg-review"}`} />
        <span className="kicker">{label}</span>
        {info && <InfoTip content={info} />}
      </dt>
      <dd className="mt-1 flex items-baseline gap-2 whitespace-nowrap text-[14px] font-medium text-ink">{children}</dd>
    </div>
  );
}
