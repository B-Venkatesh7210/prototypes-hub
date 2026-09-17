"use client";

import type { ReactNode } from "react";
import { formatSol, formatTokenAmount, formatUsd, lamportsToSol, shorten, timeAgo } from "@/lib/format";
import type { DeskMode, Dossier, WireEvent } from "@/lib/types";

type Props = {
  mode: DeskMode;
  event: WireEvent | null;
  dossier: Dossier | null;
  dossierState: "idle" | "loading" | "error";
  selectedAddress?: string;
  onAddress: (address: string) => void;
};

export function DetailPane({ mode, event, dossier, dossierState, selectedAddress, onAddress }: Props) {
  const showDossier = Boolean(selectedAddress) && (!event || dossier?.address === selectedAddress);

  return (
    <aside className="flex flex-col min-h-0 border-l border-[var(--line)] bg-[var(--panel)]">
      <div className="px-4 py-3 border-b border-[var(--line)]">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--faint)]">
          {selectedAddress ? "Dossier" : event ? "Inspector" : "Context"}
        </div>
        <div className="text-[15px] font-semibold tracking-[-0.03em]">
          {selectedAddress
            ? shorten(selectedAddress, 6)
            : event
              ? "Transaction"
              : mode === "protocol"
                ? "On-call brief"
                : "Ops brief"}
        </div>
      </div>
      <div className="panel-scroll flex-1 p-4">
        {selectedAddress ? (
          <DossierView
            address={selectedAddress}
            dossier={dossier}
            state={dossierState}
            onAddress={onAddress}
          />
        ) : event ? (
          <EventView event={event} onAddress={onAddress} />
        ) : (
          <Brief mode={mode} />
        )}
      </div>
    </aside>
  );
}

function Brief({ mode }: { mode: DeskMode }) {
  if (mode === "protocol") {
    return (
      <div className="space-y-4 text-[13px] leading-relaxed text-[var(--mute)]">
        <p className="text-[var(--ink)]">You are on-call for a Solana protocol.</p>
        <p>
          Subscribe to vaults, admin, and the tip router — not the AMM program. A free LaserStream connection
          cannot carry every Jupiter swap, and it should not.
        </p>
        <p>Failed transactions stay on the wire even when we sample the rest.</p>
      </div>
    );
  }
  return (
    <div className="space-y-4 text-[13px] leading-relaxed text-[var(--mute)]">
      <p className="text-[var(--ink)]">You are watching company money move.</p>
      <p>
        LaserStream pushes confirmed mentions. Enhanced parse writes the English line. Wallet API + DAS open the
        USD book when you click an address.
      </p>
      <p>Identity and funded-by stay behind the Developer plan — the desk still works without them.</p>
    </div>
  );
}

