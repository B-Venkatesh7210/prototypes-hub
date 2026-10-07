"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toAss, toPlainVtt, toSrt, toVtt, toWordsJson } from "@/lib/captions/subtitles";
import { aspectSize } from "@/lib/captions/style";
import { downloadBlob } from "@/lib/client/audio";
import { remuxOriginal, renderBurnedIn, webCodecsSupported, type AudioMix } from "@/lib/client/encode";
import { exportVideo, supportedVideoFormats, type VideoFormat } from "@/lib/client/export";
import { trackAudio } from "@/lib/client/pipeline";
import { LANG_ACCENT } from "@/lib/langs";
import type { CaptionStyle, Project, Track } from "@/lib/types";
import { formatTime } from "@/lib/words";
import { Check, Download, Film, X } from "@/components/ui/icons";
import { Button, ErrorNote, Label, Segmented, Toggle } from "@/components/ui/primitives";

function slug(s: string) {
  return (
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || "captions"
  );
}

type Progress = { fraction: number; label: string };

function isAbort(err: unknown) {
  return err instanceof DOMException && err.name === "AbortError";
}

export function ExportDialog({
  project,
  track,
  style,
  media,
  mediaSize,
  fit,
  onFit,
  onClose,
}: {
  project: Project;
  track: Track;
  style: CaptionStyle;
  media: Blob | null;
  mediaSize: { width?: number; height?: number } | null;
  fit: "cover" | "contain";
  onFit: (fit: "cover" | "contain") => void;
  onClose: () => void;
}) {
  const fastPath = useMemo(() => webCodecsSupported(), []);
  const formats = useMemo<VideoFormat[]>(() => (fastPath ? [] : supportedVideoFormats()), [fastPath]);
  const [formatId, setFormatId] = useState(formats[0]?.id ?? "");
  const [includeAudio, setIncludeAudio] = useState(true);
  const [keepOriginal, setKeepOriginal] = useState(false);
  const [streamLangs, setStreamLangs] = useState<string[]>(() => project.tracks.map((t) => t.id));
  const [progress, setProgress] = useState<Progress | null>(null);
  const [error, setError] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const name = slug(project.title);
  const base = `${name}-${track.lang}`;
  const format = formats.find((f) => f.id === formatId) ?? formats[0];
  const exporting = progress !== null;

  const video = style.stage === "video" && project.mediaKind === "video" ? media : null;
  const canRemux = fastPath && project.mediaKind === "video" && !!media;
  const remux = canRemux && keepOriginal;
  const size =
    video && mediaSize?.width && mediaSize.height ? { width: mediaSize.width, height: mediaSize.height } : aspectSize(style.aspect);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !exporting && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exporting, onClose]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const text = (content: string, ext: string, type: string) => downloadBlob(new Blob([content], { type }), `${base}.${ext}`);

  const audioFor = async (t: Track): Promise<AudioMix> => {
    const fromVideo = project.mediaKind === "video" && media ? media : null;
    if (t.kind === "original" && fromVideo) return { voice: fromVideo, fallback: await trackAudio(t) };
    const volume = project.bed ?? 0;
    return { voice: await trackAudio(t), bed: fromVideo && volume > 0 ? { media: fromVideo, volume } : null };
  };

  const run = async (job: (signal: AbortSignal) => Promise<void>) => {
    setError("");
    setProgress({ fraction: 0, label: "Preparing" });
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      await job(controller.signal);
    } catch (err) {
      if (!isAbort(err)) setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  };

  const burnIn = (tracks: Track[]) =>
    run(async (signal) => {
      for (const [i, t] of tracks.entries()) {
        const prefix = tracks.length > 1 ? `${t.label} · ${i + 1} of ${tracks.length} · ` : "";
        const blob = await renderBurnedIn({
          words: t.words,
          style,
          media: video,
          audio: await audioFor(t),
          duration: t.duration,
          signal,
          onProgress: (f) => setProgress({ fraction: (i + f) / tracks.length, label: `${prefix}Encoding ${Math.round(f * 100)}%` }),
        });
        downloadBlob(blob, `${name}-${t.lang}.mp4`);
      }
    });

  const exportStream = () =>
    run(async (signal) => {
      if (!media) return;
      const chosen = project.tracks.filter((t) => streamLangs.includes(t.id));
      const ordered = [...chosen.filter((t) => t.id === track.id), ...chosen.filter((t) => t.id !== track.id)];
      const tracks = await Promise.all(
        ordered.map(async (t) => ({ lang: t.lang, name: t.label, audio: await audioFor(t), vtt: toPlainVtt(t.words, style) })),
      );
      setProgress({ fraction: 0, label: "Copying the video stream" });
      const blob = await remuxOriginal({
        media,
        tracks,
        signal,
        onProgress: (f) => setProgress({ fraction: f, label: `Copying the video stream ${Math.round(f * 100)}%` }),
      });
      downloadBlob(blob, ordered.length > 1 ? `${name}-${ordered.length}-languages.mp4` : `${name}-${ordered[0].lang}-original.mp4`);
    });

  const recordFallback = () =>
    run(async (signal) => {
      if (!format) return;
      const blob = await exportVideo({
        audio: await trackAudio(track),
        words: track.words,
        style,
        background: style.stage,
        media: video,
        fit,
        includeAudio,
        format,
        signal,
        onProgress: (f) => setProgress({ fraction: f, label: `Rendering ${formatTime(f * track.duration)} / ${formatTime(track.duration)}` }),
      });
      downloadBlob(blob, `${base}.${format.ext}`);
    });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={() => !exporting && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Export"
        className="scroll-thin max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <p className="font-komuna text-[0.6875rem] tracking-[0.25em] text-lightgray uppercase">Export</p>
            <h2 className="mt-2 font-favorit text-2xl text-white">{track.label}</h2>
            <p className="mt-1 font-plex text-xs text-lightgray">
              {formatTime(track.duration)} · {track.words.length} words · {size.width}×{size.height}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-lightgray hover:bg-white/5 hover:text-bright disabled:opacity-30"
          >
            <X size={15} />
          </button>
        </div>

        <section className="flex flex-col gap-4 rounded-xl border border-white/10 p-4">
          <div className="flex items-center gap-2">
            <Film size={15} />
            <h3 className="font-favorit text-base text-white">Captioned video</h3>
          </div>

          {fastPath ? (
            <>
              {!remux ? (
                <>
                  <p className="font-plex text-xs leading-snug text-lightgray">
                    {video
                      ? "MP4 with the karaoke captions burned in, at the uploaded video's resolution, frame rate and bitrate."
                      : `MP4 at ${size.width}×${size.height} with the karaoke captions on the ${style.stage} stage.`}
                    {track.kind === "dub" && project.mediaKind === "video" && project.bed
                      ? ` Original sound mixed in at ${Math.round(project.bed * 100)}%.`
                      : ""}
                  </p>
                  {style.stage === "transparent" ? (
                    <p className="font-plex text-xs leading-snug text-[#ffd2bd]">
                      MP4 has no transparency, so the transparent stage renders black. Use the green stage for keying.
                    </p>
                  ) : null}
                  <div className="grid gap-2 sm:grid-cols-2">
                    <Button onClick={() => burnIn([track])} disabled={exporting}>
                      <Download size={14} /> Export {track.label}
                    </Button>
                    {project.tracks.length > 1 ? (
                      <Button tone="secondary" onClick={() => burnIn(project.tracks)} disabled={exporting}>
                        <Download size={14} /> All {project.tracks.length} languages
                      </Button>
                    ) : null}
                  </div>
                </>
              ) : (
                <>
                  <p className="font-plex text-xs leading-snug text-lightgray">
                    One MP4 whose picture is copied bit for bit from your upload, with a dubbed audio track and a subtitle track per
                    language. Viewers switch language in players like VLC, IINA or QuickTime. Subtitle tracks are plain text, so the
                    karaoke styling is not included.
                  </p>
                  <div className="flex flex-col gap-1.5">
                    <Label hint="First is the default">Languages in the file</Label>
                    {project.tracks.map((t) => {
                      const on = streamLangs.includes(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setStreamLangs((v) => (on ? v.filter((id) => id !== t.id) : [...v, t.id]))}
                          className={`flex cursor-pointer items-center justify-between rounded-lg border px-3 py-2 text-left transition-colors ${
                            on ? "border-bright/40 bg-white/[0.05]" : "border-white/10 hover:border-white/25"
                          }`}
                        >
                          <span className="flex items-center gap-2">
                            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LANG_ACCENT[t.lang] }} />
                            <span className="font-plex text-sm text-bright">{t.label}</span>
                            {t.id === track.id ? <span className="font-code text-[0.625rem] text-lightgray">default</span> : null}
                          </span>
                          <span
                            className={`flex h-4 w-4 items-center justify-center rounded border ${
                              on ? "border-bright bg-bright text-ink" : "border-white/20 text-transparent"
                            }`}
                          >
                            <Check size={10} />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                  <Button onClick={exportStream} disabled={exporting || !streamLangs.length}>
                    <Download size={14} /> Export MP4 · {streamLangs.length} {streamLangs.length === 1 ? "language" : "languages"}
                  </Button>
                </>
              )}
              {canRemux ? (
                <div className="border-t border-white/[0.06] pt-3">
                  <Toggle
                    label="Advanced: keep the original video stream (captions as subtitle tracks)"
                    checked={keepOriginal}
                    onChange={setKeepOriginal}
                  />
                </div>
              ) : null}
            </>
          ) : formats.length ? (
            <>
              <div>
                <Label>Format</Label>
                <Segmented value={format?.id ?? ""} onChange={setFormatId} options={formats.map((f) => ({ value: f.id, label: f.label }))} />
              </div>
              {video ? (
                <div>
                  <Label>Fit video</Label>
                  <Segmented
                    value={fit}
                    onChange={onFit}
                    options={[
                      { value: "cover", label: "Fill frame" },
                      { value: "contain", label: "Fit inside" },
                    ]}
                  />
                </div>
              ) : null}
              <Toggle label="Include the voice track" checked={includeAudio} onChange={setIncludeAudio} />
              <p className="font-plex text-xs leading-snug text-lightgray">
                This browser lacks WebCodecs, so the video is recorded in real time at the preset size. Chrome, Edge and Safari 17+
                export at the source&apos;s quality.
              </p>
              <Button onClick={recordFallback} disabled={exporting}>
                <Download size={14} /> Render {format?.ext.toUpperCase()} · about {formatTime(track.duration)}
              </Button>
            </>
          ) : (
            <p className="font-plex text-sm text-lightgray">This browser can&apos;t export video. Try Chrome, Edge or Safari 17+.</p>
          )}

          {progress ? (
            <div className="flex flex-col gap-2">
              <div className="h-2 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-yellow transition-[width] duration-200" style={{ width: `${Math.round(progress.fraction * 100)}%` }} />
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="truncate font-code text-xs text-lightgray">{progress.label}</span>
                <Button size="sm" tone="ghost" onClick={() => abortRef.current?.abort()}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : null}
        </section>

        <section className="mt-4 flex flex-col gap-3 rounded-xl border border-white/10 p-4">
          <h3 className="font-favorit text-base text-white">Subtitles and data</h3>
          <div className="grid grid-cols-2 gap-2">
            <Button tone="secondary" size="sm" onClick={() => text(toSrt(track.words, style), "srt", "application/x-subrip")}>
              SRT
            </Button>
            <Button tone="secondary" size="sm" onClick={() => text(toVtt(track.words, style), "vtt", "text/vtt")}>
              WebVTT · word timing
            </Button>
            <Button tone="secondary" size="sm" onClick={() => text(toAss(track.words, style), "ass", "text/x-ssa")}>
              ASS · karaoke
            </Button>
            <Button tone="secondary" size="sm" onClick={() => text(toWordsJson(track.words), "words.json", "application/json")}>
              words.json
            </Button>
          </div>
          <Button tone="ghost" size="sm" onClick={async () => downloadBlob(await trackAudio(track), `${base}.wav`)}>
            <Download size={13} /> Voice track (WAV)
          </Button>
        </section>

        {error ? (
          <div className="mt-4">
            <ErrorNote>{error}</ErrorNote>
          </div>
        ) : null}
      </div>
    </div>
  );
}
