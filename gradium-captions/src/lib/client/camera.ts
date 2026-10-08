"use client";

/** MP4 first so the recording can usually be copied into the final file without re-encoding. */
const MIME_TYPES = [
  "video/mp4;codecs=avc1.640028,mp4a.40.2",
  "video/mp4;codecs=avc1,mp4a.40.2",
  "video/mp4",
  "video/webm;codecs=vp9,opus",
  "video/webm;codecs=vp8,opus",
  "video/webm",
];

export function cameraSupported(): boolean {
  return typeof window !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== "undefined";
}

/**
 * Opens the webcam and microphone together, asking for the best resolution the camera offers.
 * Without an aspect hint, browsers can pick a tall or 4:3 mode that scores "closer" to the ideal
 * size than the camera's native 16:9 one. Phones are left to their own orientation.
 */
export async function openCamera(): Promise<MediaStream> {
  const phone = window.matchMedia("(pointer: coarse)").matches;
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: "user",
        width: { ideal: 3840 },
        height: { ideal: 2160 },
        frameRate: { ideal: 30 },
        ...(phone ? {} : { aspectRatio: { ideal: 16 / 9 } }),
      },
      audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 },
    });
  } catch (err) {
    const name = err instanceof DOMException ? err.name : "";
    if (name === "NotAllowedError" || name === "SecurityError")
      throw new Error("Camera access was blocked. Allow it in the address bar, or switch to Mic only.");
    if (name === "NotFoundError" || name === "OverconstrainedError") throw new Error("No camera was found. Switch to Mic only.");
    if (name === "NotReadableError") throw new Error("The camera is in use by another app. Close it and try again.");
    throw new Error("Could not open the camera.");
  }
}

export function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((t) => t.stop());
}

/** Records a camera stream at a bitrate that scales with its resolution. */
export class CameraRecorder {
  private recorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];

  /** Resolves with `performance.now()` at the moment recording started. */
  start(stream: MediaStream): Promise<number> {
    const mimeType = MIME_TYPES.find((t) => MediaRecorder.isTypeSupported(t));
    const settings = stream.getVideoTracks()[0]?.getSettings() ?? {};
    const pixels = (settings.width ?? 1920) * (settings.height ?? 1080) * (settings.frameRate ?? 30);
    const videoBitsPerSecond = Math.round(Math.min(40_000_000, Math.max(4_000_000, pixels * 0.12)));
    const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond, audioBitsPerSecond: 192_000 });
    this.recorder = recorder;
    this.chunks = [];
    recorder.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    return new Promise((resolve, reject) => {
      recorder.onstart = () => resolve(performance.now());
      recorder.onerror = () => reject(new Error("The camera recording failed."));
      recorder.start(1000);
    });
  }

  stop(): Promise<Blob> {
    const recorder = this.recorder;
    if (!recorder || recorder.state === "inactive")
      return Promise.resolve(new Blob(this.chunks, { type: recorder?.mimeType || "video/webm" }));
    return new Promise((resolve) => {
      recorder.onstop = () => resolve(new Blob(this.chunks, { type: recorder.mimeType || "video/webm" }));
      recorder.stop();
    });
  }
}
