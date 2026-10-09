import { AsyncLocalStorage } from "node:async_hooks";
import { createHash } from "node:crypto";
import { KEY_HEADER } from "@/lib/key";
import type { GradiumMode, ServiceStatus } from "@/lib/types";

const HOSTS = new Set(["api", "eu.api", "us.api"]);

export class GradiumError extends Error {
  constructor(
    message: string,
    readonly status = 502,
    readonly code?: string,
  ) {
    super(message);
  }
}

/**
 * Each visitor brings their own Gradium key in the `x-gradium-key` header. It lives only for the
 * request (and timers it schedules) and is never stored or logged on the server.
 */
type KeyScope = { key: string | null };
const scope = ((globalThis as { __gradiumKeyScope?: AsyncLocalStorage<KeyScope> }).__gradiumKeyScope ??= new AsyncLocalStorage());

function cleanKey(value: string | null): string | null {
  const key = value?.trim();
  return key && /^[\x21-\x7e]{8,256}$/.test(key) ? key : null;
}

/** Runs a route handler with the visitor's key available to `apiKey()`. */
export function withRequestKey<T>(req: Request, work: () => Promise<T>): Promise<T> {
  return scope.run({ key: cleanKey(req.headers.get(KEY_HEADER)) }, work);
}

/** The visitor's key inside a request; outside one (CLI scripts) the server's own key from .env. */
function currentKey(): string | null {
  const store = scope.getStore();
  if (store) return store.key;
  return process.env.GRADIUM_API_KEY?.trim() || null;
}

/** A short, non-reversible id for the current key, used to keep quotas and logs per account. */
export function keyFingerprint(): string | null {
  const key = currentKey();
  return key ? createHash("sha256").update(key).digest("hex").slice(0, 16) : null;
}

function host(): string {
  const value = process.env.GRADIUM_HOST?.trim() || "api";
  return HOSTS.has(value) ? value : "api";
}

export function apiBase(): string {
  return `https://${host()}.gradium.ai/api`;
}

export function wsBase(): string {
  return `wss://${host()}.gradium.ai/api`;
}

/** Live mode is a server setting; in live mode nothing works until the visitor adds a key. */
export function status(): ServiceStatus {
  const mode: GradiumMode = process.env.GRADIUM_MODE?.trim().toLowerCase() === "live" ? "live" : "mock";
  return { mode, hasKey: Boolean(currentKey()), host: host() };
}

export function isLive(): boolean {
  return status().mode === "live";
}

export function apiKey(): string {
  const key = currentKey();
  if (!key) throw new GradiumError("Add your Gradium API key to use the app.", 401, "needs_key");
  return key;
}

export async function readError(res: Response): Promise<string> {
  const body = await res.text().catch(() => "");
  try {
    const json = JSON.parse(body) as { detail?: unknown; message?: string; error?: string };
    if (typeof json.detail === "string") return json.detail;
    if (Array.isArray(json.detail)) return JSON.stringify(json.detail);
    return json.message || json.error || body || res.statusText;
  } catch {
    return body || res.statusText;
  }
}
