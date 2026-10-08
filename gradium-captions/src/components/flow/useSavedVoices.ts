"use client";

import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/client/api";
import { LIMITS } from "@/lib/limits";
import type { SavedVoice } from "@/lib/types";
import { useStatus } from "@/components/shell/StatusProvider";

/** Clones and kept designs on the Gradium account (or the mock list in mock mode). */
export function useSavedVoices() {
  const { isMock } = useStatus();
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
    let current = true;
    void apply(api.customVoices(), () => current);
    return () => {
      current = false;
    };
  }, [apply, isMock]);

  const reload = useCallback(() => apply(api.customVoices()), [apply]);
  const clones = voices?.filter((v) => v.kind === "clone") ?? [];

  return {
    voices,
    error,
    reload,
    clones,
    /** No more clones can be made on this account. */
    clonesFull: clones.length >= LIMITS.clonesPerAccount,
  };
}

export type SavedVoices = ReturnType<typeof useSavedVoices>;
