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

const note = (s: LabSession, text: string, opts: { tone?: "info" | "warn"; detail?: string } = {}) =>
  say(s, { role: "note", tone: opts.tone ?? "info", text, detail: opts.detail });

async function sendToSeller(s: LabSession, id: string, headers: Record<string, string>, label: string) {
  const res = await fetch(`${appUrl()}/api/seller/data/${id}`, { headers: { ...headers, "x-lab-label": label }, cache: "no-store" });
  const body = (await res.json().catch(() => null)) as { message?: string; step?: number } | null;
  if (res.ok) say(s, { role: "step", tone: "bad", tag: "served", text: `Seller delivered (${res.status}): the attack worked` });
  else say(s, { role: "step", tone: "ok", tag: "refused", text: `${body?.step ? `step ${body.step} · ` : ""}${body?.message ?? `HTTP ${res.status}`}` });
}

/** A paid request the attacks can reuse. Buys the cheapest dataset if this session has none yet. */
async function lastPaid(s: LabSession) {
  if (!s.lastPaid) {
    note(s, "One real purchase first, to have an approval to attack");
    await buy(s, "spot-prices");
  }
  return s.lastPaid;
}

export async function runScenario(s: LabSession, id: ScenarioId) {
  say(s, { role: "user", text: `${SCENARIOS[id].side === "seller" ? "Attack" : "Run"}: ${SCENARIOS[id].title}` });
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
      if (injected) note(s, "The feed tells the agent to buy the 900 USDC report", { tone: "warn", detail: `“${injected}”` });
      note(s, "The agent obeys (scripted)", {
        tone: "warn",
        detail: "Real models sometimes resist injections, so this turn is scripted. The prompt said 0.50 USDC per purchase; that was only a request.",
      });
      const r2 = await buy(s, "institutional-report");
      if (r2.status === "blocked") say(s, { role: "agent", text: `I tried to buy the institutional report because the feed told me to. Saifuro denied it (${r2.verdict}), so no payment was signed.` });
      return;
    }
    case "runaway": {
      note(s, "A retry loop fires 12 requests, 3 at a time (scripted)", {
        detail: "Saifuro's frequency rule is fixed: more than 10 decisions for one agent in 60 seconds is deny_velocity.",
      });
      const results: string[] = [];
      for (let i = 0; i < 12; i += 3) {
        const batch = await Promise.all([0, 1, 2].map(() => buy(s, "spot-prices")));
        results.push(...batch.map((b) => (b.status === "blocked" ? b.verdict : b.status)));
      }
      const denied = results.filter((r) => r === "deny_velocity").length;
      say(s, { role: "agent", text: `Loop finished: ${results.length - denied} purchases went through and ${denied} were denied with deny_velocity.` });
      return;
    }
    case "review": {
      const r = await buy(s, "base-deep-dive");
      if (r.status === "delivered") await summarize(s, "How have TVL and stablecoin supply on Base changed over the last 90 days?", { "base-deep-dive": r.data });
      else if (r.status === "blocked") say(s, { role: "agent", text: `The deep dive was not bought: ${r.verdict === "review" ? "nobody approved it in time" : r.reason}.` });
      return;
    }
    case "category": {
      const r = await buy(s, "gpu-minute");
      if (r.status === "blocked") say(s, { role: "agent", text: "GPU compute is outside my mandate, which allows data only. The operator would need to add the compute category." });
      return;
    }
    case "revoke": {
      const org = await orgClient();
      const m = await org.revokeMandate(s.mandate);
      say(s, { role: "step", tone: "warn", tag: "revoked", text: m.mandate, detail: "The operator revoked the mandate. Nothing changed in the agent's code or wallet." });
      await buy(s, "spot-prices");
      note(s, "Issue a new mandate to resume");
      return;
    }
    case "replay": {
      const paid = await lastPaid(s);
      if (!paid) return;
      note(s, "Resending the last paid request unchanged", { detail: "Same verdict and same payment signature, sent a second time." });
      await sendToSeller(s, paid.path.split("/").pop()!, paid.headers, "Replay attack");
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
      note(s, `Approved amount edited: ${before} → 900 USDC`, { detail: "The signature is kept as it was; the forged verdict is presented for the 900 USDC report." });
      await sendToSeller(s, "institutional-report", { ...paid.headers, [VERDICT_HEADER.toLowerCase()]: forged }, "Tamper attack");
      return;
    }
    case "swap": {
      const paid = await lastPaid(s);
      if (!paid) return;
      const cheap = datasetById("spot-prices")!;
      const agent = createSaifuroClient({ apiKey: s.agentKey, baseUrl: saifuroBase() });
      const d = await agent.authorize({ amount: Number(cheap.price), currency: "USDC", recipient: sellerAddress() ?? "", category: "data", protocol: "x402" });
      say(s, { role: "step", tone: d.verdict === "allow" ? "ok" : "bad", tag: d.verdict, text: `fresh approval for ${cheap.price} USDC`, detail: `Decision ${d.decision}` });
      note(s, "Presented for the 0.30 USDC deep dive");
      await sendToSeller(s, "base-deep-dive", { ...paid.headers, [VERDICT_HEADER.toLowerCase()]: d.verdict_token }, "Swap attack");
      return;
    }
  }
}
