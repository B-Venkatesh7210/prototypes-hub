import type { Aspect, CaptionStyle } from "@/lib/types";

export type FontOption = { id: string; label: string; family: string; cssVar?: string };

export const FONTS: FontOption[] = [
  { id: "inter-tight", label: "Inter Tight", family: "Inter Tight", cssVar: "--font-inter-tight" },
  { id: "plex-sans", label: "IBM Plex Sans", family: "IBM Plex Sans", cssVar: "--font-ibm-plex-sans" },
  { id: "plex-mono", label: "IBM Plex Mono", family: "IBM Plex Mono", cssVar: "--font-ibm-plex-mono" },
  { id: "arial-black", label: "Arial Black", family: "'Arial Black', Arial, sans-serif" },
  { id: "helvetica", label: "Helvetica Neue", family: "'Helvetica Neue', Helvetica, Arial, sans-serif" },
  { id: "georgia", label: "Georgia", family: "Georgia, serif" },
  { id: "impact", label: "Impact", family: "Impact, 'Arial Narrow Bold', sans-serif" },
  { id: "trebuchet", label: "Trebuchet MS", family: "'Trebuchet MS', sans-serif" },
];

export function fontOption(id: string): FontOption {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}

/** Canvas can't read CSS variables, so resolve next/font's generated family names at runtime. */
export function resolveFontFamily(id: string): string {
  const font = fontOption(id);
  if (font.cssVar && typeof document !== "undefined") {
    const value = getComputedStyle(document.documentElement).getPropertyValue(font.cssVar).trim();
    if (value) return value;
  }
  return font.family;
}

export const ASPECTS: { id: Aspect; label: string; width: number; height: number }[] = [
  { id: "16:9", label: "16:9 Landscape", width: 1920, height: 1080 },
  { id: "9:16", label: "9:16 Vertical", width: 1080, height: 1920 },
  { id: "1:1", label: "1:1 Square", width: 1080, height: 1080 },
  { id: "4:5", label: "4:5 Portrait", width: 1080, height: 1350 },
];

export function aspectSize(aspect: Aspect) {
  return ASPECTS.find((a) => a.id === aspect) ?? ASPECTS[0];
}

/** The app aspect closest to a video's own frame. */
export function nearestAspect(width: number, height: number): Aspect {
  const ratio = width / height;
  return ASPECTS.reduce((best, a) => (Math.abs(Math.log(a.width / a.height / ratio)) < Math.abs(Math.log(best.width / best.height / ratio)) ? a : best)).id;
}

/** Vertical text-only canvases center captions; over video they stay low so faces stay clear. */
function defaultPosition(style: CaptionStyle, aspect: Aspect): CaptionStyle["position"] {
  if (style.stage === "video") return style.position;
  return aspect === "9:16" ? "middle" : style.position;
}

export const DEFAULT_STYLE: CaptionStyle = {
  preset: "signal",
  fontId: "inter-tight",
  fontSize: 84,
  bold: true,
  italic: false,
  uppercase: true,
  letterSpacing: 0,
  textColor: "#ffffff",
  textOpacity: 1,
  highlightColor: "#daff52",
  highlightMode: "active",
  activeScale: 1.12,
  background: "outline",
  boxColor: "#121314",
  boxOpacity: 0.8,
  boxPadX: 28,
  boxPadY: 16,
  boxRadius: 14,
  outlineColor: "#000000",
  outlineWidth: 6,
  shadowColor: "#000000",
  shadowOpacity: 0.45,
  shadowDistance: 4,
  position: "bottom",
  marginV: 140,
  marginH: 90,
  maxWordsPerLine: 4,
  maxCharsPerLine: 28,
  pauseBreak: 0.6,
  holdAfter: 0.6,
  sentenceBreak: true,
  aspect: "16:9",
  fps: 30,
  stage: "gradient",
};

type Preset = { id: string; label: string; blurb: string; style: Partial<CaptionStyle> };

