import { currentSession, errorResponse } from "@/lib/lab/http";
import { DEFAULT_MANDATE, issueMandate, orgClient, say } from "@/lib/lab/session";

export const dynamic = "force-dynamic";

const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? Math.round(v * 1e6) / 1e6 : undefined);

export async function POST(req: Request) {
  try {
    const s = await currentSession();
    const body = (await req.json().catch(() => ({}))) as {
      action?: "revoke" | "new";
      per_transaction?: number;
      per_month?: number;
      review_above?: number;
      categories?: string[];
    };
    const org = await orgClient();
    if (body.action === "revoke") {
      const m = await org.revokeMandate(s.mandate);
      say(s, { role: "step", tone: "warn", text: `Operator revoked ${m.mandate}. Takes effect on the next request.` });
      return Response.json(m);
    }
    if (body.action === "new") {
      const categories = Array.isArray(body.categories) ? body.categories.filter((c) => /^[a-z_]{1,32}$/.test(c)).slice(0, 5) : undefined;
      const limits = {
        per_transaction: num(body.per_transaction, 0.001, 1000) ?? DEFAULT_MANDATE.per_transaction,
        per_month: num(body.per_month, 0.001, 10000) ?? DEFAULT_MANDATE.per_month,
        review_above: num(body.review_above, 0.001, 1000) ?? DEFAULT_MANDATE.review_above,
        categories: categories?.length ? categories : DEFAULT_MANDATE.categories,
      };
      const previous = s.mandate;
      const prev = await org.mandates({ agent: s.agent, status: "active" });
      for (const m of prev.data) await org.revokeMandate(m.mandate);
      const m = await issueMandate(s.agent, limits);
      s.mandate = m.mandate;
      say(s, {
        role: "step",
        tone: "ok",
        text: `New mandate ${m.mandate}: ${m.limits.per_transaction} USDC per purchase, ${m.limits.per_month} per 30 days, review above ${m.review_above}, categories ${m.categories.join(", ")}. ${previous} stays in the log, revoked.`,
      });
      return Response.json(m);
    }
    return Response.json({ error: "action must be revoke or new" }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}
