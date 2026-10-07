"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { layoutLines } from "@/lib/captions/layout";
import { drawLine, drawStage } from "@/lib/captions/render";
import { applyPreset, aspectSize, DEFAULT_STYLE, PRESETS, resolveFontFamily, styleForAspect } from "@/lib/captions/style";
import { api } from "@/lib/client/api";
import { wavBlob } from "@/lib/client/audio";
import { db } from "@/lib/client/db";
import { browserRecognitionAvailable, LiveCaptioner, type EngineId } from "@/lib/client/live";
import { newProject, storeBlob, trackLabel } from "@/lib/client/pipeline";
import { LIMITS } from "@/lib/limits";
import type { Aspect, CaptionStyle, Lang, StageBackground, Track, Word } from "@/lib/types";
import { formatTime, round, tokenize, uid } from "@/lib/words";
import { useStatus } from "@/components/shell/StatusProvider";
import { useCanvasLoop } from "@/components/captions/useCanvasLoop";
import { LangSelect } from "@/components/flow/LangPicker";
import { ArrowRight, Mic, Stop, Trash } from "@/components/ui/icons";
import { Button, Chip, ErrorNote, Label, Panel, Segmented } from "@/components/ui/primitives";

type Phase = "idle" | "starting" | "recording" | "stopping" | "stopped";

const ENGINES: { id: EngineId; label: string; note: string }[] = [
  { id: "gradium", label: "Gradium realtime", note: "WebSocket STT with semantic VAD · spends credits" },
  { id: "browser", label: "Browser speech", note: "Free test engine built into Chrome, Edge and Safari" },
  { id: "simulated", label: "Simulated", note: "Offline: captions follow your voice activity" },
];

const noopSubscribe = () => () => {};

