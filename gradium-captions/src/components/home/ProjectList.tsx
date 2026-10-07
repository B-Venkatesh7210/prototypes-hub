"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { db } from "@/lib/client/db";
import { LANG_ACCENT } from "@/lib/langs";
import type { Product, Project } from "@/lib/types";
import { formatTime } from "@/lib/words";
import { Trash } from "@/components/ui/icons";

const PRODUCT_LABEL: Record<Product, string> = {
  dub: "Record once",
  script: "Script",
  live: "Live",
};

function ago(ts: number) {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return new Date(ts).toLocaleDateString();
}

export function ProjectList({ limit, emptyHint = true }: { limit?: number; emptyHint?: boolean }) {
  const [projects, setProjects] = useState<Project[] | null>(null);

  useEffect(() => {
    db.listProjects()
      .then(setProjects)
      .catch(() => setProjects([]));
  }, []);

  if (projects === null) return <div className="h-24" />;
  const shown = limit ? projects.slice(0, limit) : projects;
  if (!shown.length) {
    return emptyHint ? (
      <div className="rounded-xl border border-dashed border-white/10 px-6 py-10 text-center font-plex text-sm text-lightgray">
        No projects yet. Pick one of the three products above to make your first one.
      </div>
    ) : null;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {shown.map((p) => {
        const duration = Math.max(0, ...p.tracks.map((t) => t.duration));
        return (
          <div key={p.id} className="group relative rounded-xl border border-white/10 bg-white/[0.02] transition-colors hover:bg-white/[0.04]">
            <Link href={`/studio/${p.id}`} className="flex flex-col gap-4 p-4">
              <div className="flex items-center justify-between">
                <span className="font-komuna text-[0.6875rem] tracking-[0.12em] text-lightgray uppercase">
                  {PRODUCT_LABEL[p.product]}
                </span>
                <span className="font-plex text-xs text-lightgray">{ago(p.updatedAt)}</span>
              </div>
              <p className="line-clamp-2 font-plex text-[1.0625rem] leading-[1.2] text-bright group-hover:opacity-80">{p.title}</p>
              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {p.tracks.map((t) => (
                    <span
                      key={t.id}
                      className="rounded px-1.5 py-0.5 font-code text-[0.625rem] uppercase"
                      style={{ color: LANG_ACCENT[t.lang], backgroundColor: "rgba(255,255,255,0.05)" }}
                    >
                      {t.lang}
                    </span>
                  ))}
                </div>
                <span className="font-code text-xs text-lightgray">{formatTime(duration)}</span>
              </div>
            </Link>
            <button
              type="button"
              aria-label="Delete project"
              className="absolute top-3 right-3 hidden cursor-pointer rounded-md p-1.5 text-lightgray hover:bg-white/10 hover:text-red group-hover:block"
              onClick={async () => {
                if (!confirm(`Delete "${p.title}" and its audio?`)) return;
                await db.deleteProject(p);
                setProjects((list) => list?.filter((x) => x.id !== p.id) ?? null);
              }}
            >
              <Trash size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
