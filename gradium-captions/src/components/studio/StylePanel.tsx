"use client";

import type { ReactNode } from "react";
import { applyPreset, ASPECTS, FONTS, PRESETS, styleForAspect } from "@/lib/captions/style";
import type { Aspect, CaptionBackground, CaptionPosition, CaptionStyle, HighlightMode } from "@/lib/types";
import { Label, Segmented, Toggle } from "@/components/ui/primitives";

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 border-b border-white/[0.06] pb-5 last:border-0 last:pb-0">
      <h3 className="font-komuna text-[0.6875rem] tracking-[0.2em] text-bright/80 uppercase">{title}</h3>
      {children}
    </section>
  );
}

function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  unit = "",
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="flex items-baseline justify-between font-plex text-xs text-lightgray">
        {label}
        <span className="font-code text-bright/80 tabular-nums">
          {Number.isInteger(step) ? value : value.toFixed(2)}
          {unit}
        </span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="accent-[#daff52]" />
    </label>
  );
}

function Color({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center justify-between gap-3 font-plex text-xs text-lightgray">
      {label}
      <span className="flex items-center gap-2">
        <span className="font-code text-[0.6875rem] text-bright/80 uppercase">{value}</span>
        <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      </span>
    </label>
  );
}

export function StylePanel({ style, onChange }: { style: CaptionStyle; onChange: (fn: (s: CaptionStyle) => CaptionStyle) => void }) {
  const set = <K extends keyof CaptionStyle>(key: K, value: CaptionStyle[K]) => onChange((s) => ({ ...s, [key]: value, preset: "custom" }));

  return (
    <div className="flex flex-col gap-5">
      <Section title="Presets">
        <div className="grid grid-cols-2 gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => onChange((s) => applyPreset(s, p.id))}
              className={`flex cursor-pointer flex-col items-start gap-1 rounded-lg border p-2.5 text-left transition-colors ${
                style.preset === p.id ? "border-bright/50 bg-white/[0.07]" : "border-white/10 hover:border-white/25"
              }`}
            >
              <span className="flex items-center gap-1.5 font-favorit text-sm text-white">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: p.style.highlightColor }} />
                {p.label}
              </span>
              <span className="font-plex text-[0.6875rem] leading-snug text-lightgray">{p.blurb}</span>
            </button>
          ))}
        </div>
      </Section>

      <Section title="Canvas">
        <Segmented<Aspect>
          value={style.aspect}
          onChange={(aspect) => onChange((s) => styleForAspect(s, aspect))}
          options={ASPECTS.map((a) => ({ value: a.id, label: a.id }))}
        />
      </Section>

      <Section title="Text">
        <div>
          <Label>Font</Label>
          <select className="field" value={style.fontId} onChange={(e) => set("fontId", e.target.value)}>
            {FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
        </div>
        <Slider label="Size" value={style.fontSize} min={28} max={160} unit="px" onChange={(v) => set("fontSize", v)} />
        <Slider label="Letter spacing" value={style.letterSpacing} min={-2} max={12} step={0.5} unit="px" onChange={(v) => set("letterSpacing", v)} />
        <div className="flex flex-col gap-2.5">
          <Toggle label="Bold" checked={style.bold} onChange={(v) => set("bold", v)} />
          <Toggle label="Italic" checked={style.italic} onChange={(v) => set("italic", v)} />
          <Toggle label="Uppercase" checked={style.uppercase} onChange={(v) => set("uppercase", v)} />
        </div>
      </Section>

      <Section title="Highlight">
        <Segmented<HighlightMode>
          value={style.highlightMode}
          onChange={(v) => set("highlightMode", v)}
          options={[
            { value: "active", label: "Active word" },
            { value: "progressive", label: "Progressive" },
            { value: "fill", label: "Karaoke fill" },
          ]}
        />
        <Color label="Highlight" value={style.highlightColor} onChange={(v) => set("highlightColor", v)} />
        <Color label="Text" value={style.textColor} onChange={(v) => set("textColor", v)} />
        <Slider label="Unspoken opacity" value={style.textOpacity} min={0.1} max={1} step={0.05} onChange={(v) => set("textOpacity", v)} />
        {style.highlightMode !== "fill" ? (
          <Slider label="Active word scale" value={style.activeScale} min={1} max={1.4} step={0.02} onChange={(v) => set("activeScale", v)} />
        ) : null}
      </Section>

      <Section title="Background">
        <Segmented<CaptionBackground>
          value={style.background}
          onChange={(v) => set("background", v)}
          options={[
            { value: "outline", label: "Outline" },
            { value: "box", label: "Box" },
            { value: "none", label: "None" },
          ]}
        />
        {style.background === "outline" ? (
          <>
            <Color label="Outline" value={style.outlineColor} onChange={(v) => set("outlineColor", v)} />
            <Slider label="Outline width" value={style.outlineWidth} min={0} max={16} unit="px" onChange={(v) => set("outlineWidth", v)} />
          </>
        ) : null}
        {style.background === "box" ? (
          <>
            <Color label="Box" value={style.boxColor} onChange={(v) => set("boxColor", v)} />
            <Slider label="Box opacity" value={style.boxOpacity} min={0} max={1} step={0.05} onChange={(v) => set("boxOpacity", v)} />
            <Slider label="Corner radius" value={style.boxRadius} min={0} max={48} unit="px" onChange={(v) => set("boxRadius", v)} />
            <Slider label="Padding" value={style.boxPadX} min={4} max={64} unit="px" onChange={(v) => onChange((s) => ({ ...s, boxPadX: v, boxPadY: Math.round(v * 0.57), preset: "custom" }))} />
          </>
        ) : null}
        <Color label="Shadow" value={style.shadowColor} onChange={(v) => set("shadowColor", v)} />
        <Slider label="Shadow opacity" value={style.shadowOpacity} min={0} max={1} step={0.05} onChange={(v) => set("shadowOpacity", v)} />
        <Slider label="Shadow distance" value={style.shadowDistance} min={0} max={16} unit="px" onChange={(v) => set("shadowDistance", v)} />
      </Section>

      <Section title="Position and lines">
        <Segmented<CaptionPosition>
          value={style.position}
          onChange={(v) => set("position", v)}
          options={[
            { value: "top", label: "Top" },
            { value: "middle", label: "Middle" },
            { value: "bottom", label: "Bottom" },
          ]}
        />
        <Slider label="Vertical margin" value={style.marginV} min={0} max={500} unit="px" onChange={(v) => set("marginV", v)} />
        <Slider label="Side margin" value={style.marginH} min={0} max={300} unit="px" onChange={(v) => set("marginH", v)} />
        <Slider label="Max words per line" value={style.maxWordsPerLine} min={1} max={14} onChange={(v) => set("maxWordsPerLine", v)} />
        <Slider label="Max characters per line" value={style.maxCharsPerLine} min={0} max={80} onChange={(v) => set("maxCharsPerLine", v)} />
        <Slider label="New line after a pause of" value={style.pauseBreak} min={0} max={2} step={0.05} unit="s" onChange={(v) => set("pauseBreak", v)} />
        <Slider label="Hold last line for" value={style.holdAfter} min={0} max={3} step={0.1} unit="s" onChange={(v) => set("holdAfter", v)} />
        <Toggle label="Start a new line after each sentence" checked={style.sentenceBreak} onChange={(v) => set("sentenceBreak", v)} />
      </Section>
    </div>
  );
}
