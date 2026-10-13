import { createHash } from "node:crypto";
import { fmtPct } from "@/lib/aave/math";
import { CATEGORIES, type Blueprint, type Category, type Market, type Risk } from "@/lib/types";
import { aiConfig, completeJson } from "./ai";
import { earnMarkets, fallbackColor, heuristicBlueprint, nameFrom } from "./heuristics";
import { getMarkets } from "./markets";
import { asUrl, domainOf, fetchSite, normalizeHex, type SiteInfo } from "./site";
import { freshBlueprint, saveBlueprint } from "./store";

const AI_PER_DAY = Number(process.env.AI_ANALYSES_PER_DAY) || 20;
const g = globalThis as { __aiUse?: Map<string, { day: string; n: number }> };

export class AnalyzeError extends Error {}

function slug(s: string) {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40) || "partner";
}

/** The same company always maps to the same id, which doubles as the cache key and the share link. */
function idFor(input: string, url: URL | null) {
  const key = url ? domainOf(url) : input.trim().toLowerCase().replace(/\s+/g, " ");
  const hash = createHash("sha256").update(key).digest("hex").slice(0, 6);
  return `${slug(url ? domainOf(url).split(".")[0] : key.split(" ").slice(0, 4).join(" "))}-${hash}`;
}

function takeAiQuota(visitor: string): boolean {
  g.__aiUse ??= new Map();
  const day = new Date().toISOString().slice(0, 10);
  const used = g.__aiUse.get(visitor);
  const n = used?.day === day ? used.n : 0;
  if (n >= AI_PER_DAY) return false;
  g.__aiUse.set(visitor, { day, n: n + 1 });
  return true;
}

