export type DeskMode = "treasury" | "protocol";

export type WatchItem = {
  address: string;
  label: string;
  role: string;
};

export type ConnectionState = "idle" | "connecting" | "live" | "disconnected" | "error";

export type SlotTick = {
  slot: number;
  parent?: number;
  root?: number;
  at: number;
};

export type WireEvent = {
  id: string;
  signature: string;
  slot: number;
  err: unknown;
  logs: string[];
  watched?: string;
  receivedAt: number;
  parse?: ParsedTx | null;
  parseState: "pending" | "ready" | "skipped" | "error";
};

export type ParsedTx = {
  signature: string;
  description?: string;
  type?: string;
  source?: string;
  fee?: number;
  feePayer?: string;
  slot?: number;
  timestamp?: number;
  nativeTransfers?: NativeTransfer[];
  tokenTransfers?: TokenTransfer[];
};

export type NativeTransfer = {
  fromUserAccount?: string;
  toUserAccount?: string;
  amount?: number;
};

export type TokenTransfer = {
  fromUserAccount?: string;
  toUserAccount?: string;
  mint?: string;
  tokenAmount?: number | string;
  tokenStandard?: string;
  symbol?: string;
};

export type AccountTick = {
  watched: string;
  lamports: number;
  slot: number;
};

export type Dossier = {
  address: string;
  gated: {
    identity: boolean;
    fundedBy: boolean;
  };
  identity?: {
    name?: string;
    category?: string;
    tags?: string[];
  } | null;
  fundedBy?: {
    funder?: string;
    amount?: number;
    signature?: string;
  } | null;
  balances: {
    sol: number | null;
    totalUsd: number | null;
    tokens: DossierToken[];
  };
  history: HistoryRow[];
  transfers: TransferRow[];
};

export type DossierToken = {
  mint: string;
  symbol: string;
  name: string;
  amount: number;
  usd: number | null;
  image?: string;
};

export type HistoryRow = {
  signature: string;
  timestamp: number | null;
  fee: number | null;
  error: unknown;
  description?: string;
  type?: string;
  balanceChanges: { mint: string; amount: number; symbol?: string }[];
};

export type TransferRow = {
  signature?: string;
  timestamp?: number | null;
  mint?: string;
  symbol?: string;
  amount?: number;
  from?: string;
  to?: string;
  counterparty?: string;
  direction?: string;
};
