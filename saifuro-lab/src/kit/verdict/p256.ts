import { bytesToBigInt, decodeSegment } from "./encoding.ts";

const P = BigInt("0xffffffff00000001000000000000000000000000ffffffffffffffffffffffff");
const B = BigInt("0x5ac635d8aa3a93e7b3ebbd55769886bc651d06b0cc53b0f63bce3c3e27d2604b");
/** Order of the P-256 group. */
export const N = BigInt("0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551");

/** True if the JWK's (x, y) is a point on P-256: y² = x³ − 3x + b (mod p). */
export function isOnCurve(x: string, y: string): boolean {
  const xb = decodeSegment(x);
  const yb = decodeSegment(y);
  if (!xb || !yb || xb.length !== 32 || yb.length !== 32) return false;
  const X = bytesToBigInt(xb);
  const Y = bytesToBigInt(yb);
  if (X >= P || Y >= P) return false;
  const left = (Y * Y) % P;
  const right = (((X * X) % P) * X - BigInt(3) * X + B) % P;
  return left === ((right % P) + P) % P;
}

/** R and S must each be in [1, n − 1] (CVE-2022-21449). */
export function scalarsInRange(sig: Uint8Array): boolean {
  if (sig.length !== 64) return false;
  const r = bytesToBigInt(sig.slice(0, 32));
  const s = bytesToBigInt(sig.slice(32));
  const one = BigInt(1);
  return r >= one && r < N && s >= one && s < N;
}

export async function verifyEs256(jwk: { x: string; y: string }, signingInput: string, sig: Uint8Array): Promise<boolean> {
  const key = await crypto.subtle.importKey("jwk", { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, ext: true }, { name: "ECDSA", namedCurve: "P-256" }, false, [
    "verify",
  ]);
  return crypto.subtle.verify({ name: "ECDSA", hash: "SHA-256" }, key, sig as BufferSource, new TextEncoder().encode(signingInput) as BufferSource);
}
