import "server-only";
import { randomBytes } from "node:crypto";
import { x402Client, x402HTTPClient } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { createSaifuroClient } from "@/kit/client.ts";
import { SpendBlockedError, wrapFetchWithSaifuro, type SpendEvent } from "@/kit/x402.ts";
import { MAINNET, MAINNET_EXPLORER, mainnetBuyerAccount } from "@/lib/payments";
import { orgClient, saifuroBase, say, type Creative, type DesignAgent, type LabSession } from "./session";

/** A real x402 merchant on Base mainnet, listed in the x402 Bazaar. It doesn't check Saifuro verdicts. */
export const MERCHANT = {
  name: "BlockRun",
  url: "https://blockrun.ai/api/v1/images/generations",
  model: "google/nano-banana",
  modelName: "Nano Banana (Gemini 2.5 Flash Image)",
};

/** Display rate only. Mandates and payments are in USDC. */
export const INR_PER_USD = Number(process.env.INR_PER_USD) || 88;
export const inr = (usd: number) => `₹${(usd * INR_PER_USD).toFixed(usd * INR_PER_USD < 10 ? 1 : 0)}`;
const usdc = (rupees: number) => Math.round((rupees / INR_PER_USD) * 1000) / 1000;

export const RULES = { per_image_inr: 10, budget_inr: 30, topup_inr: 15 };
export const CATEGORY = "image_generation";

export const BRIEF = {
  client: "Sharma Sweets, Jaipur",
  text: "Diwali sale creatives. Festive and warm: marigolds, diyas, gold and deep red. Budget ₹30.",
  creatives: [
    { id: "instagram-post", title: "Instagram post", prompt: "Square Instagram post for an Indian sweet shop's Diwali sale: a brass plate of kaju katli and laddoos, lit diyas, marigold garlands, warm gold and deep red, festive" },
    { id: "instagram-story", title: "Instagram story", prompt: "Vertical Instagram story background for a Diwali sweets sale: rows of glowing diyas, falling marigold petals, deep red and gold, space for text" },
    { id: "whatsapp-status", title: "WhatsApp status", prompt: "Cheerful WhatsApp status image: a box of Indian sweets tied with a gold ribbon, sparklers, rangoli on the floor, warm evening light" },
    { id: "shop-banner", title: "Shop-front banner", prompt: "Wide banner for the front of a traditional Jaipur sweet shop at Diwali: marigold toran, string lights, pink sandstone arches, festive and inviting" },
    { id: "menu-header", title: "Menu card header", prompt: "Elegant header illustration for a sweet shop menu card: gold paisley border, a single diya, soft cream background, Rajasthani motifs" },
    { id: "gift-label", title: "Gift box label", prompt: "Round gift box label design for Diwali sweets: marigold wreath, small diya in the centre, gold foil look on deep red" },
    { id: "facebook-cover", title: "Facebook cover", prompt: "Wide Facebook cover for a family sweet shop's Diwali sale: a long table of Indian sweets, diyas and marigolds, warm bokeh lights" },
    { id: "email-header", title: "Email header", prompt: "Wide email header for a Diwali sale: fireworks over a Jaipur skyline at dusk, a plate of sweets in the foreground, gold and red" },
  ],
};

export function mandateLimits(kind: "budget" | "topup") {
  return {
    per_transaction: usdc(RULES.per_image_inr),
    per_month: usdc(kind === "budget" ? RULES.budget_inr : RULES.topup_inr),
  };
}

const g = globalThis as { __mainnetX402?: x402HTTPClient; __labImages?: Map<string, { type: string; data: Buffer }> };
const images = (g.__labImages ??= new Map());

export function storedImage(id: string) {
  return images.get(id) ?? null;
}

function mainnetX402() {
  const account = mainnetBuyerAccount();
  if (!account) return null;
  g.__mainnetX402 ??= new x402HTTPClient(new x402Client().register(MAINNET, new ExactEvmScheme(account)));
  return g.__mainnetX402;
}

async function issueDesignMandate(agent: string, kind: "budget" | "topup") {
  const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  return (await orgClient()).createMandate({
    principal: "role:marketing_lead",
    agent,
    limits: { ...mandateLimits(kind), currency: "USDC" },
    categories: [CATEGORY],
    expires: tomorrow,
  });
}

/** A design agent for this session, with a fresh task budget on every run. */
export async function startDesignAgent(s: LabSession): Promise<DesignAgent> {
  const org = await orgClient();
  if (!s.design) {
    const agent = await org.createAgent({ name: `design_${s.sid.slice(0, 8)}`, metadata: { lab: "saifuro-lab", merchant: "blockrun" } });
    s.design = { agent: agent.agent, agentKey: agent.agent_key, mandate: "", creatives: [], topup: "idle" };
  } else {
    const active = await org.mandates({ agent: s.design.agent, status: "active" });
    for (const m of active.data) await org.revokeMandate(m.mandate);
  }
  const m = await issueDesignMandate(s.design.agent, "budget");
  Object.assign(s.design, { mandate: m.mandate, creatives: [], topup: "idle" });
  return s.design;
}

export async function topUp(s: LabSession) {
  const d = s.design;
  if (!d || d.topup !== "waiting") throw new Error("Nothing is waiting for a top-up");
  const org = await orgClient();
  await org.revokeMandate(d.mandate);
  const m = await issueDesignMandate(d.agent, "topup");
  d.mandate = m.mandate;
  d.topup = "approved";
  say(s, {
    role: "step",
    tone: "ok",
    tag: "topup",
    text: `${m.mandate} · ${inr(m.limits.per_month ?? 0)} more for this task`,
    detail: "Mandates can't be edited, so the exhausted one was revoked and a new one issued with a fresh budget.",
  });
}

