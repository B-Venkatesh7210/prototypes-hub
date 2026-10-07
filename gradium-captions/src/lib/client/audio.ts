"use client";

import { base64ToBytes, decodeWav, encodeWav, resample, type PcmAudio } from "@/lib/wav";

export const WORK_RATE = 24000;

let sharedCtx: AudioContext | null = null;

export function audioContext(): AudioContext {
  if (!sharedCtx || sharedCtx.state === "closed") sharedCtx = new AudioContext();
  return sharedCtx;
}

function mixToMono(buffer: AudioBuffer): Float32Array {
  const out = new Float32Array(buffer.length);
  for (let c = 0; c < buffer.numberOfChannels; c += 1) {
    const data = buffer.getChannelData(c);
    for (let i = 0; i < data.length; i += 1) out[i] += data[i] / buffer.numberOfChannels;
  }
  return out;
}

/** Decodes any audio or video file the browser understands into 24 kHz mono PCM. */
export async function decodeToMono(blob: Blob, rate = WORK_RATE): Promise<PcmAudio> {
  const data = await blob.arrayBuffer();
  if (looksLikeWav(data)) {
    const wav = decodeWav(data);
    return { sampleRate: rate, samples: resample(wav.samples, wav.sampleRate, rate) };
  }
  let buffer: AudioBuffer;
  try {
    buffer = await audioContext().decodeAudioData(data);
  } catch {
    throw new Error("This browser can't decode that file's audio. Try MP3, WAV, M4A, MP4 or WebM.");
  }
  return { sampleRate: rate, samples: resample(mixToMono(buffer), buffer.sampleRate, rate) };
}

function looksLikeWav(data: ArrayBuffer): boolean {
  if (data.byteLength < 12) return false;
  const head = new Uint8Array(data, 0, 12);
  return String.fromCharCode(...head.subarray(0, 4)) === "RIFF" && String.fromCharCode(...head.subarray(8, 12)) === "WAVE";
}

export function wavBlob(pcm: PcmAudio): Blob {
  return new Blob([encodeWav(pcm) as BlobPart], { type: "audio/wav" });
}

export function base64WavBlob(b64: string): Blob {
  return new Blob([base64ToBytes(b64) as BlobPart], { type: "audio/wav" });
}

export async function blobToPcm(blob: Blob): Promise<PcmAudio> {
  return decodeToMono(blob);
}

export function durationOf(pcm: PcmAudio): number {
  return pcm.samples.length / pcm.sampleRate;
}

export function slice(pcm: PcmAudio, start: number, end: number): PcmAudio {
  const a = Math.max(0, Math.floor(start * pcm.sampleRate));
  const b = Math.min(pcm.samples.length, Math.floor(end * pcm.sampleRate));
  return { sampleRate: pcm.sampleRate, samples: pcm.samples.slice(a, Math.max(a, b)) };
}

export function concat(parts: PcmAudio[]): PcmAudio {
  const rate = parts[0]?.sampleRate ?? WORK_RATE;
  const total = parts.reduce((n, p) => n + p.samples.length, 0);
  const samples = new Float32Array(total);
  let offset = 0;
  for (const p of parts) {
    samples.set(p.sampleRate === rate ? p.samples : resample(p.samples, p.sampleRate, rate), offset);
    offset += p.samples.length;
  }
  return { sampleRate: rate, samples };
}

/** Picks the loudest-continuous stretch for a voice-clone sample (Gradium recommends 10 s+). */
export function cloneSample(pcm: PcmAudio, seconds = 15): PcmAudio {
  const total = durationOf(pcm);
  if (total <= seconds) return pcm;
  const window = Math.floor(seconds * pcm.sampleRate);
  const hop = Math.floor(pcm.sampleRate);
  let best = 0;
  let bestEnergy = -1;
  for (let start = 0; start + window <= pcm.samples.length; start += hop) {
    let energy = 0;
    for (let i = start; i < start + window; i += 64) energy += Math.abs(pcm.samples[i]);
    if (energy > bestEnergy) {
      bestEnergy = energy;
      best = start;
    }
  }
  return { sampleRate: pcm.sampleRate, samples: pcm.samples.slice(best, best + window) };
}

export type MediaInfo = { kind: "audio" | "video"; duration: number; width?: number; height?: number };

export function probeMedia(blob: Blob): Promise<MediaInfo> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const isVideo = blob.type.startsWith("video/");
    const el = document.createElement(isVideo ? "video" : "audio");
    el.preload = "metadata";
    const done = (info: MediaInfo) => {
      URL.revokeObjectURL(url);
      resolve(info);
    };
    el.onloadedmetadata = () => {
      const video = el as HTMLVideoElement;
      const hasPicture = isVideo && video.videoWidth > 0;
      done({
        kind: hasPicture ? "video" : "audio",
        duration: Number.isFinite(el.duration) ? el.duration : 0,
        width: hasPicture ? video.videoWidth : undefined,
        height: hasPicture ? video.videoHeight : undefined,
      });
    };
    el.onerror = () => done({ kind: "audio", duration: 0 });
    el.src = url;
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
