"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PartnerLogo } from "@/components/brand/PartnerLogo";
import { Button, Card, ErrorNote, Eyebrow, Pill, Spinner, Stat } from "@/components/ui/primitives";
import { fmtPct, fmtUsd } from "@/lib/aave/math";
import { useMarket } from "@/lib/client/hooks";
import { rememberBlueprint } from "@/lib/client/recent";
import type { Blueprint } from "@/lib/types";
import { ArchitectureTab } from "./ArchitectureTab";
import { BusinessTab } from "./BusinessTab";
import { IntegrateTab } from "./IntegrateTab";
import { onePager } from "./onePager";
import { PreviewTab } from "./PreviewTab";
import { RisksTab } from "./RisksTab";

const TABS = [
  { id: "preview", label: "Live preview" },
  { id: "integrate", label: "Integration code" },
  { id: "architecture", label: "Architecture" },
  { id: "business", label: "Business case" },
  { id: "risks", label: "Risks & rollout" },
] as const;
type TabId = (typeof TABS)[number]["id"];

const CATEGORY_LABEL: Record<string, string> = {
  neobank: "Neobank",
  wallet: "Wallet",
  payments: "Payments",
  payroll: "Payroll",
  remittance: "Remittance",
  exchange: "Exchange",
  ecommerce: "Commerce",
  treasury: "Treasury",
  other: "Fintech",
};

export function BlueprintView({ bp: initial }: { bp: Blueprint }) {
  const router = useRouter();
  const [bp, setBp] = useState(initial);
  const [tab, setTab] = useState<TabId>("preview");
  const [copied, setCopied] = useState<"" | "link" | "doc">("");
  const [rebuilding, setRebuilding] = useState(false);
  const [error, setError] = useState("");
  const { market } = useMarket(bp.recommendation.asset);
  const p = bp.partner;
  const r = bp.recommendation;

  useEffect(() => rememberBlueprint(bp), [bp]);

  const copy = async (kind: "link" | "doc") => {
    await navigator.clipboard.writeText(kind === "link" ? window.location.href : onePager(bp, market));
    setCopied(kind);
    setTimeout(() => setCopied(""), 1800);
  };

  const rebuild = async () => {
    setRebuilding(true);
    setError("");
    try {
      const res = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: bp.input, refresh: true }) });
      const body = (await res.json()) as { blueprint?: Blueprint; error?: string };
      if (!res.ok || !body.blueprint) throw new Error(body.error || "Rebuild failed.");
      setBp(body.blueprint);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Rebuild failed.");
    } finally {
      setRebuilding(false);
    }
  };

  return (
    <div>
      <section className="border-b border-line" style={{ background: `radial-gradient(60rem 18rem at 10% -40%, ${p.brand.primary}33, transparent 70%)` }}>
        <div className="mx-auto max-w-7xl px-5 pt-10 pb-8">
          <div className="flex flex-wrap items-start justify-between gap-5">
            <div className="flex min-w-0 items-center gap-4">
              <PartnerLogo name={p.name} logo={p.brand.logo} color={p.brand.primary} size={56} />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">
                    {p.name} <span className="text-muted">× Aave</span>
                  </h1>
                </div>
                <p className="mt-1 max-w-2xl truncate text-sm text-muted">{p.tagline}</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Pill>{CATEGORY_LABEL[p.category] ?? p.category}</Pill>
                  <Pill>{p.region}</Pill>
                  {p.domain ? <Pill>{p.domain}</Pill> : null}
                  <Pill tone={bp.engine.kind === "ai" ? "aave" : "neutral"}>{bp.engine.kind === "ai" ? `AI · ${bp.engine.model}` : "Template analysis"}</Pill>
                </div>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button tone="secondary" size="sm" onClick={() => copy("link")}>
                {copied === "link" ? "Link copied" : "Copy share link"}
              </Button>
              <Button tone="secondary" size="sm" onClick={() => copy("doc")}>
                {copied === "doc" ? "Copied as Markdown" : "Copy one-pager"}
              </Button>
              <Button tone="ghost" size="sm" onClick={rebuild} disabled={rebuilding}>
                {rebuilding ? <Spinner size={12} /> : null} Rebuild
              </Button>
            </div>
          </div>

          {bp.engine.note ? <p className="mt-4 text-xs text-warn">{bp.engine.note}</p> : null}
          {error ? (
            <div className="mt-4">
              <ErrorNote>{error}</ErrorNote>
            </div>
          ) : null}

          <div className="mt-8 grid gap-6 lg:grid-cols-[1.4fr_1fr]">
            <div>
              <Eyebrow>Recommendation</Eyebrow>
              <p className="mt-2 text-xl leading-snug font-medium sm:text-2xl">{r.headline}</p>
              <ul className="mt-4 space-y-2">
                {r.why.map((w) => (
                  <li key={w} className="flex gap-2.5 text-sm leading-relaxed text-muted">
                    <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-aave-teal" />
                    {w}
                  </li>
                ))}
              </ul>
            </div>
            <Card className="grid grid-cols-2 gap-5 p-5">
              <Stat label={`${r.asset} supply APY`} value={market ? fmtPct(market.supplyApy) : "—"} hint="Variable · live from Base" />
              <Stat label="Market size" value={market ? fmtUsd(market.totalSupplied * market.priceUsd, { compact: true }) : "—"} hint={market ? `${fmtPct(market.utilization, 0)} utilized` : " "} />
              <Stat label="Products" value={r.products.map((x) => (x === "earn" ? "Earn" : "Borrow")).join(" + ")} hint="Phase 1 ships Earn" />
              <Stat label="Custody" value={r.custody === "embedded" ? "Embedded wallets" : "Omnibus"} hint={r.custody === "embedded" ? "Users hold keys" : "Partner holds aTokens"} />
            </Card>
          </div>
        </div>
      </section>

      <div className="sticky top-14 z-30 border-b border-line bg-ink/85 backdrop-blur-xl">
        <div className="scroll-thin mx-auto flex max-w-7xl gap-1 overflow-x-auto px-5">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`relative cursor-pointer px-3.5 py-3.5 text-sm whitespace-nowrap transition-colors ${tab === t.id ? "text-bright" : "text-muted hover:text-bright"}`}
            >
              {t.label}
              {tab === t.id ? <span className="aave-gradient absolute inset-x-3 bottom-0 h-0.5 rounded-full" /> : null}
            </button>
          ))}
        </div>
      </div>

      <section className="mx-auto max-w-7xl px-5 py-8">
        <div className={tab === "preview" ? "" : "hidden"}>
          <PreviewTab bp={bp} />
        </div>
        {tab === "integrate" ? <IntegrateTab bp={bp} /> : null}
        {tab === "architecture" ? <ArchitectureTab bp={bp} /> : null}
        {tab === "business" ? <BusinessTab bp={bp} /> : null}
        {tab === "risks" ? <RisksTab bp={bp} /> : null}
      </section>
    </div>
  );
}
