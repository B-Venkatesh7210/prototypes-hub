"use client";

import { useEffect, useRef, useState } from "react";
import { SCENARIOS, type ScenarioId } from "@/lib/lab/scenario-list";
import type { LabState } from "@/lib/lab/state";
import { Button, InfoTip, Pill, time, VerdictBadge, type Tone } from "../ui";
import { GUIDES, phaseStatuses, type Actor, type Msg, type Phase, type PhaseStatus } from "./guide";
import type { Post } from "./Lab";

const IDS = Object.keys(SCENARIOS) as ScenarioId[];
const GROUPS: { label: string; info: string; ids: ScenarioId[] }[] = [
  { label: "Agent edge cases", info: "Saifuro stops these before anything is signed. The seller never hears about them.", ids: IDS.filter((id) => SCENARIOS[id].side === "agent") },
  { label: "Attacks on the seller", info: "Saifuro already said allow. Only the seller, verifying the verdict, can catch these.", ids: IDS.filter((id) => SCENARIOS[id].side === "seller") },
  {
    label: "Real merchant · Base mainnet",
    info: "A third-party x402 merchant, paid in real USDC. It doesn't check verdicts, so the agent's own guard is what holds.",
    ids: IDS.filter((id) => SCENARIOS[id].side === "merchant"),
  },
];

const SIDE: Record<string, string> = { agent: "Agent edge case", seller: "Attack on the seller", merchant: "Real merchant" };

const SUGGESTIONS = ["What are BTC and ETH trading at?", "Compare stablecoin supply by chain.", "Get me the institutional flows report."];

type View = ScenarioId | "ask";

const label = (id: ScenarioId) => `${SCENARIOS[id].side === "seller" ? "Attack" : "Run"}: ${SCENARIOS[id].title}`;

/** The latest run of a scenario: everything after its user message, up to the next one. */
function lastRun(messages: Msg[], id: ScenarioId): { at: string; msgs: Msg[] } | null {
  const want = label(id);
  let start = -1;
  for (let i = messages.length - 1; i >= 0; i--)
    if (messages[i].role === "user" && messages[i].text === want) {
      start = i;
      break;
    }
  if (start < 0) return null;
  let end = messages.length;
  for (let j = start + 1; j < messages.length; j++)
    if (messages[j].role === "user") {
      end = j;
      break;
    }
  return { at: messages[start].at, msgs: messages.slice(start + 1, end) };
}

function initialView(messages: Msg[]): View {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role !== "user") continue;
    const id = IDS.find((x) => label(x) === messages[i].text);
    return id ?? "ask";
  }
  return "research";
}

