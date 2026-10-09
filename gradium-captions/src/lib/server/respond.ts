import { isLang } from "@/lib/langs";
import type { Lang } from "@/lib/types";
import { decodeWav } from "@/lib/wav";
import { GradiumError } from "./gradium";
import { withRequestKey } from "./gradium/config";

/** Runs a route with the visitor's API key in scope and turns errors into JSON. */
export async function respond<T>(req: Request, work: () => Promise<T>): Promise<Response> {
  try {
    return Response.json(await withRequestKey(req, work));
  } catch (err) {
    const status = err instanceof GradiumError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Unexpected error";
    const code = err instanceof GradiumError ? err.code : undefined;
    if (code !== "needs_key") console.error("[gradium-captions]", message);
    return Response.json({ error: message, code }, { status });
  }
}

export function requireLang(value: unknown, field = "language"): Lang {
  if (!isLang(value)) throw new GradiumError(`Invalid ${field}. Use one of en, fr, de, es, pt.`, 400);
  return value;
}

export function requireString(value: unknown, field: string, max = 20000): string {
  if (typeof value !== "string" || !value.trim()) throw new GradiumError(`Missing ${field}.`, 400);
  if (value.length > max) throw new GradiumError(`${field} is too long (max ${max} characters).`, 413);
  return value;
}

/** Reads the WAV duration and rejects audio longer than `maxSeconds`. */
export function requireAudioLength(wav: Uint8Array, maxSeconds: number, what = "Audio"): number {
  let seconds: number;
  try {
    const decoded = decodeWav(wav);
    seconds = decoded.samples.length / decoded.sampleRate;
  } catch {
    throw new GradiumError("Audio must be a WAV file.", 400);
  }
  if (seconds > maxSeconds + 0.25) {
    throw new GradiumError(`${what} is ${seconds.toFixed(1)}s long. This demo accepts up to ${maxSeconds}s.`, 413);
  }
  return seconds;
}

export async function fileBytes(form: FormData, field: string, maxMb = 200): Promise<Uint8Array> {
  const file = form.get(field);
  if (!(file instanceof Blob) || file.size === 0) throw new GradiumError(`Missing ${field} file.`, 400);
  if (file.size > maxMb * 1024 * 1024) throw new GradiumError(`${field} is larger than ${maxMb} MB.`, 413);
  return new Uint8Array(await file.arrayBuffer());
}
