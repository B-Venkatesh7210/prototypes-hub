"use client";

import type {
  AccountCredits,
  CloneResult,
  DesignResult,
  Lang,
  LiveSession,
  ServiceStatus,
  SttResult,
  TranslateResult,
  TtsResult,
} from "@/lib/types";
import { LIMITS, PRICES } from "@/lib/limits";

const LEDGER_KEY = "gradium-captions:credits";
export const LEDGER_EVENT = "gradium-captions:credits";

export type LedgerEntry = { at: number; op: string; credits: number; mock: boolean };

export function readLedger(): LedgerEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LEDGER_KEY) || "[]") as LedgerEntry[];
  } catch {
    return [];
  }
}

function record(op: string, credits: number, mock: boolean) {
  const entries = [...readLedger(), { at: Date.now(), op, credits, mock }].slice(-500);
  localStorage.setItem(LEDGER_KEY, JSON.stringify(entries));
  window.dispatchEvent(new Event(LEDGER_EVENT));
  logSpend(op, credits, mock);
}

export const ACCOUNT_EVENT = "gradium-captions:account";

let account: AccountCredits | null = null;
/** The balance the next settled batch is compared against. */
let baseline: number | null = null;
let pending: { op: string; credits: number }[] = [];
let settleTimer: ReturnType<typeof setTimeout> | undefined;

/** Gradium bills after a call finishes; give it a moment before reading the balance. */
const SETTLE_MS = 3000;
const LOG = { live: "color:#91fffa;font-weight:600", mock: "color:#daff52;font-weight:600", text: "color:inherit" };
const fmt = (n: number) => n.toLocaleString("en-US");

export function currentAccount(): AccountCredits | null {
  return account;
}

/** Reads the real Gradium balance through the server. Costs no credits. */
export async function refreshAccount(): Promise<AccountCredits | null> {
  try {
    const res = await call<{ account: AccountCredits | null }>("/api/credits", { cache: "no-store" });
    account = res.account;
    if (account && !pending.length) baseline = account.remaining;
  } catch (err) {
    console.warn("%c[credits]%c could not read the Gradium balance:", LOG.live, LOG.text, err);
  }
  window.dispatchEvent(new Event(ACCOUNT_EVENT));
  return account;
}

function logSpend(op: string, credits: number, mock: boolean) {
  if (mock) {
    console.info(
      `%c[credits · mock]%c ${op}: would cost ${fmt(credits)} · simulated budget ${fmt(budgetLeft(true))} / ${fmt(LIMITS.dailyCredits)} left`,
      LOG.mock,
      LOG.text,
    );
    return;
  }
  console.info(
    `%c[credits]%c ${op}: −${fmt(credits)} estimated · demo budget ${fmt(budgetLeft(false))} / ${fmt(LIMITS.dailyCredits)} left`,
    LOG.live,
    LOG.text,
  );
  pending.push({ op, credits });
  clearTimeout(settleTimer);
  settleTimer = setTimeout(() => void settle(), SETTLE_MS);
}

/** Compares a batch of calls with how much the Gradium balance actually moved. */
async function settle() {
  const batch = pending;
  pending = [];
  const before = baseline;
  const estimate = batch.reduce((n, p) => n + p.credits, 0);
  const now = await refreshAccount();
  if (!now) return;
  baseline = now.remaining;
  const ops = batch.map((p) => p.op).join(", ");
  const balance = `balance ${fmt(now.remaining)} / ${fmt(now.allocated)}`;
  if (before === null) {
    console.info(`%c[credits]%c Gradium ${balance} after ${ops} (no earlier reading to compare)`, LOG.live, LOG.text);
    return;
  }
  const actual = before - now.remaining;
  const verdict =
    actual === estimate
      ? "matches the estimate"
      : actual === 0 && estimate > 0
        ? "not billed yet, it can lag a few seconds"
        : `estimate was ${fmt(estimate)}, off by ${actual - estimate > 0 ? "+" : ""}${fmt(actual - estimate)}`;
  console.groupCollapsed(`%c[credits]%c Gradium −${fmt(actual)} · ${verdict} · ${balance}`, LOG.live, LOG.text);
  for (const p of batch) console.info(`${p.op}: ${fmt(p.credits)} estimated`);
  console.groupEnd();
}

const OPS = {
  stt: "Speech-to-Text",
  tts: "Text-to-Speech",
  clone: "Instant voice clone",
  translate: "Speech-to-text translation",
  design: "Voice design",
  live: "Realtime Speech-to-Text",
} as const;

let spendsCredits = false;

/** Set by the status provider: quotas only apply when calls spend real Gradium credits. */
export function setSpendsCredits(value: boolean) {
  spendsCredits = value;
}

function realEntries(op: string | null, windowMs: number) {
  const since = Date.now() - windowMs;
  return readLedger().filter((e) => !e.mock && e.at >= since && (op === null || e.op === op));
}

const DAY = 24 * 3_600_000;

export function creditsSpentToday(): number {
  return realEntries(null, DAY).reduce((n, e) => n + e.credits, 0);
}

