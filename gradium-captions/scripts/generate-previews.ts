/**
 * Stores one spoken preview per Gradium flagship voice in public/previews/, so the voice
 * picker can play them for free. Spends real credits once (1 per character); voices that
 * already have a file are skipped, so an interrupted run can be resumed without paying twice.
 *
 *   npm run previews            # show what would be generated and what it costs
 *   npm run previews -- --yes   # generate and spend the credits
 *   npm run previews -- --yes --lang=fr
 */
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { PREVIEW_DIR, PREVIEW_TEXT } from "@/lib/previews";
import { liveCredits, liveSynthesize } from "@/lib/server/gradium/live";
import type { Lang } from "@/lib/types";
import { CATALOG } from "@/lib/voices";
import { base64ToBytes } from "@/lib/wav";

const root = path.resolve(import.meta.dirname, "..");
const outDir = path.join(root, "public", PREVIEW_DIR);
const manifestPath = path.join(root, "src", "lib", "preview-manifest.json");

const args = process.argv.slice(2);
const confirmed = args.includes("--yes");
const onlyLang = args.find((a) => a.startsWith("--lang="))?.slice("--lang=".length) as Lang | undefined;

for (const name of [".env.local", ".env"]) {
  const file = path.join(root, name);
  if (existsSync(file)) process.loadEnvFile(file);
}

const fileFor = (id: string) => path.join(outDir, `${id}.wav`);

function writeManifest() {
  const voices = existsSync(outDir)
    ? readdirSync(outDir)
        .filter((f) => f.endsWith(".wav"))
        .map((f) => f.slice(0, -4))
        .filter((id) => CATALOG.some((v) => v.id === id))
        .sort()
    : [];
  writeFileSync(manifestPath, `${JSON.stringify({ voices }, null, 2)}\n`);
  return voices.length;
}

async function main() {
  if (!process.env.GRADIUM_API_KEY?.trim()) throw new Error("GRADIUM_API_KEY is missing. Add it to .env first.");

  const todo = CATALOG.filter((v) => (!onlyLang || v.lang === onlyLang) && !existsSync(fileFor(v.id)));
  const cost = todo.reduce((n, v) => n + PREVIEW_TEXT[v.lang].length, 0);
  console.log(`${CATALOG.length} flagship voices · ${todo.length} without a stored preview · ${cost.toLocaleString()} credits to generate`);

  if (!todo.length) {
    console.log(`Manifest lists ${writeManifest()} stored previews. Nothing to do.`);
    return;
  }
  if (!confirmed) {
    console.log("Dry run. Re-run with --yes to generate them and spend the credits.");
    return;
  }

  mkdirSync(outDir, { recursive: true });
  const before = await liveCredits();
  console.log(`Gradium balance before: ${before.remaining.toLocaleString()} / ${before.allocated.toLocaleString()}`);

  let spent = 0;
  const failed: string[] = [];
  for (const [i, voice] of todo.entries()) {
    const text = PREVIEW_TEXT[voice.lang];
    const label = `[${i + 1}/${todo.length}] ${voice.lang} ${voice.name}`;
    try {
      const result = await liveSynthesize(text, voice.id);
      writeFileSync(fileFor(voice.id), base64ToBytes(result.audio));
      spent += result.credits;
      console.log(`${label}: ${result.duration}s · ${result.credits} credits`);
    } catch (err) {
      failed.push(voice.name);
      console.error(`${label}: failed · ${err instanceof Error ? err.message : err}`);
    }
  }

  const count = writeManifest();
  const after = await liveCredits();
  console.log(`\nStored ${todo.length - failed.length} previews (${count} in total). Estimated ${spent.toLocaleString()} credits.`);
  console.log(
    `Gradium balance after: ${after.remaining.toLocaleString()} (charged ${(before.remaining - after.remaining).toLocaleString()}, billing can lag a few seconds)`,
  );
  if (failed.length) {
    console.log(`Failed: ${failed.join(", ")}. Run the command again to retry only those.`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
