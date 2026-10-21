"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Lab" },
  { href: "/inspector", label: "Verdict Inspector" },
  { href: "/kit", label: "Integration kit" },
];

export function Nav() {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-8 px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-ink">
            <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M3 8.5 6.5 12 13 4.5" />
            </svg>
          </span>
          <span className="text-[17px] font-semibold tracking-[-0.02em] text-ink">Agent Checkout Lab</span>
        </Link>
        <nav className="flex h-full items-center gap-6 text-sm font-medium">
          {LINKS.map((l) => {
            const active = path === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`relative flex h-full items-center whitespace-nowrap transition-colors ${active ? "text-ink" : "text-body hover:text-ink"}`}
              >
                {l.label}
                {active && <span className="absolute inset-x-0 -bottom-px h-0.5 rounded-full bg-ink" />}
              </Link>
            );
          })}
        </nav>
        <a
          href="https://docs.saifuro.com"
          target="_blank"
          rel="noreferrer"
          className="ml-auto hidden h-9 items-center rounded-md bg-ink px-4 text-sm font-medium text-white transition hover:bg-ink/90 md:inline-flex"
        >
          Saifuro docs ↗
        </a>
      </div>
    </header>
  );
}
