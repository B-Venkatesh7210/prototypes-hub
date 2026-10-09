import { GradiumError, status } from "@/lib/server/gradium";
import { liveCredits } from "@/lib/server/gradium/live";
import { respond } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Checks the key in the request header by reading its balance. Costs no credits. */
export async function POST(req: Request) {
  return respond(req, async () => {
    const { mode, hasKey } = status();
    if (!hasKey) throw new GradiumError("That doesn't look like a Gradium API key.", 400, "bad_key");
    if (mode !== "live") return { mode, account: null };
    try {
      return { mode, account: await liveCredits() };
    } catch (err) {
      if (err instanceof GradiumError && (err.status === 401 || err.status === 403)) {
        throw new GradiumError("Gradium rejected this key. Check that you copied all of it.", 401, "bad_key");
      }
      throw err;
    }
  });
}
