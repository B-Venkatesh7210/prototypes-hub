"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Tone = "primary" | "secondary" | "ghost";

const TONES: Record<Tone, string> = {
  primary: "bg-bright text-ink hover:bg-white",
  secondary: "border border-white/12 text-bright hover:border-white/30 bg-white/[0.02]",
  ghost: "text-muted hover:text-bright hover:bg-white/5",
};

const SIZES = {
  sm: "h-8 px-3 text-xs gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-5 text-[0.95rem] gap-2",
};

export function buttonClass(tone: Tone = "primary", size: keyof typeof SIZES = "md", extra = "") {
  return `inline-flex shrink-0 cursor-pointer items-center justify-center rounded-xl font-medium whitespace-nowrap transition-colors duration-200 disabled:cursor-not-allowed disabled:opacity-40 ${TONES[tone]} ${SIZES[size]} ${extra}`;
}

export function Button({
  tone = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<"button"> & { tone?: Tone; size?: keyof typeof SIZES }) {
  return <button type="button" className={buttonClass(tone, size, className)} {...props} />;
}

export function ButtonLink({
  tone = "primary",
  size = "md",
  className = "",
  ...props
}: ComponentProps<typeof Link> & { tone?: Tone; size?: keyof typeof SIZES }) {
  return <Link className={buttonClass(tone, size, className)} {...props} />;
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return <div className={`rounded-2xl border border-line bg-surface ${className}`}>{children}</div>;
}

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`font-mono text-[0.6875rem] tracking-[0.14em] text-muted uppercase ${className}`}>{children}</p>;
}

export function Pill({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "good" | "warn" | "aave" }) {
  const tones = {
    neutral: "border-white/10 text-muted",
    good: "border-good/30 text-good",
    warn: "border-warn/30 text-warn",
    aave: "border-aave-teal/30 text-[#7fe3ea]",
  };
  return <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[0.6875rem] ${tones[tone]}`}>{children}</span>;
}

export function Stat({ label, value, hint }: { label: string; value: ReactNode; hint?: ReactNode }) {
  return (
    <div className="min-w-0">
      <Eyebrow>{label}</Eyebrow>
      <p className="mt-1.5 truncate text-xl font-semibold tracking-tight">{value}</p>
      {hint ? <p className="mt-0.5 truncate text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

export function Spinner({ size = 14 }: { size?: number }) {
  return (
    <span
      aria-hidden
      className="inline-block animate-spin rounded-full border-2 border-current border-t-transparent"
      style={{ width: size, height: size }}
    />
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-bad/30 bg-bad/[0.06] px-3.5 py-2.5 text-sm text-bad">{children}</p>;
}
