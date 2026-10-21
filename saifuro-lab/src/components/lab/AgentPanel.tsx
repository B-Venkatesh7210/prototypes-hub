"use client";

import { useEffect, useRef, useState } from "react";
import { SCENARIOS, type ScenarioId } from "@/lib/lab/scenario-list";
import type { LabState } from "@/lib/lab/state";
import { Button, InfoTip, Panel, Pill, SectionLabel, Tip, time, VerdictBadge, type Tone } from "../ui";
import type { Post } from "./Lab";

const AGENT_SCENARIOS = (Object.keys(SCENARIOS) as ScenarioId[]).filter((id) => SCENARIOS[id].side === "agent");

const SUGGESTIONS = ["What are BTC and ETH trading at?", "Compare stablecoin supply by chain.", "Get me the institutional flows report."];

const NOTE_BORDER: Record<string, string> = { ok: "border-allow", warn: "border-review", bad: "border-deny", info: "border-line-strong" };

type Message = LabState["messages"][number];

export function AgentPanel({ state, post }: { state: LabState; post: Post }) {
  const [prompt, setPrompt] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const count = state.messages.length;
  const m = state.mandate;

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [count]);

  const ask = async (text: string) => {
    if (!text.trim() || state.busy) return;
    if (await post("/api/lab/run", { prompt: text })) setPrompt("");
  };

  return (
    <Panel
      kicker="Buyer"
      title={
        <>
          Research agent <span className="ml-1 font-mono text-[12px] font-normal text-faint">{state.agent}</span>
        </>
      }
      info="An AI agent with a Base Sepolia wallet. It pays per request over x402, and only after Saifuro allows the payment."
      actions={
        <>
          {state.busy && (
            <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-review">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-review" />
              Running
            </span>
          )}
          <Button size="sm" onClick={() => void post("/api/lab/reset", {})} disabled={!!state.busy}>
            Reset
          </Button>
        </>
      }
    >
      <div className="border-b border-line px-5 py-4">
        <SectionLabel info="Each one sends real requests through Saifuro and the seller. Hover a scenario to see what it shows; the pill is the verdict to expect.">
          Scenarios
        </SectionLabel>
        <div className="grid grid-cols-3 gap-2">
          {AGENT_SCENARIOS.map((id) => (
            <Tip key={id} content={SCENARIOS[id].blurb} className="w-full">
              <button
                disabled={!!state.busy}
                onClick={() => void post("/api/lab/run", { scenario: id })}
                className="flex w-full flex-col items-start gap-1.5 rounded-md border border-line px-3 py-2.5 text-left transition hover:border-faint hover:bg-subtle disabled:cursor-not-allowed disabled:opacity-40"
              >
                <span className="text-[13.5px] font-medium leading-tight text-ink">{SCENARIOS[id].title}</span>
                <VerdictBadge verdict={SCENARIOS[id].expect} />
              </button>
            </Tip>
          ))}
        </div>
      </div>

      <div ref={scroller} className="scroll-thin min-h-64 flex-1 space-y-2.5 overflow-y-auto px-5 py-4 lg:min-h-0">
        {count === 0 ? (
          <div className="grid h-full place-items-center text-center">
            <div>
              <p className="text-[14px] text-body">Run a scenario, or ask the agent something it has to pay to answer.</p>
              {m && (
                <p className="mt-2 font-mono text-[12px] text-faint">
                  mandate: {m.limits.per_transaction}/purchase · {m.limits.per_month}/30d · {m.categories.join(", ")}
                </p>
              )}
            </div>
          </div>
        ) : (
          state.messages.map((msg) => <Line key={msg.id} m={msg} />)
        )}
      </div>

      <form
        className="border-t border-line px-5 py-3.5"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(prompt);
        }}
      >
        {state.status.ai.enabled && count === 0 && (
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void ask(s)}
                disabled={!!state.busy}
                className="rounded-full border border-line px-3 py-1 text-[12.5px] text-body transition hover:border-faint hover:text-ink"
              >
                {s}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-2">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            maxLength={500}
            disabled={!state.status.ai.enabled}
            placeholder={state.status.ai.enabled ? "Ask the agent…" : "Set AI_API_KEY to chat. Scenarios work without it."}
            className="h-10 min-w-0 flex-1 rounded-md border border-line-strong bg-surface px-3 text-[14px] text-ink placeholder:text-faint focus:border-ink focus:outline-none disabled:bg-subtle"
          />
          <Button type="submit" variant="primary" disabled={!prompt.trim() || !!state.busy || !state.status.ai.enabled}>
            Ask
          </Button>
        </div>
      </form>
    </Panel>
  );
}

function Line({ m }: { m: Message }) {
  if (m.role === "user")
    return (
      <div className="slide-in flex justify-end pt-1.5">
        <div className="max-w-[85%] rounded-md bg-ink px-3 py-1.5 text-[13.5px] font-medium text-white">{m.text}</div>
      </div>
    );

  if (m.role === "agent")
    return (
      <div className="slide-in flex max-w-[94%] items-start gap-2 rounded-md border border-line bg-subtle px-3.5 py-2.5 text-[13.5px] leading-relaxed text-ink">
        <span className="whitespace-pre-wrap">{m.text}</span>
        {m.detail && <InfoTip content={m.detail} />}
      </div>
    );

  if (m.role === "note")
    return (
      <div className={`slide-in flex items-center gap-2 border-l-2 py-0.5 pl-3 text-[12.5px] text-body ${NOTE_BORDER[m.tone ?? "info"]}`}>
        <span>{m.text}</span>
        {m.detail && <InfoTip content={m.detail} />}
      </div>
    );

  const tone: Tone = m.tone ?? "info";
  return (
    <div className="slide-in grid grid-cols-[3.75rem_auto_1fr] items-center gap-x-2.5 text-[12.5px]">
      <span className="font-mono text-[11.5px] text-faint">{time(m.at)}</span>
      <Pill tone={tone} mono className="min-w-[3.25rem] justify-center">
        {m.tag ?? "step"}
      </Pill>
      <span className="flex min-w-0 items-center gap-2 text-body">
        <span className="min-w-0 break-words">{m.text}</span>
        {m.link && (
          <a href={m.link.href} target="_blank" rel="noreferrer" className="shrink-0 font-mono text-accent hover:underline">
            {m.link.label} ↗
          </a>
        )}
        {m.detail && <InfoTip content={m.detail} />}
      </span>
    </div>
  );
}