export const PRESETS: Preset[] = [
  {
    id: "signal",
    label: "Signal",
    blurb: "Big capitals, lime pop on the spoken word",
    style: {
      fontId: "inter-tight", fontSize: 84, bold: true, italic: false, uppercase: true, letterSpacing: 0,
      textColor: "#ffffff", textOpacity: 1, highlightColor: "#daff52", highlightMode: "active", activeScale: 1.12,
      background: "outline", outlineColor: "#000000", outlineWidth: 6, shadowOpacity: 0.45, shadowDistance: 4,
      maxWordsPerLine: 4, maxCharsPerLine: 28,
    },
  },
  {
    id: "studio",
    label: "Studio box",
    blurb: "Plex Sans on a soft ink box, blue active word",
    style: {
      fontId: "plex-sans", fontSize: 60, bold: false, italic: false, uppercase: false, letterSpacing: 0,
      textColor: "#f2f2f2", textOpacity: 0.85, highlightColor: "#aed2ff", highlightMode: "active", activeScale: 1,
      background: "box", boxColor: "#121314", boxOpacity: 0.82, boxPadX: 28, boxPadY: 16, boxRadius: 14,
      shadowOpacity: 0, maxWordsPerLine: 7, maxCharsPerLine: 42,
    },
  },
  {
    id: "neon",
    label: "Neon fill",
    blurb: "Smooth karaoke sweep in cyan",
    style: {
      fontId: "inter-tight", fontSize: 76, bold: true, italic: false, uppercase: false, letterSpacing: 0,
      textColor: "#ffffff", textOpacity: 0.55, highlightColor: "#91fffa", highlightMode: "fill", activeScale: 1,
      background: "outline", outlineColor: "#121314", outlineWidth: 5, shadowOpacity: 0.3, shadowDistance: 3,
      maxWordsPerLine: 5, maxCharsPerLine: 32,
    },
  },
  {
    id: "minimal",
    label: "Minimal",
    blurb: "No box, soft shadow, spoken words stay lit",
    style: {
      fontId: "inter-tight", fontSize: 58, bold: false, italic: false, uppercase: false, letterSpacing: 0,
      textColor: "#ffffff", textOpacity: 0.45, highlightColor: "#ffffff", highlightMode: "progressive", activeScale: 1,
      background: "none", shadowOpacity: 0.6, shadowDistance: 3, maxWordsPerLine: 8, maxCharsPerLine: 44,
    },
  },
  {
    id: "classic",
    label: "Classic outline",
    blurb: "Arial with a thin outline and drop shadow",
    style: {
      fontId: "helvetica", fontSize: 62, bold: true, italic: false, uppercase: false, letterSpacing: 0,
      textColor: "#ffffff", textOpacity: 1, highlightColor: "#ffb592", highlightMode: "active", activeScale: 1,
      background: "outline", outlineColor: "#000000", outlineWidth: 3, shadowOpacity: 0.7, shadowDistance: 4,
      maxWordsPerLine: 7, maxCharsPerLine: 42,
    },
  },
  {
    id: "ticker",
    label: "Mono ticker",
    blurb: "Plex Mono capitals on a box, purple cue",
    style: {
      fontId: "plex-mono", fontSize: 52, bold: false, italic: false, uppercase: true, letterSpacing: 2,
      textColor: "#f2f2f2", textOpacity: 0.7, highlightColor: "#d895ff", highlightMode: "progressive", activeScale: 1,
      background: "box", boxColor: "#000000", boxOpacity: 0.7, boxPadX: 24, boxPadY: 14, boxRadius: 6,
      shadowOpacity: 0, maxWordsPerLine: 6, maxCharsPerLine: 36,
    },
  },
];

export function applyPreset(style: CaptionStyle, presetId: string): CaptionStyle {
  const preset = PRESETS.find((p) => p.id === presetId);
  if (!preset) return style;
  const next = { ...style, ...preset.style, preset: presetId };
  if (style.aspect === "9:16") return { ...next, maxWordsPerLine: Math.min(next.maxWordsPerLine, 3), position: defaultPosition(next, "9:16") };
  return next;
}

export function styleForAspect(style: CaptionStyle, aspect: Aspect): CaptionStyle {
  const vertical = aspect === "9:16" || aspect === "4:5";
  return {
    ...style,
    aspect,
    maxWordsPerLine: vertical ? Math.min(style.maxWordsPerLine, 3) : style.maxWordsPerLine,
    maxCharsPerLine: vertical ? Math.min(style.maxCharsPerLine || 22, 22) : style.maxCharsPerLine,
    position: defaultPosition(style, aspect),
  };
}
