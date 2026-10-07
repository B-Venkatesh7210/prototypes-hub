"use client";

import { DEFAULT_STYLE, styleForAspect } from "@/lib/captions/style";
import { langName } from "@/lib/langs";
import { audibleRange, timeStretch } from "@/lib/stretch";
import type { Aspect, ClipInfo, Lang, Product, Project, Track, TrackKind, VoiceRef, Word } from "@/lib/types";
import type { PcmAudio } from "@/lib/wav";
import { round, uid, withIds, wordsToText } from "@/lib/words";
import { api } from "./api";
import { base64WavBlob, blobToPcm, concat, durationOf, slice, wavBlob } from "./audio";
import { db } from "./db";

export function newProject(args: {
  title: string;
  product: Product;
  sourceLang: Lang;
  aspect?: Aspect;
  mock: boolean;
}): Project {
  const now = Date.now();
  return {
    id: uid("p"),
    title: args.title,
    product: args.product,
    createdAt: now,
    updatedAt: now,
    sourceLang: args.sourceLang,
    tracks: [],
    activeTrackId: "",
    style: styleForAspect({ ...DEFAULT_STYLE }, args.aspect ?? "16:9"),
    mock: args.mock,
  };
}

export async function storeBlob(blob: Blob): Promise<string> {
  const key = uid("b");
  await db.putBlob(key, blob);
  return key;
}

export async function trackAudio(track: Track): Promise<Blob> {
  const blob = await db.getBlob(track.audioKey);
  if (!blob) throw new Error(`Audio for the ${track.label} track is missing.`);
  return blob;
}

export function trackLabel(lang: Lang, kind: TrackKind): string {
  if (kind === "original") return `${langName(lang)} · original`;
  if (kind === "live") return `${langName(lang)} · live`;
  return langName(lang);
}

export async function synthesizeTrack(args: {
  text: string;
  voice: VoiceRef;
  lang: Lang;
  kind: TrackKind;
}): Promise<Track> {
  const result = await api.synthesize(args.text, args.voice.id);
  const audioKey = await storeBlob(base64WavBlob(result.audio));
  return {
    id: uid("t"),
    lang: args.lang,
    kind: args.kind,
    label: trackLabel(args.lang, args.kind),
    audioKey,
    duration: result.duration,
    words: withIds(result.words),
    voice: args.voice,
    script: args.text,
    createdAt: Date.now(),
  };
}

/**
 * Localizes a track: Gradium's translating speech-to-text listens to the source audio and returns
 * the translated transcript, then Text-to-Speech voices it with the chosen voice and word timings.
 */
export async function translateTrack(args: {
  source: Track;
  sourceLang: Lang;
  target: Lang;
  voice: VoiceRef;
  onStage?: (stage: "translate" | "voice") => void;
}): Promise<Track> {
  args.onStage?.("translate");
  const audio = await trackAudio(args.source);
  const translated = await api.translate({
    wav: audio,
    text: wordsToText(args.source.words),
    source: args.sourceLang,
    target: args.target,
  });
  args.onStage?.("voice");
  return synthesizeTrack({ text: translated.text, voice: args.voice, lang: args.target, kind: "dub" });
}

function trimSilence(pcm: PcmAudio, threshold = 0.01): { pcm: PcmAudio; lead: number } {
  const { samples, sampleRate } = pcm;
  let a = 0;
  while (a < samples.length && Math.abs(samples[a]) < threshold) a += 1;
  let b = samples.length - 1;
  while (b > a && Math.abs(samples[b]) < threshold) b -= 1;
  const pad = Math.floor(sampleRate * 0.04);
  const start = Math.max(0, a - pad);
  const end = Math.min(samples.length, b + pad * 2);
  return { pcm: { sampleRate, samples: samples.slice(start, end) }, lead: start / sampleRate };
}

/**
 * "Fix a line": re-voices one caption line with the track's voice and splices it into the audio.
 * Words after the line shift by however much longer or shorter the new take is.
 */
