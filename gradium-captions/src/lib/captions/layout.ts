import type { CaptionStyle, Word } from "@/lib/types";
import { endsSentence } from "@/lib/words";

export type Line = {
  index: number;
  words: Word[];
  /** Index of the first word in the track's word list. */
  offset: number;
  start: number;
  end: number;
};

type LayoutRules = Pick<CaptionStyle, "maxWordsPerLine" | "maxCharsPerLine" | "pauseBreak" | "sentenceBreak">;

export function layoutLines(words: Word[], rules: LayoutRules): Line[] {
  const lines: Line[] = [];
  let current: Word[] = [];
  let offset = 0;
  const flush = (nextOffset: number) => {
    if (current.length) {
      lines.push({
        index: lines.length,
        words: current,
        offset,
        start: current[0].start,
        end: current[current.length - 1].end,
      });
    }
    current = [];
    offset = nextOffset;
  };
  words.forEach((word, i) => {
    if (current.length && rules.maxCharsPerLine > 0) {
      const chars = current.reduce((n, w) => n + w.text.length + 1, 0) + word.text.length;
      if (chars > rules.maxCharsPerLine) flush(i);
    }
    current.push(word);
    const next = words[i + 1];
    const full = current.length >= Math.max(1, rules.maxWordsPerLine);
    const pause = rules.pauseBreak > 0 && next !== undefined && next.start - word.end >= rules.pauseBreak;
    const sentence = rules.sentenceBreak && endsSentence(word.text);
    if (full || pause || sentence || word.breakAfter) flush(i + 1);
  });
  flush(words.length);
  return lines;
}

/** The line on screen at time `t`, holding briefly after speech ends but never overlapping the next line. */
export function lineAt(lines: Line[], t: number, holdAfter: number): Line | null {
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const next = lines[i + 1];
    const visibleUntil = next ? Math.min(next.start, line.end + holdAfter) : line.end + holdAfter;
    if (t >= line.start - 0.05 && t < visibleUntil) return line;
    if (t < line.start) return null;
  }
  return null;
}

export function lineIndexForWord(lines: Line[], wordIndex: number): number {
  return lines.findIndex((l) => wordIndex >= l.offset && wordIndex < l.offset + l.words.length);
}
