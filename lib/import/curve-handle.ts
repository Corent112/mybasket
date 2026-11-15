import type { AiPoint } from "./types";

/** Ignore pixel noise and the alternating offsets of a straight dribble. */
export function importedCurveHandle(points: AiPoint[] | undefined, dribble = false) {
  if (!points || points.length < 3) return undefined;
  const from = points[0], to = points[points.length - 1];
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < .008) return undefined;
  const index = Math.floor(points.length / 2);
  const middle = dribble ? points.slice(Math.max(1, index - Math.floor(points.length / 5)),
    Math.min(points.length - 1, index + Math.floor(points.length / 5) + 1)) : [points[index]];
  const point = {
    x: middle.reduce((sum, p) => sum + p.x, 0) / middle.length,
    y: middle.reduce((sum, p) => sum + p.y, 0) / middle.length,
  };
  const offset = Math.abs(dx * (point.y - from.y) - dy * (point.x - from.x)) / length;
  return offset >= Math.max(.005, length * .045) ? { index, point } : undefined;
}
