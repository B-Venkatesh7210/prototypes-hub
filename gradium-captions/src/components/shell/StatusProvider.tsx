"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import {
  ACCOUNT_EVENT,
  api,
  budgetLeft,
  currentAccount,
  LEDGER_EVENT,
  readLedger,
  refreshAccount,
  setSpendsCredits,
  type LedgerEntry,
} from "@/lib/client/api";
import { LIMITS } from "@/lib/limits";
import type { AccountCredits, ServiceStatus } from "@/lib/types";

type Budget = { live: number; mock: number };

type StatusValue = {
  status: ServiceStatus | null;
  isMock: boolean;
  ledger: LedgerEntry[];
  /** Credits left in today's demo budget, real and simulated. */
  budget: Budget;
  /** The real Gradium balance, live mode only. */
  account: AccountCredits | null;
  refresh: () => void;
  refreshAccount: () => void;
};

const FULL: Budget = { live: LIMITS.dailyCredits, mock: LIMITS.dailyCredits };

const StatusContext = createContext<StatusValue>({
  status: null,
  isMock: true,
  ledger: [],
  budget: FULL,
  account: null,
  refresh: () => undefined,
  refreshAccount: () => undefined,
});

export function StatusProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [ledger, setLedger] = useState<LedgerEntry[]>([]);
  const [budget, setBudget] = useState<Budget>(FULL);
  const [account, setAccount] = useState<AccountCredits | null>(null);

  const refresh = useCallback(() => {
    api
      .status()
      .then((next) => {
        setSpendsCredits(next.mode === "live");
        setStatus(next);
        if (next.mode === "live") void refreshAccount();
      })
      .catch(() => setStatus({ mode: "mock", hasKey: false, host: "api" }));
  }, []);

  useEffect(() => {
    refresh();
    const sync = () => {
      setLedger(readLedger());
      setBudget({ live: budgetLeft(false), mock: budgetLeft(true) });
    };
    const syncAccount = () => setAccount(currentAccount());
    sync();
    window.addEventListener(LEDGER_EVENT, sync);
    window.addEventListener("storage", sync);
    window.addEventListener(ACCOUNT_EVENT, syncAccount);
    return () => {
      window.removeEventListener(LEDGER_EVENT, sync);
      window.removeEventListener("storage", sync);
      window.removeEventListener(ACCOUNT_EVENT, syncAccount);
    };
  }, [refresh]);

  const reloadAccount = useCallback(() => void refreshAccount(), []);

  const value = useMemo(
    () => ({ status, isMock: status?.mode !== "live", ledger, budget, account, refresh, refreshAccount: reloadAccount }),
    [status, ledger, budget, account, refresh, reloadAccount],
  );
  return <StatusContext.Provider value={value}>{children}</StatusContext.Provider>;
}

export function useStatus() {
  return useContext(StatusContext);
}
