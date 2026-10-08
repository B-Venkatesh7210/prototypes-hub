import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { Lang } from "@/lib/types";

/**
 * Server-side storage for saved voices: the preview audio of each clone or kept design (always
 * spoken in that voice), the recording each clone was made from, and in mock mode the voice list itself (live mode lists voices from the Gradium account).
 * Lives in `.data/voices/`, which is git-ignored. A host with an ephemeral disk loses the
 * previews on redeploy; they can then be regenerated from the voice picker.
 */
const DIR = path.join(process.cwd(), ".data", "voices");
const MOCK_INDEX = path.join(DIR, "mock-voices.json");

export type StoredVoice = { id: string; name: string; lang: Lang | null; kind: "clone" | "design"; createdAt: number };

const ID = /^[\w-]{4,80}$/;

export function validVoiceId(id: string | null): id is string {
  return !!id && ID.test(id);
}

function samplePath(id: string) {
  if (!validVoiceId(id)) throw new Error("Invalid voice id");
  return path.join(DIR, `${id}.wav`);
}

export function hasSample(id: string): boolean {
  return validVoiceId(id) && existsSync(samplePath(id));
}

export function readSample(id: string): Buffer | null {
  return hasSample(id) ? readFileSync(samplePath(id)) : null;
}

export function saveSample(id: string, wav: Uint8Array) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(samplePath(id), wav);
}

/** The recording a clone was made from. Kept for reference, never served as its preview. */
export function saveSource(id: string, wav: Uint8Array) {
  if (!validVoiceId(id)) throw new Error("Invalid voice id");
  mkdirSync(DIR, { recursive: true });
  writeFileSync(path.join(DIR, `${id}.source.wav`), wav);
}

export function listMockVoices(): StoredVoice[] {
  if (!existsSync(MOCK_INDEX)) return [];
  try {
    return JSON.parse(readFileSync(MOCK_INDEX, "utf8")) as StoredVoice[];
  } catch {
    return [];
  }
}

export function addMockVoice(voice: Omit<StoredVoice, "createdAt">) {
  const voices = listMockVoices().filter((v) => v.id !== voice.id);
  voices.push({ ...voice, createdAt: Date.now() });
  mkdirSync(DIR, { recursive: true });
  writeFileSync(MOCK_INDEX, `${JSON.stringify(voices, null, 2)}\n`);
}
