/** What the widget shows. Amounts are in token units (e.g. 125.5 USDC). */
export type EarnState = {
  asset: string;
  /** Spendable balance in the user's wallet. */
  wallet: number;
  /** Current aToken balance: principal plus interest. */
  deposited: number;
  /** Net amount the user put in, if the adapter tracks it. Enables "earned so far". */
  principal?: number;
  /** Current supply APY, e.g. 0.052 for 5.2%. */
  apy: number;
  account?: string;
};

export type EarnStep = "approve" | "supply" | "withdraw";

export type EarnEvent =
  | { type: "view"; asset: string }
  | { type: "step"; step: EarnStep; txHash?: string }
  | { type: "deposited"; amount: number }
  | { type: "withdrew"; amount: number | "max" }
  | { type: "error"; message: string };

/**
 * The widget never touches a wallet itself. The partner supplies an adapter for their own wallet layer:
 * an embedded wallet in the browser, or their backend for pooled (omnibus) custody.
 */
export interface EarnAdapter {
  getState(): Promise<EarnState>;
  deposit(amount: number, onStep?: (step: EarnStep, txHash?: string) => void): Promise<void>;
  withdraw(amount: number | "max", onStep?: (step: EarnStep, txHash?: string) => void): Promise<void>;
}

export type EarnTheme = {
  mode?: "dark" | "light";
  accent?: string;
  radius?: number;
  font?: string;
};

export type EarnCopy = {
  title?: string;
  subtitle?: string;
  cta?: string;
};
