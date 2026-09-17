"use client";

import { useState } from "react";
import { MAX_WATCH, MODE_COPY } from "@/lib/presets";
import { formatSol, isPubkey, lamportsToSol, shorten } from "@/lib/format";
import type { DeskMode, WatchItem } from "@/lib/types";

type Props = {
  mode: DeskMode;
  items: WatchItem[];
  lamports: Record<string, number>;
  selectedAddress?: string;
  onAdd: (address: string, label: string) => string | null;
  onRemove: (address: string) => void;
  onSelect: (address: string) => void;
};

export function Watchlist({ mode, items, lamports, selectedAddress, onAdd, onRemove, onSelect }: Props) {
  const [address, setAddress] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState<string | null>(null);
  const copy = MODE_COPY[mode];

  const submit = () => {
    const result = onAdd(address, label);
    setError(result);
    if (!result) {
      setAddress("");
      setLabel("");
    }
  };

  return (
    <aside className="flex flex-col min-h-0 border-r border-[var(--line)] bg-[var(--panel)]">
      <div className="px-4 pt-4 pb-3 border-b border-[var(--line)]">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--faint)]">{copy.kicker}</div>
        <div className="mt-1 text-[16px] font-semibold tracking-[-0.03em]">{copy.title}</div>
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--mute)]">{copy.blurb}</p>
      </div>

      <div className="panel-scroll flex-1 px-2 py-2">
        {items.map((item) => {
          const selected = selectedAddress === item.address;
          const sol = lamports[item.address];
          return (
            <button
              key={item.address}
              onClick={() => onSelect(item.address)}
              className={`w-full text-left rounded-lg px-2.5 py-2.5 mb-1 transition ${
                selected ? "bg-[var(--panel-2)] ring-1 ring-[var(--line-2)]" : "hover:bg-[var(--panel-2)]"
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-[13px] font-medium">{item.label}</div>
                  <div className="text-[11px] text-[var(--faint)]">{item.role}</div>
                </div>
                <div className="text-right">
                  {typeof sol === "number" ? (
                    <div className="mono text-[12px] tabular-nums">{formatSol(lamportsToSol(sol), 3)} SOL</div>
                  ) : (
                    <div className="text-[11px] text-[var(--faint)]">listening</div>
                  )}
                </div>
              </div>
              <div className="mt-1.5 flex items-center justify-between gap-2">
                <span className="mono text-[11px] text-[var(--mute)]">{shorten(item.address, 5)}</span>
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    event.stopPropagation();
                    onRemove(item.address);
                  }}
                  className="text-[10px] uppercase tracking-[0.14em] text-[var(--faint)] hover:text-[var(--fail)]"
                >
                  Drop
                </span>
              </div>
            </button>
          );
        })}
      </div>

      <form
        className="border-t border-[var(--line)] p-3 space-y-2"
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--faint)]">
          Add address · {items.length}/{MAX_WATCH}
        </div>
        <input
          value={label}
          onChange={(event) => setLabel(event.target.value)}
          placeholder="Label (treasury, vault…)"
          className="w-full bg-[var(--bg)] border border-[var(--line)] rounded-md px-2.5 py-1.5 text-[12px] outline-none focus:border-[var(--line-2)]"
        />
        <input
          value={address}
          onChange={(event) => {
            setAddress(event.target.value);
            setError(null);
          }}
          placeholder="Solana address"
          className="w-full bg-[var(--bg)] border border-[var(--line)] rounded-md px-2.5 py-1.5 text-[12px] mono outline-none focus:border-[var(--line-2)]"
        />
        {error ? <div className="text-[11px] text-[var(--fail)]">{error}</div> : null}
        <button
          type="submit"
          disabled={!isPubkey(address)}
          className="w-full rounded-md bg-[var(--ink)] text-[var(--bg)] text-[12px] font-medium py-1.5 disabled:opacity-30"
        >
          Watch
        </button>
      </form>
    </aside>
  );
}
