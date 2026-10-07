import type { AccountCredits } from "@/lib/types";
import { credits } from "./gradium";
import { isLive } from "./gradium/config";

/**
 * Logs every credit-spending call to the server console and checks it against the real Gradium
 * balance. Calls that land close together are settled as one batch, because the balance can only
 * show their combined cost.
 */
type Pending = { op: string; estimate: number };
type State = { balance?: number; pending: Pending[]; timer?: ReturnType<typeof setTimeout> };

const state = ((globalThis as { __gradiumLedger?: State }).__gradiumLedger ??= { pending: [] });

/** Gradium bills after a call finishes; give it a moment before reading the balance. */
const SETTLE_MS = 2500;
const TAG = "\x1b[36m[credits]\x1b[0m";
const fmt = (n: number) => n.toLocaleString("en-US");

export async function accountBalance(): Promise<AccountCredits | null> {
  const account = await credits();
  if (account && !state.pending.length) state.balance = account.remaining;
  return account;
}

/** Reads the balance before the first spend so there is something to compare against. */
export function primeBalance() {
  if (!isLive() || state.balance !== undefined) return;
  void accountBalance().catch(() => undefined);
}

export function logSpend(op: string, estimate: number, budgetLeft: number, opts: { reconcile?: boolean } = {}) {
  console.info(`${TAG} ${op}: −${fmt(estimate)} estimated · demo budget ${fmt(budgetLeft)} left`);
  if (opts.reconcile === false) return;
  state.pending.push({ op, estimate });
  clearTimeout(state.timer);
  state.timer = setTimeout(() => void reconcile(), SETTLE_MS);
}

function summarize(batch: Pending[]) {
  const counts = new Map<string, number>();
  for (const p of batch) counts.set(p.op, (counts.get(p.op) ?? 0) + 1);
  return [...counts].map(([op, n]) => (n > 1 ? `${op} ×${n}` : op)).join(", ");
}

async function reconcile() {
  const batch = state.pending.splice(0);
  if (!batch.length) return;
  const before = state.balance;
  const estimate = batch.reduce((n, p) => n + p.estimate, 0);
  try {
    const account = await accountBalance();
    if (!account) return;
    const balance = `balance ${fmt(account.remaining)} / ${fmt(account.allocated)}`;
    if (before === undefined) {
      console.info(`${TAG} Gradium ${balance} after ${summarize(batch)} (no earlier reading to compare)`);
      return;
    }
    const actual = before - account.remaining;
    const verdict =
      actual === estimate
        ? "matches the estimate"
        : actual === 0 && estimate > 0
          ? "not billed yet, it can lag a few seconds"
          : `estimate was ${fmt(estimate)}, off by ${actual - estimate > 0 ? "+" : ""}${fmt(actual - estimate)}`;
    console.info(`${TAG} Gradium −${fmt(actual)} for ${summarize(batch)} · ${verdict} · ${balance}`);
  } catch (err) {
    console.warn(`${TAG} could not read the Gradium balance: ${err instanceof Error ? err.message : err}`);
  }
}
