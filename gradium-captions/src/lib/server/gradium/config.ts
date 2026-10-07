import type { GradiumMode, ServiceStatus } from "@/lib/types";

const HOSTS = new Set(["api", "eu.api", "us.api"]);

export class GradiumError extends Error {
  constructor(
    message: string,
    readonly status = 502,
  ) {
    super(message);
  }
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

export function status(): ServiceStatus {
  const hasKey = Boolean(process.env.GRADIUM_API_KEY?.trim());
  const wantsLive = process.env.GRADIUM_MODE?.trim().toLowerCase() === "live";
  const mode: GradiumMode = hasKey && wantsLive ? "live" : "mock";
  return { mode, hasKey, host: host() };
}

export function isLive(): boolean {
  return status().mode === "live";
}

export function apiKey(): string {
  const key = process.env.GRADIUM_API_KEY?.trim();
  if (!key) throw new GradiumError("GRADIUM_API_KEY is not set. Add it to .env.local.", 500);
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