export function AgentPanel({ state, post }: { state: LabState; post: Post }) {
  const [view, setView] = useState<View>(() => initialView(state.messages));
  const m = state.mandate;
  const design = view !== "ask" && SCENARIOS[view].side === "merchant";
  const dm = state.merchant.mandate;

  return (
    <section className="flex flex-col overflow-hidden rounded-md border border-line bg-surface lg:h-[calc(100dvh-14rem)] lg:min-h-[640px]">
      <header className="flex min-h-[68px] flex-wrap items-center gap-x-4 gap-y-2 border-b border-line px-5 py-3">
        <div className="min-w-0">
          <div className="kicker">Buyer</div>
          <div className="mt-0.5 flex items-center gap-2">
            <h2 className="text-[17px] font-semibold tracking-[-0.015em] text-ink">{design ? "Design agent" : "Research agent"}</h2>
            <span className="font-mono text-[12px] text-faint">{design ? (state.merchant.agent ?? "created on first run") : state.agent}</span>
            <InfoTip
              content={
                design
                  ? "A second agent with its own wallet on Base mainnet, holding real USDC. It buys images over x402, and only after Saifuro allows the payment."
                  : "An AI agent with a Base Sepolia wallet. It pays per request over x402, and only after Saifuro allows the payment."
              }
            />
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-3">
          {design && dm && (
            <span className="flex items-center gap-2 rounded-md border border-line bg-subtle px-2.5 py-1.5 text-[12.5px] text-body">
              <span className="kicker !text-[11px]">Mandate</span>
              <span className="font-mono text-ink">
                {rupees(dm.limits.per_transaction, state)}/image · {rupees(dm.limits.per_month ?? 0, state)} task · {dm.categories.join(", ")}
              </span>
              <Pill tone={dm.status === "active" ? "ok" : "bad"}>{dm.status}</Pill>
            </span>
          )}
          {!design && m && (
            <span className="flex items-center gap-2 rounded-md border border-line bg-subtle px-2.5 py-1.5 text-[12.5px] text-body">
              <span className="kicker !text-[11px]">Mandate</span>
              <span className="font-mono text-ink">
                {m.limits.per_transaction}/purchase · {m.limits.per_month}/30d · review &gt; {m.review_above} · {m.categories.join(", ")}
              </span>
              <Pill tone={m.status === "active" ? "ok" : "bad"}>{m.status}</Pill>
            </span>
          )}
          {state.busy && (
            <span className="flex items-center gap-1.5 text-[12.5px] font-medium text-review">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-review" />
              Running {state.busy}
            </span>
          )}
          <Button size="sm" onClick={() => void post("/api/lab/reset", {})} disabled={!!state.busy}>
            Reset
          </Button>
        </div>
      </header>

      <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_1fr]">
        <nav className="scroll-thin min-h-0 overflow-y-auto border-b border-line py-3 lg:border-b-0 lg:border-r">
          {GROUPS.map((g) => (
            <div key={g.label} className="mb-3">
              <div className="flex items-center gap-2 px-5 pb-1.5 pt-1">
                <span className="kicker">{g.label}</span>
                <InfoTip content={g.info} />
              </div>
              {g.ids.map((id) => (
                <NavItem key={id} id={id} n={IDS.indexOf(id) + 1} active={view === id} running={state.busy === SCENARIOS[id].title} ran={!!lastRun(state.messages, id)} onClick={() => setView(id)} />
              ))}
            </div>
          ))}
          <div className="px-5 pb-1.5 pt-1">
            <span className="kicker">Free-form</span>
          </div>
          <button
            onClick={() => setView("ask")}
            className={`w-full px-5 py-2.5 text-left transition ${view === "ask" ? "bg-subtle shadow-[inset_2px_0_0_#0f1e33]" : "hover:bg-subtle/60"}`}
          >
            <div className="text-[14px] font-medium text-ink">Ask the agent</div>
            <div className="mt-0.5 text-[12px] text-muted">Your own question, and the full activity log</div>
          </button>
        </nav>

        <div className="min-h-0 min-w-0">
          {view === "ask" ? <AskView state={state} post={post} /> : <ScenarioView key={view} id={view} state={state} post={post} />}
        </div>
      </div>
    </section>
  );
}

function NavItem({ id, n, active, running, ran, onClick }: { id: ScenarioId; n: number; active: boolean; running: boolean; ran: boolean; onClick: () => void }) {
  const s = SCENARIOS[id];
  return (
    <button onClick={onClick} className={`w-full px-5 py-2.5 text-left transition ${active ? "bg-subtle shadow-[inset_2px_0_0_#0f1e33]" : "hover:bg-subtle/60"}`}>
      <div className="flex items-center gap-2.5">
        <span className="font-mono text-[11.5px] text-faint">{String(n).padStart(2, "0")}</span>
        <span className="text-[14px] font-medium text-ink">{s.title}</span>
        {running ? <span className="pulse-dot ml-auto h-1.5 w-1.5 rounded-full bg-review" /> : ran && <span className="ml-auto text-[12px] text-allow">✓</span>}
      </div>
      <div className="mt-1 flex items-center gap-2 pl-[1.6rem]">
        <span className="text-[12px] text-muted">{GUIDES[id].edge}</span>
        {s.side === "seller" ? <Pill mono>{s.expect}</Pill> : <VerdictBadge verdict={s.expect} />}
      </div>
    </button>
  );
}

