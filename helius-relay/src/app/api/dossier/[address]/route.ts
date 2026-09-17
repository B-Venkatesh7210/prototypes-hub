import { getAssetsByOwner, walletGet, type DasAsset } from "@/lib/helius";
import { isPubkey } from "@/lib/format";
import type { Dossier, DossierToken, HistoryRow, TransferRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ address: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { address } = await ctx.params;
  if (!isPubkey(address)) {
    return Response.json({ error: "Invalid address" }, { status: 400 });
  }

  const [balancesRes, historyRes, transfersRes, identityRes, fundedRes, das] =
    await Promise.all([
      walletGet(`/v1/wallet/${address}/balances`),
      walletGet(`/v1/wallet/${address}/history?limit=20&tokenAccounts=balanceChanged`),
      walletGet(`/v1/wallet/${address}/transfers?limit=20`),
      walletGet(`/v1/wallet/${address}/identity`),
      walletGet(`/v1/wallet/${address}/funded-by`),
      getAssetsByOwner(address).catch(() => null),
    ]);

  const balancesJson = balancesRes.ok ? await balancesRes.json() : {};
  const historyJson = historyRes.ok ? await historyRes.json() : { data: [] };
  const transfersJson = transfersRes.ok ? await transfersRes.json() : { data: [] };

  const tokens = mergeTokens(balancesJson, das?.items ?? []);
  const native = extractSol(balancesJson, das);

  const dossier: Dossier = {
    address,
    gated: {
      identity: identityRes.status === 403,
      fundedBy: fundedRes.status === 403,
    },
    identity: identityRes.ok ? await identityRes.json() : null,
    fundedBy: fundedRes.ok ? await fundedRes.json() : null,
    balances: {
      sol: native.sol,
      totalUsd: native.usd,
      tokens,
    },
    history: normalizeHistory(historyJson),
    transfers: normalizeTransfers(transfersJson),
  };

  return Response.json(dossier);
}

function extractSol(balances: Record<string, unknown>, das: { items?: DasAsset[]; nativeBalance?: { lamports?: number; price_per_sol?: number } } | null) {
  const native = balances.nativeBalance as
    | {
        lamports?: number;
        amount?: number;
        solana?: number;
        usdValue?: number;
        usd?: number;
      }
    | undefined;

  const sol =
    native?.solana ??
    native?.amount ??
    (typeof native?.lamports === "number" ? native.lamports / 1e9 : null) ??
    (typeof das && "nativeBalance" in (das ?? {})
      ? Number((das as { nativeBalance?: { lamports?: number } }).nativeBalance?.lamports ?? 0) / 1e9
      : null);

  const usd =
    native?.usdValue ??
    native?.usd ??
    (typeof (balances.totalUsdValue) === "number" ? (balances.totalUsdValue as number) : null);

  return { sol: typeof sol === "number" && !Number.isNaN(sol) ? sol : null, usd };
}

function mergeTokens(balances: Record<string, unknown>, dasItems: DasAsset[]): DossierToken[] {
  const fromWallet = Array.isArray(balances.tokens)
    ? (balances.tokens as Record<string, unknown>[]).map((token) => {
        const meta = (token.metadata as Record<string, unknown> | undefined) ?? {};
        return {
          mint: String(token.mint ?? ""),
          symbol: String(token.symbol ?? meta.symbol ?? "UNK"),
          name: String(token.name ?? meta.name ?? "Token"),
          amount: Number(token.amount ?? token.balance ?? 0),
          usd:
            typeof token.usdValue === "number"
              ? token.usdValue
              : typeof token.usd === "number"
                ? token.usd
                : null,
          image: String(token.image ?? meta.image ?? ""),
        } satisfies DossierToken;
      })
    : [];

  if (fromWallet.length) return fromWallet.filter((t) => t.amount > 0).slice(0, 16);

  return dasItems
    .map((item) => {
      const info = item.token_info;
      const decimals = info?.decimals ?? 0;
      const raw = info?.balance ?? 0;
      const amount = decimals ? raw / 10 ** decimals : raw;
      const image =
        item.content?.links?.image ||
        item.content?.files?.find((f) => f.cdn_uri || f.uri)?.cdn_uri ||
        item.content?.files?.[0]?.uri;
      return {
        mint: item.id ?? "",
        symbol: info?.symbol || item.content?.metadata?.symbol || "UNK",
        name: item.content?.metadata?.name || "Asset",
        amount,
        usd: info?.price_info?.total_price ?? null,
        image,
      } satisfies DossierToken;
    })
    .filter((t) => t.amount > 0)
    .slice(0, 16);
}

function normalizeHistory(payload: Record<string, unknown>): HistoryRow[] {
  const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return (rows as Record<string, unknown>[]).map((row) => ({
    signature: String(row.signature ?? ""),
    timestamp: typeof row.timestamp === "number" ? row.timestamp : null,
    fee: typeof row.fee === "number" ? row.fee : null,
    error: row.error ?? row.err ?? null,
    balanceChanges: Array.isArray(row.balanceChanges)
      ? (row.balanceChanges as { mint?: string; amount?: number }[]).map((change) => ({
          mint: String(change.mint ?? "SOL"),
          amount: Number(change.amount ?? 0),
        }))
      : [],
  }));
}

function normalizeTransfers(payload: Record<string, unknown>): TransferRow[] {
  const rows = Array.isArray(payload.data) ? payload.data : Array.isArray(payload) ? payload : [];
  return (rows as Record<string, unknown>[]).slice(0, 20).map((row) => ({
    signature: String(row.signature ?? row.txSignature ?? ""),
    timestamp: typeof row.timestamp === "number" ? row.timestamp : null,
    mint: String(row.mint ?? row.token ?? "SOL"),
    amount: Number(row.amount ?? 0),
    from: String(row.fromUserAccount ?? row.from ?? row.sender ?? ""),
    to: String(row.toUserAccount ?? row.to ?? row.recipient ?? ""),
    direction: String(row.direction ?? ""),
  }));
}
