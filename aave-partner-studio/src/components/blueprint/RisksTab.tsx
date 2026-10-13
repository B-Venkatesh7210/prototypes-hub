"use client";

import { Card, Eyebrow } from "@/components/ui/primitives";
import type { Blueprint } from "@/lib/types";

const LEVEL = {
  low: "text-good border-good/30",
  medium: "text-warn border-warn/30",
  high: "text-bad border-bad/30",
};

export function RisksTab({ bp }: { bp: Blueprint }) {
  return (
    <div className="grid items-start gap-8 lg:grid-cols-[1.3fr_1fr]">
      <div className="flex flex-col gap-6">
        <div>
          <Eyebrow>Risks to cover with {bp.partner.name}</Eyebrow>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {bp.risks.map((r) => (
              <Card key={r.title} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-medium">{r.title}</p>
                  <span className={`shrink-0 rounded-full border px-2 py-0.5 font-mono text-[0.625rem] uppercase ${LEVEL[r.level]}`}>{r.level}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{r.body}</p>
              </Card>
            ))}
          </div>
        </div>

        <div>
          <Eyebrow>Rollout</Eyebrow>
          <ol className="mt-3 grid gap-3 sm:grid-cols-3">
            {bp.rollout.map((phase, i) => (
              <li key={phase.phase} className="relative rounded-2xl border border-line bg-surface p-4">
                <p className="font-mono text-[0.6875rem] text-dim">
                  0{i + 1} · {phase.weeks}
                </p>
                <p className="mt-1 font-medium">{phase.phase}</p>
                <ul className="mt-2 space-y-1.5">
                  {phase.items.map((item) => (
                    <li key={item} className="text-sm leading-snug text-muted">
                      {item}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </div>
      </div>

      <Card className="p-5 lg:sticky lg:top-32">
        <Eyebrow>Questions for the first call</Eyebrow>
        <ol className="mt-3 space-y-3">
          {bp.questions.map((q, i) => (
            <li key={q} className="flex gap-3 text-sm leading-relaxed">
              <span className="font-mono text-xs text-dim">{i + 1}</span>
              <span className="text-bright">{q}</span>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
