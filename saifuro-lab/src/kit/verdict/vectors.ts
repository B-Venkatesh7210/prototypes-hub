/** Runs Saifuro's published verdict test vectors against `verifyVerdict`. */
import { staticKeySource, type JwkSet } from "./keys.ts";
import { memoryReplayStore } from "./replay.ts";
import { verifyVerdict, type VerifyResult } from "./verify.ts";

export const VECTORS_URL = "https://docs.saifuro.com/verdict-test-vectors.json";

type Vector = {
  id: string;
  description: string;
  token: string;
  issuers: Record<string, string>;
  now: number;
  mode: "settle" | "record";
  payment?: { amount: string; currency: string; recipient: string };
  agreedMandates?: string[];
  seenNonces?: [string, string][];
  seenSupersedes?: [string, string][];
  testingOnly?: boolean;
  receivedAt?: number | null;
  distinguishTest?: boolean;
  refetchWouldReturn?: string;
  audience: string | null;
  expected: { valid: boolean; step: number | null; note?: string };
};

export type VectorFile = { title: string; keySets: Record<string, JwkSet>; vectors: Vector[] };

export type VectorOutcome = {
  id: string;
  description: string;
  mode: Vector["mode"];
  expected: Vector["expected"];
  got: { valid: boolean; step: number | null; reason: string | null };
  /** `valid` must match; `step` should. */
  matches: boolean;
  sameStep: boolean;
};

export async function runVectors(file: VectorFile): Promise<VectorOutcome[]> {
  const out: VectorOutcome[] = [];
  for (const v of file.vectors) {
    const issuers = Object.fromEntries(
      Object.entries(v.issuers).map(([iss, name]) => {
        const set = file.keySets[name];
        // Settle mode refetches once on an unknown kid and gets the same set back; record mode must never refetch.
        const refetch = v.mode === "settle" ? set : v.refetchWouldReturn ? file.keySets[v.refetchWouldReturn] : undefined;
        return [iss, staticKeySource(set, refetch)];
      }),
    );
    let res: VerifyResult;
    try {
      res = await verifyVerdict(v.token, {
        issuers,
        mode: v.mode,
        now: v.now,
        clockSkewSeconds: 60,
        audience: v.audience,
        payment: v.payment,
        agreedMandates: v.agreedMandates,
        testingOnly: v.testingOnly,
        replay: memoryReplayStore({ nonces: v.seenNonces, supersedes: v.seenSupersedes }),
        receivedAt: v.receivedAt,
        distinguishTest: v.distinguishTest,
      });
    } catch (e) {
      res = { valid: false, step: null, reason: `threw: ${(e as Error).message}`, checks: [] };
    }
    out.push({
      id: v.id,
      description: v.description,
      mode: v.mode,
      expected: v.expected,
      got: { valid: res.valid, step: res.step, reason: res.reason },
      matches: res.valid === v.expected.valid,
      sameStep: res.step === v.expected.step,
    });
  }
  return out;
}
