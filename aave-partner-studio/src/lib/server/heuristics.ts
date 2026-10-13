import type { Blueprint, Category, Custody, Market, Product, Risk } from "@/lib/types";
import { fmtPct } from "@/lib/aave/math";

const KEYWORDS: Record<Exclude<Category, "other">, string[]> = {
  neobank: ["bank", "banking", "current account", "debit card", "savings", "neobank", "salary account", "overdraft", "iban"],
  wallet: ["wallet", "self-custody", "self custody", "seed phrase", "web3", "nft", "dapp", "swap tokens"],
  payments: ["payments", "checkout", "merchant", "payment link", "invoicing", "acquiring", "point of sale", "accept payments"],
  payroll: ["payroll", "contractors", "employees", "salaries", "hr ", "benefits", "hiring", "compliance in"],
  remittance: ["remittance", "send money", "money transfer", "international transfer", "send abroad", "exchange rate", "family back home"],
  exchange: ["exchange", "trading", "buy bitcoin", "buy crypto", "spot", "futures", "trade crypto", "order book"],
  ecommerce: ["shop", "store", "ecommerce", "e-commerce", "sellers", "marketplace", "cart"],
  treasury: ["treasury", "cfo", "finance team", "spend management", "corporate card", "accounts payable", "dao"],
};

const REGIONS: [RegExp, string][] = [
  [/\.(com\.)?br$/, "Brazil"],
  [/\.(com\.)?mx$/, "Mexico"],
  [/\.(com\.)?ar$/, "Argentina"],
  [/\.(co\.)?uk$/, "United Kingdom"],
  [/\.(de|fr|es|it|nl|eu|ie|pt|be|at|fi|se|dk|pl)$/, "Europe"],
  [/\.(co\.)?in$/, "India"],
  [/\.(com\.)?ng$/, "Nigeria"],
  [/\.(com\.)?tr$/, "Turkey"],
  [/\.(co\.)?za$/, "South Africa"],
  [/\.ph$/, "Philippines"],
];

const REGION_WORDS: [RegExp, string][] = [
  [/\bbrazil|brasil\b/i, "Brazil"],
  [/\blatin america|latam\b/i, "Latin America"],
  [/\bmexico\b/i, "Mexico"],
  [/\bnigeria|africa\b/i, "Africa"],
  [/\bindia\b/i, "India"],
  [/\beurope|european|eurozone|sepa\b/i, "Europe"],
  [/\bunited kingdom|\buk\b/i, "United Kingdom"],
];

const EUROPE = new Set(["Europe"]);

export type Signals = { name: string; domain?: string; text: string };

export function classify(text: string): Category {
  const t = ` ${text.toLowerCase()} `;
  let best: Category = "other";
  let score = 0;
  for (const [cat, words] of Object.entries(KEYWORDS) as [Exclude<Category, "other">, string[]][]) {
    const s = words.reduce((n, w) => n + (t.split(w).length - 1), 0);
    if (s > score) {
      best = cat;
      score = s;
    }
  }
  return best;
}

export function regionOf(domain: string | undefined, text: string): string {
  for (const [re, region] of REGION_WORDS) if (re.test(text)) return region;
  if (domain) for (const [re, region] of REGIONS) if (re.test(domain)) return region;
  return "Global";
}

export function nameFrom(parts: { siteName?: string; title?: string; domain?: string }): string {
  if (parts.siteName && parts.siteName.length <= 40) return parts.siteName;
  const fromTitle = parts.title?.split(/\s[|\-–—:·]\s/)[0]?.trim();
  if (fromTitle && fromTitle.length <= 32) return fromTitle;
  if (parts.domain) {
    const root = parts.domain.split(".")[0];
    return root.charAt(0).toUpperCase() + root.slice(1);
  }
  return "Your app";
}

