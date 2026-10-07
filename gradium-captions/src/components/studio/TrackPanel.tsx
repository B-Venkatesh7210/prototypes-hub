"use client";

import { useState, type ReactNode } from "react";
import { api } from "@/lib/client/api";
import { blobToPcm, cloneSample, wavBlob } from "@/lib/client/audio";
import { db } from "@/lib/client/db";
import { fitTrackToClip, regenerateTrack, trackAudio, translateTrack } from "@/lib/client/pipeline";
import { LANGS, langName } from "@/lib/langs";
import { LIMITS, PRICES, wordCount } from "@/lib/limits";
import type { ClipInfo, Lang, Project, Track, VoiceRef } from "@/lib/types";
import { defaultVoice, voicesFor } from "@/lib/voices";
import { formatTime, wordsToText } from "@/lib/words";
import { useStatus } from "@/components/shell/StatusProvider";
import { VoicePicker } from "@/components/flow/VoicePicker";
import { Globe, Mic, Trash, Wand } from "@/components/ui/icons";
import { Button, ErrorNote, Label, Spinner } from "@/components/ui/primitives";

type Update = (fn: (p: Project) => Project, mode?: "edit" | "patch" | "replace") => void;

function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 border-b border-white/[0.06] pb-5 last:border-0 last:pb-0">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="font-komuna text-[0.6875rem] tracking-[0.2em] text-bright/80 uppercase">{title}</h3>
        {hint ? <span className="font-plex text-[0.6875rem] text-lightgray">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

const KIND_COPY: Record<Track["kind"], string> = {
  original: "Your original recording, transcribed with Gradium Speech-to-Text.",
  dub: "Translated from the original audio with Gradium STT translation, then spoken by Gradium Text-to-Speech.",
  tts: "Generated from your script with Gradium Text-to-Speech.",
  live: "Captured live from your microphone.",
};

export function TrackPanel({ project, track, update }: { project: Project; track: Track; update: Update }) {
  const { isMock } = useStatus();
  const [error, setError] = useState("");

  const replaceTrack = (next: Track) =>
    update((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === next.id ? next : t)) }), "replace");

  return (
    <div className="flex flex-col gap-5">
      <Section title="Track">
        <div className="flex flex-col gap-1">
          <p className="font-favorit text-lg text-white">{track.label}</p>
          <p className="font-plex text-xs leading-snug text-lightgray">{KIND_COPY[track.kind]}</p>
        </div>
        <dl className="grid grid-cols-3 gap-2">
          {[
            ["Length", formatTime(track.duration)],
            ["Words", String(track.words.length)],
            ["Voice", track.voice ? track.voice.name : "None"],
          ].map(([k, v]) => (
            <div key={k} className="rounded-lg border border-white/10 px-2.5 py-2">
              <dt className="font-code text-[0.625rem] text-lightgray uppercase">{k}</dt>
              <dd className="truncate font-plex text-sm text-bright">{v}</dd>
            </div>
          ))}
        </dl>
        {track.fit ? (
          <p className={`font-plex text-xs leading-snug ${track.fit.overrun ? "text-[#ffd2bd]" : "text-lightgray"}`}>
            {track.fit.tempo === 1
              ? "Fits the clip at natural speed."
              : `Time-stretched to ${track.fit.tempo}× to fit the clip, pitch kept.`}
            {track.fit.overrun ? ` Still runs ${track.fit.overrun}s past the end. Shorten the script to tighten it.` : ""}
          </p>
        ) : null}
      </Section>

      {error ? <ErrorNote>{error}</ErrorNote> : null}

      {track.script !== undefined ? (
        <ScriptEditor
          key={`${track.id}:${track.audioKey}`}
          track={track}
          clip={project.clip}
          isMock={isMock}
          onDone={replaceTrack}
          onError={setError}
        />
      ) : (
        <CloneFromTrack key={track.id} track={track} onDone={(voice) => update((p) => ({ ...p, tracks: p.tracks.map((t) => (t.id === track.id ? { ...t, voice } : t)) }), "patch")} onError={setError} />
      )}

      <AddLanguage project={project} activeTrack={track} isMock={isMock} update={update} onError={setError} />

      {project.tracks.length > 1 ? (
        <Section title="Remove">
          <Button
            tone="danger"
            size="sm"
            className="self-start"
            onClick={async () => {
              if (!confirm(`Delete the ${track.label} track? This cannot be undone.`)) return;
              await db.deleteBlob(track.audioKey);
              update((p) => {
                const tracks = p.tracks.filter((t) => t.id !== track.id);
                return { ...p, tracks, activeTrackId: tracks[0].id };
              }, "replace");
            }}
          >
            <Trash size={12} /> Delete this track
          </Button>
        </Section>
      ) : null}
    </div>
  );
}

