import { AnalyzeForm } from "@/components/studio/AnalyzeForm";
import { MarketStrip } from "@/components/studio/MarketStrip";
import { RecentBlueprints } from "@/components/studio/RecentBlueprints";

const HOW = [
  {
    title: "Paste a company",
    body: "A website or a one-line description. The studio reads it, classifies the business and matches it to a live Aave market.",
  },
  {
    title: "See their app with Earn inside",
    body: "A branded preview of the partner's app with a working Earn widget. Deposit, then fast-forward a month and watch the interest.",
  },
  {
    title: "Ship the blueprint",
    body: "Integration code for their wallet setup, an architecture, a business case on live rates, risks and discovery questions.",
  },
];

export default function Home() {
  return (
    <div className="glow">
      <section className="mx-auto max-w-5xl px-5 pt-20 pb-14 sm:pt-28">
        <p className="font-mono text-xs tracking-[0.16em] text-muted uppercase">For Aave partner engineering</p>
        <h1 className="mt-4 max-w-4xl text-4xl leading-[1.05] font-semibold tracking-tight sm:text-6xl">
          Any fintech, <span className="aave-gradient-text">integrated with Aave</span> in 60 seconds.
        </h1>
        <p className="mt-5 max-w-2xl text-lg leading-relaxed text-muted">
          Paste a partner&apos;s website. Get their own app with an Aave Earn account inside it, running real transactions on a fork of Base,
          plus the code, architecture and business case to ship it.
        </p>
        <div className="mt-9 max-w-3xl">
          <AnalyzeForm autoFocus />
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-5">
        <MarketStrip />
      </section>

      <section className="mx-auto grid max-w-5xl gap-4 px-5 py-14 sm:grid-cols-3">
        {HOW.map((h, i) => (
          <div key={h.title} className="rounded-2xl border border-line bg-surface/50 p-5">
            <p className="font-mono text-xs text-dim">0{i + 1}</p>
            <h3 className="mt-3 font-semibold">{h.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{h.body}</p>
          </div>
        ))}
      </section>

      <section className="mx-auto max-w-5xl px-5 pb-20">
        <RecentBlueprints />
      </section>
    </div>
  );
}
