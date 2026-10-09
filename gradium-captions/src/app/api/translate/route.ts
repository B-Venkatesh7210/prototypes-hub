import { LIMITS, PRICES } from "@/lib/limits";
import { translate } from "@/lib/server/gradium";
import { guardCredits, spend } from "@/lib/server/quota";
import { fileBytes, requireAudioLength, requireLang, respond } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  return respond(req, async () => {
    const form = await req.formData();
    const wav = await fileBytes(form, "audio", 10);
    const seconds = requireAudioLength(wav, LIMITS.server.translateSeconds);
    guardCredits(req, Math.ceil(seconds * PRICES.translatePerSecond));
    const result = await translate({
      wav,
      seconds,
      text: String(form.get("text") ?? "").slice(0, 4000),
      source: requireLang(form.get("source"), "source"),
      target: requireLang(form.get("target"), "target"),
    });
    spend(req, result.credits, "Speech-to-text translation");
    return result;
  });
}
