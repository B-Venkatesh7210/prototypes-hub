"use client";

import { useEffect, useState } from "react";
import { formatTime } from "@/lib/words";
import { ArrowLeft, ArrowRight, Pause, Play } from "@/components/ui/icons";

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

export function Transport({
  audioRef,
  duration,
  playing,
  onToggle,
  onPrevLine,
  onNextLine,
}: {
  audioRef: React.RefObject<HTMLAudioElement | null>;
  duration: number;
  playing: boolean;
  onToggle: () => void;
  onPrevLine: () => void;
  onNextLine: () => void;
}) {
  const [time, setTime] = useState(0);
  const [rate, setRate] = useState(1);

  useEffect(() => {
    const id = setInterval(() => setTime(audioRef.current?.currentTime ?? 0), 100);
    return () => clearInterval(id);
  }, [audioRef]);

  useEffect(() => {
    if (!audioRef.current) return;
    audioRef.current.defaultPlaybackRate = rate;
    audioRef.current.playbackRate = rate;
  }, [audioRef, rate]);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onPrevLine}
        title="Previous line"
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-lightgray transition-colors hover:bg-white/5 hover:text-bright"
      >
        <ArrowLeft size={15} />
      </button>
      <button
        type="button"
        onClick={onToggle}
        title="Play / pause (space)"
        className="flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-bright text-raised transition-opacity hover:opacity-90"
      >
        {playing ? <Pause size={15} /> : <Play size={15} />}
      </button>
      <button
        type="button"
        onClick={onNextLine}
        title="Next line"
        className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-lightgray transition-colors hover:bg-white/5 hover:text-bright"
      >
        <ArrowRight size={15} />
      </button>
      <span className="ml-2 font-code text-xs text-bright tabular-nums">
        {formatTime(time, true)} <span className="text-lightgray">/ {formatTime(duration, true)}</span>
      </span>
      <div className="ml-auto flex items-center gap-1">
        {RATES.map((r) => (
          <button
            key={r}
            type="button"
            onClick={() => setRate(r)}
            className={`cursor-pointer rounded-md px-1.5 py-1 font-code text-[0.6875rem] transition-colors ${
              rate === r ? "bg-white/10 text-bright" : "text-lightgray hover:text-bright"
            }`}
          >
            {r}×
          </button>
        ))}
      </div>
    </div>
  );
}
