import type { Word } from "@/lib/types";
import { round, uid } from "@/lib/words";

const MIN_WORD = 0.04;

function reviewed(word: Word): Word {
  const { prob: _prob, ...rest } = word;
  void _prob;
  return rest;
}

/** Splits `text` on whitespace across the word's time span, weighted by length. */
function spread(word: Word, parts: string[]): Word[] {
  const total = parts.reduce((n, p) => n + p.length + 1, 0);
  const span = word.end - word.start;
  let t = word.start;
  return parts.map((text, i) => {
    const share = ((text.length + 1) / total) * span;
    const piece: Word = {
      id: i === 0 ? word.id : uid("w"),
      text,
      start: round(t),
      end: round(i === parts.length - 1 ? word.end : t + share),
      dirty: true,
    };
    if (i === parts.length - 1 && word.breakAfter) piece.breakAfter = true;
    t += share;
    return piece;
  });
}

export function setWordText(words: Word[], index: number, text: string): Word[] {
  const word = words[index];
  if (!word) return words;
  const parts = text.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return removeWord(words, index);
  if (parts.length === 1) {
    if (parts[0] === word.text) return words.map((w, i) => (i === index ? reviewed(w) : w));
    return words.map((w, i) => (i === index ? { ...reviewed(w), text: parts[0], dirty: true } : w));
  }
  return [...words.slice(0, index), ...spread(word, parts), ...words.slice(index + 1)];
}

export function mergeWithNext(words: Word[], index: number): Word[] {
  const a = words[index];
  const b = words[index + 1];
  if (!a || !b) return words;
  const merged: Word = { id: a.id, text: `${a.text} ${b.text}`, start: a.start, end: b.end, dirty: true };
  if (b.breakAfter) merged.breakAfter = true;
  return [...words.slice(0, index), merged, ...words.slice(index + 2)];
}

/** Splits a word in two at its midpoint; a word containing spaces splits on them instead. */
export function splitWord(words: Word[], index: number): Word[] {
  const word = words[index];
  if (!word) return words;
  const parts = word.text.split(/\s+/).filter(Boolean);
  if (parts.length > 1) return [...words.slice(0, index), ...spread(word, parts), ...words.slice(index + 1)];
  if (word.text.length < 2) return words;
  const cut = Math.ceil(word.text.length / 2);
  return [...words.slice(0, index), ...spread(word, [word.text.slice(0, cut), word.text.slice(cut)]), ...words.slice(index + 1)];
}

export function removeWord(words: Word[], index: number): Word[] {
  if (!words[index]) return words;
  const next = words.filter((_, i) => i !== index);
  if (words[index].breakAfter && next[index - 1]) next[index - 1] = { ...next[index - 1], breakAfter: true };
  return next;
}

/** Inserts into the gap after a word, or shares the previous word's time when there is no gap. */
export function insertAfter(words: Word[], index: number, text = "word"): Word[] {
  const prev = words[index];
  const next = words[index + 1];
  const start = prev ? prev.end : 0;
  const gapEnd = next ? next.start : start + 0.4;
  if (gapEnd - start >= MIN_WORD * 2 || !prev) {
    const word: Word = { id: uid("w"), text, start: round(start), end: round(Math.min(gapEnd, start + 0.4)), dirty: true };
    return [...words.slice(0, index + 1), word, ...words.slice(index + 1)];
  }
  const mid = round((prev.start + prev.end) / 2);
  const word: Word = { id: uid("w"), text, start: mid, end: prev.end, dirty: true };
  return [...words.slice(0, index), { ...prev, end: mid }, word, ...words.slice(index + 1)];
}

export function toggleBreak(words: Word[], index: number): Word[] {
  return words.map((w, i) => (i === index ? { ...w, breakAfter: !w.breakAfter } : w));
}

export function nudge(words: Word[], index: number, field: "start" | "end", delta: number): Word[] {
  const word = words[index];
  if (!word) return words;
  const prevEnd = words[index - 1]?.end ?? 0;
  const nextStart = words[index + 1]?.start ?? Infinity;
  const value =
    field === "start"
      ? Math.min(word.end - MIN_WORD, Math.max(prevEnd, word.start + delta))
      : Math.max(word.start + MIN_WORD, Math.min(nextStart, word.end + delta));
  return words.map((w, i) => (i === index ? { ...w, [field]: round(Math.max(0, value)) } : w));
}

export function markReviewed(words: Word[], index: number): Word[] {
  return words.map((w, i) => (i === index ? reviewed(w) : w));
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function findMatches(words: Word[], query: string, matchCase: boolean): number[] {
  if (!query.trim()) return [];
  const re = new RegExp(escapeRegExp(query.trim()), matchCase ? "" : "i");
  return words.flatMap((w, i) => (re.test(w.text) ? [i] : []));
}

export function replaceAll(words: Word[], query: string, replacement: string, matchCase: boolean): { words: Word[]; count: number } {
  if (!query.trim()) return { words, count: 0 };
  const re = new RegExp(escapeRegExp(query.trim()), matchCase ? "g" : "gi");
  let count = 0;
  let next = words.map((w) => {
    if (!re.test(w.text)) return w;
    re.lastIndex = 0;
    count += 1;
    return { ...reviewed(w), text: w.text.replace(re, replacement), dirty: true };
  });
  for (let i = next.length - 1; i >= 0; i--) {
    if (!next[i].text.trim() || /\s/.test(next[i].text.trim())) next = setWordText(next, i, next[i].text);
  }
  return { words: next, count };
}

export const LOW_CONFIDENCE = 0.5;

export function needsReview(word: Word): boolean {
  return word.prob !== undefined && word.prob < LOW_CONFIDENCE;
}
