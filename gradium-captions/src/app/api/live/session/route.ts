import { LIMITS, PRICES } from "@/lib/limits";
import { liveSession } from "@/lib/server/gradium";
import { guardCredits, quota, spend } from "@/lib/server/quota";
import { respond } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The browser streams straight to Gradium, so the server reserves a full session's worth of credits up front. */
const SESSION_CREDITS = LIMITS.liveSeconds * PRICES.sttPerSecond;

export async function POST(req: Request) {
  return respond(req, async () => {
    guardCredits(req, SESSION_CREDITS);
    quota.liveSession(req);
    const session = await liveSession();
    spend(req, SESSION_CREDITS, `Realtime STT session (reserved ${LIMITS.liveSeconds}s)`, { reconcile: false });
    return { ...session, maxSeconds: LIMITS.liveSeconds };
  });
}
