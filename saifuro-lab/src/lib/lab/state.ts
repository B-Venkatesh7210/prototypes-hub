import "server-only";
import type { Decision, Mandate } from "@/kit/client.ts";
import { EXPLORER, FAUCET, paymentsMode } from "@/lib/payments";
import { sellerLog } from "@/lib/seller/server";
import { aiConfig } from "./agent";
import { orgClient, saifuroTarget, type LabSession } from "./session";

export async function labState(s: LabSession) {
  // Read before the awaits: a run that ends mid-request must not report idle with a stale decision list.
  const busy = s.busy;
  const org = await orgClient();
  const [decisions, mandates, payments] = await Promise.all([
    org.decisions({ agent: s.agent, limit: 100 }),
    org.mandates({ agent: s.agent, limit: 20 }),
    paymentsMode(),
  ]);
  const superseded = new Set(decisions.data.map((d) => d.supersedes).filter(Boolean));
  const pending = decisions.data.filter(
    (d: Decision) =>
      d.verdict === "review" && d.review && !superseded.has(d.decision) && !s.resolvedReviews[d.review.review] && Date.parse(d.review.expires_at) > Date.now(),
  );
  const ai = aiConfig();
  return {
    agent: s.agent,
    mandate: mandates.data.find((m: Mandate) => m.mandate === s.mandate) ?? null,
    mandates: mandates.data,
    decisions: decisions.data,
    pendingReviews: pending,
    messages: s.messages,
    busy,
    seller: sellerLog(s.agent),
    status: {
      saifuro: saifuroTarget(),
      payments,
      ai: { enabled: !!ai, model: ai?.model },
      explorer: EXPLORER,
      faucet: FAUCET,
    },
  };
}

export type LabState = Awaited<ReturnType<typeof labState>>;