export async function analyze(input: string, visitor: string, opts: { refresh?: boolean } = {}): Promise<Blueprint> {
  const text = input.trim().slice(0, 600);
  if (text.length < 3) throw new AnalyzeError("Paste a company website or describe the company in a sentence.");
  const url = asUrl(text);
  const id = idFor(text, url);
  if (!opts.refresh) {
    const cached = freshBlueprint(id);
    if (cached) return cached;
  }

  const [{ markets }, site] = await Promise.all([
    getMarkets(),
    url ? fetchSite(url).catch((err: unknown) => (err instanceof Error ? err.message : "unreachable")) : Promise.resolve(null),
  ]);
  const info = site && typeof site === "object" ? (site as SiteInfo) : null;
  const siteNote = typeof site === "string" ? `Couldn't read the website (${site}), so this is based on the domain alone.` : undefined;

  const domain = info?.domain ?? (url ? domainOf(url) : undefined);
  const name = nameFrom({ siteName: info?.siteName, title: info?.title, domain });
  const signals = {
    name: url ? name : "Your app",
    domain,
    text: [info?.title, info?.description, info?.text].filter(Boolean).join(" \n"),
  };
  const brand = {
    primary: info?.themeColor && !nearGray(info.themeColor) ? info.themeColor : fallbackColor(domain ?? text),
    logo: info?.logo ?? (domain ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128` : undefined),
  };

  const draft = heuristicBlueprint({ id, input: text, signals, brand, tagline: info?.description, markets, note: siteNote });

  const ai = aiConfig();
  if (!ai) {
    saveBlueprint(draft);
    return draft;
  }
  if (!takeAiQuota(visitor)) {
    const bp = { ...draft, engine: { kind: "heuristic" as const, note: "Daily AI limit reached for this visitor, so this uses templates." } };
    saveBlueprint(bp);
    return bp;
  }

  try {
    const raw = await completeJson(ai, SYSTEM, userPrompt(text, info, draft, earnMarkets(markets)));
    const bp = merge(draft, raw, earnMarkets(markets), Boolean(info?.themeColor));
    bp.engine = { kind: "ai", model: ai.model, note: siteNote };
    saveBlueprint(bp);
    return bp;
  } catch (err) {
    console.warn("[analyze] AI failed, using templates:", err instanceof Error ? err.message : err);
    const bp = { ...draft, engine: { kind: "heuristic" as const, note: `AI unavailable (${err instanceof Error ? err.message : "error"}), so this uses templates.` } };
    saveBlueprint(bp);
    return bp;
  }
}

function nearGray(hex: string) {
  const [r, g2, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  return Math.max(r, g2, b) - Math.min(r, g2, b) < 24;
}

const SYSTEM = `You are a senior Solutions Engineer at Aave Labs preparing for a first call with a potential integration partner.
Aave is a decentralized lending protocol. The partner would offer an "Earn" product (users supply stablecoins to Aave v3 on Base and earn a variable rate), and possibly "Borrow" (users borrow against crypto collateral).
Be specific to this company, concrete, and commercially sharp. Never promise returns: rates are variable. Don't invent facts about the company; if unsure, say "likely".
Reply with ONLY a JSON object, no prose.`;

function userPrompt(input: string, info: SiteInfo | null, draft: Blueprint, markets: Market[]) {
  const site = info
    ? `Website: ${info.url}\nTitle: ${info.title ?? ""}\nDescription: ${info.description ?? ""}\nPage text (truncated): ${info.text.slice(0, 3500)}`
    : `No website text available. The user typed: "${input}"`;
  const live = markets.map((m) => `${m.symbol}: ${fmtPct(m.supplyApy)} supply APY, ${Math.round(m.totalSupplied * m.priceUsd).toLocaleString("en-US")} USD supplied, ${fmtPct(m.utilization, 0)} utilization`).join("\n");
  return `${site}

Live Aave v3 Base markets you may choose from:
${live}

Our first guess (improve it): name "${draft.partner.name}", category "${draft.partner.category}", region "${draft.partner.region}".

Return JSON with exactly this shape:
{
  "partner": { "name": string, "tagline": string (<= 110 chars, what they do), "category": one of ${JSON.stringify(CATEGORIES)}, "region": string (main market, or "Global"), "audience": string (<= 60 chars, who their users are), "brandColor": "#rrggbb" (their primary brand colour if you know it, else null) },
  "recommendation": { "products": ["earn"] or ["earn","borrow"], "asset": one of ${JSON.stringify(markets.map((m) => m.symbol))}, "custody": "embedded" (users hold keys via embedded wallets) or "omnibus" (partner holds aTokens in a pooled wallet and keeps an internal ledger), "headline": string (<= 120 chars, the pitch in one line), "why": [3 strings, each <= 160 chars, specific to this company] },
  "copy": { "title": string (<= 40 chars, in-app headline for the Earn card, in their voice), "subtitle": string (<= 70 chars), "cta": string (<= 18 chars) },
  "businessCase": { "users": integer (estimated active users), "adoption": number 0.01-0.5 (share who would use Earn in year one), "avgBalance": number (USD each adopter keeps in Earn), "partnerFee": number 0-0.3 (share of yield the partner keeps), "note": string (<= 160 chars, where these estimates come from) },
  "risks": [4-6 items of { "title": string, "body": string (<= 200 chars, specific to them), "level": "low"|"medium"|"high" }],
  "rollout": [3 items of { "phase": string, "weeks": string, "items": [3 short strings] }],
  "questions": [5 sharp discovery questions for the first call]
}`;
}

/** Takes each AI field only if it's valid; otherwise keeps the template value. */
function merge(draft: Blueprint, raw: unknown, markets: Market[], hasThemeColor: boolean): Blueprint {
  const r = (raw ?? {}) as Record<string, Record<string, unknown> | unknown[] | undefined>;
  const p = obj(r.partner);
  const rec = obj(r.recommendation);
  const copy = obj(r.copy);
  const bc = obj(r.businessCase);

  const category = CATEGORIES.includes(p.category as Category) ? (p.category as Category) : draft.partner.category;
  const asset = markets.some((m) => m.symbol === rec.asset) ? String(rec.asset) : draft.recommendation.asset;
  const products = Array.isArray(rec.products) && rec.products.includes("earn") ? (rec.products.includes("borrow") ? ["earn", "borrow"] : ["earn"]) : draft.recommendation.products;
  const aiColor = normalizeHex(typeof p.brandColor === "string" ? p.brandColor : undefined);

  const risks = Array.isArray(r.risks)
    ? (r.risks as unknown[])
        .map(obj)
        .filter((x) => str(x.title, 60) && str(x.body, 260))
        .map((x): Risk => ({ title: str(x.title, 60)!, body: str(x.body, 260)!, level: ["low", "medium", "high"].includes(x.level as string) ? (x.level as Risk["level"]) : "medium" }))
        .slice(0, 6)
    : [];
  const rollout = Array.isArray(r.rollout)
    ? (r.rollout as unknown[])
        .map(obj)
        .filter((x) => str(x.phase, 40) && Array.isArray(x.items))
        .map((x) => ({ phase: str(x.phase, 40)!, weeks: str(x.weeks, 30) ?? "", items: strings(x.items, 4, 120) }))
        .slice(0, 4)
    : [];

  return {
    ...draft,
    partner: {
      ...draft.partner,
      name: str(p.name, 40) ?? draft.partner.name,
      tagline: str(p.tagline, 140) ?? draft.partner.tagline,
      category,
      region: str(p.region, 40) ?? draft.partner.region,
      audience: str(p.audience, 80) ?? draft.partner.audience,
      brand: { ...draft.partner.brand, primary: !hasThemeColor && aiColor ? aiColor : draft.partner.brand.primary },
    },
    recommendation: {
      products: products as Blueprint["recommendation"]["products"],
      asset,
      custody: rec.custody === "embedded" || rec.custody === "omnibus" ? rec.custody : draft.recommendation.custody,
      headline: str(rec.headline, 140) ?? draft.recommendation.headline,
      why: strings(rec.why, 3, 200).length === 3 ? strings(rec.why, 3, 200) : draft.recommendation.why,
    },
    copy: {
      title: str(copy.title, 44) ?? draft.copy.title,
      subtitle: str(copy.subtitle, 80) ?? draft.copy.subtitle,
      cta: str(copy.cta, 20) ?? draft.copy.cta,
    },
    businessCase: {
      users: clamp(bc.users, 1_000, 50_000_000, draft.businessCase.users, true),
      adoption: clamp(bc.adoption, 0.01, 0.5, draft.businessCase.adoption),
      avgBalance: clamp(bc.avgBalance, 10, 1_000_000, draft.businessCase.avgBalance, true),
      partnerFee: clamp(bc.partnerFee, 0, 0.3, draft.businessCase.partnerFee),
      note: str(bc.note, 200) ?? draft.businessCase.note,
    },
    risks: risks.length >= 3 ? risks : draft.risks,
    rollout: rollout.length >= 2 ? rollout : draft.rollout,
    questions: strings(r.questions, 6, 200).length >= 3 ? strings(r.questions, 6, 200) : draft.questions,
  };
}

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

function str(v: unknown, max: number): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.replace(/\s+/g, " ").trim();
  return s ? (s.length > max ? `${s.slice(0, max - 1).trimEnd()}…` : s) : undefined;
}

function strings(v: unknown, count: number, max: number): string[] {
  return Array.isArray(v) ? v.map((x) => str(x, max)).filter((x): x is string => Boolean(x)).slice(0, count) : [];
}

function clamp(v: unknown, min: number, max: number, fallback: number, round = false): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return fallback;
  const c = Math.min(max, Math.max(min, n));
  return round ? Math.round(c) : c;
}