function ScenarioView({ id, state, post }: { id: ScenarioId; state: LabState; post: Post }) {
  const s = SCENARIOS[id];
  const g = GUIDES[id];
  const run = lastRun(state.messages, id);
  const running = state.busy === s.title;
  const merchant = s.side === "merchant";
  const needsYou = running && (merchant ? state.merchant.topup === "waiting" : state.pendingReviews.length > 0);
  const statuses = phaseStatuses(g.phases, run?.msgs ?? null, running, needsYou);
  const activeIdx = statuses.findIndex((x) => x.status === "active" || x.status === "waiting");
  const nodes = useRef<(HTMLLIElement | null)[]>([]);
  const revoked = state.mandate?.status !== "active";
  const blocked = merchant && !state.merchant.wallet;

  useEffect(() => {
    if (activeIdx >= 0) nodes.current[activeIdx]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIdx]);

  return (
    <div className="scroll-thin h-full overflow-y-auto">
      <div className="border-b border-line px-7 pb-6 pt-6">
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <div className="min-w-0 flex-1">
            <div className="kicker">
              {SIDE[s.side]} · {g.edge}
            </div>
            <h3 className="mt-1.5 text-[26px] font-semibold leading-tight tracking-[-0.025em] text-ink">{s.title}</h3>
          </div>
          <div className="flex items-center gap-3">
            {run && !running && <span className="text-[12.5px] text-muted">Last run {time(run.at)}</span>}
            <Button variant="primary" disabled={!!state.busy || blocked} onClick={() => void post("/api/lab/run", { scenario: id })}>
              {running ? "Running…" : run ? "Run again" : "Run scenario"}
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-x-8 gap-y-4 md:grid-cols-2">
          <Explain label="What we're testing">{g.goal}</Explain>
          <Explain label="Why it matters">{g.why}</Explain>
        </div>
        <div className="mt-4 flex items-start gap-3 rounded-md border border-line bg-subtle/70 px-4 py-3">
          <span className="kicker mt-0.5 shrink-0">Expected</span>
          <span className="text-[14px] text-ink">{g.expect}</span>
        </div>
        {merchant && <MerchantCard state={state} />}
        {blocked && (
          <Banner tone="bad">
            Add <span className="font-mono">BUYER_MAINNET_PRIVATE_KEY</span> to .env.local: a fresh wallet holding about 1 USDC on Base mainnet. No ETH is needed. Then restart the dev server.
          </Banner>
        )}

        {state.busy && !running && <Banner tone="info">The agent is busy with {state.busy}. You can read this one while it finishes.</Banner>}
        {revoked && id !== "revoke" && s.side === "agent" && (
          <Banner tone="bad" action={<NewMandate post={post} />}>
            The mandate is revoked, so every purchase will be denied with deny_revoked.
          </Banner>
        )}
      </div>

      <div className="px-7 py-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="kicker">{run ? "What happened" : "What will happen"}</span>
          <InfoTip content="Each step fills in live as the run progresses: the real transcript events, with times, verdicts and Base Sepolia transactions." />
        </div>
        <ol>
          {g.phases.map((p, i) => (
            <li
              key={i}
              ref={(el) => {
                nodes.current[i] = el;
              }}
            >
              <PhaseRow
                phase={p}
                n={i + 1}
                last={i === g.phases.length - 1}
                status={statuses[i].status}
                events={statuses[i].events}
                action={
                  statuses[i].status === "waiting" ? (
                    p.action === "review" ? (
                      <ReviewActions state={state} post={post} />
                    ) : p.action === "topup" ? (
                      <TopUpActions state={state} post={post} />
                    ) : revoked ? (
                      <div className="mt-3">
                        <NewMandate post={post} />
                      </div>
                    ) : null
                  ) : null
                }
              />
            </li>
          ))}
        </ol>
        {g.after && <Banner tone="info">{g.after}</Banner>}
        {merchant && run && <Gallery state={state} />}
      </div>
    </div>
  );
}

