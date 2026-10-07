export type PcmAudio = {
  sampleRate: number;
  samples: Float32Array;
};

export function encodeWav({ sampleRate, samples }: PcmAudio): Uint8Array {
  const bytes = new Uint8Array(44 + samples.length * 2);
  const view = new DataView(bytes.buffer);
  const writeTag = (offset: number, tag: string) => {
    for (let i = 0; i < tag.length; i += 1) view.setUint8(offset + i, tag.charCodeAt(i));
  };
  writeTag(0, "RIFF");
  view.setUint32(4, 36 + samples.length * 2, true);
  writeTag(8, "WAVE");
  writeTag(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeTag(36, "data");
  view.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return bytes;
}

/** Decodes a PCM WAV (16/24/32-bit int or 32-bit float), mixing to mono. */
export function decodeWav(input: ArrayBuffer | Uint8Array): PcmAudio {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const tag = (offset: number) =>
    String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3));
  if (bytes.byteLength < 44 || tag(0) !== "RIFF" || tag(8) !== "WAVE") {
    throw new Error("Not a WAV file");
  }
  let offset = 12;
  let format = 1;
  let channels = 1;
  let sampleRate = 24000;
  let bits = 16;
  let dataStart = -1;
  let dataLength = 0;
  while (offset + 8 <= bytes.byteLength) {
    const id = tag(offset);
    const size = view.getUint32(offset + 4, true);
    if (id === "fmt ") {
      format = view.getUint16(offset + 8, true);
      channels = view.getUint16(offset + 10, true);
      sampleRate = view.getUint32(offset + 12, true);
      bits = view.getUint16(offset + 22, true);
      if (format === 0xfffe && size >= 26) format = view.getUint16(offset + 32, true);
    } else if (id === "data") {
      dataStart = offset + 8;
      dataLength = Math.min(size, bytes.byteLength - dataStart);
      break;
    }
    offset += 8 + size + (size % 2);
  }
  if (dataStart < 0) throw new Error("WAV has no data chunk");
  const bytesPerSample = bits / 8;
  const frames = Math.floor(dataLength / (bytesPerSample * channels));
  const samples = new Float32Array(frames);
  for (let i = 0; i < frames; i += 1) {
    let sum = 0;
    for (let c = 0; c < channels; c += 1) {
      const p = dataStart + (i * channels + c) * bytesPerSample;
      if (format === 3 && bits === 32) sum += view.getFloat32(p, true);
      else if (bits === 16) sum += view.getInt16(p, true) / 0x8000;
      else if (bits === 24) {
        const v = view.getUint8(p) | (view.getUint8(p + 1) << 8) | (view.getInt8(p + 2) << 16);
        sum += v / 0x800000;
      } else if (bits === 32) sum += view.getInt32(p, true) / 0x80000000;
      else if (bits === 8) sum += (view.getUint8(p) - 128) / 128;
    }
    samples[i] = sum / channels;
  }
  return { sampleRate, samples };
}

export function pcm16ToFloat(bytes: Uint8Array): Float32Array {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Float32Array(Math.floor(bytes.byteLength / 2));
  for (let i = 0; i < out.length; i += 1) out[i] = view.getInt16(i * 2, true) / 0x8000;
  return out;
}

export function floatToPcm16(samples: Float32Array): Uint8Array {
  const out = new Uint8Array(samples.length * 2);
  const view = new DataView(out.buffer);
  for (let i = 0; i < samples.length; i += 1) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return out;
}

export function resample(samples: Float32Array, from: number, to: number): Float32Array {
  if (from === to) return samples;
  const ratio = from / to;
  const length = Math.max(1, Math.round(samples.length / ratio));
  const out = new Float32Array(length);
  if (ratio > 1) {
    // Box-filter downsampling to avoid harsh aliasing.
    for (let i = 0; i < length; i += 1) {
      const a = Math.floor(i * ratio);
      const b = Math.min(samples.length, Math.floor((i + 1) * ratio));
      let sum = 0;
      for (let j = a; j < b; j += 1) sum += samples[j];
      out[i] = b > a ? sum / (b - a) : samples[Math.min(a, samples.length - 1)];
    }
    return out;
  }
  for (let i = 0; i < length; i += 1) {
    const x = i * ratio;
    const a = Math.floor(x);
    const b = Math.min(samples.length - 1, a + 1);
    const t = x - a;
    out[i] = samples[a] * (1 - t) + samples[b] * t;
  }
  return out;
}

export function bytesToBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

export function base64ToBytes(b64: string): Uint8Array {
  if (typeof Buffer !== "undefined") return new Uint8Array(Buffer.from(b64, "base64"));
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}
