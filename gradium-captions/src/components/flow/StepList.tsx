"use client";

import { Check, X } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/primitives";

export type StepState = "pending" | "active" | "done" | "error" | "skipped";

export type Step = {
  id: string;
  label: string;
  api?: string;
  state: StepState;
  detail?: string;
  /** 0..1 for a real bar, undefined for an indeterminate (striped) bar. */
  progress?: number;
  startedAt?: number;
  endedAt?: number;
};

function elapsed(step: Step) {
  if (!step.startedAt) return "";
  const end = step.endedAt ?? Date.now();
  return `${((end - step.startedAt) / 1000).toFixed(1)}s`;
}

export function StepList({ steps }: { steps: Step[] }) {
  return (
    <ol className="flex flex-col divide-y divide-white/[0.06] overflow-hidden rounded-xl border border-white/10 bg-surface/70">
      {steps.map((step) => {
        const pct = step.state === "done" ? 1 : step.progress;
        return (
          <li key={step.id} className="flex flex-col gap-2.5 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <span
                className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border ${
                  step.state === "done"
                    ? "border-green/50 bg-green/15 text-green"
                    : step.state === "error"
                      ? "border-red/50 bg-red/15 text-red"
                      : step.state === "active"
                        ? "border-bright/50 text-bright"
                        : "border-white/10 text-lightgray"
                }`}
              >
                {step.state === "done" ? (
                  <Check size={13} />
                ) : step.state === "error" ? (
                  <X size={13} />
                ) : step.state === "active" ? (
                  <Spinner className="h-3.5 w-3.5" />
                ) : (
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                )}
              </span>
              <div className="flex min-w-0 flex-1 items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <span className={`font-plex text-sm ${step.state === "pending" || step.state === "skipped" ? "text-lightgray" : "text-bright"}`}>
                    {step.label}
                  </span>
                  {step.api ? <span className="ml-2 font-code text-[0.6875rem] text-lightgray">{step.api}</span> : null}
                </div>
                <span className="shrink-0 font-code text-[0.6875rem] text-lightgray">
                  {step.state === "skipped" ? "skipped" : elapsed(step)}
                </span>
              </div>
            </div>
            {step.state === "active" || step.state === "done" || step.state === "error" ? (
              <div className="ml-9 flex flex-col gap-1.5">
                <div className="h-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <div
                    className={`h-full rounded-full transition-[width] duration-300 ${
                      step.state === "error" ? "bg-red" : pct === undefined ? "striped w-full bg-bright/40" : "bg-bright"
                    }`}
                    style={pct === undefined ? undefined : { width: `${Math.round(pct * 100)}%` }}
                  />
                </div>
                {step.detail ? (
                  <p className={`font-plex text-xs ${step.state === "error" ? "text-[#ffb4ab]" : "text-lightgray"}`}>{step.detail}</p>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function patchStep(steps: Step[], id: string, patch: Partial<Step>): Step[] {
  return steps.map((s) => {
    if (s.id !== id) return s;
    const next = { ...s, ...patch };
    if (patch.state === "active" && !s.startedAt) next.startedAt = Date.now();
    if ((patch.state === "done" || patch.state === "error") && !s.endedAt) next.endedAt = Date.now();
    return next;
  });
}
