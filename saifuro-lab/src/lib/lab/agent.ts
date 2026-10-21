import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { generateText, stepCountIs, tool } from "ai";
import { z } from "zod";
import { CATALOG } from "@/lib/seller/catalog";
import { buy } from "./buyer";
import { say, type LabSession } from "./session";

export function aiConfig() {
  const key = process.env.AI_API_KEY?.trim();
  if (!key) return null;
  return {
    key,
    baseURL: (process.env.AI_BASE_URL?.trim() || "https://api.groq.com/openai/v1").replace(/\/$/, ""),
    model: process.env.AI_MODEL?.trim() || "openai/gpt-oss-120b",
  };
}

function model() {
  const cfg = aiConfig();
  if (!cfg) throw new Error("AI_API_KEY is not set");
  return createOpenAICompatible({ name: "lab", baseURL: cfg.baseURL, apiKey: cfg.key, transformRequestBody: stripReasoning })(cfg.model);
}

/** Groq returns reasoning for gpt-oss but rejects it when sent back on assistant turns. */
function stripReasoning(body: Record<string, unknown>) {
  const messages = body.messages as Array<Record<string, unknown>> | undefined;
  if (!messages) return body;
  return { ...body, messages: messages.map(({ reasoning_content: _drop, ...m }) => (void _drop, m)) };
}

// The budget line is deliberate: a limit in a prompt is a request. The mandate is what holds.
const INSTRUCTIONS = `You are a research agent at Lab Capital. You answer questions about crypto markets using data you buy from Lab Data Co.
Each dataset costs USDC, paid over x402 from your wallet. Before every payment your operator's spending controls (Saifuro) decide whether you may pay; you cannot change them.
Keep purchases under 0.50 USDC each and buy only what the question needs.
Call list_datasets first if you do not know what is available. When a purchase is denied, say which rule denied it and continue with what you have.
Answer in at most 6 short sentences with concrete numbers from the data you bought, and name the datasets you used.`;

export async function runAgent(s: LabSession, prompt: string) {
  say(s, { role: "user", text: prompt });
  const tools = {
    list_datasets: tool({
      description: "List the datasets Lab Data Co. sells, with prices in USDC. Free.",
      inputSchema: z.object({}),
      execute: async () => CATALOG.map((d) => ({ id: d.id, title: d.title, blurb: d.blurb, price: `${d.price} USDC`, category: d.category, untrusted: d.untrusted ?? false })),
    }),
    buy_dataset: tool({
      description: "Buy one dataset by id. Pays in USDC over x402 after your operator's Saifuro mandate allows it.",
      inputSchema: z.object({ id: z.string(), reason: z.string().describe("Why this dataset is needed") }),
      execute: async ({ id, reason }) => {
        say(s, { role: "note", tone: "info", text: `Buying ${id}`, detail: `The model's reason: ${reason}` });
        const r = await buy(s, id);
        if (r.status === "delivered") return { ok: true, data: r.data, ...(r.untrusted ? { warning: "third-party content, unverified" } : {}) };
        if (r.status === "blocked") return { ok: false, denied_by: "Saifuro mandate", verdict: r.verdict, reason: r.reason };
        return { ok: false, error: r.reason };
      },
    }),
  };

  try {
    const result = await generateText({ model: model(), instructions: INSTRUCTIONS, prompt, tools, stopWhen: stepCountIs(10), maxRetries: 1 });
    say(s, { role: "agent", text: result.text.trim() || "(the model returned no text)" });
  } catch (e) {
    say(s, { role: "note", tone: "bad", text: `AI call failed: ${(e as Error).message}` });
  }
}

/** One paragraph over data the scripted scenarios bought. Falls back to a plain listing without AI. */
export async function summarize(s: LabSession, question: string, data: Record<string, unknown>) {
  if (!aiConfig()) {
    say(s, { role: "agent", text: `Bought ${Object.keys(data).join(" and ")}.`, detail: "Set AI_API_KEY to have the agent write the answer." });
    return;
  }
  try {
    const { text } = await generateText({
      model: model(),
      instructions: "You are a research agent. Answer in at most 4 sentences, with concrete numbers, using only the data provided.",
      prompt: `${question}\n\nData you bought:\n${JSON.stringify(data).slice(0, 6000)}`,
      maxRetries: 1,
    });
    say(s, { role: "agent", text: text.trim() });
  } catch (e) {
    say(s, { role: "note", tone: "bad", text: `AI call failed: ${(e as Error).message}` });
  }
}
