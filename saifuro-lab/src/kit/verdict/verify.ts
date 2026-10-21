/**
 * Verifies a Saifuro verdict token with the twelve steps of draft-dias-agent-payment-verdicts-00 §6,
 * or as a stored record (§6.2). Every check reads the payload bytes whose signature step 5 verified,
 * parsed once by a duplicate-rejecting, decimal-preserving parser.
 */
import { decimalEquals, inIssuerForm, isPositiveLiteral } from "./decimal.ts";
import { decodeSegment, decodeUtf8 } from "./encoding.ts";
import { isObject, JsonError, JsonNumber, parseStrictJson, toPlain, type JsonObject, type JsonValue } from "./json.ts";
import type { Jwk, KeySource } from "./keys.ts";
import { isOnCurve, scalarsInRange, verifyEs256 } from "./p256.ts";
import type { ReplayStore } from "./replay.ts";

export const STEPS = [
  "Parse",
  "Header",
  "Environment",
  "Issuer and key",
  "Signature",
  "Token kind and structure",
  "Time",
  "Decision and operator",
  "Amount",
  "Currency",
  "Recipient",
  "Replay",
] as const;

export type CheckStatus = "pass" | "fail" | "skip" | "not_reached";
export type Check = { step: number; name: (typeof STEPS)[number]; status: CheckStatus; detail: string };

export type PaymentRecord = {
  /** Decimal string in the unit agreed with the operator, e.g. "0.01". */
  amount: string;
  currency: string;
  recipient: string;
};

export type VerifyOptions = {
  /** Accepted issuers, each with its own key source. Keys are never looked up across issuers. */
  issuers: Record<string, KeySource>;
  mode?: "settle" | "record";
  /** Unix seconds. Pin only in tests and for expired examples; production uses the real clock. */
  now?: number;
  clockSkewSeconds?: number;
  /** Your identifier for the "aud" rule, if you have one. */
  audience?: string | null;
  // settle mode
  payment?: PaymentRecord;
  /** Mandate ids the paying operator agreed with you (step 8). Omit only if no operator's funds are involved. */
  agreedMandates?: string[];
  /** True only for verifiers that never protect real deliveries; allows "sandbox-" keys (step 3). */
  testingOnly?: boolean;
  replay?: ReplayStore;
  // record mode
  receivedAt?: number | null;
  distinguishTest?: boolean;
  maxTokenLength?: number;
};

export type VerifyResult = {
  valid: boolean;
  /** First step that rejected the token, or null. */
  step: number | null;
  reason: string | null;
  checks: Check[];
  header?: Record<string, unknown>;
  claims?: Record<string, unknown>;
};

class Reject extends Error {
  readonly step: number;
  constructor(step: number, message: string) {
    super(message);
    this.step = step;
  }
}

const CURRENCY_SIGNED_FROM = Date.UTC(2026, 9, 9, 9, 12) / 1000;
const RESERVED_KEY_PARAMS = ["jku", "jwk", "x5u", "x5c"];

const str = (v: JsonValue | undefined): v is string => typeof v === "string";
const nonEmpty = (v: JsonValue | undefined): v is string => typeof v === "string" && v.length > 0;
const int = (v: JsonValue | undefined): bigint | null => (v instanceof JsonNumber && /^-?\d+$/.test(v.raw) ? BigInt(v.raw) : null);

