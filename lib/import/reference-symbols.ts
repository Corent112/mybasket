import { ocrLandmarkGlyph } from "./ocr";
import { courtToCanonical } from "./court-geometry";
import type { Rectified } from "./court-rectify";
import type { AiDiagramAction, AiDiagramObject, AiDiagramPlayer, AiExerciseDiagram } from "./types";

type Reference = Pick<Rectified, "canvas" | "play" | "kind">;

const isRed = (color?: string) => {
    if (color?.toLowerCase() === "red") return true;
    const parts = color?.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
    if (!parts) return false;
    const [r,g,b] = parts.slice(1).map(part=>parseInt(part,16));
    return r>=140 && r-g>=65 && r-b>=55;
  };

/** Supplemental recognition on a flat, printed court. */
async function recoverReferenceSymbols({ canvas, play, kind }: Reference, knownActions: AiDiagramAction[]) {
  const objects: AiDiagramObject[] = [], players: AiDiagramPlayer[] = [], actions: AiDiagramAction[] = [];
  const ctx = canvas.getContext("2d");
  if (!ctx) return { objects, players, actions };
  const { width: w, height: h } = canvas, unit = play.x1 - play.x0;
  const data = ctx.getImageData(0,0,w,h).data;
  const canonical = (x: number, y: number) => courtToCanonical({
    x:(x-play.x0)/unit, y:(y-play.y0)/(play.y1-play.y0),
  },kind);
  const dark = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return false;
    const i = 4*(y*w+x);
    return Math.max(data[i],data[i+1],data[i+2]) < 135 && data[i+3] > 200;
  };

  let white = 0, samples = 0;
  const stride = Math.max(4,Math.floor(unit/40));
  for (let y=Math.ceil(play.y0);y<play.y1;y+=stride) for (let x=Math.ceil(play.x0);x<play.x1;x+=stride) {
    const i=4*(y*w+x);
    if (Math.min(data[i],data[i+1],data[i+2])>205) white++;
    samples++;
  }
  if (!samples || white/samples<.75) return { objects, players, actions };

  // A cone placed on a sideline can be fused to it in the ink mask.
  // The outward outline grows from the tip to a broad foot, then ends abruptly.
  for (const [side, direction] of [[Math.ceil(play.x0),-1],[Math.floor(play.x1)-1,1]]) {
    const reach = Math.max(4,Math.round(unit*.028)), baseline = Math.ceil(unit*.0035);
    const extent = (y: number) => {
      for (let d=reach;d>baseline;d--) if (dark(side+d*direction,y)) return d;
      return 0;
    };
    let widths: number[] = [];
    for (let y=Math.ceil(play.y0+unit*.06);y<play.y1-unit*.06;y++) {
      const outside=extent(y);
      if (outside) { widths.push(outside); continue; }
      const length=widths.length;
      if (length>=unit*.033 && length<=unit*.082) {
        const front=widths.slice(0,Math.ceil(length*.25)), foot=widths.slice(Math.floor(length*.60));
        const widest=Math.max(...foot), narrow=Math.max(...front);
        const base=Array.from({length:6},(_,i)=>y-1-i).some(row=>
          [2,3,4,5,6].filter(d=>dark(side-d*direction,row)).length>=3);
        if (base && widest>=narrow+unit*.008 && widest/length>=.18 && widest/length<=.60 && widest<reach) {
          objects.push({kind:"cone",...canonical(side,y-length*.45),color:"#F05A16",confidence:.72,source:"Contour de plot sur la ligne de touche"});
        }
      }
      widths=[];
    }
  }

  // An outlined cone away from the sideline encloses a light triangle.
  // Read its interior so an attached path or a thick outline cannot hide it.
  const paper = new Uint8Array(w*h);
  for (let y=Math.ceil(play.y0+1);y<play.y1-1;y++) for (let x=Math.ceil(play.x0+1);x<play.x1-1;x++) {
    const i=y*w+x, c=i*4;
    if (Math.min(data[c],data[c+1],data[c+2])>190) paper[i]=1;
  }
  const paperOffsets=[-1,1,-w,w];
  for (let seed=0;seed<paper.length;seed++) {
    if (!paper[seed]) continue;
    const queue=[seed]; paper[seed]=0;
    let x0=w,x1=0,y0=h,y1=0;
    for (let k=0;k<queue.length;k++) {
      const i=queue[k], x=i%w, y=Math.floor(i/w);
      x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
      for (const offset of paperOffsets) {
        const q=i+offset;
        if (paper[q]) {paper[q]=0;queue.push(q);}
      }
    }
    const tall=y1-y0+1, wide=x1-x0+1;
    if (tall<unit*.025 || tall>unit*.085 || wide/tall<.38 || wide/tall>.92
      || queue.length<wide*tall*.37 || queue.length>wide*tall*.66) continue;
    const rows=new Uint16Array(tall);
    for(const i of queue) rows[Math.floor(i/w)-y0]++;
    const mean=(a:number,b:number) => {
      const slice=rows.slice(Math.floor(a*tall),Math.ceil(b*tall));
      return slice.reduce((total,v)=>total+v,0)/slice.length;
    };
    if (!(mean(.06,.27)<wide*.42 && mean(.32,.55)>mean(.06,.27)+wide*.13
      && mean(.62,.86)>mean(.32,.55)+wide*.13 && mean(.62,.86)>wide*.61)) continue;
    const center=canonical((x0+x1)/2,(y0+y1)/2);
    if (!objects.some(object=>Math.hypot(object.x-center.x,object.y-center.y)<.028)) {
      objects.push({kind:"cone",...center,color:"#F05A16",confidence:.68,source:"Contour triangulaire d’un plot"});
    }
  }

  const red = new Uint8Array(w*h), dist = new Float32Array(w*h);
  for(let y=Math.max(1,Math.ceil(play.y0));y<Math.min(h-1,play.y1);y++) {
    for(let x=Math.max(1,Math.ceil(play.x0));x<Math.min(w-1,play.x1);x++) {
      const i=y*w+x, r=data[4*i], g=data[4*i+1], b=data[4*i+2];
      if(r>=140 && r-g>=65 && r-b>=55) { red[i]=1; dist[i]=1000; }
    }
  }
  for(let i=w;i<dist.length-w;i++) if(dist[i]) dist[i]=Math.min(dist[i],dist[i-1]+1,dist[i-w]+1,dist[i-w-1]+1.414,dist[i-w+1]+1.414);
  for(let i=dist.length-w-1;i>=w;i--) if(dist[i]) dist[i]=Math.min(dist[i],dist[i+1]+1,dist[i+w]+1,dist[i+w-1]+1.414,dist[i+w+1]+1.414);
  const offsets=[-w-1,-w,-w+1,-1,1,w-1,w,w+1];
  const visited = new Uint8Array(w*h);
  const glyphs: { pixels:number[]; x0:number; y0:number; x1:number; y1:number }[] = [];
  const unlinked: AiDiagramAction[] = [];
  let redPixels=0;
  for(let seed=w;seed<red.length-w;seed++) {
    if (!red[seed] || visited[seed]) continue;
    const pixels=[seed]; visited[seed]=1;
    let peak=seed;
    for(let k=0;k<pixels.length;k++) {
      const i=pixels[k];
      if(dist[i]>dist[peak]) peak=i;
      for(const d of offsets) if(red[i+d]&&!visited[i+d]) {visited[i+d]=1;pixels.push(i+d);}
    }
    redPixels+=pixels.length;
    let x0=w,y0=h,x1=0,y1=0;
    for(const i of pixels) {
      const x=i%w,y=Math.floor(i/w);
      x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);
    }
    const tall=y1-y0+1, wide=x1-x0+1;
    if (tall>=unit*.025 && tall<=unit*.093 && wide/tall>=.17 && wide/tall<=1.2
      && pixels.length>=tall*1.2 && pixels.length<wide*tall*.85) glyphs.push({pixels,x0,y0,x1,y1});
    if(pixels.length<unit*.32 || pixels.length>unit*unit*.018 || dist[peak]<unit*.008) continue;
    // Separate the stem of a handwritten 1 from the thin curve and the
    // filled arrowhead. A long vertical core must be close to the head.
    const px=peak%w, py=Math.floor(peak/w), minStem=Math.max(3,Math.round(unit*.025));
    let stem: {x:number; top:number; end:number} | undefined;
    for(let x=Math.max(1,px-Math.round(unit*.038));x<=Math.min(w-2,px+Math.round(unit*.038));x++) {
      let top=-1;
      for(let y=Math.max(1,py-Math.round(unit*.09));y<py-Math.round(unit*.025);y++) {
        if(dist[y*w+x]>=Math.max(1.8,unit*.0042)) {
          if(top<0) top=y;
          if(y-top>=minStem && (!stem||y-top>stem.end-stem.top)) stem={x,top,end:y};
        } else top=-1;
      }
    }
    if (stem) {
      const {x,top}=stem;
      const hookWidth=Math.max(3,Math.round(unit*.014));
      let hook=false;
      for(let d=1;d<=hookWidth;d++) if(red[(top+1)*w+x-d]) {hook=true;break;}
      if(!hook) stem=undefined;
    }
    const parent = new Map<number,number>([[peak,peak]]);
    const queue=[peak];
    let far=peak, farDistance=0;
    for(let k=0;k<queue.length;k++) {
      const i=queue[k], x=i%w, y=Math.floor(i/w), distance=Math.hypot(x-px,y-py);
      if(distance>farDistance) {far=i;farDistance=distance;}
      for(const d of offsets) {
        const q=i+d, qx=q%w, qy=Math.floor(q/w);
        if(!red[q]||parent.has(q)||dist[q]<1.4) continue;
        if(stem && Math.abs(qx-stem.x)<unit*.013 && qy<=stem.end+2 && qy>=stem.top-4) continue;
        parent.set(q,i);queue.push(q);
      }
    }
    if(farDistance<unit*.08) continue;
    const raw=[] as number[];
    for(let i=far;i!==peak;i=parent.get(i)!) raw.push(i);
    raw.push(peak);
    const step=Math.max(1,Math.floor(raw.length/12));
    const points=raw.filter((_,i)=>i%step===0).map(i=>canonical(i%w,Math.floor(i/w)));
    const approach=raw[Math.max(0,raw.length-Math.round(unit*.025))];
    const ux=px-approach%w, uy=py-Math.floor(approach/w), len=Math.hypot(ux,uy);
    let tipX=px,tipY=py;
    for(let d=1;len>0&&d<=dist[peak]*2.5;d++){
      const x=Math.round(px+ux*d/len), y=Math.round(py+uy*d/len);
      if(!red[y*w+x])break;
      tipX=x;tipY=y;
    }
    const to=canonical(tipX,tipY);
    if (!stem) {
      // Without a readable nearby glyph this remains an unconfirmed candidate.
      unlinked.push({action:"cut",from:points[0],to,points:[...points,to],color:"#ff3030",confidence:.58});
      continue;
    }
    const player={key:`red-def-${players.length+1}`,label:"X1",...canonical(stem.x,(stem.top+stem.end)/2),
      team:"def" as const,type:"defender" as const,color:"#ff3030",confidence:.72,typeConfidence:.85,labelConfident:true,
      source:"Numéro rouge et flèche associés"};
    players.push(player);
    actions.push({action:"cut",from:points[0],to,points:[...points,to],fromPlayer:player.key,color:"#ff3030",
      confidence:.67,source:"Déplacement rouge lié au défenseur"});
  }
  // Link a separated red number by the origin of the arrow, never by color alone.
  const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,1.5*(a.y-b.y));
  if (redPixels < w*h*.04) {
    const arrows=[...knownActions.filter(action=>isRed(action.color)), ...unlinked];
    const labels: { label:string; position:{x:number;y:number}; confidence:number }[] = [];
    for(const g of glyphs.slice(0,20)) {
      const position=canonical((g.x0+g.x1)/2,(g.y0+g.y1)/2);
      if (!arrows.some(a=>a.from && distance(a.from,position)<.075 && distance(a.to,position)>.043)) continue;
      const tile=document.createElement("canvas");
      tile.width=(g.x1-g.x0+21)*3;tile.height=(g.y1-g.y0+21)*3;
      const draw=tile.getContext("2d");
      if(!draw) continue;
      draw.fillStyle="#fff";draw.fillRect(0,0,tile.width,tile.height);
      draw.fillStyle="#000";
      for(const i of g.pixels) draw.fillRect((i%w-g.x0+10)*3,(Math.floor(i/w)-g.y0+10)*3,3,3);
      const read=await ocrLandmarkGlyph(tile,false,true);
      if (read && read.confidence>=.56) labels.push({label:`X${read.text}`,position,confidence:read.confidence});
    }
    for(const arrow of arrows) {
      const from=arrow.from;
      if(!from || actions.some(action=>distance(action.to,arrow.to)<.035)) continue;
      const ranked=labels.map(label=>({label,gap:distance(label.position,from)}))
        .filter(item=>item.gap<.075 && distance(item.label.position,arrow.to)>item.gap+.02)
        .sort((a,b)=>a.gap-b.gap);
      if(!ranked[0] || (ranked[1] && ranked[1].gap-ranked[0].gap<.018)) continue;
      const {label,position,confidence}=ranked[0].label;
      let player=players.find(p=>p.label===label && distance(p,position)<.025);
      if (!player) {
        player={key:`red-def-${players.length+1}`,label,...position,team:"def",type:"defender",color:"#ff3030",
          confidence,typeConfidence:.85,labelConfident:true,source:"Numéro rouge lu et lié au départ du tracé"};
        players.push(player);
      }
      actions.push({...arrow,fromPlayer:player.key,source:"Déplacement rouge lié au défenseur"});
    }
  }
  return { objects, players, actions };
}

