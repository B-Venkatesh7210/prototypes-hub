/**
 * A strict JSON parser for verdict headers and payloads.
 *
 * Unlike JSON.parse it rejects duplicate member names at any depth (step 1), bounds nesting, and keeps
 * every number as its literal text so amounts can be compared by decimal value (step 9) instead of as
 * binary64, which loses precision above 2^33.
 */

export class JsonNumber {
  readonly raw: string;
  constructor(raw: string) {
    this.raw = raw;
  }
  toNumber() {
    return Number(this.raw);
  }
}

export type JsonValue = null | boolean | string | JsonNumber | JsonValue[] | JsonObject;
export type JsonObject = { [key: string]: JsonValue };

export class JsonError extends Error {}

export function parseStrictJson(text: string, maxDepth = 16): JsonValue {
  let i = 0;

  const fail = (msg: string): never => {
    throw new JsonError(`${msg} at offset ${i}`);
  };
  const ws = () => {
    while (i < text.length) {
      const c = text.charCodeAt(i);
      if (c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0d) i++;
      else break;
    }
  };

  const value = (depth: number): JsonValue => {
    ws();
    const c = text[i];
    if (c === "{") return object(depth + 1);
    if (c === "[") return array(depth + 1);
    if (c === '"') return string();
    if (c === "-" || (c >= "0" && c <= "9")) return number();
    if (text.startsWith("true", i)) return (i += 4), true;
    if (text.startsWith("false", i)) return (i += 5), false;
    if (text.startsWith("null", i)) return (i += 4), null;
    return fail("unexpected token");
  };

  const object = (depth: number): JsonObject => {
    if (depth > maxDepth) fail("nesting too deep");
    i++;
    const out: JsonObject = Object.create(null);
    ws();
    if (text[i] === "}") return i++, out;
    for (;;) {
      ws();
      if (text[i] !== '"') fail("expected member name");
      const key = string();
      if (Object.prototype.hasOwnProperty.call(out, key)) fail(`duplicate member "${key}"`);
      ws();
      if (text[i] !== ":") fail("expected ':'");
      i++;
      out[key] = value(depth);
      ws();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "}") return i++, out;
      fail("expected ',' or '}'");
    }
  };

  const array = (depth: number): JsonValue[] => {
    if (depth > maxDepth) fail("nesting too deep");
    i++;
    const out: JsonValue[] = [];
    ws();
    if (text[i] === "]") return i++, out;
    for (;;) {
      out.push(value(depth));
      ws();
      if (text[i] === ",") {
        i++;
        continue;
      }
      if (text[i] === "]") return i++, out;
      fail("expected ',' or ']'");
    }
  };

  const string = (): string => {
    i++;
    let out = "";
    for (;;) {
      if (i >= text.length) fail("unterminated string");
      const c = text[i];
      const code = text.charCodeAt(i);
      if (c === '"') return i++, out;
      if (code < 0x20) fail("control character in string");
      if (c !== "\\") {
        out += c;
        i++;
        continue;
      }
      const e = text[i + 1];
      i += 2;
      if (e === '"' || e === "\\" || e === "/") out += e;
      else if (e === "b") out += "\b";
      else if (e === "f") out += "\f";
      else if (e === "n") out += "\n";
      else if (e === "r") out += "\r";
      else if (e === "t") out += "\t";
      else if (e === "u") {
        const hex = text.slice(i, i + 4);
        if (!/^[0-9a-fA-F]{4}$/.test(hex)) fail("bad \\u escape");
        out += String.fromCharCode(parseInt(hex, 16));
        i += 4;
      } else fail("bad escape");
    }
  };

  const number = (): JsonNumber => {
    const m = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/.exec(text.slice(i));
    if (!m) return fail("bad number");
    i += m[0].length;
    return new JsonNumber(m[0]);
  };

  const result = value(0);
  ws();
  if (i !== text.length) fail("trailing data");
  return result;
}

export function isObject(v: JsonValue | undefined): v is JsonObject {
  return typeof v === "object" && v !== null && !Array.isArray(v) && !(v instanceof JsonNumber);
}

/** Converts to plain JSON values for display. Numbers become JS numbers. */
export function toPlain(v: JsonValue): unknown {
  if (v instanceof JsonNumber) return v.toNumber();
  if (Array.isArray(v)) return v.map(toPlain);
  if (isObject(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, toPlain(x)]));
  return v;
}
