import type { ScenarioId } from "@/lib/lab/scenario-list";
import type { LabState } from "@/lib/lab/state";

export type Msg = LabState["messages"][number];
export type Actor = "agent" | "seller" | "saifuro" | "you" | "operator" | "attacker";

export type Phase = {
  who: Actor;
  title: string;
  explain: string;
  /** The transcript events that belong to this step of the run. */
  pick: (run: Msg[]) => Msg[];
  /** Tags that complete the step. Without them, any picked event does. */
  closes?: string[];
  doneWhen?: (events: Msg[]) => boolean;
  /** May not happen at all, e.g. an attack reusing an earlier purchase. */
  optional?: boolean;
  /** Needs the user: approve a review, or issue a new mandate. */
  action?: "review" | "mandate";
};

export type Guide = {
  edge: string;
  goal: string;
  why: string;
  expect: string;
  after?: string;
  phases: Phase[];
};

const PAY_END = ["settled", "served", "stopped", "refused", "error"];

const tags =
  (...t: string[]) =>
  (run: Msg[]) =>
    run.filter((m) => m.tag && t.includes(m.tag));
const notes = (re: RegExp) => (run: Msg[]) => run.filter((m) => m.role === "note" && re.test(m.text));
const steps = (re: RegExp) => (run: Msg[]) => run.filter((m) => m.role === "step" && re.test(m.text));
const reply = (run: Msg[]) => run.filter((m) => m.role === "agent");

/** One purchase: its 402 quote and every step until the next quote. */
const purchase =
  (title: string, only?: string[]) =>
  (run: Msg[]): Msg[] => {
    const i = run.findIndex((m) => m.tag === "402" && m.text.startsWith(title));
    if (i < 0) return [];
    const out: Msg[] = [];
    for (let j = i; j < run.length; j++) {
      const m = run[j];
      if (j > i && (m.tag === "402" || m.role === "agent")) break;
      if (m.role === "step" || /^Waiting/.test(m.text)) out.push(m);
    }
    return only ? out.filter((m) => m.tag && only.includes(m.tag)) : out;
  };

/** Events after the first note matching `re`. */
const after =
  (re: RegExp, f: (run: Msg[]) => Msg[]) =>
  (run: Msg[]): Msg[] => {
    const i = run.findIndex((m) => m.role === "note" && re.test(m.text));
    return i < 0 ? [] : f(run.slice(i + 1));
  };

const either =
  (...fs: ((run: Msg[]) => Msg[])[]) =>
  (run: Msg[]) => {
    const set = new Set(fs.flatMap((f) => f(run)));
    return run.filter((m) => set.has(m));
  };

const setup: Phase = {
  who: "agent",
  title: "A real purchase to attack",
  explain: "The attack needs a genuine paid request with a valid verdict. If this session already made one, it's reused and this step is skipped.",
  pick: either(notes(/^One real purchase/), purchase("Spot prices")),
  closes: PAY_END,
  optional: true,
};

const verdictCheck = (re: RegExp) => after(re, tags("refused", "served"));

