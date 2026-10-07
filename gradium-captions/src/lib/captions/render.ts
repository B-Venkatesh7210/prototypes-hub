import type { CaptionStyle, StageBackground } from "@/lib/types";
import { lineAt, type Line } from "./layout";

function rgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.padEnd(6, "0");
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

export type StageOptions = {
  background: StageBackground;
  time: number;
  video?: HTMLVideoElement | null;
  fit?: "cover" | "contain";
};

const BLOBS = [
  { color: "#1ca0ff", x: 0.18, y: 0.3, r: 0.55, sx: 0.07, sy: 0.05, p: 0 },
  { color: "#d895ff", x: 0.82, y: 0.25, r: 0.5, sx: 0.05, sy: 0.08, p: 1.7 },
  { color: "#91fffa", x: 0.65, y: 0.85, r: 0.45, sx: 0.06, sy: 0.04, p: 3.1 },
  { color: "#ffb592", x: 0.25, y: 0.9, r: 0.35, sx: 0.04, sy: 0.06, p: 4.4 },
];

export function drawStage(ctx: CanvasRenderingContext2D, width: number, height: number, opts: StageOptions) {
  ctx.save();
  ctx.clearRect(0, 0, width, height);
  switch (opts.background) {
    case "transparent":
      break;
    case "dark":
      ctx.fillStyle = "#121314";
      ctx.fillRect(0, 0, width, height);
      break;
    case "light":
      ctx.fillStyle = "#f2f2f2";
      ctx.fillRect(0, 0, width, height);
      break;
    case "green":
      ctx.fillStyle = "#00b140";
      ctx.fillRect(0, 0, width, height);
      break;
    case "video": {
      ctx.fillStyle = "#000";
      ctx.fillRect(0, 0, width, height);
      const v = opts.video;
      if (v && v.videoWidth && v.readyState >= 2) {
        const scale =
          opts.fit === "contain"
            ? Math.min(width / v.videoWidth, height / v.videoHeight)
            : Math.max(width / v.videoWidth, height / v.videoHeight);
        const w = v.videoWidth * scale;
        const h = v.videoHeight * scale;
        ctx.drawImage(v, (width - w) / 2, (height - h) / 2, w, h);
      }
      break;
    }
    default: {
      const base = ctx.createLinearGradient(0, 0, 0, height);
      base.addColorStop(0, "#000000");
      base.addColorStop(0.45, "#121314");
      base.addColorStop(1, "#0b0c0d");
      ctx.fillStyle = base;
      ctx.fillRect(0, 0, width, height);
      const m = Math.max(width, height);
      ctx.globalCompositeOperation = "lighter";
      for (const b of BLOBS) {
        const cx = (b.x + Math.sin(opts.time * 0.25 + b.p) * b.sx) * width;
        const cy = (b.y + Math.cos(opts.time * 0.2 + b.p) * b.sy) * height;
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, b.r * m);
        g.addColorStop(0, rgba(b.color, 0.2));
        g.addColorStop(1, rgba(b.color, 0));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, width, height);
      }
      ctx.globalCompositeOperation = "source-over";
    }
  }
  ctx.restore();
}

type Placed = { text: string; x: number; width: number; row: number; start: number; end: number; nextStart: number };

export function drawCaptions(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lines: Line[],
  time: number,
  style: CaptionStyle,
  fontFamily: string,
) {
  const line = lineAt(lines, time, style.holdAfter);
  if (!line) return;
  drawLine(ctx, width, height, line, lines[line.index + 1]?.start ?? Infinity, time, style, fontFamily);
}

