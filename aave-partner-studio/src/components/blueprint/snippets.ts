import { POOL } from "@/lib/aave/constants";
import { accentFor } from "@/lib/color";
import type { Blueprint, Market } from "@/lib/types";

const q = (s: string) => JSON.stringify(s);

export function widgetSnippet(bp: Blueprint) {
  const { copy, recommendation: r, partner: p } = bp;
  return `import { AaveEarn } from "@/widget/AaveEarn";
import { useEarnAdapter } from "./earn-adapter";

export function EarnScreen() {
  const adapter = useEarnAdapter();
  if (!adapter) return null;

  return (
    <AaveEarn
      asset=${q(r.asset)}
      adapter={adapter}
      theme={{ mode: "light", accent: ${q(accentFor(p.brand.primary, "light"))}, radius: 20 }}
      copy={{
        title: ${q(copy.title)},
        subtitle: ${q(copy.subtitle)},
        cta: ${q(copy.cta)},
      }}
      onEvent={(e) => analytics.track(\`earn_\${e.type}\`, e)}
    />
  );
}`;
}

function reserveLiteral(market: Market | null, symbol: string) {
  return `{
  pool: ${q(POOL)},
  asset: ${q(market?.address ?? "0x…")}, // ${symbol}
  aToken: ${q(market?.aToken ?? "0x…")}, // a${symbol}, grows with interest
  decimals: ${market?.decimals ?? 6},
  symbol: ${q(symbol)},
}`;
}

export function embeddedSnippet(bp: Blueprint, market: Market | null) {
  return `import { useMemo } from "react";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { useWalletClient } from "wagmi"; // or Privy / Dynamic / Coinbase Smart Wallet
import { createViemEarnAdapter } from "@/widget/viemAdapter";

const publicClient = createPublicClient({ chain: base, transport: http() });

const reserve = ${reserveLiteral(market, bp.recommendation.asset)};

/** The user's embedded wallet signs approve + supply. ${bp.partner.name} never holds funds. */
export function useEarnAdapter() {
  const { data: walletClient } = useWalletClient();
  return useMemo(
    () => (walletClient ? createViemEarnAdapter({ publicClient, walletClient, reserve }) : null),
    [walletClient],
  );
}`;
}

export function omnibusServerSnippet(bp: Blueprint, market: Market | null) {
  const fee = Math.round(bp.businessCase.partnerFee * 100);
  return `// server/earn.ts — pooled custody: one treasury wallet supplies to Aave,
// each user owns a share of it in ${bp.partner.name}'s ledger.
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { approveIfNeeded, supply, withdraw, toUnits } from "@/widget/aave";
import { poolAbi } from "@/widget/abi";
import { treasury } from "./treasury"; // MPC or multisig-backed viem WalletClient
import { db } from "./db";

const RAY = 10n ** 27n;
const publicClient = createPublicClient({ chain: base, transport: http() });
const reserve = ${reserveLiteral(market, bp.recommendation.asset)};

/** Aave's running interest index for this asset. Balances are scaled by it, so nothing is rewritten as interest accrues. */
const index = () =>
  publicClient.readContract({ address: reserve.pool, abi: poolAbi, functionName: "getReserveNormalizedIncome", args: [reserve.asset] });

export async function deposit(userId: string, amount: number) {
  const units = toUnits(amount, reserve.decimals);
  await approveIfNeeded(publicClient, treasury, reserve, units);
  const hash = await supply(publicClient, treasury, reserve, units);
  // Store the scaled amount, exactly like aTokens do internally.
  await db.earn.addScaled(userId, (units * RAY) / (await index()), { principal: units });
  return { hash };
}

export async function balance(userId: string) {
  const { scaled, principal } = await db.earn.get(userId);
  const gross = (scaled * (await index())) / RAY;
  const interest = gross > principal ? gross - principal : 0n;
  // ${bp.partner.name} keeps ${fee}% of the interest as its fee.
  return gross - (interest * ${fee}n) / 100n;
}

export async function withdrawFor(userId: string, amount: number) {
  const units = toUnits(amount, reserve.decimals);
  const hash = await withdraw(publicClient, treasury, reserve, units);
  await db.earn.removeScaled(userId, (units * RAY) / (await index()));
  return { hash };
}`;
}

export function omnibusClientSnippet() {
  return `import type { EarnAdapter } from "@/widget/types";

const post = (path: string, body: unknown) =>
  fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
    .then((r) => (r.ok ? r.json() : Promise.reject(new Error("Request failed"))));

/** The widget talks to your backend; the backend talks to Aave. */
export const earnAdapter: EarnAdapter = {
  getState: () => fetch("/api/earn").then((r) => r.json()),
  async deposit(amount, onStep) {
    const { hash } = await post("/api/earn/deposit", { amount });
    onStep?.("supply", hash);
  },
  async withdraw(amount, onStep) {
    const { hash } = await post("/api/earn/withdraw", { amount });
    onStep?.("withdraw", hash);
  },
};

export const useEarnAdapter = () => earnAdapter;`;
}