export function declineTopUp(s: LabSession) {
  const d = s.design;
  if (!d || d.topup !== "waiting") throw new Error("Nothing is waiting for a top-up");
  d.topup = "declined";
  say(s, { role: "step", tone: "warn", tag: "declined", text: "You kept the budget at ₹30. The agent stops here." });
}

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function narrate(s: LabSession, title: string, e: SpendEvent) {
  switch (e.type) {
    case "quote":
      say(s, { role: "step", tone: "info", tag: "402", text: `${title} · ${e.amount} ${e.currency} (${inr(Number(e.amount))})`, detail: `${MERCHANT.name} answered 402 Payment Required for one ${MERCHANT.modelName} image, to ${e.recipient} on Base mainnet.` });
      break;
    case "decision": {
      const d = e.decision;
      say(s, { role: "step", tone: d.verdict === "allow" ? "ok" : "bad", tag: d.verdict, text: d.reason, detail: `Saifuro decision ${d.decision}, signed as an ES256 verdict.` });
      break;
    }
    case "payment_signed":
      say(s, { role: "step", tone: "info", tag: "signed", text: `${e.amount} ${e.currency} → ${short(e.payTo)}`, detail: "A real EIP-3009 authorization for USDC on Base mainnet. BlockRun settles it through its facilitator, which pays the gas." });
      break;
  }
}

type ImageBody = { data?: { url?: string; b64_json?: string }[]; id?: string; poll_url?: string; status?: string; error?: unknown; message?: string };

const failure = (status: number, body: ImageBody | null) => {
  const msg = typeof body?.message === "string" ? body.message : typeof body?.error === "string" ? body.error : "";
  return `${MERCHANT.name} returned HTTP ${status}${msg ? `: ${msg.slice(0, 120)}` : ""}`;
};

function pickImage(body: ImageBody | null): string | null {
  const first = body?.data?.[0];
  if (first?.url) return first.url;
  if (first?.b64_json) {
    const id = randomBytes(6).toString("hex");
    images.set(id, { type: "image/png", data: Buffer.from(first.b64_json, "base64") });
    return `/api/lab/image/${id}`;
  }
  return null;
}

/** Slow models answer 202 and settle on completion; the poll must carry the same wallet's payment. */
async function poll(url: string, headers: Record<string, string>): Promise<Response | null> {
  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const res = await fetch(url, { headers, cache: "no-store" });
    if (res.status === 202) continue;
    return res;
  }
  return null;
}

export async function generate(s: LabSession, creative: (typeof BRIEF.creatives)[number]): Promise<Creative> {
  const x402 = mainnetX402()!;
  const d = s.design!;
  const at = new Date().toISOString();
  let paidHeaders: Record<string, string> = {};
  let quoted: string | undefined;
  const inner: typeof fetch = async (input, init) => {
    const res = await fetch(input, { ...init, cache: "no-store" });
    const h = new Headers(init?.headers);
    if (h.has("payment-signature")) paidHeaders = Object.fromEntries(h.entries());
    return res;
  };
  const guarded = wrapFetchWithSaifuro(inner, {
    saifuro: createSaifuroClient({ apiKey: d.agentKey, baseUrl: saifuroBase() }),
    x402,
    category: CATEGORY,
    reviewTimeoutMs: 0,
    onEvent: (e) => {
      if (e.type === "quote") quoted = e.amount;
      narrate(s, creative.title, e);
    },
    metadata: () => ({ lab_session: s.sid.slice(0, 8), creative: creative.id }),
  });

  try {
    let res = await guarded(MERCHANT.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ model: MERCHANT.model, prompt: creative.prompt, n: 1, size: "1024x1024" }),
    });
    let body = (await res.json().catch(() => null)) as ImageBody | null;
    if (res.status === 202 && body?.poll_url) {
      say(s, { role: "note", tone: "info", text: `${creative.title} is rendering`, detail: "BlockRun queued the job and settles the payment when the image is ready." });
      const done = await poll(new URL(body.poll_url, MERCHANT.url).href, paidHeaders);
      if (!done) throw new Error("timed out waiting for the image");
      res = done;
      body = (await res.json().catch(() => null)) as ImageBody | null;
    }
    if (!res.ok) throw new Error(failure(res.status, body));
    let transaction: string | undefined;
    try {
      transaction = x402.getPaymentSettleResponse((n) => res.headers.get(n)).transaction || undefined;
    } catch {
      // no settlement header
    }
    const src = pickImage(body);
    say(s, {
      role: "step",
      tone: "ok",
      tag: "settled",
      text: `${creative.title} delivered${transaction ? ", paid on Base mainnet" : ""}`,
      link: transaction ? { href: `${MAINNET_EXPLORER}/tx/${transaction}`, label: short(transaction) } : undefined,
      detail: src ? undefined : "Paid, but the response had no image in it.",
    });
    const c: Creative = { id: creative.id, title: creative.title, src: src ?? undefined, transaction, amount: quoted, status: "paid", at };
    d.creatives.push(c);
    return c;
  } catch (e) {
    if (e instanceof SpendBlockedError) {
      say(s, { role: "step", tone: "bad", tag: "stopped", text: "Nothing signed, no USDC moved", detail: "The wallet signs only on allow." });
      const c: Creative = { id: creative.id, title: creative.title, status: "denied", reason: e.decision.reason, at };
      d.creatives.push(c);
      return c;
    }
    const reason = (e as Error).message;
    say(s, { role: "step", tone: "bad", tag: "error", text: reason });
    const c: Creative = { id: creative.id, title: creative.title, status: "failed", reason, at };
    d.creatives.push(c);
    return c;
  }
}

export function merchantReady() {
  return !!mainnetBuyerAccount();
}
