import type { DesignResult, Lang, SttResult, TtsResult } from "@/lib/types";
import { catalogVoice } from "@/lib/voices";
import { bytesToBase64, decodeWav, encodeWav, resample } from "@/lib/wav";
import { endsSentence, round, syllables, tokenize, type BareWord } from "@/lib/words";
import { MOCK_TRANSCRIPTS, mockTranslate } from "./mock-text";

const SR = 24000;

function hash(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function rng(seed: number) {
  let s = seed || 1;
  return () => {
    s = (Math.imul(s ^ (s >>> 15), 2246822507) + 0x9e3779b9) >>> 0;
    return (s % 100000) / 100000;
  };
}

function rmsFrames(samples: Float32Array, frame: number): Float32Array {
  const out = new Float32Array(Math.ceil(samples.length / frame));
  for (let f = 0; f < out.length; f += 1) {
    let sum = 0;
    const a = f * frame;
    const b = Math.min(samples.length, a + frame);
    for (let i = a; i < b; i += 1) sum += samples[i] * samples[i];
    out[f] = Math.sqrt(sum / Math.max(1, b - a));
  }
  return out;
}

function percentile(values: Float32Array, p: number): number {
  const sorted = Array.from(values).sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))] ?? 0;
}

type Region = { start: number; end: number };

/** Energy-based voice activity detection on 20 ms frames. */
function speechRegions(samples: Float32Array, sampleRate: number) {
  const hop = 0.02;
  const frame = Math.max(1, Math.round(sampleRate * hop));
  const rms = rmsFrames(samples, frame);
  const smooth = rms.map((_, i) => ((rms[i - 1] ?? rms[i]) + rms[i] + (rms[i + 1] ?? rms[i])) / 3);
  const floor = percentile(smooth, 0.15);
  const peak = percentile(smooth, 0.98);
  const threshold = Math.max(0.004, floor * 2.5, floor + (peak - floor) * 0.1);
  const regions: Region[] = [];
  let open = -1;
  for (let i = 0; i <= smooth.length; i += 1) {
    const voiced = i < smooth.length && smooth[i] > threshold;
    if (voiced && open < 0) open = i;
    if (!voiced && open >= 0) {
      regions.push({ start: open * hop, end: i * hop });
      open = -1;
    }
  }
  const merged: Region[] = [];
  for (const r of regions) {
    const last = merged[merged.length - 1];
    if (last && r.start - last.end < 0.22) last.end = r.end;
    else merged.push({ ...r });
  }
  return { regions: merged.filter((r) => r.end - r.start >= 0.12), smooth, hop };
}

export function mockTranscribe(wav: Uint8Array, lang: Lang, keywords: string[]): SttResult {
  const { samples, sampleRate } = decodeWav(wav);
  const duration = samples.length / sampleRate;
  const { regions, smooth, hop } = speechRegions(samples, sampleRate);
  const boost = keywords.map((k) => k.trim()).filter(Boolean);
  let slot = 0;
  const script = MOCK_TRANSCRIPTS[lang].replace(/\{kw\}/g, () => boost[slot++ % Math.max(1, boost.length)] ?? "Gradium");
  const corpus = tokenize(script);
  const random = rng(hash(`${lang}:${samples.length}`));
  const words: BareWord[] = [];
  let cursor = 0;

  const nextToken = () => {
    const token = corpus[cursor % corpus.length];
    cursor += 1;
    return token;
  };

  const localMin = (t: number) => {
    const center = Math.round(t / hop);
    let best = center;
    for (let i = center - 6; i <= center + 6; i += 1) {
      if (i > 0 && i < smooth.length && smooth[i] < smooth[best]) best = i;
    }
    return best * hop;
  };

  regions.forEach((region) => {
    const span = region.end - region.start;
    const count = Math.max(1, Math.round(span * 2.6));
    const cuts = [region.start];
    for (let k = 1; k < count; k += 1) {
      const target = region.start + (k * span) / count;
      cuts.push(Math.min(region.end - 0.05, Math.max(cuts[cuts.length - 1] + 0.1, localMin(target))));
    }
    cuts.push(region.end);
    for (let k = 0; k < count; k += 1) {
      const text = nextToken();
      const roll = random();
      words.push({
        text,
        start: round(cuts[k]),
        end: round(Math.max(cuts[k] + 0.08, cuts[k + 1] - 0.02)),
        prob: round(roll < 0.07 ? 0.3 + roll * 2 : 0.72 + roll * 0.27, 2),
      });
    }
  });

  return { words, duration: round(duration), credits: Math.ceil(duration * 3), mock: true };
}

const VOWELS: [number, number, number][] = [
  [730, 1090, 2440],
  [530, 1840, 2480],
  [270, 2290, 3010],
  [570, 840, 2410],
  [300, 870, 2240],
  [660, 1720, 2410],
];

function voicePitch(voiceId: string): number {
  const clone = voiceId.match(/^mock_(?:clone|voice|design)_(\d{2,3})_/);
  if (clone) return Number(clone[1]);
  const voice = catalogVoice(voiceId);
  const h = hash(voiceId);
  if (voice?.gender === "m") return 98 + (h % 30);
  if (voice?.gender === "f") return 188 + (h % 40);
  return 110 + (h % 110);
}

