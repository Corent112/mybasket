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

/** A quadratic arc through the visible midpoint handle. */
export function sampleImportedArc(from: AiPoint, to: AiPoint, middle?: AiPoint): AiPoint[] {
  if (!middle) return [from, to];
  const control = {
    x: 2 * middle.x - (from.x + to.x) / 2,
    y: 2 * middle.y - (from.y + to.y) / 2,
  };
  return Array.from({ length: 25 }, (_, index) => {
    const t = index / 24, u = 1 - t;
    return {
      x: u * u * from.x + 2 * u * t * control.x + t * t * to.x,
      y: u * u * from.y + 2 * u * t * control.y + t * t * to.y,
    };
  });
}

/** A returning run cannot be represented by a single midpoint arc. */
export function hasImportedTurnback(points: AiPoint[] | undefined): boolean {
  if (!points || points.length < 4) return false;
  const from = points[0], to = points[points.length - 1];
  const dx = to.x - from.x, dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < .008) return false;
  let furthest = 0;
  for (const point of points) {
    const along = ((point.x - from.x) * dx + (point.y - from.y) * dy) / length;
    if (furthest - along > Math.max(.018, length * .22)) return true;
    furthest = Math.max(furthest, along);
  }
  return false;
}
