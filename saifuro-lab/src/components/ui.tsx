"use client";

import { useState, type ReactNode } from "react";
import type { Check } from "@/kit/verdict/verify.ts";

export const VERDICT_STYLE: Record<string, string> = {
  allow: "bg-allow/12 text-allow ring-allow/30",
  review: "bg-review/12 text-review ring-review/30",
};
const DENY_STYLE = "bg-deny/12 text-deny ring-deny/30";

export function VerdictBadge({ verdict, className = "" }: { verdict: string; className?: string }) {
  return (
    <span className={`inline-flex items-center rounded px-1.5 py-0.5 font-mono text-[11px] font-medium ring-1 ring-inset ${VERDICT_STYLE[verdict] ?? DENY_STYLE} ${className}`}>
      {verdict}
    </span>
  );
}

export function Panel({ title, kicker, actions, children, className = "" }: { title: string; kicker?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-h-0 flex-col rounded-xl border border-line bg-surface ${className}`}>
      <header className="flex items-center gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          {kicker && <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">{kicker}</div>}
          <h2 className="truncate font-semibold text-bright">{title}</h2>
        </div>
        {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export function Button({
  children,
  onClick,
  disabled,
  tone = "default",
  size = "md",
  title,
  type = "button",
}: {
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  tone?: "default" | "primary" | "danger" | "ok";
  size?: "sm" | "md";
  title?: string;
  type?: "button" | "submit";
}) {
  const tones = {
    default: "border-line-strong bg-raised text-text hover:border-dim hover:text-bright",
    primary: "border-accent bg-accent text-bg hover:brightness-110",
    danger: "border-deny/40 bg-deny/10 text-deny hover:bg-deny/20",
    ok: "border-allow/40 bg-allow/10 text-allow hover:bg-allow/20",
  };
  return (
    <button
      type={type}
      title={title}
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center justify-center gap-1.5 rounded-md border font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${size === "sm" ? "px-2 py-1 text-xs" : "px-3 py-1.5 text-sm"} ${tones[tone]}`}
    >
      {children}
    </button>
  );
}

const CHECK_ICON: Record<Check["status"], { icon: string; cls: string }> = {
  pass: { icon: "✓", cls: "text-allow" },
  fail: { icon: "✕", cls: "text-deny" },
  skip: { icon: "–", cls: "text-dim" },
  not_reached: { icon: "·", cls: "text-line-strong" },
};

export function CheckList({ checks, dense = false }: { checks: Check[]; dense?: boolean }) {
  return (
    <ol className={`grid gap-px overflow-hidden rounded-lg border border-line bg-line ${dense ? "text-[11px]" : "text-xs"}`}>
      {checks.map((c) => {
        const s = CHECK_ICON[c.status];
        return (
          <li key={c.step} className={`grid grid-cols-[1.5rem_8.5rem_1fr] items-baseline gap-2 bg-surface px-2.5 ${dense ? "py-1" : "py-1.5"} ${c.status === "fail" ? "bg-deny/8" : ""}`}>
            <span className={`font-mono font-bold ${s.cls}`}>{s.icon}</span>
            <span className={c.status === "not_reached" ? "text-dim" : "text-text"}>
              <span className="font-mono text-dim">{String(c.step).padStart(2, "0")}</span> {c.name}
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
    <button
      type="button"
      onClick={() => {
        void navigator.clipboard.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className="rounded border border-line px-1.5 py-0.5 text-[11px] text-muted hover:border-line-strong hover:text-bright"
    >
      {done ? "Copied" : label}
    </button>
  );
}

export function Json({ value }: { value: unknown }) {
  return <pre className="scroll-thin overflow-x-auto rounded-md bg-bg p-2.5 font-mono text-[11px] leading-relaxed text-muted">{JSON.stringify(value, null, 2)}</pre>;
}

export const time = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

export const short = (s: string, head = 6, tail = 4) => (s.length > head + tail + 1 ? `${s.slice(0, head)}…${s.slice(-tail)}` : s);
