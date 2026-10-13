"use client";

import { useState } from "react";
import { CodeBlock } from "@/components/ui/CodeBlock";
import { Card, Eyebrow, Pill } from "@/components/ui/primitives";
import { fmtPct } from "@/lib/aave/math";
import { useMarkets, useStatus } from "@/lib/client/hooks";
import { useDemoAdapter } from "@/lib/client/useDemoAdapter";
import { AaveEarn } from "@/widget/AaveEarn";

const ACCENTS = ["#9896ff", "#2ebac6", "#b6509e", "#00b894", "#0984e3", "#ff7a59", "#111111"];
const ASSETS = ["USDC", "EURC", "GHO"];

const ADAPTER_TYPE = `interface EarnAdapter {
  getState(): Promise<EarnState>; // wallet, deposited, principal?, apy
  deposit(amount: number, onStep?: (step: "approve" | "supply", txHash?: string) => void): Promise<void>;
  withdraw(amount: number | "max", onStep?: (step: "withdraw", txHash?: string) => void): Promise<void>;
}`;

export function WidgetPlayground() {
  const status = useStatus();
  const { snapshot } = useMarkets();
  const [asset, setAsset] = useState("USDC");
  const [mode, setMode] = useState<"light" | "dark">("dark");
  const [accent, setAccent] = useState(ACCENTS[0]);
  const [radius, setRadius] = useState(16);
  const [title, setTitle] = useState("Earn on your dollars");
  const [subtitle, setSubtitle] = useState("Variable rate from Aave. Withdraw any time.");
  const [cta, setCta] = useState("Start earning");
  const adapter = useDemoAdapter(asset);
  const market = snapshot?.markets.find((m) => m.symbol === asset);

  const code = `<AaveEarn
  asset="${asset}"
  adapter={adapter}
  theme={{ mode: "${mode}", accent: "${accent}", radius: ${radius} }}
  copy={{ title: ${JSON.stringify(title)}, subtitle: ${JSON.stringify(subtitle)}, cta: ${JSON.stringify(cta)} }}
  onEvent={(e) => analytics.track(e.type, e)}
/>`;

  return (
    <div className="glow">
      <div className="mx-auto max-w-7xl px-5 pt-14 pb-20">
        <p className="font-mono text-xs tracking-[0.16em] text-muted uppercase">Component</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          <span className="font-mono">&lt;AaveEarn /&gt;</span>
        </h1>
        <p className="mt-3 max-w-2xl text-muted">
          One React file, no CSS framework, no wallet code. Theme it to the partner&apos;s brand and hand it an adapter for their wallet layer. Below
          it runs on {status?.sandbox.mode === "fork" ? "a fork of Base with real Aave transactions" : "live Aave rates"}.
        </p>

        <div className="mt-10 grid items-start gap-8 lg:grid-cols-[320px_1fr_1fr]">
          <Card className="flex flex-col gap-5 p-5">
            <Eyebrow>Props</Eyebrow>
            <Field label="asset">
              <div className="flex gap-1.5">
                {ASSETS.map((a) => {
                  const m = snapshot?.markets.find((x) => x.symbol === a);
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAsset(a)}
                      className={`flex-1 cursor-pointer rounded-lg border px-2 py-1.5 text-xs ${asset === a ? "border-white/25 bg-white/[0.06]" : "border-line text-muted"}`}
                    >
                      {a}
                      <span className="block font-mono text-[0.625rem] text-dim">{m ? fmtPct(m.supplyApy) : "—"}</span>
                    </button>
                  );
                })}
              </div>
            </Field>
            <Field label="theme.mode">
              <div className="flex gap-1.5">
                {(["dark", "light"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMode(m)}
                    className={`flex-1 cursor-pointer rounded-lg border px-2 py-1.5 text-xs ${mode === m ? "border-white/25 bg-white/[0.06]" : "border-line text-muted"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="theme.accent">
              <div className="flex flex-wrap items-center gap-2">
                {ACCENTS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    onClick={() => setAccent(c)}
                    className={`h-7 w-7 cursor-pointer rounded-full border-2 ${accent === c ? "border-white" : "border-transparent"}`}
                    style={{ background: c }}
                  />
                ))}
                <input
                  type="color"
                  aria-label="Custom accent colour"
                  value={accent}
                  onChange={(e) => setAccent(e.target.value)}
                  className="h-7 w-7 cursor-pointer appearance-none rounded-full border border-white/25 bg-transparent p-0 [&::-webkit-color-swatch]:rounded-full [&::-webkit-color-swatch]:border-0 [&::-webkit-color-swatch-wrapper]:p-0"
                />
              </div>
            </Field>
            <Field label={`theme.radius · ${radius}px`}>
              <input type="range" min={0} max={28} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full accent-[#5fd9e2]" />
            </Field>
            <Field label="copy.title">
              <input className="field text-sm" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={44} />
            </Field>
            <Field label="copy.subtitle">
              <input className="field text-sm" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} maxLength={80} />
            </Field>
            <Field label="copy.cta">
              <input className="field text-sm" value={cta} onChange={(e) => setCta(e.target.value)} maxLength={20} />
            </Field>
          </Card>

          <div className="flex flex-col items-center gap-4">
            <div
              className="grid w-full place-items-center rounded-3xl border border-line p-6 sm:p-10"
              style={{ background: mode === "dark" ? "#07080b" : "#eef0f4" }}
            >
              {adapter ? (
                <AaveEarn key={asset} asset={asset} adapter={adapter} theme={{ mode, accent, radius }} copy={{ title, subtitle, cta }} version={market ? 1 : 0} />
              ) : null}
            </div>
            <Pill tone={status?.sandbox.mode === "fork" ? "good" : "neutral"}>
              {status?.sandbox.mode === "fork" ? "Real transactions on a Base fork" : "Simulated wallet · live Aave rate"}
            </Pill>
          </div>

          <div className="flex min-w-0 flex-col gap-5">
            <CodeBlock title="usage" code={code} />
            <CodeBlock title="the only contract with your wallet layer" lang="ts" code={ADAPTER_TYPE} />
            <Card className="p-5">
              <Eyebrow>Ships with</Eyebrow>
              <ul className="mt-3 space-y-2 text-sm text-muted">
                <li>
                  <span className="font-mono text-bright">createViemEarnAdapter</span> for embedded or connected wallets (Privy, Dynamic, Coinbase Smart Wallet, wagmi)
                </li>
                <li>
                  <span className="font-mono text-bright">approveIfNeeded · supply · withdraw · readPosition</span> helpers for an omnibus backend
                </li>
                <li>Per-second interest ticker, step-by-step transaction progress, plain-language risk note</li>
                <li>Events for analytics: view, step, deposited, withdrew, error</li>
              </ul>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 font-mono text-[0.6875rem] text-muted">{label}</p>
      {children}
    </div>
  );
}
