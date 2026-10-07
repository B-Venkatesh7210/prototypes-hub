import type { AccountCredits, DesignResult, Lang, SttResult, TimedText, TtsResult } from "@/lib/types";
import { base64ToBytes, bytesToBase64, decodeWav, encodeWav, pcm16ToFloat, resample } from "@/lib/wav";
import { round, segmentsToWords, type BareWord } from "@/lib/words";
import { apiBase, apiKey, GradiumError, readError } from "./config";

const MAX_SESSION_S = 2900;
const TTS_CHUNK_CHARS = 1500;

type StreamMessage = {
  type: string;
  text?: string;
  start_s?: number;
  stop_s?: number;
  audio?: string;
  message?: string;
};

async function* ndjson(res: Response): AsyncGenerator<StreamMessage> {
  if (!res.body) return;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      if (line) yield JSON.parse(line) as StreamMessage;
      newline = buffer.indexOf("\n");
    }
  }
  const rest = buffer.trim();
  if (rest) yield JSON.parse(rest) as StreamMessage;
}

/** Turns streamed `text` + `end_text` messages into closed segments. */
function collectSegments(messages: StreamMessage[], duration: number): TimedText[] {
  const segments: TimedText[] = [];
  for (const msg of messages) {
    if (msg.type === "text" && msg.text?.trim()) {
      const prev = segments[segments.length - 1];
      if (prev && prev.end < 0) prev.end = msg.start_s ?? prev.start;
      segments.push({ text: msg.text.trim(), start: msg.start_s ?? prev?.end ?? 0, end: msg.stop_s ?? -1 });
    } else if (msg.type === "end_text") {
      const prev = segments[segments.length - 1];
      if (prev && prev.end < 0 && typeof msg.stop_s === "number") prev.end = msg.stop_s;
    }
  }
  segments.forEach((seg, i) => {
    if (seg.end < 0) seg.end = segments[i + 1]?.start ?? Math.max(seg.start + 0.3, duration);
  });
  return segments;
}

function throwIfError(msg: StreamMessage) {
  if (msg.type === "error") throw new GradiumError(msg.message || "Gradium stream error");
}

