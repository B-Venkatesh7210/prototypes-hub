import "server-only";
import { createSaifuroClient } from "@/kit/client.ts";
import { SpendBlockedError, wrapFetchWithSaifuro, type SpendEvent } from "@/kit/x402.ts";
import { appUrl } from "@/lib/emulator/store";
import { EXPLORER } from "@/lib/payments";
import { datasetById } from "@/lib/seller/catalog";
import { buyerX402, saifuroBase, say, type LabSession } from "./session";

export type BuyResult =
  | { status: "delivered"; id: string; data: unknown; untrusted: boolean; transaction: string | null; simulated: boolean }
  | { status: "blocked"; id: string; verdict: string; reason: string; decision: string }
  | { status: "refused"; id: string; reason: string }
  | { status: "error"; id: string; reason: string };

const short = (a: string) => (a.length > 14 ? `${a.slice(0, 6)}…${a.slice(-4)}` : a);

function narrate(s: LabSession, e: SpendEvent) {
  const id = e.url.split("/").pop() ?? "";
  const title = datasetById(id)?.title ?? id;
  switch (e.type) {
    case "quote":
      say(s, {
        role: "step",
        tone: "info",
        tag: "402",
        text: `${title} · ${e.amount} ${e.currency}`,
        detail: "The seller answered 402 Payment Required with a price. The agent asks Saifuro before it signs anything.",
      });
      break;
    case "decision": {
      const d = e.decision;
      const tone = d.verdict === "allow" ? "ok" : d.verdict === "review" ? "warn" : "bad";
      say(s, {
        role: "step",
        tone,
        tag: d.verdict,
        text: d.supersedes ? `review approved · ${d.reason}` : d.reason,
        detail: d.supersedes ? `Decision ${d.decision}, a fresh allow that supersedes ${d.supersedes}.` : `Saifuro decision ${d.decision}, signed as an ES256 verdict.`,
      });
      break;
    }
    case "review_wait":
      say(s, {
        role: "note",
        tone: "warn",
        text: "Waiting for approval",
        detail: `Held for ${e.decision.review?.waits_for}. A review stays open for 24 hours; the agent stops waiting after 3 minutes.`,
      });
      break;
    case "payment_signed":
      say(s, {
        role: "step",
        tone: "info",
        tag: "signed",
        text: `${e.amount} ${e.currency} → ${short(e.payTo)}`,
        detail: "An x402 exact payment: an EIP-3009 transfer authorization. Nothing moves until the seller settles it, and the seller first verifies the verdict.",
      });
      break;
    case "delivered":
      if (e.transaction) {
        say(s, {
          role: "step",
          tone: "ok",
          tag: "settled",
          text: "Verdict verified, paid on Base Sepolia",
          link: { href: `${EXPLORER}/tx/${e.transaction}`, label: short(e.transaction) },
        });
      } else {
        say(s, { role: "step", tone: "ok", tag: "served", text: "Verdict verified · settlement simulated", detail: "Fund the buyer wallet with test USDC to settle on Base Sepolia." });
      }
      break;
    case "refused": {
      const b = e.body as { message?: string; step?: number } | null;
      say(s, { role: "step", tone: "bad", tag: "refused", text: `${b?.step ? `step ${b.step} · ` : ""}${b?.message ?? `HTTP ${e.status}`}` });
      break;
    }
  }
}

export function guardedFetch(s: LabSession, opts: { label?: string } = {}) {
  const saifuro = createSaifuroClient({ apiKey: s.agentKey, baseUrl: saifuroBase() });
  const inner: typeof fetch = async (input, init) => {
    const headers = new Headers(init?.headers);
    if (opts.label) headers.set("x-lab-label", opts.label);
    const res = await fetch(input, { ...init, headers, cache: "no-store" });
    if (res.ok && headers.has("payment-signature")) {
      s.lastPaid = { path: new URL(String(input)).pathname, headers: Object.fromEntries(headers.entries()) };
    }
    return res;
  };
  return wrapFetchWithSaifuro(inner, {
    saifuro,
    x402: buyerX402(),
    reviewTimeoutMs: 180_000,
    onEvent: (e) => narrate(s, e),
    metadata: () => ({ lab_session: s.sid.slice(0, 8) }),
  });
}

export async function buy(s: LabSession, id: string, opts: { label?: string } = {}): Promise<BuyResult> {
  try {
    const res = await guardedFetch(s, opts)(`${appUrl()}/api/seller/data/${id}`);
    const body = (await res.json().catch(() => null)) as { data?: unknown; untrusted?: boolean; receipt?: { transaction: string | null; simulated: boolean }; message?: string } | null;
    if (!res.ok) return { status: "refused", id, reason: body?.message ?? `HTTP ${res.status}` };
    return { status: "delivered", id, data: body?.data, untrusted: !!body?.untrusted, transaction: body?.receipt?.transaction ?? null, simulated: !!body?.receipt?.simulated };
  } catch (e) {
    if (e instanceof SpendBlockedError) {
      say(s, {
        role: "step",
        tone: "bad",
        tag: "stopped",
        text: "Nothing signed, nothing on-chain",
        detail: "In enforce mode the buyer only signs a payment on allow.",
      });
      return { status: "blocked", id, verdict: e.decision.verdict, reason: e.decision.reason, decision: e.decision.decision };
    }
    const reason = (e as Error).message;
    say(s, { role: "step", tone: "bad", tag: "error", text: reason });
    return { status: "error", id, reason };
  }
}
