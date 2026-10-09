"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { api } from "@/lib/client/api";
import { clearApiKey, getApiKey, isKeyRemembered, maskKey, NEEDS_KEY_EVENT, setApiKey, subscribeToKey } from "@/lib/client/apiKey";
import { ArrowRight, Check, X } from "@/components/ui/icons";
import { Button, buttonClass, ErrorNote, Label, Spinner } from "@/components/ui/primitives";
import { useStatus } from "./StatusProvider";

const GET_KEY_URL = "https://studio.gradium.ai/";

/** Header button: "Add API key" until a key is saved, then the masked key. Opens the key dialog. */
export function ApiKeyButton() {
  const key = useSyncExternalStore(subscribeToKey, getApiKey, () => null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onNeedsKey = () => setOpen(true);
    window.addEventListener(NEEDS_KEY_EVENT, onNeedsKey);
    return () => window.removeEventListener(NEEDS_KEY_EVENT, onNeedsKey);
  }, []);

  return (
    <>
      {key ? (
        <button type="button" onClick={() => setOpen(true)} className={buttonClass("secondary", "md", "gap-2")}>
          <span className="h-1.5 w-1.5 rounded-full bg-green" />
          <span className="font-code text-xs">API key {maskKey(key)}</span>
        </button>
      ) : (
        <button type="button" onClick={() => setOpen(true)} className={buttonClass("primary", "md")}>
          Add API key
        </button>
      )}
      {open ? createPortal(<ApiKeyModal current={key} onClose={() => setOpen(false)} />, document.body) : null}
    </>
  );
}

function ApiKeyModal({ current, onClose }: { current: string | null; onClose: () => void }) {
  const { isMock } = useStatus();
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [remember, setRemember] = useState(() => (current ? isKeyRemembered() : true));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const save = async () => {
    const key = value.trim();
    if (!key) return;
    setBusy(true);
    setError("");
    try {
      await api.checkKey(key);
      setApiKey(key, remember);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not check that key.");
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    clearApiKey();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Gradium API key"
        className="scroll-thin max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-surface p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-favorit text-xl text-white">{current ? "Your Gradium API key" : "Add your Gradium API key"}</h2>
            <p className="mt-1.5 font-plex text-sm leading-snug text-lightgray">
              Captions runs on your own Gradium account, so every call uses your credits. The daily demo limits still apply.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="cursor-pointer text-lightgray hover:text-bright">
            <X size={16} />
          </button>
        </div>

        <form
          className="mt-5 flex flex-col gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            void save();
          }}
        >
          <div>
            <Label hint={current ? `Saved: ${maskKey(current)}` : undefined}>{current ? "Replace key" : "API key"}</Label>
            <div className="relative">
              <input
                ref={inputRef}
                className="field pr-16 font-code text-sm"
                type={show ? "text" : "password"}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="gd_…"
                autoComplete="off"
                spellCheck={false}
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute top-1/2 right-3 -translate-y-1/2 cursor-pointer font-plex text-xs text-lightgray hover:text-bright"
              >
                {show ? "Hide" : "Show"}
              </button>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2.5 font-plex text-xs text-lightgray">
            <input type="checkbox" className="accent-[#f2f2f2]" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
            Remember on this device (otherwise it&apos;s forgotten when you close the tab)
          </label>
          {error ? <ErrorNote>{error}</ErrorNote> : null}
          <Button type="submit" disabled={busy || !value.trim()}>
            {busy ? <Spinner /> : <Check size={14} />} {busy ? "Checking with Gradium…" : "Save key"}
          </Button>
        </form>

        <div className="mt-5 flex flex-col gap-3 border-t border-white/[0.06] pt-5">
          <p className="font-plex text-xs leading-snug text-lightgray">
            Don&apos;t have a key? Create one in Gradium Studio under API keys, then paste it above.
          </p>
          <a href={GET_KEY_URL} target="_blank" rel="noreferrer" className={buttonClass("secondary", "md", "gap-1.5")}>
            Get API key <ArrowRight size={13} />
          </a>
          {current ? (
            <Button tone="ghost" onClick={remove}>
              Remove key from this browser
            </Button>
          ) : null}
          <p className="font-plex text-[0.6875rem] leading-snug text-lightgray">
            Your key stays in this browser. It&apos;s sent only to this app&apos;s server to call Gradium, and is never stored there.
            {isMock ? " This server is in mock mode, so calls are simulated until it switches to live." : ""}
          </p>
        </div>
      </div>
    </div>
  );
}
