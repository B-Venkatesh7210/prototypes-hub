import { LIMITS } from "@/lib/limits";
import { GradiumError, isLive } from "./gradium/config";
import { logSpend, primeBalance } from "./ledger";

/**
 * Per-visitor quotas for live mode. In-memory on purpose: this is a demo server, and a restart
 * resetting the counters is fine. Mock mode never spends credits, so nothing is counted there.
 */
type Visitor = { day: string; credits: number; events: Record<string, number[]> };

const store = ((globalThis as { __gradiumQuota?: Map<string, Visitor> }).__gradiumQuota ??= new Map());

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function today() {
  return new Date().toISOString().slice(0, 10);
}

function visitorId(req: Request): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0].trim() || req.headers.get("x-real-ip") || "local";
}

function visitor(req: Request): Visitor {
  const id = visitorId(req);
  const day = today();
  let v = store.get(id);
  if (!v || v.day !== day) {
    v = { day, credits: 0, events: v?.events ?? {} };
    store.set(id, v);
  }
  return v;
}

/** Rejects the request if it would push this visitor past the daily credit budget. */
export function guardCredits(req: Request, estimate: number) {
  if (!isLive()) return;
  primeBalance();
  const v = visitor(req);
  if (v.credits + estimate > LIMITS.dailyCredits) {
    throw new GradiumError(
      `This demo allows ${LIMITS.dailyCredits.toLocaleString()} Gradium credits per visitor per day, and this request would go over. Try again tomorrow.`,
      429,
    );
  }
}

/** Counts a live call against the visitor's budget and logs it, checked against the Gradium balance. */
export function spend(req: Request, credits: number, op: string, opts?: { reconcile?: boolean }) {
  if (!isLive()) return;
  const v = visitor(req);
  v.credits += credits;
  logSpend(op, credits, Math.max(0, LIMITS.dailyCredits - v.credits), opts);
}

function take(req: Request, key: string, max: number, windowMs: number, message: string) {
  if (!isLive()) return;
  primeBalance();
  const v = visitor(req);
  const now = Date.now();
  const recent = (v.events[key] ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new GradiumError(message, 429);
  v.events[key] = [...recent, now];
}

export const quota = {
  clone: (req: Request) =>
    take(req, "clone", LIMITS.clonesPerDay, DAY, `The demo allows ${LIMITS.clonesPerDay} voice clones per day. Reuse a voice you already cloned.`),
  design: (req: Request) =>
    take(req, "design", LIMITS.designsPerDay, DAY, `The demo allows ${LIMITS.designsPerDay} voice designs per day.`),
  liveSession: (req: Request) =>
    take(
      req,
      "live",
      LIMITS.liveSessionsPerHour,
      HOUR,
      `The demo allows ${LIMITS.liveSessionsPerHour} live sessions per hour. Use the free browser engine meanwhile.`,
    ),
};