function ScriptEditor({
  track,
  clip,
  isMock,
  onDone,
  onError,
}: {
  track: Track;
  clip?: ClipInfo;
  isMock: boolean;
  onDone: (t: Track) => void;
  onError: (msg: string) => void;
}) {
  const [script, setScript] = useState(track.script ?? wordsToText(track.words));
  const [voice, setVoice] = useState<VoiceRef | null>(track.voice ?? null);
  const [pickVoice, setPickVoice] = useState(false);
  const [busy, setBusy] = useState(false);
  const changed = script.trim() !== (track.script ?? "").trim() || voice?.id !== track.voice?.id;
  const words = wordCount(script);
  const over = words > LIMITS.scriptWords || script.trim().length > LIMITS.scriptChars;

  const regenerate = async () => {
    if (!voice) return;
    setBusy(true);
    onError("");
    try {
      onDone(await regenerateTrack({ ...track, voice }, script.trim(), clip));
    } catch (err) {
      onError(err instanceof Error ? err.message : "Could not regenerate the track");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Section title="Script and voice" hint={isMock ? "mock voice" : `~${script.trim().length * PRICES.ttsPerChar} credits`}>
      <textarea
        className="field min-h-36 resize-y text-sm leading-relaxed"
        maxLength={LIMITS.scriptChars + 200}
        value={script}
        onChange={(e) => setScript(e.target.value)}
      />
      <p className={`-mt-1 text-right font-code text-[0.6875rem] ${over ? "text-orange" : "text-lightgray"}`}>
        {words}/{LIMITS.scriptWords} words · {script.trim().length}/{LIMITS.scriptChars} chars
      </p>
      <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2">
        <div className="min-w-0">
          <p className="font-code text-[0.625rem] text-lightgray uppercase">Voice · {voice?.kind ?? "none"}</p>
          <p className="truncate font-plex text-sm text-bright">{voice?.name ?? "Pick a voice"}</p>
        </div>
        <Button size="sm" tone="ghost" onClick={() => setPickVoice((v) => !v)}>
          {pickVoice ? "Done" : "Change"}
        </Button>
      </div>
      {pickVoice ? <VoicePicker lang={track.lang} value={voice} onChange={setVoice} /> : null}
      <Button onClick={regenerate} disabled={busy || !voice || !script.trim() || !changed || over}>
        {busy ? <Spinner /> : <Wand size={14} />} Regenerate audio and timings
      </Button>
      <p className="font-plex text-xs leading-snug text-lightgray">
        For small fixes, edit words in the transcript and use <span className="text-bright">Re-voice</span> on that line instead. It only
        re-speaks the changed line.
      </p>
    </Section>
  );
}

function CloneFromTrack({ track, onDone, onError }: { track: Track; onDone: (v: VoiceRef) => void; onError: (msg: string) => void }) {
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);

  const clone = async () => {
    setBusy(true);
    onError("");
    try {
      const pcm = await blobToPcm(await trackAudio(track));
      if (pcm.samples.length / pcm.sampleRate < 5) throw new Error("This recording is too short to clone. Use at least 5 seconds of speech.");
      const name = `${track.label} voice`;
      const res = await api.clone(wavBlob(cloneSample(pcm, LIMITS.cloneSampleSeconds)), name, track.lang);
      onDone({ id: res.voiceId, name, kind: "clone", lang: track.lang });
    } catch (err) {
      onError(err instanceof Error ? err.message : "Cloning failed");
    } finally {
      setBusy(false);
    }
  };

  if (track.voice) {
    return (
      <Section title="Voice">
        <p className="font-plex text-sm leading-snug text-bright/90">
          Lines you edit can be re-voiced with <span className="text-white">{track.voice.name}</span>. The new take is spliced into the
          recording and the timings after it shift to match.
        </p>
      </Section>
    );
  }

  return (
    <Section title="Fix lines in your voice">
      <p className="font-plex text-sm leading-snug text-lightgray">
        Clone the voice in this recording so edited lines can be re-spoken without recording them again. This uses the loudest{" "}
        {LIMITS.cloneSampleSeconds} seconds of the track.
      </p>
      <label className="flex cursor-pointer items-start gap-2.5 font-plex text-xs leading-snug text-lightgray">
        <input type="checkbox" className="mt-0.5 accent-[#f2f2f2]" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
        This is my voice, or I have the speaker&apos;s permission to clone it.
      </label>
      <Button tone="secondary" onClick={clone} disabled={!consent || busy}>
        {busy ? <Spinner /> : <Mic size={14} />} Clone voice from this track
      </Button>
    </Section>
  );
}

