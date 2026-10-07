import type { TimedText, Word } from "./types";

export type BareWord = Omit<Word, "id">;

export function uid(prefix = ""): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `${prefix}${rand}`;
}

export function withIds(words: BareWord[]): Word[] {
  return words.map((w) => ({ ...w, id: uid("w") }));
}

export function tokenize(text: string): string[] {
  return text
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .filter(Boolean);
}

export function syllables(word: string): number {
  const groups = word
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
}

/**
 * Gradium returns timed text segments that may hold one or several words.
 * Split each segment into words, sharing its time span by word length.
 */
export function segmentsToWords(segments: TimedText[]): BareWord[] {
  const out: BareWord[] = [];
  for (const seg of segments) {
    const tokens = tokenize(seg.text);
    if (!tokens.length) continue;
    const span = Math.max(0.05, seg.end - seg.start);
    const weights = tokens.map((t) => t.length + 1);
    const total = weights.reduce((a, b) => a + b, 0);
    let cursor = seg.start;
    tokens.forEach((text, i) => {
      const dur = (span * weights[i]) / total;
      out.push({ text, start: round(cursor), end: round(cursor + dur) });
      cursor += dur;
    });
  }
  return out;
}

export function wordsToText(words: Pick<Word, "text">[]): string {
  return words.map((w) => w.text).join(" ");
}

export function endsSentence(text: string): boolean {
  return /[.!?…]["')\]]?$/.test(text);
}

export function round(n: number, digits = 3): number {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
}

export function formatTime(seconds: number, withMs = false): string {
  const s = Math.max(0, seconds);
  const m = Math.floor(s / 60);
  const rest = s - m * 60;
  if (withMs) return `${m}:${rest.toFixed(2).padStart(5, "0")}`;
  return `${m}:${Math.floor(rest).toString().padStart(2, "0")}`;
}
