import type { Lang } from "./types";

export const LANGS: { code: Lang; name: string; native: string; flag: string }[] = [
  { code: "en", name: "English", native: "English", flag: "EN" },
  { code: "fr", name: "French", native: "Français", flag: "FR" },
  { code: "de", name: "German", native: "Deutsch", flag: "DE" },
  { code: "es", name: "Spanish", native: "Español", flag: "ES" },
  { code: "pt", name: "Portuguese", native: "Português", flag: "PT" },
];

export const LANG_CODES = LANGS.map((l) => l.code);

export function isLang(value: unknown): value is Lang {
  return typeof value === "string" && (LANG_CODES as string[]).includes(value);
}

export function langName(code: Lang): string {
  return LANGS.find((l) => l.code === code)?.name ?? code;
}

/** Accent colour per language, drawn from Gradium's palette. */
export const LANG_ACCENT: Record<Lang, string> = {
  en: "#aed2ff",
  fr: "#d895ff",
  de: "#ffb592",
  es: "#daff52",
  pt: "#91fffa",
};