function gapAfter(token: string): number {
  if (/[.!?…]["')\]]?$/.test(token)) return 0.42;
  if (/[:;]$/.test(token)) return 0.3;
  if (/[,—-]$/.test(token)) return 0.22;
  return 0.06;
}

/** Synthesizes vowel-like "speech" with exact word timings, so captions sync like real TTS output. */
export function mockSynthesize(text: string, voiceId: string, speed = 1): TtsResult {
  const tokens = tokenize(text);
  const f0 = voicePitch(voiceId);
  const lead = 0.15;
  const words: BareWord[] = [];
  const syllablePlan: { start: number; end: number; vowel: number; stress: number; sentencePos: number }[] = [];
  let t = lead;
  let sentenceStart = 0;
  tokens.forEach((token, i) => {
    const syl = Math.min(6, syllables(token));
    const dur = (0.12 + 0.12 * syl) / speed;
    words.push({ text: token, start: round(t), end: round(t + dur) });
    const segment = dur / syl;
    for (let s = 0; s < syl; s += 1) {
      syllablePlan.push({
        start: t + s * segment,
        end: t + (s + 1) * segment,
        vowel: hash(token + s) % VOWELS.length,
        stress: s === 0 ? 1 : 0.8,
        sentencePos: i - sentenceStart,
      });
    }
    t += dur + gapAfter(token) / speed;
    if (endsSentence(token)) sentenceStart = i + 1;
  });
  const duration = t + 0.3;
  const samples = new Float32Array(Math.ceil(duration * SR));
  const noise = rng(hash(voiceId + text.length));

  for (const syl of syllablePlan) {
    const a = Math.floor(syl.start * SR);
    const b = Math.min(samples.length, Math.floor(syl.end * SR));
    const len = b - a;
    const [F1, F2, F3] = VOWELS[syl.vowel];
    const declination = Math.max(0.82, 1 - syl.sentencePos * 0.012);
    let phase = 0;
    const attack = Math.min(len * 0.25, 0.025 * SR);
    const release = Math.min(len * 0.4, 0.05 * SR);
    for (let i = 0; i < len; i += 1) {
      const x = i / len;
      const pitch = f0 * declination * (1 + 0.07 * Math.sin(Math.PI * x) * syl.stress);
      phase += (2 * Math.PI * pitch) / SR;
      let value = 0;
      for (let k = 1; k * pitch < 3800; k += 1) {
        const f = k * pitch;
        const gain =
          1 / (1 + ((f - F1) / 90) ** 2) + 0.6 / (1 + ((f - F2) / 120) ** 2) + 0.25 / (1 + ((f - F3) / 160) ** 2);
        value += (gain / Math.sqrt(k)) * Math.sin(k * phase);
      }
      const env = Math.min(1, i / attack, (len - i) / release);
      const consonant = i < 0.03 * SR ? (noise() - 0.5) * 0.18 * (1 - i / (0.03 * SR)) : 0;
      samples[a + i] += value * env * 0.18 * syl.stress + consonant;
    }
  }

  let peak = 0;
  for (const s of samples) peak = Math.max(peak, Math.abs(s));
  if (peak > 0) for (let i = 0; i < samples.length; i += 1) samples[i] = (samples[i] / peak) * 0.6;

  return {
    audio: bytesToBase64(encodeWav({ sampleRate: SR, samples })),
    words,
    duration: round(duration),
    credits: text.length,
    mock: true,
  };
}

/** Autocorrelation pitch estimate, so a mock clone sounds roughly like the speaker's register. */
export function estimatePitch(wav: Uint8Array): number {
  const decoded = decodeWav(wav);
  const samples = resample(decoded.samples, decoded.sampleRate, 16000);
  const sr = 16000;
  const win = Math.round(sr * 0.04);
  const pitches: number[] = [];
  for (let start = 0; start + win * 2 < samples.length && pitches.length < 200; start += win) {
    let energy = 0;
    for (let i = start; i < start + win; i += 1) energy += samples[i] * samples[i];
    if (Math.sqrt(energy / win) < 0.02) continue;
    let bestLag = 0;
    let best = 0;
    for (let lag = Math.floor(sr / 350); lag <= Math.floor(sr / 70); lag += 1) {
      let corr = 0;
      for (let i = start; i < start + win; i += 1) corr += samples[i] * samples[i + lag];
      if (corr > best) {
        best = corr;
        bestLag = lag;
      }
    }
    if (bestLag && best / energy > 0.4) pitches.push(sr / bestLag);
  }
  if (!pitches.length) return 140;
  pitches.sort((a, b) => a - b);
  return Math.round(Math.min(260, Math.max(85, pitches[Math.floor(pitches.length / 2)])));
}

export function mockClone(wav: Uint8Array): { voiceId: string } {
  const f0 = estimatePitch(wav);
  return { voiceId: `mock_clone_${f0}_${hash(String(wav.length) + f0).toString(36)}` };
}

export function mockDesign(prompt: string, n: number): DesignResult {
  const low = /\b(male|man|deep|low|baritone|bass|masculine|gruff)\b/i.test(prompt);
  const high = /\b(female|woman|girl|high|bright|feminine|bubbly)\b/i.test(prompt);
  const base = low ? 105 : high ? 205 : 150;
  const h = hash(prompt);
  return {
    candidates: Array.from({ length: n }, (_, i) => ({
      id: `mock_design_${base + ((h >> (i * 3)) % 25) - 12}_${(h + i).toString(36)}`,
      ready: true,
    })),
    credits: 0,
    mock: true,
  };
}

export function mockKeep(candidateId: string): { voiceId: string } {
  return { voiceId: candidateId.replace(/^mock_design_/, "mock_voice_") };
}

export { mockTranslate };