function rupees(usd: number, state: LabState) {
  const r = usd * state.merchant.inrPerUsd;
  return `₹${r.toFixed(r < 10 ? 1 : 0)}`;
}

function MerchantCard({ state }: { state: LabState }) {
  const mc = state.merchant;
  const m = mc.mandate;
  const cap = m?.limits.per_month ?? 0;
  return (
    <div className="mt-4 grid gap-x-8 gap-y-4 rounded-md border border-line px-4 py-3.5 md:grid-cols-[1.3fr_1fr]">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="kicker">Task budget</span>
          <InfoTip content={`Mandates are in USDC. Rupees are shown at a fixed ₹${mc.inrPerUsd} per dollar.`} />
          {m && <Pill tone={m.status === "active" ? "ok" : "bad"}>{m.status}</Pill>}
        </div>
        {m ? (
          <>
            <div className="mt-1.5 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[13.5px] text-body">
              <span>
                <b className="font-semibold text-ink">{rupees(m.limits.per_transaction, state)}</b> per image
              </span>
              <span>
                <b className="font-semibold text-ink">{rupees(cap, state)}</b> in total
              </span>
              <span className="font-mono text-[12px] text-faint">{m.mandate}</span>
            </div>
            <div className="mt-2.5 flex justify-between text-[12px]">
              <span className="text-muted">Spent on this mandate</span>
              <span className="font-mono text-body">
                {rupees(mc.spent, state)} / {rupees(cap, state)}
              </span>
            </div>
            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-subtle">
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${cap ? Math.min(100, (mc.spent / cap) * 100) : 0}%` }} />
            </div>
          </>
        ) : (
          <p className="mt-1.5 text-[13.5px] text-body">
            ₹{mc.rules.per_image_inr} per image, ₹{mc.rules.budget_inr} in total. Issued fresh when you run the scenario.
          </p>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="kicker">Wallet · Base mainnet</span>
          <InfoTip content={`Pays ${mc.name} (${mc.model}) over x402. ${mc.name} settles each payment and pays the gas.`} />
        </div>
        {mc.wallet ? (
          <div className="mt-1.5 text-[13.5px] text-body">
            <b className="font-semibold text-ink">{mc.balance != null ? `${Number(mc.balance).toFixed(3)} USDC` : "balance unavailable"}</b>
            {mc.balance != null && <span className="text-muted"> ≈ {rupees(Number(mc.balance), state)}</span>}
            <a href={`${mc.explorer}/address/${mc.wallet}`} target="_blank" rel="noreferrer" className="ml-2 font-mono text-[12px] text-accent hover:underline">
              {mc.wallet.slice(0, 6)}…{mc.wallet.slice(-4)} ↗
            </a>
          </div>
        ) : (
          <p className="mt-1.5 text-[13.5px] text-muted">Not configured</p>
        )}
      </div>
    </div>
  );
}

function TopUpActions({ state, post }: { state: LabState; post: Post }) {
  const mc = state.merchant;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-review/30 bg-review-soft px-4 py-3">
      <span className="text-[13.5px] text-ink">
        Add <b className="font-semibold">₹{mc.rules.topup_inr}</b> for the remaining creatives?
      </span>
      <span className="ml-auto flex gap-2">
        <Button size="sm" variant="primary" onClick={() => void post("/api/lab/design", { action: "topup" })}>
          Top up ₹{mc.rules.topup_inr}
        </Button>
        <Button size="sm" onClick={() => void post("/api/lab/design", { action: "stop" })}>
          Stop here
        </Button>
      </span>
    </div>
  );
}

function Gallery({ state }: { state: LabState }) {
  const mc = state.merchant;
  const byId = new Map(mc.creatives.map((c) => [c.id, c]));
  return (
    <div className="mt-8">
      <div className="mb-3 flex items-center gap-2">
        <span className="kicker">Creatives for {mc.brief.client}</span>
        <span className="font-mono text-[11.5px] text-faint">
          {mc.creatives.filter((c) => c.status === "paid").length}/{mc.brief.creatives.length}
        </span>
      </div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {mc.brief.creatives.map((b) => {
          const c = byId.get(b.id);
          return (
            <figure key={b.id} className="overflow-hidden rounded-md border border-line bg-surface">
              <div className="grid aspect-square place-items-center bg-subtle">
                {c?.status === "paid" && c.src ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={c.src} alt={b.title} className="h-full w-full object-cover" />
                ) : (
                  <span className={`px-3 text-center text-[12.5px] ${c?.status === "denied" || c?.status === "failed" ? "text-deny" : "text-faint"}`}>
                    {c?.status === "denied" ? "Not bought: budget used up" : c?.status === "failed" ? "Failed" : c ? "No image returned" : "Not started"}
                  </span>
                )}
              </div>
              <figcaption className="flex items-center gap-2 px-3 py-2 text-[12.5px]">
                <span className="min-w-0 flex-1 truncate font-medium text-ink">{b.title}</span>
                {c?.status === "paid" && c.amount && <span className="font-mono text-[11.5px] text-muted">{rupees(Number(c.amount), state)}</span>}
                {c?.transaction && (
                  <a href={`${mc.explorer}/tx/${c.transaction}`} target="_blank" rel="noreferrer" className="font-mono text-[11.5px] text-accent hover:underline">
                    tx ↗
                  </a>
                )}
              </figcaption>
            </figure>
          );
        })}
      </div>
    </div>
  );
}

function Explain({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="kicker">{label}</div>
      <p className="mt-1.5 text-[14.5px] leading-relaxed text-body">{children}</p>
    </div>
  );
}

function Banner({ tone, children, action }: { tone: "info" | "bad"; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div
      className={`mt-4 flex flex-wrap items-center gap-3 rounded-md border px-4 py-2.5 text-[13.5px] ${tone === "bad" ? "border-deny/25 bg-deny-soft text-deny" : "border-accent/20 bg-accent-soft text-accent"}`}
    >
      <span className="flex-1">{children}</span>
      {action}
    </div>
  );
}

function NewMandate({ post }: { post: Post }) {
  return (
    <Button size="sm" variant="primary" onClick={() => void post("/api/lab/mandate", { action: "new" })}>
      Issue a new mandate
    </Button>
  );
}

function ReviewActions({ state, post }: { state: LabState; post: Post }) {
  const d = state.pendingReviews[0];
  if (!d?.review) return null;
  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-md border border-review/30 bg-review-soft px-4 py-3">
      <span className="text-[13.5px] text-ink">
        <b className="font-semibold">{d.request.amount} USDC</b> for {d.request.category} · <span className="font-mono text-[12px] text-muted">{d.review.review}</span>
      </span>
      <span className="ml-auto flex gap-2">
        <Button size="sm" variant="primary" onClick={() => void post("/api/lab/review", { review: d.review!.review, action: "approve" })}>
          Approve
        </Button>
        <Button size="sm" variant="danger" onClick={() => void post("/api/lab/review", { review: d.review!.review, action: "deny" })}>
          Deny
        </Button>
      </span>
    </div>
  );
}

const WHO: Record<Actor, { label: string; cls: string }> = {
  agent: { label: "Agent", cls: "bg-ink/[0.06] text-ink" },
  saifuro: { label: "Saifuro", cls: "bg-accent-soft text-accent" },
  seller: { label: "Seller", cls: "border border-line-strong bg-surface text-body" },
  you: { label: "You", cls: "bg-review-soft text-review" },
  merchant: { label: "BlockRun", cls: "border border-line-strong bg-surface text-body" },
  operator: { label: "Operator", cls: "bg-review-soft text-review" },
  attacker: { label: "Attacker", cls: "bg-deny-soft text-deny" },
};

const NODE_DONE: Record<Tone, string> = {
  ok: "border-allow bg-allow text-white",
  warn: "border-review bg-review text-white",
  bad: "border-deny bg-deny text-white",
  info: "border-ink bg-ink text-white",
  neutral: "border-ink bg-ink text-white",
};

/** The outcome colour of a step: its most decisive event. */
function outcome(events: Msg[]): Tone {
  const tones = events
    .filter((e) => e.role === "step")
    .map((e) => e.tone ?? "info")
    .reverse();
  return tones.find((t) => t !== "info") ?? "info";
}

function PhaseRow({ phase, n, last, status, events, action }: { phase: Phase; n: number; last: boolean; status: PhaseStatus; events: Msg[]; action: React.ReactNode }) {
  const tone = outcome(events);
  const node =
    status === "done"
      ? NODE_DONE[tone]
      : status === "active"
        ? "border-review bg-surface text-review ring-4 ring-review/15"
        : status === "waiting"
          ? "border-review bg-review-soft text-review ring-4 ring-review/15"
          : status === "skipped"
            ? "border-dashed border-line-strong bg-surface text-faint"
            : "border-line-strong bg-surface text-faint";
  const icon = status === "done" ? (tone === "bad" ? "✕" : tone === "warn" ? "!" : "✓") : status === "skipped" ? "–" : n;
  const who = WHO[phase.who];

  return (
    <div className="grid grid-cols-[2rem_1fr] gap-x-4">
      <div className="flex flex-col items-center">
        <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full border-2 font-mono text-[12.5px] font-semibold transition ${node}`}>{icon}</span>
        {!last && <span className={`w-0.5 flex-1 ${status === "done" ? "bg-ink/25" : "bg-line"}`} />}
      </div>
      <div className={`min-w-0 ${last ? "pb-1" : "pb-7"}`}>
        <div className="flex min-h-8 flex-wrap items-center gap-x-2.5 gap-y-1">
          <span className={`rounded px-2 py-[3px] text-[11.5px] font-medium leading-none ${who.cls}`}>{who.label}</span>
          <span className={`text-[15.5px] font-semibold tracking-[-0.01em] ${status === "pending" || status === "skipped" ? "text-body" : "text-ink"}`}>{phase.title}</span>
          <StatusNote status={status} optional={phase.optional} />
        </div>
        <p className={`mt-1 max-w-[72ch] text-[14px] leading-relaxed ${status === "skipped" ? "text-faint" : "text-body"}`}>{phase.explain}</p>
        {events.length > 0 && <Events events={events} />}
        {action}
      </div>
    </div>
  );
}

function StatusNote({ status, optional }: { status: PhaseStatus; optional?: boolean }) {
  if (status === "active")
    return (
      <span className="flex items-center gap-1.5 text-[12px] font-medium text-review">
        <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-review" />
        in progress
      </span>
    );
  if (status === "waiting") return <span className="text-[12px] font-medium text-review">waiting for you</span>;
  if (status === "skipped") return <span className="text-[12px] text-faint">{optional ? "skipped: reused an earlier purchase" : "didn't happen"}</span>;
  return null;
}

function Events({ events }: { events: Msg[] }) {
  const [all, setAll] = useState(false);
  const many = events.length > 5;
  const shown = many && !all ? events.slice(-3) : events;
  const counts = many ? Object.entries(events.reduce<Record<string, number>>((acc, e) => ({ ...acc, [e.tag ?? e.role]: (acc[e.tag ?? e.role] ?? 0) + 1 }), {})) : [];

  return (
    <div className="mt-3 max-w-[760px] space-y-2">
      {many && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px] text-muted">
          {counts.map(([t, c]) => (
            <Pill key={t} mono tone={t === "allow" || t === "settled" || t === "served" ? "ok" : t.startsWith("deny") || t === "stopped" ? "bad" : "neutral"}>
              {t} ×{c}
            </Pill>
          ))}
          <button onClick={() => setAll((a) => !a)} className="font-medium text-accent hover:underline">
            {all ? "Show fewer" : `Show all ${events.length}`}
          </button>
        </div>
      )}
      <div className="divide-y divide-line overflow-hidden rounded-md border border-line">
        {shown.map((e) => (
          <EventRow key={e.id} e={e} />
        ))}
      </div>
    </div>
  );
}

