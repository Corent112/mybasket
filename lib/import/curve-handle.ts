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

/** Convert pixel-following samples to a clean editable centreline. */
export function cleanImportedPath(from: AiPoint, to: AiPoint, points: AiPoint[] | undefined, kind: string): AiPoint[] {
  if (kind === "pass" || !points || points.length < 3) return [from, to];
  if (kind === "freedraw") return [from, ...points.slice(1, -1), to];
  const raw = [from, ...points.slice(1, -1), to];
  const length = Math.hypot(to.x-from.x,to.y-from.y);
  const cumulative = [0];
  for (let i=1;i<raw.length;i++) cumulative.push(cumulative[i-1]+Math.hypot(raw[i].x-raw[i-1].x,raw[i].y-raw[i-1].y));
  const total=cumulative.at(-1)!;
  if(total<.005)return [from,to];
  const count=Math.max(12,Math.min(64,Math.ceil(total/.008)));
  let j=1;
  const uniform=Array.from({length:count+1},(_,i)=>{
    const d=total*i/count;
    while(j<raw.length-1&&cumulative[j]<d)j++;
    const t=(d-cumulative[j-1])/(cumulative[j]-cumulative[j-1]||1);
    return {x:raw[j-1].x+(raw[j].x-raw[j-1].x)*t,y:raw[j-1].y+(raw[j].y-raw[j-1].y)*t};
  });
  const radius=kind==="dribble"?Math.max(2,Math.round(count*.07)):2;
  const smooth=uniform.map((p,i)=>{
    if(i===0)return from;
    if(i===count)return to;
    const neighbors=uniform.slice(Math.max(0,i-radius),Math.min(count,i+radius)+1);
    return {x:neighbors.reduce((sum,q)=>sum+q.x,0)/neighbors.length,y:neighbors.reduce((sum,q)=>sum+q.y,0)/neighbors.length};
  });
  const turnback=hasImportedTurnback(smooth);
  const middle=importedCurveHandle(smooth)?.point;
  const arc=sampleImportedArc(from,to,middle);
  const dist=(p:AiPoint,a:AiPoint,b:AiPoint)=>{
    const dx=b.x-a.x,dy=b.y-a.y;
    const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/(dx*dx+dy*dy||1)));
    return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
  };
  if(!turnback&&smooth.every(p=>arc.slice(1).some((end,i)=>dist(p,arc[i],end)<Math.max(.009,length*.035))))return arc;
  // Preserve genuine bends/returns, discard small raster stair steps.
  return smooth;
}