/** Credits left in today's demo budget. Mock calls count down a separate, simulated budget. */
export function budgetLeft(mock: boolean): number {
  const since = Date.now() - DAY;
  const spent = readLedger()
    .filter((e) => e.mock === mock && e.at >= since)
    .reduce((n, e) => n + e.credits, 0);
  return Math.max(0, LIMITS.dailyCredits - spent);
}

export const quotaLeft = {
  credits: () => Math.max(0, LIMITS.dailyCredits - creditsSpentToday()),
  clones: () => Math.max(0, LIMITS.clonesPerDay - realEntries(OPS.clone, DAY).length),
  designs: () => Math.max(0, LIMITS.designsPerDay - realEntries(OPS.design, DAY).length),
  liveSessions: () => Math.max(0, LIMITS.liveSessionsPerHour - realEntries(OPS.live, 3_600_000).length),
};

function guard(estimate: number, extra?: { left: number; message: string }) {
  if (!spendsCredits) return;
  if (extra && extra.left <= 0) throw new Error(extra.message);
  if (creditsSpentToday() + estimate > LIMITS.dailyCredits) {
    throw new Error(
      `Demo budget reached: ${LIMITS.dailyCredits.toLocaleString()} Gradium credits per day, ${quotaLeft.credits().toLocaleString()} left. This step needs about ${estimate.toLocaleString()}.`,
    );
  }
}

/** Seconds of audio in a 24 kHz, 16-bit mono WAV blob. */
const wavSeconds = (wav: Blob) => Math.max(0, wav.size - 44) / 48000;

/** Clears the history. Today's live spending stays, so clearing never refills the daily budget. */
export function clearLedger() {
  localStorage.setItem(LEDGER_KEY, JSON.stringify(realEntries(null, DAY)));
  window.dispatchEvent(new Event(LEDGER_EVENT));
}

async function call<T>(url: string, init: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
  return body;
}

function tracked<T extends { credits: number; mock: boolean }>(op: string, result: T): T {
  record(op, result.credits, result.mock);
  return result;
}

export const api = {
  status: () => call<ServiceStatus>("/api/status", { cache: "no-store" }),

  async transcribe(wav: Blob, language: Lang, keywords: string): Promise<SttResult> {
    guard(Math.ceil(wavSeconds(wav) * PRICES.sttPerSecond));
    const form = new FormData();
    form.append("audio", wav, "audio.wav");
    form.append("language", language);
    form.append("keywords", keywords);
    return tracked(OPS.stt, await call<SttResult>("/api/stt", { method: "POST", body: form }));
  },

  async synthesize(text: string, voiceId: string): Promise<TtsResult> {
    guard(text.length * PRICES.ttsPerChar);
    return tracked(
      OPS.tts,
      await call<TtsResult>("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, voiceId }),
      }),
    );
  },

  async clone(wav: Blob, name: string, language: Lang): Promise<CloneResult> {
    guard(0, {
      left: quotaLeft.clones(),
      message: `Demo limit: ${LIMITS.clonesPerDay} voice clones per day. Reuse a voice you already cloned, or pick a flagship voice.`,
    });
    const form = new FormData();
    form.append("audio", wav, "sample.wav");
    form.append("name", name);
    form.append("language", language);
    form.append("consent", "yes");
    return tracked(OPS.clone, await call<CloneResult>("/api/voices/clone", { method: "POST", body: form }));
  },

  async translate(args: { wav: Blob; text: string; source: Lang; target: Lang }): Promise<TranslateResult> {
    guard(Math.ceil(wavSeconds(args.wav) * PRICES.translatePerSecond));
    const form = new FormData();
    form.append("audio", args.wav, "audio.wav");
    form.append("text", args.text);
    form.append("source", args.source);
    form.append("target", args.target);
    return tracked(OPS.translate, await call<TranslateResult>("/api/translate", { method: "POST", body: form }));
  },

  async design(prompt: string, language: Lang, count: number = LIMITS.designCandidates): Promise<DesignResult> {
    guard(0, { left: quotaLeft.designs(), message: `Demo limit: ${LIMITS.designsPerDay} voice designs per day.` });
    return tracked(
      OPS.design,
      await call<DesignResult>("/api/voices/design", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate", prompt, language, count }),
      }),
    );
  },

  keepDesign: (candidateId: string, name: string) =>
    call<{ voiceId: string; mock: boolean }>("/api/voices/design", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "keep", candidateId, name }),
    }),

  customVoices: () =>
    call<{ custom: { id: string; name: string; lang: Lang | null }[] }>("/api/voices", { cache: "no-store" }),

  liveSession() {
    guard(LIMITS.liveSeconds * PRICES.sttPerSecond, {
      left: quotaLeft.liveSessions(),
      message: `Demo limit: ${LIMITS.liveSessionsPerHour} Gradium live sessions per hour. The free browser engine still works.`,
    });
    return call<LiveSession>("/api/live/session", { method: "POST" });
  },

  recordLive(seconds: number, mock: boolean) {
    record(OPS.live, Math.ceil(seconds * PRICES.sttPerSecond), mock);
  },
};
