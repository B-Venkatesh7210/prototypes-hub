"use client";

import { formatSlot, shorten, timeAgo, txTypeLabel } from "@/lib/format";
import type { ConnectionState, DeskMode, WireEvent } from "@/lib/types";

type Props = {
  mode: DeskMode;
  connection: ConnectionState;
  events: WireEvent[];
  failCount: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAddress: (address: string) => void;
};

export function LiveWire({
  mode,
  connection,
  events,
  failCount,
  selectedId,
  onSelect,
  onAddress,
}: Props) {
  return (
    <section className="flex flex-col min-h-0 min-w-0 bg-[var(--bg)]">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--line)]">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--faint)]">Live wire</div>
          <div className="text-[15px] font-semibold tracking-[-0.03em]">
            {mode === "protocol" ? "Confirmed program mentions" : "Treasury movement"}
          </div>
        </div>
        <div className="text-right text-[11px] text-[var(--mute)]">
          <div>{events.length} on desk</div>
          <div className={failCount ? "text-[var(--fail)]" : ""}>
            {failCount ? `${failCount} failed` : "No failed txs"}
          </div>
        </div>
      </div>

      <div className="panel-scroll flex-1">
        {events.length === 0 ? (
          <EmptyWire connection={connection} mode={mode} />
        ) : (
          events.map((event) => (
            <EventRow
              key={event.id}
              event={event}
              selected={selectedId === event.id}
              onSelect={() => onSelect(event.id)}
              onAddress={onAddress}
            />
          ))
        )}
      </div>
    </section>
  );
}

function EmptyWire({ connection, mode }: { connection: ConnectionState; mode: DeskMode }) {
  return (
    <div className="h-full min-h-[280px] flex items-center justify-center px-10 text-center">
      <div>
        <div className="text-[13px] text-[var(--ink)]">
          {connection === "connecting" ? "Opening LaserStream…" : "Listening for mentions"}
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-[var(--mute)] max-w-[360px]">
          {mode === "protocol"
            ? "Free plan does not subscribe to Jupiter. We watch vaults and tip routers — the accounts that page on-call."
            : "Confirmed logs for watched wallets land here, then Enhanced parse turns them into English."}
        </p>
      </div>
    </div>
  );
}

function EventRow({
  event,
  selected,
  onSelect,
  onAddress,
}: {
  event: WireEvent;
  selected: boolean;
  onSelect: () => void;
  onAddress: (address: string) => void;
}) {
  const failed = event.err != null;
  const title =
    event.parse?.description ||
    (event.parseState === "pending" ? "Parsing transaction…" : failed ? "Failed transaction" : "Confirmed transaction");
  const type = txTypeLabel(event.parse?.type);

  return (
    <button
      onClick={onSelect}
      className={`event-in w-full text-left px-4 py-3 border-b border-[var(--line)] border-l-2 transition ${
        failed ? "border-l-[var(--fail)]" : "border-l-transparent"
      } ${selected ? "bg-[var(--panel-2)]" : "hover:bg-[var(--panel)]"}`}
    >
      <div className="flex items-center justify-between gap-3">
        <span
          className={`text-[10px] uppercase tracking-[0.14em] ${
            failed ? "text-[var(--fail)]" : "text-[var(--signal)]"
          }`}
        >
          {failed ? "Failed" : type}
        </span>
        <span className="mono text-[11px] text-[var(--faint)] tabular-nums">{timeAgo(event.receivedAt)}</span>
      </div>
      <div className="mt-1 text-[13px] leading-snug">{title}</div>
      <div className="mt-2 flex items-center gap-3 text-[11px] text-[var(--mute)]">
        <span className="mono">{shorten(event.signature, 6)}</span>
        {event.slot ? <span className="mono tabular-nums">slot {formatSlot(event.slot)}</span> : null}
        {event.watched ? (
          <span
            className="mono hover:text-[var(--ink)]"
            onClick={(click) => {
              click.stopPropagation();
              onAddress(event.watched!);
            }}
          >
            {shorten(event.watched, 4)}
          </span>
        ) : null}
        {event.parseState === "skipped" ? <span className="text-[var(--warn)]">sampled</span> : null}
      </div>
    </button>
  );
}
