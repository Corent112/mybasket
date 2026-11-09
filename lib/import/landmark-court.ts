import type { AiPoint, AiRect } from "./types";

type Rail = { start: number; end: number; score: number };
type Knot = [number, number];
function interpolate(knots: Knot[], x: number): number {
  let i = 1;
  while (i < knots.length - 1 && x > knots[i][0]) i++;
  const [a, b] = [knots[i - 1], knots[i]];
  return a[1] + (b[1] - a[1]) * (x - a[0]) / (b[0] - a[0]);
}

/**
 * Register a single upright half-court using the U of the key and the apex
 * of the three-point line. The paper can be cropped and the hand-drawn key
 * need not be the same width or depth as the official markings.
 */
export function registerLandmarkCourt(source: HTMLCanvasElement): {
  canvas: HTMLCanvasElement;
  play: AiRect;
  toCourt: (point: AiPoint) => AiPoint;
  anchors: { keyLeft: number; keyRight: number; baseline: number; keyEnd: number; arc: number; corners: number[] | null; painted: boolean };
} | null {
  if (source.width < source.height * .84 || source.width > source.height * 1.65) return null;
  const probe = document.createElement("canvas");
  probe.width = 360;
  probe.height = Math.round(360 * source.height / source.width);
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  const w = probe.width, h = probe.height;
  ctx.drawImage(source, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const dark = (x: number, y: number) => {
    const px = Math.round(x * (w - 1)), py = Math.round(y * (h - 1));
    if (px < 0 || px >= w || py < 0 || py >= h) return false;
    const i = (py * w + px) * 4;
    return Math.max(rgba[i], rgba[i + 1], rgba[i + 2]) < 116;
  };
  const band = (x: number, y: number, rx: number, ry: number) =>
    dark(x, y) || dark(x - rx, y) || dark(x + rx, y) || dark(x, y - ry) || dark(x, y + ry);
  // The corner intersections come from lines supported across many rows,
  // so a number, arrowhead, or dot near the expected position cannot anchor it.
  const rails = (x0: number, x1: number, y0: number, y1: number, maxTilt: number): Rail[] => {
    const candidates: Rail[] = [];
    for (let x = x0; x <= x1; x += .004) {
      for (let tilt = -maxTilt; tilt <= maxTilt + .001; tilt += .008) {
        let hits = 0;
        for (let j = 0; j < 32; j++) {
          const t = j / 31;
          if (band(x + tilt * t, y0 + (y1 - y0) * t, .004, 0)) hits++;
        }
        if (hits >= 22) candidates.push({ start: x, end: x + tilt, score: hits / 32 });
      }
    }
    const chosen: Rail[] = [];
    for (const candidate of candidates.sort((a,b) => b.score-a.score)) {
      if (chosen.every(other => Math.abs(candidate.start - other.start) > .023)) chosen.push(candidate);
      if (chosen.length === 8) break;
    }
    return chosen;
  };
  const baseline = (() => {
    let best = { y: 0, score: 0 };
    for (let y = .022; y <= .155; y += .004) {
      let hits = 0;
      for (let j = 0; j < 48; j++) if (band(.19 + .65 * j / 47, y, 0, .022)) hits++;
      let transition = 0;
      for (const x of [.21,.24,.27,.73,.76,.79]) {
        if (band(x,y,0,.008) && !dark(x,y+.016)) transition++;
      }
      const score = hits + transition * 2;
      if (hits >= 33 && score > best.score) best = { y, score };
    }
    return best.score >= 33 ? best.y : 0;
  })();
  if (!baseline) return null;

  const left = rails(.005, .23, .16, .78, .088)[0];
  const right = rails(.79, .994, .16, .78, .088)[0];
  if (!left || !right) return null;
  const innerL = rails(.27, .475, baseline + .065, .29, .024);
  const innerR = rails(.53, .755, baseline + .065, .29, .024);
  let key: { l: Rail; r: Rail; y: number; score: number } | undefined;
  for (const l of innerL) for (const r of innerR) {
    if (r.end - l.end < .16 || r.end - l.end > .4 || Math.abs((l.end + r.end) / 2 - (left.start + right.start) / 2) > .08) continue;
    for (let y = .25; y <= .49; y += .004) {
      let floor = 0, sides = 0;
      for (let j = 0; j < 32; j++) if (band(l.end + (r.end - l.end) * j / 31, y, 0, .013)) floor++;
      if (floor < 25) continue;
      for (let j = 0; j < 12; j++) {
        const sy = .23 + (y - .23) * j / 12;
        const t = (sy - (baseline + .065)) / (.29 - (baseline + .065));
        for (const side of [l,r]) if (band(side.start + t * (side.end-side.start), sy, .013, 0)) sides++;
      }
      if (sides < 17) continue;
      // Prefer the centre of the ink and the outer U over interior parallel marks.
      let center = 0;
      for (let j = 0; j < 32; j++) if (dark(l.end + (r.end-l.end)*j/31, y)) center++;
      let extension = 0;
      for (const x of [l.end - .018, l.end - .028, r.end + .018, r.end + .028]) {
        if (band(x, y, 0, .008)) extension++;
      }
      const score = floor + sides + center * .45 + (l.score + r.score) * 5 + (r.end - l.end) * 220 - extension * 3;
      if (!key || score > key.score) key = { l,r,y,score };
    }
  }
  if (!key) return null;

  // A filled key has two printed internal lane lines as well as its border.
  // Prefer the outer corners, corroborated by the edge of the paint.
  const paintLimits: number[][] = [];
  for (const y of [.16, .19, .22, .25, .28]) {
    const marks: number[] = [];
    for (let x = Math.floor(w * .25); x < w * .75; x++) {
      const i = (Math.round(y * (h - 1)) * w + x) * 4;
      if (rgba[i] - rgba[i+1] > 45 && rgba[i] - rgba[i+2] > 45) marks.push(x / (w - 1));
    }
    if (marks.length > w * .16 && marks.length < w * .4) paintLimits.push([marks[0], marks[marks.length - 1]]);
  }
  if (paintLimits.length >= 4) {
    const middle = paintLimits[Math.floor(paintLimits.length / 2)];
    const l = innerL.find(rail => Math.abs(rail.start - middle[0]) < .022);
    const r = innerR.find(rail => Math.abs(rail.start - middle[1]) < .022);
    if (l && r) key = { ...key, l, r };
  }

  const cx = (key.l.end + key.r.end) / 2;
  const courtWidth = right.start - left.start;
  let arc: { y: number; score: number } | undefined;
  for (let y = key.y + .105; y < Math.min(.76, key.y + .31); y += .003) {
    let hits = 0, accuracy = 0;
    // Both shoulders of the arc must lead upwards. The central band alone
    // also fits digits and the free throw circle.
    for (const sign of [-1,1]) {
      let sideHits = 0;
      for (let j = 0; j <= 12; j++) {
        const t = j / 12;
        const x = cx + sign * courtWidth * .23 * t;
        const py = y - .055 * t * t;
        for (let step = 0; step <= 10; step++) {
          const gap = step * .0026;
          if (!dark(x, py - gap) && !dark(x, py + gap)) continue;
          sideHits++;
          accuracy += 1 - step / 12;
          break;
        }
      }
      if (sideHits < 8) { hits = 0; break; }
      hits += sideHits;
    }
    if (hits < 18 || !band(cx,y,0,.010)) continue;
    const score = accuracy + (dark(cx,y) ? 2 : 0);
    if (!arc || score > arc.score) arc = { y,score };
  }
  if (!arc) return null;

  // Refine the baseline near the centre rather than the upper edge of its ink.
  const rows = Array.from({length:25}, (_,i) => baseline + (i-12)*.002).map(y => {
    let count=0;
    for (let j=0;j<30;j++) if (dark(cx-.15+.30*j/29,y)) count++;
    return {y,count};
  });
  const top = rows.filter(row => [.21,.24,.27,.73,.76,.79].filter(x => !dark(x,row.y+.007)).length >= 4)
    .sort((a,b)=>b.count-a.count || Math.abs(a.y-baseline)-Math.abs(b.y-baseline))[0]?.y ?? baseline;
  const bottom = top + (arc.y-top) * 14 / 8.325;
  const yKnots: Knot[] = [[0,top],[5.8/14,key.y],[8.325/14,arc.y],[1,bottom]];
  const width = 900, height = 840;
  const canvas = document.createElement("canvas");
  canvas.width = width; canvas.height = height;
  const output = canvas.getContext("2d", {willReadFrequently:true});
  const original = source.getContext("2d");
  if (!output || !original) return null;
  const pixels = original.getImageData(0,0,source.width,source.height).data;
  const image = output.createImageData(width,height);
  const edgeAt = (rail:Rail,y:number) => rail.start + (rail.end-rail.start) * (y-.16)/.62;
  const keyAt = (rail:Rail,y:number) => {
    const t=Math.max(-.35,Math.min(1.5,(y-top-.065)/(.29-top-.065)));
    return rail.start+(rail.end-rail.start)*t;
  };
  // Calibrate the two three-point/baseline junctions when both short uprights
  // are supported. Blend out these extra transverse knots below the corners.
  const cornerL = rails(left.start + .025, key.l.start - .06, top + .065, top + .175, .024)[0];
  const cornerR = rails(key.r.start + .06, right.start - .025, top + .065, top + .175, .024)[0];
  const corners = cornerL && cornerR &&
    Math.abs((cornerL.start - left.start) - (right.start - cornerR.start)) < .06
    ? [cornerL.start, cornerR.start] : null;
  const transverseKnots = (sy: number): Knot[] => {
    const leftX = edgeAt(left,sy), rightX = edgeAt(right,sy);
    const keyL = keyAt(key.l,sy), keyR = keyAt(key.r,sy);
    const blend = corners ? Math.max(0, Math.min(1, (key.y-sy)/(key.y-top))) : 0;
    const xKnots: Knot[] = [[0,leftX],[5.05/15,keyL],[9.95/15,keyR],[1,rightX]];
    if (corners && blend > 0) {
      const t = .9/5.05;
      xKnots.splice(1,0,[.9/15, (leftX+(keyL-leftX)*t)*(1-blend)+corners[0]*blend]);
      xKnots.splice(4,0,[14.1/15, (rightX+(keyR-rightX)*t)*(1-blend)+corners[1]*blend]);
    }
    return xKnots;
  };
  const toCourt = ({x,y}: AiPoint): AiPoint => ({
    x: interpolate(transverseKnots(y).map(([court, photo]) => [photo, court]), x),
    y: interpolate(yKnots.map(([court, photo]) => [photo, court]), y),
  });
  for (let y=0;y<height;y++) {
    const sy=interpolate(yKnots,y/(height-1));
    const xKnots = transverseKnots(sy);
    for (let x=0;x<width;x++) {
      const sx=interpolate(xKnots,x/(width-1));
      const dst=(y*width+x)*4;
      const src=(Math.round(sy*(source.height-1))*source.width+Math.round(sx*(source.width-1)))*4;
      for(let ch=0;ch<3;ch++) image.data[dst+ch]=sx>=0&&sx<=1&&sy>=0&&sy<=1 ? pixels[src+ch] : 255;
      image.data[dst+3]=255;
    }
  }
  output.putImageData(image,0,0);
  return {canvas,toCourt,play:{x0:0,y0:0,x1:width,y1:height},anchors:{keyLeft:key.l.end,keyRight:key.r.end,baseline:top,keyEnd:key.y,arc:arc.y,corners,painted:paintLimits.length >= 4}};
}

/** Remove registered court ink from the analysis copy, keeping the review photo intact. */
export function isolateLandmarkInk(aligned: HTMLCanvasElement): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  const { width, height } = aligned;
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return aligned;
  ctx.drawImage(aligned, 0, 0);
  const pixels = ctx.getImageData(0, 0, width, height);
  const luminance = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return Math.max(pixels.data[i], pixels.data[i+1], pixels.data[i+2]);
  };
  const mask = new Uint8Array(width * height);
  const mark = (x: number, y: number) => {
    if (x >= 0 && x < width && y >= 0 && y < height) mask[y * width + x] = 1;
  };
  for (let x = 0; x < width; x++) {
    const u = x / width;
    const q = Math.abs(u - .5) / .44;
    if (q < .94) {
      const estimated = height * (8.325/14 - .39 * (1-Math.sqrt(1-q*q)));
      let hit: number | undefined;
      for (let d = 0; d < height * .062 && hit === undefined; d++) {
        for (const y of [Math.round(estimated)-d, Math.round(estimated)+d]) {
          if (luminance(x,y) < 105) { hit = y; break; }
        }
      }
      if (hit !== undefined) {
        let lo = hit, hi = hit;
        while (lo > hit - 15 && luminance(x,lo-1) < 135) lo--;
        while (hi < hit + 15 && luminance(x,hi+1) < 135) hi++;
        // A blob or long vertical stroke crossing the arc is not the arc.
        if (hi - lo <= 25) for (let y = lo-1; y <= hi+1; y++) mark(x,y);
      }
    }
    for (let y=0; y<height; y++) {
      const v = y/height;
      if (v < .018 || v > .985 || u < .017 || u > .983 ||
        (v <= 5.8/14+.018 && (Math.abs(u-5.05/15)<.012 || Math.abs(u-9.95/15)<.012)) ||
        (u > 5.05/15-.012 && u < 9.95/15+.012 && Math.abs(v-5.8/14)<.018)) mark(x,y);
    }
  }
  for (let i=0; i<mask.length; i++) if(mask[i]) {
    const at = i * 4;
    pixels.data[at] = pixels.data[at+1] = pixels.data[at+2] = 240;
  }
  ctx.putImageData(pixels,0,0);
  return canvas;
}
