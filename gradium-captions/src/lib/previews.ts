import manifest from "./preview-manifest.json";
import type { Lang } from "./types";

/** What every flagship voice says in its stored preview. Changing a line means regenerating that language. */
export const PREVIEW_TEXT: Record<Lang, string> = {
  en: "Hi! This is how your captions will sound, word for word.",
  fr: "Bonjour ! Voici comment vos sous-titres vont sonner, mot à mot.",
  de: "Hallo! So klingen deine Untertitel, Wort für Wort.",
  es: "¡Hola! Así sonarán tus subtítulos, palabra por palabra.",
  pt: "Olá! É assim que as suas legendas vão soar, palavra a palavra.",
};

/** Folder under `public/` holding one WAV per flagship voice, made by `npm run previews`. */
export const PREVIEW_DIR = "previews";

const stored = new Set<string>(manifest.voices);

export function hasPreview(voiceId: string): boolean {
  return stored.has(voiceId);
}

export function previewUrl(voiceId: string): string {
  return `/${PREVIEW_DIR}/${voiceId}.wav`;
}
