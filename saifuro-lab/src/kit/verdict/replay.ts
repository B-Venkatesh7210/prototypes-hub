export type ConsumeResult = "ok" | "replayed_nonce" | "replayed_supersedes";

/**
 * Step 12. `consume` checks and records in one atomic operation: with Redis that is SET NX; in one
 * process it is a synchronous check-and-set. Every instance that can accept the same verdict must share
 * the store.
 */
export interface ReplayStore {
  consume(entry: { iss: string; nonce: string; supersedes?: string; keepUntil: number }): Promise<ConsumeResult>;
}

export function memoryReplayStore(seed?: { nonces?: [string, string][]; supersedes?: [string, string][] }): ReplayStore {
  const nonces = new Map<string, number>();
  const supersedes = new Map<string, number>();
  for (const [iss, n] of seed?.nonces ?? []) nonces.set(`${iss}\u0000${n}`, Infinity);
  for (const [iss, s] of seed?.supersedes ?? []) supersedes.set(`${iss}\u0000${s}`, Infinity);

  const sweep = (now: number) => {
    for (const [k, until] of nonces) if (until < now) nonces.delete(k);
    for (const [k, until] of supersedes) if (until < now) supersedes.delete(k);
  };

  return {
    async consume({ iss, nonce, supersedes: sup, keepUntil }) {
      sweep(Date.now() / 1000);
      const nk = `${iss}\u0000${nonce}`;
      if (nonces.has(nk)) return "replayed_nonce";
      const sk = sup === undefined ? null : `${iss}\u0000${sup}`;
      if (sk && supersedes.has(sk)) return "replayed_supersedes";
      nonces.set(nk, keepUntil);
      if (sk) supersedes.set(sk, keepUntil);
      return "ok";
    },
  };
}
