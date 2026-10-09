"use client";

/**
 * The visitor's own Gradium API key. Kept in this browser only: localStorage when they ask to be
 * remembered, otherwise sessionStorage (gone when the tab closes). Sent to this app's server on
 * each API call, which uses it for that request and never stores it.
 */
const STORAGE_KEY = "gradium-captions:api-key";

/** Fired when the key is saved or removed. */
export const KEY_CHANGED_EVENT = "gradium-captions:key-changed";
/** Fired when the server says a call needs a key, so the key dialog can open. */
export const NEEDS_KEY_EVENT = "gradium-captions:needs-key";

export function getApiKey(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return sessionStorage.getItem(STORAGE_KEY) || localStorage.getItem(STORAGE_KEY) || null;
  } catch {
    return null;
  }
}

export function isKeyRemembered(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return !!localStorage.getItem(STORAGE_KEY);
  } catch {
    return false;
  }
}

export function setApiKey(key: string, remember: boolean) {
  clearStored();
  (remember ? localStorage : sessionStorage).setItem(STORAGE_KEY, key.trim());
  window.dispatchEvent(new Event(KEY_CHANGED_EVENT));
}

export function clearApiKey() {
  clearStored();
  window.dispatchEvent(new Event(KEY_CHANGED_EVENT));
}

function clearStored() {
  localStorage.removeItem(STORAGE_KEY);
  sessionStorage.removeItem(STORAGE_KEY);
}

export function maskKey(key: string): string {
  return `••••${key.slice(-4)}`;
}

/** A short, stable id for the key (not a secret hash), used to keep each key's demo budget apart. */
export function keyId(key: string | null): string {
  if (!key) return "none";
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i += 1) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

export function subscribeToKey(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => e.key === STORAGE_KEY && onChange();
  window.addEventListener(KEY_CHANGED_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(KEY_CHANGED_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}