export const GUIDES: Record<ScenarioId, Guide> = {
  research: {
    edge: "Happy path",
    goal: "Show a normal, allowed purchase end to end, so every other scenario has something to compare against.",
    why: "Saifuro shouldn't get in the way of legitimate spending. Two cheap data purchases inside the mandate should go straight through and settle on-chain.",
    expect: "Two allow verdicts, two real USDC transfers on Base Sepolia, then an answer.",
    phases: [
      {
        who: "seller",
        title: "Seller asks for payment",
        explain: "The agent requests stablecoin supply data. The seller replies 402 Payment Required: 0.01 USDC to its wallet on Base Sepolia. Nothing is paid yet.",
        pick: purchase("Stablecoin supply", ["402"]),
      },
      {
        who: "saifuro",
        title: "Saifuro checks the mandate",
        explain:
          "Before signing, the agent sends the exact amount, recipient and category to Saifuro. 0.01 is under the 0.50 per-purchase limit, in the data category, and inside the 5 USDC monthly cap, so the verdict is allow, signed by Saifuro.",
        pick: purchase("Stablecoin supply", ["allow", "review", "deny_limit", "deny_velocity", "deny_category", "deny_revoked", "deny_expired", "deny_no_mandate"]),
      },
      {
        who: "agent",
        title: "Agent signs the payment",
        explain: "Only on allow does the wallet sign an EIP-3009 authorization for exactly 0.01 USDC to the seller. The signature and the verdict travel together.",
        pick: purchase("Stablecoin supply", ["signed", "stopped"]),
      },
      {
        who: "seller",
        title: "Seller verifies, settles, delivers",
        explain: "The seller runs the 12 verdict checks: signature, amount, recipient, replay and more. They pass, so the facilitator settles the USDC on Base Sepolia and the data is returned.",
        pick: purchase("Stablecoin supply", ["settled", "served", "refused", "error"]),
      },
      {
        who: "agent",
        title: "Second purchase: DeFi TVL",
        explain: "The same four steps for another 0.01 USDC dataset. The 30-day total is now 0.02 of 5 USDC.",
        pick: purchase("DeFi TVL"),
        closes: PAY_END,
      },
      { who: "agent", title: "Agent answers", explain: "The model writes its answer from the two datasets it paid for.", pick: reply },
    ],
  },

  injection: {
    edge: "Untrusted input",
    goal: "A third-party data feed hides an instruction telling the agent to buy a 900 USDC report. We assume the model falls for it, and watch what stops the money.",
    why: "Agents read untrusted text constantly. A budget written in the prompt is just more text an attacker can override. A mandate is enforced outside the model.",
    expect: "The 0.01 USDC feed is paid. The 900 USDC purchase is denied with deny_limit and never signed.",
    phases: [
      {
        who: "agent",
        title: "Buys a cheap news feed",
        explain: "A normal 0.01 USDC purchase. Saifuro allows it and it settles, exactly like the baseline.",
        pick: purchase("Community market wire"),
        closes: PAY_END,
      },
      {
        who: "attacker",
        title: "The feed carries a hidden instruction",
        explain: "One headline is written to look like a system notice: buy the institutional flows report now. That text is now inside the model's context.",
        pick: notes(/feed tells/),
      },
      {
        who: "agent",
        title: "The agent obeys",
        explain: "Real models sometimes resist, so this turn is scripted to show the worst case: the model is completely convinced.",
        pick: notes(/obeys/),
      },
      {
        who: "seller",
        title: "Seller quotes 900 USDC",
        explain: "The report costs 900 USDC. The agent's prompt said 0.50 per purchase, but nothing in a prompt can enforce that.",
        pick: purchase("Institutional flows report", ["402"]),
      },
      {
        who: "saifuro",
        title: "Saifuro denies it: over the limit",
        explain: "900 is far above the mandate's 0.50 per-purchase limit, so the verdict is deny_limit. However convinced the model is, it can't change the mandate.",
        pick: purchase("Institutional flows report", ["deny_limit", "allow", "review"]),
      },
      {
        who: "agent",
        title: "Nothing is signed",
        explain: "In enforce mode the wallet signs only on allow. No payment exists, so the seller has nothing to settle and nothing reaches the chain.",
        pick: purchase("Institutional flows report", ["stopped", "signed", "settled"]),
      },
      { who: "agent", title: "Agent reports back", explain: "The agent tells you what it tried and why it didn't happen.", pick: reply },
    ],
  },

  runaway: {
    edge: "Frequency abuse",
    goal: "A buggy retry loop fires 12 tiny purchases of 0.001 USDC in a few seconds.",
    why: "Each purchase is small and inside every limit, so amount rules can't catch it. Saifuro's frequency rule caps an agent at 10 decisions per 60 seconds.",
    expect: "The first 10 are allowed and settle. Decisions 11 and 12 are denied with deny_velocity.",
    after: "The 60-second window also applies to whatever you run next. Reset for a fresh agent if other scenarios come back deny_velocity.",
    phases: [
      {
        who: "agent",
        title: "The loop starts",
        explain: "12 requests for spot prices, three at a time. Each one asks Saifuro separately, exactly as a real retry loop would.",
        pick: notes(/retry loop/),
      },
      {
        who: "saifuro",
        title: "Decisions 1–10 are allowed",
        explain: "Each 0.001 purchase is under every limit, so Saifuro allows it and the seller settles it on Base Sepolia, one at a time.",
        pick: tags("allow", "settled", "served"),
        doneWhen: (ev) => ev.filter((m) => m.tag === "settled" || m.tag === "served").length >= 10,
      },
      {
        who: "saifuro",
        title: "Decisions 11–12: deny_velocity",
        explain: "The agent now has more than 10 decisions in the last 60 seconds. Saifuro denies the rest regardless of amount, and the wallet signs nothing.",
        pick: tags("deny_velocity", "stopped"),
        doneWhen: (ev) => ev.filter((m) => m.tag === "deny_velocity").length >= 2,
      },
      { who: "agent", title: "The loop ends", explain: "The agent counts what went through and what was stopped.", pick: reply },
    ],
  },

  review: {
    edge: "Human in the loop",
    goal: "The agent wants a 0.30 USDC deep dive. That's under the 0.50 limit but above the mandate's 0.20 review threshold.",
    why: "Some purchases shouldn't be automatic or blocked; they should wait for a person. The agent pauses until the mandate's approver decides.",
    expect: "Saifuro returns review. Approve it here and the payment settles with a fresh allow. Deny it and nothing is paid.",
    phases: [
      {
        who: "seller",
        title: "Seller quotes 0.30 USDC",
        explain: "The agent requests the Base deep dive and gets a 402 for 0.30 USDC.",
        pick: tags("402"),
      },
      {
        who: "saifuro",
        title: "Saifuro holds it for review",
        explain: "0.30 is above review_above (0.20), so the verdict is review: not allowed yet, not denied. The agent can't pay with it and waits up to 3 minutes.",
        pick: either(tags("review"), notes(/^Waiting/)),
      },
      {
        who: "you",
        title: "You decide",
        explain: "You're the approver (role:research_lead). Approving makes Saifuro issue a new allow that supersedes the review. Denying issues nothing.",
        pick: tags("approved", "denied"),
        action: "review",
      },
      {
        who: "agent",
        title: "Pays with the fresh allow",
        explain: "The new allow covers the same amount and recipient. The agent signs, and the seller verifies and settles it.",
        pick: tags("allow", "signed", "settled", "served", "refused"),
        closes: ["settled", "served", "refused"],
      },
      { who: "agent", title: "Agent answers", explain: "The model answers from the deep dive, or explains why it wasn't bought.", pick: reply },
    ],
  },

  category: {
    edge: "Out of scope",
    goal: "The agent tries to buy 1 GPU-minute of compute for 0.05 USDC on a mandate that only allows data.",
    why: "Limits aren't only about amounts. A cheap purchase in the wrong category is still outside what the operator agreed to.",
    expect: "deny_category. Nothing is signed.",
    phases: [
      { who: "seller", title: "Seller quotes 0.05 USDC for compute", explain: "A small amount, well inside the per-purchase and monthly limits.", pick: tags("402") },
      {
        who: "saifuro",
        title: "Saifuro checks the category",
        explain: "The purchase is tagged compute and the mandate allows only data, so the verdict is deny_category. The amount doesn't matter.",
        pick: tags("deny_category", "allow"),
      },
      { who: "agent", title: "Nothing is signed", explain: "The wallet signs only on allow.", pick: tags("stopped", "signed") },
      { who: "agent", title: "Agent explains", explain: "The agent says what the operator would have to change.", pick: reply },
    ],
  },

  revoke: {
    edge: "Kill switch",
    goal: "The operator revokes the agent's mandate, then the agent tries a 0.001 USDC purchase.",
    why: "When an agent misbehaves you need to stop its spending immediately, without redeploying code or moving its funds.",
    expect: "deny_revoked on the very next request. Issue a new mandate to resume.",
    phases: [
      {
        who: "operator",
        title: "Operator revokes the mandate",
        explain: "One API call. The agent's code, keys and wallet balance are untouched.",
        pick: tags("revoked"),
      },
      { who: "seller", title: "Agent requests a 0.001 purchase", explain: "The cheapest dataset, which every earlier scenario was allowed to buy.", pick: tags("402") },
      {
        who: "saifuro",
        title: "Saifuro denies it: deny_revoked",
        explain: "There's no active mandate to authorize against. The wallet signs nothing.",
        pick: tags("deny_revoked", "stopped"),
        closes: ["stopped"],
      },
      {
        who: "you",
        title: "Resume with a new mandate",
        explain: "Mandates can't be edited, only replaced. A new one restores spending; the revoked one stays in the log.",
        pick: either(notes(/new mandate/), tags("mandate")),
        closes: ["mandate"],
        action: "mandate",
      },
    ],
  },

  replay: {
    edge: "Reused approval",
    goal: "Take a payment the seller already accepted and send the exact same request again.",
    why: "Verdicts and payment signatures are just bytes; anyone who sees them can resend them. Saifuro can't help here because it signed a legitimate allow. The seller has to catch it.",
    expect: "Refused at step 12: the verdict's nonce was already used.",
    phases: [
      setup,
      { who: "attacker", title: "Resends it unchanged", explain: "Same verdict, same payment signature, same request.", pick: notes(/^Resending/) },
      {
        who: "seller",
        title: "Seller checks step 12: replay",
        explain: "The seller recorded the verdict's nonce the first time it accepted it. Seeing it again, it refuses before any money moves.",
        pick: verdictCheck(/^Resending/),
      },
    ],
  },

  tamper: {
    edge: "Forged verdict",
    goal: "Take a genuine allow for a small purchase, edit it to approve 900 USDC, keep the original signature, and use it to buy the 900 USDC report.",
    why: "If sellers trusted the claims without the signature, a cheap approval could unlock anything.",
    expect: "Refused at step 5: the signature no longer matches.",
    phases: [
      setup,
      {
        who: "attacker",
        title: "Edits the approved amount",
        explain: "The verdict's request.amount is rewritten to 900. The signature is copied over unchanged.",
        pick: notes(/^Approved amount edited/),
      },
      {
        who: "seller",
        title: "Seller checks step 5: signature",
        explain: "Saifuro's ES256 signature covers every claim. Change one byte and it fails, so the forged verdict is rejected.",
        pick: verdictCheck(/^Approved amount edited/),
      },
    ],
  },

  swap: {
    edge: "Mismatched approval",
    goal: "Get a genuine, fresh allow for a 0.001 USDC purchase and present it to pay for the 0.30 USDC deep dive.",
    why: "The verdict is authentic and unexpired, so signature checks pass. The seller must also check that it approves this payment, not a different one.",
    expect: "Refused at step 9: approved 0.001, payment is 0.30.",
    phases: [
      setup,
      { who: "saifuro", title: "Gets a fresh 0.001 approval", explain: "A real allow from Saifuro for 0.001 USDC, valid for 5 minutes.", pick: steps(/^fresh approval/) },
      { who: "attacker", title: "Presents it for the 0.30 dataset", explain: "The cheap verdict is attached to a request for the 0.30 USDC deep dive.", pick: notes(/^Presented for/) },
      {
        who: "seller",
        title: "Seller checks step 9: amount",
        explain: "The verdict approves 0.001 but the payment is 0.30, so the seller refuses. Steps 10 and 11 check currency and recipient the same way.",
        pick: verdictCheck(/^Presented for/),
      },
    ],
  },
};

