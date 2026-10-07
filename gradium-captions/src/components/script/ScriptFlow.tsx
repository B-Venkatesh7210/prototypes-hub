"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { db } from "@/lib/client/db";
import { newProject, synthesizeTrack, translateTrack } from "@/lib/client/pipeline";
import { langName } from "@/lib/langs";
import { LIMITS, PRICES, wordCount } from "@/lib/limits";
import type { Aspect, Lang, VoiceRef } from "@/lib/types";
import { defaultVoice } from "@/lib/voices";
import { formatTime } from "@/lib/words";
import { useStatus } from "@/components/shell/StatusProvider";
import { LangSelect, LangToggles } from "@/components/flow/LangPicker";
import { patchStep, StepList, type Step } from "@/components/flow/StepList";
import { VoicePicker } from "@/components/flow/VoicePicker";
import { ArrowRight } from "@/components/ui/icons";
import { Button, ErrorNote, Label, Panel, Segmented, Toggle } from "@/components/ui/primitives";

const STARTERS: Record<Lang, string> = {
  en: "Meet the fastest way to caption your videos. Type a script, pick a voice, and press generate. Gradium speaks every line and tells us exactly when each word lands, so the captions are finished the moment the audio is. No transcription, no syncing, no waiting.",
  fr: "Voici la façon la plus rapide de sous-titrer vos vidéos. Écrivez un script, choisissez une voix et lancez la génération. Chaque mot arrive avec son minutage exact.",
  de: "So schnell waren Untertitel noch nie. Schreib ein Skript, wähle eine Stimme und starte die Generierung. Jedes Wort kommt mit seinem genauen Zeitstempel.",
  es: "Esta es la forma más rápida de subtitular tus vídeos. Escribe un guion, elige una voz y genera. Cada palabra llega con su marca de tiempo exacta.",
  pt: "Esta é a forma mais rápida de legendar os seus vídeos. Escreva um roteiro, escolha uma voz e gere. Cada palavra chega com a sua marca de tempo exata.",
};

