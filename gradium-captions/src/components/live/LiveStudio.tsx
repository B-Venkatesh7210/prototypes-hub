"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { layoutLines } from "@/lib/captions/layout";
import { drawLine, drawStage } from "@/lib/captions/render";
import { applyPreset, aspectSize, DEFAULT_STYLE, nearestAspect, PRESETS, resolveFontFamily, styleForAspect } from "@/lib/captions/style";
import { api } from "@/lib/client/api";
import { decodeToMono, wavBlob } from "@/lib/client/audio";
import { CameraRecorder, cameraSupported, openCamera, stopStream } from "@/lib/client/camera";
import { db } from "@/lib/client/db";
import { probeVideo, recordingToMp4 } from "@/lib/client/encode";
import { browserRecognitionAvailable, LiveCaptioner, type EngineId } from "@/lib/client/live";
import { newProject, storeBlob, trackLabel } from "@/lib/client/pipeline";
import { LIMITS } from "@/lib/limits";
import type { Aspect, CaptionPosition, CaptionStyle, Lang, StageBackground, Track, Word } from "@/lib/types";
import { formatTime, round, tokenize, uid } from "@/lib/words";
import { useStatus } from "@/components/shell/StatusProvider";
import { useCanvasLoop } from "@/components/captions/useCanvasLoop";
import { LangSelect } from "@/components/flow/LangPicker";
import { ArrowRight, Film, Mic, Stop, Trash } from "@/components/ui/icons";
import { Button, Chip, ErrorNote, Label, Panel, Segmented } from "@/components/ui/primitives";

type Phase = "idle" | "starting" | "recording" | "stopping" | "stopped" | "saving";
type InputMode = "camera" | "mic";

const RATE = 24000;
const PREVIEW_SHORT_SIDE = 1080;

/** The camera frame, capped so the short side of the live preview stays at most 1080px. */
function previewFrame(size: { width: number; height: number }) {
  const k = Math.min(1, PREVIEW_SHORT_SIDE / Math.min(size.width, size.height));
  return { width: Math.round(size.width * k), height: Math.round(size.height * k) };
}

const ENGINES: { id: EngineId; label: string; note: string }[] = [
  { id: "gradium", label: "Gradium realtime", note: "WebSocket STT with semantic VAD · spends credits" },
  { id: "browser", label: "Browser speech", note: "Free test engine built into Chrome, Edge and Safari" },
  { id: "simulated", label: "Simulated", note: "Offline: captions follow your voice activity" },
];

const noopSubscribe = () => () => {};

