"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { layoutLines, type Line } from "@/lib/captions/layout";
import { probeMedia } from "@/lib/client/audio";
import { db } from "@/lib/client/db";
import { revoiceLine } from "@/lib/client/pipeline";
import { LANG_ACCENT } from "@/lib/langs";
import { LIMITS } from "@/lib/limits";
import type { CaptionStyle, StageBackground, Word } from "@/lib/types";
import { ArrowLeft, Download, Plus, Redo, Undo } from "@/components/ui/icons";
import { Button, ButtonLink, Chip, ErrorNote, Pill, Segmented, Spinner } from "@/components/ui/primitives";
import { ExportDialog } from "./ExportDialog";
import { Preview, type StageMedia } from "./Preview";
import { StylePanel } from "./StylePanel";
import { Timeline, usePeaks } from "./Timeline";
import { TrackPanel } from "./TrackPanel";
import { Transport } from "./Transport";
import { useProject } from "./useProject";
import { WordEditor } from "./WordEditor";

const PRODUCT_LABEL = { dub: "Record once, ship in 5", script: "Script to voice", live: "Live captions" } as const;

const STAGES: { value: StageBackground; label: string }[] = [
  { value: "gradient", label: "Gradient" },
  { value: "dark", label: "Ink" },
  { value: "light", label: "Paper" },
  { value: "green", label: "Green screen" },
  { value: "transparent", label: "Transparent" },
];

function wordIndexAt(words: Word[], t: number): number {
  let lo = 0;
  let hi = words.length - 1;
  let found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (words[mid].start <= t) {
      found = mid;
      lo = mid + 1;
    } else hi = mid - 1;
  }
  return found;
}

function isTyping(target: EventTarget | null) {
  return target instanceof HTMLElement && (target.isContentEditable || !!target.closest("input, textarea, select"));
}

