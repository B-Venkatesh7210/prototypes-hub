/**
 * Vercel AI SDK helper: a tool that lets a model fetch paid resources through a Saifuro-guarded fetch.
 * The model chooses what to buy; the mandate decides whether it may pay. A denial comes back to the
 * model as a tool result it can explain, not as an exception.
 */
import { tool } from "ai";
import { z } from "zod";
import { SpendBlockedError } from "./x402.ts";

export function createPaidFetchTool({
  fetch: guardedFetch,
  baseUrl,
  description = "Fetch a paid HTTP resource. Payment is made in USDC over x402 and must be authorized by your operator's Saifuro mandate.",
}: {
  fetch: typeof fetch;
  /** Only URLs under this origin can be fetched. */
  baseUrl: string;
  description?: string;
}) {
  const origin = new URL(baseUrl).origin;
  return tool({
    description,
    inputSchema: z.object({
      path: z.string().describe("Path of the resource, e.g. /api/seller/data/chain-tvl"),
      reason: z.string().describe("Why you need it, recorded with the purchase"),
    }),
    execute: async ({ path }) => {
      const url = new URL(path, origin);
      if (url.origin !== origin) return { ok: false, error: "only resources on the configured seller can be fetched" };
      try {
        const res = await guardedFetch(url);
        const body = await res.json().catch(() => null);
        return res.ok ? { ok: true, body } : { ok: false, status: res.status, error: (body as { message?: string } | null)?.message ?? `HTTP ${res.status}` };
      } catch (e) {
        if (e instanceof SpendBlockedError) return { ok: false, blocked: true, verdict: e.decision.verdict, reason: e.decision.reason };
        return { ok: false, error: (e as Error).message };
      }
    },
  });
}