/** Shifts words onto the saved media's timeline and keeps them inside it. */
function cleanWords(words: Word[], offset: number, duration: number): Word[] {
  return words
    .map((w) => ({ ...w, start: w.start + offset, end: w.end + offset }))
    .filter((w) => w.start < duration)
    .map((w) => ({ ...w, start: round(Math.max(0, w.start)), end: round(Math.min(duration, Math.max(w.end, w.start + 0.08))) }));
}

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
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<CameraRecorder | null>(null);
  /** Seconds between the start of the camera recording and the start of audio capture. */
  const offsetRef = useRef(0);
  const recordingRef = useRef<Blob | null>(null);

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
  const canUseCamera = useSyncExternalStore(noopSubscribe, cameraSupported, () => true);
  const [pickedMode, setMode] = useState<InputMode>("camera");
  const mode: InputMode = canUseCamera ? pickedMode : "mic";
  const camera = mode === "camera";
  const [camSize, setCamSize] = useState<{ width: number; height: number } | null>(null);
  const [cameraError, setCameraError] = useState("");
  const [cameraAttempt, setCameraAttempt] = useState(0);

  useEffect(
    () => () => {
      void captionerRef.current?.stop();
      void recorderRef.current?.stop();
    },
    [],
  );

  useEffect(() => {
    if (!camera) return;
    let cancelled = false;
    let stream: MediaStream | null = null;
    const video = videoRef.current;
    openCamera()
      .then((opened) => {
        if (cancelled) return stopStream(opened);
        stream = opened;
        cameraRef.current = opened;
        if (!video) return;
        const measure = () => video.videoWidth && setCamSize({ width: video.videoWidth, height: video.videoHeight });
        video.onloadedmetadata = measure;
        video.onresize = measure;
        video.srcObject = opened;
        void video.play().catch(() => undefined);
      })
      .catch((err: unknown) => !cancelled && setCameraError(err instanceof Error ? err.message : "Could not open the camera."));
    return () => {
      cancelled = true;
      stopStream(stream);
      cameraRef.current = null;
      if (video) video.srcObject = null;
    };
  }, [camera, cameraAttempt]);

  const cameraReady = camera && !!camSize;
  const { width, height } = cameraReady ? previewFrame(camSize) : aspectSize(style.aspect);
  /** Over the camera the style follows the camera's own shape and keeps the chosen position. */
  const liveStyle = useMemo(
    () => (cameraReady ? styleForAspect({ ...style, stage: "video" }, nearestAspect(camSize.width, camSize.height)) : style),
    [cameraReady, camSize, style],
  );
  const fontFamily = useMemo(() => (typeof document === "undefined" ? "sans-serif" : resolveFontFamily(style.fontId)), [style.fontId]);

  const draw = useCallback(
    (ctx: CanvasRenderingContext2D, w: number, h: number) => {
      const t = captionerRef.current && phase === "recording" ? captionerRef.current.elapsed : elapsedRef.current;
      const video = videoRef.current;
      if (camera) {
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, w, h);
        if (video && video.readyState >= 2) {
          ctx.save();
          ctx.translate(w, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(video, 0, 0, w, h);
          ctx.restore();
        }
      } else {
        drawStage(ctx, w, h, { background: liveStyle.stage, time: t });
      }
      const tokens = tokenize(partialRef.current);
      const display: Word[] = [
        ...wordsRef.current,
        ...tokens.map((text, i) => ({ id: `p${i}`, text, start: t - 0.05 * (tokens.length - i), end: t + 0.2 })),
      ];
      if (!display.length) return;
      const lines = layoutLines(display, liveStyle);
      const last = lines[lines.length - 1];
      if (!last || t - last.end > liveStyle.holdAfter) return;
      drawLine(ctx, w, h, last, Infinity, Math.max(t, last.words[last.words.length - 1].start), liveStyle, fontFamily);
    },
    [phase, camera, liveStyle, fontFamily],
  );
  useCanvasLoop(canvasRef, width, height, draw);

  const start = async () => {
    const shared = camera ? cameraRef.current : null;
    if (camera && !shared) {
      setError(cameraError || "The camera isn't ready yet.");
      return;
    }
    setError("");
    setStatus("");
    wordsRef.current = [];
    partialRef.current = "";
    samplesRef.current = null;
    recordingRef.current = null;
    offsetRef.current = 0;
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
      let recordStart = 0;
      if (shared) {
        const recorder = new CameraRecorder();
        recorderRef.current = recorder;
        recordStart = await recorder.start(shared);
      }
      await captioner.start(shared ?? undefined);
      if (shared) offsetRef.current = Math.max(0, (captioner.captureStartedAt - recordStart) / 1000);
      setPhase("recording");
    } catch (err) {
      captionerRef.current = null;
      await recorderRef.current?.stop().catch(() => undefined);
      recorderRef.current = null;
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
    const recorder = recorderRef.current;
    recorderRef.current = null;
    setPhase("stopping");
    const [samples, video] = await Promise.all([captioner.stop(), recorder ? recorder.stop() : null]);
    samplesRef.current = samples;
    recordingRef.current = video;
    elapsedRef.current = samples.length / RATE;
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
    recordingRef.current = null;
    elapsedRef.current = 0;
    setWords([]);
    setElapsed(0);
    setPhase("idle");
  };

  /** Saves the camera take as a video project: the video's own sound becomes the track, so it stays in sync. */
  const saveCamera = async (samples: Float32Array, recording: Blob) => {
    setPhase("saving");
    setError("");
    try {
      setStatus("Preparing the video…");
      const media = await recordingToMp4(recording);
      const offset = offsetRef.current;
      let pcm: { sampleRate: number; samples: Float32Array };
      try {
        pcm = await decodeToMono(media, RATE);
      } catch {
        const padded = new Float32Array(Math.round(offset * RATE) + samples.length);
        padded.set(samples, padded.length - samples.length);
        pcm = { sampleRate: RATE, samples: padded };
      }
      const duration = pcm.samples.length / RATE;
      const info = (await probeVideo(media)) ?? (camSize ? { ...camSize, duration } : { width: 1920, height: 1080, duration });
      const aspect = nearestAspect(info.width, info.height);
      const [mediaKey, audioKey] = await Promise.all([storeBlob(media), storeBlob(wavBlob(pcm))]);
      const words = cleanWords(wordsRef.current, offset, duration);
      const track: Track = {
        id: uid("t"),
        lang,
        kind: "live",
        label: trackLabel(lang, "live"),
        audioKey,
        duration: round(duration),
        words,
        createdAt: Date.now(),
      };
      const project = newProject({ title: title || "Live session", product: "live", sourceLang: lang, aspect, mock: engine !== "gradium" });
      project.style = { ...project.style, ...liveStyle, stage: "video", aspect, holdAfter: 0.6 };
      project.mediaKey = mediaKey;
      project.mediaKind = "video";
      project.mediaName = `${title || "Live session"}.mp4`;
      project.clip = { width: info.width, height: info.height, duration: info.duration || duration, speechStart: words[0]?.start ?? 0 };
      project.tracks = [track];
      project.activeTrackId = track.id;
      await db.saveProject(project);
      router.push(`/studio/${project.id}`);
    } catch (err) {
      setPhase("stopped");
      setStatus("");
      setError(err instanceof Error ? err.message : "Could not save the recording.");
    }
  };

  const save = async () => {
    const samples = samplesRef.current;
    if (!samples) return;
    const recording = recordingRef.current;
    if (recording) return saveCamera(samples, recording);
    const duration = samples.length / RATE;
    const audioKey = await storeBlob(wavBlob({ sampleRate: RATE, samples }));
    const cleaned = cleanWords(wordsRef.current, 0, duration);
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
    const project = newProject({
      title: title || "Live session",
      product: "live",
      sourceLang: lang,
      aspect: style.aspect,
      mock: engine !== "gradium",
    });
    project.style = { ...project.style, ...style, holdAfter: 0.6 };
    project.tracks = [track];
    project.activeTrackId = track.id;
    await db.saveProject(project);
    router.push(`/studio/${project.id}`);
  };

  const switchMode = (next: InputMode) => {
    setCameraError("");
    setCamSize(null);
    setMode(next);
  };

  const recording = phase === "recording";
  const remaining = Math.max(0, LIMITS.liveSeconds - elapsed);
  const transcript = words.map((w) => w.text).join(" ");

  return (
    <div className="container-medium grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <div className="flex flex-col gap-4">
        <div
          className={`relative mx-auto w-full overflow-hidden rounded-2xl border border-white/10 ${!camera && style.stage === "transparent" ? "checker" : "bg-black"}`}
          style={{ aspectRatio: `${width} / ${height}`, maxHeight: "68vh", maxWidth: height > width ? "420px" : undefined }}
        >
          <canvas ref={canvasRef} className="h-full w-full" />
          <video ref={videoRef} muted playsInline className="pointer-events-none absolute h-px w-px opacity-0" aria-hidden />
          <div className="absolute top-3 left-3 flex items-center gap-2 rounded-full bg-black/55 px-3 py-1.5 backdrop-blur">
            <span className={`h-2 w-2 rounded-full ${recording ? "rec-pulse bg-red" : "bg-lightgray"}`} />
            <span className="font-code text-xs text-white">{recording ? "REC" : phase === "stopped" ? "DONE" : "READY"}</span>
            <span className={`font-code text-xs ${recording && remaining <= 10 ? "text-orange" : "text-lightgray"}`}>
              {formatTime(elapsed)} / {formatTime(LIMITS.liveSeconds)}
            </span>
          </div>
          {camera && !cameraReady ? (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 px-6 text-center">
              {cameraError ? (
                <>
                  <p className="font-plex text-sm text-bright">{cameraError}</p>
                  <div className="flex gap-2">
                    <Button size="sm" tone="secondary" onClick={() => {
                        setCameraError("");
                        setCameraAttempt((n) => n + 1);
                      }}>
                      Try again
                    </Button>
                    <Button size="sm" tone="ghost" onClick={() => switchMode("mic")}>
                      <Mic size={13} /> Use mic only
                    </Button>
                  </div>
                </>
              ) : (
                <p className="font-plex text-sm text-lightgray">Turning on the camera…</p>
              )}
            </div>
          ) : !camera && phase === "idle" && !words.length ? (
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
          ) : phase === "stopped" || phase === "saving" ? (
            <>
              <Button size="lg" onClick={save} disabled={phase === "saving"}>
                {phase === "saving" ? "Preparing video…" : "Open in studio"} {phase === "saving" ? null : <ArrowRight size={15} />}
              </Button>
              <Button size="lg" tone="secondary" onClick={start} disabled={phase === "saving"}>
                <Mic size={15} /> Record again
              </Button>
              <Button size="lg" tone="ghost" onClick={discard} disabled={phase === "saving"}>
                <Trash size={14} /> Discard
              </Button>
            </>
          ) : (
            <Button size="lg" onClick={start} disabled={phase === "starting" || (camera && !cameraReady)}>
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
          {canUseCamera ? (
            <div>
              <Label>Record</Label>
              <Segmented<InputMode>
                value={mode}
                onChange={switchMode}
                disabled={phase !== "idle" && phase !== "stopped"}
                options={[
                  {
                    value: "camera",
                    label: (
                      <span className="flex items-center gap-1.5">
                        <Film size={12} /> Camera + mic
                      </span>
                    ),
                  },
                  {
                    value: "mic",
                    label: (
                      <span className="flex items-center gap-1.5">
                        <Mic size={12} /> Mic only
                      </span>
                    ),
                  },
                ]}
              />
              <p className="mt-2 font-plex text-xs leading-snug text-lightgray">
                {camera
                  ? "Records your webcam at its best quality with captions on top. The preview is mirrored; the video isn't."
                  : "Captions only, on a stage you can use as a stream overlay."}
              </p>
            </div>
          ) : null}
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
                <Chip
                  key={p.id}
                  active={style.preset === p.id}
                  onClick={() => setStyle((s) => ({ ...applyPreset(s, p.id), holdAfter: 2.5, position: s.position }))}
                >
                  {p.label}
                </Chip>
              ))}
            </div>
          </div>
          <div>
            <Label>Caption position</Label>
            <Segmented<CaptionPosition>
              value={style.position}
              onChange={(position) => setStyle((s) => ({ ...s, position }))}
              options={[
                { value: "top", label: "Top" },
                { value: "middle", label: "Middle" },
                { value: "bottom", label: "Bottom" },
              ]}
            />
            {camera ? (
              <p className="mt-2 font-plex text-xs text-lightgray">Bottom keeps your face clear. You can change it later in the studio.</p>
            ) : null}
          </div>
          {camera ? null : (
            <>
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
            </>
          )}
        </Panel>
      </aside>
    </div>
  );
}
