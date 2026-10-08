"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "@/lib/client/api";
import { cloneSample, decodeToMono, durationOf, probeMedia, wavBlob, type MediaInfo } from "@/lib/client/audio";
import { db } from "@/lib/client/db";
import { trimVideo, webCodecsSupported } from "@/lib/client/encode";
import { fitTrackToClip, newProject, storeBlob, trackLabel, translateTrack } from "@/lib/client/pipeline";
import { LANG_ACCENT, langName } from "@/lib/langs";
import { LIMITS, PRICES } from "@/lib/limits";
import type { Lang, Project, Track, VoiceRef } from "@/lib/types";
import { catalogVoice, defaultVoice, voicesFor } from "@/lib/voices";
import { formatTime, uid, withIds } from "@/lib/words";
import { useStatus } from "@/components/shell/StatusProvider";
import { LangToggles } from "@/components/flow/LangPicker";
import { useSavedVoices } from "@/components/flow/useSavedVoices";
import { patchStep, StepList, type Step } from "@/components/flow/StepList";
import { ArrowRight, Film, Upload, X } from "@/components/ui/icons";
import { Button, ErrorNote, Label, Panel, Segmented, Spinner } from "@/components/ui/primitives";

const SOURCE: Lang = "en";
const DEFAULT_BED = 0.15;

function estimateCredits(seconds: number, targets: number) {
  const chars = Math.round(seconds * 16);
  return Math.ceil(seconds * PRICES.sttPerSecond) + targets * (Math.ceil(seconds * PRICES.translatePerSecond) + chars * PRICES.ttsPerChar);
}

type Clip = { file: Blob; name: string; url: string; info: MediaInfo };

