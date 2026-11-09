import { courtToCanonical } from "./court-geometry";
import type { Rectified } from "./court-rectify";
import type { AiDiagramAction } from "./types";

/** In partial review, suggest isolated red arrows only when their head is distinguishable. */
export function recoverRedArrows({ canvas, play, kind }: Rectified): AiDiagramAction[] {
  const ctx = canvas.getContext("2d");
  if (!ctx) return [];
  const width = canvas.width;
  const height = canvas.height;
  const pixels = ctx.getImageData(0, 0, width, height).data;
  const ink = new Uint8Array(width * height);
  const playWidth = play.x1 - play.x0;
  const playHeight = play.y1 - play.y0;
  for (let y = Math.max(0, Math.ceil(play.y0)); y < Math.min(height, play.y1); y++) {
    for (let x = Math.max(0, Math.ceil(play.x0)); x < Math.min(width, play.x1); x++) {
      const i = y * width + x;
      const r = pixels[i * 4], g = pixels[i * 4 + 1], b = pixels[i * 4 + 2];
      if (r >= 140 && r - g >= 65 && r - b >= 55) ink[i] = 1;
    }
  }
  const actions: AiDiagramAction[] = [];
  for (let i = 0; i < ink.length && actions.length < 8; i++) {
    if (!ink[i]) continue;
    const component = [i];
    ink[i] = 0;
    for (let cursor = 0; cursor < component.length; cursor++) {
      const p = component[cursor];
      const x = p % width, y = Math.floor(p / width);
      for (let ny = Math.max(0, y - 1); ny <= Math.min(height - 1, y + 1); ny++) {
        for (let nx = Math.max(0, x - 1); nx <= Math.min(width - 1, x + 1); nx++) {
          const j = ny * width + nx;
          if (ink[j]) { ink[j] = 0; component.push(j); }
        }
      }
    }
    if (component.length < playWidth * 0.25 || component.length > playWidth * playHeight * 0.025) continue;
    let x = 0, y = 0;
    for (const p of component) { x += p % width; y += Math.floor(p / width); }
    x /= component.length;
    y /= component.length;
    let xx = 0, yy = 0, xy = 0;
    for (const p of component) {
      const dx = p % width - x, dy = Math.floor(p / width) - y;
      xx += dx * dx; yy += dy * dy; xy += dx * dy;
    }
    const spread = Math.hypot(xx - yy, 2 * xy);
    if (xx + yy + spread < 10 * (xx + yy - spread)) continue;
    const angle = Math.atan2(2 * xy, xx - yy) / 2;
    const u = Math.cos(angle), v = Math.sin(angle);
    let min = Infinity, max = -Infinity;
    const projected = component.map(p => {
      const dx = p % width - x, dy = Math.floor(p / width) - y;
      const along = dx * u + dy * v;
      min = Math.min(min, along); max = Math.max(max, along);
      return { along, across: dy * u - dx * v };
    });
    const length = max - min;
    if (length < playWidth * 0.12 || length > playWidth * 0.8) continue;
    // Compare the two shoulders; a simple colored line is not an arrow.
    const shoulder = (start: number, end: number) => {
      let lo = Infinity, hi = -Infinity;
      for (const p of projected) {
        const t = (p.along - min) / length;
        if (t >= start && t <= end) { lo = Math.min(lo, p.across); hi = Math.max(hi, p.across); }
      }
      return Math.max(0, hi - lo);
    };
    const left = shoulder(0.06, 0.25), right = shoulder(0.75, 0.94), shaft = shoulder(0.40, 0.60);
    const head = Math.max(left, right);
    if (head < Math.max(5, 2.2 * Math.min(left, right), 1.8 * shaft) || head > length * 0.37) continue;
    const endpoint = (t: number) => courtToCanonical({
      x: (x + t * u - play.x0) / playWidth,
      y: (y + t * v - play.y0) / playHeight,
    }, kind);
    actions.push({
      action: "cut", from: endpoint(left > right ? max : min), to: endpoint(left > right ? min : max),
      color: "#ff3030", confidence: 0.45, source: "Flèche rouge isolée : sens et type à vérifier",
    });
  }
  return actions;
}
