"use client";

import { useEffect, useState } from "react";
import { LANG_ACCENT, LANGS } from "@/lib/langs";
import type { Lang } from "@/lib/types";

const LINES: Record<Lang, string> = {
  en: "Record once and every word lands on time",
  fr: "Enregistrez une fois, chaque mot tombe pile",
  de: "Einmal aufnehmen, jedes Wort sitzt genau",
  es: "Graba una vez y cada palabra llega a tiempo",
  pt: "Grave uma vez e cada palavra chega na hora",
};

export function HeroDemo() {
  const [{ langIndex, word }, setState] = useState({ langIndex: 0, word: 0 });
  const lang = LANGS[langIndex].code;
  const words = LINES[lang].split(" ");

  useEffect(() => {
    const id = setInterval(() => {
      setState((s) => {
        const count = LINES[LANGS[s.langIndex].code].split(" ").length;
        return s.word + 1 < count + 3 ? { ...s, word: s.word + 1 } : { langIndex: (s.langIndex + 1) % LANGS.length, word: 0 };
      });
    }, 260);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="relative mx-auto mt-14 w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-black">
      <div
        className="absolute inset-0 opacity-90"
        style={{
          background:
            "radial-gradient(60% 80% at 15% 25%, rgba(28,160,255,0.22), transparent 60%), radial-gradient(55% 70% at 85% 20%, rgba(216,149,255,0.2), transparent 60%), radial-gradient(50% 60% at 65% 95%, rgba(145,255,250,0.16), transparent 60%), linear-gradient(180deg,#000 0%,#121314 60%)",
        }}
      />
      <div className="relative flex aspect-[16/7] flex-col items-center justify-center px-6">
        <div className="flex flex-wrap justify-center gap-x-[0.35em] gap-y-1 text-center font-favorit text-[1.6rem] leading-tight font-extrabold tracking-tight uppercase md:text-[2.6rem]">
          {words.map((w, i) => (
            <span
              key={`${lang}-${i}`}
              className="inline-block transition-all duration-200"
              style={{
                color: i === word ? LANG_ACCENT[lang] : i < word ? "#ffffff" : "rgba(255,255,255,0.35)",
                transform: i === word ? "scale(1.08)" : "scale(1)",
                textShadow: "0 3px 0 rgba(0,0,0,0.5)",
              }}
            >
              {w}
            </span>
          ))}
        </div>
      </div>
      <div className="relative flex items-center justify-between border-t border-white/10 px-4 py-3">
        <div className="flex gap-1.5">
          {LANGS.map((l, i) => (
            <button
              key={l.code}
              type="button"
              onClick={() => setState({ langIndex: i, word: 0 })}
              className={`cursor-pointer rounded-md px-2 py-1 font-code text-[0.6875rem] transition-colors ${
                i === langIndex ? "bg-white/10 text-white" : "text-lightgray hover:text-white"
              }`}
            >
              {l.flag}
            </button>
          ))}
        </div>
        <span className="font-code text-[0.6875rem] tracking-tight text-lightgray uppercase">
          word-level timestamps · same voice
        </span>
      </div>
    </div>
  );
}
