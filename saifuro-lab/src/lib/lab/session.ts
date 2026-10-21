import "server-only";
import { randomBytes } from "node:crypto";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createSaifuroClient, type Mandate, type SaifuroClient } from "@/kit/client.ts";
import { appUrl, emulatorIssuer, orgKey } from "@/lib/emulator/store";
import { buyerAccount, NETWORK } from "@/lib/payments";
import { agreeMandate } from "@/lib/seller/server";

export type Tone = "ok" | "warn" | "bad" | "info";
export type Message = {
  id: string;
  at: string;
  role: "user" | "agent" | "step" | "note";
  text: string;
  tone?: Tone;
  /** Short label shown as a pill on step lines: "402", "allow", "signed", "settled"… */
  tag?: string;
  link?: { href: string; label: string };
  detail?: string;
};

export type LabSession = {
  sid: string;
  agent: string;
  agentKey: string;
  mandate: string;
  messages: Message[];
  busy: string | null;
  resolvedReviews: Record<string, "approved" | "denied">;
  lastPaid?: { path: string; headers: Record<string, string> };
  createdAt: number;
};

export const DEFAULT_MANDATE = { per_transaction: 0.5, per_month: 5, review_above: 0.2, categories: ["data"], principal: "role:research_lead" };

/** The Saifuro API this lab talks to: the local emulator, or the real API when SAIFURO_API_URL is set. */
export function saifuroBase() {
  return process.env.SAIFURO_API_URL?.trim().replace(/\/$/, "") || `${appUrl()}/emulator`;
}

export function saifuroTarget() {
  const real = !!process.env.SAIFURO_API_URL?.trim();
  return { kind: real ? ("saifuro" as const) : ("emulator" as const), baseUrl: saifuroBase(), issuer: real ? "https://verdicts.saifuro.com" : emulatorIssuer() };
}

export async function orgClient(): Promise<SaifuroClient> {
  return createSaifuroClient({ apiKey: await orgKey(), baseUrl: saifuroBase() });
}

const g = globalThis as { __labSessions?: Map<string, Promise<LabSession>>; __labX402?: x402HTTPClient };
const sessions = (g.__labSessions ??= new Map());

/** The buyer agent's x402 client. Without BUYER_PRIVATE_KEY it signs with a throwaway key (simulated mode). */
export function buyerX402(): x402HTTPClient {
  if (!g.__labX402) {
    const account = buyerAccount() ?? privateKeyToAccount(generatePrivateKey());
    g.__labX402 = new x402HTTPClient(new x402Client().register(NETWORK, new ExactEvmScheme(account)));
  }
  return g.__labX402;
}

export async function issueMandate(agent: string, limits: Partial<typeof DEFAULT_MANDATE> = {}): Promise<Mandate> {
  const o = { ...DEFAULT_MANDATE, ...limits };
  const expires = new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10);
  const m = await (await orgClient()).createMandate({
    principal: o.principal,
    agent,
    limits: { per_transaction: o.per_transaction, per_month: o.per_month, currency: "USDC" },
    categories: o.categories,
    review_above: o.review_above,
    expires,
  });
  agreeMandate(m.mandate);
  return m;
}

async function create(sid: string): Promise<LabSession> {
  const org = await orgClient();
  const agent = await org.createAgent({ name: `research_${sid.slice(0, 8)}`, metadata: { lab: "saifuro-lab" } });
  const mandate = await issueMandate(agent.agent);
  return {
    sid,
    agent: agent.agent,
    agentKey: agent.agent_key,
    mandate: mandate.mandate,
    messages: [],
    busy: null,
    resolvedReviews: {},
    createdAt: Date.now(),
  };
}

export function newSid() {
  return randomBytes(12).toString("hex");
}

export function getSession(sid: string): Promise<LabSession> {
  let s = sessions.get(sid);
  if (!s) {
    s = create(sid).catch((e) => {
      sessions.delete(sid);
      throw e;
    });
    sessions.set(sid, s);
  }
  return s;
}

export function dropSession(sid: string) {
  sessions.delete(sid);
}

export function say(s: LabSession, m: Omit<Message, "id" | "at">) {
  s.messages.push({ id: randomBytes(5).toString("hex"), at: new Date().toISOString(), ...m });
  if (s.messages.length > 300) s.messages.splice(0, s.messages.length - 300);
}
