"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { clearLedger } from "@/lib/client/api";
import { LIMITS } from "@/lib/limits";
import { buttonClass, Pill } from "@/components/ui/primitives";
import { ArrowRight } from "@/components/ui/icons";
import { useStatus } from "./StatusProvider";

export function GradiumLogo({ className = "h-5 w-[92px]" }: { className?: string }) {
  return (
    <span
      aria-label="Gradium"
      role="img"
      className={`block bg-current ${className}`}
      style={{
        WebkitMaskImage: "url(/brand/gradium-logo-large.svg)",
        maskImage: "url(/brand/gradium-logo-large.svg)",
        WebkitMaskSize: "contain",
        maskSize: "contain",
        WebkitMaskRepeat: "no-repeat",
        maskRepeat: "no-repeat",
        WebkitMaskPosition: "left center",
        maskPosition: "left center",
      }}
    />
  );
}

export function Banner() {
  const { status, isMock } = useStatus();
  const message = !status
    ? "Connecting to the Gradium provider…"
    : isMock
      ? status.hasKey
        ? "Mock mode: a key is set but GRADIUM_MODE isn't \"live\", so no credits are spent."
        : "Mock mode: every Gradium call is simulated on this machine. Zero credits used."
      : `Live mode: connected to ${status.host}.gradium.ai. Every call spends credits.`;
  return (
    <div className="relative z-50 flex h-11 w-full shrink-0 items-center gap-2 overflow-hidden bg-[#f7f8f8] p-1 md:justify-center md:gap-3">
      <div className="flex min-w-0 flex-1 overflow-hidden md:flex-none md:overflow-visible">
        <div className="flex items-center gap-2 pr-8 text-[0.625rem] leading-normal whitespace-nowrap text-black md:pr-0 md:text-sm">
          <Pill color={isMock ? "#daff52" : "#91fffa"}>{isMock ? "Mock" : "Live"}</Pill>
          <span className="truncate">{message}</span>
        </div>
      </div>
      <a
        href="https://docs.gradium.ai/guides/introduction"
        target="_blank"
        rel="noreferrer"
        className="block shrink-0 rounded-lg bg-black px-2 py-1.5 text-xs leading-normal whitespace-nowrap text-white transition-colors hover:bg-black/85"
      >
        <span className="flex items-center gap-1">
          Gradium docs <ArrowRight size={12} />
        </span>
      </a>
    </div>
  );
}

const NAV = [
  { href: "/dub", label: "Record once" },
  { href: "/script", label: "Script" },
  { href: "/live", label: "Live" },
  { href: "/projects", label: "Projects" },
];

const DEMO_LIMITS: [string, string][] = [
  ["Record once", `${LIMITS.dubSeconds}s English clip · ${LIMITS.dubTargets} languages`],
  ["Script", `${LIMITS.scriptWords} words · +${LIMITS.scriptTargets} languages`],
  ["Live", `${LIMITS.liveSeconds}s per take · ${LIMITS.liveSessionsPerHour} takes an hour`],
  ["Re-voice", `${LIMITS.revoiceWords} words a line · ${LIMITS.revoicesPerProject} per project`],
  ["Voices", `${LIMITS.clonesPerAccount} clones per account · ${LIMITS.designsPerDay} designs a day`],
];

