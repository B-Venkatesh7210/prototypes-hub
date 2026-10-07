import type { CaptionStyle, Word } from "@/lib/types";
import { aspectSize, fontOption } from "./style";
import { layoutLines } from "./layout";

function pad(n: number, size = 2) {
  return String(Math.floor(n)).padStart(size, "0");
}

function clock(t: number, sep: "," | ".") {
  const s = Math.max(0, t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const ms = Math.round((s - Math.floor(s)) * 1000);
  return `${pad(h)}:${pad(m)}:${pad(sec)}${sep}${pad(ms === 1000 ? 999 : ms, 3)}`;
}

function cueWindows(words: Word[], style: CaptionStyle) {
  const lines = layoutLines(words, style);
  return lines.map((line, i) => {
    const next = lines[i + 1];
    const end = next ? Math.min(next.start, line.end + style.holdAfter) : line.end + style.holdAfter;
    return { line, start: line.start, end };
  });
}

export function toSrt(words: Word[], style: CaptionStyle): string {
  return cueWindows(words, style)
    .map(({ line, start, end }, i) => `${i + 1}\n${clock(start, ",")} --> ${clock(end, ",")}\n${line.words.map((w) => w.text).join(" ")}\n`)
    .join("\n");
}

export function toVtt(words: Word[], style: CaptionStyle): string {
  const cues = cueWindows(words, style).map(({ line, start, end }) => {
    const body = line.words.map((w) => `<${clock(w.start, ".")}><c>${w.text}</c>`).join(" ");
    return `${clock(start, ".")} --> ${clock(end, ".")}\n${body}`;
  });
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

/** WebVTT without word timing tags, for subtitle tracks muxed into video files. */
export function toPlainVtt(words: Word[], style: CaptionStyle): string {
  const cues = cueWindows(words, style).map(
    ({ line, start, end }) => `${clock(start, ".")} --> ${clock(end, ".")}\n${line.words.map((w) => w.text).join(" ")}`,
  );
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}

function assColor(hex: string, opacity = 1) {
  const h = hex.replace("#", "").padEnd(6, "0");
  const alpha = Math.round((1 - opacity) * 255)
    .toString(16)
    .padStart(2, "0");
  return `&H${alpha}${h.slice(4, 6)}${h.slice(2, 4)}${h.slice(0, 2)}`.toUpperCase();
}

function assClock(t: number) {
  const s = Math.max(0, t);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${pad(m)}:${sec.toFixed(2).padStart(5, "0")}`;
}

/** Advanced SubStation Alpha with karaoke timing, readable by VLC, mpv, Aegisub and most editors. */
export function toAss(words: Word[], style: CaptionStyle): string {
  const { width, height } = aspectSize(style.aspect);
  const scale = Math.min(width, height) / 1080;
  const alignment = style.position === "top" ? 8 : style.position === "middle" ? 5 : 2;
  const borderStyle = style.background === "box" ? 3 : 1;
  const outline = style.background === "outline" ? style.outlineWidth * scale : style.background === "box" ? style.boxPadY * scale * 0.5 : 0;
  const font = fontOption(style.fontId).label;
  const karaokeTag = style.highlightMode === "fill" ? "kf" : "k";
  const header = [
    "[Script Info]",
    "ScriptType: v4.00+",
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    "WrapStyle: 0",
    "ScaledBorderAndShadow: yes",
    "",
    "[V4+ Styles]",
    "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
    `Style: Default,${font},${Math.round(style.fontSize * scale)},${assColor(style.highlightColor)},${assColor(style.textColor, style.textOpacity)},${
      style.background === "box" ? assColor(style.boxColor, style.boxOpacity) : assColor(style.outlineColor)
    },${assColor(style.shadowColor, style.shadowOpacity)},${style.bold ? -1 : 0},${style.italic ? -1 : 0},0,0,100,100,${style.letterSpacing},0,${borderStyle},${outline.toFixed(1)},${(style.shadowDistance * scale).toFixed(1)},${alignment},${Math.round(style.marginH * scale)},${Math.round(style.marginH * scale)},${Math.round(style.marginV * scale)},1`,
    "",
    "[Events]",
    "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
  ];
  const events = cueWindows(words, style).map(({ line, start, end }) => {
    let cursor = start;
    const body = line.words
      .map((w) => {
        const lead = Math.max(0, w.start - cursor);
        const dur = Math.max(0.01, w.end - w.start);
        cursor = w.end;
        const text = style.uppercase ? w.text.toUpperCase() : w.text;
        const gap = lead > 0.01 ? `{\\k${Math.round(lead * 100)}}` : "";
        return `${gap}{\\${karaokeTag}${Math.round(dur * 100)}}${text}`;
      })
      .join(" ");
    return `Dialogue: 0,${assClock(start)},${assClock(end)},Default,,0,0,0,,${body}`;
  });
  return [...header, ...events, ""].join("\n");
}

export function toWordsJson(words: Word[]): string {
  return JSON.stringify(
    {
      words: words.map((w) => ({
        text: w.text,
        start: w.start,
        end: w.end,
        ...(w.prob !== undefined ? { prob: w.prob } : {}),
        ...(w.breakAfter ? { break_after: true } : {}),
      })),
    },
    null,
    2,
  );
}
