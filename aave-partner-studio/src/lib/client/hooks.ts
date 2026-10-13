"use client";

import { useEffect, useSyncExternalStore } from "react";
import type { MarketsSnapshot, ServiceStatus } from "@/lib/types";

type Snapshot<T> = { value: T | null; error: string | null };

/** A fetched value shared by every component that reads it, refreshed on an interval while anyone is subscribed. */
function resource<T>(url: string, refreshMs: number) {
  let value: T | null = null;
  let error: string | null = null;
  let inflight: Promise<void> | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();
  let snapshot: Snapshot<T> = { value, error };

  const emit = () => {
    snapshot = { value, error };
    listeners.forEach((l) => l());
  };

  const load = () => {
    inflight ??= fetch(url, { cache: "no-store" })
      .then(async (res) => {
        const body = await res.json();
        if (!res.ok) throw new Error(body.error || `Request failed (${res.status})`);
        value = body as T;
        error = null;
      })
      .catch((err: unknown) => {
        error = err instanceof Error ? err.message : "Request failed";
      })
      .finally(() => {
        inflight = null;
        emit();
      });
    return inflight;
  };

  return {
    subscribe(listener: () => void) {
      listeners.add(listener);
      if (listeners.size === 1) {
        if (!value) void load();
        if (refreshMs) timer = setInterval(load, refreshMs);
      }
      return () => {
        listeners.delete(listener);
        if (!listeners.size) clearInterval(timer);
      };
    },
    get: () => snapshot,
    reload: load,
  };
}

const statusResource = resource<ServiceStatus>("/api/status", 0);
const marketsResource = resource<MarketsSnapshot>("/api/markets", 60_000);
const EMPTY = { value: null, error: null } as const;

export function useStatus(): ServiceStatus | null {
  return useSyncExternalStore<Snapshot<ServiceStatus>>(statusResource.subscribe, statusResource.get, () => EMPTY).value;
}

export function useMarkets() {
  const { value, error } = useSyncExternalStore<Snapshot<MarketsSnapshot>>(marketsResource.subscribe, marketsResource.get, () => EMPTY);
  return { snapshot: value, error, reload: marketsResource.reload };
}

export function useMarket(symbol: string) {
  const { snapshot, error } = useMarkets();
  return { market: snapshot?.markets.find((m) => m.symbol === symbol) ?? null, snapshot, error };
}

/** Runs `tick` on every animation frame while mounted. */
export function useAnimationFrame(tick: (now: number) => void, active = true) {
  useEffect(() => {
    if (!active) return;
    let id = requestAnimationFrame(function loop(now) {
      tick(now);
      id = requestAnimationFrame(loop);
    });
    return () => cancelAnimationFrame(id);
  }, [tick, active]);
}
