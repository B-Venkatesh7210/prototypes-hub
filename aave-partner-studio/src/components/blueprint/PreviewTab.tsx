"use client";

import { useCallback, useState } from "react";
import { Button, Card, ErrorNote, Eyebrow, Pill, Spinner } from "@/components/ui/primitives";
import { SANDBOX_FUNDS } from "@/lib/client/adapters";
import { useMarket, useStatus } from "@/lib/client/hooks";
import { useDemoAdapter } from "@/lib/client/useDemoAdapter";
import { accentFor } from "@/lib/color";
import type { Blueprint } from "@/lib/types";
import { AaveEarn } from "@/widget/AaveEarn";
import type { EarnEvent } from "@/widget/types";
import { PartnerApp } from "./PartnerApp";

type LogEntry = { id: number; at: Date; text: string; hash?: string; tone?: "good" | "bad" };

const WARPS = [
  { label: "+1 day", seconds: 86_400 },
  { label: "+30 days", seconds: 30 * 86_400 },
  { label: "+1 year", seconds: 365 * 86_400 },
];

export function PreviewTab({ bp }: { bp: Blueprint }) {
  const asset = bp.recommendation.asset;
  const status = useStatus();
  const { market } = useMarket(asset);
  const adapter = useDemoAdapter(asset);
  const [mode, setMode] = useState<"light" | "dark">("light");
  const [version, setVersion] = useState(0);
  const [log, setLog] = useState<LogEntry[]>([]);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const fork = status?.sandbox.mode === "fork";

  const push = useCallback((text: string, extra: Partial<LogEntry> = {}) => {
    setLog((l) => [{ id: Date.now() + Math.random(), at: new Date(), text, ...extra }, ...l].slice(0, 30));
  }, []);

  const onEvent = useCallback(
    (e: EarnEvent) => {
      if (e.type === "step") {
        const text =
          e.step === "approve"
            ? e.txHash
              ? `approve(Pool, amount) on ${asset}`
              : "Allowance already covers it, approve skipped"
            : e.step === "supply"
              ? `Pool.supply(${asset}) — a${asset} minted 1:1`
              : `Pool.withdraw(${asset}) — a${asset} burned`;
        push(text, { hash: e.txHash });
      } else if (e.type === "deposited") push(`Deposited ${e.amount} ${asset}`, { tone: "good" });
      else if (e.type === "withdrew") push(`Withdrew ${e.amount === "max" ? "everything" : `${e.amount} ${asset}`}`, { tone: "good" });
      else if (e.type === "error") push(e.message, { tone: "bad" });
    },
    [asset, push],
  );

  const run = async (label: string, work: () => Promise<void>, after: string) => {
    if (!adapter) return;
    setBusy(label);
    setError("");
    try {
      await work();
      push(after, { tone: "good" });
      setVersion((v) => v + 1);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sandbox action failed.");
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[400px_1fr]">
      <div>
        {adapter ? (
          <PartnerApp bp={bp} mode={mode}>
            <div className="flex justify-center">
              <AaveEarn
                asset={asset}
                adapter={adapter}
                theme={{ mode, accent: accentFor(bp.partner.brand.primary, mode), radius: 20 }}
                copy={bp.copy}
                onEvent={onEvent}
                version={version + (market ? 1 : 0)}
              />
            </div>
          </PartnerApp>
        ) : (
          <div className="mx-auto grid h-[740px] w-[360px] place-items-center rounded-[44px] border border-line">
            <Spinner />
          </div>
        )}
      </div>

      <div className="flex flex-col gap-5">
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Eyebrow>Sandbox</Eyebrow>
            <Pill tone={fork ? "good" : "neutral"}>{fork ? `Base fork · chain ${status?.sandbox.chainId}` : "Simulated · live rates"}</Pill>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            {fork ? (
              <>
                Real transactions against the real Aave v3 contracts on a fork of Base mainnet. Your browser gets a throwaway wallet funded with{" "}
                {SANDBOX_FUNDS.toLocaleString("en-US")} {asset}. Nothing touches real funds.
              </>
            ) : (
              <>
                Balances compound per second at the live {asset} rate from Aave on Base. Point <code className="font-mono text-bright">FORK_RPC_URL</code> at
                an Anvil or Tenderly fork to run the same flow as real transactions.
              </>
            )}
          </p>
          {status?.sandbox.note ? <p className="mt-2 text-xs text-warn">{status.sandbox.note}</p> : null}

          <div className="mt-5">
            <p className="text-xs text-muted">Fast-forward time</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {WARPS.map((w) => (
                <Button
                  key={w.label}
                  tone="secondary"
                  size="sm"
                  disabled={!adapter || !!busy}
                  onClick={() => run(w.label, () => adapter!.warp(w.seconds), `Clock moved ${w.label.slice(1)} — interest accrued`)}
                >
                  {busy === w.label ? <Spinner size={12} /> : null}
                  {w.label}
                </Button>
              ))}
            </div>
            <p className="mt-2 text-xs leading-relaxed text-dim">
              {fork
                ? "Moves the fork's block time. aToken balances read Aave's time-based liquidity index, so interest shows up on the next block."
                : "Moves the simulated clock. Interest compounds at the live supply rate."}
            </p>
          </div>

          <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <span className="text-xs text-muted">App theme</span>
            {(["light", "dark"] as const).map((m) => (
              <Button key={m} tone={mode === m ? "secondary" : "ghost"} size="sm" onClick={() => setMode(m)}>
                {m === "light" ? "Light" : "Dark"}
              </Button>
            ))}
            <Button
              tone="ghost"
              size="sm"
              className="ml-auto"
              disabled={!adapter || !!busy}
              onClick={() => run("reset", () => adapter!.reset(), `New wallet with ${SANDBOX_FUNDS.toLocaleString("en-US")} ${asset}`)}
            >
              {busy === "reset" ? <Spinner size={12} /> : null}
              Reset wallet
            </Button>
          </div>
          {error ? (
            <div className="mt-4">
              <ErrorNote>{error}</ErrorNote>
            </div>
          ) : null}
        </Card>

        <Card className="p-5">
          <Eyebrow>Activity</Eyebrow>
          {log.length ? (
            <ol className="scroll-thin mt-3 max-h-80 space-y-2 overflow-y-auto">
              {log.map((l) => (
                <li key={l.id} className="flex items-start gap-3 text-sm">
                  <span className="mt-0.5 shrink-0 font-mono text-[0.6875rem] text-dim">{l.at.toLocaleTimeString("en-GB")}</span>
                  <span className={l.tone === "good" ? "text-good" : l.tone === "bad" ? "text-bad" : "text-bright"}>
                    {l.text}
                    {l.hash ? <span className="ml-2 font-mono text-[0.6875rem] text-dim">{l.hash.slice(0, 14)}…</span> : null}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-muted">Deposit from the {bp.partner.name} app, then fast-forward 30 days.</p>
          )}
        </Card>

        <Card className="p-5">
          <Eyebrow>What the partner ships</Eyebrow>
          <p className="mt-3 text-sm leading-relaxed text-muted">
            The card on the left is <code className="font-mono text-bright">&lt;AaveEarn /&gt;</code>: one React component with no CSS framework, themed with{" "}
            {bp.partner.name}&apos;s colour and copy. It never touches keys. An adapter connects it to their wallet layer, and the{" "}
            <span className="text-bright">Integration code</span> tab has theirs.
          </p>
        </Card>
      </div>
    </div>
  );
}
