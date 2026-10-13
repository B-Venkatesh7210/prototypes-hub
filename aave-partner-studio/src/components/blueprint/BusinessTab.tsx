"use client";

import { useState } from "react";
import { Card, Eyebrow, Stat } from "@/components/ui/primitives";
import { fmtCompact, fmtPct, fmtUsd } from "@/lib/aave/math";
import { useMarket } from "@/lib/client/hooks";
import type { Blueprint } from "@/lib/types";

const RAMP_MONTHS = 6;

export function BusinessTab({ bp }: { bp: Blueprint }) {
  const { market } = useMarket(bp.recommendation.asset);
  const [users, setUsers] = useState(bp.businessCase.users);
  const [adoption, setAdoption] = useState(bp.businessCase.adoption);
  const [avgBalance, setAvgBalance] = useState(bp.businessCase.avgBalance);
  const [fee, setFee] = useState(bp.businessCase.partnerFee);

  const apy = market?.supplyApy ?? 0;
  const price = market?.priceUsd ?? 1;
  const depositors = users * adoption;
  const tvl = depositors * avgBalance;
  const gross = tvl * apy;
  const partner = gross * fee;
  const perUser = avgBalance * apy * (1 - fee);

  const marketUsd = (market?.totalSupplied ?? 0) * price;
  const share = marketUsd ? tvl / marketUsd : 0;
  // Supply APR ≈ borrow APR × utilization × (1 − reserve factor). New supply lowers utilization, so this is an upper bound.
  const apyAfter = marketUsd ? apy * (marketUsd / (marketUsd + tvl)) : 0;
  const capUsd = (market?.supplyCap ?? 0) * price;
  const headroom = capUsd ? Math.max(0, capUsd - marketUsd) : Infinity;

  const months = Array.from({ length: 12 }, (_, i) => {
    const ramp = Math.min(1, (i + 1) / RAMP_MONTHS);
    const monthTvl = tvl * ramp;
    return { m: i + 1, tvl: monthTvl, revenue: (monthTvl * apy * fee) / 12 };
  });
  const yearOneRevenue = months.reduce((s, x) => s + x.revenue, 0);
  const maxTvl = Math.max(...months.map((x) => x.tvl), 1);

  return (
    <div className="grid items-start gap-8 lg:grid-cols-[340px_1fr]">
      <Card className="flex flex-col gap-6 p-5">
        <Eyebrow>Assumptions</Eyebrow>
        <Slider
          label="Active users"
          value={fmtCompact(users)}
          min={0}
          max={100}
          step={1}
          raw={Math.round(((Math.log10(users) - 3) / 4) * 100)}
          onChange={(v) => setUsers(Math.round(10 ** (3 + (v / 100) * 4)))}
        />
        <Slider label="Use Earn in year one" value={fmtPct(adoption, 0)} min={1} max={50} step={1} raw={Math.round(adoption * 100)} onChange={(v) => setAdoption(v / 100)} />
        <Slider
          label="Average balance in Earn"
          value={fmtUsd(avgBalance, { decimals: 0 })}
          min={0}
          max={100}
          step={1}
          raw={Math.round(((Math.log10(avgBalance) - 1) / 4) * 100)}
          onChange={(v) => setAvgBalance(Math.round(10 ** (1 + (v / 100) * 4)))}
        />
        <Slider label={`${bp.partner.name}'s fee on yield`} value={fmtPct(fee, 0)} min={0} max={30} step={1} raw={Math.round(fee * 100)} onChange={(v) => setFee(v / 100)} />
        <p className="text-xs leading-relaxed text-dim">{bp.businessCase.note}</p>
        <p className="text-xs leading-relaxed text-dim">
          Aave doesn&apos;t pay referral fees. The partner&apos;s revenue here is a fee it keeps from the yield, the model most neobank earn products use.
        </p>
      </Card>

      <div className="flex min-w-0 flex-col gap-6">
        <Card className="grid grid-cols-2 gap-6 p-5 md:grid-cols-4">
          <Stat label="Deposits at full ramp" value={fmtUsd(tvl, { compact: true })} hint={`${fmtCompact(depositors)} depositors`} />
          <Stat label={`${bp.partner.name} revenue / yr`} value={fmtUsd(partner, { compact: true })} hint={`${fmtUsd(yearOneRevenue, { compact: true })} in year one`} />
          <Stat label="Paid to users / yr" value={fmtUsd(gross - partner, { compact: true })} hint={`${fmtUsd(perUser, { decimals: 0 })} per depositor`} />
          <Stat label="Live supply APY" value={market ? fmtPct(apy) : "—"} hint={`users get ${fmtPct(apy * (1 - fee))}`} />
        </Card>

        <Card className="p-5">
          <div className="flex items-baseline justify-between">
            <Eyebrow>Deposits, first 12 months</Eyebrow>
            <p className="text-xs text-dim">linear ramp to target over {RAMP_MONTHS} months</p>
          </div>
          <div className="mt-7 flex h-48 gap-2">
            {months.map((x) => (
              <div key={x.m} className="group flex flex-1 flex-col items-center gap-2">
                <div className="relative w-full flex-1">
                  <div
                    className="aave-gradient absolute bottom-0 w-full rounded-t-md opacity-80 transition-opacity group-hover:opacity-100"
                    style={{ height: `${(x.tvl / maxTvl) * 100}%` }}
                  />
                  <span className="absolute -top-5 left-1/2 hidden -translate-x-1/2 font-mono text-[0.625rem] whitespace-nowrap text-bright group-hover:block">
                    {fmtUsd(x.tvl, { compact: true })}
                  </span>
                </div>
                <span className="font-mono text-[0.625rem] text-dim">M{x.m}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-5">
          <Eyebrow>Market fit on Aave</Eyebrow>
          <div className="mt-4 grid gap-5 sm:grid-cols-3">
            <Stat label={`Share of ${bp.recommendation.asset} market`} value={fmtPct(share, 1)} hint={`of ${fmtUsd(marketUsd, { compact: true })} supplied`} />
            <Stat label="APY after these deposits" value={market ? `≤ ${fmtPct(apyAfter)}` : "—"} hint="upper bound; utilization drops" />
            <Stat
              label="Supply cap headroom"
              value={Number.isFinite(headroom) ? fmtUsd(headroom, { compact: true }) : "no cap"}
              hint={Number.isFinite(headroom) && tvl > headroom ? "exceeds headroom: talk to Aave risk" : "fits under the cap"}
            />
          </div>
          <p className="mt-4 text-xs leading-relaxed text-dim">
            Large new supply lowers utilization and therefore the rate. Partners above a few percent of a market should plan caps and rate expectations with
            Aave&apos;s risk service providers before launch.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Slider(props: { label: string; value: string; min: number; max: number; step: number; raw: number; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="flex items-baseline justify-between text-sm">
        <span className="text-muted">{props.label}</span>
        <span className="font-mono text-bright">{props.value}</span>
      </span>
      <input
        type="range"
        className="mt-2 w-full accent-[#5fd9e2]"
        min={props.min}
        max={props.max}
        step={props.step}
        value={props.raw}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
    </label>
  );
}
