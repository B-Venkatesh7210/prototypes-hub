"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { Pill } from "@/components/ui/primitives";
import { useStatus } from "@/lib/client/hooks";

const NAV = [
  { href: "/", label: "Studio" },
  { href: "/widget", label: "Earn widget" },
];

export function Shell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const status = useStatus();

  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-40 border-b border-line bg-ink/80 backdrop-blur-xl">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-3 px-5 sm:gap-6">
          <Link href="/" className="flex items-center gap-2.5">
            <span className="aave-gradient grid h-7 w-7 place-items-center rounded-lg text-[0.8rem] font-bold text-white">P</span>
            <span className="text-[0.95rem] font-semibold tracking-tight whitespace-nowrap">
              Partner Studio <span className="hidden font-normal text-muted sm:inline">for Aave</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1">
            {NAV.map((item) => {
              const active = item.href === "/" ? path === "/" || path.startsWith("/p/") : path.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`rounded-lg px-2.5 py-1.5 text-sm whitespace-nowrap transition-colors sm:px-3 ${active ? "bg-white/[0.06] text-bright" : "text-muted hover:text-bright"}`}
                >
                  {item.label}
                </Link>
              );
            })}
          </nav>
          <div className="ml-auto hidden items-center gap-2 md:flex">
            {status ? (
              <>
                <Pill tone={status.ai.enabled ? "aave" : "neutral"}>{status.ai.enabled ? `AI · ${status.ai.model}` : "AI off · templates"}</Pill>
                <Pill tone={status.sandbox.mode === "fork" ? "good" : "neutral"}>
                  {status.sandbox.mode === "fork" ? "Base fork" : "Simulated chain"}
                </Pill>
              </>
            ) : null}
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-5 py-6 text-xs text-dim">
          <p>Independent prototype, not affiliated with Aave Labs. Live data from Aave v3 on Base. Sandbox transactions never touch real funds.</p>
          <a href="https://aave.com/docs" target="_blank" rel="noreferrer" className="hover:text-muted">
            Aave docs ↗
          </a>
        </div>
      </footer>
    </div>
  );
}
