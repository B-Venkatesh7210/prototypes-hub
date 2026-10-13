import { fmtPct, fmtUsd } from "@/lib/aave/math";
import type { Blueprint, Market } from "@/lib/types";

/** The blueprint as Markdown, for pasting into a CRM, Notion or an email. */
export function onePager(bp: Blueprint, market: Market | null): string {
  const p = bp.partner;
  const r = bp.recommendation;
  const b = bp.businessCase;
  const apy = market?.supplyApy ?? 0;
  const tvl = b.users * b.adoption * b.avgBalance;
  const link = typeof window !== "undefined" ? window.location.href : "";

  return `# ${p.name} × Aave — integration blueprint

**${r.headline}**

${p.tagline}
${p.category} · ${p.region}${p.domain ? ` · ${p.domain}` : ""}

## Why
${r.why.map((w) => `- ${w}`).join("\n")}

## Product
- ${r.products.map((x) => (x === "earn" ? `Earn on ${r.asset}` : "Borrow against crypto")).join("\n- ")}
- Custody: ${r.custody === "embedded" ? "embedded wallets (users hold keys)" : "omnibus (partner holds aTokens, internal ledger)"}
- Chain: Base · Aave v3${market ? ` · ${r.asset} supply APY ${fmtPct(apy)} (variable, live)` : ""}

## Business case (assumptions)
- ${b.users.toLocaleString("en-US")} users × ${fmtPct(b.adoption, 0)} adoption × ${fmtUsd(b.avgBalance, { decimals: 0 })} average balance = ${fmtUsd(tvl, { compact: true })} deposits
- ${p.name} fee on yield: ${fmtPct(b.partnerFee, 0)} → ${fmtUsd(tvl * apy * b.partnerFee, { compact: true })} a year at today's rate
- ${b.note}

## Risks
${bp.risks.map((x) => `- **${x.title}** (${x.level}): ${x.body}`).join("\n")}

## Rollout
${bp.rollout.map((x) => `- **${x.phase}** (${x.weeks}): ${x.items.join("; ")}`).join("\n")}

## Questions for the first call
${bp.questions.map((q, i) => `${i + 1}. ${q}`).join("\n")}
${link ? `\nLive preview: ${link}\n` : ""}`;
}
