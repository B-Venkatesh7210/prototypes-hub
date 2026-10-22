import "server-only";
import type { Decision, Mandate } from "@/kit/client.ts";
import { EXPLORER, FAUCET, MAINNET_EXPLORER, mainnetBuyerAccount, mainnetUsdc, paymentsMode } from "@/lib/payments";
import { sellerLog } from "@/lib/seller/server";
import { aiConfig } from "./agent";
import { BRIEF, CATEGORY, INR_PER_USD, MERCHANT, RULES } from "./merchant";
import { orgClient, saifuroTarget, type LabSession } from "./session";

export async function labState(s: LabSession) {
  // Read before the awaits: a run that ends mid-request must not report idle with a stale decision list.
  const busy = s.busy;
  const org = await orgClient();
  const design = s.design;
  const [decisions, mandates, payments, designDecisions, designMandates, balance] = await Promise.all([
    org.decisions({ agent: s.agent, limit: 100 }),
    org.mandates({ agent: s.agent, limit: 20 }),
    paymentsMode(),
    design ? org.decisions({ agent: design.agent, limit: 100 }) : null,
    design ? org.mandates({ agent: design.agent, limit: 20 }) : null,
    mainnetUsdc(),
  ]);
  const superseded = new Set(decisions.data.map((d) => d.supersedes).filter(Boolean));
  const pending = decisions.data.filter(
    (d: Decision) =>
      d.verdict === "review" && d.review && !superseded.has(d.decision) && !s.resolvedReviews[d.review.review] && Date.parse(d.review.expires_at) > Date.now(),
  );
  const ai = aiConfig();
  const wallet = mainnetBuyerAccount()?.address;
  const all = [...decisions.data, ...(designDecisions?.data ?? [])].sort((a, b) => b.issued_at.localeCompare(a.issued_at));
  return {
    agent: s.agent,
    mandate: mandates.data.find((m: Mandate) => m.mandate === s.mandate) ?? null,
    mandates: mandates.data,
    /** Both agents' decisions, newest first. */
    decisions: all,
    pendingReviews: pending,
    messages: s.messages,
    busy,
    seller: sellerLog(s.agent),
    merchant: {
      name: MERCHANT.name,
      model: MERCHANT.modelName,
      url: MERCHANT.url,
      category: CATEGORY,
      rules: RULES,
      inrPerUsd: INR_PER_USD,
      brief: { client: BRIEF.client, text: BRIEF.text, creatives: BRIEF.creatives.map(({ id, title }) => ({ id, title })) },
      wallet: wallet ?? null,
      balance,
      explorer: MAINNET_EXPLORER,
      agent: design?.agent ?? null,
      mandate: design ? (designMandates?.data.find((m) => m.mandate === design.mandate) ?? null) : null,
      spent: design ? (designDecisions?.data ?? []).filter((d) => d.mandate === design.mandate && d.verdict === "allow").reduce((sum, d) => sum + d.request.amount, 0) : 0,
      creatives: design?.creatives ?? [],
      topup: design?.topup ?? "idle",
    },
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