function DemoLimits() {
  return (
    <div className="mt-4 border-t border-white/[0.06] pt-3">
      <p className="font-komuna text-[0.6875rem] tracking-[0.12em] text-lightgray uppercase">Demo limits</p>
      <dl className="mt-2 space-y-1">
        {DEMO_LIMITS.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 font-plex text-xs">
            <dt className="text-bright/80">{k}</dt>
            <dd className="text-right text-lightgray">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function GradiumAccount() {
  const { account, refreshAccount } = useStatus();
  return (
    <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border border-white/10 px-3 py-2">
      <div>
        <p className="font-plex text-xs text-lightgray">Gradium account{account?.period ? ` · ${account.period}` : ""}</p>
        <p className="font-code text-sm text-white">
          {account ? (
            <>
              {account.remaining.toLocaleString()} <span className="text-lightgray">/ {account.allocated.toLocaleString()}</span>
            </>
          ) : (
            "—"
          )}
        </p>
      </div>
      <button
        type="button"
        onClick={refreshAccount}
        className="cursor-pointer font-plex text-xs text-lightgray underline-offset-4 hover:text-bright hover:underline"
      >
        Refresh
      </button>
    </div>
  );
}

function CreditMeter() {
  const { ledger, isMock, budget } = useStatus();
  const [open, setOpen] = useState(false);
  const left = isMock ? budget.mock : budget.live;
  const accent = isMock ? "bg-yellow" : "bg-cyan";
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex h-9.5 cursor-pointer items-center gap-2 rounded-lg border border-white/10 px-3 font-code text-xs text-bright/90 transition-colors hover:border-white/25"
        title={isMock ? "Simulated demo budget left today. Mock calls spend nothing." : "Demo budget left today"}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${accent}`} />
        {left.toLocaleString()} <span className="text-lightgray">{isMock ? "left · sim" : "left"}</span>
      </button>
      {open ? (
        <div className="absolute top-11 right-0 z-50 w-80 rounded-xl border border-white/10 bg-surface p-4 shadow-2xl">
          <div className="flex items-baseline justify-between">
            <p className="font-komuna text-[0.6875rem] tracking-[0.12em] text-lightgray uppercase">Demo budget today</p>
            <p className="font-code text-[0.6875rem] text-lightgray">{isMock ? "simulated" : "live"}</p>
          </div>
          <p className="mt-3 font-code text-2xl text-white">
            {left.toLocaleString()} <span className="text-sm text-lightgray">/ {LIMITS.dailyCredits.toLocaleString()} left</span>
          </p>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/[0.06]">
            <div className={`h-full rounded-full transition-[width] ${accent}`} style={{ width: `${(left / LIMITS.dailyCredits) * 100}%` }} />
          </div>
          {isMock ? (
            <p className="mt-3 font-plex text-xs leading-snug text-lightgray">
              Mock calls count down a simulated budget so you can see what each action would cost. Nothing is spent.
            </p>
          ) : (
            <GradiumAccount />
          )}
          <p className="mt-3 font-plex text-xs leading-snug text-lightgray">
            Estimates use Gradium pricing: 1 credit per TTS character, 3 per STT second, 4 per translated second. Every deduction is
            also logged in the browser console.
          </p>
          <div className="mt-3 max-h-40 space-y-1 overflow-y-auto scroll-thin">
            {ledger
              .slice(-12)
              .reverse()
              .map((e) => (
                <div key={e.at + e.op} className="flex justify-between font-plex text-xs">
                  <span className="text-bright/80">{e.op}</span>
                  <span className={e.mock ? "text-lightgray" : "text-white"}>
                    −{e.credits.toLocaleString()}
                    {e.mock ? " · mock" : ""}
                  </span>
                </div>
              ))}
          </div>
          <button
            type="button"
            className="mt-3 cursor-pointer font-plex text-xs text-lightgray underline-offset-4 hover:text-bright hover:underline"
            onClick={clearLedger}
            title="Today's live spending stays counted"
          >
            Clear history
          </button>
          <DemoLimits />
        </div>
      ) : null}
    </div>
  );
}

export function Nav() {
  const pathname = usePathname();
  return (
    <header className="relative z-40 border-b border-white/[0.06] bg-black/40 backdrop-blur-xl">
      <div className="container-medium">
        <div className="relative flex h-[66px] items-center justify-between">
          <Link href="/" className="flex items-center gap-3 text-bright">
            <span className="relative shrink-0 overflow-hidden border border-white/15 p-1.5">
              <GradiumLogo />
            </span>
            <span className="font-favorit text-sm text-bright">Captions</span>
          </Link>
          <nav className="absolute left-1/2 hidden -translate-x-1/2 items-center gap-6 md:flex">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`font-favorit text-sm transition-opacity hover:opacity-70 ${
                  pathname?.startsWith(item.href) ? "text-white" : "text-bright/70"
                }`}
              >
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <CreditMeter />
            <a
              href="https://studio.gradium.ai/"
              target="_blank"
              rel="noreferrer"
              className={buttonClass("primary", "md", "hidden sm:inline-flex")}
            >
              Get API key
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}

export function Footer() {
  return (
    <footer className="footer-fade mt-24 py-16">
      <div className="container-medium flex flex-col gap-10">
        <div className="flex flex-col justify-between gap-8 md:flex-row">
          <div className="flex flex-col gap-4">
            <GradiumLogo className="h-6 w-[110px] text-lightgray" />
            <p className="max-w-sm font-plex text-sm leading-normal text-lightgray">
              Captions is a prototype built on Gradium Speech-to-Text, Text-to-Speech, Instant Voice Cloning, Voice Design and Live
              Translation.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-x-16 gap-y-3 font-plex text-sm">
            <p className="col-span-2 mb-1 font-komuna text-sm tracking-[0.0175rem] text-lightgray uppercase">Build</p>
            <a className="text-bright hover:opacity-70" href="https://docs.gradium.ai" target="_blank" rel="noreferrer">
              Docs
            </a>
            <a className="text-bright hover:opacity-70" href="https://gradium.ai/pricing" target="_blank" rel="noreferrer">
              Pricing
            </a>
            <a className="text-bright hover:opacity-70" href="https://studio.gradium.ai" target="_blank" rel="noreferrer">
              Studio
            </a>
            <a className="text-bright hover:opacity-70" href="https://gradium.ai/voices" target="_blank" rel="noreferrer">
              Voices
            </a>
          </div>
        </div>
        <div className="h-px w-full bg-white/20" />
        <div className="flex flex-col items-center justify-between gap-2 text-xs leading-normal text-lightgray md:flex-row">
          <span>Prototype · not an official Gradium product</span>
          <span>Speech models by Gradium</span>
        </div>
      </div>
    </footer>
  );
}

export function PageShell({ children, footer = true }: { children: React.ReactNode; footer?: boolean }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <Banner />
      <Nav />
      <main className="flex-1">{children}</main>
      {footer ? <Footer /> : null}
    </div>
  );
}
