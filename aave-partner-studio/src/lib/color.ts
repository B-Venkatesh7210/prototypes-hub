export function luminance(hex: string): number {
  const m = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(m.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mix(hex: string, target: number, amount: number): string {
  const m = hex.replace("#", "");
  return `#${[0, 2, 4]
    .map((i) => Math.round(parseInt(m.slice(i, i + 2), 16) * (1 - amount) + target * amount))
    .map((v) => v.toString(16).padStart(2, "0"))
    .join("")}`;
}

/** The brand colour, nudged until it reads as an accent on the given background. */
export function accentFor(hex: string, mode: "light" | "dark"): string {
  let c = /^#[0-9a-f]{6}$/i.test(hex) ? hex : "#6c5ce7";
  for (let i = 0; i < 6; i += 1) {
    const l = luminance(c);
    if (mode === "dark" && l < 0.12) c = mix(c, 255, 0.25);
    else if (mode === "light" && l > 0.55) c = mix(c, 0, 0.25);
    else break;
  }
  return c;
}

export function onColor(hex: string): string {
  return luminance(hex) > 0.45 ? "#0b0c10" : "#ffffff";
}
