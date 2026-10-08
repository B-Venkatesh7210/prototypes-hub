"use client";

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";

type Tone = "primary" | "secondary" | "ghost" | "danger";

const TONES: Record<Tone, string> = {
  primary: "bg-bright text-raised hover:opacity-90 border border-[rgba(242,242,242,0.4)]",
  secondary: "border border-bright/20 text-bright hover:border-bright/45",
  ghost: "text-lightgray hover:text-bright hover:bg-white/5",
  danger: "border border-red/40 text-red hover:bg-red/10",
};

const SIZES = {
  sm: "h-8 px-2.5 text-xs gap-1.5",
  md: "h-9.5 px-3 text-sm gap-2",
  lg: "h-11 px-4 text-[0.9375rem] gap-2",
};

export function buttonClass(tone: Tone = "primary", size: keyof typeof SIZES = "md", extra = "") {
  return `inline-flex shrink-0 cursor-pointer items-center justify-center rounded-lg font-favorit leading-normal whitespace-nowrap transition-[opacity,colors,border-color] duration-300 disabled:cursor-not-allowed disabled:opacity-40 ${TONES[tone]} ${SIZES[size]} ${extra}`;
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

export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <p className={`font-komuna text-xs leading-none tracking-[0.25em] text-lightgray uppercase ${className}`}>{children}</p>
  );
}

export function Pill({
  children,
  color = "#daff52",
  className = "",
}: {
  children: ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full py-0.5 pr-[calc(0.5rem-0.2em)] pl-2 font-komuna text-[0.625rem] leading-normal font-normal tracking-[0.2em] text-ink uppercase ${className}`}
      style={{ backgroundColor: color }}
    >
      {children}
    </span>
  );
}

export function Chip({
  active,
  children,
  className = "",
  ...props
}: ComponentProps<"button"> & { active?: boolean }) {
  return (
    <button
      type="button"
      className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 font-plex text-xs transition-colors ${
        active ? "border-bright/60 bg-white/[0.08] text-bright" : "border-white/10 text-lightgray hover:border-white/25 hover:text-bright"
      } ${className}`}
      {...props}
    >
      {children}
    </button>
  );
}

export function Label({ children, hint }: { children: ReactNode; hint?: ReactNode }) {
  return (
    <div className="mb-2 flex items-baseline justify-between gap-3">
      <span className="font-komuna text-[0.6875rem] tracking-[0.12em] text-lightgray uppercase">{children}</span>
      {hint ? <span className="font-plex text-[0.6875rem] text-lightgray/80">{hint}</span> : null}
    </div>
  );
}

export function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: ReactNode;
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-3 font-plex text-sm text-bright/90">
      <span>{label}</span>
      <span
        role="switch"
        aria-checked={checked}
        tabIndex={0}
        onClick={() => onChange(!checked)}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            onChange(!checked);
          }
        }}
        className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
          checked ? "border-bright/70 bg-bright" : "border-white/15 bg-white/5"
        }`}
      >
        <span
          className={`absolute top-0.5 h-3.5 w-3.5 rounded-full transition-all ${checked ? "left-[18px] bg-ink" : "left-0.5 bg-lightgray"}`}
        />
      </span>
    </label>
  );
}

export function Segmented<T extends string>({
  value,
  options,
  onChange,
  className = "",
  disabled = false,
}: {
  value: T;
  options: { value: T; label: ReactNode }[];
  onChange: (value: T) => void;
  className?: string;
  disabled?: boolean;
}) {
  return (
    <div className={`flex rounded-lg border border-white/10 bg-white/[0.02] p-0.5 ${className}`}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          onClick={() => onChange(o.value)}
          className={`flex min-h-8 flex-1 cursor-pointer items-center justify-center rounded-md px-2 font-plex text-xs transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
            value === o.value ? "bg-white/[0.09] text-bright" : "text-lightgray hover:text-bright"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Panel({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-xl border border-white/10 bg-surface/80 ${className}`}>{children}</div>;
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
    </svg>
  );
}

export function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-lg border border-red/30 bg-red/[0.06] px-3 py-2.5 font-plex text-sm leading-snug text-[#ffb4ab]">
      {children}
    </div>
  );
}
