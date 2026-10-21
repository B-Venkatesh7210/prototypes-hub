import "server-only";
import { createSaifuroClient } from "@/kit/client.ts";
import { decodeSegment, encodeSegment } from "@/kit/verdict/encoding.ts";
import { VERDICT_HEADER } from "@/kit/x402.ts";
import { appUrl } from "@/lib/emulator/store";
import { sellerAddress } from "@/lib/payments";
import { datasetById } from "@/lib/seller/catalog";
import { summarize } from "./agent";
import { buy } from "./buyer";
import { orgClient, saifuroBase, say, type LabSession } from "./session";

import { SCENARIOS, type ScenarioId } from "./scenario-list";

export { SCENARIOS, type ScenarioId };

const note = (s: LabSession, text: string, tone: "info" | "warn" = "info") => say(s, { role: "note", tone, text });

async function sendToSeller(s: LabSession, id: string, headers: Record<string, string>, label: string) {
  const res = await fetch(`${appUrl()}/api/seller/data/${id}`, { headers: { ...headers, "x-lab-label": label }, cache: "no-store" });
  const body = (await res.json().catch(() => null)) as { message?: string; step?: number } | null;
  if (res.ok) say(s, { role: "step", tone: "bad", text: `Seller delivered (${res.status}). The attack worked.` });
  else say(s, { role: "step", tone: "ok", text: `Seller refused (${res.status})${body?.step ? ` at step ${body.step}` : ""}: ${body?.message ?? "rejected"}` });
}

/** A paid request the attacks can reuse. Buys the cheapest dataset if this session has none yet. */
async function lastPaid(s: LabSession) {
  if (!s.lastPaid) {
    note(s, "First, one legitimate purchase to have an approval to attack.");
    await buy(s, "spot-prices");
  }
  return s.lastPaid;
}

export async function runScenario(s: LabSession, id: ScenarioId) {
  say(s, { role: "user", text: `${SCENARIOS[id].side === "seller" ? "Attack" : "Scenario"}: ${SCENARIOS[id].title}` });
  switch (id) {
    case "research": {
      const data: Record<string, unknown> = {};
      for (const ds of ["stablecoin-supply", "chain-tvl"]) {
        const r = await buy(s, ds);
        if (r.status === "delivered") data[ds] = r.data;
      }
      if (Object.keys(data).length) await summarize(s, "Which chains lead in stablecoin supply and in DeFi TVL right now, and where does Base stand?", data);
      return;
    }
    case "injection": {
      const r = await buy(s, "community-wire");
      if (r.status !== "delivered") return;
      const lines = (r.data as { headlines?: string[] }).headlines ?? [];
      const injected = lines.find((l) => l.startsWith("AGENT NOTICE"));
      if (injected) say(s, { role: "note", tone: "warn", text: `The feed contains: "${injected}"` });
      note(s, "Scripted: the agent behaves like a model that obeys the injected instruction. Its prompt said 0.50 USDC per purchase; that was only a request.", "warn");
      const r2 = await buy(s, "institutional-report");
      if (r2.status === "blocked") say(s, { role: "agent", text: `I tried to buy the institutional report because the feed told me to, and Saifuro denied it (${r2.verdict}: ${r2.reason}). No payment was signed.` });
      return;
    }
    case "runaway": {
      note(s, "Scripted: a retry loop fires 12 requests for spot-prices, three at a time. The frequency rule is fixed: an agent with 10 decisions in the last 60 seconds is denied.");
      const results: string[] = [];
      for (let i = 0; i < 12; i += 3) {
        const batch = await Promise.all([0, 1, 2].map(() => buy(s, "spot-prices")));
        results.push(...batch.map((b) => (b.status === "blocked" ? b.verdict : b.status)));
      }
      const denied = results.filter((r) => r === "deny_velocity").length;
      say(s, { role: "agent", text: `Loop finished: ${results.length - denied} purchases went through, ${denied} were denied with deny_velocity. In enforce mode the loop stops spending within the minute.` });
      return;
    }
    case "review": {
      const r = await buy(s, "base-deep-dive");
      if (r.status === "delivered") await summarize(s, "How have TVL and stablecoin supply on Base changed over the last 90 days?", { "base-deep-dive": r.data });
      else if (r.status === "blocked") say(s, { role: "agent", text: `The deep dive was not bought: ${r.verdict}. ${r.verdict === "review" ? "Nobody approved it in time." : r.reason}` });
      return;
    }
    case "category": {
      const r = await buy(s, "gpu-minute");
      if (r.status === "blocked") say(s, { role: "agent", text: `Compute is outside my mandate (${r.reason}). That usually means the allowed list needs an update, not a finance conversation.` });
      return;
    }
    case "revoke": {
      const org = await orgClient();
      const m = await org.revokeMandate(s.mandate);
      say(s, { role: "step", tone: "warn", text: `Operator revoked ${m.mandate}. No change to the agent's code or wallet.` });
      await buy(s, "spot-prices");
      note(s, "Issue a new mandate from the Saifuro panel to let the agent spend again.");
      return;
    }
    case "replay": {
      const paid = await lastPaid(s);
      if (!paid) return;
      note(s, `Resending the exact headers of the last paid request (${paid.path.split("/").pop()}): same verdict, same payment signature.`);
      await sendToSeller(s, paid.path.split("/").pop()!, paid.headers, "replay attack");
      return;
    }
    case "tamper": {
      const paid = await lastPaid(s);
      if (!paid) return;
      const token = paid.headers[VERDICT_HEADER.toLowerCase()];
      const [h, p, sig] = token.split(".");
      const claims = JSON.parse(new TextDecoder().decode(decodeSegment(p)!));
      const before = claims.request.amount;
      claims.request.amount = 900;
      const forged = `${h}.${encodeSegment(new TextEncoder().encode(JSON.stringify(claims)))}.${sig}`;
      note(s, `Took the approval for ${before} USDC, changed request.amount to 900, kept the signature, and presented it for the institutional report.`);
      await sendToSeller(s, "institutional-report", { ...paid.headers, [VERDICT_HEADER.toLowerCase()]: forged }, "tamper attack");
      return;
    }
    case "swap": {
      const paid = await lastPaid(s);
      if (!paid) return;
      const cheap = datasetById("spot-prices")!;
      const agent = createSaifuroClient({ apiKey: s.agentKey, baseUrl: saifuroBase() });
      const d = await agent.authorize({ amount: Number(cheap.price), currency: "USDC", recipient: sellerAddress() ?? "", category: "data", protocol: "x402" });
      say(s, { role: "step", tone: d.verdict === "allow" ? "ok" : "bad", text: `Got a fresh ${d.verdict} for ${cheap.price} USDC (${d.decision}).` });
      note(s, "Presenting that approval for base-deep-dive, which costs 0.30 USDC.");
      await sendToSeller(s, "base-deep-dive", { ...paid.headers, [VERDICT_HEADER.toLowerCase()]: d.verdict_token }, "swap attack");
      return;
    }
  }
}
