import { LIMITS } from "@/lib/limits";
import { PREVIEW_TEXT } from "@/lib/previews";
import { customVoices, GradiumError, status, synthesize } from "@/lib/server/gradium";
import { guardCredits, spend } from "@/lib/server/quota";
import { fileBytes, requireAudioLength, respond } from "@/lib/server/respond";
import { readSample, saveSample, validVoiceId } from "@/lib/server/voice-store";
import { base64ToBytes } from "@/lib/wav";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Plays the stored preview of a saved voice. Free. */
export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  const wav = validVoiceId(id) ? readSample(id) : null;
  if (!wav) return Response.json({ error: "No stored preview for this voice." }, { status: 404 });
  return new Response(new Uint8Array(wav), { headers: { "Content-Type": "audio/wav", "Cache-Control": "private, max-age=86400" } });
}

/**
 * Stores a preview for a saved voice that has none. A kept design can reuse the candidate audio the
 * user already heard; anything else speaks the preview line once in that voice with Gradium.
 */
export async function POST(req: Request) {
  return respond(async () => {
    const id = new URL(req.url).searchParams.get("id");
    if (!validVoiceId(id)) throw new GradiumError("Invalid voice id.", 400);
    const voice = (await customVoices()).find((v) => v.id === id);
    if (!voice) throw new GradiumError("This voice isn't saved on the account.", 404);
    const mock = status().mode !== "live";
    if (voice.hasSample) return { stored: true, credits: 0, mock };

    if (voice.kind === "design" && req.headers.get("content-type")?.includes("multipart/form-data")) {
      const wav = await fileBytes(await req.formData(), "audio", 5);
      requireAudioLength(wav, LIMITS.server.cloneSeconds, "The preview");
      saveSample(id, wav);
      return { stored: true, credits: 0, mock };
    }

    const text = PREVIEW_TEXT[voice.lang ?? "en"];
    guardCredits(req, text.length);
    const result = await synthesize(text, id);
    saveSample(id, base64ToBytes(result.audio));
    spend(req, result.credits, "Voice preview (stored)");
    return { stored: true, credits: result.credits, mock: result.mock };
  });
}
