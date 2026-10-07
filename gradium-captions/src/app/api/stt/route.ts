import { LIMITS, PRICES } from "@/lib/limits";
import { transcribe } from "@/lib/server/gradium";
import { guardCredits, spend } from "@/lib/server/quota";
import { fileBytes, requireAudioLength, requireLang, respond } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function POST(req: Request) {
  return respond(async () => {
    const form = await req.formData();
    const wav = await fileBytes(form, "audio", 5);
    const seconds = requireAudioLength(wav, LIMITS.server.sttSeconds);
    const lang = requireLang(form.get("language"));
    const keywords = String(form.get("keywords") ?? "")
      .split(",")
      .map((k) => k.trim())
      .filter(Boolean)
      .slice(0, 20);
    guardCredits(req, Math.ceil(seconds * PRICES.sttPerSecond));
    const result = await transcribe(wav, lang, keywords);
    spend(req, result.credits, "Speech-to-Text");
    return result;
  });
}
