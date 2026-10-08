"use client";

import { useEffect, useRef, useState } from "react";
import { api, quotaLeft } from "@/lib/client/api";
import { base64WavBlob, cloneSample, decodeToMono, wavBlob } from "@/lib/client/audio";
import { langName } from "@/lib/langs";
import { LIMITS, PRICES } from "@/lib/limits";
import { hasPreview, PREVIEW_TEXT, previewUrl } from "@/lib/previews";
import type { Lang, SavedVoice, VoiceRef } from "@/lib/types";
import { voicesFor } from "@/lib/voices";
import { useStatus } from "@/components/shell/StatusProvider";
import { Pause, Play, Sparkle, Upload } from "@/components/ui/icons";
import { Button, Chip, ErrorNote, Label, Segmented, Spinner } from "@/components/ui/primitives";
import { SampleRecorder } from "./SampleRecorder";
import { useSavedVoices, type SavedVoices } from "./useSavedVoices";

/** Design candidates heard this session, so keeping one can store its preview for free. */
const candidateAudio = new Map<string, string>();

/** Plays one voice preview at a time. `load` returns the audio URL, synthesizing it if needed. */
export function useVoicePreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => () => audioRef.current?.pause(), []);

  const toggle = async (key: string, load: () => string | Promise<string>) => {
    if (playing === key) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    let url: string;
    setLoading(key);
    try {
      url = await load();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Preview failed");
      return;
    } finally {
      setLoading(null);
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    audio.onerror = () => setPlaying(null);
    setPlaying(key);
    void audio.play().catch(() => setPlaying(null));
  };

  return { toggle, playing, loading };
}

type Preview = ReturnType<typeof useVoicePreview>;

function PreviewButton({
  id,
  preview,
  load,
  title,
  disabled = false,
}: {
  id: string;
  preview: Preview;
  load: () => string | Promise<string>;
  title: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        void preview.toggle(id, load);
      }}
      title={title}
      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/15 text-bright transition-colors hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent"
    >
      {preview.loading === id ? <Spinner className="h-3.5 w-3.5" /> : preview.playing === id ? <Pause size={12} /> : <Play size={12} />}
    </button>
  );
}

