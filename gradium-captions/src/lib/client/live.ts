"use client";

import type { Lang, Word } from "@/lib/types";
import { bytesToBase64, floatToPcm16 } from "@/lib/wav";
import { round, segmentsToWords, tokenize, uid } from "@/lib/words";
import { api } from "./api";

export type EngineId = "gradium" | "browser" | "simulated";

export type LiveCallbacks = {
  /** Finalized words, with times relative to the start of the recording. */
  onWords: (words: Word[]) => void;
  /** Words heard but not final yet. */
  onPartial: (text: string) => void;
  onLevel: (rms: number) => void;
  onStatus: (message: string) => void;
  onError: (message: string) => void;
  /** The speaker paused long enough to end a sentence (simulated engine). */
  onSentenceEnd: () => void;
};

const RATE = 24000;
const FRAME = 1920;

/** Streaming linear resampler that keeps its phase across chunks. */
class StreamResampler {
  private pos = 0;
  private last = 0;
  constructor(
    private readonly from: number,
    private readonly to: number,
  ) {}
  push(input: Float32Array): Float32Array {
    if (this.from === this.to) return input;
    const step = this.from / this.to;
    const out: number[] = [];
    while (this.pos < input.length) {
      const i = Math.floor(this.pos);
      const t = this.pos - i;
      const a = i === 0 ? this.last : input[i - 1];
      out.push(a + (input[i] - a) * t);
      this.pos += step;
    }
    this.pos -= input.length;
    this.last = input[input.length - 1];
    return Float32Array.from(out);
  }
}

const BROWSER_LANG: Record<Lang, string> = { en: "en-US", fr: "fr-FR", de: "de-DE", es: "es-ES", pt: "pt-BR" };

const SIM_TEXT: Record<Lang, string> = {
  en: "so this is a live caption test and every word I say shows up on screen as I say it which is exactly what we want for streams podcasts and quick social clips",
  fr: "donc ceci est un test de sous titres en direct et chaque mot que je prononce apparaît à l'écran au moment où je le dis",
  de: "das hier ist ein Test für Live Untertitel und jedes Wort das ich sage erscheint sofort auf dem Bildschirm",
  es: "esto es una prueba de subtítulos en directo y cada palabra que digo aparece en pantalla en el momento en que la digo",
  pt: "isto é um teste de legendas ao vivo e cada palavra que eu digo aparece na tela no momento em que eu falo",
};

type SpeechRecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null;
  onend: (() => void) | null;
  onerror: ((e: { error: string }) => void) | null;
};

export function browserRecognitionAvailable(): boolean {
  if (typeof window === "undefined") return false;
  const w = window as unknown as Record<string, unknown>;
  return Boolean(w.SpeechRecognition || w.webkitSpeechRecognition);
}

export class LiveCaptioner {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private ownsStream = true;
  private node: AudioWorkletNode | null = null;
  private resampler: StreamResampler | null = null;
  private chunks: Float32Array[] = [];
  private captured = 0;
  private pending: Float32Array = new Float32Array(0);
  private ws: WebSocket | null = null;
  private wsReady = false;
  private wsQueue: string[] = [];
  private openSegment: { text: string; start: number } | null = null;
  private recognition: SpeechRecognitionLike | null = null;
  private recognitionSegStart: number | null = null;
  private running = false;
  private sim = { voiced: false, lastVoice: 0, nextWordAt: 0, cursor: 0, capital: true, lastWordEnd: 0 };
  private endOfStream: (() => void) | null = null;

  constructor(
    private readonly engine: EngineId,
    private readonly lang: Lang,
    private readonly keywords: string[],
    private readonly cb: LiveCallbacks,
  ) {}

  /** `performance.now()` when audio capture began; word times count from here. */
  captureStartedAt = 0;

  /** Seconds of audio captured so far. */
  get elapsed(): number {
    return this.captured / RATE;
  }

