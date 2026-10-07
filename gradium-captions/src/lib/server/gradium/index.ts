import type {
  AccountCredits,
  CloneResult,
  DesignResult,
  Lang,
  LiveSession,
  SttResult,
  TranslateResult,
  TtsResult,
} from "@/lib/types";
import { PRICES } from "@/lib/limits";
import { GradiumError, isLive, wsBase } from "./config";
import * as live from "./live";
import * as mock from "./mock";

export { GradiumError, status } from "./config";

/** Mock calls pause briefly so progress UI behaves like it will against the network. */
const latency = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function transcribe(wav: Uint8Array, lang: Lang, keywords: string[]): Promise<SttResult> {
  if (isLive()) return live.liveTranscribe(wav, lang, keywords);
  const result = mock.mockTranscribe(wav, lang, keywords);
  await latency(500 + Math.min(2000, result.duration * 40));
  return result;
}

export async function synthesize(text: string, voiceId: string): Promise<TtsResult> {
  if (!text.trim()) throw new GradiumError("Nothing to say: the text is empty.", 400);
  if (isLive()) return live.liveSynthesize(text, voiceId);
  await latency(350 + Math.min(1500, text.length * 2));
  return mock.mockSynthesize(text, voiceId);
}

export async function cloneVoice(wav: Uint8Array, name: string, lang: Lang): Promise<CloneResult> {
  if (isLive()) return { ...(await live.liveClone(wav, name, lang)), credits: 0, mock: false };
  await latency(900);
  return { ...mock.mockClone(wav), credits: 0, mock: true };
}

export async function designVoice(prompt: string, lang: Lang, n: number): Promise<DesignResult> {
  if (isLive()) return live.liveDesign(prompt, lang, n);
  await latency(1200);
  return mock.mockDesign(prompt, n);
}

export async function keepDesignedVoice(candidateId: string, name: string): Promise<{ voiceId: string; mock: boolean }> {
  if (isLive()) return { ...(await live.liveKeep(candidateId, name)), mock: false };
  await latency(400);
  return { ...mock.mockKeep(candidateId), mock: true };
}

export async function customVoices() {
  if (isLive()) return live.liveCustomVoices();
  return [];
}

export async function translate(args: {
  wav: Uint8Array;
  seconds: number;
  text: string;
  source: Lang;
  target: Lang;
}): Promise<TranslateResult> {
  const credits = Math.ceil(args.seconds * PRICES.translatePerSecond);
  if (isLive()) return { text: await live.liveTranslate(args.wav, args.target), credits, mock: false };
  await latency(700);
  const text = args.source === args.target ? args.text : mock.mockTranslate(args.text, args.target);
  return { text, credits, mock: true };
}

export async function liveSession(): Promise<LiveSession> {
  if (!isLive()) return { mode: "mock" };
  const { token, expiresAt } = await live.liveToken();
  return { mode: "live", token, url: `${wsBase()}/speech/asr`, expiresAt };
}

export async function credits(): Promise<AccountCredits | null> {
  if (!isLive()) return null;
  return live.liveCredits();
}