export function drawLine(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  line: Line,
  nextLineStart: number,
  time: number,
  style: CaptionStyle,
  fontFamily: string,
) {
  const scale = Math.min(width, height) / 1080;
  const size = style.fontSize * scale;
  const weight = style.bold ? 800 : 500;
  ctx.save();
  ctx.font = `${style.italic ? "italic " : ""}${weight} ${size}px ${fontFamily}`;
  ctx.textBaseline = "alphabetic";
  ctx.textAlign = "left";
  if ("letterSpacing" in ctx) {
    (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${style.letterSpacing * scale}px`;
  }

  const maxWidth = width - style.marginH * 2 * scale;
  const space = ctx.measureText(" ").width;
  const rows: Placed[][] = [[]];
  let rowWidth = 0;
  line.words.forEach((word, i) => {
    const text = style.uppercase ? word.text.toUpperCase() : word.text;
    const w = ctx.measureText(text).width;
    const needed = rows[rows.length - 1].length ? space + w : w;
    if (rowWidth + needed > maxWidth && rows[rows.length - 1].length) {
      rows.push([]);
      rowWidth = 0;
    }
    const row = rows[rows.length - 1];
    const x = row.length ? rowWidth + space : 0;
    row.push({
      text,
      x,
      width: w,
      row: rows.length - 1,
      start: word.start,
      end: word.end,
      nextStart: line.words[i + 1]?.start ?? Math.min(nextLineStart, word.end + style.holdAfter),
    });
    rowWidth = x + w;
  });

  const rowHeight = size * 1.28;
  const blockHeight = rows.length * rowHeight;
  const margin = style.marginV * scale;
  const top =
    style.position === "top" ? margin : style.position === "middle" ? (height - blockHeight) / 2 : height - margin - blockHeight;
  const rowWidths = rows.map((r) => (r.length ? r[r.length - 1].x + r[r.length - 1].width : 0));

  if (style.background === "box") {
    const padX = style.boxPadX * scale;
    const padY = style.boxPadY * scale;
    const boxW = Math.max(...rowWidths) + padX * 2;
    const boxH = blockHeight + padY * 2 - size * 0.12;
    ctx.fillStyle = rgba(style.boxColor, style.boxOpacity);
    roundRect(ctx, (width - boxW) / 2, top - padY, boxW, boxH, style.boxRadius * scale);
    ctx.fill();
  }

  const activeIndex = (() => {
    let idx = -1;
    rows.flat().forEach((p, i) => {
      if (time >= p.start) idx = i;
    });
    return idx;
  })();

  const all = rows.flat();
  all.forEach((p, i) => {
    const rowLeft = (width - rowWidths[p.row]) / 2;
    const x = rowLeft + p.x;
    const y = top + p.row * rowHeight + size * 0.98;
    const isActive = i === activeIndex && time < p.nextStart;
    const spoken = time >= p.start;
    const scaleUp = style.highlightMode !== "fill" && isActive ? style.activeScale : 1;

    ctx.save();
    if (scaleUp !== 1) {
      const cx = x + p.width / 2;
      const cy = y - size * 0.35;
      ctx.translate(cx, cy);
      ctx.scale(scaleUp, scaleUp);
      ctx.translate(-cx, -cy);
    }

    if (style.shadowOpacity > 0 && style.shadowDistance > 0) {
      const d = style.shadowDistance * scale;
      ctx.fillStyle = rgba(style.shadowColor, style.shadowOpacity);
      if (style.background === "outline") {
        ctx.lineJoin = "round";
        ctx.lineWidth = style.outlineWidth * 2 * scale;
        ctx.strokeStyle = rgba(style.shadowColor, style.shadowOpacity);
        ctx.strokeText(p.text, x + d, y + d);
      }
      ctx.fillText(p.text, x + d, y + d);
    }

    if (style.background === "outline" && style.outlineWidth > 0) {
      ctx.lineJoin = "round";
      ctx.miterLimit = 2;
      ctx.lineWidth = style.outlineWidth * 2 * scale;
      ctx.strokeStyle = style.outlineColor;
      ctx.strokeText(p.text, x, y);
    }

    const base = rgba(style.textColor, style.textOpacity);
    const highlight = rgba(style.highlightColor, 1);
    if (style.highlightMode === "fill") {
      ctx.fillStyle = base;
      ctx.fillText(p.text, x, y);
      const progress = time >= p.end ? 1 : time <= p.start ? 0 : (time - p.start) / Math.max(0.01, p.end - p.start);
      if (progress > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(x - 2, y - size * 1.2, (p.width + 4) * progress, size * 1.6);
        ctx.clip();
        ctx.fillStyle = highlight;
        ctx.fillText(p.text, x, y);
        ctx.restore();
      }
    } else {
      const lit = style.highlightMode === "progressive" ? spoken : isActive;
      ctx.fillStyle = lit ? highlight : base;
      ctx.fillText(p.text, x, y);
    }
    ctx.restore();
  });
  ctx.restore();
}
