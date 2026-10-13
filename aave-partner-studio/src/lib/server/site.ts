import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

export type SiteInfo = {
  url: string;
  domain: string;
  title?: string;
  siteName?: string;
  description?: string;
  themeColor?: string;
  logo?: string;
  text: string;
};

const MAX_BYTES = 1_500_000;
const MAX_REDIRECTS = 3;

export class SiteError extends Error {}

/** Turns "revolut.com" or "https://www.revolut.com/en/" into a URL, or null if the input is a description. */
export function asUrl(input: string): URL | null {
  const text = input.trim();
  if (/\s/.test(text) || !/\.[a-z]{2,}(?:[/:?#]|$)/i.test(text)) return null;
  try {
    const url = new URL(/^https?:\/\//i.test(text) ? text : `https://${text}`);
    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

export function domainOf(url: URL): string {
  return url.hostname.replace(/^www\./, "").toLowerCase();
}

/** Fetches a public web page. Refuses private and local addresses so the server can't be pointed at its own network. */
export async function fetchSite(start: URL): Promise<SiteInfo> {
  let url = start;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
    await assertPublic(url);
    const res = await fetch(url, {
      redirect: "manual",
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; PartnerStudio/0.1; +https://aave.com)",
        Accept: "text/html,application/xhtml+xml",
        "Accept-Language": "en",
      },
      signal: AbortSignal.timeout(8_000),
    });
    if (res.status >= 300 && res.status < 400) {
      const next = res.headers.get("location");
      if (!next) break;
      url = new URL(next, url);
      continue;
    }
    if (!res.ok) throw new SiteError(`The site answered ${res.status}.`);
    if (!(res.headers.get("content-type") ?? "").includes("html")) throw new SiteError("That URL isn't a web page.");
    return parse(await readCapped(res), url);
  }
  throw new SiteError("Too many redirects.");
}

async function assertPublic(url: URL) {
  if (url.protocol !== "https:" && url.protocol !== "http:") throw new SiteError("Only http and https links work.");
  if (url.port && url.port !== "80" && url.port !== "443") throw new SiteError("Only standard web ports are allowed.");
  const host = url.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".local") || host.endsWith(".internal")) throw new SiteError("That address isn't public.");
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true }).catch(() => {
    throw new SiteError("That domain doesn't resolve.");
  });
  if (addresses.some((a) => isPrivate(a.address))) throw new SiteError("That address isn't public.");
}

function isPrivate(ip: string): boolean {
  if (ip.includes(":")) {
    const v = ip.toLowerCase();
    if (v.startsWith("::ffff:")) return isPrivate(v.slice(7));
    return v === "::" || v === "::1" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80");
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    a >= 224
  );
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (size < MAX_BYTES) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    size += value.length;
  }
  await reader.cancel().catch(() => undefined);
  return new TextDecoder().decode(Buffer.concat(chunks));
}

function parse(html: string, url: URL): SiteInfo {
  const meta = (key: string) => {
    const re = new RegExp(`<meta[^>]+(?:name|property)=["']${key}["'][^>]*>`, "i");
    const tag = html.match(re)?.[0];
    return tag ? decode(tag.match(/content=["']([^"']*)["']/i)?.[1] ?? "").trim() || undefined : undefined;
  };
  const title = decode(html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? "").trim() || undefined;
  const themeColor = normalizeHex(meta("theme-color"));

  const icons = [...html.matchAll(/<link[^>]+rel=["']([^"']+)["'][^>]*>/gi)]
    .map((m) => ({ rel: m[1].toLowerCase(), href: m[0].match(/href=["']([^"']+)["']/i)?.[1] }))
    .filter((l): l is { rel: string; href: string } => Boolean(l.href) && l.rel.includes("icon"));
  const best = icons.find((l) => l.rel.includes("apple-touch")) ?? icons.find((l) => /\.(png|svg)/i.test(l.href)) ?? icons[0];
  const logo = best ? safeAbsolute(best.href, url) : undefined;

  const text = decode(
    html
      .replace(/<(script|style|noscript|svg|template)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5000);

  return {
    url: url.toString(),
    domain: domainOf(url),
    title,
    siteName: meta("og:site_name") ?? meta("application-name"),
    description: meta("description") ?? meta("og:description"),
    themeColor,
    logo,
    text,
  };
}

function safeAbsolute(href: string, base: URL): string | undefined {
  try {
    const u = new URL(href, base);
    return u.protocol === "https:" ? u.toString() : undefined;
  } catch {
    return undefined;
  }
}

export function normalizeHex(value?: string): string | undefined {
  const v = value?.trim().toLowerCase();
  if (!v) return undefined;
  const short = v.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
  if (short) return `#${short[1]}${short[1]}${short[2]}${short[2]}${short[3]}${short[3]}`;
  return /^#[0-9a-f]{6}$/.test(v) ? v : undefined;
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)));
}