function Library({ lang, value, onChange }: { lang: Lang; value: VoiceRef | null; onChange: (v: VoiceRef) => void }) {
  const [gender, setGender] = useState<"all" | "f" | "m">("all");
  const preview = useVoicePreview();
  const voices = voicesFor(lang).filter((v) => gender === "all" || v.gender === gender);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-1.5">
        {(["all", "f", "m"] as const).map((g) => (
          <Chip key={g} active={gender === g} onClick={() => setGender(g)}>
            {g === "all" ? "All" : g === "f" ? "Feminine" : "Masculine"}
          </Chip>
        ))}
      </div>
      <div className="grid max-h-80 gap-2 overflow-y-auto pr-1 scroll-thin sm:grid-cols-2">
        {voices.map((v) => {
          const selected = value?.id === v.id;
          const stored = hasPreview(v.id);
          return (
            <div
              key={v.id}
              role="button"
              tabIndex={0}
              onClick={() => onChange({ id: v.id, name: v.name, kind: "library", lang })}
              onKeyDown={(e) => e.key === "Enter" && onChange({ id: v.id, name: v.name, kind: "library", lang })}
              className={`flex cursor-pointer items-start gap-3 rounded-lg border p-3 text-left transition-colors ${
                selected ? "border-bright/50 bg-white/[0.07]" : "border-white/10 hover:border-white/25"
              }`}
            >
              <PreviewButton
                id={v.id}
                preview={preview}
                load={() => previewUrl(v.id)}
                disabled={!stored}
                title={stored ? "Preview (free)" : "No stored preview yet. Run npm run previews."}
              />
              <div className="min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-favorit text-sm text-white">{v.name}</span>
                  <span className="font-code text-[0.625rem] text-lightgray">{v.region}</span>
                </div>
                <p className="mt-1 line-clamp-2 font-plex text-xs leading-snug text-lightgray">{v.description}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function YourVoices({
  lang,
  value,
  onChange,
  saved,
}: {
  lang: Lang;
  value: VoiceRef | null;
  onChange: (v: VoiceRef) => void;
  saved: SavedVoices;
}) {
  const { isMock } = useStatus();
  const preview = useVoicePreview();
  const [storing, setStoring] = useState<string | null>(null);
  const [error, setError] = useState("");
  const { voices } = saved;

  const storePreview = async (voice: SavedVoice) => {
    setStoring(voice.id);
    setError("");
    try {
      await api.storeVoiceSample(voice.id);
      await saved.reload();
      void preview.toggle(voice.id, () => api.voiceSampleUrl(voice.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not store a preview");
    } finally {
      setStoring(null);
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <Label hint={`${saved.clones.length} of ${LIMITS.clonesPerAccount} clones used`}>Your voices</Label>
      {!voices ? (
        <div className="flex items-center gap-2 font-plex text-xs text-lightgray">
          <Spinner className="h-3.5 w-3.5" /> Loading your voices…
        </div>
      ) : !voices.length ? (
        <p className="font-plex text-xs text-lightgray">
          None yet. Voices you clone or keep from Voice Design are saved here for every project.
        </p>
      ) : (
        <div className="flex max-h-44 flex-col gap-1.5 overflow-y-auto pr-1 scroll-thin">
          {voices.map((v) => {
            const selected = value?.id === v.id;
            const pick = () => onChange({ id: v.id, name: v.name, kind: v.kind, lang });
            const otherLang = v.lang && v.lang !== lang;
            return (
              <div
                key={v.id}
                role="button"
                tabIndex={0}
                onClick={pick}
                onKeyDown={(e) => e.key === "Enter" && pick()}
                title={otherLang ? `Made in ${langName(v.lang!)}. It works best in that language.` : undefined}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-left transition-colors ${
                  selected ? "border-bright/50 bg-white/[0.07]" : "border-white/10 hover:border-white/25"
                }`}
              >
                {v.hasSample ? (
                  <PreviewButton
                    id={v.id}
                    preview={preview}
                    load={() => api.voiceSampleUrl(v.id)}
                    title="Preview in this voice (free)"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      void storePreview(v);
                    }}
                    disabled={storing !== null}
                    title={
                      isMock
                        ? "Store a preview (mock, free)"
                        : `Store a preview: ~${PREVIEW_TEXT[v.lang ?? "en"].length * PRICES.ttsPerChar} credits once, free after`
                    }
                    className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-dashed border-white/25 text-lightgray transition-colors hover:border-white/50 hover:text-bright disabled:cursor-wait"
                  >
                    {storing === v.id ? <Spinner className="h-3.5 w-3.5" /> : <Play size={12} />}
                  </button>
                )}
                <span className="min-w-0 flex-1 truncate font-favorit text-sm text-white">{v.name}</span>
                <span className="font-code text-[0.625rem] text-lightgray uppercase">
                  {v.kind === "clone" ? "cloned" : "designed"}
                  {v.lang ? ` · ${v.lang}` : ""}
                </span>
                {selected ? <span className="font-code text-[0.625rem] text-bright uppercase">Selected</span> : null}
              </div>
            );
          })}
        </div>
      )}
      {voices?.some((v) => !v.hasSample) ? (
        <p className="font-plex text-[0.6875rem] leading-snug text-lightgray">
          Dashed play button: no stored preview yet. Press it once to store one.
        </p>
      ) : null}
      {error || saved.error ? <ErrorNote>{error || saved.error}</ErrorNote> : null}
    </div>
  );
}

function Design({ lang, value, onCreated }: { lang: Lang; value: VoiceRef | null; onCreated: (v: VoiceRef) => void }) {
  const { isMock } = useStatus();
  const [prompt, setPrompt] = useState("A warm, confident narrator in their thirties, clear diction, relaxed pace, smiling delivery.");
  const [name, setName] = useState("Designed voice");
  const [candidates, setCandidates] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [keeping, setKeeping] = useState<string | null>(null);
  const [kept, setKept] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const preview = useVoicePreview();

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const res = await api.design(prompt, lang, LIMITS.designCandidates);
      setCandidates(res.candidates.filter((c) => c.ready).map((c) => c.id));
      if (!res.candidates.some((c) => c.ready)) setError("Gradium is still generating these voices. Try again in a moment.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Voice design failed");
    } finally {
      setBusy(false);
    }
  };

  const hear = async (id: string) => {
    const cached = candidateAudio.get(id);
    if (cached) return cached;
    const res = await api.synthesize(PREVIEW_TEXT[lang], id);
    const url = URL.createObjectURL(base64WavBlob(res.audio));
    candidateAudio.set(id, url);
    return url;
  };

  const keep = async (id: string) => {
    const voiceName = name.trim() || "Designed voice";
    setKeeping(id);
    setError("");
    try {
      const res = await api.keepDesign(id, voiceName, lang);
      const heard = candidateAudio.get(id);
      if (heard) await api.storeVoiceSample(res.voiceId, await (await fetch(heard)).blob()).catch(() => undefined);
      setKept((k) => ({ ...k, [id]: res.voiceId }));
      onCreated({ id: res.voiceId, name: voiceName, kind: "design", lang });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not keep that voice");
    } finally {
      setKeeping(null);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <div>
        <Label hint={`${prompt.length}/500`}>Describe the voice</Label>
        <textarea className="field min-h-24 resize-y" maxLength={500} value={prompt} onChange={(e) => setPrompt(e.target.value)} />
      </div>
      <Button tone="secondary" onClick={generate} disabled={busy || !prompt.trim()}>
        {busy ? <Spinner /> : <Sparkle size={14} />} Generate {LIMITS.designCandidates} candidates
      </Button>
      <p className="-mt-1 font-plex text-xs text-lightgray">
        Demo limit: {LIMITS.designsPerDay} designs per day
        {isMock ? " (not counted in mock mode)" : ` · ${quotaLeft.designs()} left today`}.
      </p>
      {candidates.length ? (
        <>
          <div>
            <Label hint="Listed under Clone my voice">Name the voice you keep</Label>
            <input className="field" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-2">
            {candidates.map((id, i) => {
              const savedId = kept[id];
              const selected = !!savedId && value?.id === savedId;
              return (
                <div
                  key={id}
                  className={`flex items-center gap-3 rounded-lg border p-2.5 ${selected ? "border-bright/50 bg-white/[0.07]" : "border-white/10"}`}
                >
                  <PreviewButton
                    id={id}
                    preview={preview}
                    load={() => hear(id)}
                    title={isMock ? "Preview (mock voice)" : `Preview (~${PREVIEW_TEXT[lang].length} credits, once per session)`}
                  />
                  <span className="flex-1 font-plex text-sm text-bright">Candidate {i + 1}</span>
                  <Button
                    size="sm"
                    tone={savedId ? "primary" : "secondary"}
                    onClick={() => keep(id)}
                    disabled={keeping !== null || !!savedId}
                  >
                    {keeping === id ? <Spinner className="h-3 w-3" /> : null}
                    {savedId ? "Saved" : "Keep this voice"}
                  </Button>
                </div>
              );
            })}
          </div>
        </>
      ) : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}

function Clone({
  lang,
  value,
  onChange,
  saved,
  onCreated,
}: {
  lang: Lang;
  value: VoiceRef | null;
  onChange: (v: VoiceRef) => void;
  saved: SavedVoices;
  onCreated: (v: VoiceRef) => void;
}) {
  const [sample, setSample] = useState<Blob | null>(null);
  const [name, setName] = useState("My voice");
  const [round, setRound] = useState(0);
  const [stage, setStage] = useState<"clone" | "preview" | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const full = saved.clonesFull;

  const clone = async () => {
    if (!sample) return;
    const voiceName = name.trim() || "My voice";
    setBusy(true);
    setError("");
    try {
      const pcm = await decodeToMono(sample);
      if (pcm.samples.length / pcm.sampleRate < 5) throw new Error("The sample is too short. Gradium recommends at least 10 seconds.");
      setStage("clone");
      const res = await api.clone(wavBlob(cloneSample(pcm, LIMITS.cloneSampleSeconds)), voiceName, lang);
      setStage("preview");
      await api
        .storeVoiceSample(res.voiceId)
        .catch(() => setError("The voice was cloned, but its preview failed. Press its play button to try again."));
      setSample(null);
      setConsent(false);
      setName("My voice");
      setRound((r) => r + 1);
      if (fileRef.current) fileRef.current.value = "";
      onCreated({ id: res.voiceId, name: voiceName, kind: "clone", lang });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cloning failed");
      void saved.reload();
    } finally {
      setBusy(false);
      setStage(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <YourVoices lang={lang} value={value} onChange={onChange} saved={saved} />
      <div className="flex flex-col gap-3 border-t border-white/[0.06] pt-4">
        <Label>Clone a new voice</Label>
        {full ? (
          <p className="font-plex text-xs leading-snug text-lightgray">
            This account has used all {LIMITS.clonesPerAccount} cloned voices in the demo. Pick one of your voices above.
          </p>
        ) : (
          <>
            <SampleRecorder key={round} onRecorded={setSample} />
            <div className="flex items-center gap-3">
              <span className="font-plex text-xs text-lightgray">or</span>
              <Button size="sm" tone="ghost" onClick={() => fileRef.current?.click()}>
                <Upload size={13} /> Upload a sample
              </Button>
              <input
                ref={fileRef}
                type="file"
                accept="audio/*,video/*"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && setSample(e.target.files[0])}
              />
              {sample ? <span className="font-code text-xs text-green">sample ready</span> : null}
            </div>
            <div>
              <Label hint="Saved to Your voices">Voice name</Label>
              <input className="field" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <label className="flex cursor-pointer items-start gap-2.5 font-plex text-xs leading-snug text-lightgray">
              <input type="checkbox" className="mt-0.5 accent-[#f2f2f2]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
              This is my voice, or I have the speaker&apos;s permission to clone it.
            </label>
            <p className="font-plex text-xs text-lightgray">
              Uses the loudest {LIMITS.cloneSampleSeconds} seconds. The new voice then speaks one preview line (~
              {PREVIEW_TEXT[lang].length * PRICES.ttsPerChar} credits, once) so you can hear the clone. Clones can&apos;t be deleted, so pick a
              clean sample.
            </p>
            <Button onClick={clone} disabled={!sample || !consent || busy || !saved.voices}>
              {busy ? <Spinner /> : null}
              {stage === "clone" ? "Cloning…" : stage === "preview" ? "Speaking a preview in the new voice…" : "Clone voice"}
            </Button>
            {error ? <ErrorNote>{error}</ErrorNote> : null}
          </>
        )}
      </div>
    </div>
  );
}

type Tab = "library" | "design" | "clone";

export function VoicePicker({ lang, value, onChange }: { lang: Lang; value: VoiceRef | null; onChange: (v: VoiceRef) => void }) {
  const [tab, setTab] = useState<Tab>(!value || value.kind === "library" ? "library" : "clone");
  const saved = useSavedVoices();

  const created = (voice: VoiceRef) => {
    onChange(voice);
    void saved.reload();
  };

  return (
    <div className="flex flex-col gap-4">
      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "library", label: "Flagship voices" },
          { value: "design", label: "Design a voice" },
          { value: "clone", label: "Clone my voice" },
        ]}
      />
      {tab === "library" ? <Library lang={lang} value={value} onChange={onChange} /> : null}
      {tab === "design" ? <Design lang={lang} value={value} onCreated={created} /> : null}
      {tab === "clone" ? <Clone lang={lang} value={value} onChange={onChange} saved={saved} onCreated={created} /> : null}
    </div>
  );
}
