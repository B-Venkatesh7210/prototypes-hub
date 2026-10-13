export type Market = {
  symbol: string;
  address: `0x${string}`;
  decimals: number;
  aToken: `0x${string}`;
  priceUsd: number;
  supplyApy: number;
  borrowApy: number;
  /** Underlying supplied, in tokens. */
  totalSupplied: number;
  totalBorrowed: number;
  utilization: number;
  /** Share of borrow interest kept by the Aave treasury. */
  reserveFactor: number;
  /** Supply cap in tokens, 0 = none. */
  supplyCap: number;
  ltv: number;
  liquidationThreshold: number;
  active: boolean;
  frozen: boolean;
  paused: boolean;
};

export type MarketsSnapshot = {
  chain: "base";
  pool: `0x${string}`;
  blockNumber: string;
  fetchedAt: number;
  markets: Market[];
};

export const CATEGORIES = [
  "neobank",
  "wallet",
  "payments",
  "payroll",
  "remittance",
  "exchange",
  "ecommerce",
  "treasury",
  "other",
] as const;
export type Category = (typeof CATEGORIES)[number];

export type Custody = "embedded" | "omnibus";
export type Product = "earn" | "borrow";

export type Risk = { title: string; body: string; level: "low" | "medium" | "high" };

export type Blueprint = {
  id: string;
  createdAt: number;
  input: string;
  engine: { kind: "ai" | "heuristic"; model?: string; note?: string };
  partner: {
    name: string;
    domain?: string;
    tagline: string;
    category: Category;
    region: string;
    audience: string;
    brand: { primary: string; logo?: string };
  };
  recommendation: {
    products: Product[];
    asset: string;
    custody: Custody;
    headline: string;
    why: string[];
  };
  copy: { title: string; subtitle: string; cta: string };
  businessCase: { users: number; adoption: number; avgBalance: number; partnerFee: number; note: string };
  risks: Risk[];
  rollout: { phase: string; weeks: string; items: string[] }[];
  questions: string[];
};

export type ServiceStatus = {
  ai: { enabled: boolean; model?: string };
  sandbox: { mode: "fork" | "simulated"; chainId?: number; note?: string };
};
