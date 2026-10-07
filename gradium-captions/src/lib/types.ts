export type Lang = "en" | "fr" | "de" | "es" | "pt";

export type Product = "dub" | "script" | "live";

export type Word = {
  id: string;
  text: string;
  start: number;
  end: number;
  prob?: number;
  breakAfter?: boolean;
  /** Text was edited after the audio was spoken; the line can be re-voiced. */
  dirty?: boolean;
};

export type VoiceKind = "library" | "clone" | "design";

export type VoiceRef = {
  id: string;
  name: string;
  kind: VoiceKind;
  lang: Lang;
};

export type TrackKind = "original" | "dub" | "tts" | "live";

export type Track = {
  id: string;
  lang: Lang;
  kind: TrackKind;
  label: string;
  /** IndexedDB blob key of a mono WAV file. */
  audioKey: string;
  duration: number;
  words: Word[];
  voice?: VoiceRef;
  /** Script the voice spoke, for synthesized tracks. */
  script?: string;
  /** How a dub was fitted to the video clip: playback tempo applied, and seconds it still runs past the clip. */
  fit?: { tempo: number; overrun: number };
  createdAt: number;
};

/** The uploaded video a dub project is built around. */
export type ClipInfo = {
  width: number;
  height: number;
  duration: number;
  /** When the speaker starts talking, so dubs start in the same place. */
  speechStart: number;
};

export type HighlightMode = "active" | "progressive" | "fill";
export type CaptionBackground = "box" | "outline" | "none";
export type CaptionPosition = "top" | "middle" | "bottom";
export type Aspect = "16:9" | "9:16" | "1:1" | "4:5";
export type StageBackground = "gradient" | "video" | "dark" | "light" | "green" | "transparent";

export type CaptionStyle = {
  preset: string;
  fontId: string;
  fontSize: number;
  bold: boolean;
  italic: boolean;
  uppercase: boolean;
  letterSpacing: number;
  textColor: string;
  textOpacity: number;
  highlightColor: string;
  highlightMode: HighlightMode;
  activeScale: number;
  background: CaptionBackground;
  boxColor: string;
  boxOpacity: number;
  boxPadX: number;
  boxPadY: number;
  boxRadius: number;
  outlineColor: string;
  outlineWidth: number;
  shadowColor: string;
  shadowOpacity: number;
  shadowDistance: number;
  position: CaptionPosition;
  marginV: number;
  marginH: number;
  maxWordsPerLine: number;
  maxCharsPerLine: number;
  pauseBreak: number;
  holdAfter: number;
  sentenceBreak: boolean;
  aspect: Aspect;
  fps: number;
  stage: StageBackground;
};

/** The Gradium account's credit balance, from `GET /usages/credits`. */
export type AccountCredits = { remaining: number; allocated: number; period: string };

export type Project = {
  id: string;
  title: string;
  product: Product;
  createdAt: number;
  updatedAt: number;
  sourceLang: Lang;
  mediaKey?: string;
  mediaKind?: "audio" | "video";
  mediaName?: string;
  clip?: ClipInfo;
  /** Volume (0–1) of the original video's sound kept under dubbed tracks. */
  bed?: number;
  /** Lines re-voiced so far, capped per project by the demo limits. */
  revoices?: number;
  voice?: VoiceRef;
  tracks: Track[];
  activeTrackId: string;
  style: CaptionStyle;
  mock: boolean;
};

export type GradiumMode = "mock" | "live";

export type ServiceStatus = {
  mode: GradiumMode;
  hasKey: boolean;
  host: string;
};

export type TimedText = { text: string; start: number; end: number };

export type SttResult = {
  words: Omit<Word, "id">[];
  duration: number;
  credits: number;
  mock: boolean;
};

export type TtsResult = {
  /** Base64 mono 16-bit WAV. */
  audio: string;
  words: Omit<Word, "id">[];
  duration: number;
  credits: number;
  mock: boolean;
};

export type CloneResult = { voiceId: string; credits: number; mock: boolean };

export type TranslateResult = { text: string; credits: number; mock: boolean };

export type DesignCandidate = { id: string; ready: boolean };

export type DesignResult = { candidates: DesignCandidate[]; credits: number; mock: boolean };

export type LiveSession =
  | { mode: "mock" }
  | { mode: "live"; token: string; url: string; expiresAt?: string };
