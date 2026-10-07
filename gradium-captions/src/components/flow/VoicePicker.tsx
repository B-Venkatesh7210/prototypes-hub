"use client";

import { useEffect, useRef, useState } from "react";
import { api, quotaLeft } from "@/lib/client/api";
import { base64WavBlob, cloneSample, decodeToMono, wavBlob } from "@/lib/client/audio";
import { LIMITS } from "@/lib/limits";
import type { Lang, VoiceRef } from "@/lib/types";
import { voicesFor } from "@/lib/voices";
import { useStatus } from "@/components/shell/StatusProvider";
import { Pause, Play, Sparkle, Upload } from "@/components/ui/icons";
import { Button, Chip, ErrorNote, Label, Segmented, Spinner } from "@/components/ui/primitives";
import { SampleRecorder } from "./SampleRecorder";

const SAMPLES: Record<Lang, string> = {
  en: "Hi! This is how your captions will sound, word for word.",
  fr: "Bonjour ! Voici comment vos sous-titres vont sonner, mot à mot.",
  de: "Hallo! So klingen deine Untertitel, Wort für Wort.",
  es: "¡Hola! Así sonarán tus subtítulos, palabra por palabra.",
  pt: "Olá! É assim que as suas legendas vão soar, palavra a palavra.",
};

const previewCache = new Map<string, string>();

export function useVoicePreview() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const [loading, setLoading] = useState<string | null>(null);

  useEffect(() => () => audioRef.current?.pause(), []);

  const toggle = async (voiceId: string, lang: Lang) => {
    if (playing === voiceId) {
      audioRef.current?.pause();
      setPlaying(null);
      return;
    }
    audioRef.current?.pause();
    let url = previewCache.get(voiceId);
    if (!url) {
      setLoading(voiceId);
      try {
        const res = await api.synthesize(SAMPLES[lang], voiceId);
        url = URL.createObjectURL(base64WavBlob(res.audio));
        previewCache.set(voiceId, url);
      } catch (err) {
        alert(err instanceof Error ? err.message : "Preview failed");
        return;
      } finally {
        setLoading(null);
      }
    }
    const audio = new Audio(url);
    audioRef.current = audio;
    audio.onended = () => setPlaying(null);
    setPlaying(voiceId);
    void audio.play();
  };

  return { toggle, playing, loading };
}

function PreviewButton({ id, lang, preview }: { id: string; lang: Lang; preview: ReturnType<typeof useVoicePreview> }) {
  const { isMock } = useStatus();
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void preview.toggle(id, lang);
      }}
      title={isMock ? "Preview (mock voice)" : `Preview (~${SAMPLES[lang].length} credits)`}
      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/15 text-bright transition-colors hover:bg-white/10"
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
              <PreviewButton id={v.id} lang={lang} preview={preview} />
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

function Design({ lang, value, onChange }: { lang: Lang; value: VoiceRef | null; onChange: (v: VoiceRef) => void }) {
  const { isMock } = useStatus();
  const [prompt, setPrompt] = useState("A warm, confident narrator in their thirties, clear diction, relaxed pace, smiling delivery.");
  const [candidates, setCandidates] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [keeping, setKeeping] = useState<string | null>(null);
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

  const keep = async (id: string, index: number) => {
    setKeeping(id);
    setError("");
    try {
      const name = `Designed voice ${index + 1}`;
      const res = await api.keepDesign(id, name);
      onChange({ id: res.voiceId, name, kind: "design", lang });
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
        Demo limit: {LIMITS.designsPerDay} designs per day{isMock ? " (not counted in mock mode)" : ` · ${quotaLeft.designs()} left today`}.
      </p>
      {candidates.length ? (
        <div className="flex flex-col gap-2">
          {candidates.map((id, i) => {
            const kept = value?.kind === "design" && value.name === `Designed voice ${i + 1}`;
            return (
              <div key={id} className={`flex items-center gap-3 rounded-lg border p-2.5 ${kept ? "border-bright/50 bg-white/[0.07]" : "border-white/10"}`}>
                <PreviewButton id={id} lang={lang} preview={preview} />
                <span className="flex-1 font-plex text-sm text-bright">Candidate {i + 1}</span>
                <Button size="sm" tone={kept ? "primary" : "secondary"} onClick={() => keep(id, i)} disabled={keeping !== null}>
                  {keeping === id ? <Spinner className="h-3 w-3" /> : null}
                  {kept ? "Selected" : "Use this voice"}
                </Button>
              </div>
            );
          })}
        </div>
      ) : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}

function Clone({ lang, value, onChange }: { lang: Lang; value: VoiceRef | null; onChange: (v: VoiceRef) => void }) {
  const { isMock } = useStatus();
  const [sample, setSample] = useState<Blob | null>(null);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const clone = async () => {
    if (!sample) return;
    setBusy(true);
    setError("");
    try {
      const pcm = await decodeToMono(sample);
      if (pcm.samples.length / pcm.sampleRate < 5) throw new Error("The sample is too short. Gradium recommends at least 10 seconds.");
      const res = await api.clone(wavBlob(cloneSample(pcm, LIMITS.cloneSampleSeconds)), "Your voice", lang);
      onChange({ id: res.voiceId, name: "Your voice", kind: "clone", lang });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Cloning failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3">
      <SampleRecorder onRecorded={setSample} />
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
      <label className="flex cursor-pointer items-start gap-2.5 font-plex text-xs leading-snug text-lightgray">
        <input type="checkbox" className="mt-0.5 accent-[#f2f2f2]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        This is my voice, or I have the speaker&apos;s permission to clone it.
      </label>
      <p className="font-plex text-xs text-lightgray">
        Uses the loudest {LIMITS.cloneSampleSeconds} seconds · {LIMITS.clonesPerDay} clones per day
        {isMock ? " (not counted in mock mode)" : ` · ${quotaLeft.clones()} left today`}.
      </p>
      <Button onClick={clone} disabled={!sample || !consent || busy}>
        {busy ? <Spinner /> : null} {value?.kind === "clone" ? "Re-clone voice" : "Clone voice"}
      </Button>
      {value?.kind === "clone" ? <p className="font-plex text-xs text-green">Your voice is cloned and selected.</p> : null}
      {error ? <ErrorNote>{error}</ErrorNote> : null}
    </div>
  );
}

export function VoicePicker({ lang, value, onChange }: { lang: Lang; value: VoiceRef | null; onChange: (v: VoiceRef) => void }) {
  const [tab, setTab] = useState<"library" | "design" | "clone">(value?.kind ?? "library");
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
      {tab === "design" ? <Design lang={lang} value={value} onChange={onChange} /> : null}
      {tab === "clone" ? <Clone lang={lang} value={value} onChange={onChange} /> : null}
    </div>
  );
}
