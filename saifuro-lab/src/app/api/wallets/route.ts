import { EXPLORER, FAUCET, MAINNET_EXPLORER, mainnetBuyerAccount, mainnetUsdc, paymentsMode } from "@/lib/payments";

export const dynamic = "force-dynamic";

export type Wallets = {
  sepolia: { live: boolean; reason?: string; address: string | null; balance: string | null; href: string };
  mainnet: { address: string | null; balance: string | null; href: string | null };
};

export async function GET() {
  const [payments, balance] = await Promise.all([paymentsMode(), mainnetUsdc()]);
  const live = payments.mode === "live";
  const main = mainnetBuyerAccount()?.address ?? null;
  const body: Wallets = {
    sepolia: {
      live,
      reason: payments.reason,
      address: payments.buyer ?? null,
      balance: payments.balance ?? null,
      href: live && payments.buyer ? `${EXPLORER}/address/${payments.buyer}` : FAUCET,
    },
    mainnet: { address: main, balance, href: main ? `${MAINNET_EXPLORER}/address/${main}` : null },
  };
  return Response.json(body);
}
