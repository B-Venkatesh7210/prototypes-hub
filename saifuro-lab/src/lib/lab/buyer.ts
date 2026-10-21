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
      say(s, { role: "step", tone: "info", text: `402 Payment Required: ${title} costs ${e.amount} ${e.currency}. Asking Saifuro before paying.` });
      break;
    case "decision": {
      const d = e.decision;
      const tone = d.verdict === "allow" ? "ok" : d.verdict === "review" ? "warn" : "bad";
      const text = d.supersedes ? `Saifuro: allow (review approved) · ${d.reason}` : `Saifuro: ${d.verdict} · ${d.reason}`;
      say(s, { role: "step", tone, text, detail: d.decision });
      break;
    }
    case "review_wait":
      say(s, { role: "note", tone: "warn", text: `Held for ${e.decision.review?.waits_for}. Approve or deny it in the Saifuro panel; the agent waits.` });
      break;
    case "payment_signed":
      say(s, { role: "step", tone: "info", text: `Signed an x402 payment: ${e.amount} ${e.currency} to ${short(e.payTo)} (EIP-3009, nothing moves until the seller settles).` });
      break;
    case "delivered":
      if (e.transaction) {
        say(s, { role: "step", tone: "ok", text: "Seller verified the verdict and settled on Base Sepolia.", link: { href: `${EXPLORER}/tx/${e.transaction}`, label: short(e.transaction) } });
      } else say(s, { role: "step", tone: "ok", text: "Seller verified the verdict. Settlement simulated (fund the buyer wallet to go live)." });
      break;
    case "refused": {
      const b = e.body as { message?: string; step?: number } | null;
      say(s, { role: "step", tone: "bad", text: `Seller refused (${e.status})${b?.step ? ` at step ${b.step}` : ""}: ${b?.message ?? "no reason given"}` });
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
      say(s, { role: "step", tone: "bad", text: "Stopped before payment: nothing signed, nothing on-chain." });
      return { status: "blocked", id, verdict: e.decision.verdict, reason: e.decision.reason, decision: e.decision.decision };
    }
    const reason = (e as Error).message;
    say(s, { role: "step", tone: "bad", text: `Purchase failed: ${reason}` });
    return { status: "error", id, reason };
  }
}
