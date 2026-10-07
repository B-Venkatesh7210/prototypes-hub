import type { Product } from "@/lib/types";

/**
 * Demo limits. This is a showcase, so every product is sized to show what Gradium does without
 * burning through the free plan (45k credits a month).
 *
 * Size limits (length, words, languages) apply in mock and live mode so the UX is identical.
 * Quotas (per-day counts and credit budget) only apply to calls that spend real credits.
 */
export const LIMITS = {
  /** Record once, ship in 5: clip length and how many languages to add. */
  dubSeconds: 10,
  dubTargets: 4,
  /** Script to voice. */
  scriptWords: 100,
  scriptChars: 600,
  scriptTargets: 2,
  /** Live captions. */
  liveSeconds: 60,
  liveSessionsPerHour: 5,
  /** Studio. */
  revoiceWords: 25,
  revoicesPerProject: 10,
  projectLanguages: { dub: 5, script: 3, live: 3 } satisfies Record<Product, number>,
  /** Voices. */
  cloneSampleSeconds: 15,
  clonesPerDay: 3,
  designCandidates: 2,
  designsPerDay: 3,
  /** Real credits one browser (and one visitor IP, on the server) may spend per day. */
  dailyCredits: 5000,
  /** Server-side ceilings on what a single request may contain. */
  server: {
    sttSeconds: 12,
    translateSeconds: 65,
    cloneSeconds: 30,
    ttsChars: 700,
  },
} as const;

/** Gradium's published prices, used for estimates shown in the UI. */
export const PRICES = {
  ttsPerChar: 1,
  sttPerSecond: 3,
  translatePerSecond: 4,
} as const;

export function wordCount(text: string): number {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}
