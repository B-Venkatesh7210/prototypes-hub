"use client";

import { useState } from "react";

/** The partner's icon, falling back to a monogram in their brand colour. */
export function PartnerLogo({ name, logo, color, size = 40, radius }: { name: string; logo?: string; color: string; size?: number; radius?: number }) {
  const [failed, setFailed] = useState(false);
  const r = radius ?? Math.round(size * 0.28);
  if (logo && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote partner favicons of unknown size
      <img
        src={logo}
        alt=""
        width={size}
        height={size}
        onError={() => setFailed(true)}
        className="shrink-0 bg-white object-contain"
        style={{ width: size, height: size, borderRadius: r, padding: Math.round(size * 0.12) }}
      />
    );
  }
  return (
    <span
      className="grid shrink-0 place-items-center font-semibold text-white"
      style={{ width: size, height: size, borderRadius: r, background: color, fontSize: size * 0.42 }}
    >
      {name.charAt(0).toUpperCase()}
    </span>
  );
}
