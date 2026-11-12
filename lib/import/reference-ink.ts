import { courtToCanonical } from "./court-geometry";
import { ocrToken } from "./ocr";
import type { Rectified } from "./court-rectify";
import type { AiDiagramAction, AiDiagramPlayer, AiPoint } from "./types";

type Reference = Pick<Rectified, "canvas" | "play" | "kind">;
type Blob = { x0: number; y0: number; x1: number; y1: number; x: number; y: number; count: number };
const distance = (a: AiPoint, b: AiPoint) => Math.hypot(a.x - b.x, a.y - b.y);

function components(mask: Uint8Array, width: number): Blob[] {
  const blobs: Blob[] = [];
  for (let i = 0; i < mask.length; i++) {
    if (!mask[i]) continue;
    const queue = [i];
    mask[i] = 0;
    let x0 = width, x1 = 0, y0 = mask.length / width, y1 = 0, sx = 0, sy = 0;
    for (let k = 0; k < queue.length; k++) {
      const index = queue[k], x = index % width, y = Math.floor(index / width);
      sx += x; sy += y;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const j = index + dy * width + dx;
        if (x + dx < 0 || x + dx >= width || !mask[j]) continue;
        mask[j] = 0; queue.push(j);
      }
    }
    if (queue.length >= 6) blobs.push({ x0, x1, y0, y1, x: sx / queue.length, y: sy / queue.length, count: queue.length });
  }
  return blobs;
}

/**
 * Recovery for framed, light-background diagrams with black coach strokes.
 * Thin court lines cannot produce an arrowhead. A bare numeral becomes a player
 * only when a traced arrow corroborates its position and side.
 */
