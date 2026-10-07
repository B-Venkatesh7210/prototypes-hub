"use client";

import { useEffect, useRef, useState } from "react";
import { LIMITS } from "@/lib/limits";
import { Mic, Stop } from "@/components/ui/icons";
import { Button } from "@/components/ui/primitives";

const PROMPT =
  "Read this out loud: Every word I say becomes a caption, timed to the moment I say it. Gradium listens, learns my voice, and speaks it back in five languages.";

/** Records a short microphone sample (for instant voice cloning). */
export function SampleRecorder({
  onRecorded,
  minSeconds = 10,
  maxSeconds = LIMITS.cloneSampleSeconds,
}: {
  onRecorded: (blob: Blob) => void;
  minSeconds?: number;
  maxSeconds?: number;
}) {
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const recorderRef = useRef<MediaRecorder | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      if (timerRef.current) clearInterval(timerRef.current);
      recorderRef.current?.stream.getTracks().forEach((t) => t.stop());
    },
    [],
  );

  const start = async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const recorder = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        onRecorded(new Blob(chunks, { type: recorder.mimeType }));
      };
      recorder.start(250);
      recorderRef.current = recorder;
      setSeconds(0);
      setRecording(true);
      let ticks = 0;
      timerRef.current = setInterval(() => {
        ticks += 1;
        const s = ticks / 10;
        setSeconds(Math.min(s, maxSeconds));
        if (s >= maxSeconds) stop();
      }, 100);
    } catch {
      setError("Microphone access was blocked. Allow it in the browser and try again.");
    }
  };

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
    setRecording(false);
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <p className="font-plex text-xs leading-snug text-lightgray">{PROMPT}</p>
      <div className="flex items-center gap-3">
        {recording ? (
          <Button tone="danger" size="sm" onClick={stop} disabled={seconds < minSeconds}>
            <Stop size={12} /> {seconds < minSeconds ? `Keep going… ${Math.ceil(minSeconds - seconds)}s` : "Stop"}
          </Button>
        ) : (
          <Button tone="secondary" size="sm" onClick={start}>
            <Mic size={13} /> Record sample
          </Button>
        )}
        <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
          <div className="h-full rounded-full bg-pink transition-[width]" style={{ width: `${Math.min(100, (seconds / maxSeconds) * 100)}%` }} />
        </div>
        <span className="w-14 text-right font-code text-xs text-lightgray">
          {seconds.toFixed(0)}/{maxSeconds}s
        </span>
      </div>
      {error ? <p className="font-plex text-xs text-[#ffb4ab]">{error}</p> : null}
    </div>
  );
}