function AddLanguage({
  project,
  activeTrack,
  isMock,
  update,
  onError,
}: {
  project: Project;
  activeTrack: Track;
  isMock: boolean;
  update: Update;
  onError: (msg: string) => void;
}) {
  const taken = new Set(project.tracks.filter((t) => t.kind !== "live" && t.kind !== "original").map((t) => t.lang));
  const source = project.tracks.find((t) => t.kind === "original" || t.kind === "live" || t.kind === "tts") ?? activeTrack;
  taken.add(source.lang);
  const options = LANGS.filter((l) => !taken.has(l.code));
  const [target, setTarget] = useState<Lang | "">(options[0]?.code ?? "");
  const cloneVoice = project.voice ?? project.tracks.find((t) => t.voice?.kind === "clone")?.voice;
  const [voiceId, setVoiceId] = useState("");
  const [stage, setStage] = useState<"" | "translate" | "voice">("");

  const lang = target && !taken.has(target) ? target : (options[0]?.code ?? "");
  const languages = new Set(project.tracks.map((t) => t.lang)).size;
  const cap = LIMITS.projectLanguages[project.product];
  if (languages >= cap) {
    return (
      <Section title="Languages" hint={`${languages} of ${cap}`}>
        <p className="font-plex text-sm text-lightgray">
          This demo caps {project.product === "dub" ? "a dub" : "this kind of project"} at {cap} languages to keep credit use low.
        </p>
      </Section>
    );
  }
  if (!lang) {
    return (
      <Section title="Languages">
        <p className="font-plex text-sm text-lightgray">This project already ships in all five languages.</p>
      </Section>
    );
  }

  const flagship = voicesFor(lang);
  const chosen: VoiceRef =
    voiceId === "clone" && cloneVoice
      ? { ...cloneVoice, lang }
      : (() => {
          const v = flagship.find((f) => f.id === voiceId) ?? defaultVoice(lang);
          return { id: v.id, name: v.name, kind: "library", lang };
        })();

  const run = async () => {
    onError("");
    try {
      const spoken = await translateTrack({ source, sourceLang: source.lang, target: lang, voice: chosen, onStage: setStage });
      const track = project.clip ? await fitTrackToClip(spoken, project.clip) : spoken;
      update((p) => ({ ...p, tracks: [...p.tracks, track], activeTrackId: track.id }), "replace");
      setVoiceId("");
    } catch (err) {
      onError(err instanceof Error ? err.message : `Could not add ${langName(lang)}`);
    } finally {
      setStage("");
    }
  };

  const estimate = Math.ceil(source.duration * PRICES.translatePerSecond) + wordsToText(source.words).length * PRICES.ttsPerChar;
  return (
    <Section title="Add a language" hint={isMock ? `mock · ${languages} of ${cap}` : `~${estimate} credits · ${languages} of ${cap}`}>
      <p className="font-plex text-xs leading-snug text-lightgray">
        Translates the {source.label} audio with Gradium STT translation, then voices it with word-level timings
        {project.clip ? " and fits it to the clip" : ""}.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <Label>Language</Label>
          <select className="field" value={lang} onChange={(e) => setTarget(e.target.value as Lang)}>
            {options.map((l) => (
              <option key={l.code} value={l.code}>
                {l.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <Label>Voice</Label>
          <select className="field" value={voiceId} onChange={(e) => setVoiceId(e.target.value)}>
            <option value="">{defaultVoice(lang).name} (default)</option>
            {cloneVoice ? <option value="clone">{cloneVoice.name} (cloned)</option> : null}
            {flagship.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · {v.region}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button tone="secondary" onClick={run} disabled={stage !== ""}>
        {stage ? <Spinner /> : <Globe size={14} />}
        {stage === "translate" ? "Translating…" : stage === "voice" ? "Voicing…" : `Add ${langName(lang)}`}
      </Button>
    </Section>
  );
}