function EventView({ event, onAddress }: { event: WireEvent; onAddress: (address: string) => void }) {
  const parsed = event.parse;
  const natives = parsed?.nativeTransfers ?? [];
  const tokens = parsed?.tokenTransfers ?? [];

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[13px] leading-snug text-[var(--ink)]">
          {parsed?.description || (event.err ? "Transaction failed before it could be described." : "Waiting on Enhanced parse…")}
        </div>
        <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-[var(--mute)]">
          {parsed?.type ? <Chip>{parsed.type}</Chip> : null}
          {parsed?.source ? <Chip>{parsed.source}</Chip> : null}
          {event.err ? <Chip tone="fail">FAILED</Chip> : null}
        </div>
      </div>

      <Meta label="Signature" value={event.signature} mono />
      {parsed?.feePayer ? (
        <Meta label="Fee payer" value={parsed.feePayer} mono onClick={() => onAddress(parsed.feePayer!)} />
      ) : null}
      {typeof parsed?.fee === "number" ? (
        <Meta label="Fee" value={`${formatSol(lamportsToSol(parsed.fee), 6)} SOL`} />
      ) : null}

      {natives.length ? (
        <div>
          <SectionLabel>SOL transfers</SectionLabel>
          <div className="space-y-2 mt-2">
            {natives.map((transfer, index) => (
              <div key={index} className="text-[12px] leading-relaxed">
                <span className="mono text-[var(--mute)]">{shorten(transfer.fromUserAccount ?? "", 4)}</span>
                <span className="text-[var(--faint)]"> → </span>
                <span className="mono text-[var(--mute)]">{shorten(transfer.toUserAccount ?? "", 4)}</span>
                <span className="ml-2 tabular-nums">{formatSol(lamportsToSol(transfer.amount ?? 0))} SOL</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {tokens.length ? (
        <div>
          <SectionLabel>Token transfers</SectionLabel>
          <div className="space-y-2 mt-2">
            {tokens.map((transfer, index) => (
              <div key={index} className="text-[12px] leading-relaxed">
                <span className="mono text-[var(--mute)]">{shorten(transfer.fromUserAccount ?? "", 4)}</span>
                <span className="text-[var(--faint)]"> → </span>
                <span className="mono text-[var(--mute)]">{shorten(transfer.toUserAccount ?? "", 4)}</span>
                <span className="ml-2 tabular-nums">
                  {formatTokenAmount(transfer.tokenAmount)} {shorten(transfer.mint ?? "", 3)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {event.logs.length ? (
        <div>
          <SectionLabel>Program logs</SectionLabel>
          <pre className="mt-2 mono text-[10px] leading-5 text-[var(--mute)] whitespace-pre-wrap break-all">
            {event.logs.join("\n")}
          </pre>
        </div>
      ) : null}

      <a
        href={`https://orbmarkets.io/tx/${event.signature}`}
        target="_blank"
        rel="noreferrer"
        className="inline-block text-[11px] uppercase tracking-[0.16em] text-[var(--faint)] hover:text-[var(--ink)]"
      >
        Open in Orb →
      </a>
    </div>
  );
}

function DossierView({
  address,
  dossier,
  state,
  onAddress,
}: {
  address: string;
  dossier: Dossier | null;
  state: "idle" | "loading" | "error";
  onAddress: (address: string) => void;
}) {
  if (state === "loading") {
    return <div className="text-[13px] text-[var(--mute)]">Opening dossier…</div>;
  }
  if (state === "error") {
    return <div className="text-[13px] text-[var(--fail)]">Wallet API / DAS request failed. Check credits and the address.</div>;
  }
  if (!dossier) {
    return <div className="text-[13px] text-[var(--mute)]">Select an address.</div>;
  }

  const identityName = dossier.identity && typeof dossier.identity === "object" ? dossier.identity.name : null;

  return (
    <div className="space-y-5">
      <div>
        <div className="text-[18px] font-semibold tracking-[-0.03em]">{identityName || "Unlabeled wallet"}</div>
        <button
          className="mono text-[11px] text-[var(--mute)] hover:text-[var(--ink)]"
          onClick={() => navigator.clipboard.writeText(address)}
        >
          {address}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="SOL" value={dossier.balances.sol != null ? `${formatSol(dossier.balances.sol)}` : "—"} />
        <Stat label="Book" value={formatUsd(dossier.balances.totalUsd)} />
      </div>

      {dossier.gated.identity || dossier.gated.fundedBy ? (
        <div className="rounded-lg border border-[var(--line)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--mute)]">
          Identity and funding source are Developer-plan Wallet API endpoints. The rest of this dossier is live on
          Free.
        </div>
      ) : null}

      <div>
        <SectionLabel>Holdings</SectionLabel>
        <div className="mt-2 space-y-2">
          {dossier.balances.tokens.length === 0 ? (
            <div className="text-[12px] text-[var(--faint)]">No fungible holdings on the first page.</div>
          ) : (
            dossier.balances.tokens.map((token) => (
              <div key={token.mint} className="flex items-center justify-between gap-3 text-[12px]">
                <div className="flex items-center gap-2 min-w-0">
                  {token.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={token.image} alt="" className="h-5 w-5 rounded-full bg-[var(--panel-2)]" />
                  ) : (
                    <span className="h-5 w-5 rounded-full bg-[var(--panel-2)]" />
                  )}
                  <span className="truncate">{token.symbol}</span>
                </div>
                <div className="tabular-nums text-[var(--mute)]">
                  {formatSol(token.amount, 2)}
                  {token.usd != null ? ` · ${formatUsd(token.usd)}` : ""}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      <div>
        <SectionLabel>Recent history</SectionLabel>
        <div className="mt-2 space-y-3">
          {dossier.history.length === 0 ? (
            <div className="text-[12px] text-[var(--faint)]">No parsed history.</div>
          ) : (
            dossier.history.slice(0, 8).map((row) => (
              <div key={row.signature} className="text-[12px]">
                <div className="flex justify-between gap-3">
                  <span className="mono text-[var(--mute)]">{shorten(row.signature, 5)}</span>
                  <span className="text-[var(--faint)]">
                    {row.timestamp ? timeAgo(row.timestamp * 1000) : ""}
                  </span>
                </div>
                <div className="mt-1 text-[var(--mute)]">
                  {row.balanceChanges
                    .slice(0, 3)
                    .map((change) => `${change.amount > 0 ? "+" : ""}${formatSol(change.amount, 3)} ${shorten(change.mint, 3)}`)
                    .join(" · ") || "No balance delta"}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {dossier.transfers.length ? (
        <div>
          <SectionLabel>Transfers</SectionLabel>
          <div className="mt-2 space-y-2">
            {dossier.transfers.slice(0, 6).map((row, index) => (
              <div key={`${row.signature}-${index}`} className="text-[12px] text-[var(--mute)]">
                <span className="mono">{shorten(row.from || "", 4)}</span>
                <span className="text-[var(--faint)]"> → </span>
                <button className="mono hover:text-[var(--ink)]" onClick={() => row.to && onAddress(row.to)}>
                  {shorten(row.to || "", 4)}
                </button>
                <span className="ml-2 tabular-nums">
                  {formatSol(row.amount ?? 0, 3)} {shorten(row.mint || "SOL", 3)}
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--faint)]">{children}</div>;
}

function Chip({ children, tone }: { children: ReactNode; tone?: "fail" }) {
  return (
    <span
      className={`px-1.5 py-0.5 rounded text-[10px] uppercase tracking-[0.12em] ${
        tone === "fail" ? "bg-[var(--fail-dim)] text-[var(--fail)]" : "bg-[var(--panel-2)] text-[var(--mute)]"
      }`}
    >
      {children}
    </span>
  );
}

function Meta({
  label,
  value,
  mono,
  onClick,
}: {
  label: string;
  value: string;
  mono?: boolean;
  onClick?: () => void;
}) {
  return (
    <div>
      <SectionLabel>{label}</SectionLabel>
      <button
        className={`mt-1 text-[12px] text-left break-all ${mono ? "mono" : ""} ${
          onClick ? "hover:text-[var(--signal)]" : "text-[var(--mute)]"
        }`}
        onClick={onClick}
        disabled={!onClick}
      >
        {value}
      </button>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-[var(--line)] px-3 py-2.5">
      <div className="text-[10px] uppercase tracking-[0.16em] text-[var(--faint)]">{label}</div>
      <div className="mt-1 text-[16px] font-semibold tabular-nums tracking-[-0.03em]">{value}</div>
    </div>
  );
}
