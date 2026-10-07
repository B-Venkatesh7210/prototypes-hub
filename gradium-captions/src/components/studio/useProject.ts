"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { db } from "@/lib/client/db";
import type { Project, Track } from "@/lib/types";

type State = { project: Project | null; past: Project[]; future: Project[] };
type Mode =
  /** Undoable edit (words, track text). */
  | "edit"
  /** Not undoable but keeps history (style tweaks, selection-like changes). */
  | "patch"
  /** Swaps audio blobs, so earlier snapshots would point at deleted audio. */
  | "replace";

const HISTORY = 80;

/** Undo only rewinds transcript edits; presentation settings stay as they are. */
function keepPresentation(snapshot: Project, current: Project): Project {
  return { ...snapshot, style: current.style, activeTrackId: current.activeTrackId, title: current.title };
}

export function useProject(id: string) {
  const [state, setState] = useState<State>({ project: null, past: [], future: [] });
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(true);
  const loaded = useRef(false);

  useEffect(() => {
    let cancelled = false;
    db.getProject(id)
      .then((project) => {
        if (cancelled) return;
        setState({ project: project ?? null, past: [], future: [] });
        loaded.current = true;
      })
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    if (!loaded.current || !state.project) return;
    setSaved(false);
    const project = state.project;
    const timer = setTimeout(() => {
      void db.saveProject({ ...project, updatedAt: Date.now() }).then(() => setSaved(true));
    }, 500);
    return () => clearTimeout(timer);
  }, [state.project]);

  const update = useCallback((fn: (p: Project) => Project, mode: Mode = "edit") => {
    setState((s) => {
      if (!s.project) return s;
      const next = fn(s.project);
      if (next === s.project) return s;
      if (mode === "patch") return { ...s, project: next };
      if (mode === "replace") return { project: next, past: [], future: [] };
      return { project: next, past: [...s.past, s.project].slice(-HISTORY), future: [] };
    });
  }, []);

  const updateTrack = useCallback(
    (trackId: string, fn: (t: Track) => Track, mode: Mode = "edit") =>
      update((p) => {
        const tracks = p.tracks.map((t) => (t.id === trackId ? fn(t) : t));
        return tracks.every((t, i) => t === p.tracks[i]) ? p : { ...p, tracks };
      }, mode),
    [update],
  );

  const undo = useCallback(() => {
    setState((s) => {
      const prev = s.past[s.past.length - 1];
      if (!prev || !s.project) return s;
      return { project: keepPresentation(prev, s.project), past: s.past.slice(0, -1), future: [s.project, ...s.future] };
    });
  }, []);

  const redo = useCallback(() => {
    setState((s) => {
      const [next, ...rest] = s.future;
      if (!next || !s.project) return s;
      return { project: keepPresentation(next, s.project), past: [...s.past, s.project], future: rest };
    });
  }, []);

  return {
    project: state.project,
    loading,
    saved,
    canUndo: state.past.length > 0,
    canRedo: state.future.length > 0,
    update,
    updateTrack,
    undo,
    redo,
  };
}
