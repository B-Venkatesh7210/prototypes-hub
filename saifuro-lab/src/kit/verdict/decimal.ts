/**
 * Amount handling for step 9. Amounts are compared as decimal strings, never as binary64, and anything
 * outside the form the issuer writes (no exponent, at most 15 integer and 6 fractional digits) is
 * rejected before it is converted.
 */

const ISSUER_FORM = /^(?:0|[1-9]\d{0,14})(?:\.\d{1,6})?$/;
const PLAIN_DECIMAL = /^\d+(?:\.\d+)?$/;

export function inIssuerForm(raw: string): boolean {
  return ISSUER_FORM.test(raw);
}

/** Greater than zero, decided from the literal without expanding any exponent. */
export function isPositiveLiteral(raw: string): boolean {
  if (raw.startsWith("-")) return false;
  const mantissa = raw.split(/[eE]/)[0];
  return /[1-9]/.test(mantissa);
}

function normalize(s: string): string | null {
  if (!PLAIN_DECIMAL.test(s)) return null;
  let [int, frac = ""] = s.split(".");
  int = int.replace(/^0+(?=\d)/, "");
  frac = frac.replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}

export function decimalEquals(a: string, b: string): boolean {
  const x = normalize(a);
  const y = normalize(b);
  return x !== null && x === y;
}

/** Converts a decimal string to integer units with `decimals` places, e.g. ("0.01", 6) → 10000n. */
export function toUnits(amount: string, decimals: number): bigint {
  const n = normalize(amount);
  if (n === null) throw new Error(`not a plain decimal: ${amount}`);
  const [int, frac = ""] = n.split(".");
  if (frac.length > decimals) throw new Error(`more than ${decimals} decimal places: ${amount}`);
  return BigInt(int + frac.padEnd(decimals, "0"));
}

export function fromUnits(units: bigint, decimals: number): string {
  const s = units.toString().padStart(decimals + 1, "0");
  const int = s.slice(0, s.length - decimals);
  const frac = s.slice(s.length - decimals).replace(/0+$/, "");
  return frac ? `${int}.${frac}` : int;
}
