// Runs Saifuro's 138 published verdict test vectors against src/kit/verdict. Usage: npm run vectors
import { readFileSync } from "node:fs";
import { runVectors, VECTORS_URL, type VectorFile } from "../src/kit/verdict/vectors.ts";

const local = new URL("../data/verdict-test-vectors.json", import.meta.url);
let file: VectorFile;
try {
  const res = await fetch(VECTORS_URL, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(String(res.status));
  file = (await res.json()) as VectorFile;
  console.log(`vectors: ${VECTORS_URL}`);
} catch {
  file = JSON.parse(readFileSync(local, "utf8")) as VectorFile;
  console.log("vectors: data/verdict-test-vectors.json (offline copy)");
}

const results = await runVectors(file);
const failed = results.filter((r) => !r.matches);
const otherStep = results.filter((r) => r.matches && !r.sameStep);

for (const r of failed) {
  console.log(`FAIL ${r.id}: expected ${r.expected.valid ? "accept" : `reject@${r.expected.step}`}, got ${r.got.valid ? "accept" : `reject@${r.got.step}`} (${r.got.reason})`);
}
for (const r of otherStep) console.log(`step ${r.id}: expected ${r.expected.step}, reported ${r.got.step} (${r.got.reason})`);

const accepted = results.filter((r) => r.expected.valid).length;
console.log(`\n${results.length - failed.length}/${results.length} match (${accepted} accept, ${results.length - accepted} reject); ${results.length - failed.length - otherStep.length} on the expected step`);
process.exit(failed.length ? 1 : 0);
