"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import type { Check } from "@/kit/verdict/verify.ts";

export type Tone = "ok" | "warn" | "bad" | "info" | "neutral";

const TONE: Record<Tone, string> = {
  ok: "bg-allow-soft text-allow",
  warn: "bg-review-soft text-review",
  bad: "bg-deny-soft text-deny",
  info: "bg-accent-soft text-accent",
  neutral: "bg-subtle text-body",
};

export const verdictTone = (v: string): Tone => (v === "allow" ? "ok" : v === "review" ? "warn" : "bad");

export function Pill({ children, tone = "neutral", mono = false, className = "" }: { children: ReactNode; tone?: Tone; mono?: boolean; className?: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center whitespace-nowrap rounded px-2 py-[3px] text-[11.5px] font-medium leading-none ${mono ? "font-mono" : ""} ${TONE[tone]} ${className}`}>
      {children}
    </span>
  );
}

export const VerdictBadge = ({ verdict, className }: { verdict: string; className?: string }) => (
  <Pill tone={verdictTone(verdict)} mono className={className}>
    {verdict}
  </Pill>
);

/** Hover/focus tooltip. Rendered in a portal so scrolling panels can't clip it. */
export function Tip({ content, children, className = "" }: { content: ReactNode; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ x: number; y: number; above: boolean } | null>(null);

  const show = () => {
    const r = ref.current?.getBoundingClientRect();
    if (!r) return;
    const above = r.top > 140;
    setPos({ x: Math.min(Math.max(r.left + r.width / 2, 156), window.innerWidth - 156), y: above ? r.top : r.bottom, above });
  };

  useEffect(() => {
    if (!pos) return;
    const hide = () => setPos(null);
    window.addEventListener("scroll", hide, true);
    return () => window.removeEventListener("scroll", hide, true);
  }, [pos]);

  return (
    <span ref={ref} className={`inline-flex ${className}`} onMouseEnter={show} onMouseLeave={() => setPos(null)} onFocus={show} onBlur={() => setPos(null)}>
      {children}
      {pos &&
        createPortal(
          <div
            role="tooltip"
            style={{ left: pos.x, top: pos.y, transform: pos.above ? "translate(-50%, calc(-100% - 8px))" : "translate(-50%, 8px)" }}
            className="pointer-events-none fixed z-[100] w-max max-w-[300px] rounded-md bg-ink px-3 py-2 text-[12.5px] leading-relaxed text-white shadow-[0_8px_24px_rgb(15_30_51/0.18)]"
          >
            {content}
          </div>,
          document.body,
        )}
    </span>
  );
}

export function InfoTip({ content, label = "More info" }: { content: ReactNode; label?: string }) {
  return (
    <Tip content={content}>
      <button
        type="button"
        aria-label={label}
        className="grid h-[17px] w-[17px] shrink-0 place-items-center rounded-full border border-line-strong font-mono text-[10px] font-semibold text-faint transition hover:border-ink hover:text-ink focus-visible:border-ink focus-visible:text-ink focus-visible:outline-none"
      >
        i
      </button>
    </Tip>
  );
}

export function Panel({
  kicker,
  title,
  info,
  actions,
  children,
  className = "",
}: {
  kicker: string;
  title: ReactNode;
  info?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`flex min-h-0 flex-col overflow-hidden rounded-md border border-line bg-surface ${className}`}>
      <header className="flex min-h-[68px] items-center gap-3 border-b border-line px-5 py-3">
        <div className="min-w-0">
          <div className="kicker">{kicker}</div>
          <div className="mt-0.5 flex items-center gap-2">
            <h2 className="flex min-w-0 items-center gap-2 text-[17px] font-semibold tracking-[-0.015em] text-ink">{title}</h2>
            {info && <InfoTip content={info} />}
          </div>
        </div>
        {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function SectionLabel({ children, info, right }: { children: ReactNode; info?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center gap-2">
      <span className="kicker">{children}</span>
      {info && <InfoTip content={info} />}
      {right && <span className="ml-auto">{right}</span>}
    </div>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  variant = "secondary",
  size = "md",
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  variant?: "primary" | "secondary" | "danger";
  size?: "sm" | "md";
  type?: "button" | "submit";
}) {
  const variants = {
    primary: "bg-ink text-white hover:bg-ink/90",
    secondary: "border border-line-strong bg-surface text-ink hover:border-faint",
    danger: "border border-line-strong bg-surface text-deny hover:border-deny/50 hover:bg-deny-soft",
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${size === "sm" ? "h-8 px-3 text-[13px]" : "h-10 px-4 text-sm"} ${variants[variant]}`}
    >
      {children}
    </button>
  );
}

const CHECK: Record<Check["status"], { icon: string; cls: string }> = {
  pass: { icon: "✓", cls: "text-allow" },
  fail: { icon: "✕", cls: "text-deny" },
  skip: { icon: "–", cls: "text-faint" },
  not_reached: { icon: "·", cls: "text-line-strong" },
};

export function CheckList({ checks, dense = false }: { checks: Check[]; dense?: boolean }) {
  return (
    <ol className="divide-y divide-line overflow-hidden rounded-md border border-line">
      {checks.map((c) => {
        const s = CHECK[c.status];
        return (
          <li
            key={c.step}
            className={`grid grid-cols-[1.25rem_8.75rem_1fr] items-baseline gap-2 px-3 ${dense ? "py-1.5 text-[12px]" : "py-2 text-[13px]"} ${c.status === "fail" ? "bg-deny-soft" : "bg-surface"}`}
          >
            <span className={`font-mono font-bold ${s.cls}`}>{s.icon}</span>
            <span className={c.status === "not_reached" ? "text-faint" : "text-ink"}>
              <span className="font-mono text-faint">{String(c.step).padStart(2, "0")}</span> {c.name}
            </span>
            <span className={`break-words ${c.status === "fail" ? "text-deny" : "text-muted"}`}>{c.detail}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function decodeJwt(token: string): { header: unknown; claims: unknown; signature: string } | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const dec = (s: string) => {
      const b64 = s.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(s.length / 4) * 4, "=");
      return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(b64), (c) => c.charCodeAt(0))));
    };
    return { header: dec(parts[0]), claims: dec(parts[1]), signature: parts[2] };
  } catch {
    return null;
  }
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <Button
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
    >
      {done ? "Copied" : label}
    </Button>
  );
}

export function Json({ value }: { value: unknown }) {
  return <pre className="scroll-thin overflow-x-auto rounded-md border border-line bg-subtle p-3 font-mono text-[11.5px] leading-relaxed text-body [font-variant-ligatures:none]">{JSON.stringify(value, null, 2)}</pre>;
}

export const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });

export const short = (s: string, head = 6, tail = 4) => (s.length > head + tail + 1 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s);
