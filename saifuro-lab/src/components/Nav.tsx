"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { Wallets as WalletsBody } from "@/app/api/wallets/route";
import { short, Tip } from "./ui";

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
        <Wallets />
        <a
          href="https://docs.saifuro.com"
          target="_blank"
          rel="noreferrer"
          className="hidden h-9 shrink-0 items-center rounded-md bg-ink px-4 text-sm font-medium text-white transition hover:bg-ink/90 md:inline-flex"
        >
          Saifuro docs ↗
        </a>
      </div>
    </header>
  );
}

function Wallets() {
  const [w, setW] = useState<WalletsBody | null>(null);
  useEffect(() => {
    let stop = false;
    const load = async () => {
      const res = await fetch("/api/wallets", { cache: "no-store" }).catch(() => null);
      if (!stop && res?.ok) setW(await res.json());
    };
    void load();
    const timer = setInterval(load, 10_000);
    return () => {
      stop = true;
      clearInterval(timer);
    };
  }, []);

  return (
    <div className="ml-auto">
      {w && (
        <div className="hidden lg:block">
          <Tip
            content={
              <>
                <div>{w.sepolia.live ? `Test buyer ${w.sepolia.address}` : `Simulated: ${w.sepolia.reason}`}</div>
                <div>{w.mainnet.address ? `Mainnet buyer ${w.mainnet.address}` : "Set BUYER_MAINNET_PRIVATE_KEY for real payments"}</div>
              </>
            }
          >
            <div className="grid grid-cols-[auto_auto_auto_auto] items-center gap-x-2.5 text-[12.5px] leading-[18px]">
              <Row
                ok={w.sepolia.live}
                network={w.sepolia.live ? "Base Sepolia" : "Simulated"}
                balance={usdc(w.sepolia.balance)}
                href={w.sepolia.href}
                link={w.sepolia.live && w.sepolia.address ? short(w.sepolia.address) : "Faucet"}
              />
              <Row
                ok={w.mainnet.balance != null}
                network="Base mainnet"
                balance={w.mainnet.address ? (usdc(w.mainnet.balance) ?? "RPC unreachable") : "Not set"}
                href={w.mainnet.href}
                link={w.mainnet.address ? short(w.mainnet.address) : null}
              />
            </div>
          </Tip>
        </div>
      )}
    </div>
  );
}

function Row({ ok, network, balance, href, link }: { ok: boolean; network: string; balance: string | null; href: string | null; link: string | null }) {
  return (
    <>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-allow" : "bg-review"}`} />
      <span className="font-medium text-ink">{network}</span>
      <span className="text-right font-mono text-body">{balance}</span>
      {href && link ? (
        <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
          {link} ↗
        </a>
      ) : (
        <span />
      )}
    </>
  );
}

const usdc = (v: string | null) => (v != null ? `${Number(v).toFixed(2)} USDC` : null);
