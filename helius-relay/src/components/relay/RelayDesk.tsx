"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MAX_WATCH, MODE_COPY, PRESETS } from "@/lib/presets";
import { isPubkey, shorten } from "@/lib/format";
import type {
  ConnectionState,
  DeskMode,
  Dossier,
  ParsedTx,
  SlotTick,
  WatchItem,
  WireEvent,
} from "@/lib/types";
import { Watchlist } from "./Watchlist";
import { LiveWire } from "./LiveWire";
import { DetailPane } from "./DetailPane";

type Selection =
  | { kind: "event"; id: string }
  | { kind: "address"; address: string }
  | null;

const PARSE_GAP_MS = 550;
const MAX_EVENTS = 80;
const MAX_PARSE_QUEUE = 24;

export function RelayDesk() {
  const [mode, setMode] = useState<DeskMode>("treasury");
  const [lists, setLists] = useState<Record<DeskMode, WatchItem[]>>({
    treasury: PRESETS.treasury,
    protocol: PRESETS.protocol,
  });
  const [connection, setConnection] = useState<ConnectionState>("connecting");
  const [slot, setSlot] = useState<SlotTick | null>(null);
  const [events, setEvents] = useState<WireEvent[]>([]);
  const [lamports, setLamports] = useState<Record<string, number>>({});
  const [dropped, setDropped] = useState(0);
  const [eps, setEps] = useState(0);
  const [selection, setSelection] = useState<Selection>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [dossierState, setDossierState] = useState<"idle" | "loading" | "error">("idle");

  const watchlist = lists[mode];
  const watchKey = watchlist.map((item) => item.address).join(",");
  const parseQueue = useRef<string[]>([]);
  const parsing = useRef(false);
  const seenSigs = useRef(new Set<string>());
  const eventTimes = useRef<number[]>([]);

  const selectedEvent = useMemo(() => {
    if (selection?.kind !== "event") return null;
    return events.find((event) => event.id === selection.id) ?? null;
  }, [events, selection]);

  const drainParse = useCallback(async () => {
    if (parsing.current) return;
    parsing.current = true;
    while (parseQueue.current.length) {
      const signature = parseQueue.current.shift();
      if (!signature) break;
      try {
        const res = await fetch("/api/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ signatures: [signature] }),
        });
        const data = (await res.json()) as ParsedTx[] | { error?: string };
        const parsed = Array.isArray(data) ? data[0] : null;
        setEvents((current) =>
          current.map((event) =>
            event.signature === signature
              ? {
                  ...event,
                  parse: parsed ?? event.parse,
                  parseState: parsed ? "ready" : "error",
                }
              : event,
          ),
        );
      } catch {
        setEvents((current) =>
          current.map((event) =>
            event.signature === signature ? { ...event, parseState: "error" } : event,
          ),
        );
      }
      await new Promise((resolve) => setTimeout(resolve, PARSE_GAP_MS));
    }
    parsing.current = false;
  }, []);

  useEffect(() => {
    setConnection("connecting");
    setEvents([]);
    setDropped(0);
    setSelection(null);
    setDossier(null);
    seenSigs.current.clear();
    parseQueue.current = [];

    const source = new EventSource(`/api/stream?addresses=${encodeURIComponent(watchKey)}`);

    source.onmessage = (message) => {
      const payload = JSON.parse(message.data) as Record<string, unknown>;
      if (payload.type === "status") {
        setConnection((payload.state as ConnectionState) ?? "live");
        return;
      }
      if (payload.type === "slot" && typeof payload.slot === "number") {
        setSlot({ slot: payload.slot, parent: payload.parent as number, root: payload.root as number, at: Date.now() });
        return;
      }
      if (payload.type === "account" && typeof payload.watched === "string" && typeof payload.lamports === "number") {
        setLamports((current) => ({ ...current, [payload.watched as string]: payload.lamports as number }));
        return;
      }
      if (payload.type === "log" && typeof payload.signature === "string") {
        const signature = payload.signature;
        if (seenSigs.current.has(signature)) return;
        seenSigs.current.add(signature);

        const now = Date.now();
        eventTimes.current = eventTimes.current.filter((time) => now - time < 1000);
        eventTimes.current.push(now);
        setEps(eventTimes.current.length);

        const failed = payload.err != null;
        const shouldParse = failed || parseQueue.current.length < MAX_PARSE_QUEUE;

        const event: WireEvent = {
          id: `${signature}:${now}`,
          signature,
          slot: typeof payload.slot === "number" ? payload.slot : 0,
          err: payload.err,
          logs: Array.isArray(payload.logs) ? (payload.logs as string[]) : [],
          watched: typeof payload.watched === "string" ? payload.watched : undefined,
          receivedAt: now,
          parseState: shouldParse ? "pending" : "skipped",
        };

        setEvents((current) => [event, ...current].slice(0, MAX_EVENTS));

        if (shouldParse) {
          parseQueue.current.push(signature);
          void drainParse();
        } else {
          setDropped((count) => count + 1);
        }
      }
    };

    source.onerror = () => setConnection("error");

    return () => {
      source.close();
    };
  }, [drainParse, watchKey]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelection(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (selection?.kind !== "address") {
      setDossier(null);
      setDossierState("idle");
      return;
    }
    const address = selection.address;
    let cancelled = false;
    setDossierState("loading");
    fetch(`/api/dossier/${address}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("dossier failed");
        return res.json() as Promise<Dossier>;
      })
      .then((data) => {
        if (!cancelled) {
          setDossier(data);
          setDossierState("idle");
        }
      })
      .catch(() => {
        if (!cancelled) setDossierState("error");
      });
    return () => {
      cancelled = true;
    };
  }, [selection]);

  const addWatch = (raw: string, label: string) => {
    const address = raw.trim();
    if (!isPubkey(address)) return "Not a valid Solana address.";
    if (watchlist.some((item) => item.address === address)) return "Already on the desk.";
    if (watchlist.length >= MAX_WATCH) return `Free plan: max ${MAX_WATCH} addresses.`;
    setLists((current) => ({
      ...current,
      [mode]: [
        ...current[mode],
        { address, label: label.trim() || shorten(address), role: "Custom" },
      ],
    }));
    return null;
  };

  const removeWatch = (address: string) => {
    setLists((current) => ({
      ...current,
      [mode]: current[mode].filter((item) => item.address !== address),
    }));
  };

  const copy = MODE_COPY[mode];
  const failCount = events.filter((event) => event.err != null).length;

  return (
    <div className="desk-shell">
      <header className="flex items-center justify-between gap-6 px-5">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--faint)]">Helius</div>
          <div className="text-[21px] font-semibold leading-none tracking-[-0.04em]">Relay</div>
        </div>

        <div className="flex rounded-full border border-[var(--line-2)] p-[3px] bg-[var(--panel)]">
          {(["treasury", "protocol"] as DeskMode[]).map((value) => {
            const active = mode === value;
            return (
              <button
                key={value}
                onClick={() => setMode(value)}
                className={`px-3.5 py-1.5 rounded-full text-[12px] font-medium capitalize transition ${
                  active
                    ? value === "treasury"
                      ? "bg-[var(--signal-dim)] text-[var(--signal)]"
                      : "bg-[var(--protocol-dim)] text-[var(--protocol)]"
                    : "text-[var(--mute)] hover:text-[var(--ink)]"
                }`}
              >
                {value}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-5 text-[12px] tabular-nums">
          <StatusPill state={connection} />
          <div className="text-right hidden md:block">
            <div className="text-[var(--faint)] uppercase tracking-[0.16em] text-[10px]">Slot</div>
            <div className="mono text-[13px]">{slot ? slot.slot.toLocaleString() : "—"}</div>
          </div>
          <div className="text-right hidden md:block">
            <div className="text-[var(--faint)] uppercase tracking-[0.16em] text-[10px]">Wire</div>
            <div className="mono text-[13px]">
              {eps}/s{dropped ? ` · ${dropped} sampled` : ""}
            </div>
          </div>
        </div>
      </header>

      <div className="desk-grid">
        <Watchlist
          mode={mode}
          items={watchlist}
          lamports={lamports}
          onAdd={addWatch}
          onRemove={removeWatch}
          onSelect={(address) => setSelection({ kind: "address", address })}
          selectedAddress={selection?.kind === "address" ? selection.address : selectedEvent?.watched}
        />
        <LiveWire
          mode={mode}
          connection={connection}
          events={events}
          failCount={failCount}
          selectedId={selection?.kind === "event" ? selection.id : null}
          onSelect={(id) => setSelection({ kind: "event", id })}
          onAddress={(address) => setSelection({ kind: "address", address })}
        />
        <DetailPane
          mode={mode}
          event={selection?.kind === "event" ? selectedEvent : null}
          dossier={dossier}
          dossierState={dossierState}
          selectedAddress={selection?.kind === "address" ? selection.address : undefined}
          onAddress={(address) => setSelection({ kind: "address", address })}
        />
      </div>

      <footer className="flex items-center justify-between px-5 text-[10px] uppercase tracking-[0.18em] text-[var(--faint)]">
        <span>LaserStream WSS · logsSubscribe · accountSubscribe · Wallet API · DAS · Enhanced parse</span>
        <span>Free plan · watch the accounts that page you</span>
      </footer>
    </div>
  );
}

function StatusPill({ state }: { state: ConnectionState }) {
  const live = state === "live";
  const label =
    state === "live" ? "Live" : state === "connecting" ? "Connecting" : state === "error" ? "Error" : "Idle";
  return (
    <div className="flex items-center gap-2">
      {live ? <span className="pulse-dot" /> : <span className="h-[7px] w-[7px] rounded-full bg-[var(--faint)]" />}
      <span className={live ? "text-[var(--signal)]" : "text-[var(--mute)]"}>{label}</span>
    </div>
  );
}

