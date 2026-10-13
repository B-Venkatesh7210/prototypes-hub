"use client";

import { SECONDS_PER_YEAR } from "@/lib/aave/math";
import type { EarnAdapter, EarnState, EarnStep } from "@/widget/types";

export const SANDBOX_FUNDS = 10_000;

/** An EarnAdapter with demo controls: fast-forward time and start over. */
export interface DemoAdapter extends EarnAdapter {
  kind: "fork" | "simulated";
  warp(seconds: number): Promise<void>;
  reset(): Promise<void>;
  /** Simulated only: follow the live market rate. */
  setApy?(apy: number): void;
}

/**
 * Runs against a fork of Base on the server: real approve + supply transactions against the real Aave
 * contracts, with a throwaway wallet per browser session.
 */
export function forkAdapter(asset: string): DemoAdapter {
  // One request at a time: the first sets the session cookie, and the fork's nonces stay in order.
  let queue: Promise<unknown> = Promise.resolve();
  const call = <T,>(action: string, extra: Record<string, unknown> = {}): Promise<T> => {
    const run = queue.catch(() => undefined).then(() => send<T>(action, extra));
    queue = run.catch(() => undefined);
    return run;
  };
  const send = async <T,>(action: string, extra: Record<string, unknown>): Promise<T> => {
    const res = await fetch("/api/sandbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, asset, ...extra }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error || `Sandbox request failed (${res.status})`);
    return body as T;
  };

  return {
    kind: "fork",
    getState: async () => (await call<{ state: EarnState }>("state")).state,
    async deposit(amount, onStep) {
      const approve = await call<{ hash: string | null }>("approve", { amount });
      onStep?.("approve", approve.hash ?? undefined);
      const supply = await call<{ hash: string }>("supply", { amount });
      onStep?.("supply", supply.hash);
    },
    async withdraw(amount, onStep) {
      const res = await call<{ hash: string }>("withdraw", { amount });
      onStep?.("withdraw", res.hash);
    },
    async warp(seconds) {
      await call("warp", { seconds });
    },
    async reset() {
      await call("reset");
    },
  };
}

/**
 * Same behaviour without a chain: live Aave APY, interest compounding per second, and a clock you can
 * move forward. Used when no fork is configured.
 */
export function simulatedAdapter(asset: string): DemoAdapter {
  let rate = 0;
  const apy = () => rate;
  let wallet = SANDBOX_FUNDS;
  let principal = 0;
  /** Balance at `at` (simulated ms). */
  let balance = 0;
  let at = Date.now();
  let offset = 0;
  const now = () => Date.now() + offset;
  const accrue = () => {
    const t = now();
    balance *= Math.pow(1 + apy(), (t - at) / 1000 / SECONDS_PER_YEAR);
    at = t;
  };
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
  const fakeHash = () => `0x${Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("")}`;

  return {
    kind: "simulated",
    async getState() {
      accrue();
      return { asset, wallet, deposited: balance, principal, apy: apy(), account: "simulated" };
    },
    async deposit(amount: number, onStep?: (s: EarnStep, h?: string) => void) {
      if (amount > wallet + 1e-9) throw new Error("Not enough balance.");
      await wait(700);
      onStep?.("approve", fakeHash());
      await wait(900);
      accrue();
      wallet -= amount;
      balance += amount;
      principal += amount;
      onStep?.("supply", fakeHash());
    },
    async withdraw(amount, onStep) {
      await wait(900);
      accrue();
      const take = amount === "max" ? balance : Math.min(amount, balance);
      balance -= take;
      wallet += take;
      principal = amount === "max" ? 0 : Math.max(0, principal - take);
      onStep?.("withdraw", fakeHash());
    },
    async warp(seconds) {
      accrue();
      offset += seconds * 1000;
    },
    setApy(next) {
      accrue();
      rate = next;
    },
    async reset() {
      wallet = SANDBOX_FUNDS;
      principal = 0;
      balance = 0;
      at = now();
    },
  };
}
