import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { exportJWK, generateKeyPair, type JWK } from "jose";

export type Verdict = "allow" | "review" | "deny_limit" | "deny_velocity" | "deny_category" | "deny_expired" | "deny_revoked" | "deny_no_mandate";

export type AgentRecord = {
  agent: string;
  name: string;
  status: "active" | "disabled";
  created_at: string;
  metadata?: Record<string, string>;
  keyHashes: string[];
  keyHint: string;
};

export type MandateRecord = {
  mandate: string;
  principal: string;
  agent: string;
  limits: { per_transaction: number; per_month?: number; currency: string };
  categories: string[];
  review_above?: number;
  expires: string;
  escrow?: { required_above: string };
  status: "active" | "revoked";
  created_at: string;
  revoked_at?: string;
};

export type DecisionRecord = {
  decision: string;
  request: { agent: string; amount: number; currency: string; recipient: string; category: string };
  verdict: Verdict;
  reason: string;
  mandate?: string;
  policy_version: string;
  nonce: string;
  mode: "observe" | "enforce";
  issued_at: string;
  expires_at?: string;
  verdict_token: string;
  supersedes?: string;
  review?: { review: string; waits_for: string; expires_at: string };
  metadata?: Record<string, string>;
  /** Stored for usage reports; never returned or signed. */
  protocol?: string;
};

export type ReviewRecord = {
  review: string;
  decision: string;
  status: "pending" | "approved" | "denied";
  created_at: string;
  expires_at: string;
};

type IdempotencyEntry = { bodyHash: string; status: number; body: unknown; at: number };

export type EmulatorState = {
  issuer: string;
  kid: string;
  signingKey: JWK;
  publicKey: JWK;
  orgKeyHash: string;
  cursorSecret: string;
  policyVersion: string;
  mode: "observe" | "enforce";
  agents: AgentRecord[];
  mandates: MandateRecord[];
  decisions: DecisionRecord[];
  reviews: ReviewRecord[];
  idempotency: Record<string, IdempotencyEntry>;
};

const DIR = path.join(process.cwd(), ".data");
const FILE = path.join(DIR, "emulator.json");
const ORG_KEY_FILE = path.join(DIR, "org-key");
const MAX_DECISIONS = 5000;

export function appUrl(): string {
  return (process.env.APP_URL || `http://localhost:${process.env.PORT || 3003}`).replace(/\/$/, "");
}

export function emulatorIssuer(): string {
  return `${appUrl()}/emulator`;
}

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");
export const hex = (bytes: number) => randomBytes(bytes).toString("hex");
export const hint = (key: string) => `${key.slice(0, key.lastIndexOf("_") + 1)}...${key.slice(-4)}`;

const g = globalThis as { __emulator?: Promise<EmulatorState> };

async function create(): Promise<EmulatorState> {
  const { privateKey, publicKey } = await generateKeyPair("ES256", { extractable: true });
  const kid = `sandbox-local-${new Date().toISOString().slice(0, 7)}`;
  const orgKey = `sk_sandbox_${hex(16)}`;
  mkdirSync(DIR, { recursive: true });
  writeFileSync(ORG_KEY_FILE, orgKey, { mode: 0o600 });
  return {
    issuer: emulatorIssuer(),
    kid,
    signingKey: { ...(await exportJWK(privateKey)), kid, alg: "ES256" },
    publicKey: { ...(await exportJWK(publicKey)), kid, alg: "ES256", use: "sig" },
    orgKeyHash: hashKey(orgKey),
    cursorSecret: hex(32),
    policyVersion: `pol_${new Date().toISOString().slice(0, 10)}.1`,
    mode: "enforce",
    agents: [],
    mandates: [],
    decisions: [],
    reviews: [],
    idempotency: {},
  };
}

export function emulator(): Promise<EmulatorState> {
  g.__emulator ??= (async () => {
    if (existsSync(FILE) && existsSync(ORG_KEY_FILE)) {
      try {
        const state = JSON.parse(readFileSync(FILE, "utf8")) as EmulatorState;
        if (state.issuer === emulatorIssuer()) return state;
      } catch {
        // fall through to a fresh emulator
      }
    }
    const state = await create();
    save(state);
    return state;
  })();
  return g.__emulator;
}

/** The organization key the emulator issued at "onboarding". Only the lab backend reads it. */
export async function orgKey(): Promise<string> {
  await emulator();
  return process.env.SAIFURO_API_KEY?.trim() || readFileSync(ORG_KEY_FILE, "utf8").trim();
}

export function save(state: EmulatorState) {
  if (state.decisions.length > MAX_DECISIONS) state.decisions.splice(0, state.decisions.length - MAX_DECISIONS);
  const cutoff = Date.now() - 24 * 3600_000;
  for (const [k, v] of Object.entries(state.idempotency)) if (v.at < cutoff) delete state.idempotency[k];
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(state), { mode: 0o600 });
}
