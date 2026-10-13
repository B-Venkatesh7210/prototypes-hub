"use client";

import type { ReactNode } from "react";
import { PartnerLogo } from "@/components/brand/PartnerLogo";
import { accentFor, onColor } from "@/lib/color";
import type { Blueprint } from "@/lib/types";

/** A phone-sized mock of the partner's own app, in their colours, with the Earn widget as a native screen. */
export function PartnerApp({ bp, mode, children }: { bp: Blueprint; mode: "light" | "dark"; children: ReactNode }) {
  const p = bp.partner;
  const dark = mode === "dark";
  const brand = accentFor(p.brand.primary, mode);
  const bg = dark ? "#0b0c10" : "#f4f5f8";
  const fg = dark ? "#f3f4f7" : "#14161c";
  const muted = dark ? "#8d94a3" : "#6b7280";

  return (
    <div className="relative mx-auto w-[360px] max-w-full rounded-[44px] border border-white/12 bg-[#050608] p-2.5 shadow-[0_40px_120px_-30px_rgba(0,0,0,0.9)]">
      <div className="absolute top-2.5 left-1/2 z-10 h-6 w-28 -translate-x-1/2 rounded-b-2xl bg-[#050608]" />
      <div className="relative flex h-[720px] flex-col overflow-hidden rounded-[36px]" style={{ background: bg, color: fg }}>
        <div className="scroll-thin min-h-0 flex-1 overflow-y-auto">
        <div className="flex items-center justify-between px-6 pt-3 pb-1 text-[11px] font-semibold" style={{ color: fg }}>
          <span>9:41</span>
          <span className="tracking-widest">●●● ▮</span>
        </div>

        <div className="flex items-center justify-between px-5 pt-3">
          <div className="flex items-center gap-2.5">
            <PartnerLogo name={p.name} logo={p.brand.logo} color={brand} size={30} radius={9} />
            <div>
              <p className="text-[11px]" style={{ color: muted }}>
                Good morning
              </p>
              <p className="text-sm font-semibold">Alex</p>
            </div>
          </div>
          <span className="grid h-8 w-8 place-items-center rounded-full text-xs font-semibold" style={{ background: dark ? "#1b1e26" : "#e6e8ee" }}>
            A
          </span>
        </div>

        <div
          className="mx-4 mt-4 rounded-3xl p-4"
          style={{ background: `linear-gradient(135deg, ${brand}, ${brand}cc)`, color: onColor(brand) }}
        >
          <p className="text-[11px] opacity-80">{p.name} account</p>
          <p className="mt-1 text-sm font-medium opacity-90">Main · •••• 4821</p>
          <div className="mt-5 flex items-end justify-between">
            <p className="text-[11px] opacity-80">Earn is new</p>
            <p className="text-[11px] font-semibold tracking-wider opacity-90">{p.name.toUpperCase().slice(0, 14)}</p>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-4 gap-2 px-4">
          {["Add", "Send", "Earn", "More"].map((a) => (
            <div key={a} className="flex flex-col items-center gap-1.5">
              <span
                className="grid h-11 w-11 place-items-center rounded-full text-sm"
                style={a === "Earn" ? { background: brand, color: onColor(brand) } : { background: dark ? "#1b1e26" : "#ffffff", color: fg }}
              >
                {a === "Add" ? "+" : a === "Send" ? "↗" : a === "Earn" ? "%" : "···"}
              </span>
              <span className="text-[10.5px]" style={{ color: a === "Earn" ? fg : muted }}>
                {a}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-5 px-3 pb-6">{children}</div>
        </div>

        <div
          className="grid shrink-0 grid-cols-4 border-t px-4 pt-2.5 pb-5 text-center text-[10px]"
          style={{ borderColor: dark ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)", background: dark ? "rgba(11,12,16,0.92)" : "rgba(244,245,248,0.92)" }}
        >
          {["Home", "Earn", "Cards", "Profile"].map((t) => (
            <span key={t} style={{ color: t === "Earn" ? brand : muted, fontWeight: t === "Earn" ? 600 : 400 }}>
              <span className="block text-base leading-none">{t === "Home" ? "⌂" : t === "Earn" ? "◎" : t === "Cards" ? "▭" : "◯"}</span>
              {t}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
