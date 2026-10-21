export type Jwk = { kty?: unknown; crv?: unknown; x?: unknown; y?: unknown; kid?: unknown; alg?: unknown; use?: unknown; [k: string]: unknown };
export type JwkSet = { keys: Jwk[] };

/**
 * Where a verifier gets one issuer's keys. `refetch` is called once when a kid is unknown and returns
 * null when its rate limit does not allow another fetch (draft §5.4).
 */
export interface KeySource {
  keys(): Promise<JwkSet>;
  refetch?(): Promise<JwkSet | null>;
}

export function staticKeySource(set: JwkSet, refetchReturns?: JwkSet): KeySource {
  return {
    keys: async () => set,
    refetch: refetchReturns ? async () => refetchReturns : undefined,
  };
}

/**
 * Fetches a JWK Set from a configured URL: cached for `maxAgeSeconds` (Saifuro serves max-age=300),
 * refetched on an unknown kid at most once per `refetchIntervalSeconds`, no redirects, bounded size and
 * time. Plain http is accepted only for localhost, for the local emulator.
 */
export function remoteKeySource(
  url: string,
  { maxAgeSeconds = 300, refetchIntervalSeconds = 30, timeoutMs = 5000, maxBytes = 64 * 1024 } = {},
): KeySource {
  const u = new URL(url);
  const local = u.hostname === "localhost" || u.hostname === "127.0.0.1";
  if (u.protocol !== "https:" && !(local && u.protocol === "http:")) throw new Error("JWK Set must be fetched over HTTPS");

  let cached: { set: JwkSet; at: number } | null = null;
  let lastRefetch = 0;

  const load = async (): Promise<JwkSet> => {
    const res = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(timeoutMs), cache: "no-store" });
    if (!res.ok) throw new Error(`JWK Set fetch failed (${res.status})`);
    const text = await res.text();
    if (text.length > maxBytes) throw new Error("JWK Set too large");
    const set = JSON.parse(text) as JwkSet;
    if (!Array.isArray(set?.keys)) throw new Error("JWK Set has no keys array");
    cached = { set, at: Date.now() };
    return set;
  };

  return {
    async keys() {
      if (cached && Date.now() - cached.at < maxAgeSeconds * 1000) return cached.set;
      try {
        return await load();
      } catch (e) {
        if (cached) return cached.set;
        throw e;
      }
    },
    async refetch() {
      if (Date.now() - lastRefetch < refetchIntervalSeconds * 1000) return null;
      lastRefetch = Date.now();
      return load();
    },
  };
}
