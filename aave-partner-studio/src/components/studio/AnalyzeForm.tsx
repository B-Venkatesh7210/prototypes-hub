"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { rememberBlueprint } from "@/lib/client/recent";
import type { Blueprint } from "@/lib/types";
import { Button, ErrorNote, Spinner } from "@/components/ui/primitives";

const EXAMPLES = ["nubank.com.br", "deel.com", "wise.com", "phantom.com", "shopify.com", "A remittance app for Filipino workers abroad"];

const STEPS = ["Reading their website", "Matching live Aave markets", "Drafting the integration", "Building their app preview"];

export function AnalyzeForm({ autoFocus = false }: { autoFocus?: boolean }) {
  const router = useRouter();
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 1600);
    return () => clearInterval(t);
  }, [busy]);

  const run = async (value: string) => {
    const text = value.trim();
    if (!text || busy) return;
    setInput(text);
    setBusy(true);
    setStep(0);
    setError("");
    try {
      const res = await fetch("/api/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ input: text }) });
      const body = (await res.json()) as { blueprint?: Blueprint; error?: string };
      if (!res.ok || !body.blueprint) throw new Error(body.error || "Something went wrong.");
      rememberBlueprint(body.blueprint);
      router.push(`/p/${body.blueprint.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
      setBusy(false);
    }
  };

  return (
    <div className="w-full">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(input);
        }}
        className="flex flex-col gap-2 rounded-2xl border border-white/12 bg-surface/80 p-2 shadow-[0_20px_80px_-20px_rgba(182,80,158,0.35)] backdrop-blur sm:flex-row"
      >
        <input
          className="h-12 min-w-0 flex-1 bg-transparent px-3 text-[1.02rem] outline-none placeholder:text-dim"
          placeholder="Paste a company website, e.g. nubank.com.br"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          disabled={busy}
          autoFocus={autoFocus}
          aria-label="Company website or description"
        />
        <Button type="submit" size="lg" disabled={busy || !input.trim()}>
          {busy ? <Spinner /> : null}
          {busy ? "Building…" : "Build integration"}
        </Button>
      </form>

      {busy ? (
        <ol className="mt-5 grid gap-2 sm:grid-cols-4">
          {STEPS.map((label, i) => (
            <li
              key={label}
              className={`relative overflow-hidden rounded-xl border px-3 py-2.5 text-xs transition-colors ${
                i < step ? "border-good/25 text-good" : i === step ? "border-white/15 text-bright" : "border-line text-dim"
              }`}
            >
              {i === step ? <span className="shimmer absolute inset-0" /> : null}
              <span className="relative">
                {i < step ? "✓ " : `${i + 1}. `}
                {label}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <span className="text-xs text-dim">Try</span>
          {EXAMPLES.map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => run(ex)}
              className="cursor-pointer rounded-full border border-line px-3 py-1 text-xs text-muted transition-colors hover:border-white/25 hover:text-bright"
            >
              {ex}
            </button>
          ))}
        </div>
      )}

      {error ? (
        <div className="mt-4">
          <ErrorNote>{error}</ErrorNote>
        </div>
      ) : null}
    </div>
  );
}
