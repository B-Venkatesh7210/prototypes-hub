"use client";

import { useEffect, useMemo } from "react";
import { forkAdapter, simulatedAdapter, type DemoAdapter } from "./adapters";
import { useMarket, useStatus } from "./hooks";

/** The fork adapter when the server has a Base fork, otherwise the simulated one on live rates. */
export function useDemoAdapter(asset: string): DemoAdapter | null {
  const status = useStatus();
  const { market } = useMarket(asset);
  const mode = status?.sandbox.mode;

  const adapter = useMemo(() => {
    if (!mode) return null;
    return mode === "fork" ? forkAdapter(asset) : simulatedAdapter(asset);
  }, [mode, asset]);

  useEffect(() => {
    if (market) adapter?.setApy?.(market.supplyApy);
  }, [adapter, market]);

  return adapter;
}
