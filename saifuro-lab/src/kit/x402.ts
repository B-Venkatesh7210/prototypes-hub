/**
 * Buyer side: wraps fetch so every x402 payment is authorized by Saifuro first.
 *
 *   402 Payment Required → POST /v1/authorizations → allow? → sign x402 payment → retry with
 *   PAYMENT-SIGNATURE + Saifuro-Verdict → seller verifies both → data
 *
 * Anything but `allow` in enforce mode stops before a payment is signed, so a denied purchase never
 * reaches the chain.
 */
import type { x402HTTPClient } from "@x402/core/client";
import type { PaymentRequired, PaymentRequirements } from "@x402/core/types";
import { fromUnits } from "./verdict/decimal.ts";
import type { Decision, SaifuroClient } from "./client.ts";

export const VERDICT_HEADER = "Saifuro-Verdict";
/** Key of the x402 extension a seller uses to say how to phrase the authorization request. */
export const SAIFURO_EXTENSION = "saifuro-verdict";

export type SaifuroExtension = {
  /** Exactly what the seller will compare against the verdict (steps 9–11). */
  amount: string;
  currency: string;
  recipient: string;
  category?: string;
  issuers?: string[];
};

export type SpendEvent =
  | { type: "quote"; url: string; amount: string; currency: string; recipient: string; category: string; network: string }
  | { type: "decision"; url: string; decision: Decision }
  | { type: "review_wait"; url: string; decision: Decision }
  | { type: "payment_signed"; url: string; amount: string; currency: string; payTo: string; network: string }
  | { type: "delivered"; url: string; status: number; transaction?: string; network?: string }
  | { type: "refused"; url: string; status: number; body: unknown };

export class SpendBlockedError extends Error {
  readonly decision: Decision;
  constructor(decision: Decision) {
    super(`${decision.verdict}: ${decision.reason}`);
    this.decision = decision;
  }
}

export type SaifuroFetchOptions = {
  saifuro: SaifuroClient;
  x402: x402HTTPClient;
  /** Spend category for the mandate check. Defaults to what the seller suggests, then "data". */
  category?: string | ((url: string, ext?: SaifuroExtension) => string);
  /** How long to wait for a person when the verdict is `review`. 0 disables waiting. */
  reviewTimeoutMs?: number;
  onEvent?: (e: SpendEvent) => void;
  metadata?: (url: string) => Record<string, string> | undefined;
};

/** Without a seller extension: the amount in major units, assuming 6-decimal USDC-style assets. */
function quoteFrom(req: PaymentRequirements, ext?: SaifuroExtension) {
  if (ext) return { amount: ext.amount, currency: ext.currency, recipient: ext.recipient };
  const decimals = typeof req.extra?.decimals === "number" ? req.extra.decimals : 6;
  return { amount: fromUnits(BigInt(req.amount), decimals), currency: String(req.extra?.name ?? "USDC").replace(/^USD Coin$/, "USDC"), recipient: req.payTo };
}

export function wrapFetchWithSaifuro(fetchImpl: typeof fetch, opts: SaifuroFetchOptions): typeof fetch {
  return async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const first = await fetchImpl(input, init);
    if (first.status !== 402) return first;

    const body = await first.json().catch(() => undefined);
    const required: PaymentRequired = opts.x402.getPaymentRequiredResponse((n) => first.headers.get(n), body);
    const accepted = required.accepts[0];
    if (!accepted) throw new Error("402 response offers no payment option");
    const ext = required.extensions?.[SAIFURO_EXTENSION] as SaifuroExtension | undefined;
    const quote = quoteFrom(accepted, ext);
    const category = typeof opts.category === "function" ? opts.category(url, ext) : (opts.category ?? ext?.category ?? "data");
    opts.onEvent?.({ type: "quote", url, ...quote, category, network: accepted.network });

    let decision = await opts.saifuro.authorize(
      { amount: Number(quote.amount), currency: quote.currency, recipient: quote.recipient, category, protocol: "x402", metadata: opts.metadata?.(url) },
      { idempotencyKey: crypto.randomUUID() },
    );
    opts.onEvent?.({ type: "decision", url, decision });

    if (decision.verdict === "review" && (opts.reviewTimeoutMs ?? 120_000) > 0) {
      opts.onEvent?.({ type: "review_wait", url, decision });
      const approved = await opts.saifuro.waitForApproval(decision, { timeoutMs: opts.reviewTimeoutMs ?? 120_000 });
      if (approved) {
        decision = approved;
        opts.onEvent?.({ type: "decision", url, decision });
      }
    }
    if (decision.verdict !== "allow" && decision.mode === "enforce") throw new SpendBlockedError(decision);

    const payload = await opts.x402.createPaymentPayload(required);
    opts.onEvent?.({ type: "payment_signed", url, amount: quote.amount, currency: quote.currency, payTo: accepted.payTo, network: accepted.network });

    const headers = new Headers(init?.headers);
    for (const [k, v] of Object.entries(opts.x402.encodePaymentSignatureHeader(payload))) headers.set(k, v);
    headers.set(VERDICT_HEADER, decision.verdict_token);
    const paid = await fetchImpl(input, { ...init, headers });

    if (!paid.ok) {
      const reason = await paid.clone().json().catch(() => null);
      opts.onEvent?.({ type: "refused", url, status: paid.status, body: reason });
      return paid;
    }
    let transaction: string | undefined;
    let network: string | undefined;
    try {
      const settle = opts.x402.getPaymentSettleResponse((n) => paid.headers.get(n));
      transaction = settle.transaction;
      network = settle.network;
    } catch {
      // no settlement header
    }
    opts.onEvent?.({ type: "delivered", url, status: paid.status, transaction, network });
    return paid;
  };
}