function EventRow({ e }: { e: Msg }) {
  if (e.role === "agent")
    return (
      <div className="flex items-start gap-2 bg-surface px-4 py-3 text-[14px] leading-relaxed text-ink">
        <span className="whitespace-pre-wrap">{e.text}</span>
        {e.detail && <InfoTip content={e.detail} />}
      </div>
    );
  return (
    <div className="grid grid-cols-[4rem_auto_1fr] items-center gap-x-3 bg-surface px-3.5 py-2 text-[13px]">
      <span className="font-mono text-[11.5px] text-faint">{time(e.at)}</span>
      {e.role === "note" ? (
        <Pill tone={e.tone === "warn" ? "warn" : "neutral"}>note</Pill>
      ) : (
        <Pill tone={e.tone ?? "info"} mono className="min-w-[3.25rem] justify-center">
          {e.tag ?? "step"}
        </Pill>
      )}
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 text-body">
        <span className="min-w-0 break-words">{e.text}</span>
        {e.link && (
          <a href={e.link.href} target="_blank" rel="noreferrer" className="shrink-0 font-mono text-accent hover:underline">
            {e.link.label} ↗
          </a>
        )}
        {e.detail && <InfoTip content={e.detail} />}
      </span>
    </div>
  );
}

function AskView({ state, post }: { state: LabState; post: Post }) {
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
    <div className="flex h-full min-h-[420px] flex-col">
      <div className="border-b border-line px-7 py-5">
        <div className="kicker">Free-form</div>
        <h3 className="mt-1.5 text-[22px] font-semibold tracking-[-0.02em] text-ink">Ask the agent</h3>
        <p className="mt-1 text-[14px] text-body">The model decides what to buy. The mandate decides whether it may pay. Below is the full activity log, scenarios included.</p>
      </div>
      <div ref={scroller} className="scroll-thin min-h-0 flex-1 space-y-2.5 overflow-y-auto px-7 py-5">
        {count === 0 ? (
          <p className="pt-10 text-center text-[14px] text-muted">Nothing yet. Ask something the agent has to pay to answer.</p>
        ) : (
          state.messages.map((msg) => <Line key={msg.id} m={msg} />)
        )}
      </div>
      <form
        className="border-t border-line px-7 py-4"
        onSubmit={(e) => {
          e.preventDefault();
          void ask(prompt);
        }}
      >
        {state.status.ai.enabled && (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {SUGGESTIONS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => void ask(s)}
                disabled={!!state.busy}
                className="rounded-full border border-line px-3 py-1 text-[12.5px] text-body transition hover:border-faint hover:text-ink disabled:opacity-40"
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
    </div>
  );
}

const NOTE_BORDER: Record<string, string> = { ok: "border-allow", warn: "border-review", bad: "border-deny", info: "border-line-strong" };

function Line({ m }: { m: Msg }) {
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
  return (
    <div className="slide-in grid grid-cols-[3.75rem_auto_1fr] items-center gap-x-2.5 text-[12.5px]">
      <span className="font-mono text-[11.5px] text-faint">{time(m.at)}</span>
      <Pill tone={m.tone ?? "info"} mono className="min-w-[3.25rem] justify-center">
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
