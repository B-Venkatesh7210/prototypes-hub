import { LIMITS } from "@/lib/limits";
import { designVoice, keepDesignedVoice } from "@/lib/server/gradium";
import { quota, spend } from "@/lib/server/quota";
import { requireLang, requireString, respond } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  return respond(async () => {
    const body = (await req.json()) as {
      action?: "generate" | "keep";
      prompt?: unknown;
      language?: unknown;
      count?: unknown;
      candidateId?: unknown;
      name?: unknown;
    };
    if (body.action === "keep") {
      return keepDesignedVoice(
        requireString(body.candidateId, "candidateId", 200),
        requireString(body.name, "name", 80),
        requireLang(body.language),
      );
    }
    const count = Math.min(LIMITS.designCandidates, Math.max(1, Number(body.count) || LIMITS.designCandidates));
    const prompt = requireString(body.prompt, "prompt", 500);
    const lang = requireLang(body.language);
    quota.design(req);
    const result = await designVoice(prompt, lang, count);
    spend(req, result.credits, "Voice design");
    return result;
  });
}