export function ScriptFlow() {
  const router = useRouter();
  const { isMock } = useStatus();
  const [title, setTitle] = useState("Launch teaser");
  const [lang, setLang] = useState<Lang>("en");
  const [script, setScript] = useState(STARTERS.en);
  const [voice, setVoice] = useState<VoiceRef | null>(() => {
    const v = defaultVoice("en");
    return { id: v.id, name: v.name, kind: "library", lang: "en" };
  });
  const [extra, setExtra] = useState<Lang[]>([]);
  const [sameVoice, setSameVoice] = useState(true);
  const [aspect, setAspect] = useState<Aspect>("9:16");
  const [steps, setSteps] = useState<Step[] | null>(null);
  const [error, setError] = useState("");

  const changeLang = (next: Lang) => {
    if (script === STARTERS[lang]) setScript(STARTERS[next]);
    setLang(next);
    setExtra((e) => e.filter((x) => x !== next));
    if (!voice || voice.kind === "library") {
      const v = defaultVoice(next);
      setVoice({ id: v.id, name: v.name, kind: "library", lang: next });
    }
  };

  const ownVoice = voice && voice.kind !== "library";
  const chars = script.trim().length;
  const words = wordCount(script);
  const overWords = words > LIMITS.scriptWords;
  const overChars = chars > LIMITS.scriptChars;
  const credits = chars * PRICES.ttsPerChar * (1 + extra.length) + extra.length * Math.ceil((chars / 15) * PRICES.translatePerSecond);
  const running = steps !== null && !error;

  const run = async () => {
    if (!voice || overWords || overChars) return;
    setError("");
    const plan: Step[] = [
      { id: "tts", label: `Voicing the script as ${voice.name}`, api: "Text-to-Speech", state: "pending" },
      ...extra.map((t) => ({ id: `t-${t}`, label: `Shipping in ${langName(t)}`, api: "STT translation → Text-to-Speech", state: "pending" as const })),
    ];
    setSteps(plan);
    const set = (id: string, patch: Partial<Step>) => setSteps((s) => (s ? patchStep(s, id, patch) : s));
    try {
      set("tts", { state: "active", detail: `${script.length.toLocaleString()} characters` });
      const main = await synthesizeTrack({ text: script.trim(), voice, lang, kind: "tts" });
      set("tts", { state: "done", detail: `${main.words.length} timed words · ${formatTime(main.duration)}` });
      const project = newProject({ title: title || "Untitled script", product: "script", sourceLang: lang, aspect, mock: isMock });
      project.voice = voice;
      project.tracks = [main];
      project.activeTrackId = main.id;
      await db.saveProject(project);

      for (const target of extra) {
        const id = `t-${target}`;
        const library = defaultVoice(target, undefined);
        const targetVoice: VoiceRef =
          sameVoice && ownVoice ? { ...voice, lang: target } : { id: library.id, name: library.name, kind: "library", lang: target };
        try {
          set(id, { state: "active", detail: "Translating" });
          const track = await translateTrack({
            source: main,
            sourceLang: lang,
            target,
            voice: targetVoice,
            onStage: (stage) => stage === "voice" && set(id, { detail: `Speaking it as ${targetVoice.name}` }),
          });
          project.tracks.push(track);
          await db.saveProject(project);
          set(id, { state: "done", detail: `${track.words.length} words · ${targetVoice.name}` });
        } catch (err) {
          set(id, { state: "error", detail: err instanceof Error ? err.message : "Failed" });
        }
      }
      router.push(`/studio/${project.id}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Generation failed";
      setError(message);
      setSteps((s) => s?.map((st) => (st.state === "active" ? { ...st, state: "error", detail: message, endedAt: Date.now() } : st)) ?? s);
    }
  };

  return (
    <div className="container-medium grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex flex-col gap-6">
        <Panel className="flex flex-col gap-5 p-5">
          <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_200px]">
            <div>
              <Label>Project name</Label>
              <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div>
              <Label>Language</Label>
              <LangSelect value={lang} onChange={changeLang} />
            </div>
          </div>
          <div>
            <Label
              hint={
                <span className={overWords || overChars ? "text-orange" : undefined}>
                  {words} / {LIMITS.scriptWords} words · {chars} / {LIMITS.scriptChars} chars
                </span>
              }
            >
              1 · Script
            </Label>
            <textarea
              className={`field min-h-56 resize-y text-[0.9375rem] leading-relaxed ${overWords || overChars ? "border-orange/60!" : ""}`}
              maxLength={LIMITS.scriptChars + 200}
              value={script}
              onChange={(e) => setScript(e.target.value)}
              placeholder="Write what the voice should say…"
            />
            <p className="mt-2 font-plex text-xs text-lightgray">
              {overWords || overChars
                ? `The demo voices up to ${LIMITS.scriptWords} words (${LIMITS.scriptChars} characters) per script, about 40 seconds of speech.`
                : "Punctuation shapes pacing: commas pause briefly, full stops start a new caption line."}
            </p>
          </div>
        </Panel>

        <Panel className="p-5">
          <Label hint={voice ? `Selected: ${voice.name}` : undefined}>2 · Voice</Label>
          <VoicePicker key={lang} lang={lang} value={voice} onChange={setVoice} />
        </Panel>

        <Panel className="flex flex-col gap-5 p-5">
          <div>
            <Label hint={`Optional · up to ${LIMITS.scriptTargets}`}>3 · Also ship in</Label>
            <LangToggles value={extra} onChange={setExtra} exclude={lang} max={LIMITS.scriptTargets} />
          </div>
          {extra.length && ownVoice ? (
            <Toggle checked={sameVoice} onChange={setSameVoice} label={`Use ${voice?.name} in every language`} />
          ) : null}
          <div>
            <Label>Canvas</Label>
            <Segmented
              value={aspect}
              onChange={setAspect}
              options={[
                { value: "9:16", label: "9:16 Reels" },
                { value: "16:9", label: "16:9 YouTube" },
                { value: "1:1", label: "1:1 Square" },
                { value: "4:5", label: "4:5 Feed" },
              ]}
            />
          </div>
        </Panel>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-6 lg:self-start">
        <Panel className="flex flex-col gap-4 p-5">
          <Label>Generate</Label>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <p className="font-code text-[1.5rem] leading-none text-white">{extra.length + 1}</p>
              <p className="mt-1.5 font-plex text-xs text-lightgray">voiced versions</p>
            </div>
            <div>
              <p className="font-code text-[1.5rem] leading-none text-white">~{credits.toLocaleString()}</p>
              <p className="mt-1.5 font-plex text-xs text-lightgray">{isMock ? "credits (simulated, 0 spent)" : "estimated credits"}</p>
            </div>
          </div>
          <Button size="lg" onClick={run} disabled={!voice || !script.trim() || running || overWords || overChars}>
            {running ? "Working…" : "Generate voice and captions"} {running ? null : <ArrowRight size={15} />}
          </Button>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
        </Panel>
        {steps ? <StepList steps={steps} /> : null}
      </aside>
    </div>
  );
}
