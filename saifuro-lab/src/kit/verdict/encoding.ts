/** Strict base64url (RFC 7515 §2): no padding, no whitespace, no standard-alphabet characters. */
export function decodeSegment(segment: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]*$/.test(segment) || segment.length % 4 === 1) return null;
  const std = segment.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(std + "=".repeat((4 - (std.length % 4)) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export function encodeSegment(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

const strictUtf8 = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });

export function decodeUtf8(bytes: Uint8Array): string | null {
  try {
    return strictUtf8.decode(bytes);
  } catch {
    return null;
  }
}

export function bytesToBigInt(bytes: Uint8Array): bigint {
  let n = BigInt(0);
  for (const b of bytes) n = (n << BigInt(8)) | BigInt(b);
  return n;
}
