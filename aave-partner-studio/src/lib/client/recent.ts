"use client";

import type { Blueprint } from "@/lib/types";

export type RecentItem = { id: string; name: string; domain?: string; color: string; logo?: string; category: string };

const KEY = "partner-studio:recent";
const EVENT = "partner-studio:recent";
const EMPTY: RecentItem[] = [];
let cache: { raw: string | null; items: RecentItem[] } = { raw: null, items: EMPTY };

export function readRecent(): RecentItem[] {
  if (typeof window === "undefined") return EMPTY;
  const raw = localStorage.getItem(KEY);
  if (raw === cache.raw) return cache.items;
  try {
    cache = { raw, items: raw ? (JSON.parse(raw) as RecentItem[]) : EMPTY };
  } catch {
    cache = { raw, items: EMPTY };
  }
  return cache.items;
}

export function rememberBlueprint(bp: Blueprint) {
  const item: RecentItem = {
    id: bp.id,
    name: bp.partner.name,
    domain: bp.partner.domain,
    color: bp.partner.brand.primary,
    logo: bp.partner.brand.logo,
    category: bp.partner.category,
  };
  const next = [item, ...readRecent().filter((r) => r.id !== bp.id)].slice(0, 8);
  localStorage.setItem(KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(EVENT));
}

export function subscribeRecent(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVENT, cb);
    window.removeEventListener("storage", cb);
  };
}