/** A stable, pleasant brand colour for when the site doesn't declare one. */
export function fallbackColor(seed: string): string {
  const palette = ["#6c5ce7", "#00b894", "#0984e3", "#e17055", "#d63384", "#00a8a8", "#fd7e14", "#5b8def"];
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

const PROFILES: Record<Category, { audience: string; users: number; adoption: number; avgBalance: number; custody: Custody; products: Product[] }> = {
  neobank: { audience: "retail customers holding cash balances", users: 500_000, adoption: 0.08, avgBalance: 900, custody: "omnibus", products: ["earn"] },
  wallet: { audience: "self-custody crypto users", users: 200_000, adoption: 0.12, avgBalance: 1_500, custody: "embedded", products: ["earn", "borrow"] },
  payments: { audience: "merchants with settlement balances", users: 30_000, adoption: 0.1, avgBalance: 8_000, custody: "omnibus", products: ["earn"] },
  payroll: { audience: "companies and the contractors they pay", users: 40_000, adoption: 0.06, avgBalance: 2_500, custody: "omnibus", products: ["earn"] },
  remittance: { audience: "people sending money across borders", users: 300_000, adoption: 0.05, avgBalance: 400, custody: "embedded", products: ["earn"] },
  exchange: { audience: "traders holding idle stablecoins", users: 250_000, adoption: 0.1, avgBalance: 2_000, custody: "omnibus", products: ["earn", "borrow"] },
  ecommerce: { audience: "online sellers waiting on payouts", users: 50_000, adoption: 0.05, avgBalance: 3_000, custody: "omnibus", products: ["earn"] },
  treasury: { audience: "finance teams managing company cash", users: 2_000, adoption: 0.15, avgBalance: 150_000, custody: "omnibus", products: ["earn"] },
  other: { audience: "users who keep a balance in the app", users: 100_000, adoption: 0.06, avgBalance: 800, custody: "embedded", products: ["earn"] },
};

const COPY: Record<Category, { title: string; subtitle: string; cta: string }> = {
  neobank: { title: "Savings that grow every second", subtitle: "Put idle dollars to work. Withdraw any time.", cta: "Start earning" },
  wallet: { title: "Earn on your stablecoins", subtitle: "Supply to Aave from your wallet. Withdraw any time.", cta: "Supply" },
  payments: { title: "Earn on your settlement balance", subtitle: "Unused balances earn yield until you need them.", cta: "Turn on Earn" },
  payroll: { title: "Earn while you wait for payday spend", subtitle: "Keep part of your pay in dollars that earn yield.", cta: "Start earning" },
  remittance: { title: "Let your dollars earn before you send", subtitle: "Hold digital dollars that earn yield. Send any time.", cta: "Start earning" },
  exchange: { title: "Earn on idle stablecoins", subtitle: "Balances you aren't trading can earn yield on Aave.", cta: "Earn" },
  ecommerce: { title: "Earn on pending payouts", subtitle: "Your balance earns yield until you withdraw it.", cta: "Turn on Earn" },
  treasury: { title: "Put operating cash to work", subtitle: "On-chain yield with same-day liquidity.", cta: "Allocate" },
  other: { title: "Earn on your balance", subtitle: "Put idle dollars to work. Withdraw any time.", cta: "Start earning" },
};

const QUESTIONS: Record<Category, string[]> = {
  neobank: [
    "Who holds customer funds today: a partner bank, an EMI licence, or a stablecoin issuer?",
    "Would Earn be opt-in per customer, and in which markets first?",
    "Do you need an omnibus wallet per jurisdiction for reporting?",
  ],
  wallet: [
    "Which wallet stack do users sign with (embedded, smart account, EOA)?",
    "Do you sponsor gas today, or would approve + supply need a paymaster?",
    "Would you show Aave positions users already hold in other apps?",
  ],
  payments: [
    "How long do merchant balances sit before payout on average?",
    "Is yield passed to merchants, kept by you, or split?",
    "What liquidity do you need same-day for payouts?",
  ],
  payroll: [
    "Which countries' workers would see Earn first?",
    "Are contractor balances held by you or in their own wallets?",
    "Do you already pay out in USDC?",
  ],
  remittance: [
    "Do recipients keep a dollar balance today, or cash out immediately?",
    "Which corridors have the highest dollar demand?",
    "Is self-custody acceptable for your users and regulators?",
  ],
  exchange: [
    "What share of user stablecoins sits idle more than 7 days?",
    "Would you supply from a pooled treasury and credit users off-chain?",
    "Are you interested in GHO as an earn or borrow asset?",
  ],
  ecommerce: [
    "What is the average time between sale and seller payout?",
    "Are sellers' balances held in dollars or local currency?",
    "Do sellers already withdraw to crypto rails?",
  ],
  treasury: [
    "What share of cash is operating vs. strategic reserve?",
    "Which signers and policies govern treasury moves (multisig, MPC)?",
    "What reporting does your auditor need for on-chain positions?",
  ],
  other: [
    "Where do user balances sit today, and who has custody?",
    "Which assets do users hold the most of?",
    "Would yield go to users, to you, or be split?",
  ],
};

export function earnMarkets(markets: Market[]): Market[] {
  return markets.filter((m) => ["USDC", "EURC", "GHO"].includes(m.symbol) && m.active && !m.frozen && !m.paused);
}

export function baseRisks(custody: Custody, region: string): Risk[] {
  const risks: Risk[] = [
    {
      title: "Variable yield",
      body: "The rate comes from borrowers and moves with demand. Show it as a live, variable rate, never as a promised return.",
      level: "medium",
    },
    {
      title: "Smart contract risk",
      body: "Aave v3 is audited and has run on Base since 2023, but contracts can fail. Disclose it and consider a per-user cap at launch.",
      level: "medium",
    },
    {
      title: "Withdrawal liquidity",
      body: "Withdrawals need unborrowed liquidity in the pool. At very high utilization a large withdrawal can wait until borrowers repay or rates attract new supply.",
      level: "low",
    },
    {
      title: "Stablecoin risk",
      body: "Users hold the stablecoin, not cash in a bank. Explain the issuer and what happens if it depegs.",
      level: "low",
    },
  ];
  risks.push(
    custody === "omnibus"
      ? {
          title: "Custody and licensing",
          body: `Pooled custody means you hold user funds. Check whether yield on customer balances is a regulated activity in ${region === "Global" ? "each market" : region}.`,
          level: "high",
        }
      : {
          title: "User key management",
          body: "With embedded wallets users own the keys. Recovery and transaction signing UX decide whether this feels like a bank or a crypto app.",
          level: "medium",
        },
  );
  return risks;
}

export function rollout(custody: Custody): Blueprint["rollout"] {
  return [
    {
      phase: "Prototype",
      weeks: "Week 1–2",
      items: ["Drop in the Earn widget behind a feature flag", "Run deposits on a Base fork", custody === "omnibus" ? "Model the internal ledger with scaled balances" : "Wire your embedded wallet to the adapter"],
    },
    {
      phase: "Pilot",
      weeks: "Week 3–6",
      items: ["Staff and friends on mainnet with a per-user cap", "Legal review of disclosures", "Monitoring: rate, utilization and pool liquidity alerts"],
    },
    {
      phase: "Launch",
      weeks: "Week 7+",
      items: ["Gradual rollout by region", "Add Borrow against crypto if users hold ETH or BTC", "Quarterly review with Aave on caps and new markets"],
    },
  ];
}

/** Builds a complete blueprint without AI. The AI path starts from this and replaces fields it can improve. */
export function heuristicBlueprint(opts: {
  id: string;
  input: string;
  signals: Signals;
  brand: { primary: string; logo?: string };
  tagline?: string;
  markets: Market[];
  note?: string;
}): Blueprint {
  const { signals, markets } = opts;
  const category = classify(`${signals.text} ${opts.input}`);
  const region = regionOf(signals.domain, `${signals.text} ${opts.input}`);
  const profile = PROFILES[category];
  const options = earnMarkets(markets);
  const asset = (EUROPE.has(region) && options.find((m) => m.symbol === "EURC")) || options.find((m) => m.symbol === "USDC") || options[0];
  const apy = asset?.supplyApy ?? 0;
  const symbol = asset?.symbol ?? "USDC";

  return {
    id: opts.id,
    createdAt: Date.now(),
    input: opts.input,
    engine: { kind: "heuristic", note: opts.note },
    partner: {
      name: signals.name,
      domain: signals.domain,
      tagline: opts.tagline?.slice(0, 140) || `${signals.name} for ${profile.audience}.`,
      category,
      region,
      audience: profile.audience,
      brand: opts.brand,
    },
    recommendation: {
      products: profile.products,
      asset: symbol,
      custody: profile.custody,
      headline: `Add a ${symbol} Earn account paying ${fmtPct(apy)} variable APY from Aave on Base.`,
      why: [
        `${signals.name} serves ${profile.audience}; idle balances are the natural thing to put to work.`,
        `The ${symbol} market on Base is one of Aave's deepest, so deposits and withdrawals are instant at this size.`,
        profile.custody === "omnibus"
          ? "Pooled custody keeps the user experience identical to today: users see a balance, you hold aTokens."
          : "Embedded wallets keep users in control of funds, which keeps you out of custody.",
      ],
    },
    copy: COPY[category],
    businessCase: {
      users: profile.users,
      adoption: profile.adoption,
      avgBalance: profile.avgBalance,
      partnerFee: 0.15,
      note: "Assumptions are typical for this kind of company. Replace them with real numbers on the first call.",
    },
    risks: baseRisks(profile.custody, region),
    rollout: rollout(profile.custody),
    questions: QUESTIONS[category],
  };
}
