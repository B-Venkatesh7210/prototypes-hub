import { enhancedAddressHistory, getAssetsByOwner, sleep, walletGet, type DasAsset } from "@/lib/helius";
import { isPubkey, mintSymbol, NATIVE_SOL_MINT } from "@/lib/format";
import type { Dossier, DossierToken, HistoryRow, TransferRow } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ address: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { address } = await ctx.params;
  if (!isPubkey(address)) {
    return Response.json({ error: "Invalid address" }, { status: 400 });
  }

  // Free plan: Wallet + Enhanced share a 2 req/s cap. Do not fire them in parallel.
  const dasPromise = getAssetsByOwner(address).catch(() => null);
  const balancesRes = await walletGet(`/v1/wallet/${address}/balances`);
  await sleep(550);
  const historyRes = await walletGet(`/v1/wallet/${address}/history?limit=20&tokenAccounts=balanceChanged`);
  await sleep(550);
  const transfersRes = await walletGet(`/v1/wallet/${address}/transfers?limit=20`);
  await sleep(550);
  const identityRes = await walletGet(`/v1/wallet/${address}/identity`);
  const fundedRes = await walletGet(`/v1/wallet/${address}/funded-by`);
  const das = await dasPromise;

  const balancesJson = balancesRes.ok ? await readJson(balancesRes) : {};
  let historyJson = historyRes.ok ? await readJson(historyRes) : { data: [] };
  const transfersJson = transfersRes.ok ? await readJson(transfersRes) : { data: [] };

  let history = normalizeHistory(historyJson);
  if (!history.length) {
    const enhanced = await enhancedAddressHistory(address, 12);
    history = enhancedToHistory(enhanced as Record<string, unknown>[]);
  }

  const tokens = mergeTokens(balancesJson, das?.items ?? []);
  const native = extractSol(balancesJson, das, tokens);

  const dossier: Dossier = {
    address,
    gated: {
      identity: !identityRes.ok,
      fundedBy: !fundedRes.ok,
    },
    identity: identityRes.ok ? await readJson(identityRes) : null,
    fundedBy: fundedRes.ok ? await readJson(fundedRes) : null,
    balances: {
      sol: native.sol,
      totalUsd: native.usd,
      tokens,
    },
    history,
    transfers: normalizeTransfers(transfersJson, address),
  };

  return Response.json(dossier);
}

async function readJson(res: Response) {
  try {
    return await res.json();
  } catch {
    return {};
  }
}

function pickRows(payload: unknown, keys: string[]) {
  if (Array.isArray(payload)) return payload as Record<string, unknown>[];
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of keys) {
      if (Array.isArray(record[key])) return record[key] as Record<string, unknown>[];
    }
  }
  return [] as Record<string, unknown>[];
}

function num(value: unknown) {
  const n = typeof value === "string" ? Number(value) : typeof value === "number" ? value : NaN;
  return Number.isFinite(n) ? n : 0;
}

function extractSol(
  balances: Record<string, unknown>,
  das: { items?: DasAsset[]; nativeBalance?: { lamports?: number } } | null,
  tokens: DossierToken[],
) {
  const rows = pickRows(balances, ["balances", "tokens"]);
  const solRow = rows.find((row) => {
    const mint = String(row.mint ?? "");
    const symbol = String(row.symbol ?? "");
    return symbol === "SOL" || mint === NATIVE_SOL_MINT;
  });

  const solFromRow = solRow ? num(solRow.balance ?? solRow.amount ?? solRow.solana) : 0;
  const solFromDas = typeof das?.nativeBalance?.lamports === "number" ? das.nativeBalance.lamports / 1e9 : 0;
  const sol = solFromRow || solFromDas || null;

  const usd =
    typeof balances.totalUsdValue === "number"
      ? balances.totalUsdValue
      : tokens.reduce((sum, token) => sum + (token.usd ?? 0), 0) || null;

  return {
    sol: sol && sol > 0 ? sol : null,
    usd: usd && usd > 0 ? usd : null,
  };
}

