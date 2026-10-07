"use client";

import { LANG_ACCENT, LANGS } from "@/lib/langs";
import type { Lang } from "@/lib/types";
import { Check } from "@/components/ui/icons";

export function LangSelect({ value, onChange, id }: { value: Lang; onChange: (lang: Lang) => void; id?: string }) {
  return (
    <select id={id} className="field" value={value} onChange={(e) => onChange(e.target.value as Lang)}>
      {LANGS.map((l) => (
        <option key={l.code} value={l.code}>
          {l.name}
        </option>
      ))}
    </select>
  );
}

export function LangToggles({
  value,
  onChange,
  exclude,
  max,
}: {
  value: Lang[];
  onChange: (langs: Lang[]) => void;
  exclude?: Lang;
  /** Unselected languages are disabled once this many are picked. */
  max?: number;
}) {
  const full = max !== undefined && value.filter((v) => v !== exclude).length >= max;
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {LANGS.filter((l) => l.code !== exclude).map((l) => {
        const on = value.includes(l.code);
        return (
          <button
            key={l.code}
            type="button"
            disabled={!on && full}
            title={!on && full ? `Demo limit: ${max} languages` : undefined}
            onClick={() => onChange(on ? value.filter((v) => v !== l.code) : [...value, l.code])}
            className={`flex cursor-pointer items-center justify-between gap-2 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-35 ${
              on ? "border-bright/40 bg-white/[0.06]" : "border-white/10 hover:border-white/25"
            }`}
          >
            <span className="flex flex-col">
              <span className="font-code text-[0.6875rem]" style={{ color: LANG_ACCENT[l.code] }}>
                {l.flag}
              </span>
              <span className="font-plex text-sm text-bright">{l.native}</span>
            </span>
            <span
              className={`flex h-5 w-5 items-center justify-center rounded-md border ${
                on ? "border-bright bg-bright text-ink" : "border-white/20 text-transparent"
              }`}
            >
              <Check size={12} />
            </span>
          </button>
        );
      })}
    </div>
  );
}
