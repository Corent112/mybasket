import { courtToCanonical } from "./court-geometry";
import { ocrLandmarkGlyph } from "./ocr";
import type { AiDiagramAction, AiDiagramPlayer, AiPoint } from "./types";

type Glyph = { points: number[]; x0: number; x1: number; y0: number; y1: number; ring?: AiPoint };

export async function readLandmarkPlayers(
  aligned: HTMLCanvasElement, isolated: HTMLCanvasElement, landmarks: AiPoint[], actions: AiDiagramAction[],
): Promise<AiDiagramPlayer[]> {
  const canvas = document.createElement("canvas");
  const w = canvas.width = 512, h = canvas.height = Math.round(w * aligned.height / aligned.width);
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  const makeInk = (source: HTMLCanvasElement) => {
    ctx.drawImage(source, 0, 0, w, h);
    const rgba = ctx.getImageData(0, 0, w, h).data;
    return Uint8Array.from({ length: w*h }, (_, i) =>
      i%w > 1 && i%w < w-2 && i >= 2*w && i < (h-2)*w && Math.max(...rgba.subarray(i*4,i*4+3)) < 122 ? 1 : 0);
  };
  const ink = makeInk(isolated), raw = makeInk(aligned);
  const directions = [-w,-1,1,w];
  const components = (mask: Uint8Array, value: number) => {
    const seen = new Uint8Array(mask.length), result: Glyph[] = [];
    for (let i = w+1; i < mask.length-w-1; i++) {
      if (seen[i] || mask[i] !== value || i%w === 0 || i%w === w-1) continue;
      const g = { points: [i], x0: w, x1: 0, y0: h, y1: 0 };
      seen[i] = 1;
      for (let k = 0; k < g.points.length; k++) {
        const p = g.points[k], x = p%w, y = Math.floor(p/w);
        g.x0 = Math.min(g.x0,x); g.x1 = Math.max(g.x1,x);
        g.y0 = Math.min(g.y0,y); g.y1 = Math.max(g.y1,y);
        for (const step of directions) {
          const q = p+step;
          if (q > w && q < mask.length-w && q%w > 0 && q%w < w-1 && !seen[q] && mask[q] === value) {
            seen[q] = 1; g.points.push(q);
          }
        }
      }
      result.push(g);
    }
    return result;
  };
  const erode = (mask: Uint8Array) => mask.map((v,i) =>
    v && mask[i-1] && mask[i+1] && mask[i-w] && mask[i+w] ? 1 : 0);
  const digits = (g: Glyph) => {
    const width = g.x1-g.x0+1, height = g.y1-g.y0+1;
    return g.points.length >= 29 && height >= h*.045 && height <= h*.163
      && width >= w*.008 && width <= w*.122 && width/height < 1.15 && g.points.length/(width*height) < .85;
  };
  const glyphs = components(ink,1).filter(digits), rawGlyphs = components(raw,1);
  for (const hole of components(raw,0)) {
    const hw = hole.x1-hole.x0, hh = hole.y1-hole.y0;
    if (hw < w*.041 || hh < h*.049 || hw > w*.32 || hh > h*.32 || hw/hh < .58 || hw/hh > 1.65) continue;
    const enclosed = rawGlyphs.find(g => g.points.length >= 30 && g.y1-g.y0 >= hh*.29
      && g.x0 > hole.x0 && g.x1 < hole.x1 && g.y0 > hole.y0 && g.y1 < hole.y1);
    if (enclosed) {
      enclosed.ring = { x:(hole.x0+hole.x1)/2, y:(hole.y0+hole.y1)/2 };
      glyphs.push(enclosed);
    }
  }
  const a = courtToCanonical({x:0,y:0},"half"), b = courtToCanonical({x:1,y:1},"half");
  const toPixel = (p: AiPoint) => ({x:w*(p.x-a.x)/(b.x-a.x), y:h*(p.y-a.y)/(b.y-a.y)});
  // Separate a label that touches its own arrow by clipping the continuing shaft.
  for (const action of actions) {
    if (!action.from || !action.points?.length) continue;
    const start = toPixel(action.from);
    const next = action.points.map(toPixel).find(p => Math.hypot(p.x-start.x,p.y-start.y) > 32);
    if (!next) continue;
    const length = Math.hypot(next.x-start.x,next.y-start.y), ux = (next.x-start.x)/length, uy = (next.y-start.y)/length;
    const close = (g: Glyph) => Math.hypot(Math.max(g.x0-start.x,0,start.x-g.x1),Math.max(g.y0-start.y,0,start.y-g.y1));
    for (const margin of [3,11,19]) {
      const cut = new Uint8Array(raw.length);
      for (let y = Math.max(2,Math.floor(start.y-65)); y < Math.min(h-2,start.y+65); y++) {
        for (let x = Math.max(2,Math.floor(start.x-65)); x < Math.min(w-2,start.x+65); x++) {
          const dx=x-start.x, dy=y-start.y, along=dx*ux+dy*uy;
          if (along >= -60 && along <= margin && Math.abs(dy*ux-dx*uy) <= 34) cut[y*w+x] = raw[y*w+x];
        }
      }
      const candidate = components(cut,1).filter(g => digits(g) && close(g)<32).sort((x,y)=>close(x)-close(y))[0];
      if (candidate) glyphs.push(candidate);
    }
  }
  for (const g of [...rawGlyphs, ...components(erode(erode(ink)),1)].filter(digits)) {
    if (!glyphs.some(q => g.x0 >= q.x0-2 && g.x1 <= q.x1+2 && g.y0 >= q.y0-2 && g.y1 <= q.y1+2)) glyphs.push(g);
  }
  const players: AiDiagramPlayer[] = [];
  for (const g of glyphs.sort((x,y) => Number(!!y.ring)-Number(!!x.ring) || y.points.length-x.points.length).slice(0,24)) {
    const width = g.x1-g.x0+1, height = g.y1-g.y0+1;
    const center = (x: number, y: number) => courtToCanonical({x:x/w,y:y/h},"half");
    const pos = center(g.ring?.x ?? (g.x0+g.x1)/2, g.ring?.y ?? (g.y0+g.y1)/2);
    const distance = (p: AiPoint) => Math.hypot(p.x-pos.x,2*(p.y-pos.y));
    if (landmarks.some(p=>distance(p)<.043) || players.some(p=>distance(p)<.035)) continue;
    const columns = new Uint16Array(width), rows: number[][] = Array.from({length:height},()=>[]);
    for (const i of g.points) {
      columns[i%w-g.x0]++;
      rows[Math.floor(i/w)-g.y0].push(i%w-g.x0);
    }
    const ruling = (x: number) => !g.ring && (x<width*.27 || x>width*.73) && columns[x]>height*.8;
    const kept = g.points.filter(i=>!ruling(i%w-g.x0));
    if (kept.length<g.points.length*.55) continue;
    const sample = document.createElement("canvas");
    const render = (sx: number) => {
      sample.width=(width+20)*sx; sample.height=(height+20)*3;
      const draw = sample.getContext("2d");
      if (!draw) return;
      draw.fillStyle="#fff"; draw.fillRect(0,0,sample.width,sample.height);
      draw.fillStyle="#000";
      for (const i of kept) draw.fillRect((i%w-g.x0+10)*sx,(Math.floor(i/w)-g.y0+10)*3,sx,3);
    };
    render(3);
    const standard = await ocrLandmarkGlyph(sample, false);
    let variant: typeof standard = null;
    if (!standard || standard.confidence < .82) {
      render(width/height<.65 ? 4 : width/height>1 ? 2 : 3);
      variant = await ocrLandmarkGlyph(sample, true);
    }
    const read = !variant || (standard && standard.confidence>=variant.confidence) ? standard : variant;
    const band = (lo:number,hi:number) => rows.slice(Math.floor(lo*height),Math.ceil(hi*height)).flat().filter(x=>!ruling(x));
    const right = (lo:number,hi:number) => Math.max(0,...band(lo,hi));
    const left = (lo:number,hi:number) => Math.min(width,...band(lo,hi));
    // Cross-check common handwritten shapes when a line or OCR obscures the digit.
    const three = !g.ring && width/height>.52 && width/height<.93 && left(.04,.22)<width*.25
      && right(.04,.22)>width*.54 && left(.61,.73)>width*.53 && right(.94,1)<width*.81;
    const four = !g.ring && width/height<.65 && right(.04,.22)<width*.59
      && left(.45,.59)<width*.18 && left(.85,1)>width*.54;
    const one = g.ring && (width/height<.53 || (left(.1,.25)>width*.26 && left(.34,.46)>width*.12
      && right(.79,.94)-left(.79,.94)>width*.68));
    const two = columns.some((_,x)=>x<width*.27 && ruling(x)) && width/height>.43 && width/height<.69
      && right(.14,.36)>width*.85 && right(.73,.83)<width*.49 && right(.84,.96)>width*.65 && left(.14,.36)>width*.23;
    const shape = one ? "1" : read?.text==="4" && three ? "3" : read?.text==="4" && four ? "4" : two ? "2" : null;
    const label = shape ?? (read && (read.confidence>=.57 || (read.confidence>=.30 && standard?.text===variant?.text)) ? read.text : null);
    if (!label || players.some(p=>p.label===label)) continue;
    const xs = kept.map(i=>i%w);
    const position = g.ring ? pos : center((Math.min(...xs)+Math.max(...xs))/2,(g.y0+g.y1)/2);
    players.push({ ...position, key:`repere-${players.length}`, label, team:"att", hasBall:!!g.ring,
      confidence: one ? .82 : shape ? .65 : read?.confidence, labelConfident:true, source:"Numéro lu sur la photo calée" });
  }
  return players;
}
