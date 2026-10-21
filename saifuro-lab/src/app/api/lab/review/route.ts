import { SaifuroError } from "@/kit/client.ts";
import { currentSession, errorResponse } from "@/lib/lab/http";
import { orgClient, say } from "@/lib/lab/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const s = await currentSession();
    const { review, action } = (await req.json().catch(() => ({}))) as { review?: string; action?: "approve" | "deny" };
    if (!review || !/^rev_[0-9a-f]+$/.test(review) || (action !== "approve" && action !== "deny")) return Response.json({ error: "review and action required" }, { status: 400 });
    const org = await orgClient();
    try {
      if (action === "approve") {
        const d = await org.approveReview(review);
        s.resolvedReviews[review] = "approved";
        say(s, {
          role: "step",
          tone: "ok",
          tag: "approved",
          text: `${review} by role:research_lead`,
          detail: `Saifuro issued a fresh allow (${d.decision}) that supersedes ${d.supersedes}.`,
        });
        return Response.json(d);
      }
      await org.denyReview(review);
      s.resolvedReviews[review] = "denied";
      say(s, { role: "step", tone: "bad", tag: "denied", text: review, detail: "A denied review issues no decision, so the agent only learns when its wait times out." });
      return Response.json({ review, status: "denied" });
    } catch (e) {
      if (e instanceof SaifuroError) return Response.json({ error: e.message, code: e.code }, { status: e.status });
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
