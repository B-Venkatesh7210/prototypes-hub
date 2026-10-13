"use client";

import Link from "next/link";
import { useSyncExternalStore } from "react";
import { PartnerLogo } from "@/components/brand/PartnerLogo";
import { Eyebrow } from "@/components/ui/primitives";
import { readRecent, subscribeRecent, type RecentItem } from "@/lib/client/recent";

const NONE: RecentItem[] = [];

export function RecentBlueprints() {
  const items = useSyncExternalStore(subscribeRecent, readRecent, () => NONE);
  if (!items.length) return null;
  return (
    <div>
      <Eyebrow>Your blueprints</Eyebrow>
      <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((r) => (
          <Link
            key={r.id}
            href={`/p/${r.id}`}
            className="flex items-center gap-3 rounded-2xl border border-line bg-surface/50 p-3 transition-colors hover:border-white/20"
          >
            <PartnerLogo name={r.name} logo={r.logo} color={r.color} size={36} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{r.name}</p>
              <p className="truncate text-xs text-muted">{r.domain ?? r.category}</p>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