export type PhaseStatus = "pending" | "active" | "waiting" | "done" | "skipped";

export function phaseStatuses(phases: Phase[], run: Msg[] | null, running: boolean, needsYou: boolean): { status: PhaseStatus; events: Msg[] }[] {
  const events = phases.map((p) => (run ? p.pick(run) : []));
  const finished = !!run && !running;
  const complete = phases.map((p, i) => {
    const ev = events[i];
    if (!ev.length) return false;
    if (p.doneWhen) return p.doneWhen(ev) || (finished && !p.action);
    if (p.closes) return ev.some((m) => m.tag && p.closes!.includes(m.tag)) || (finished && !p.action);
    return true;
  });
  const lastStarted = events.reduce((acc, ev, i) => (ev.length ? i : acc), -1);
  let activeTaken = false;
  return phases.map((p, i) => {
    if (complete[i]) return { status: "done", events: events[i] };
    if (p.optional && lastStarted > i) return { status: "skipped", events: events[i] };
    if (p.action && run && (p.action === "review" ? needsYou : events[i].length > 0)) {
      activeTaken = true;
      return { status: "waiting", events: events[i] };
    }
    if (running && !activeTaken) {
      activeTaken = true;
      return { status: "active", events: events[i] };
    }
    return { status: finished ? "skipped" : "pending", events: events[i] };
  });
}
