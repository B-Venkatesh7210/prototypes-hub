import "server-only";
import { importJWK, SignJWT } from "jose";
import { fromUnits, toUnits } from "@/kit/verdict/decimal.ts";
import { hex, type DecisionRecord, type EmulatorState, type MandateRecord, type Verdict } from "./store";

const DAY = 86_400_000;
const VERDICT_TTL_S = 300;
const VELOCITY_LIMIT = 10;
const VELOCITY_WINDOW_MS = 60_000;
const REVIEW_TTL_MS = DAY;

type Request = DecisionRecord["request"];
type Outcome = { verdict: Verdict; reason: string; mandate?: MandateRecord };

/** Amounts are compared in integer millionths, never as floats. */
const units = (n: number) => toUnits(String(n), 6);
/** "720.00", "0.005": the way the docs write reasons. */
export const fmtAmount = (n: number | bigint) => {
  const s = typeof n === "bigint" ? fromUnits(n, 6) : fromUnits(units(n), 6);
  const [i, f = ""] = s.split(".");
  return `${i}.${f.padEnd(2, "0")}`;
};

export function isExpired(m: MandateRecord, now: number) {
  return now >= Date.parse(`${m.expires}T00:00:00Z`);
}

function allowedUnder(state: EmulatorState, mandate: string, since: number): bigint {
  return state.decisions
    .filter((d) => d.mandate === mandate && d.verdict === "allow" && Date.parse(d.issued_at) >= since)
    .reduce((sum, d) => sum + units(d.request.amount), BigInt(0));
}

function evaluateMandate(state: EmulatorState, m: MandateRecord, req: Request, now: number, recent: number): Outcome {
  if (m.status === "revoked") return { verdict: "deny_revoked", reason: `mandate ${m.mandate} was revoked at ${m.revoked_at}`, mandate: m };
  if (isExpired(m, now)) return { verdict: "deny_expired", reason: `mandate ${m.mandate} expired on ${m.expires}`, mandate: m };
  if (!m.categories.includes(req.category)) {
    return { verdict: "deny_category", reason: `category ${req.category} is not allowed by mandate ${m.mandate} (allowed: ${m.categories.join(", ")})`, mandate: m };
  }
  const amount = units(req.amount);
  if (amount > units(m.limits.per_transaction)) {
    return { verdict: "deny_limit", reason: `amount ${fmtAmount(req.amount)} exceeds per_transaction limit ${fmtAmount(m.limits.per_transaction)}`, mandate: m };
  }
  if (m.limits.per_month !== undefined) {
    const total = allowedUnder(state, m.mandate, now - 30 * DAY) + amount;
    if (total > units(m.limits.per_month)) {
      return { verdict: "deny_limit", reason: `30-day total ${fmtAmount(total)} would exceed per_month limit ${fmtAmount(m.limits.per_month)}`, mandate: m };
    }
  }
  if (recent >= VELOCITY_LIMIT) return { verdict: "deny_velocity", reason: `agent ${req.agent} already had ${recent} decisions in the last 60 seconds`, mandate: m };
  if (m.review_above !== undefined && amount > units(m.review_above)) {
    return { verdict: "review", reason: `amount ${fmtAmount(req.amount)} is above review_above ${fmtAmount(m.review_above)}`, mandate: m };
  }
  return { verdict: "allow", reason: `within mandate ${m.mandate}`, mandate: m };
}

/** Evaluation order and multi-mandate selection follow draft-dias-agent-payment-verdicts §4.5. */
export function evaluate(state: EmulatorState, req: Request, now: number): Outcome {
  const agent = state.agents.find((a) => a.agent === req.agent);
  if (!agent || agent.status !== "active") return { verdict: "deny_no_mandate", reason: `agent ${req.agent} is disabled` };
  const mandates = state.mandates.filter((m) => m.agent === req.agent && m.limits.currency === req.currency);
  if (mandates.length === 0) return { verdict: "deny_no_mandate", reason: `agent ${req.agent} holds no mandate in ${req.currency}` };
  const recent = state.decisions.filter((d) => d.request.agent === req.agent && Date.parse(d.issued_at) > now - VELOCITY_WINDOW_MS).length;
  const outcomes = mandates.map((m) => evaluateMandate(state, m, req, now, recent));
  return outcomes.find((o) => o.verdict === "allow") ?? outcomes.find((o) => o.verdict === "review") ?? outcomes[0];
}