function mergeTokens(balances: Record<string, unknown>, dasItems: DasAsset[]): DossierToken[] {
  const rows = pickRows(balances, ["balances", "tokens"]);
  const fromWallet = rows
    .map((token) => {
      const mint = String(token.mint ?? "");
      const meta = (token.metadata as Record<string, unknown> | undefined) ?? {};
      return {
        mint,
        symbol: mintSymbol(mint, String(token.symbol ?? meta.symbol ?? "") || null),
        name: String(token.name ?? meta.name ?? "Token"),
        amount: num(token.balance ?? token.amount),
        usd: typeof token.usdValue === "number" ? token.usdValue : typeof token.usd === "number" ? token.usd : null,
        image: String(token.logoUri ?? token.image ?? meta.image ?? ""),
      } satisfies DossierToken;
    })
    .filter((token) => token.amount > 0 && token.mint !== NATIVE_SOL_MINT);

  const list =
    fromWallet.length > 0
      ? fromWallet
      : dasItems
          .map((item) => {
            const info = item.token_info;
            const decimals = info?.decimals ?? 0;
            const raw = info?.balance ?? 0;
            const amount = decimals ? raw / 10 ** decimals : raw;
            const mint = item.id ?? "";
            return {
              mint,
              symbol: mintSymbol(mint, info?.symbol || item.content?.metadata?.symbol || null),
              name: item.content?.metadata?.name || "Asset",
              amount,
              usd: info?.price_info?.total_price ?? null,
              image:
                item.content?.links?.image ||
                item.content?.files?.find((file) => file.cdn_uri || file.uri)?.cdn_uri ||
                item.content?.files?.[0]?.uri,
            } satisfies DossierToken;
          })
          .filter((token) => token.amount > 0 && token.mint !== NATIVE_SOL_MINT);

  return list
    .sort((a, b) => (b.usd ?? -1) - (a.usd ?? -1))
    .filter((token, index) => (token.usd != null && token.usd > 1) || index < 6)
    .slice(0, 10);
}

function normalizeHistory(payload: unknown): HistoryRow[] {
  return pickRows(payload, ["data", "transactions"]).map((row) => ({
    signature: String(row.signature ?? ""),
    timestamp: typeof row.timestamp === "number" ? row.timestamp : null,
    fee: typeof row.fee === "number" ? row.fee : null,
    error: row.error ?? row.err ?? null,
    description: typeof row.description === "string" ? row.description : undefined,
    type: typeof row.type === "string" ? row.type : undefined,
    balanceChanges: Array.isArray(row.balanceChanges)
      ? (row.balanceChanges as { mint?: string; amount?: number }[]).map((change) => ({
          mint: String(change.mint ?? NATIVE_SOL_MINT),
          amount: Number(change.amount ?? 0),
          symbol: mintSymbol(String(change.mint ?? NATIVE_SOL_MINT)),
        }))
      : [],
  }));
}

function enhancedToHistory(rows: Record<string, unknown>[]): HistoryRow[] {
  return rows.map((row) => ({
    signature: String(row.signature ?? ""),
    timestamp: typeof row.timestamp === "number" ? row.timestamp : null,
    fee: typeof row.fee === "number" ? row.fee : null,
    error: row.transactionError ?? row.error ?? null,
    description: typeof row.description === "string" ? row.description : undefined,
    type: typeof row.type === "string" ? row.type : undefined,
    balanceChanges: [],
  }));
}

function normalizeTransfers(payload: unknown, address: string): TransferRow[] {
  return pickRows(payload, ["data", "transfers"]).slice(0, 20).map((row) => {
    const direction = String(row.direction ?? "");
    const counterparty = String(row.counterparty ?? row.counterParty ?? "");
    const mint = String(row.mint ?? row.token ?? NATIVE_SOL_MINT);
    const from =
      String(row.fromUserAccount ?? row.from ?? row.sender ?? "") ||
      (direction === "in" ? counterparty : address);
    const to =
      String(row.toUserAccount ?? row.to ?? row.recipient ?? "") ||
      (direction === "out" ? counterparty : address);

    return {
      signature: String(row.signature ?? row.txSignature ?? ""),
      timestamp: typeof row.timestamp === "number" ? row.timestamp : null,
      mint,
      symbol: mintSymbol(mint, typeof row.symbol === "string" ? row.symbol : null),
      amount: num(row.amount),
      from,
      to,
      counterparty,
      direction,
    };
  });
}