export async function liveTranscribe(wav: Uint8Array, lang: Lang, keywords: string[]): Promise<SttResult> {
  const decoded = decodeWav(wav);
  const duration = decoded.samples.length / decoded.sampleRate;
  if (duration > MAX_SESSION_S) {
    throw new GradiumError("Audio is longer than one Gradium session (about 48 minutes). Trim it first.", 413);
  }
  const words = keywords
    .flatMap((k) => k.split(/\s+/))
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 500);
  const config: Record<string, unknown> = { language: lang };
  if (words.length) config.keywords = { words, boost: 3 };
  const url = `${apiBase()}/post/speech/asr?json_config=${encodeURIComponent(JSON.stringify(config))}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-api-key": apiKey(), "Content-Type": "audio/wav" },
    body: Buffer.from(wav),
  });
  if (!res.ok) throw new GradiumError(`Speech-to-Text failed: ${await readError(res)}`, res.status);
  const messages: StreamMessage[] = [];
  for await (const msg of ndjson(res)) {
    throwIfError(msg);
    messages.push(msg);
  }
  return {
    words: segmentsToWords(collectSegments(messages, duration)),
    duration: round(duration),
    credits: Math.ceil(duration * 3),
    mock: false,
  };
}

function chunkText(text: string): string[] {
  if (text.length <= TTS_CHUNK_CHARS) return [text];
  const sentences = text.match(/[^.!?…]+[.!?…]*\s*/g) ?? [text];
  const chunks: string[] = [];
  let current = "";
  for (const sentence of sentences) {
    if ((current + sentence).length > TTS_CHUNK_CHARS && current) {
      chunks.push(current.trim());
      current = "";
    }
    current += sentence;
  }
  if (current.trim()) chunks.push(current.trim());
  return chunks;
}

async function ttsOnce(text: string, voiceId: string) {
  const res = await fetch(`${apiBase()}/post/speech/tts`, {
    method: "POST",
    headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ text, voice_id: voiceId, output_format: "pcm", only_audio: false }),
  });
  if (!res.ok) throw new GradiumError(`Text-to-Speech failed: ${await readError(res)}`, res.status);
  const audio: Uint8Array[] = [];
  const timed: TimedText[] = [];
  for await (const msg of ndjson(res)) {
    throwIfError(msg);
    if (msg.type === "audio" && msg.audio) audio.push(base64ToBytes(msg.audio));
    if (msg.type === "text" && msg.text && typeof msg.start_s === "number") {
      timed.push({ text: msg.text, start: msg.start_s, end: msg.stop_s ?? msg.start_s + 0.3 });
    }
  }
  const total = audio.reduce((n, a) => n + a.length, 0);
  const pcm = new Uint8Array(total);
  let offset = 0;
  for (const a of audio) {
    pcm.set(a, offset);
    offset += a.length;
  }
  // `pcm` output is 48 kHz, 16-bit signed mono.
  const samples = resample(pcm16ToFloat(pcm), 48000, 24000);
  return { samples, timed };
}

export async function liveSynthesize(text: string, voiceId: string): Promise<TtsResult> {
  const parts: Float32Array[] = [];
  const words: BareWord[] = [];
  let offset = 0;
  for (const chunk of chunkText(text)) {
    const { samples, timed } = await ttsOnce(chunk, voiceId);
    for (const w of segmentsToWords(timed)) {
      words.push({ ...w, start: round(w.start + offset), end: round(w.end + offset) });
    }
    parts.push(samples);
    offset += samples.length / 24000;
  }
  const merged = new Float32Array(parts.reduce((n, p) => n + p.length, 0));
  let cursor = 0;
  for (const p of parts) {
    merged.set(p, cursor);
    cursor += p.length;
  }
  return {
    audio: bytesToBase64(encodeWav({ sampleRate: 24000, samples: merged })),
    words,
    duration: round(merged.length / 24000),
    credits: text.length,
    mock: false,
  };
}

export async function liveClone(wav: Uint8Array, name: string, lang: Lang): Promise<{ voiceId: string }> {
  const form = new FormData();
  form.append("audio_file", new Blob([Buffer.from(wav)], { type: "audio/wav" }), "sample.wav");
  form.append("name", name);
  form.append("language", lang);
  form.append("input_format", "wav");
  form.append("timeout_s", "20");
  const res = await fetch(`${apiBase()}/voices/`, {
    method: "POST",
    headers: { "x-api-key": apiKey() },
    body: form,
  });
  if (!res.ok) throw new GradiumError(`Voice cloning failed: ${await readError(res)}`, res.status);
  const json = (await res.json()) as { uid?: string | null; error?: string | null };
  if (!json.uid) throw new GradiumError(`Voice cloning failed: ${json.error ?? "no voice id returned"}`);
  return { voiceId: json.uid };
}

export async function liveDesign(prompt: string, lang: Lang, n: number): Promise<DesignResult> {
  const res = await fetch(`${apiBase()}/voice-generator/generate`, {
    method: "POST",
    headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ prompt, language: lang, n_samples: n }),
  });
  if (!res.ok) throw new GradiumError(`Voice design failed: ${await readError(res)}`, res.status);
  const json = (await res.json()) as { embeddings: { embedding_id: string; ready: boolean }[] };
  const candidates = json.embeddings.map((e) => ({ id: e.embedding_id, ready: e.ready }));
  const deadline = Date.now() + 30_000;
  while (candidates.some((c) => !c.ready) && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 1500));
    for (const c of candidates.filter((x) => !x.ready)) {
      const poll = await fetch(`${apiBase()}/voice-generator/embeddings?embedding_id=${encodeURIComponent(c.id)}`, {
        headers: { "x-api-key": apiKey() },
      });
      if (!poll.ok) continue;
      const list = (await poll.json()) as { embeddings: { embedding_id: string; ready: boolean }[] };
      if (list.embeddings.find((e) => e.embedding_id === c.id)?.ready) c.ready = true;
    }
  }
  return { candidates, credits: 0, mock: false };
}

export async function liveKeep(candidateId: string, name: string): Promise<{ voiceId: string }> {
  const res = await fetch(`${apiBase()}/voices/from-embedding`, {
    method: "POST",
    headers: { "x-api-key": apiKey(), "Content-Type": "application/json" },
    body: JSON.stringify({ voxium_embedding_id: candidateId, name }),
  });
  if (!res.ok) throw new GradiumError(`Saving the designed voice failed: ${await readError(res)}`, res.status);
  const json = (await res.json()) as { uid: string };
  return { voiceId: json.uid };
}

export type CustomVoice = { id: string; name: string; lang: Lang | null; description?: string | null };

export async function liveCustomVoices(): Promise<CustomVoice[]> {
  const res = await fetch(`${apiBase()}/voices/?limit=100`, { headers: { "x-api-key": apiKey() } });
  if (!res.ok) throw new GradiumError(`Listing voices failed: ${await readError(res)}`, res.status);
  const list = (await res.json()) as {
    uid: string;
    name: string;
    language?: Lang | null;
    description?: string | null;
    is_catalog?: boolean;
  }[];
  return list
    .filter((v) => !v.is_catalog)
    .map((v) => ({ id: v.uid, name: v.name, lang: v.language ?? null, description: v.description }));
}

/**
 * Translates speech with Gradium's translating speech-to-text model (`stt-translate`), which returns
 * only text. Billed as STT translation (4 credits/s) instead of full speech-to-speech (30 credits/s);
 * the app voices the result with Text-to-Speech so it gets word timings for captions.
 */
export async function liveTranslate(wav: Uint8Array, target: Lang): Promise<string> {
  const decoded = decodeWav(wav);
  const duration = decoded.samples.length / decoded.sampleRate;
  if (duration > MAX_SESSION_S) throw new GradiumError("Audio is too long for one translation session.", 413);
  const config = { language: target, target_language: target };
  const url = `${apiBase()}/post/speech/asr?model=stt-translate&json_config=${encodeURIComponent(JSON.stringify(config))}`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "x-api-key": apiKey(), "Content-Type": "audio/wav" },
    body: Buffer.from(wav),
  });
  if (!res.ok) throw new GradiumError(`Translation failed: ${await readError(res)}`, res.status);
  const pieces: string[] = [];
  for await (const msg of ndjson(res)) {
    throwIfError(msg);
    if (msg.type === "text" && msg.text?.trim()) pieces.push(msg.text.trim());
  }
  const text = pieces.join(" ").replace(/\s+/g, " ").trim();
  if (!text) throw new GradiumError("Translation returned no text. Is there speech in the clip?", 422);
  return text;
}

export async function liveToken(): Promise<{ token: string; expiresAt?: string }> {
  const res = await fetch(`${apiBase()}/api-keys/token`, { headers: { "x-api-key": apiKey() } });
  if (!res.ok) throw new GradiumError(`Could not create a streaming token: ${await readError(res)}`, res.status);
  const json = (await res.json()) as { token: string; expires_at?: string };
  return { token: json.token, expiresAt: json.expires_at };
}

export async function liveCredits(): Promise<AccountCredits> {
  const res = await fetch(`${apiBase()}/usages/credits`, { headers: { "x-api-key": apiKey() }, cache: "no-store" });
  if (!res.ok) throw new GradiumError(`Could not read credits: ${await readError(res)}`, res.status);
  const json = (await res.json()) as { remaining_credits?: number; allocated_credits?: number; billing_period?: string };
  return { remaining: json.remaining_credits ?? 0, allocated: json.allocated_credits ?? 0, period: json.billing_period ?? "" };
}
