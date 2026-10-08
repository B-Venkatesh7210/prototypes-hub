"use client";

import {
  ALL_FORMATS,
  AudioBufferSource,
  BlobSource,
  BufferTarget,
  CanvasSink,
  CanvasSource,
  Conversion,
  EncodedPacketSink,
  EncodedVideoPacketSource,
  getFirstEncodableAudioCodec,
  getFirstEncodableVideoCodec,
  Input,
  Mp4OutputFormat,
  Output,
  Quality,
  TextSubtitleSource,
  type InputVideoTrack,
} from "mediabunny";
import { layoutLines } from "@/lib/captions/layout";
import { drawCaptions, drawStage } from "@/lib/captions/render";
import { aspectSize, resolveFontFamily } from "@/lib/captions/style";
import type { CaptionStyle, Lang, Word } from "@/lib/types";

/** WebCodecs export: frame-accurate, faster than real time, at the source video's own resolution. */
export function webCodecsSupported(): boolean {
  return typeof window !== "undefined" && "VideoEncoder" in window && "VideoDecoder" in window && "AudioEncoder" in window;
}

const ISO_639_2: Record<Lang, string> = { en: "eng", fr: "fra", de: "deu", es: "spa", pt: "por" };

/** A voice track, optionally with the original video's sound mixed underneath at `volume`. */
export type AudioMix = {
  voice: Blob;
  /** Used when `voice` has no decodable audio, e.g. a video uploaded without sound. */
  fallback?: Blob;
  bed?: { media: Blob; volume: number } | null;
};

const MIX_RATE = 48000;

async function mixAudio(mix: AudioMix, duration: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.max(1, Math.ceil(duration * MIX_RATE)), MIX_RATE);
  const voice = await ctx.decodeAudioData(await mix.voice.arrayBuffer()).catch(async (err) => {
    if (!mix.fallback) throw err;
    return ctx.decodeAudioData(await mix.fallback.arrayBuffer());
  });
  const source = ctx.createBufferSource();
  source.buffer = voice;
  source.connect(ctx.destination);
  source.start(0);
  if (mix.bed && mix.bed.volume > 0) {
    try {
      const bed = await ctx.decodeAudioData(await mix.bed.media.arrayBuffer());
      const bedSource = ctx.createBufferSource();
      const gain = ctx.createGain();
      bedSource.buffer = bed;
      gain.gain.value = mix.bed.volume;
      bedSource.connect(gain).connect(ctx.destination);
      bedSource.start(0);
    } catch {
      /* the video has no audio track */
    }
  }
  return ctx.startRendering();
}

async function openVideo(media: Blob) {
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(media) });
  const track = await input.getPrimaryVideoTrack();
  if (!track) {
    input.dispose();
    throw new Error("The uploaded file has no video track.");
  }
  const [duration, stats] = await Promise.all([track.computeDuration(), track.computePacketStats(120)]);
  return { input, track, duration, fps: stats.averagePacketRate || 30, bitrate: stats.averageBitrate || 0 };
}

const even = (n: number) => Math.max(2, Math.round(n) - (Math.round(n) % 2));

function abortError() {
  return new DOMException("Export cancelled", "AbortError");
}

function newOutput() {
  return new Output({ format: new Mp4OutputFormat({ fastStart: "in-memory" }), target: new BufferTarget() });
}

async function audioCodec() {
  const codec = await getFirstEncodableAudioCodec(["aac", "opus"], { numberOfChannels: 2, sampleRate: MIX_RATE });
  if (!codec) throw new Error("This browser can't encode audio for MP4.");
  return codec;
}

export type BurnInOptions = {
  words: Word[];
  style: CaptionStyle;
  /** The uploaded video, drawn under the captions when the stage is "video". */
  media: Blob | null;
  audio: AudioMix;
  /** Length of the export when there is no video to follow. */
  duration: number;
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
};

/**
 * Burns the karaoke captions into the picture. With a video stage it decodes every source frame,
 * draws the captions over it and re-encodes at the source's resolution, frame rate and bitrate.
 */
export async function renderBurnedIn(o: BurnInOptions): Promise<Blob> {
  await document.fonts.ready;
  const fontFamily = resolveFontFamily(o.style.fontId);
  const lines = layoutLines(o.words, o.style);
  const video = o.style.stage === "video" && o.media ? await openVideo(o.media) : null;

  try {
    const width = video ? even(video.track.displayWidth) : aspectSize(o.style.aspect).width;
    const height = video ? even(video.track.displayHeight) : aspectSize(o.style.aspect).height;
    const fps = video ? Math.min(60, Math.max(1, video.fps)) : o.style.fps;
    const duration = video ? video.duration : o.duration;
    const floor = width * height * fps * 0.1;
    const bitrate = Math.round(Math.max(floor, video ? video.bitrate * 1.2 : 0));

    const codec = await getFirstEncodableVideoCodec(["avc", "hevc", "vp9", "av1"], { width, height });
    if (!codec) throw new Error(`This browser can't encode ${width}×${height} video.`);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas is not available in this browser.");

    const output = newOutput();
    const videoSource = new CanvasSource(canvas, { codec, quality: new Quality({ bitrate }), keyFrameInterval: 2 });
    output.addVideoTrack(videoSource, { frameRate: fps });
    const audioSource = new AudioBufferSource({ codec: await audioCodec(), quality: new Quality("high") });
    output.addAudioTrack(audioSource);
    const mixed = await mixAudio(o.audio, duration);

    await output.start();
    const audioDone = audioSource.add(mixed).then(() => audioSource.close());
    audioDone.catch(() => undefined);
    try {
      if (video) {
        const sink = new CanvasSink(video.track, { width, height, fit: "fill", poolSize: 2 });
        for await (const frame of sink.canvases(0, duration)) {
          if (o.signal.aborted) throw abortError();
          ctx.drawImage(frame.canvas, 0, 0, width, height);
          drawCaptions(ctx, width, height, lines, frame.timestamp, o.style, fontFamily);
          await videoSource.add(frame.timestamp, frame.duration);
          o.onProgress(Math.min(1, frame.timestamp / duration));
        }
      } else {
        const total = Math.ceil(duration * fps);
        for (let i = 0; i < total; i++) {
          if (o.signal.aborted) throw abortError();
          const t = i / fps;
          drawStage(ctx, width, height, { background: o.style.stage, time: t });
          drawCaptions(ctx, width, height, lines, t, o.style, fontFamily);
          await videoSource.add(t, 1 / fps);
          o.onProgress(Math.min(1, t / duration));
        }
      }
      videoSource.close();
      await audioDone;
      await output.finalize();
    } catch (err) {
      await output.cancel().catch(() => undefined);
      throw err;
    }
    return new Blob([output.target.buffer!], { type: "video/mp4" });
  } finally {
    video?.input.dispose();
  }
}

