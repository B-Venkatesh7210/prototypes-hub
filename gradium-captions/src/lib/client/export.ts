"use client";

import { layoutLines } from "@/lib/captions/layout";
import { drawCaptions, drawStage } from "@/lib/captions/render";
import { aspectSize, resolveFontFamily } from "@/lib/captions/style";
import type { CaptionStyle, StageBackground, Word } from "@/lib/types";

export type VideoFormat = { id: string; label: string; mime: string; ext: string };

const CANDIDATES: VideoFormat[] = [
  { id: "mp4", label: "MP4 (H.264)", mime: "video/mp4;codecs=avc1.42E01E,mp4a.40.2", ext: "mp4" },
  { id: "mp4-basic", label: "MP4", mime: "video/mp4", ext: "mp4" },
  { id: "webm-vp9", label: "WebM (VP9)", mime: "video/webm;codecs=vp9,opus", ext: "webm" },
  { id: "webm-vp8", label: "WebM (VP8)", mime: "video/webm;codecs=vp8,opus", ext: "webm" },
  { id: "webm", label: "WebM", mime: "video/webm", ext: "webm" },
];

export function supportedVideoFormats(): VideoFormat[] {
  if (typeof MediaRecorder === "undefined") return [];
  const seen = new Set<string>();
  return CANDIDATES.filter((f) => {
    if (!MediaRecorder.isTypeSupported(f.mime) || seen.has(f.ext)) return false;
    seen.add(f.ext);
    return true;
  });
}

export type VideoExportOptions = {
  audio: Blob;
  words: Word[];
  style: CaptionStyle;
  background: StageBackground;
  media?: Blob | null;
  fit: "cover" | "contain";
  includeAudio: boolean;
  format: VideoFormat;
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
};

/** Renders the same canvas used by the preview and records it in real time with the track audio. */
export async function exportVideo(opts: VideoExportOptions): Promise<Blob> {
  const { width, height } = aspectSize(opts.style.aspect);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: opts.background === "transparent" });
  if (!ctx) throw new Error("Canvas is not available in this browser.");
  await document.fonts.ready;
  const fontFamily = resolveFontFamily(opts.style.fontId);
  const lines = layoutLines(opts.words, opts.style);

  const ac = new AudioContext();
  const buffer = await ac.decodeAudioData(await opts.audio.arrayBuffer());
  const duration = buffer.duration;
  const dest = ac.createMediaStreamDestination();
  const source = ac.createBufferSource();
  source.buffer = buffer;
  source.connect(dest);

  let video: HTMLVideoElement | null = null;
  let videoUrl = "";
  if (opts.background === "video" && opts.media) {
    videoUrl = URL.createObjectURL(opts.media);
    video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.src = videoUrl;
    await new Promise<void>((resolve) => {
      video!.oncanplay = () => resolve();
      video!.onerror = () => resolve();
      video!.load();
    });
  }

  const stream = canvas.captureStream(opts.style.fps);
  if (opts.includeAudio) dest.stream.getAudioTracks().forEach((t) => stream.addTrack(t));
  const recorder = new MediaRecorder(stream, { mimeType: opts.format.mime, videoBitsPerSecond: 8_000_000 });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const cleanup = () => {
    try {
      source.stop();
    } catch {
      /* not started */
    }
    stream.getTracks().forEach((t) => t.stop());
    void ac.close();
    if (video) video.pause();
    if (videoUrl) URL.revokeObjectURL(videoUrl);
  };

  return new Promise<Blob>((resolve, reject) => {
    let raf = 0;
    let stopped = false;
    const startAt = ac.currentTime + 0.15;

    recorder.onstop = () => {
      cancelAnimationFrame(raf);
      cleanup();
      if (opts.signal.aborted) reject(new DOMException("Export cancelled", "AbortError"));
      else resolve(new Blob(chunks, { type: opts.format.mime.split(";")[0] }));
    };

    const stop = () => {
      if (stopped) return;
      stopped = true;
      if (recorder.state !== "inactive") recorder.stop();
    };

    opts.signal.addEventListener("abort", stop);

    const frame = () => {
      const t = Math.max(0, ac.currentTime - startAt);
      if (video && video.readyState >= 2) {
        if (Math.abs(video.currentTime - t) > 0.25 && t < video.duration) video.currentTime = t;
        if (video.paused && t < video.duration) void video.play().catch(() => undefined);
      }
      drawStage(ctx, width, height, { background: opts.background, time: t, video, fit: opts.fit });
      drawCaptions(ctx, width, height, lines, t, opts.style, fontFamily);
      opts.onProgress(Math.min(1, t / duration));
      if (t >= duration + 0.25) {
        stop();
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    recorder.start(250);
    source.start(startAt);
    if (video) {
      video.currentTime = 0;
      void video.play().catch(() => undefined);
    }
    raf = requestAnimationFrame(frame);
  });
}