/** Add recovered symbols without duplicating already recognized objects. */
export async function supplementReferenceSymbols(diagram: AiExerciseDiagram, reference: Reference) {
  const symbols = await recoverReferenceSymbols(reference, diagram.actions);
  const near = (a: { x: number; y: number }, b: { x: number; y: number }) =>
    Math.hypot(a.x-b.x, 1.5*(a.y-b.y)) < .035;
  diagram.objects.push(...symbols.objects.filter(cone => !diagram.objects.some(object =>
    object.kind === "cone" && near(object,cone))));
  const keys = new Map<string,string>();
  for (const player of symbols.players) {
    const index = diagram.players.findIndex(existing => near(existing,player) && (existing.team === "def" || isRed(existing.color)));
    if (index < 0) diagram.players.push(player);
    else {
      const key=diagram.players[index].key;
      keys.set(player.key,key);
      if (!diagram.players[index].labelConfident || diagram.players[index].team !== "def") diagram.players[index] = { ...player,key };
    }
  }
  for (const action of symbols.actions) {
    const index = diagram.actions.findIndex(existing => isRed(existing.color) && near(existing.to,action.to));
    const linked = { ...action, fromPlayer: keys.get(action.fromPlayer ?? "") ?? action.fromPlayer };
    if (index < 0) diagram.actions.push(linked);
    else diagram.actions[index] = linked;
  }
  if (symbols.actions.length) diagram.actions.forEach((action,index) => { action.order=index+1; });
}
