import { LIMITS } from "@/lib/limits";
import { cloneVoice, GradiumError } from "@/lib/server/gradium";
import { quota, spend } from "@/lib/server/quota";
import { fileBytes, requireAudioLength, requireLang, requireString, respond } from "@/lib/server/respond";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  return respond(async () => {
    const form = await req.formData();
    if (form.get("consent") !== "yes") throw new GradiumError("Voice cloning needs the speaker's consent.", 400);
    const wav = await fileBytes(form, "audio", 10);
    requireAudioLength(wav, LIMITS.server.cloneSeconds, "The voice sample");
    const name = requireString(form.get("name"), "name", 80);
    const lang = requireLang(form.get("language"));
    quota.clone(req);
    const result = await cloneVoice(wav, name, lang);
    spend(req, result.credits, "Instant voice clone");
    return result;
  });
}
