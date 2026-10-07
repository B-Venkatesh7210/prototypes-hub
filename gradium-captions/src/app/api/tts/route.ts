import { LIMITS } from "@/lib/limits";
import { synthesize } from "@/lib/server/gradium";
import { guardCredits, spend } from "@/lib/server/quota";
import { requireString, respond } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  return respond(async () => {
    const body = (await req.json()) as { text?: unknown; voiceId?: unknown };
    const text = requireString(body.text, "text", LIMITS.server.ttsChars);
    const voiceId = requireString(body.voiceId, "voiceId", 200);
    guardCredits(req, text.length);
    const result = await synthesize(text, voiceId);
    spend(req, result.credits, "Text-to-Speech");
    return result;
  });
}