export async function revoiceLine(track: Track, firstIndex: number, lastIndex: number): Promise<Track> {
  if (!track.voice) throw new Error("This track has no voice to re-voice with. Clone or pick a voice first.");
  const words = track.words;
  const first = words[firstIndex];
  const last = words[lastIndex];
  const prevEnd = words[firstIndex - 1]?.end ?? 0;
  const nextStart = words[lastIndex + 1]?.start ?? track.duration;
  const cutStart = Math.max(0, first.start - Math.min(0.08, (first.start - prevEnd) / 2));
  const cutEnd = Math.min(track.duration, last.end + Math.min(0.08, Math.max(0, nextStart - last.end) / 2));
  const text = wordsToText(words.slice(firstIndex, lastIndex + 1));

  const result = await api.synthesize(text, track.voice.id);
  const trimmed = trimSilence(await blobToPcm(base64WavBlob(result.audio)));
  const tempo = track.fit?.tempo ?? 1;
  const take =
    tempo === 1
      ? trimmed
      : { lead: trimmed.lead, pcm: { sampleRate: trimmed.pcm.sampleRate, samples: timeStretch(trimmed.pcm.samples, trimmed.pcm.sampleRate, tempo) } };
  const original = await blobToPcm(await trackAudio(track));
  const merged = concat([slice(original, 0, cutStart), take.pcm, slice(original, cutEnd, durationOf(original))]);
  const delta = durationOf(take.pcm) - (cutEnd - cutStart);

  const fresh: Word[] = withIds(result.words).map((w) => ({
    ...w,
    start: round(cutStart + Math.max(0, w.start - take.lead) / tempo),
    end: round(cutStart + Math.max(0, w.end - take.lead) / tempo),
  }));
  if (fresh.length && last.breakAfter) fresh[fresh.length - 1].breakAfter = true;
  const shifted = (w: Word): Word => ({ ...w, start: round(w.start + delta), end: round(w.end + delta) });

  const audioKey = await storeBlob(wavBlob(merged));
  await db.deleteBlob(track.audioKey);
  return {
    ...track,
    audioKey,
    duration: round(durationOf(merged)),
    words: [...words.slice(0, firstIndex), ...fresh, ...words.slice(lastIndex + 1).map(shifted)],
    script: track.script !== undefined ? wordsToText([...words.slice(0, firstIndex), ...fresh, ...words.slice(lastIndex + 1)]) : undefined,
  };
}

/** Regenerates a synthesized track from an edited script. Dubs of a video are re-fitted to the clip. */
export async function regenerateTrack(track: Track, script: string, clip?: ClipInfo): Promise<Track> {
  if (!track.voice) throw new Error("This track has no voice.");
  const fresh = await synthesizeTrack({ text: script, voice: track.voice, lang: track.lang, kind: track.kind });
  await db.deleteBlob(track.audioKey);
  const next = { ...fresh, id: track.id, label: track.label };
  return clip && track.kind === "dub" ? fitTrackToClip(next, clip) : next;
}

/** Speed-up and slow-down a dub may get before it sounds unnatural. */
export const FIT_RANGE = { fastest: 1.35, slowest: 0.92 };

/**
 * Fits a dub to the video: starts it when the original speaker starts, and time-stretches it
 * (pitch preserved) so it ends with the clip. Word timings are scaled to match.
 */
export async function fitTrackToClip(track: Track, clip: ClipInfo): Promise<Track> {
  const pcm = await blobToPcm(await trackAudio(track));
  const rate = pcm.sampleRate;
  const [a, b] = audibleRange(pcm.samples);
  if (b <= a) return track;
  const lead = a / rate;
  const natural = (b - a) / rate;
  const start = Math.min(Math.max(0, clip.speechStart), Math.max(0, clip.duration - 1));
  const available = Math.max(0.5, clip.duration - start - 0.1);
  let tempo = natural / available;
  tempo = tempo > 1 ? Math.min(tempo, FIT_RANGE.fastest) : Math.max(tempo, FIT_RANGE.slowest);
  if (Math.abs(tempo - 1) < 0.02) tempo = 1;

  const stretched = timeStretch(pcm.samples.subarray(a, b), rate, tempo);
  const end = start + stretched.length / rate;
  const total = Math.max(clip.duration, end);
  const samples = new Float32Array(Math.ceil(total * rate));
  samples.set(stretched, Math.round(start * rate));

  const place = (t: number) => round(start + Math.max(0, t - lead) / tempo);
  const audioKey = await storeBlob(wavBlob({ sampleRate: rate, samples }));
  await db.deleteBlob(track.audioKey);
  return {
    ...track,
    audioKey,
    duration: round(total),
    words: track.words.map((w) => ({ ...w, start: place(w.start), end: place(w.end) })),
    fit: { tempo: round(tempo, 2), overrun: end - clip.duration > 0.05 ? round(end - clip.duration, 2) : 0 },
  };
}
