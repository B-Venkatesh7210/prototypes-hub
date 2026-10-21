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
    <header className="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1500px] items-center gap-6 px-4 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2.5 whitespace-nowrap">
          <span className="grid h-7 w-7 place-items-center rounded-md bg-accent font-mono text-sm font-bold text-bg">✓</span>
          <span className="hidden font-semibold tracking-tight sm:inline">
            Agent Checkout Lab <span className="hidden text-dim lg:inline">· Saifuro × x402</span>
          </span>
        </Link>
        <nav className="flex items-center gap-1 whitespace-nowrap text-sm">
          {LINKS.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              className={`rounded-md px-2.5 py-1.5 transition-colors ${path === l.href ? "bg-raised text-bright" : "text-muted hover:text-bright"}`}
            >
              {l.label}
            </Link>
          ))}
        </nav>
        <a href="https://docs.saifuro.com" target="_blank" rel="noreferrer" className="ml-auto hidden text-sm text-muted hover:text-bright md:block">
          Saifuro docs ↗
        </a>
      </div>
    </header>
  );
}