export type StreamTrack = {
  lang: Lang;
  name: string;
  audio: AudioMix;
  /** Plain WebVTT for this language's subtitle track. */
  vtt: string;
};

/**
 * Keeps the original video stream byte for byte: compressed frames are copied, not decoded.
 * Each language becomes its own audio track plus a subtitle track the viewer can switch on.
 */
export async function remuxOriginal(o: {
  media: Blob;
  tracks: StreamTrack[];
  onProgress: (fraction: number) => void;
  signal: AbortSignal;
}): Promise<Blob> {
  const { input, track, duration, fps } = await openVideo(o.media);
  try {
    const codec = track.codec;
    if (!codec || !new Mp4OutputFormat().getSupportedCodecs().includes(codec)) {
      throw new Error("This video's codec can't be copied into MP4. Use the burned-in export instead.");
    }
    const decoderConfig = (await track.getDecoderConfig()) ?? undefined;
    const aCodec = await audioCodec();

    const output = newOutput();
    const videoSource = new EncodedVideoPacketSource(codec);
    output.addVideoTrack(videoSource, { rotation: track.rotation, frameRate: fps });
    const audios = o.tracks.map((t, i) => {
      const source = new AudioBufferSource({ codec: aCodec, quality: new Quality("high") });
      output.addAudioTrack(source, { languageCode: ISO_639_2[t.lang], name: t.name, disposition: { default: i === 0 } });
      return source;
    });
    const subtitles = o.tracks.map((t) => {
      const source = new TextSubtitleSource("webvtt");
      output.addSubtitleTrack(source, { languageCode: ISO_639_2[t.lang], name: t.name });
      return source;
    });
    const buffers = await Promise.all(o.tracks.map((t) => mixAudio(t.audio, duration)));

    await output.start();
    const sideDone = Promise.all([
      ...audios.map((s, i) => s.add(buffers[i]).then(() => s.close())),
      ...subtitles.map((s, i) => s.add(o.tracks[i].vtt).then(() => s.close())),
    ]);
    sideDone.catch(() => undefined);
    try {
      await copyPackets(track, videoSource, decoderConfig, duration, o);
      videoSource.close();
      await sideDone;
      await output.finalize();
    } catch (err) {
      await output.cancel().catch(() => undefined);
      throw err;
    }
    return new Blob([output.target.buffer!], { type: "video/mp4" });
  } finally {
    input.dispose();
  }
}

async function copyPackets(
  track: InputVideoTrack,
  target: EncodedVideoPacketSource,
  decoderConfig: VideoDecoderConfig | undefined,
  duration: number,
  o: { onProgress: (fraction: number) => void; signal: AbortSignal },
) {
  let first = true;
  for await (const packet of new EncodedPacketSink(track).packets()) {
    if (o.signal.aborted) throw abortError();
    await target.add(packet, first ? { decoderConfig } : undefined);
    first = false;
    o.onProgress(Math.min(1, packet.timestamp / Math.max(duration, 0.001)));
  }
}

/**
 * Turns a browser recording (fragmented MP4 or WebM, often without a seek index) into a regular
 * MP4. Streams are copied when MP4 can hold them; returns the recording unchanged if that fails.
 */
export async function recordingToMp4(media: Blob): Promise<Blob> {
  if (!webCodecsSupported()) return media;
  const input = new Input({ formats: ALL_FORMATS, source: new BlobSource(media) });
  const output = newOutput();
  try {
    const conversion = await Conversion.init({ input, output });
    if (!conversion.isValid) return media;
    await conversion.execute();
    return new Blob([output.target.buffer!], { type: "video/mp4" });
  } catch {
    return media;
  } finally {
    input.dispose();
  }
}

/** Reads the uploaded video's display size and duration. */
export async function probeVideo(media: Blob): Promise<{ width: number; height: number; duration: number } | null> {
  if (!webCodecsSupported()) return null;
  try {
    const { input, track, duration } = await openVideo(media);
    const info = { width: track.displayWidth, height: track.displayHeight, duration };
    input.dispose();
    return info;
  } catch {
    return null;
  }
}
