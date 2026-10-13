"use client";

import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import type { EarnAdapter, EarnCopy, EarnEvent, EarnState, EarnStep, EarnTheme } from "./types";

export type AaveEarnProps = {
  asset: string;
  adapter: EarnAdapter;
  theme?: EarnTheme;
  copy?: EarnCopy;
  onEvent?: (event: EarnEvent) => void;
  /** Change to force a refresh, e.g. after the host app moves funds. */
  version?: number;
};

type Mode = "deposit" | "withdraw";
type Progress = { step: EarnStep; status: "pending" | "done"; txHash?: string }[];

const YEAR_MS = 31_536_000_000;

/**
 * Drop-in "Earn" card backed by Aave. Self-contained: React only, no CSS framework, themeable,
 * and wallet-agnostic through the adapter.
 */
export function AaveEarn({ asset, adapter, theme, copy, onEvent, version = 0 }: AaveEarnProps) {
  const [state, setState] = useState<EarnState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [mode, setMode] = useState<Mode>("deposit");
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<Progress>([]);
  const [notice, setNotice] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const [reload, setReload] = useState(0);
  const syncedAt = useRef(0);
  const balanceRef = useRef<HTMLSpanElement>(null);
  const centsRef = useRef<HTMLSpanElement>(null);
  const earnedRef = useRef<HTMLSpanElement>(null);
  const eventRef = useRef(onEvent);

  useEffect(() => {
    eventRef.current = onEvent;
  }, [onEvent]);

  const emit = useCallback((e: EarnEvent) => eventRef.current?.(e), []);

  useEffect(() => {
    let live = true;
    const load = () =>
      adapter
        .getState()
        .then((s) => {
          if (!live) return;
          syncedAt.current = performance.now();
          setState(s);
          setLoadError("");
        })
        .catch((err: unknown) => live && setLoadError(err instanceof Error ? err.message : "Couldn't load your balance."));
    void load();
    const timer = setInterval(load, 20_000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [adapter, version, reload]);

  useEffect(() => emit({ type: "view", asset }), [asset, emit]);

  // Interest accrues every second; paint it straight to the DOM instead of re-rendering 60 times a second.
  useEffect(() => {
    if (!state) return;
    let id = requestAnimationFrame(function paint() {
      const elapsed = performance.now() - syncedAt.current;
      const value = state.deposited * Math.pow(1 + state.apy, elapsed / YEAR_MS);
      const [whole, frac] = splitAmount(value);
      if (balanceRef.current) balanceRef.current.textContent = whole;
      if (centsRef.current) centsRef.current.textContent = frac;
      if (earnedRef.current && state.principal !== undefined) earnedRef.current.textContent = fmt(Math.max(0, value - state.principal), 6);
      id = requestAnimationFrame(paint);
    });
    return () => cancelAnimationFrame(id);
  }, [state]);

  const vars = cssVars(theme);
  const sym = currencySign(asset);
  const max = mode === "deposit" ? (state?.wallet ?? 0) : (state?.deposited ?? 0);
  const value = Number(amount);
  const valid = amount !== "" && Number.isFinite(value) && value > 0 && value <= max + 1e-9;
  const yearly = state && valid && mode === "deposit" ? value * state.apy : 0;

  const submit = async () => {
    if (!state || !valid || busy) return;
    setBusy(true);
    setNotice(null);
    const isMax = mode === "withdraw" && value >= state.deposited - 1e-6;
    const steps: EarnStep[] = mode === "deposit" ? ["approve", "supply"] : ["withdraw"];
    setProgress(steps.map((step) => ({ step, status: "pending" })));
    const onStep = (step: EarnStep, txHash?: string) => {
      setProgress((p) => p.map((x) => (x.step === step ? { ...x, status: "done", txHash } : x)));
      emit({ type: "step", step, txHash });
    };
    try {
      if (mode === "deposit") {
        await adapter.deposit(value, onStep);
        emit({ type: "deposited", amount: value });
        setNotice({ kind: "ok", text: `Deposited ${sym}${fmt(value, 2)}. It's earning now.` });
      } else {
        await adapter.withdraw(isMax ? "max" : value, onStep);
        emit({ type: "withdrew", amount: isMax ? "max" : value });
        setNotice({ kind: "ok", text: `Withdrew ${isMax ? "everything" : `${sym}${fmt(value, 2)}`} to your balance.` });
      }
      setAmount("");
      setReload((n) => n + 1);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Transaction failed.";
      emit({ type: "error", message });
      setNotice({ kind: "error", text: message });
    } finally {
      setBusy(false);
      setTimeout(() => setProgress([]), 2400);
    }
  };

  return (
    <div className="aew" style={vars}>
      <style href="aave-earn-widget" precedence="default">
        {CSS}
      </style>

      <div className="aew-head">
        <div>
          <p className="aew-title">{copy?.title ?? `Earn on ${asset}`}</p>
          <p className="aew-sub">{copy?.subtitle ?? "Variable rate from Aave. Withdraw any time."}</p>
        </div>
        <span className="aew-apy">{state ? `${(state.apy * 100).toFixed(2)}%` : "—"} APY</span>
      </div>

      {!state && !loadError ? <div className="aew-skeleton" /> : null}
      {loadError && !state ? (
        <div className="aew-note aew-error">
          {loadError}{" "}
          <button type="button" className="aew-link" onClick={() => setReload((n) => n + 1)}>
            Retry
          </button>
        </div>
      ) : null}

      {state ? (
        <>
          <div className="aew-balance">
            <p className="aew-label">Earning</p>
            <p className="aew-amount">
              <span>{sym}</span>
              <span ref={balanceRef}>{splitAmount(state.deposited)[0]}</span>
              <span ref={centsRef} className="aew-cents">
                {splitAmount(state.deposited)[1]}
              </span>
            </p>
            {state.principal !== undefined ? (
              <p className="aew-earned">
                +{sym}
                <span ref={earnedRef}>{fmt(Math.max(0, state.deposited - state.principal), 6)}</span> interest so far
              </p>
            ) : null}
          </div>

          <div className="aew-tabs" role="tablist">
            {(["deposit", "withdraw"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="tab"
                aria-selected={mode === m}
                className={`aew-tab${mode === m ? " is-active" : ""}`}
                onClick={() => {
                  setMode(m);
                  setAmount("");
                  setNotice(null);
                }}
                disabled={busy}
              >
                {m === "deposit" ? "Deposit" : "Withdraw"}
              </button>
            ))}
          </div>

          <div className="aew-field">
            <span className="aew-sign">{sym}</span>
            <input
              inputMode="decimal"
              placeholder="0.00"
              value={amount}
              disabled={busy}
              onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1"))}
              aria-label={`Amount of ${asset} to ${mode}`}
            />
            <button type="button" className="aew-max" disabled={busy || max <= 0} onClick={() => setAmount(floor2(max))}>
              Max
            </button>
          </div>
          <p className="aew-hint">
            {mode === "deposit" ? `Available: ${sym}${fmt(state.wallet, 2)} ${asset}` : `In Earn: ${sym}${fmt(state.deposited, 2)}`}
            {yearly > 0 ? <span className="aew-proj"> · ≈ {sym}{fmt(yearly, 2)}/year at today&apos;s rate</span> : null}
          </p>

          <button type="button" className="aew-cta" disabled={!valid || busy} onClick={submit}>
            {busy ? <span className="aew-spin" /> : null}
            {busy ? "Confirming…" : mode === "deposit" ? (copy?.cta ?? "Start earning") : "Withdraw"}
          </button>

          {progress.length ? (
            <ol className="aew-steps">
              {progress.map((p, i) => (
                <li
                  key={p.step}
                  className={p.status === "done" ? "is-done" : i === progress.findIndex((x) => x.status !== "done") ? "is-active" : ""}
                >
                  <span className="aew-dot">{p.status === "done" ? "✓" : ""}</span>
                  {STEP_LABEL[p.step](asset)}
                  {p.txHash ? <code>{p.txHash.slice(0, 10)}…</code> : null}
                </li>
              ))}
            </ol>
          ) : null}

          {notice ? <p className={`aew-note ${notice.kind === "error" ? "aew-error" : "aew-ok"}`}>{notice.text}</p> : null}
        </>
      ) : null}

      <details className="aew-more">
        <summary>
          <span>Powered by Aave</span>
          <span>How it works</span>
        </summary>
        <p>
          Your {asset} is supplied to the Aave protocol on Base, where borrowers pay interest to use it. The rate is variable and set by
          supply and demand. You can withdraw any time while the market has available liquidity. Smart contract and stablecoin risks apply.
        </p>
      </details>
    </div>
  );
}

const STEP_LABEL: Record<EarnStep, (asset: string) => string> = {
  approve: (a) => `Allow Aave to use your ${a}`,
  supply: () => "Supply to Aave",
  withdraw: () => "Withdraw from Aave",
};

function currencySign(asset: string) {
  return asset.startsWith("EUR") ? "€" : "$";
}

function fmt(n: number, decimals: number) {
  return n.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

function floor2(n: number) {
  return (Math.floor(n * 100) / 100).toFixed(2);
}

/** "1,234.56" and "7890" so the fast-moving digits can be styled smaller. */
function splitAmount(n: number): [string, string] {
  const s = fmt(n, 6);
  return [s.slice(0, -4), s.slice(-4)];
}

function luminance(hex: string) {
  const m = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function cssVars(theme?: EarnTheme): CSSProperties {
  const dark = (theme?.mode ?? "dark") === "dark";
  const accent = /^#[0-9a-f]{6}$/i.test(theme?.accent ?? "") ? theme!.accent! : "#9896ff";
  return {
    "--aew-accent": accent,
    "--aew-on-accent": luminance(accent) > 0.45 ? "#0b0c10" : "#ffffff",
    "--aew-bg": dark ? "#111318" : "#ffffff",
    "--aew-fg": dark ? "#f3f4f7" : "#14161c",
    "--aew-muted": dark ? "#9097a6" : "#646b7a",
    "--aew-line": dark ? "rgba(255,255,255,0.09)" : "rgba(10,12,20,0.1)",
    "--aew-field": dark ? "rgba(255,255,255,0.04)" : "#f5f6f8",
    "--aew-radius": `${theme?.radius ?? 16}px`,
    "--aew-font": theme?.font ?? "inherit",
  } as CSSProperties;
}

const CSS = `
.aew{box-sizing:border-box;width:100%;max-width:400px;background:var(--aew-bg);color:var(--aew-fg);border:1px solid var(--aew-line);border-radius:var(--aew-radius);padding:18px;font-family:var(--aew-font);font-size:14px;line-height:1.4;text-align:left}
.aew *{box-sizing:border-box}
.aew p{margin:0}
.aew-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}
.aew-title{font-weight:600;font-size:16px;letter-spacing:-0.01em}
.aew-sub{color:var(--aew-muted);font-size:12.5px;margin-top:3px!important}
.aew-apy{flex-shrink:0;font-weight:600;font-size:12px;padding:4px 9px;border-radius:999px;color:var(--aew-accent);background:color-mix(in srgb,var(--aew-accent) 14%,transparent);font-variant-numeric:tabular-nums}
.aew-skeleton{height:150px;margin-top:16px;border-radius:calc(var(--aew-radius) - 6px);background:var(--aew-field)}
.aew-balance{margin-top:16px;padding:14px;border-radius:calc(var(--aew-radius) - 6px);background:var(--aew-field)}
.aew-label{font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--aew-muted)}
.aew-amount{font-size:28px;font-weight:600;letter-spacing:-0.02em;margin-top:4px!important;font-variant-numeric:tabular-nums}
.aew-cents{font-size:15px;color:var(--aew-muted);font-weight:500}
.aew-earned{font-size:12.5px;color:var(--aew-accent);margin-top:2px!important;font-variant-numeric:tabular-nums}
.aew-tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:14px;padding:4px;border-radius:calc(var(--aew-radius) - 6px);background:var(--aew-field)}
.aew-tab{all:unset;cursor:pointer;text-align:center;padding:7px 0;border-radius:calc(var(--aew-radius) - 9px);font-size:13px;color:var(--aew-muted);transition:background .15s,color .15s}
.aew-tab.is-active{background:var(--aew-bg);color:var(--aew-fg);box-shadow:0 1px 2px rgba(0,0,0,.15)}
.aew-tab:disabled{cursor:not-allowed}
.aew-field{display:flex;align-items:center;gap:6px;margin-top:12px;padding:0 10px 0 12px;height:48px;border:1px solid var(--aew-line);border-radius:calc(var(--aew-radius) - 6px);background:var(--aew-field)}
.aew-field:focus-within{border-color:var(--aew-accent)}
.aew-sign{color:var(--aew-muted);font-size:18px}
.aew-field input{all:unset;flex:1;min-width:0;font-size:20px;font-weight:500;font-variant-numeric:tabular-nums}
.aew-max{all:unset;cursor:pointer;font-size:11.5px;font-weight:600;padding:5px 9px;border-radius:8px;color:var(--aew-accent);background:color-mix(in srgb,var(--aew-accent) 12%,transparent)}
.aew-max:disabled{opacity:.4;cursor:not-allowed}
.aew-hint{font-size:12px;color:var(--aew-muted);margin-top:7px!important;font-variant-numeric:tabular-nums}
.aew-proj{color:var(--aew-fg)}
.aew-cta{all:unset;box-sizing:border-box;cursor:pointer;display:flex;align-items:center;justify-content:center;gap:8px;width:100%;height:46px;margin-top:14px;border-radius:calc(var(--aew-radius) - 4px);background:var(--aew-accent);color:var(--aew-on-accent);font-weight:600;font-size:14.5px;transition:opacity .15s,transform .1s}
.aew-cta:hover:not(:disabled){opacity:.92}
.aew-cta:active:not(:disabled){transform:scale(.99)}
.aew-cta:disabled{opacity:.45;cursor:not-allowed}
.aew-spin{width:14px;height:14px;border-radius:50%;border:2px solid currentColor;border-top-color:transparent;animation:aew-spin .8s linear infinite}
@keyframes aew-spin{to{transform:rotate(360deg)}}
.aew-steps{list-style:none;margin:12px 0 0;padding:0;display:grid;gap:6px;font-size:12.5px;color:var(--aew-muted)}
.aew-steps li{display:flex;align-items:center;gap:8px}
.aew-steps li.is-done{color:var(--aew-fg)}
.aew-steps code{margin-left:auto;font-size:11px;color:var(--aew-muted)}
.aew-dot{display:grid;place-items:center;width:16px;height:16px;border-radius:50%;font-size:10px;border:1.5px solid var(--aew-line);color:var(--aew-on-accent)}
.aew-steps li.is-active{color:var(--aew-fg)}
.aew-steps li.is-active .aew-dot{border-color:var(--aew-accent);border-top-color:transparent;animation:aew-spin .8s linear infinite}
.aew-steps li.is-done .aew-dot{background:var(--aew-accent);border-color:var(--aew-accent)}
.aew-note{margin-top:12px!important;font-size:12.5px;padding:9px 11px;border-radius:10px}
.aew-ok{background:color-mix(in srgb,var(--aew-accent) 12%,transparent)}
.aew-error{color:#ff7a7a;background:rgba(255,122,122,.08)}
.aew-link{all:unset;cursor:pointer;text-decoration:underline}
.aew-more{margin-top:14px;padding-top:12px;border-top:1px solid var(--aew-line);font-size:11.5px;color:var(--aew-muted)}
.aew-more summary{display:flex;justify-content:space-between;cursor:pointer;list-style:none}
.aew-more summary::-webkit-details-marker{display:none}
.aew-more summary span:last-child{text-decoration:underline;text-underline-offset:2px}
.aew-more p{margin-top:8px!important;line-height:1.5}
@media (prefers-reduced-motion:reduce){.aew-spin,.aew-steps li .aew-dot{animation:none!important}}
`;