export function DubFlow() {
  const router = useRouter();
  const { isMock } = useStatus();
  const fileRef = useRef<HTMLInputElement>(null);
  const [clip, setClip] = useState<Clip | null>(null);
  const [trimStart, setTrimStart] = useState(0);
  const [trimming, setTrimming] = useState(false);
  const [title, setTitle] = useState("");
  const [keywords, setKeywords] = useState("Gradium");
  const [targets, setTargets] = useState<Lang[]>(["fr", "de", "es", "pt"]);
  const [voiceMode, setVoiceMode] = useState<"clone" | "flagship">("clone");
  const [consent, setConsent] = useState(false);
  const [cloneSource, setCloneSource] = useState<string>("new");
  const saved = useSavedVoices();
  const [voiceChoice, setVoiceChoice] = useState<Partial<Record<Lang, string>>>({});
  const [bed, setBed] = useState(DEFAULT_BED);
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);

  useEffect(() => () => void (clip && URL.revokeObjectURL(clip.url)), [clip]);

  const activeTargets = useMemo(() => targets.filter((t) => t !== SOURCE).slice(0, LIMITS.dubTargets), [targets]);
  const tooLong = !!clip && clip.info.duration > LIMITS.dubSeconds + 0.05;
  const clone = voiceMode === "clone";
  const savedPick = saved.voices?.find((v) => v.id === cloneSource) ?? (saved.clonesFull ? saved.clones[0] : undefined);
  const newClone = clone && !savedPick;

  const load = async (file: Blob, name: string) => {
    const info = await probeMedia(file);
    if (info.kind !== "video") throw new Error("Pick a video file. This product dubs a clip of someone speaking.");
    if (info.duration < 1) throw new Error("That clip is shorter than a second.");
    setClip({ file, name, url: URL.createObjectURL(file), info });
    setTrimStart(0);
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setError("");
    setSteps(null);
    if (!f.type.startsWith("video/")) {
      setError("Pick a video file (MP4, MOV or WebM).");
      return;
    }
    try {
      await load(f, f.name);
      setTitle(f.name.replace(/\.[^.]+$/, ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not read that video.");
    }
  };

  const trim = async () => {
    if (!clip) return;
    setTrimming(true);
    setError("");
    try {
      const end = Math.min(clip.info.duration, trimStart + LIMITS.dubSeconds);
      const cut = await trimVideo(clip.file, trimStart, end);
      await load(cut, clip.name);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Trimming failed.");
    } finally {
      setTrimming(false);
    }
  };

  const running = steps !== null && !error;
  const canRun = !!clip && !tooLong && activeTargets.length > 0 && (!newClone || consent) && (!newClone || !!saved.voices) && !running;

  const run = async () => {
    if (!clip || tooLong) return;
    setError("");
    const plan: Step[] = [
      { id: "decode", label: "Reading the clip", state: "pending" },
      { id: "stt", label: "Transcribing English", api: "Speech-to-Text", state: "pending" },
      ...(newClone ? [{ id: "clone", label: "Cloning the speaker's voice", api: "Instant Voice Clone", state: "pending" as const }] : []),
      ...activeTargets.map((t) => ({
        id: `t-${t}`,
        label: `Dubbing into ${langName(t)}`,
        api: "STT translation → Text-to-Speech",
        state: "pending" as const,
      })),
    ];
    setSteps(plan);
    const set = (id: string, patch: Partial<Step>) => setSteps((s) => (s ? patchStep(s, id, patch) : s));

    try {
      set("decode", { state: "active", detail: "Decoding the audio in your browser" });
      const pcm = await decodeToMono(clip.file);
      const seconds = durationOf(pcm);
      if (seconds > LIMITS.dubSeconds + 0.25) throw new Error(`The clip is ${seconds.toFixed(1)}s. Trim it to ${LIMITS.dubSeconds}s first.`);
      const wav = wavBlob(pcm);
      const [mediaKey, audioKey] = await Promise.all([storeBlob(clip.file), storeBlob(wav)]);
      set("decode", {
        state: "done",
        detail: `${seconds.toFixed(1)}s · ${clip.info.width}×${clip.info.height}`,
      });

      set("stt", { state: "active", detail: keywords.trim() ? `Boosting: ${keywords}` : "No keyword boosting" });
      const stt = await api.transcribe(wav, SOURCE, keywords);
      if (!stt.words.length) throw new Error("No speech was detected in this clip.");
      set("stt", { state: "done", detail: `${stt.words.length} words with timestamps${stt.mock ? " · mock transcript" : ""}` });

      let cloneRef: VoiceRef | undefined;
      if (clone && savedPick) {
        cloneRef = { id: savedPick.id, name: savedPick.name, kind: savedPick.kind, lang: SOURCE };
      } else if (clone) {
        set("clone", { state: "active", detail: `Using up to ${LIMITS.cloneSampleSeconds}s of the speaker` });
        const res = await api.clone(wavBlob(cloneSample(pcm, LIMITS.cloneSampleSeconds)), `${title || "Speaker"} voice`, SOURCE);
        cloneRef = { id: res.voiceId, name: `${title || "Speaker"} voice`, kind: "clone", lang: SOURCE };
        set("clone", { state: "done", detail: res.mock ? "Mock clone matched to the speaker's pitch" : `Voice ${res.voiceId} · saved to Your voices` });
        void saved.reload();
      }
      const speakerVoice = newClone ? cloneRef : undefined;

      const info = clip.info;
      const vertical = (info.height ?? 0) > (info.width ?? 0);
      const clipInfo = {
        width: info.width ?? 1920,
        height: info.height ?? 1080,
        duration: seconds,
        speechStart: stt.words[0]?.start ?? 0,
      };
      const project: Project = {
        ...newProject({ title: title || clip.name, product: "dub", sourceLang: SOURCE, aspect: vertical ? "9:16" : "16:9", mock: stt.mock }),
        mediaKey,
        mediaKind: "video",
        mediaName: clip.name,
        clip: clipInfo,
        bed,
        voice: cloneRef,
      };
      project.style.stage = "video";
      project.style.position = "bottom";
      const original: Track = {
        id: uid("t"),
        lang: SOURCE,
        kind: "original",
        label: trackLabel(SOURCE, "original"),
        audioKey,
        duration: stt.duration,
        words: withIds(stt.words),
        voice: speakerVoice,
        createdAt: Date.now(),
      };
      project.tracks = [original];
      project.activeTrackId = original.id;
      await db.saveProject(project);

      for (const target of activeTargets) {
        const id = `t-${target}`;
        const library = catalogVoice(voiceChoice[target] ?? "") ?? defaultVoice(target);
        const voice: VoiceRef =
          clone && cloneRef ? { ...cloneRef, lang: target } : { id: library.id, name: library.name, kind: "library", lang: target };
        try {
          set(id, { state: "active", detail: "Translating what was said" });
          const spoken = await translateTrack({
            source: original,
            sourceLang: SOURCE,
            target,
            voice,
            onStage: (stage) => stage === "voice" && set(id, { detail: `Speaking it as ${voice.name}` }),
          });
          set(id, { detail: "Fitting the dub to the clip" });
          const track = await fitTrackToClip(spoken, clipInfo);
          project.tracks.push(track);
          if (project.tracks.length === 2) project.activeTrackId = track.id;
          await db.saveProject(project);
          const fit = track.fit;
          set(id, {
            state: "done",
            detail: `${track.words.length} words · ${voice.name}${fit && fit.tempo !== 1 ? ` · ${fit.tempo}× to fit` : ""}${
              fit?.overrun ? ` · runs ${fit.overrun}s long` : ""
            }`,
          });
        } catch (err) {
          set(id, { state: "error", detail: err instanceof Error ? err.message : "Failed" });
        }
      }

      router.push(`/studio/${project.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Something went wrong";
      setError(message);
      setSteps((s) => s?.map((st) => (st.state === "active" ? { ...st, state: "error", detail: message, endedAt: Date.now() } : st)) ?? s);
    }
  };

  const seconds = clip && !tooLong ? clip.info.duration : 0;
  const canTrim = webCodecsSupported();

  return (
    <div className="container-medium grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-6">
        <Panel className="p-5">
          <Label hint={`English · up to ${LIMITS.dubSeconds} seconds`}>1 · Clip</Label>
          {!clip ? (
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                void pick(e.dataTransfer.files?.[0]);
              }}
              className={`flex w-full cursor-pointer flex-col items-center justify-center gap-3 rounded-xl border border-dashed px-6 py-14 text-center transition-colors ${
                dragging ? "border-bright/60 bg-white/[0.05]" : "border-white/15 hover:border-white/30 hover:bg-white/[0.02]"
              }`}
            >
              <span className="flex h-11 w-11 items-center justify-center rounded-full bg-yellow/10 text-yellow">
                <Upload size={18} />
              </span>
              <span className="font-favorit text-lg text-bright">Drop a video of someone speaking English</span>
              <span className="font-plex text-sm text-lightgray">MP4, MOV or WebM · up to {LIMITS.dubSeconds} seconds · any resolution</span>
            </button>
          ) : (
            <div className="flex flex-col gap-3">
              <video src={clip.url} controls playsInline className="max-h-80 w-full rounded-lg bg-black" />
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate font-plex text-sm text-bright">{clip.name}</p>
                  <p className="font-code text-xs text-lightgray">
                    {clip.info.width}×{clip.info.height} · {clip.info.duration.toFixed(1)}s
                  </p>
                </div>
                <Button
                  tone="ghost"
                  size="sm"
                  disabled={running || trimming}
                  onClick={() => {
                    setClip(null);
                    setSteps(null);
                    setError("");
                  }}
                >
                  <X size={13} /> Replace
                </Button>
              </div>
              {tooLong ? (
                <div className="flex flex-col gap-3 rounded-lg border border-orange/30 bg-orange/[0.06] p-3">
                  <p className="font-plex text-sm leading-snug text-[#ffd2bd]">
                    This clip is {clip.info.duration.toFixed(1)}s. The demo dubs up to {LIMITS.dubSeconds} seconds to keep credits low.
                  </p>
                  {canTrim ? (
                    <>
                      <label className="flex flex-col gap-1.5">
                        <span className="flex justify-between font-plex text-xs text-lightgray">
                          Use the {LIMITS.dubSeconds} seconds starting at
                          <span className="font-code text-bright">
                            {formatTime(trimStart)} – {formatTime(Math.min(clip.info.duration, trimStart + LIMITS.dubSeconds))}
                          </span>
                        </span>
                        <input
                          type="range"
                          min={0}
                          max={Math.max(0, clip.info.duration - LIMITS.dubSeconds)}
                          step={0.1}
                          value={trimStart}
                          onChange={(e) => setTrimStart(Number(e.target.value))}
                          className="accent-[#daff52]"
                        />
                      </label>
                      <Button tone="secondary" size="sm" className="self-start" onClick={trim} disabled={trimming}>
                        {trimming ? <Spinner className="h-3 w-3" /> : <Film size={13} />} Trim to {LIMITS.dubSeconds}s
                      </Button>
                    </>
                  ) : (
                    <p className="font-plex text-xs text-lightgray">Trim it to {LIMITS.dubSeconds}s in your editor and upload again.</p>
                  )}
                </div>
              ) : null}
            </div>
          )}
          <input
            ref={fileRef}
            type="file"
            accept="video/*"
            className="hidden"
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </Panel>

        <Panel className="grid gap-5 p-5 sm:grid-cols-2">
          <div>
            <Label>Project name</Label>
            <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Product launch reel" />
          </div>
          <div>
            <Label hint="Comma separated">Names and terms</Label>
            <input className="field" value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="Gradium, Acme Cloud" />
          </div>
        </Panel>

        <Panel className="flex flex-col gap-5 p-5">
          <div>
            <Label hint={`${activeTargets.length} of ${LIMITS.dubTargets}`}>2 · Dub into</Label>
            <LangToggles value={targets} onChange={setTargets} exclude={SOURCE} max={LIMITS.dubTargets} />
          </div>

          <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-5">
            <Label>Voice</Label>
            <Segmented
              value={voiceMode}
              onChange={setVoiceMode}
              options={[
                { value: "clone", label: "The speaker's own voice" },
                { value: "flagship", label: "Native flagship voices" },
              ]}
            />
            {clone ? (
              <>
                {saved.voices?.length ? (
                  <select className="field" value={savedPick?.id ?? "new"} onChange={(e) => setCloneSource(e.target.value)}>
                    <option value="new" disabled={saved.clonesFull}>
                      Clone the speaker from this clip ({saved.clones.length} of {LIMITS.clonesPerAccount} clones used)
                    </option>
                    {saved.voices.map((v) => (
                      <option key={v.id} value={v.id}>
                        Your voices · {v.name} ({v.kind === "clone" ? "cloned" : "designed"})
                      </option>
                    ))}
                  </select>
                ) : null}
                {newClone ? (
                  <>
                    <p className="font-plex text-xs leading-snug text-lightgray">
                      Gradium clones the voice from the clip itself. It works best with 8 seconds or more of clear speech. The clone is
                      saved to Your voices and uses 1 of this account&apos;s {LIMITS.clonesPerAccount} clones, which can&apos;t be deleted.
                    </p>
                    <label className="flex cursor-pointer items-start gap-2.5 font-plex text-xs leading-snug text-lightgray">
                      <input type="checkbox" className="mt-0.5 accent-[#f2f2f2]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                      I am the speaker, or I have their permission to clone their voice. Free-plan clones are for non-commercial use.
                    </label>
                  </>
                ) : (
                  <p className="font-plex text-xs leading-snug text-lightgray">
                    {saved.clonesFull && cloneSource === "new"
                      ? `This account has used all ${LIMITS.clonesPerAccount} clones, so the dub reuses a saved voice. `
                      : ""}
                    Every language is spoken in {savedPick?.name}. No new clone is made.
                  </p>
                )}
              </>
            ) : (
              <div className="flex flex-col gap-2">
                {activeTargets.map((t) => (
                  <div key={t} className="grid grid-cols-[88px_minmax(0,1fr)] items-center gap-3">
                    <span className="font-code text-xs" style={{ color: LANG_ACCENT[t] }}>
                      {langName(t)}
                    </span>
                    <select
                      className="field"
                      value={voiceChoice[t] ?? defaultVoice(t).id}
                      onChange={(e) => setVoiceChoice((v) => ({ ...v, [t]: e.target.value }))}
                    >
                      {voicesFor(t).map((v) => (
                        <option key={v.id} value={v.id}>
                          {v.name} · {v.region} · {v.gender === "f" ? "feminine" : "masculine"}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-2 border-t border-white/[0.06] pt-5">
            <label className="flex flex-col gap-1.5">
              <span className="flex items-baseline justify-between font-komuna text-[0.6875rem] tracking-[0.12em] text-lightgray uppercase">
                Original sound under the dub
                <span className="font-code tracking-normal text-bright normal-case">{Math.round(bed * 100)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={0.5}
                step={0.01}
                value={bed}
                onChange={(e) => setBed(Number(e.target.value))}
                className="accent-[#daff52]"
              />
            </label>
            <p className="font-plex text-xs leading-snug text-lightgray">
              Keeps music and room sound quietly underneath. The original speech is also faintly audible. You can change this later in
              the studio.
            </p>
          </div>
        </Panel>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <Panel className="flex flex-col gap-4 p-5">
          <Label>3 · Dub</Label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="font-code text-[1.5rem] leading-none text-white">{activeTargets.length + 1}</p>
              <p className="mt-1.5 font-plex text-xs text-lightgray">captioned versions</p>
            </div>
            <div>
              <p className="font-code text-[1.5rem] leading-none text-white">
                {seconds ? `~${estimateCredits(seconds, activeTargets.length).toLocaleString()}` : "—"}
              </p>
              <p className="mt-1.5 font-plex text-xs text-lightgray">{isMock ? "credits (simulated, 0 spent)" : "estimated credits"}</p>
            </div>
          </div>
          <Button size="lg" onClick={run} disabled={!canRun}>
            {running ? "Working…" : "Dub this clip"} {running ? null : <ArrowRight size={15} />}
          </Button>
          {newClone && clip && !consent ? <p className="font-plex text-xs text-lightgray">Confirm consent to clone the speaker&apos;s voice.</p> : null}
          {error ? <ErrorNote>{error}</ErrorNote> : null}
        </Panel>
        {steps ? (
          <StepList steps={steps} />
        ) : (
          <Panel className="p-5">
            <p className="font-komuna text-[0.6875rem] tracking-[0.12em] text-lightgray uppercase">What happens</p>
            <ol className="mt-3 flex flex-col gap-3 font-plex text-sm text-bright/85">
              <li>
                <span className="font-code text-xs text-lightgray">STT</span> Every English word gets a start and end time.
              </li>
              <li>
                <span className="font-code text-xs text-lightgray">CLONE</span> The speaker&apos;s voice becomes a Gradium voice.
              </li>
              <li>
                <span className="font-code text-xs text-lightgray">TRANSLATE</span> Gradium listens to the clip and writes it in each language.
              </li>
              <li>
                <span className="font-code text-xs text-lightgray">TTS</span> The voice speaks each translation, with word timings for captions.
              </li>
              <li>
                <span className="font-code text-xs text-lightgray">FIT</span> Each dub is time-stretched to the clip, keeping its pitch.
              </li>
            </ol>
            <p className="mt-4 border-t border-white/[0.06] pt-3 font-plex text-xs leading-snug text-lightgray">
              This is voice dubbing with captions. Lips won&apos;t move in sync with the new language.
            </p>
          </Panel>
        )}
      </aside>
    </div>
  );
}