export async function verifyVerdict(token: string, opts: VerifyOptions): Promise<VerifyResult> {
  const mode = opts.mode ?? "settle";
  const skew = opts.clockSkewSeconds ?? 60;
  if (skew > 60) throw new Error("clock skew allowance must be at most 60 seconds");
  const now = opts.now ?? Math.floor(Date.now() / 1000);

  const checks: Check[] = STEPS.map((name, i) => ({ step: i + 1, name, status: "not_reached", detail: "" }));
  const pass = (step: number, detail: string) => Object.assign(checks[step - 1], { status: "pass", detail });
  const skip = (step: number, detail: string) => Object.assign(checks[step - 1], { status: "skip", detail });

  let header: JsonObject | undefined;
  let claims: JsonObject | undefined;

  try {
    // 1. Parse
    const maxLength = opts.maxTokenLength ?? (mode === "record" ? 100_000 : 11_000);
    if (typeof token !== "string" || token.length > maxLength) throw new Reject(1, `token longer than ${maxLength} characters`);
    const parts = token.split(".");
    if (parts.length !== 3) throw new Reject(1, `expected 3 segments, found ${parts.length}`);
    const [h64, p64, s64] = parts;
    const hBytes = decodeSegment(h64);
    const pBytes = decodeSegment(p64);
    const sig = decodeSegment(s64);
    if (!hBytes || !pBytes || !sig) throw new Reject(1, "a segment is not unpadded base64url");
    const hText = decodeUtf8(hBytes);
    const pText = decodeUtf8(pBytes);
    if (hText === null || pText === null) throw new Reject(1, "header or payload is not valid UTF-8");
    let h: JsonValue, p: JsonValue;
    try {
      h = parseStrictJson(hText);
      p = parseStrictJson(pText);
    } catch (e) {
      throw new Reject(1, e instanceof JsonError ? e.message : "invalid JSON");
    }
    if (!isObject(h) || !isObject(p)) throw new Reject(1, "header and payload must be JSON objects");
    header = h;
    claims = p;
    pass(1, "3 base64url segments, UTF-8, JSON objects, no duplicate members");

    // 2. Header
    if (h.alg !== "ES256") throw new Reject(2, `alg must be exactly "ES256"`);
    if ("crit" in h) throw new Reject(2, `"crit" is not allowed`);
    if (!nonEmpty(h.kid)) throw new Reject(2, "kid must be a non-empty string");
    const embedded = RESERVED_KEY_PARAMS.find((k) => k in h);
    if (embedded) throw new Reject(2, `"${embedded}" in header: keys never come from the token`);
    const kid = h.kid;
    pass(2, `alg ES256, kid ${kid}`);

    // 3. Environment
    const sandbox = kid.startsWith("sandbox-");
    const applyEnv = mode === "settle" ? !opts.testingOnly : !!opts.distinguishTest;
    if (!applyEnv) skip(3, sandbox ? "sandbox key accepted: testing-only verifier" : "test verdicts not separated");
    else if (sandbox) throw new Reject(3, "signed with a sandbox key; never a production approval");
    else pass(3, "production key");

    // 4. Issuer and key
    if (!str(p.iss)) throw new Reject(4, "iss missing");
    const source = Object.prototype.hasOwnProperty.call(opts.issuers, p.iss) ? opts.issuers[p.iss] : undefined;
    if (!source) throw new Reject(4, `issuer ${JSON.stringify(p.iss)} is not configured`);
    const find = (keys: Jwk[]) => keys.filter((k) => k && k.kid === kid);
    let matches = find((await source.keys()).keys);
    if (matches.length === 0 && mode === "settle" && source.refetch) {
      const fresh = await source.refetch();
      if (fresh) matches = find(fresh.keys);
    }
    if (matches.length === 0) throw new Reject(4, `kid ${kid} not in the issuer's key set`);
    if (matches.length > 1) throw new Reject(4, `kid ${kid} appears more than once in the key set`);
    const key = matches[0];
    if (key.kty !== "EC" || key.crv !== "P-256") throw new Reject(4, "key is not an EC P-256 key");
    if ("alg" in key && key.alg !== "ES256") throw new Reject(4, `key alg is ${String(key.alg)}, not ES256`);
    if ("use" in key && key.use !== "sig") throw new Reject(4, `key use is ${String(key.use)}, not sig`);
    if (typeof key.x !== "string" || typeof key.y !== "string") throw new Reject(4, "key has no coordinates");
    pass(4, `${p.iss} · key ${kid}`);

    // 5. Signature
    if (sig.length !== 64) throw new Reject(5, `signature is ${sig.length} bytes, not 64 (R||S)`);
    if (!scalarsInRange(sig)) throw new Reject(5, "R or S outside [1, n−1]");
    if (!isOnCurve(key.x, key.y)) throw new Reject(5, "public key is not a point on P-256");
    let ok = false;
    try {
      ok = await verifyEs256({ x: key.x, y: key.y }, `${h64}.${p64}`, sig);
    } catch {
      ok = false;
    }
    if (!ok) throw new Reject(5, "signature does not verify");
    pass(5, "ES256 signature valid");

    // 6. Token kind and structure
    if ("type" in p) throw new Reject(6, "has a type claim: this is an event token");
    if (!nonEmpty(p.jti)) throw new Reject(6, "jti must be a non-empty string");
    if (p.jti.startsWith("evt_")) throw new Reject(6, "jti starts with evt_: this is an event token");
    const iat = int(p.iat);
    const exp = int(p.exp);
    if (iat === null || exp === null) throw new Reject(6, "iat and exp must be integers");
    if (exp <= iat) throw new Reject(6, "exp must be after iat");
    if (!nonEmpty(p.verdict)) throw new Reject(6, "verdict must be a non-empty string");
    if (!nonEmpty(p.policy_version)) throw new Reject(6, "policy_version must be a non-empty string");
    if (!nonEmpty(p.nonce)) throw new Reject(6, "nonce must be a non-empty string");
    const r = p.request;
    if (!isObject(r)) throw new Reject(6, "request must be an object");
    const legacy = mode === "record" && Number(iat) < CURRENCY_SIGNED_FROM;
    for (const m of ["agent", "recipient", "category", ...(legacy ? [] : ["currency"])]) {
      if (!nonEmpty(r[m])) throw new Reject(6, `request.${m} must be a non-empty string`);
    }
    if (legacy && "currency" in r && !nonEmpty(r.currency)) throw new Reject(6, "request.currency must be a non-empty string");
    if (!(r.amount instanceof JsonNumber) || !isPositiveLiteral(r.amount.raw)) throw new Reject(6, "request.amount must be a number greater than zero");
    if ("mandate" in p && !nonEmpty(p.mandate)) throw new Reject(6, "mandate must be a non-empty string");
    if ("supersedes" in p && !nonEmpty(p.supersedes)) throw new Reject(6, "supersedes must be a non-empty string");
    if (p.verdict === "allow" && !("mandate" in p)) throw new Reject(6, "an allow must name a mandate");
    if ("supersedes" in p && p.verdict !== "allow") throw new Reject(6, "supersedes is only valid on an allow");
    if ("aud" in p) {
      const aud = p.aud;
      const list = str(aud) ? [aud] : Array.isArray(aud) ? aud : null;
      if (!list || !opts.audience || !list.includes(opts.audience)) throw new Reject(6, "aud does not name this verifier");
    }
    pass(6, legacy && !("currency" in r) ? "verdict claims well-formed (pre-currency record)" : "verdict claims well-formed");

    // 7. Time
    const clock = mode === "record" ? opts.receivedAt : now;
    if (clock === undefined || clock === null) skip(7, "no receipt time recorded");
    else {
      const t = BigInt(clock);
      const L = BigInt(skew);
      if (t >= exp + L) throw new Reject(7, mode === "record" ? "received after it expired" : "expired");
      if (iat > t + L) throw new Reject(7, "issued in the future");
      if ("nbf" in p) {
        const nbf = p.nbf instanceof JsonNumber ? Number(p.nbf.raw) : NaN;
        if (!Number.isFinite(nbf) || Number(t + L) < nbf) throw new Reject(7, "not valid yet (nbf)");
      }
      pass(7, `${mode === "record" ? "received" : "valid"} within its 5-minute window (±${skew}s)`);
    }

    if (mode === "record") {
      for (const s of [8, 9, 10, 11, 12]) skip(s, "not applied to a stored record");
      return { valid: true, step: null, reason: null, checks, header: toPlain(h) as Record<string, unknown>, claims: toPlain(p) as Record<string, unknown> };
    }

    // 8. Decision and operator
    if (p.verdict !== "allow") throw new Reject(8, `verdict is ${p.verdict}, not allow`);
    if (opts.agreedMandates) {
      if (!opts.agreedMandates.includes(p.mandate as string)) throw new Reject(8, `mandate ${String(p.mandate)} is not one the operator agreed with you`);
      pass(8, `allow under agreed mandate ${String(p.mandate)}`);
    } else pass(8, "allow (no operator mandate list configured)");

    const pay = opts.payment;
    if (!pay) throw new Error("settle mode needs a payment record");

    // 9. Amount
    const raw = (r.amount as JsonNumber).raw;
    if (!inIssuerForm(raw)) throw new Reject(9, `amount ${raw} is not in the form the issuer writes`);
    if (!decimalEquals(raw, pay.amount)) throw new Reject(9, `approved ${raw}, payment is ${pay.amount}`);
    pass(9, `${raw} = ${pay.amount}`);

    // 10. Currency
    if (r.currency !== pay.currency) throw new Reject(10, `approved ${String(r.currency)}, payment is ${pay.currency}`);
    pass(10, pay.currency);

    // 11. Recipient
    if (r.recipient !== pay.recipient) throw new Reject(11, `approved for ${String(r.recipient)}, payee is ${pay.recipient}`);
    pass(11, pay.recipient);

    // 12. Replay
    if (!opts.replay) throw new Reject(12, "no nonce store configured");
    const result = await opts.replay.consume({
      iss: p.iss,
      nonce: p.nonce,
      supersedes: str(p.supersedes) ? p.supersedes : undefined,
      keepUntil: Number(exp) + skew,
    });
    if (result === "replayed_nonce") throw new Reject(12, "nonce already accepted: replay");
    if (result === "replayed_supersedes") throw new Reject(12, "this review was already approved once");
    pass(12, "nonce recorded");

    return { valid: true, step: null, reason: null, checks, header: toPlain(h) as Record<string, unknown>, claims: toPlain(p) as Record<string, unknown> };
  } catch (e) {
    if (!(e instanceof Reject)) throw e;
    Object.assign(checks[e.step - 1], { status: "fail", detail: e.message });
    return {
      valid: false,
      step: e.step,
      reason: e.message,
      checks,
      header: header ? (toPlain(header) as Record<string, unknown>) : undefined,
      claims: claims ? (toPlain(claims) as Record<string, unknown>) : undefined,
    };
  }
}