export function LiveStudio() {
  const router = useRouter();
  const { isMock } = useStatus();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const captionerRef = useRef<LiveCaptioner | null>(null);
  const wordsRef = useRef<Word[]>([]);
  const partialRef = useRef("");
  const samplesRef = useRef<Float32Array | null>(null);
  const elapsedRef = useRef(0);
  const stopRef = useRef<() => void>(() => undefined);

  const [phase, setPhase] = useState<Phase>("idle");
  const [pickedEngine, setEngine] = useState<EngineId | null>(null);
  const browserAvailable = useSyncExternalStore(noopSubscribe, browserRecognitionAvailable, () => false);
  const engine: EngineId = pickedEngine ?? (isMock ? (browserAvailable ? "browser" : "simulated") : "gradium");
  const [lang, setLang] = useState<Lang>("en");
  const [keywords, setKeywords] = useState("Gradium");
  const [style, setStyle] = useState<CaptionStyle>(() => ({ ...DEFAULT_STYLE, holdAfter: 2.5, stage: "gradient" }));
  const [words, setWords] = useState<Word[]>([]);
  const [partial, setPartial] = useState("");
  const [level, setLevel] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [title, setTitle] = useState("Live session");

  useEffect(() => () => void captionerRef.current?.stop(), []);

  const { width, height } = aspectSize(style.aspect);
  const fontFamily = useMemo(() => (typeof document === "undefined" ? "sans-serif" : resolveFontFamily(style.fontId)), [style.fontId]);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const t = captionerRef.current && phase === "recording" ? captionerRef.current.elapsed : elapsedRef.current;
      drawStage(ctx, w, h, { background: style.stage, time: t });
      const tokens = tokenize(partialRef.current);
      const display: Word[] = [
        ...wordsRef.current,
        ...tokens.map((text, i) => ({ id: `p${i}`, text, start: t - 0.05 * (tokens.length - i), end: t + 0.2 })),
      ];
      if (!display.length) return;
      const lines = layoutLines(display, style);
      const last = lines[lines.length - 1];
      if (!last || t - last.end > style.holdAfter) return;
      drawLine(ctx, w, h, last, Infinity, Math.max(t, last.words[last.words.length - 1].start), style, fontFamily);
    },
    [phase, style, fontFamily],
  );
  useCanvasLoop(canvasRef, width, height, draw);

  const start = async () => {
    setError("");
    setStatus("");
    wordsRef.current = [];
    partialRef.current = "";
    samplesRef.current = null;
    setWords([]);
    setPartial("");
    setPhase("starting");
    const captioner = new LiveCaptioner(
      engine,
      lang,
      keywords
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean),
      {
        onWords: (fresh) => {
          if (!fresh.length) return;
          wordsRef.current = [...wordsRef.current, ...fresh];
          setWords(wordsRef.current);
        },
        onPartial: (text) => {
          partialRef.current = text;
          setPartial(text);
        },
        onLevel: setLevel,
        onStatus: setStatus,
        onError: setError,
        onSentenceEnd: () => {
          const list = wordsRef.current;
          const lastWord = list[list.length - 1];
          if (lastWord && !/[.!?]$/.test(lastWord.text)) {
            wordsRef.current = [...list.slice(0, -1), { ...lastWord, text: `${lastWord.text.replace(/[,;:]$/, "")}.` }];
            setWords(wordsRef.current);
          }
        },
      },
    );
    captionerRef.current = captioner;
    try {
      await captioner.start();
      setPhase("recording");
    } catch (err) {
      captionerRef.current = null;
      await captioner.stop().catch(() => undefined);
      setPhase("idle");
      setError(err instanceof Error ? err.message : "Could not start the microphone.");
    }
  };

  useEffect(() => {
    if (phase !== "recording") return;
    const id = setInterval(() => {
      const t = captionerRef.current?.elapsed ?? 0;
      setElapsed(t);
      if (t >= LIMITS.liveSeconds) {
        stopRef.current();
        setStatus(`Stopped at the ${LIMITS.liveSeconds}-second demo limit.`);
      }
    }, 200);
    return () => clearInterval(id);
  }, [phase]);

  const stop = async () => {
    const captioner = captionerRef.current;
    if (!captioner) return;
    elapsedRef.current = captioner.elapsed;
    captionerRef.current = null;
    setPhase("stopping");
    const samples = await captioner.stop();
    samplesRef.current = samples;
    elapsedRef.current = samples.length / 24000;
    setElapsed(elapsedRef.current);
    partialRef.current = "";
    setPartial("");
    api.recordLive(elapsedRef.current, engine !== "gradium");
    setPhase("stopped");
  };

  useEffect(() => {
    stopRef.current = () => void stop();
  });

  const discard = () => {
    wordsRef.current = [];
    samplesRef.current = null;
    elapsedRef.current = 0;
    setWords([]);
    setElapsed(0);
    setPhase("idle");
  };

  const save = async () => {
    const samples = samplesRef.current;
    if (!samples) return;
    const duration = samples.length / 24000;
    const audioKey = await storeBlob(wavBlob({ sampleRate: 24000, samples }));
    const cleaned = wordsRef.current
      .filter((w) => w.start < duration)
      .map((w) => ({ ...w, start: round(Math.max(0, w.start)), end: round(Math.min(duration, Math.max(w.end, w.start + 0.08))) }));
    const track: Track = {
      id: uid("t"),
      lang,
      kind: "live",
      label: trackLabel(lang, "live"),
      audioKey,
      duration: round(duration),
      words: cleaned,
      createdAt: Date.now(),
    };
    const project = newProject({ title: title || "Live session", product: "live", sourceLang: lang, aspect: style.aspect, mock: engine !== "gradium" });
    project.style = { ...project.style, ...style, holdAfter: 0.6 };
    project.tracks = [track];
    project.activeTrackId = track.id;
    await db.saveProject(project);
    router.push(`/studio/${project.id}`);
  };

  const recording = phase === "recording";
  const remaining = Math.max(0, LIMITS.liveSeconds - elapsed);
  const transcript = words.map((w) => w.text).join(" ");

  return (
    <div className="container-medium grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4">
        <div
          className={`relative mx-auto w-full overflow-hidden rounded-2xl border border-white/10 ${style.stage === "transparent" ? "checker" : "bg-black"}`}
          style={{ aspectRatio: `${width} / ${height}`, maxHeight: "68vh", maxWidth: style.aspect === "9:16" ? "420px" : undefined }}
        >
          <canvas ref={canvasRef} className="h-full w-full" />
          <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 backdrop-blur">
            <span className={`h-2 w-2 rounded-full ${recording ? "rec-pulse bg-red" : "bg-lightgray"}`} />
            <span className="font-code text-xs text-white">{recording ? "REC" : phase === "stopped" ? "DONE" : "READY"}</span>
            <span className={`font-code text-xs ${recording && remaining <= 10 ? "text-orange" : "text-lightgray"}`}>
              {formatTime(elapsed)} / {formatTime(LIMITS.liveSeconds)}
            </span>
          </div>
          {phase === "idle" && !words.length ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center">
              <p className="font-favorit text-xl text-white/80">Press record and start talking</p>
              <p className="font-plex text-sm text-lightgray">
                Captions appear here word by word · up to {LIMITS.liveSeconds} seconds per take
              </p>
            </div>
          ) : null}
        </div>

        <div className="flex flex-wrap items-center justify-center gap-3">
          {recording || phase === "stopping" ? (
            <Button size="lg" tone="danger" onClick={stop} disabled={phase === "stopping"}>
              <Stop size={14} /> Stop recording
            </Button>
          ) : phase === "stopped" ? (
            <>
              <Button size="lg" onClick={save}>
                Open in studio <ArrowRight size={15} />
              </Button>
              <Button size="lg" tone="secondary" onClick={start}>
                <Mic size={15} /> Record again
              </Button>
              <Button size="lg" tone="ghost" onClick={discard}>
                <Trash size={14} /> Discard
              </Button>
            </>
          ) : (
            <Button size="lg" onClick={start} disabled={phase === "starting"}>
              <Mic size={15} /> {phase === "starting" ? "Starting…" : "Start recording"}
            </Button>
          )}
          <div className="flex h-11 w-40 items-center gap-0.5 rounded-lg border border-white/10 px-3" aria-label="Microphone level">
            {Array.from({ length: 18 }, (_, i) => (
              <span
                key={i}
                className="flex-1 rounded-full transition-all duration-75"
                style={{
                  height: `${Math.max(12, Math.min(100, level * 900 - i * 3))}%`,
                  backgroundColor: recording && level * 900 > i * 5.5 ? (i > 14 ? "#f55142" : "#60e21a") : "rgba(255,255,255,0.12)",
                }}
              />
            ))}
          </div>
        </div>
        {status ? <p className="text-center font-code text-xs text-lightgray">{status}</p> : null}
        {error ? <ErrorNote>{error}</ErrorNote> : null}

        <Panel className="p-5">
          <Label hint={`${words.length} words`}>Transcript</Label>
          <p className="min-h-16 font-plex text-[0.9375rem] leading-relaxed text-bright/90">
            {transcript}
            {partial ? <span className="text-lightgray"> {partial}</span> : null}
            {!transcript && !partial ? <span className="text-lightgray">Nothing yet.</span> : null}
          </p>
        </Panel>
      </div>

      <aside className="flex flex-col gap-4">
        <Panel className="flex flex-col gap-5 p-5">
          <div>
            <Label>Engine</Label>
            <div className="flex flex-col gap-2">
              {ENGINES.map((e) => {
                const disabled = (e.id === "gradium" && isMock) || (e.id === "browser" && !browserAvailable);
                return (
                  <button
                    key={e.id}
                    type="button"
                    disabled={disabled || recording}
                    onClick={() => setEngine(e.id)}
                    className={`flex cursor-pointer flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                      engine === e.id ? "border-bright/50 bg-white/[0.07]" : "border-white/10 hover:border-white/25"
                    }`}
                  >
                    <span className="font-favorit text-sm text-white">{e.label}</span>
                    <span className="font-plex text-xs text-lightgray">
                      {e.id === "gradium" && isMock ? "Needs GRADIUM_MODE=live" : e.note}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <Label>Language</Label>
            <LangSelect value={lang} onChange={setLang} />
          </div>
          <div>
            <Label hint="Keyword boosting">Names and terms</Label>
            <input className="field" value={keywords} onChange={(e) => setKeywords(e.target.value)} disabled={recording} />
          </div>
          <div>
            <Label>Session name</Label>
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        </Panel>

        <Panel className="flex flex-col gap-5 p-5">
          <div>
            <Label>Caption style</Label>
            <div className="flex flex-wrap gap-1.5">
              {PRESETS.map((p) => (
                <Chip key={p.id} active={style.preset === p.id} onClick={() => setStyle((s) => ({ ...applyPreset(s, p.id), holdAfter: 2.5 }))}>
                  {p.label}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <Label>Stage</Label>
            <Segmented<StageBackground>
              value={style.stage}
              onChange={(stage) => setStyle((s) => ({ ...s, stage }))}
              options={[
                { value: "gradient", label: "Gradient" },
                { value: "dark", label: "Dark" },
                { value: "green", label: "Green" },
                { value: "transparent", label: "Clear" },
              ]}
            />
            <p className="mt-2 font-plex text-xs text-lightgray">Green screen works as an OBS window-capture overlay.</p>
          </div>
          <div>
            <Label>Canvas</Label>
            <Segmented<Aspect>
              value={style.aspect}
              onChange={(aspect) => setStyle((s) => styleForAspect(s, aspect))}
              options={[
                { value: "16:9", label: "16:9" },
                { value: "9:16", label: "9:16" },
                { value: "1:1", label: "1:1" },
              ]}
            />
          </div>
        </Panel>
      </aside>
    </div>
  );
}
