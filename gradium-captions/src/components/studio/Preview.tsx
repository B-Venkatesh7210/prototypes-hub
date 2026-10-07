"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { layoutLines } from "@/lib/captions/layout";
import { drawCaptions, drawStage } from "@/lib/captions/render";
import { aspectSize, resolveFontFamily } from "@/lib/captions/style";
import type { CaptionStyle, Word } from "@/lib/types";
import { useCanvasLoop } from "@/components/captions/useCanvasLoop";

export type StageMedia = { url: string; kind: "audio" | "video"; width?: number; height?: number } | null;

const PREVIEW_SHORT_SIDE = 1080;

/** The video's own frame, capped so the short side stays at most 1080px for the live preview. */
function nativeFrame(media: StageMedia) {
  if (!media?.width || !media.height) return null;
  const k = Math.min(1, PREVIEW_SHORT_SIDE / Math.min(media.width, media.height));
  return { width: Math.round(media.width * k), height: Math.round(media.height * k) };
}

export function Preview({
  audioRef,
  words,
  style,
  media,
  fit,
  bed = 0,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  words: Word[];
  style: CaptionStyle;
  media: StageMedia;
  fit: "cover" | "contain";
  /** Volume of the video's own sound under the voice track, 0 to mute it. */
  bed?: number;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const showVideo = style.stage === "video" && media?.kind === "video";
  const native = showVideo ? nativeFrame(media) : null;
  const { width, height } = native ?? aspectSize(style.aspect);
  const lines = useMemo(() => layoutLines(words, style), [words, style]);
  const [fontFamily, setFontFamily] = useState("sans-serif");

  useEffect(() => {
    let cancelled = false;
    void document.fonts.ready.then(() => !cancelled && setFontFamily(resolveFontFamily(style.fontId)));
    return () => {
      cancelled = true;
    };
  }, [style.fontId]);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const audio = audioRef.current;
      const t = audio?.currentTime ?? 0;
      const el = videoRef.current;
      if (el && !showVideo && !el.paused) el.pause();
      const video = showVideo ? el : null;
      if (video) {
        const volume = Math.min(1, Math.max(0, bed));
        if (video.volume !== volume) video.volume = volume;
        if (volume === 0 && !video.muted) video.muted = true;
        if (volume > 0 && video.muted && video.paused) video.muted = false;
      }
      if (video && video.readyState >= 2 && audio) {
        if (Math.abs(video.currentTime - t) > 0.3 && t < video.duration) video.currentTime = t;
        if (audio.paused && !video.paused) video.pause();
        if (!audio.paused && video.paused && t < video.duration) {
          void video.play().catch(() => {
            video.muted = true;
            void video.play().catch(() => undefined);
          });
        }
      }
      drawStage(ctx, w, h, { background: style.stage, time: t, video, fit: native ? "cover" : fit });
      drawCaptions(ctx, w, h, lines, t, style, fontFamily);
    },
    [audioRef, showVideo, style, lines, fontFamily, fit, native, bed],
  );
  useCanvasLoop(canvasRef, width, height, draw);

  return (
    <div
      className={`relative mx-auto w-full overflow-hidden rounded-2xl border border-white/10 ${style.stage === "transparent" ? "checker" : "bg-black"}`}
      style={{
        aspectRatio: `${width} / ${height}`,
        maxHeight: "62vh",
        maxWidth: native
          ? width < height
            ? "380px"
            : undefined
          : style.aspect === "9:16"
            ? "380px"
            : style.aspect === "4:5"
              ? "520px"
              : style.aspect === "1:1"
                ? "620px"
                : undefined,
      }}
    >
      <canvas ref={canvasRef} className="h-full w-full" />
      {media?.kind === "video" ? (
        <video ref={videoRef} src={media.url} muted playsInline preload="auto" className="pointer-events-none absolute h-px w-px opacity-0" />
      ) : null}
    </div>
  );
}