export function Studio({ id }: { id: string }) {
  const { project, loading, saved, canUndo, canRedo, update, updateTrack, undo, redo } = useProject(id);
  const audioRef = useRef<HTMLAudioElement>(null);
  const resumeAt = useRef<number | null>(null);
  const [audio, setAudio] = useState<{ blob: Blob; url: string } | null>(null);
  const [media, setMedia] = useState<{ blob: Blob; url: string; kind: "audio" | "video"; width?: number; height?: number } | null>(null);
  const [playing, setPlaying] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const [selected, setSelected] = useState<number | null>(null);
  const [panel, setPanel] = useState<"style" | "track">("style");
  const [exportOpen, setExportOpen] = useState(false);
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const [revoicing, setRevoicing] = useState<number | null>(null);
  const [error, setError] = useState("");

  const track = project ? (project.tracks.find((t) => t.id === project.activeTrackId) ?? project.tracks[0]) : undefined;
  const style = project?.style;
  const words = useMemo(() => track?.words ?? [], [track]);
  const lines = useMemo(() => (style ? layoutLines(words, style) : []), [words, style]);
  const dirtyLines = useMemo(() => new Set(lines.filter((l) => l.words.some((w) => w.dirty)).map((l) => l.index)), [lines]);
  const peaks = usePeaks(audio?.blob ?? null);
  const selectedWord = selected !== null && selected < words.length ? selected : null;
  const selectedLine = useMemo(
    () => (selectedWord === null ? null : (lines.find((l) => selectedWord >= l.offset && selectedWord < l.offset + l.words.length)?.index ?? null)),
    [lines, selectedWord],
  );

  const audioKey = track?.audioKey;
  useEffect(() => {
    if (!audioKey) return;
    let url = "";
    let cancelled = false;
    void db.getBlob(audioKey).then((blob) => {
      if (cancelled || !blob) return;
      url = URL.createObjectURL(blob);
      setAudio({ blob, url });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [audioKey]);

  const mediaKey = project?.mediaKey;
  const mediaKind = project?.mediaKind;
  useEffect(() => {
    if (!mediaKey) return;
    let url = "";
    let cancelled = false;
    void db.getBlob(mediaKey).then(async (blob) => {
      if (cancelled || !blob) return;
      const kind = mediaKind ?? "audio";
      const info = kind === "video" ? await probeMedia(blob) : null;
      if (cancelled) return;
      url = URL.createObjectURL(blob);
      setMedia({ blob, url, kind, width: info?.width, height: info?.height });
    });
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [mediaKey, mediaKind]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      const t = audioRef.current?.currentTime ?? 0;
      setActiveIndex(wordIndexAt(words, t));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [words]);

  const seek = useCallback((t: number) => {
    const el = audioRef.current;
    if (el) el.currentTime = Math.max(0, t);
  }, []);

  const toggle = useCallback(() => {
    const el = audioRef.current;
    if (!el) return;
    if (el.paused) void el.play().catch(() => undefined);
    else el.pause();
  }, []);

  const jumpLine = useCallback(
    (dir: 1 | -1) => {
      const t = audioRef.current?.currentTime ?? 0;
      const target = dir === 1 ? lines.find((l) => l.start > t + 0.05) : [...lines].reverse().find((l) => l.start < t - 0.3);
      seek(target ? target.start : dir === 1 ? (track?.duration ?? 0) : 0);
    },
    [lines, seek, track?.duration],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (exportOpen || isTyping(e.target)) return;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if (e.key === " " && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        toggle();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [exportOpen, undo, redo, toggle]);

  const setStyle = useCallback((fn: (s: CaptionStyle) => CaptionStyle) => update((p) => ({ ...p, style: fn(p.style) }), "patch"), [update]);

  const editWords = useCallback(
    (fn: (w: Word[]) => Word[]) => {
      if (track) updateTrack(track.id, (t) => ({ ...t, words: fn(t.words) }));
    },
    [track, updateTrack],
  );

  const revoicesLeft = Math.max(0, LIMITS.revoicesPerProject - (project?.revoices ?? 0));

  const revoice = async (line: Line) => {
    if (!track || revoicesLeft <= 0 || line.words.length > LIMITS.revoiceWords) return;
    setRevoicing(line.index);
    setError("");
    resumeAt.current = audioRef.current?.currentTime ?? 0;
    audioRef.current?.pause();
    try {
      const next = await revoiceLine(track, line.offset, line.offset + line.words.length - 1);
      update((p) => ({ ...p, revoices: (p.revoices ?? 0) + 1, tracks: p.tracks.map((t) => (t.id === next.id ? next : t)) }), "replace");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not re-voice that line");
    } finally {
      setRevoicing(null);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-lightgray">
        <Spinner className="h-6 w-6" />
      </div>
    );
  }

  if (!project || !track || !style) {
    return (
      <div className="container-medium flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
        <p className="font-favorit text-3xl text-white">Project not found</p>
        <p className="max-w-md font-plex text-sm text-lightgray">
          Projects live in this browser&apos;s storage. It may have been deleted, or created in another browser.
        </p>
        <ButtonLink href="/projects" tone="secondary">
          All projects
        </ButtonLink>
      </div>
    );
  }

  const stageMedia: StageMedia = media ? { url: media.url, kind: media.kind, width: media.width, height: media.height } : null;
  const nativeVideo = style.stage === "video" && media?.kind === "video" && !!media.width;
  const showBed = media?.kind === "video" && (project.product === "dub" || project.bed !== undefined);
  const bed = showBed && track.kind !== "original" ? (project.bed ?? 0) : 0;
  const stages = media?.kind === "video" ? [...STAGES.slice(0, 1), { value: "video" as const, label: "Your video" }, ...STAGES.slice(1)] : STAGES;

  return (
    <div className="pb-16">
      <audio
        ref={audioRef}
        src={audio?.url}
        preload="auto"
        onPlay={() => setPlaying(true)}
        onPause={() => setPlaying(false)}
        onEnded={() => setPlaying(false)}
        onLoadedMetadata={() => {
          if (resumeAt.current !== null && audioRef.current) {
            audioRef.current.currentTime = Math.min(resumeAt.current, audioRef.current.duration || resumeAt.current);
            resumeAt.current = null;
          }
        }}
      />

      <div className="border-b border-white/[0.06]">
        <div className="container-medium flex flex-wrap items-center gap-3 py-4">
          <Link href="/projects" className="flex items-center gap-1.5 font-plex text-sm text-lightgray transition-colors hover:text-bright">
            <ArrowLeft size={14} /> Projects
          </Link>
          <span className="h-4 w-px bg-white/10" />
          <input
            value={project.title}
            onChange={(e) => update((p) => ({ ...p, title: e.target.value }), "patch")}
            className="min-w-0 flex-1 rounded-md border border-transparent bg-transparent px-2 py-1 font-favorit text-xl text-white outline-none hover:border-white/10 focus:border-white/25"
            aria-label="Project title"
          />
          <span className="hidden font-komuna text-[0.625rem] tracking-[0.2em] text-lightgray uppercase sm:inline">{PRODUCT_LABEL[project.product]}</span>
          {project.mock ? <Pill color="#ffb592">Mock data</Pill> : <Pill>Gradium</Pill>}
          <span className="w-14 font-code text-[0.6875rem] text-lightgray">{saved ? "Saved" : "Saving…"}</span>
          <div className="flex items-center">
            <button
              type="button"
              onClick={undo}
              disabled={!canUndo}
              title="Undo (⌘Z)"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-lightgray hover:bg-white/5 hover:text-bright disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Undo size={15} />
            </button>
            <button
              type="button"
              onClick={redo}
              disabled={!canRedo}
              title="Redo (⇧⌘Z)"
              className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-lightgray hover:bg-white/5 hover:text-bright disabled:cursor-default disabled:opacity-30 disabled:hover:bg-transparent"
            >
              <Redo size={15} />
            </button>
          </div>
          <Button onClick={() => setExportOpen(true)}>
            <Download size={14} /> Export
          </Button>
        </div>
      </div>

      <div className="container-medium mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-4">
          <Preview audioRef={audioRef} words={words} style={style} media={stageMedia} fit={fit} bed={bed} />
          <div className="flex flex-wrap items-center justify-center gap-1.5">
            {stages.map((s) => (
              <Chip key={s.value} active={style.stage === s.value} onClick={() => setStyle((st) => ({ ...st, stage: s.value }))}>
                {s.label}
              </Chip>
            ))}
            {style.stage === "video" && !nativeVideo ? (
              <Segmented
                className="ml-2 w-44"
                value={fit}
                onChange={setFit}
                options={[
                  { value: "cover", label: "Fill" },
                  { value: "contain", label: "Fit" },
                ]}
              />
            ) : null}
          </div>
          {showBed ? (
            <label className="mx-auto flex w-full max-w-md items-center gap-3">
              <span className="shrink-0 font-komuna text-[0.625rem] tracking-[0.15em] text-lightgray uppercase">Original sound</span>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={project.bed ?? 0}
                onChange={(e) => update((p) => ({ ...p, bed: Number(e.target.value) }), "patch")}
                className="min-w-0 flex-1 accent-[#daff52]"
                aria-label="Original sound under the dub"
              />
              <span className="w-24 shrink-0 text-right font-code text-[0.6875rem] text-lightgray">
                {track.kind === "original" ? "original track" : `${Math.round((project.bed ?? 0) * 100)}% under dub`}
              </span>
            </label>
          ) : null}
          <Transport audioRef={audioRef} duration={track.duration} playing={playing} onToggle={toggle} onPrevLine={() => jumpLine(-1)} onNextLine={() => jumpLine(1)} />
          <Timeline audioRef={audioRef} duration={track.duration} lines={lines} peaks={peaks} selectedLine={selectedLine} dirtyLines={dirtyLines} onSeek={seek} />

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {project.tracks.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => {
                  if (t.id === track.id) return;
                  audioRef.current?.pause();
                  setSelected(null);
                  update((p) => ({ ...p, activeTrackId: t.id }), "patch");
                }}
                className={`flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 transition-colors ${
                  t.id === track.id ? "border-bright/50 bg-white/[0.07]" : "border-white/10 hover:border-white/25"
                }`}
              >
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: LANG_ACCENT[t.lang] }} />
                <span className="font-favorit text-sm text-white">{t.label}</span>
                {t.voice ? <span className="font-plex text-xs text-lightgray">{t.voice.name}</span> : null}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPanel("track")}
              className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-white/15 px-3 py-2 font-plex text-sm text-lightgray transition-colors hover:border-white/30 hover:text-bright"
            >
              <Plus size={13} /> Add language
            </button>
          </div>

          {error ? <ErrorNote>{error}</ErrorNote> : null}

          <div className="rounded-xl border border-white/10 bg-surface/60 p-4">
            <WordEditor
              words={words}
              lines={lines}
              activeIndex={playing ? activeIndex : -1}
              selected={selectedWord}
              playing={playing}
              canRevoice={!!track.voice}
              revoicesLeft={revoicesLeft}
              revoicingLine={revoicing}
              onSelect={setSelected}
              onSeek={seek}
              onChange={editWords}
              onRevoice={revoice}
            />
          </div>
        </div>

        <aside className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start">
          <Segmented
            value={panel}
            onChange={setPanel}
            options={[
              { value: "style", label: "Caption style" },
              { value: "track", label: "Track and voice" },
            ]}
          />
          <div className="scroll-thin overflow-y-auto rounded-xl border border-white/10 bg-surface/60 p-5 lg:max-h-[calc(100vh-6rem)]">
            {panel === "style" ? <StylePanel style={style} onChange={setStyle} /> : <TrackPanel project={project} track={track} update={update} />}
          </div>
        </aside>
      </div>

      {exportOpen ? (
        <ExportDialog
          project={project}
          track={track}
          style={style}
          media={media?.blob ?? null}
          mediaSize={media ? { width: media.width, height: media.height } : null}
          fit={fit}
          onFit={setFit}
          onClose={() => setExportOpen(false)}
        />
      ) : null}
    </div>
  );
}
