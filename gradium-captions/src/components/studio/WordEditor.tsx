"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  findMatches,
  insertAfter,
  markReviewed,
  mergeWithNext,
  needsReview,
  nudge,
  removeWord,
  replaceAll,
  setWordText,
  splitWord,
  toggleBreak,
} from "@/lib/captions/edit";
import type { Line } from "@/lib/captions/layout";
import { LIMITS } from "@/lib/limits";
import type { Word } from "@/lib/types";
import { formatTime } from "@/lib/words";
import { Check, Search, Trash, Wand, X } from "@/components/ui/icons";
import { Button, Spinner } from "@/components/ui/primitives";

export function WordEditor({
  words,
  lines,
  activeIndex,
  selected,
  playing,
  canRevoice,
  revoicesLeft,
  revoicingLine,
  onSelect,
  onSeek,
  onChange,
  onRevoice,
}: {
  words: Word[];
  lines: Line[];
  activeIndex: number;
  selected: number | null;
  playing: boolean;
  canRevoice: boolean;
  revoicesLeft: number;
  revoicingLine: number | null;
  onSelect: (index: number | null) => void;
  onSeek: (t: number) => void;
  onChange: (fn: (words: Word[]) => Word[]) => void;
  onRevoice: (line: Line) => void;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [findOpen, setFindOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [matchCase, setMatchCase] = useState(false);
  const [notice, setNotice] = useState("");

  const matches = useMemo(() => findMatches(words, query, matchCase), [words, query, matchCase]);
  const matchSet = useMemo(() => new Set(matches), [matches]);
  const reviewCount = useMemo(() => words.filter(needsReview).length, [words]);
  const word = selected !== null ? words[selected] : undefined;

  useEffect(() => {
    if (!playing || activeIndex < 0) return;
    const chip = scrollRef.current?.querySelector<HTMLElement>(`[data-word="${activeIndex}"]`);
    chip?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [activeIndex, playing]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(""), 2500);
    return () => clearTimeout(t);
  }, [notice]);

  const select = (index: number) => {
    const w = words[index];
    if (!w) return;
    onSelect(index);
    onSeek(w.start);
    const chip = scrollRef.current?.querySelector<HTMLElement>(`[data-word="${index}"]`);
    chip?.scrollIntoView({ block: "nearest" });
  };

  const apply = (fn: (words: Word[]) => Word[], nextSelected: number | null = selected) => {
    onChange(fn);
    onSelect(nextSelected);
  };

  const jump = (list: number[], dir: 1 | -1) => {
    if (!list.length) return;
    const from = selected ?? (dir === 1 ? -1 : words.length);
    const next = dir === 1 ? (list.find((i) => i > from) ?? list[0]) : ([...list].reverse().find((i) => i < from) ?? list[list.length - 1]);
    select(next);
  };

  const reviewIndices = useMemo(() => words.flatMap((w, i) => (needsReview(w) ? [i] : [])), [words]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.target as HTMLElement).closest("input, textarea")) return;
    if (selected === null) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      select(Math.min(words.length - 1, selected + 1));
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      select(Math.max(0, selected - 1));
    } else if (e.key === "Delete" || e.key === "Backspace") {
      e.preventDefault();
      apply((w) => removeWord(w, selected));
    } else if (e.key === "Escape") {
      onSelect(null);
    }
  };

  return (
    <div className="flex flex-col gap-3" onKeyDown={onKeyDown}>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" tone={findOpen ? "secondary" : "ghost"} onClick={() => setFindOpen((v) => !v)}>
          <Search size={13} /> Find and replace
        </Button>
        {reviewCount ? (
          <Button size="sm" tone="ghost" onClick={() => jump(reviewIndices, 1)} title="Words the model was unsure about">
            <span className="h-1.5 w-1.5 rounded-full bg-orange" /> {reviewCount} to review · next
          </Button>
        ) : (
          <span className="flex items-center gap-1.5 px-2 font-plex text-xs text-lightgray">
            <Check size={12} /> Nothing flagged for review
          </span>
        )}
        <span className="ml-auto font-plex text-xs text-lightgray">
          Click a word to edit · ←/→ to move · Delete removes
        </span>
      </div>

      {findOpen ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] p-2.5">
          <input className="field h-8! w-40 flex-1 text-xs!" placeholder="Find" value={query} onChange={(e) => setQuery(e.target.value)} />
          <input
            className="field h-8! w-40 flex-1 text-xs!"
            placeholder="Replace with"
            value={replacement}
            onChange={(e) => setReplacement(e.target.value)}
          />
          <label className="flex cursor-pointer items-center gap-1.5 font-plex text-xs text-lightgray">
            <input type="checkbox" className="accent-[#f2f2f2]" checked={matchCase} onChange={(e) => setMatchCase(e.target.checked)} />
            Match case
          </label>
          <span className="font-code text-[0.6875rem] text-lightgray">{query ? `${matches.length} found` : ""}</span>
          <Button size="sm" tone="ghost" onClick={() => jump(matches, -1)} disabled={!matches.length}>
            Prev
          </Button>
          <Button size="sm" tone="ghost" onClick={() => jump(matches, 1)} disabled={!matches.length}>
            Next
          </Button>
          <Button
            size="sm"
            tone="secondary"
            disabled={!matches.length}
            onClick={() => {
              const res = replaceAll(words, query, replacement, matchCase);
              apply((w) => replaceAll(w, query, replacement, matchCase).words, null);
              setNotice(`Replaced ${res.count} word${res.count === 1 ? "" : "s"}`);
            }}
          >
            Replace all
          </Button>
        </div>
      ) : null}

      {word && selected !== null ? (
        <WordInspector
          key={word.id}
          word={word}
          index={selected}
          isLast={selected === words.length - 1}
          onApply={apply}
          onClose={() => onSelect(null)}
        />
      ) : null}

      {notice ? <p className="font-plex text-xs text-green">{notice}</p> : null}

      <div ref={scrollRef} tabIndex={-1} className="scroll-thin max-h-[46vh] overflow-y-auto pr-1 outline-none">
        {lines.length ? null : <p className="py-6 text-center font-plex text-sm text-lightgray">This track has no words yet.</p>}
        {lines.map((line) => {
          const dirty = line.words.some((w) => w.dirty);
          const lineActive = activeIndex >= line.offset && activeIndex < line.offset + line.words.length;
          return (
            <div
              key={line.index}
              className={`group flex items-start gap-3 border-b border-white/[0.05] py-2 ${lineActive ? "bg-white/[0.025]" : ""}`}
            >
              <button
                type="button"
                onClick={() => onSeek(line.start)}
                className="mt-1 w-14 shrink-0 cursor-pointer text-left font-code text-[0.6875rem] text-lightgray tabular-nums hover:text-bright"
              >
                {formatTime(line.start)}
              </button>
              <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                {line.words.map((w, j) => {
                  const i = line.offset + j;
                  const isSelected = i === selected;
                  const isActive = i === activeIndex;
                  return (
                    <button
                      key={w.id}
                      type="button"
                      data-word={i}
                      onClick={() => select(i)}
                      title={`${formatTime(w.start, true)} – ${formatTime(w.end, true)}${w.prob !== undefined ? ` · confidence ${Math.round(w.prob * 100)}%` : ""}`}
                      className={`relative cursor-pointer rounded-md px-1.5 py-0.5 font-plex text-[0.9375rem] leading-snug transition-colors ${
                        isActive ? "bg-yellow text-ink" : isSelected ? "bg-white/15 text-white" : "text-bright/85 hover:bg-white/[0.07]"
                      } ${isSelected ? "ring-1 ring-bright/70" : ""} ${matchSet.has(i) && !isActive ? "outline outline-1 outline-cyan/60" : ""} ${
                        needsReview(w) ? "wavy-review" : ""
                      } ${w.dirty && !isActive ? "text-orange!" : ""}`}
                    >
                      {w.text}
                      {w.breakAfter ? <span className="ml-1 font-code text-[0.625rem] text-lightgray">↵</span> : null}
                    </button>
                  );
                })}
              </div>
              {dirty ? (
                canRevoice ? (
                  <Button
                    size="sm"
                    tone="secondary"
                    onClick={() => onRevoice(line)}
                    disabled={revoicingLine !== null || revoicesLeft <= 0 || line.words.length > LIMITS.revoiceWords}
                    title={
                      line.words.length > LIMITS.revoiceWords
                        ? `Demo limit: re-voice lines of up to ${LIMITS.revoiceWords} words. Add a line break to split it.`
                        : revoicesLeft <= 0
                          ? `Demo limit: ${LIMITS.revoicesPerProject} re-voices per project`
                          : `Re-speak this line with the track's voice and splice it into the audio · ${revoicesLeft} left`
                    }
                  >
                    {revoicingLine === line.index ? <Spinner className="h-3 w-3" /> : <Wand size={12} />} Re-voice
                  </Button>
                ) : (
                  <span className="mt-1 shrink-0 font-code text-[0.625rem] text-orange/80" title="Edited text. Add a voice to this track to re-voice it.">
                    edited
                  </span>
                )
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function WordInspector({
  word,
  index,
  isLast,
  onApply,
  onClose,
}: {
  word: Word;
  index: number;
  isLast: boolean;
  onApply: (fn: (words: Word[]) => Word[], selected: number | null) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState(word.text);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    if (text.trim() !== word.text) onApply((w) => setWordText(w, index, text), index);
  };

  const nudgeControl = (field: "start" | "end") => (
    <div className="flex items-center gap-1">
      <span className="w-9 font-code text-[0.625rem] text-lightgray uppercase">{field}</span>
      <button
        type="button"
        onClick={() => onApply((w) => nudge(w, index, field, -0.05), index)}
        className="h-7 w-7 cursor-pointer rounded-md border border-white/10 font-code text-xs text-bright hover:border-white/30"
      >
        −
      </button>
      <span className="w-16 text-center font-code text-xs text-bright tabular-nums">{formatTime(word[field], true)}</span>
      <button
        type="button"
        onClick={() => onApply((w) => nudge(w, index, field, 0.05), index)}
        className="h-7 w-7 cursor-pointer rounded-md border border-white/10 font-code text-xs text-bright hover:border-white/30"
      >
        +
      </button>
    </div>
  );

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/15 bg-white/[0.035] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          className="field h-9! min-w-40 flex-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              commit();
            } else if (e.key === "Escape") {
              setText(word.text);
              onClose();
            }
          }}
        />
        <button
          type="button"
          onClick={onClose}
          className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-lightgray hover:bg-white/5 hover:text-bright"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
        {nudgeControl("start")}
        {nudgeControl("end")}
        {word.prob !== undefined ? (
          <span className={`font-code text-[0.6875rem] ${needsReview(word) ? "text-orange" : "text-lightgray"}`}>
            confidence {Math.round(word.prob * 100)}%
          </span>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button size="sm" tone="ghost" onClick={() => onApply((w) => splitWord(w, index), index)}>
          Split
        </Button>
        <Button size="sm" tone="ghost" disabled={isLast} onClick={() => onApply((w) => mergeWithNext(w, index), index)}>
          Merge with next
        </Button>
        <Button size="sm" tone="ghost" onClick={() => onApply((w) => toggleBreak(w, index), index)}>
          {word.breakAfter ? "Remove line break" : "Break line after"}
        </Button>
        <Button size="sm" tone="ghost" onClick={() => onApply((w) => insertAfter(w, index), index + 1)}>
          Insert after
        </Button>
        {needsReview(word) ? (
          <Button size="sm" tone="ghost" onClick={() => onApply((w) => markReviewed(w, index), index)}>
            <Check size={12} /> Looks right
          </Button>
        ) : null}
        <Button size="sm" tone="danger" className="ml-auto" onClick={() => onApply((w) => removeWord(w, index), index)}>
          <Trash size={12} /> Delete
        </Button>
      </div>
    </div>
  );
}
