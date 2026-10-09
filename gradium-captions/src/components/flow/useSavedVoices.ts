"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/client/api";
import { getApiKey, subscribeToKey } from "@/lib/client/apiKey";
import { LIMITS } from "@/lib/limits";
import type { SavedVoice } from "@/lib/types";
import { useStatus } from "@/components/shell/StatusProvider";

/** Clones and kept designs on the Gradium account (or the mock list in mock mode). */
export function useSavedVoices() {
  const { status } = useStatus();
  const key = useSyncExternalStore(subscribeToKey, getApiKey, () => null);
  const canLoad = status?.mode === "mock" || (status?.mode === "live" && !!key);
  const [voices, setVoices] = useState<SavedVoice[] | null>(null);
  const [error, setError] = useState("");

  const apply = useCallback((load: Promise<{ custom: SavedVoice[] }>, isCurrent: () => boolean = () => true) => {
    return load
      .then((res) => {
        if (!isCurrent()) return;
        setVoices(res.custom);
        setError("");
      })
      .catch((err: unknown) => {
        if (!isCurrent()) return;
        setVoices((v) => v ?? []);
        setError(err instanceof Error ? err.message : "Could not load your voices");
      });
  }, []);

  useEffect(() => {
    if (!canLoad) return;
    let current = true;
    void apply(api.customVoices(), () => current);
    return () => {
      current = false;
    };
  }, [apply, canLoad, key]);

  const reload = useCallback(() => apply(api.customVoices()), [apply]);
  const clones = (canLoad ? voices : [])?.filter((v) => v.kind === "clone") ?? [];

  return {
    voices: canLoad ? voices : [],
    error,
    reload,
    clones,
    /** No more clones can be made on this account. */
    clonesFull: clones.length >= LIMITS.clonesPerAccount,
  };
}

export type SavedVoices = ReturnType<typeof useSavedVoices>;
