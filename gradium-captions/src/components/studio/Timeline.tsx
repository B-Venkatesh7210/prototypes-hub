"use client";

import { useEffect, useRef, useState } from "react";
import type { Line } from "@/lib/captions/layout";
import { decodeToMono } from "@/lib/client/audio";
import { formatTime } from "@/lib/words";

const BUCKETS = 720;

export function usePeaks(blob: Blob | null): Float32Array | null {
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  useEffect(() => {
    if (!blob) return;
    let cancelled = false;
    void decodeToMono(blob, 8000)
      .then(({ samples }) => {
        const out = new Float32Array(BUCKETS);
        const size = Math.max(1, Math.floor(samples.length / BUCKETS));
        let max = 0;
        for (let b = 0; b < BUCKETS; b++) {
          let peak = 0;
          for (let i = b * size; i < Math.min(samples.length, (b + 1) * size); i++) peak = Math.max(peak, Math.abs(samples[i]));
          out[b] = peak;
          max = Math.max(max, peak);
        }
        if (max > 0) for (let b = 0; b < BUCKETS; b++) out[b] /= max;
        if (!cancelled) setPeaks(out);
      })
      .catch(() => !cancelled && setPeaks(null));
    return () => {
      cancelled = true;
    };
  }, [blob]);
  return peaks;
}

export function Timeline({
  audioRef,
  duration,
  lines,
  peaks,
  selectedLine,
  dirtyLines,
  onSeek,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  duration: number;
  lines: Line[];
  peaks: Float32Array | null;
  selectedLine: number | null;
  dirtyLines: Set<number>;
  onSeek: (t: number) => void;
}) {
  const waveRef = useRef<HTMLCanvasElement>(null);
  const headRef = useRef<HTMLDivElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<number | null>(null);

  useEffect(() => {
    const canvas = waveRef.current;
    if (!canvas) return;
    const w = (canvas.width = canvas.clientWidth * devicePixelRatio);
    const h = (canvas.height = canvas.clientHeight * devicePixelRatio);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, w, h);
    if (!peaks) return;
    ctx.fillStyle = "rgba(242,242,242,0.22)";
    const bar = w / peaks.length;
    peaks.forEach((p, i) => {
      const bh = Math.max(1, p * h * 0.9);
      ctx.fillRect(i * bar, (h - bh) / 2, Math.max(1, bar - 0.5), bh);
    });
  }, [peaks]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const t = audioRef.current?.currentTime ?? 0;
      if (headRef.current && duration > 0) headRef.current.style.left = `${Math.min(100, (t / duration) * 100)}%`;
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [audioRef, duration]);

  const timeAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || duration <= 0) return 0;
    return Math.max(0, Math.min(duration, ((clientX - rect.left) / rect.width) * duration));
  };

  return (
    <div className="select-none">
      <div
        ref={trackRef}
        className="relative h-20 cursor-pointer overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          onSeek(timeAt(e.clientX));
        }}
        onPointerMove={(e) => {
          setHover(timeAt(e.clientX));
          if (e.buttons === 1) onSeek(timeAt(e.clientX));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <canvas ref={waveRef} className="absolute inset-x-0 top-0 h-12 w-full" />
        <div className="absolute inset-x-0 bottom-0 h-7 border-t border-white/[0.06]">
          {duration > 0
            ? lines.map((line) => (
                <div
                  key={line.index}
                  title={line.words.map((w) => w.text).join(" ")}
                  className={`absolute top-1.5 bottom-1.5 rounded-[3px] border transition-colors ${
                    selectedLine === line.index
                      ? "border-yellow/80 bg-yellow/30"
                      : dirtyLines.has(line.index)
                        ? "border-orange/50 bg-orange/20"
                        : "border-white/15 bg-white/10"
                  }`}
                  style={{
                    left: `${(line.start / duration) * 100}%`,
                    width: `max(3px, ${((line.end - line.start) / duration) * 100}%)`,
                  }}
                />
              ))
            : null}
        </div>
        <div ref={headRef} className="pointer-events-none absolute top-0 bottom-0 w-px bg-yellow shadow-[0_0_8px_#daff52]" />
        {hover !== null ? (
          <div
            className="pointer-events-none absolute top-1 -translate-x-1/2 rounded bg-black/80 px-1.5 py-0.5 font-code text-[0.625rem] text-bright"
            style={{ left: `${(hover / Math.max(duration, 0.001)) * 100}%` }}
          >
            {formatTime(hover, true)}
          </div>
        ) : null}
      </div>
    </div>
  );
}