  /** Starts capturing. Pass a stream (e.g. the camera's) to share its microphone; the caller then owns it. */
  async start(shared?: MediaStream) {
    this.ownsStream = !shared;
    this.stream =
      shared ??
      (await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
      }));
    this.ctx = new AudioContext();
    await this.ctx.audioWorklet.addModule("/worklets/pcm-capture.js");
    const source = this.ctx.createMediaStreamSource(new MediaStream(this.stream.getAudioTracks()));
    this.node = new AudioWorkletNode(this.ctx, "pcm-capture");
    this.resampler = new StreamResampler(this.ctx.sampleRate, RATE);
    this.node.port.onmessage = (e: MessageEvent<Float32Array>) => this.onAudio(e.data);
    source.connect(this.node);
    this.captureStartedAt = performance.now();
    this.running = true;

    if (this.engine === "gradium") await this.openGradium();
    if (this.engine === "browser") this.openBrowser();
    if (this.engine === "simulated") this.cb.onStatus("Simulated engine: captions follow your voice activity offline");
  }

  private onAudio(raw: Float32Array) {
    if (!this.running || !this.resampler) return;
    let sum = 0;
    for (let i = 0; i < raw.length; i += 1) sum += raw[i] * raw[i];
    const rms = Math.sqrt(sum / raw.length);
    this.cb.onLevel(rms);
    const chunk = this.resampler.push(raw);
    this.chunks.push(chunk);
    this.captured += chunk.length;

    if (this.engine === "gradium") {
      const merged = new Float32Array(this.pending.length + chunk.length);
      merged.set(this.pending);
      merged.set(chunk, this.pending.length);
      let offset = 0;
      while (merged.length - offset >= FRAME) {
        this.sendWs({ type: "audio", audio: bytesToBase64(floatToPcm16(merged.subarray(offset, offset + FRAME))) });
        offset += FRAME;
      }
      this.pending = merged.slice(offset);
    }
    if (this.engine === "simulated") this.simulate(rms);
  }

  private sendWs(message: object) {
    const json = JSON.stringify(message);
    if (this.ws && this.wsReady && this.ws.readyState === WebSocket.OPEN) this.ws.send(json);
    else this.wsQueue.push(json);
  }

  private async openGradium() {
    const session = await api.liveSession();
    if (session.mode !== "live") throw new Error("Gradium realtime needs live mode (GRADIUM_MODE=live and an API key).");
    const url = new URL(session.url);
    url.searchParams.set("token", session.token);
    this.cb.onStatus("Connecting to Gradium realtime Speech-to-Text…");
    const ws = new WebSocket(url);
    this.ws = ws;
    ws.onopen = () => {
      const config: Record<string, unknown> = { language: this.lang };
      const words = this.keywords.flatMap((k) => tokenize(k));
      if (words.length) config.keywords = { words: words.slice(0, 500), boost: 3 };
      ws.send(JSON.stringify({ type: "setup", model_name: "default", input_format: "pcm", json_config: config }));
    };
    ws.onmessage = (e) => {
      const msg = JSON.parse(String(e.data)) as { type: string; text?: string; start_s?: number; stop_s?: number; message?: string };
      if (msg.type === "ready") {
        this.wsReady = true;
        this.cb.onStatus("Streaming to Gradium");
        for (const queued of this.wsQueue) ws.send(queued);
        this.wsQueue = [];
      } else if (msg.type === "text" && msg.text) {
        if (this.openSegment) this.closeSegment(msg.start_s ?? this.elapsed);
        this.openSegment = { text: msg.text, start: msg.start_s ?? this.elapsed };
        this.cb.onPartial(msg.text);
      } else if (msg.type === "end_text") {
        this.closeSegment(msg.stop_s ?? this.elapsed);
      } else if (msg.type === "end_of_stream") {
        this.closeSegment(this.elapsed);
        this.endOfStream?.();
      } else if (msg.type === "error") {
        this.cb.onError(msg.message || "Gradium stream error");
      }
    };
    ws.onerror = () => this.cb.onError("The Gradium realtime connection failed.");
    ws.onclose = () => this.endOfStream?.();
  }

  private closeSegment(stop: number) {
    if (!this.openSegment) return;
    const seg = this.openSegment;
    this.openSegment = null;
    const words = segmentsToWords([{ text: seg.text, start: seg.start, end: Math.max(seg.start + 0.2, stop) }]);
    this.cb.onWords(words.map((w) => ({ ...w, id: uid("w") })));
    this.cb.onPartial("");
  }

  private openBrowser() {
    const w = window as unknown as Record<string, new () => SpeechRecognitionLike>;
    const Ctor = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!Ctor) throw new Error("This browser has no speech recognition. Use Chrome, Edge or Safari, or pick Simulated.");
    const rec = new Ctor();
    rec.lang = BROWSER_LANG[this.lang];
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i += 1) {
        const result = e.results[i];
        const text = result[0].transcript.trim();
        if (!text) continue;
        if (this.recognitionSegStart === null) this.recognitionSegStart = Math.max(0, this.elapsed - 0.6);
        if (result.isFinal) {
          const start = this.recognitionSegStart;
          const end = Math.max(start + 0.3, this.elapsed - 0.2);
          this.recognitionSegStart = null;
          const words = segmentsToWords([{ text, start, end }]);
          this.cb.onWords(words.map((word) => ({ ...word, id: uid("w") })));
        } else {
          interim += `${text} `;
        }
      }
      this.cb.onPartial(interim.trim());
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      this.cb.onError(`Browser speech recognition: ${e.error}`);
    };
    rec.onend = () => {
      if (this.running) {
        try {
          rec.start();
        } catch {
          /* already started */
        }
      }
    };
    rec.start();
    this.recognition = rec;
    this.cb.onStatus("Browser speech recognition (free, no Gradium credits)");
  }

  private simulate(rms: number) {
    const now = this.elapsed;
    const s = this.sim;
    const corpus = tokenize(SIM_TEXT[this.lang]);
    const voiced = rms > 0.018;
    if (voiced) s.lastVoice = now;
    const speaking = now - s.lastVoice < 0.25;
    if (speaking && now >= s.nextWordAt) {
      let text = corpus[s.cursor % corpus.length];
      if (this.keywords.length && s.cursor % 11 === 6) text = this.keywords[s.cursor % this.keywords.length];
      s.cursor += 1;
      if (s.capital) text = text[0].toUpperCase() + text.slice(1);
      s.capital = false;
      const start = Math.max(s.lastWordEnd, now - 0.05);
      const word: Word = { id: uid("w"), text, start: round(start), end: round(start + 0.3) };
      s.lastWordEnd = word.end;
      s.nextWordAt = now + 0.34 + Math.random() * 0.12;
      this.cb.onWords([word]);
      s.voiced = true;
    }
    if (!speaking && s.voiced && now - s.lastVoice > 0.7) {
      s.voiced = false;
      s.capital = true;
      this.cb.onSentenceEnd();
    }
  }

  /** Stops capture and returns the full recording as 24 kHz mono samples. */
  async stop(): Promise<Float32Array> {
    this.running = false;
    if (this.engine === "gradium" && this.ws) {
      if (this.pending.length) this.sendWs({ type: "audio", audio: bytesToBase64(floatToPcm16(this.pending)) });
      this.sendWs({ type: "end_of_stream" });
      await new Promise<void>((resolve) => {
        this.endOfStream = resolve;
        setTimeout(resolve, 3000);
      });
      this.ws.close();
    }
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch {
        /* not running */
      }
    }
    this.node?.disconnect();
    if (this.ownsStream) this.stream?.getTracks().forEach((t) => t.stop());
    await this.ctx?.close();
    const out = new Float32Array(this.captured);
    let offset = 0;
    for (const c of this.chunks) {
      out.set(c, offset);
      offset += c.length;
    }
    return out;
  }
}
