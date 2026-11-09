import { courtToCanonical } from "./court-geometry";
import type { AiDiagramAction, AiPoint } from "./types";

type Blob = { center: AiPoint; width: number; height: number; pixels: number[]; peak: number };
const distance = (a: AiPoint, b: AiPoint) => Math.hypot(a.x-b.x, a.y-b.y);

/** Read arrowheads on the original image so the calibration cannot stretch their shape. */
export function traceLandmarkArrows(
  photo: HTMLCanvasElement, toCourt: (point: AiPoint) => AiPoint, painted: boolean,
): AiDiagramAction[] {
  const probe = document.createElement("canvas");
  const w = probe.width = 640, h = probe.height = Math.round(w * photo.height / photo.width);
  const ctx = probe.getContext("2d", { willReadFrequently: true });
  if (!ctx) return [];
  ctx.drawImage(photo, 0, 0, w, h);
  const rgba = ctx.getImageData(0, 0, w, h).data;
  const point = (i: number) => ({x:i % w,y:Math.floor(i/w)});
  const normalized = ({x,y}: AiPoint) => toCourt({x:x/(w-1),y:y/(h-1)});
  const canonical = (p: AiPoint) => courtToCanonical(normalized(p), "half");
  const size = w*h;
  const depth = new Float32Array(size);
  const inside = new Uint8Array(size);
  for (let y=1; y<h-1; y++) for(let x=1; x<w-1; x++) {
    const i = y*w+x, c = i*4;
    if (Math.max(rgba[c],rgba[c+1],rgba[c+2]) >= 108) continue;
    const p = normalized({x,y});
    if (p.x < .017 || p.x > .985 || p.y < .07 || p.y > .9) continue;
    inside[i] = 1;
    depth[i] = 1000;
  }
  // Chamfer distance to the paper: filled heads are thicker than shafts.
  for(let i=w;i<size-w;i++) if(depth[i]) depth[i]=Math.min(depth[i],depth[i-1]+1,depth[i-w]+1,depth[i-w-1]+1.414,depth[i-w+1]+1.414);
  for(let i=size-w-1;i>=w;i--) if(depth[i]) depth[i]=Math.min(depth[i],depth[i+1]+1,depth[i+w]+1,depth[i+w-1]+1.414,depth[i+w+1]+1.414);
  const directions=[-w-1,-w,-w+1,-1,1,w-1,w,w+1];
  const blobs = (threshold: number): Blob[] => {
    const visited = new Uint8Array(size);
    const result: Blob[] = [];
    for(let i=w;i<size-w;i++){
      if(visited[i] || depth[i]<threshold) continue;
      const pixels=[i]; visited[i]=1;
      let x0=w,y0=h,x1=0,y1=0,sx=0,sy=0,peak=0;
      for(let k=0;k<pixels.length;k++){
        const index=pixels[k], p=point(index);
        sx+=p.x;sy+=p.y;x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);peak=Math.max(peak,depth[index]);
        for(const d of directions){const j=index+d;if(!visited[j]&&depth[j]>=threshold){visited[j]=1;pixels.push(j);}}
      }
      result.push({center:{x:sx/pixels.length,y:sy/pixels.length},width:x1-x0+1,height:y1-y0+1,pixels,peak});
    }
    return result;
  };
  const heads=blobs(7.6).filter(b=>b.pixels.length>=18 && b.peak>=8.6 && b.width<=40 && b.height<=40)
    .sort((a,b)=>b.peak-a.peak).slice(0,12);
  const marks=blobs(2.6).filter(b=>b.pixels.length>=18 && b.pixels.length<=260 && b.width<=36 && b.height<=36
    && Math.min(b.width,b.height) >= Math.max(b.width,b.height)*.18);
  const out: AiDiagramAction[]=[];
  const tracedShafts: AiPoint[][] = [];
  const add=(kind:AiDiagramAction["action"], path:AiPoint[], head:Blob)=>{
    const from=path[0], center=head.center;
    const origin=path[Math.max(0,path.length-13)];
    const length=distance(origin,center);
    if(length<1) return;
    const ux=(center.x-origin.x)/length, uy=(center.y-origin.y)/length;
    let tip=center;
    for(let d=1;d<Math.min(27,head.peak*2);d++){
      const x=center.x+d*ux,y=center.y+d*uy;
      if(!inside[Math.round(y)*w+Math.round(x)]) break;
      tip={x,y};
    }
    if(out.some(action=>distance(action.to,canonical(tip))<.025)) return;
    const step=Math.max(1,Math.floor(path.length/95));
    const points=kind==="pass" ? undefined : [...path.flatMap((p,i) => {
      if (i%step!==0) return [];
      if (i===0) return [p];
      const samples=path.slice(Math.max(0,i-2),i+3);
      return [{x:samples.reduce((sum,q)=>sum+q.x,0)/samples.length,y:samples.reduce((sum,q)=>sum+q.y,0)/samples.length}];
    }),tip].map(canonical);
    if (kind !== "pass") tracedShafts.push(path);
    out.push({action:kind,from:canonical(from),to:canonical(tip),points,confidence:.47,
      source:"Pointe et tracé de la flèche reconnus sur la photo"});
  };

  for(const head of heads){
    if (tracedShafts.some(path => path.some(p => distance(p,head.center) < 14))) continue;
    // Dots are independent of the arrowhead; they vote for the shaft axis.
    let dotted: { from: AiPoint; score: number } | undefined;
    for(const m of marks){
      const len=distance(m.center,head.center);
      if(len<24 || len>118) continue;
      const ux=(m.center.x-head.center.x)/len,uy=(m.center.y-head.center.y)/len;
      const chain=marks.map(b=>{
        const dx=b.center.x-head.center.x,dy=b.center.y-head.center.y;
        return {p:b.center,t:dx*ux+dy*uy,cross:Math.abs(dy*ux-dx*uy)};
      }).filter(p=>p.t>23 && p.t<225 && p.cross<11).sort((a,b)=>a.t-b.t);
      if(chain.length<2 || chain[0].t>112) continue;
      let count=1;
      for(;count<chain.length;count++){
        const gap=chain[count].t-chain[count-1].t;
        if(gap<10 || gap>72) break;
      }
      if(count<2 || chain[count-1].t-chain[0].t<24) continue;
      const last=chain[count-1];
      const gap=last.t-chain[count-2].t;
      const score=count*3-(chain[0].t/100)-chain.slice(0,count).reduce((sum,p)=>sum+p.cross,0)/20;
      if(!dotted || score>dotted.score) dotted={from:{x:last.p.x+ux*gap*.8,y:last.p.y+uy*gap*.8},score};
    }

    // Trace a solid shaft from the head through the centre of its ink.
    const center=head.center;
    const headCourt=normalized(center);
    const seed=head.pixels.reduce((best,i)=>distance(point(i),center)<distance(point(best),center)?i:best);
    const parent=new Int32Array(size); parent.fill(-1); parent[seed]=seed;
    const queue=[seed];
    let far=seed, farDistance=0, outside=seed, outsideDistance=0;
    const crossesKey = !painted && headCourt.y>.42 && headCourt.y<.53 && headCourt.x>.34 && headCourt.x<.66;
    const shaftSide = Math.sign((headCourt.x-.5) || 1);
    for(let k=0;k<queue.length && queue.length<14000;k++){
      const i=queue[k], p=point(i);
      const dist=distance(p,center);
      if(dist>farDistance){farDistance=dist;far=i;}
      if(crossesKey && dist>outsideDistance) {
        const pCourt=normalized(p);
        if(pCourt.y<.38 && (shaftSide>0 ? pCourt.x>.678 : pCourt.x<.322)) {outside=i;outsideDistance=dist;}
      }
      for(const d of directions){
        const j=i+d;
        if(parent[j]!==-1 || depth[j]<(painted?2.9:3.15)) continue;
        if(!painted && dist>22){
          const q=normalized(point(j));
          // The key's long sides and bottom can touch a coach's shaft.
          if(q.y<.38 && (Math.abs(q.x-5.05/15)<.007 || Math.abs(q.x-9.95/15)<.007)) continue;
          // Keep the branch leading away from the centre of the key when
          // a cut crosses its floor, instead of following the entire U.
          if(crossesKey && Math.abs(q.y-5.8/14)<.025 && q.x>.32 && q.x<.68
            && (q.x-headCourt.x)*shaftSide < -.017) continue;
        }
        parent[j]=i;queue.push(j);
      }
    }
    if(outsideDistance>=47){far=outside;farDistance=outsideDistance;}
    if(dotted && farDistance<59){add("pass",[dotted.from,center],head);continue;}
    if(farDistance<47 || queue.length>=14000) continue;
    const path:AiPoint[]=[];
    for(let i=far;i!==seed;i=parent[i]) path.push(point(i));
    path.push(center);
    if(path.length>farDistance*2.6) continue;
    // Count substantial zigzags relative to the overall shaft direction.
    const start=path[0], ux=(center.x-start.x)/farDistance, uy=(center.y-start.y)/farDistance;
    let extreme=0, direction=0, turns=0;
    for(const p of path){
      const v=(p.y-start.y)*ux-(p.x-start.x)*uy;
      if(direction>0 && v>extreme) extreme=v;
      if(direction<0 && v<extreme) extreme=v;
      if(v>extreme+4.5){if(direction<0)turns++;direction=1;extreme=v;}
      if(v<extreme-4.5){if(direction>0)turns++;direction=-1;extreme=v;}
    }
    add(turns>=5?"dribble":"cut",path,head);
  }
  return out;
}
