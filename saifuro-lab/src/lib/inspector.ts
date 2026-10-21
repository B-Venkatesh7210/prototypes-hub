import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { memoryReplayStore, remoteKeySource, SAIFURO_ISSUER, SAIFURO_JWKS_URL, verifyVerdict, type KeySource } from "@/kit/verdict/index.ts";
import { runVectors, VECTORS_URL, type VectorFile } from "@/kit/verdict/vectors.ts";
import { emulatorIssuer } from "@/lib/emulator/store";

/** Signed with Saifuro's production key by their docs (reference/verify-a-verdict); expired since 2026-09-03 08:48 UTC. */
export const SAIFURO_SAMPLE = {
  token:
    "eyJhbGciOiJFUzI1NiIsInR5cCI6IkpXVCIsImtpZCI6InZlcmRpY3QtMjAyNi0wOSJ9.eyJpc3MiOiJodHRwczovL3ZlcmRpY3RzLnNhaWZ1cm8uY29tIiwianRpIjoiZGVjXzViMmUiLCJpYXQiOjE3ODg0MjQ5ODAsImV4cCI6MTc4ODQyNTI4MCwidmVyZGljdCI6ImFsbG93IiwibWFuZGF0ZSI6Im1uZF83ZjNhIiwicG9saWN5X3ZlcnNpb24iOiJwb2xfMjAyNi0wOC0xMi4zIiwibm9uY2UiOiJuXzlkMDJjNmU0IiwicmVxdWVzdCI6eyJhZ2VudCI6ImFndF9wcm9jdXJlbWVudF8wMSIsImFtb3VudCI6MzQwLCJyZWNpcGllbnQiOiJ2ZW5kb3I6YWNtZV9zYWFzIiwiY2F0ZWdvcnkiOiJzYWFzIn19.oV4a02jtE2oEKvnSXxQ-YqJcpp8UvFZiuh3AeTb5Iy5Ony9jC1AA7EX-YPSKDuSFPxSNS4SlXLtU9-j0J36cbQ",
  receivedAt: Date.parse("2026-09-03T08:45:00Z") / 1000,
};

const g = globalThis as { __inspectorKeys?: Record<string, KeySource> };

function issuers(): Record<string, KeySource> {
  g.__inspectorKeys ??= {
    [SAIFURO_ISSUER]: remoteKeySource(SAIFURO_JWKS_URL),
    [emulatorIssuer()]: remoteKeySource(`${emulatorIssuer()}/.well-known/jwks.json`),
  };
  return g.__inspectorKeys;
}

export type InspectInput = {
  token: string;
  mode: "settle" | "record";
  payment?: { amount: string; currency: string; recipient: string };
  agreedMandates?: string[];
  testingOnly?: boolean;
  /** Record mode: when the verdict was received (unix seconds). */
  receivedAt?: number | null;
};

export async function inspect(input: InspectInput) {
  const result = await verifyVerdict(input.token.trim(), {
    issuers: issuers(),
    mode: input.mode,
    payment: input.payment,
    agreedMandates: input.agreedMandates?.length ? input.agreedMandates : undefined,
    testingOnly: input.testingOnly ?? false,
    distinguishTest: true,
    receivedAt: input.receivedAt ?? null,
    // A scratch nonce store: inspecting a token must never consume it for the real seller.
    replay: memoryReplayStore(),
  });
  return { ...result, issuers: Object.keys(issuers()) };
}

export async function liveJwks() {
  const set = await issuers()[SAIFURO_ISSUER].keys();
  return set.keys.map((k) => ({ kid: k.kid, crv: k.crv, alg: k.alg, use: k.use }));
}

let vectorCache: { at: number; value: Awaited<ReturnType<typeof runAllVectors>> } | null = null;

async function runAllVectors() {
  let file: VectorFile;
  let source = VECTORS_URL;
  try {
    const res = await fetch(VECTORS_URL, { signal: AbortSignal.timeout(10_000), cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    file = (await res.json()) as VectorFile;
  } catch {
    file = JSON.parse(readFileSync(path.join(process.cwd(), "data/verdict-test-vectors.json"), "utf8")) as VectorFile;
    source = "data/verdict-test-vectors.json (offline copy)";
  }
  const started = performance.now();
  const results = await runVectors(file);
  return {
    source,
    title: file.title,
    ms: Math.round(performance.now() - started),
    total: results.length,
    matched: results.filter((r) => r.matches).length,
    sameStep: results.filter((r) => r.matches && r.sameStep).length,
    results,
  };
}

export async function vectorReport() {
  if (!vectorCache || Date.now() - vectorCache.at > 10 * 60_000) vectorCache = { at: Date.now(), value: await runAllVectors() };
  return vectorCache.value;
}
