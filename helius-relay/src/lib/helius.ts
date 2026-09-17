const WALLET = "https://api.helius.xyz";
const RPC = "https://mainnet.helius-rpc.com";
const ENHANCED = "https://api.helius.xyz";

export function requireApiKey() {
  const key = process.env.HELIUS_API_KEY;
  if (!key) {
    throw new Error("Missing HELIUS_API_KEY");
  }
  return key;
}

export function rpcUrl(key: string) {
  return `${RPC}/?api-key=${key}`;
}

export async function heliusRpc<T>(method: string, params: unknown): Promise<T> {
  const key = requireApiKey();
  const res = await fetch(rpcUrl(key), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: method, method, params }),
    cache: "no-store",
  });
  const json = (await res.json()) as { result?: T; error?: { message?: string } };
  if (!res.ok || json.error) {
    throw new Error(json.error?.message || `RPC ${method} failed`);
  }
  return json.result as T;
}

export async function parseTransactions(signatures: string[]) {
  const key = requireApiKey();
  const res = await fetch(`${ENHANCED}/v0/transactions/?api-key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ transactions: signatures.slice(0, 20) }),
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(text || `Parse failed (${res.status})`);
  }
  return res.json();
}

export async function walletGet(path: string) {
  const key = requireApiKey();
  const res = await fetch(`${WALLET}${path}${path.includes("?") ? "&" : "?"}api-key=${key}`, {
    cache: "no-store",
    headers: { "X-Api-Key": key },
  });
  return res;
}

export async function getAssetsByOwner(ownerAddress: string) {
  return heliusRpc<{ items?: DasAsset[] }>("getAssetsByOwner", {
    ownerAddress,
    page: 1,
    limit: 24,
    displayOptions: { showFungible: true, showNativeBalance: true },
  });
}

export type DasAsset = {
  id?: string;
  content?: {
    metadata?: { name?: string; symbol?: string };
    links?: { image?: string };
    files?: { uri?: string; cdn_uri?: string }[];
  };
  token_info?: {
    balance?: number;
    decimals?: number;
    symbol?: string;
    price_info?: { price_per_token?: number; total_price?: number };
  };
  interface?: string;
};