export async function recoverReferenceInk(
  { canvas, play, kind }: Reference,
  redActions: AiDiagramAction[],
): Promise<{ players: AiDiagramPlayer[]; actions: AiDiagramAction[] }> {
  const players: AiDiagramPlayer[] = [], actions: AiDiagramAction[] = [];
  const ctx = canvas.getContext("2d");
  if (!ctx) return { players, actions };
  const { width, height } = canvas;
  const unit = play.x1 - play.x0, depth = play.y1 - play.y0;
  const ink = new Uint8Array(width * height), red = new Uint8Array(ink.length), core = new Uint8Array(ink.length);
  const rgba = ctx.getImageData(0, 0, width, height).data;
  // The width-based filters below describe dark diagrams on white paper.
  let light = 0, sampled = 0;
  const stride = Math.max(5, Math.floor(unit / 40));
  for (let y = Math.ceil(play.y0); y < play.y1; y += stride) {
    for (let x = Math.ceil(play.x0); x < play.x1; x += stride) {
      const i = (y * width + x) * 4;
      if (Math.min(rgba[i], rgba[i + 1], rgba[i + 2]) > 205) light++;
      sampled++;
    }
  }
  if (!sampled || light / sampled < 0.75) return { players, actions };
  const margin = Math.max(3, Math.round(unit * 0.012));
  for (let y = Math.ceil(play.y0) + margin; y < play.y1 - margin; y++) {
    for (let x = Math.ceil(play.x0) + margin; x < play.x1 - margin; x++) {
      const i = y * width + x;
      const r = rgba[4*i], g = rgba[4*i+1], b = rgba[4*i+2];
      if (Math.max(r,g,b) < 130) ink[i] = 1;
      if (r >= 145 && r - g >= 60 && r - b >= 50) red[i] = 1;
    }
  }
  const radius = Math.max(2, Math.round(unit * 0.0075));
  const disk: number[] = [];
  for (let dy = -radius; dy <= radius; dy++) for (let dx = -radius; dx <= radius; dx++) {
    if (dx*dx + dy*dy <= radius*radius) disk.push(dy*width + dx);
  }
  for (let i = 0; i < ink.length; i++) if (ink[i] && disk.every(offset => ink[i+offset])) core[i] = 1;

  const bw = (b: Blob) => b.x1 - b.x0 + 1, bh = (b: Blob) => b.y1 - b.y0 + 1;
  const heads = components(core, width).filter(b => bw(b) < unit*.065 && bh(b) < unit*.065
    && b.count >= radius*radius*2 && b.count <= radius*radius*22).slice(0, 16);
  const marks = components(ink.slice(), width);
  const rings = marks.filter(b => bw(b) >= unit*.045 && bw(b) <= unit*.135
    && bh(b)/bw(b) >= .84 && bh(b)/bw(b) <= 1.18 && b.count/(bw(b)*bh(b)) < .31
    && marks.some(c => c !== b && c.x0 > b.x0+3 && c.x1 < b.x1-3 && c.y0 > b.y0+3 && c.y1 < b.y1-3));
  const digits = (blobs: Blob[]) => blobs.filter(b => bh(b) >= unit*.03 && bh(b) <= unit*.075
    && bw(b)/bh(b) >= .22 && bw(b)/bh(b) <= 1.05);
  const canonical = (p: AiPoint) => courtToCanonical({x:(p.x-play.x0)/unit,y:(p.y-play.y0)/depth},kind);
  const at = (x: number, y: number) => {
    const px = Math.round(x), py = Math.round(y);
    return px >= 0 && px < width && py >= 0 && py < height && ink[py * width + px] === 1;
  };
  const used = new Set<Blob>();
  const addPlayer = async (marker: Blob, glyph: Blob, defender = false) => {
    // Isolate the character from the ring and any adjacent shaft before OCR.
    const tile = document.createElement("canvas");
    tile.width = bw(glyph) + 20; tile.height = bh(glyph) + 20;
    const t = tile.getContext("2d");
    if (!t) return undefined;
    t.fillStyle = "#fff"; t.fillRect(0,0,tile.width,tile.height);
    t.drawImage(canvas,glyph.x0,glyph.y0,bw(glyph),bh(glyph),10,10,bw(glyph),bh(glyph));
    const read = await ocrToken(tile,{x0:10,y0:10,x1:10+bw(glyph),y1:10+bh(glyph)});
    const label = read?.text.match(/^\d{1,2}$/)?.[0] ?? "";
    if (!label && marker === glyph) return undefined;
    const key = `ink-p${players.length+1}`;
    players.push({ key, label: defender && label ? `X${label}` : label, ...canonical(marker),
      team:defender?"def":"att", type:defender?"defender":"attacker", shape:"circle",
      confidence:.65, typeConfidence:!defender && marker !== glyph && !!label ? .82 : .48, labelConfident:!!label && (read?.confidence??0)>.5, source:"Numéro et tracé détectés sur la photo" });
    return key;
  };
  const vector = (from: AiPoint, to: AiPoint) => {
    const length = distance(from,to);
    return { length, ux:(to.x-from.x)/length, uy:(to.y-from.y)/length };
  };
  const addAction = (action: "cut"|"pass"|"dribble", from: AiPoint, head: Blob, fromPlayer?: string, points?: AiPoint[]) => {
    const {ux,uy} = vector(from,head);
    let tip: AiPoint = head;
    for (let k=1;k<=radius*4;k++) if (at(head.x+ux*k,head.y+uy*k)) tip={x:head.x+ux*k,y:head.y+uy*k};
    used.add(head);
    actions.push({action,from:canonical(from),to:canonical(tip),fromPlayer,points:points?.map(canonical).concat(canonical(tip)),
      confidence:.46,source:"Tracé noir reconstitué : à confirmer"});
  };
  const profile = (from: AiPoint, head: Blob, tolerance: number) => {
    const { length,ux,uy } = vector(from,head);
    const samples: {x:number;y:number;offset:number|null}[] = [];
    for (let d = unit*.03; d < length-unit*.03; d+=2) {
      const x=from.x+ux*d,y=from.y+uy*d;
      let sum=0,count=0;
      for(let s=-tolerance;s<=tolerance;s++) if(at(x-uy*s,y+ux*s)){sum+=s;count++;}
      samples.push({x,y,offset:count?sum/count:null});
    }
    return samples;
  };

  // A regularly spaced, collinear chain of detached short marks identifies a pass.
  for (const ring of rings.slice(0,6)) {
    const glyph = marks.find(b => b.x0>ring.x0+3 && b.x1<ring.x1-3 && b.y0>ring.y0+3 && b.y1<ring.y1-3);
    if (!glyph) continue;
    const key = await addPlayer(ring,glyph);
    const match = heads.filter(h => !used.has(h) && distance(ring,h)>unit*.12).map(h=>{
      const {length,ux,uy}=vector(ring,h);
      const positions=marks.filter(b=>Math.max(bw(b),bh(b))<=unit*.031 && b.count>=9).map(b=>({
        along:(b.x-ring.x)*ux+(b.y-ring.y)*uy, cross:(b.y-ring.y)*ux-(b.x-ring.x)*uy,
      })).filter(p=>p.along>bw(ring)*.45 && p.along<length-unit*.023 && Math.abs(p.cross)<unit*.009)
        .map(p=>p.along).sort((a,b)=>a-b);
      const gaps=positions.slice(1).map((p,i)=>p-positions[i]).filter(d=>d>=unit*.012 && d<=unit*.037);
      const gapToHead = length - (positions.at(-1) ?? 0);
      return { h, score: gaps.length, gapToHead };
    }).filter(m => m.score >= 4 && m.gapToHead < unit*.068)
      .sort((a,b) => b.score-a.score || a.gapToHead-b.gapToHead);
    if (match[0] && (!match[1] || match[0].score>match[1].score || match[1].gapToHead-match[0].gapToHead>unit*.018)) {
      addAction("pass",ring,match[0].h,key);
    }
  }

  const cutEnds: { head: Blob; cut: AiDiagramAction }[] = [];
  for (const glyph of digits(marks).filter(b=>!rings.some(r=>distance(r,b)<bw(r)*.5)).slice(0,12)) {
    const matches=heads.filter(h=>!used.has(h) && distance(h,glyph)>unit*.12).map(h=>{
      const samples=profile(glyph,h,Math.max(2,Math.round(unit*.009)));
      return {h,score:samples.filter(p=>p.offset!==null).length/Math.max(1,samples.length)};
    }).sort((a,b)=>b.score-a.score);
    if (!(matches[0]?.score>.86) || matches[0].score-(matches[1]?.score??0)<.12) continue;
    const key=await addPlayer(glyph,glyph);
    addAction("cut",glyph,matches[0].h,key);
    cutEnds.push({ head: matches[0].h, cut: actions[actions.length - 1] });
  }

  // Follow connected thick pixels through the junction. A sustained oscillation
  // across the chord distinguishes a dribble from an extra straight arrow.
  for (const { head: start, cut } of cutEnds) {
    for(const head of heads) {
      if(used.has(head)||distance(start,head)<unit*.16) continue;
      const {length,ux,uy}=vector(start,head);
      const origin = Math.round(start.y)*width + Math.round(start.x);
      const target = Math.round(head.y)*width + Math.round(head.x);
      const parent = new Map<number,number>([[origin,origin]]);
      const queue = [origin];
      const r = Math.max(1, Math.round(unit*.0014));
      for(let cursor=0;cursor<queue.length && queue.length<30000 && !parent.has(target);cursor++) {
        const index=queue[cursor], x=index%width, y=Math.floor(index/width);
        for(let dy=-1;dy<=1;dy++) for(let dx=-1;dx<=1;dx++) {
          const nx=x+dx, ny=y+dy, next=ny*width+nx;
          if(parent.has(next) || !at(nx,ny) || !at(nx-r,ny) || !at(nx+r,ny) || !at(nx,ny-r) || !at(nx,ny+r)) continue;
          const along=(nx-start.x)*ux+(ny-start.y)*uy, cross=(ny-start.y)*ux-(nx-start.x)*uy;
          if(along < -unit*.025 || along > length+unit*.025 || Math.abs(cross)>unit*.075) continue;
          parent.set(next,index); queue.push(next);
        }
      }
      if(!parent.has(target)) continue;
      const path: AiPoint[] = [];
      for(let i=target;i!==origin;i=parent.get(i)!) path.push({x:i%width,y:Math.floor(i/width)});
      path.push(start); path.reverse();
      let extreme=0, trend=0, turns=0;
      for(const p of path) {
        const cross=(p.y-start.y)*ux-(p.x-start.x)*uy;
        if (trend>0 && cross>extreme) extreme=cross;
        if (trend<0 && cross<extreme) extreme=cross;
        if (cross<extreme-unit*.004) {if(trend>0) turns++; trend=-1; extreme=cross;}
        else if (cross>extreme+unit*.004) {if(trend<0) turns++; trend=1; extreme=cross;}
      }
      if(turns<5) continue;
      addAction("dribble",start,head,cut.fromPlayer,path.filter((_,i)=>i%Math.max(1,Math.round(unit*.003))===0));
      break;
    }
  }
  for(const glyph of digits(components(red,width))) {
    const p=canonical(glyph);
    if(redActions.some(a=>a.from && distance(a.from,p)<.04)) await addPlayer(glyph,glyph,true);
  }
  // A pass towards the end of a cut reaches that player after the move.
  // Match unambiguous same-team recipients only, and play the move first.
  for (const pass of actions.filter(action => action.action === "pass" && action.fromPlayer)) {
    const passer = players.find(player => player.key === pass.fromPlayer);
    const candidates = players.filter(player => player !== passer && player.team === passer?.team)
      .map(player => {
        const move = cutEnds.find(({ cut }) => cut.fromPlayer === player.key)?.cut;
        return { player, move, gap: distance(pass.to, move?.to ?? player) };
      }).sort((a, b) => a.gap - b.gap);
    const best = candidates[0];
    if (!best || best.gap > .055 || (candidates[1] && candidates[1].gap - best.gap < .022)) continue;
    pass.toPlayer = best.player.key;
    if (best.move) {
      actions.splice(actions.indexOf(pass), 1);
      actions.splice(actions.indexOf(best.move) + 1, 0, pass);
    }
  }
  const firstPasser = actions.find(action => action.action === "pass" && action.fromPlayer)?.fromPlayer;
  const ringPlayers = players.filter(player => rings.some(ring => distance(player, canonical(ring)) < .012));
  const carrier = ringPlayers.find(player => player.key === firstPasser) ?? (ringPlayers.length === 1 ? ringPlayers[0] : undefined);
  if (carrier) carrier.hasBall = true;
  return {players,actions};
}