async function sign(state: EmulatorState, d: DecisionRecord, iat: number): Promise<string> {
  const key = await importJWK(state.signingKey, "ES256");
  const claims: Record<string, unknown> = {
    iss: state.issuer,
    jti: d.decision,
    iat,
    exp: iat + VERDICT_TTL_S,
    verdict: d.verdict,
    ...(d.mandate ? { mandate: d.mandate } : {}),
    policy_version: d.policy_version,
    nonce: d.nonce,
    request: d.request,
    ...(d.supersedes ? { supersedes: d.supersedes } : {}),
  };
  return new SignJWT(claims).setProtectedHeader({ alg: "ES256", typ: "JWT", kid: state.kid }).sign(key);
}

export async function decide(
  state: EmulatorState,
  req: Request,
  extra: { metadata?: Record<string, string>; protocol?: string; supersedes?: string; outcome?: Outcome },
): Promise<DecisionRecord> {
  const now = Date.now();
  const outcome = extra.outcome ?? evaluate(state, req, now);
  const iat = Math.floor(now / 1000);
  const d: DecisionRecord = {
    decision: `dec_${hex(6)}`,
    request: req,
    verdict: outcome.verdict,
    reason: outcome.reason,
    ...(outcome.mandate ? { mandate: outcome.mandate.mandate } : {}),
    policy_version: state.policyVersion,
    nonce: `n_${hex(8)}`,
    mode: state.mode,
    issued_at: new Date(iat * 1000).toISOString(),
    ...(outcome.verdict === "allow" ? { expires_at: new Date((iat + VERDICT_TTL_S) * 1000).toISOString() } : {}),
    verdict_token: "",
    ...(extra.supersedes ? { supersedes: extra.supersedes } : {}),
    ...(extra.metadata ? { metadata: extra.metadata } : {}),
    ...(extra.protocol ? { protocol: extra.protocol } : {}),
  };
  if (d.verdict === "review" && outcome.mandate) {
    const review = `rev_${hex(4)}`;
    const expires_at = new Date(now + REVIEW_TTL_MS).toISOString();
    d.review = { review, waits_for: outcome.mandate.principal, expires_at };
    state.reviews.push({ review, decision: d.decision, status: "pending", created_at: d.issued_at, expires_at });
  }
  // Recorded before the await so concurrent requests see it in their velocity and 30-day totals.
  state.decisions.push(d);
  d.verdict_token = await sign(state, d, iat);
  return d;
}

/** The re-checks an approval runs before it issues a fresh allow (Authorizations › Reviews). */
export function approvalBlocker(state: EmulatorState, original: DecisionRecord, now: number): string | null {
  const agent = state.agents.find((a) => a.agent === original.request.agent);
  if (!agent || agent.status !== "active") return `agent ${original.request.agent} is not active`;
  const m = state.mandates.find((x) => x.mandate === original.mandate);
  if (!m) return "mandate not found";
  if (m.status === "revoked") return `mandate ${m.mandate} was revoked`;
  if (isExpired(m, now)) return `mandate ${m.mandate} expired on ${m.expires}`;
  if (m.limits.per_month !== undefined) {
    const total = allowedUnder(state, m.mandate, now - 30 * DAY) + units(original.request.amount);
    if (total > units(m.limits.per_month)) return `30-day total ${fmtAmount(total)} would exceed per_month limit ${fmtAmount(m.limits.per_month)}`;
  }
  return null;
}

export function publicDecision(d: DecisionRecord) {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { protocol, ...rest } = d;
  return rest;
}
