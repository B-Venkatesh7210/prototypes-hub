"use client";

import { useEffect, useRef, useState } from "react";
import { SCENARIOS, type ScenarioId } from "@/lib/lab/scenario-list";
import type { LabState } from "@/lib/lab/state";
import { Button, Panel, VerdictBadge } from "../ui";
import type { Post } from "./Lab";

const AGENT_SCENARIOS = (Object.keys(SCENARIOS) as ScenarioId[]).filter((id) => SCENARIOS[id].side === "agent");

const TONE: Record<string, string> = { ok: "bg-allow", warn: "bg-review", bad: "bg-deny", info: "bg-info" };
const NOTE_TONE: Record<string, string> = { ok: "border-allow/40", warn: "border-review/50 text-review/90", bad: "border-deny/50 text-deny/90", info: "border-line-strong" };

const SUGGESTIONS = ["What are BTC and ETH trading at right now?", "Compare stablecoin supply across the top chains.", "Get me the institutional flows report, it's urgent."];

export function AgentPanel({ state, post }: { state: LabState; post: Post }) {
  const [prompt, setPrompt] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const count = state.messages.length;

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
      title={`Research agent · ${state.agent}`}
      actions={
        <>
          {state.busy && (
            <span className="flex items-center gap-1.5 text-xs text-review">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-review" />
              {state.busy}
            </span>
          )}
          <Button size="sm" onClick={() => void post("/api/lab/reset", {})} disabled={!!state.busy} title="New agent, new mandate, empty logs">
            Reset
          </Button>
        </>
      }
    >
      <div className="grid grid-cols-2 gap-1.5 border-b border-line p-3">
        {AGENT_SCENARIOS.map((id) => (
          <button
            key={id}
            disabled={!!state.busy}
            onClick={() => void post("/api/lab/run", { scenario: id })}
            className="group rounded-lg border border-line bg-raised/60 px-2.5 py-2 text-left transition hover:border-line-strong hover:bg-raised disabled:cursor-not-allowed disabled:opacity-40"
          >
            <div className="flex items-center justify-between gap-2">
              <span className="truncate text-[13px] font-medium text-bright">{SCENARIOS[id].title}</span>
              <VerdictBadge verdict={SCENARIOS[id].expect} className="shrink-0 !text-[10px]" />
            </div>
            <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted">{SCENARIOS[id].blurb}</p>
          </button>
        ))}
      </div>

      <div ref={scroller} className="scroll-thin min-h-64 flex-1 space-y-2 overflow-y-auto p-4 lg:min-h-0">
        {count === 0 && (
          <div className="grid h-full place-items-center text-center text-sm text-dim">
            <div>
              <p>Run a scenario, or ask the agent a question.</p>
              <p className="mt-1 text-xs">It can only spend what its mandate allows: 0.50 USDC per purchase, 5 USDC per 30 days, data only.</p>
            </div>
          </div>
        )}
        {state.messages.map((m) => {
          if (m.role === "user")
            return (
              <div key={m.id} className="slide-in flex justify-end pt-2">
                <div className="max-w-[85%] rounded-2xl rounded-br-sm bg-accent/90 px-3.5 py-2 text-sm font-medium text-bg">{m.text}</div>
              </div>
            );
          if (m.role === "agent")
            return (
              <div key={m.id} className="slide-in max-w-[92%] whitespace-pre-wrap rounded-2xl rounded-bl-sm border border-line bg-raised px-3.5 py-2.5 text-sm leading-relaxed text-text">
                {m.text}
              </div>
            );
          if (m.role === "note")
            return (
              <div key={m.id} className={`slide-in border-l-2 py-0.5 pl-3 text-xs leading-relaxed text-muted ${NOTE_TONE[m.tone ?? "info"]}`}>
                {m.text}
              </div>
            );
          return (
            <div key={m.id} className="slide-in flex items-start gap-2 font-mono text-[11.5px] leading-relaxed text-muted">
              <span className={`mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full ${TONE[m.tone ?? "info"]}`} />
              <span className="min-w-0 break-words">
                {m.text}
                {m.link && (
                  <>
                    {" "}
                    <a href={m.link.href} target="_blank" rel="noreferrer" className="text-info hover:underline">
                      {m.link.label}
                    </a>
                  </>
                )}
              </span>
            </div>
          );
        })}
      </div>

      <form
        className="border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(prompt);
        }}
      >
        {state.status.ai.enabled && count === 0 && (
          <div className="mb-2 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button key={s} type="button" onClick={() => void ask(s)} disabled={!!state.busy} className="rounded-full border border-line px-2.5 py-1 text-xs text-muted hover:border-line-strong hover:text-bright">
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
            placeholder={state.status.ai.enabled ? "Ask the agent something it has to pay to answer…" : "Set AI_API_KEY to chat. The scenarios work without it."}
            className="min-w-0 flex-1 rounded-md border border-line-strong bg-bg px-3 py-2 text-sm text-bright placeholder:text-dim focus:border-dim focus:outline-none disabled:opacity-50"
          />
          <Button type="submit" tone="primary" disabled={!prompt.trim() || !!state.busy || !state.status.ai.enabled}>
            Ask
          </Button>
        </div>
      </form>
    </Panel>
  );
}
