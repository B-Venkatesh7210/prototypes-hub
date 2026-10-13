import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Blueprint } from "@/lib/types";

const DIR = join(process.cwd(), ".data", "blueprints");
const MAX_AGE_MS = 7 * 24 * 3600 * 1000;

export function validId(id: string | null | undefined): id is string {
  return !!id && /^[a-z0-9-]{3,64}$/.test(id);
}

export function readBlueprint(id: string): Blueprint | null {
  if (!validId(id)) return null;
  try {
    return JSON.parse(readFileSync(join(DIR, `${id}.json`), "utf8")) as Blueprint;
  } catch {
    return null;
  }
}

/** A cached blueprint younger than a week, so repeat lookups of the same company don't spend AI quota. */
export function freshBlueprint(id: string): Blueprint | null {
  const bp = readBlueprint(id);
  return bp && Date.now() - bp.createdAt < MAX_AGE_MS ? bp : null;
}

export function saveBlueprint(bp: Blueprint) {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(join(DIR, `${bp.id}.json`), JSON.stringify(bp, null, 2));
}
