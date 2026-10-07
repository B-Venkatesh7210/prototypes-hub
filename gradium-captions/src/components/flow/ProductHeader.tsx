import type { ReactNode } from "react";
import { Eyebrow } from "@/components/ui/primitives";

export function ProductHeader({
  eyebrow,
  muted,
  bright,
  children,
  apis,
}: {
  eyebrow: string;
  muted: string;
  bright: string;
  children?: ReactNode;
  apis?: string[];
}) {
  return (
    <section className="hero-fade px-6 pt-16 pb-10">
      <div className="container-medium flex flex-col items-start">
        <Eyebrow className="mb-4">{eyebrow}</Eyebrow>
        <h1 className="max-w-3xl font-favorit text-[2rem] leading-none md:text-[3.25rem]">
          <span className="block text-lightgray">{muted}</span>
          <span className="block text-white">{bright}</span>
        </h1>
        {children ? <p className="mt-4 max-w-2xl font-plex text-base leading-normal text-lightgray">{children}</p> : null}
        {apis?.length ? (
          <div className="mt-6 flex flex-wrap gap-1.5">
            {apis.map((a) => (
              <span key={a} className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 font-code text-[0.6875rem] text-bright/80">
                {a}
              </span>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  );
}
