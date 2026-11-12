import { courtToCanonical } from "./court-geometry";
import { ocrLandmarkGlyph } from "./ocr";
import type { AiDiagramAction, AiDiagramPlayer, AiPoint, AiRect } from "./types";

type Blob = AiRect & { pixels: number[]; x: number; y: number };
const distance = (a: AiPoint,b: AiPoint) => Math.hypot(a.x-b.x,a.y-b.y);

function components(mask: Uint8Array, w: number, min: number): Blob[] {
  const result: Blob[]=[];
  for(let i=0;i<mask.length;i++){
    if(!mask[i])continue;
    const pixels=[i];mask[i]=0;
    let x0=w,y0=mask.length/w,x1=0,y1=0,sx=0,sy=0;
    for(let k=0;k<pixels.length;k++){
      const p=pixels[k],x=p%w,y=Math.floor(p/w);
      x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);sx+=x;sy+=y;
      for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){
        const j=p+dy*w+dx;
        if(x+dx>=0&&x+dx<w&&mask[j]){mask[j]=0;pixels.push(j);}
      }
    }
    if(pixels.length>=min)result.push({x0,y0,x1,y1,x:sx/pixels.length,y:sy/pixels.length,pixels});
  }
  return result;
}

const width = (b: AiRect)=>b.x1-b.x0+1;
const height = (b: AiRect)=>b.y1-b.y0+1;
const center = (b: AiRect)=>({x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2});

/** Flat digital half-courts with a solid blue key, wood floor and blue number rings. */
export async function readColoredCourtDiagram(source: HTMLCanvasElement) {
  const canvas=document.createElement("canvas");
  const scale=Math.min(1,900/Math.max(source.width,source.height));
  const w=canvas.width=Math.round(source.width*scale), h=canvas.height=Math.round(source.height*scale);
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(!ctx||w<160||h<130)return null;
  ctx.drawImage(source,0,0,w,h);
  const rgba=ctx.getImageData(0,0,w,h).data;
  const keyMask=new Uint8Array(w*h), blue=new Uint8Array(w*h), ink=new Uint8Array(w*h), ball=new Uint8Array(w*h);
  const floor=new Uint8Array(w*h);
  for(let i=0;i<floor.length;i++){
    const r=rgba[4*i],g=rgba[4*i+1],b=rgba[4*i+2];
    if(r<75&&g>r+45&&b>g+25)keyMask[i]=1;
    if(r<95&&g<120&&g>r+9&&b>r+17)blue[i]=1;
    if(r>152&&r>g+7&&g>b+5&&g>125)floor[i]=1;
    if(Math.max(r,g,b)<141&&b<=r+9)ink[i]=1;
    if(r>113&&r>g+45&&g>b+16&&g<166)ball[i]=1;
  }
  const key=components(keyMask,w,Math.max(80,w*h*.025)).sort((a,b)=>b.pixels.length-a.pixels.length)[0];
  if(!key||key.pixels.length<width(key)*height(key)*.62||width(key)/height(key)<.56||width(key)/height(key)>1.32)return null;
  const rows=new Uint16Array(h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++)rows[y]+=floor[y*w+x];
  const y0=rows.findIndex(n=>n>width(key)*1.25);
  const y1=rows.findLastIndex(n=>n>width(key)*1.25);
  if(y0<0||y1-y0<height(key)*1.55||Math.abs(y0-key.y0)>height(key)*.12)return null;
  const cols=new Uint16Array(w);
  for(let y=y0;y<=y1;y++)for(let x=0;x<w;x++)cols[x]+=floor[y*w+x];
  const x0=cols.findIndex(n=>n>(y1-y0)*.20), x1=cols.findLastIndex(n=>n>(y1-y0)*.20);
  const play={x0,y0,x1,y1};
  const unit=x1-x0;
  if(unit<width(key)*2.45||unit>width(key)*4||Math.abs(center(key).x-(x0+x1)/2)>unit*.06)return null;
  const canonical=(p:AiPoint)=>courtToCanonical({x:(p.x-x0)/unit,y:(p.y-y0)/(y1-y0)},"half");
  const tokens=components(blue,w,Math.max(20,unit*.24)).filter(b=>{
    const bw=width(b),bh=height(b);
    if(bw<unit*.044||bw>unit*.105||bh/bw<.78||bh/bw>1.23||b.pixels.length/(bw*bh)>.42
      ||b.x0<x0||b.x1>x1||b.y0<y0||b.y1>y1)return false;
    const p=center(b),radius=(bw+bh)/4;
    let white=0,total=0;
    for(let y=Math.ceil(p.y-radius*.56);y<=p.y+radius*.56;y++)for(let x=Math.ceil(p.x-radius*.56);x<=p.x+radius*.56;x++){
      const i=(y*w+x)*4;
      if(Math.min(rgba[i],rgba[i+1],rgba[i+2])>185)white++;
      total++;
    }
    return white>total*.40;
  });
  if(tokens.length<2||tokens.length>20)return null;

  // First pass: place the player at the centre of the ring, independently
  // of arrow tips, arrow crossings or the printed number's ink centroid.
  const balls=components(ball,w,Math.max(12,unit*.08)).filter(b=>width(b)<unit*.072&&height(b)<unit*.072&&width(b)>unit*.014);
  const roster: { player: AiDiagramPlayer; center: AiPoint; radius:number }[]=[];
  for(const token of tokens){
    const p=center(token),radius=(width(token)+height(token))/4;
    const crop=document.createElement("canvas");
    const r=Math.round(radius*.72), glyphWidth=2*r+1;
    const glyphMask=new Uint8Array(glyphWidth*glyphWidth);
    for(let dy=-r;dy<=r;dy++)for(let dx=-r;dx<=r;dx++){
      const i=4*((Math.round(p.y)+dy)*w+Math.round(p.x)+dx);
      if(dx*dx+dy*dy<=(radius*.72)**2&&rgba[i]<120&&rgba[i+1]<154&&rgba[i+2]>rgba[i]+12){
        glyphMask[(dy+r)*glyphWidth+dx+r]=1;
      }
    }
    const largest=components(glyphMask,glyphWidth,Math.max(5,r*.45)).sort((a,b)=>b.pixels.length-a.pixels.length)[0];
    let read: Awaited<ReturnType<typeof ocrLandmarkGlyph>>=null;
    const g=crop.getContext("2d");
    if(largest&&g){
      const bw=width(largest),bh=height(largest), z=74/bh;
      crop.width=Math.round(bw*z)+44;crop.height=118;
      g.fillStyle="#fff";g.fillRect(0,0,crop.width,crop.height);
      g.fillStyle="#000";
      for(const i of largest.pixels)g.fillRect(22+(i%glyphWidth-largest.x0)*z,22+(Math.floor(i/glyphWidth)-largest.y0)*z,z+.1,z+.1);
      const word=await ocrLandmarkGlyph(crop,false,true);
      const glyph=word&&word.confidence>=.65?null:await ocrLandmarkGlyph(crop,true,true);
      read=glyph&&glyph.confidence>(word?.confidence??0)?glyph:word;
      // The digit 1 is a narrow vertical stem; disambiguate it from a 4
      // when compression changes the OCR result.
      const columns=new Uint16Array(bw);
      for(const i of largest.pixels)columns[i%glyphWidth-largest.x0]++;
      if(bw/bh<.49&&columns.some(count=>count>bh*.82)) read={text:"1",confidence:.80};
    }
    const n=roster.length+1;
    roster.push({center:p,radius,player:{key:`ring-${n}`,label:read&&read.confidence>=.45?read.text:"",...canonical(p),team:"att",
      type:"unknown",typeConfidence:.35,labelConfident:!!read&&read.confidence>=.5,confidence:.94,
      hasBall:balls.some(b=>distance(b,p)<radius*1.52),source:"Centre du cercle numéroté détecté"}});
  }
  if(roster.length<2)return null;
  // Second pass: remove marker ink before analysing continuous, dashed and
  // T-ended lines, so a player cannot be mistaken for a point on a trajectory.
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x;
    if(ink[i]&&(x<x0||x>x1||y<y0||y>y1||
      roster.some(({center:p,radius})=>(p.x-x)**2+(p.y-y)**2<(radius*.99)**2)))ink[i]=0;
  }
  const traces=components(ink.slice(),w,Math.max(6,Math.round(unit*.013)));
  const dot=(i:number)=>({x:i%w,y:Math.floor(i/w)});
  const traceBounds=(blob:Blob)=>Math.hypot(width(blob),height(blob));
  const head=(blob:Blob)=>{
    let peak=0,p:AiPoint=blob;
    for(const i of blob.pixels){
      const count=ink[i-1]+ink[i+1]+ink[i-w]+ink[i+w]+ink[i-2]+ink[i+2]+ink[i-2*w]+ink[i+2*w]
        +ink[i-w-1]+ink[i-w+1]+ink[i+w-1]+ink[i+w+1];
      if(count>peak){peak=count;p=dot(i);}
    }
    return {p,peak};
  };
  const actions:AiDiagramAction[]=[];
  const used=new Set<Blob>();
  const owner=(blob:Blob)=>{
    const ranked=roster.map(item=>({item,gap:blob.pixels.reduce((gap,i)=>Math.min(gap,distance(dot(i),item.center)),Infinity)-item.radius}))
      .sort((a,b)=>a.gap-b.gap);
    return ranked[0]?.gap<unit*.026 && (!ranked[1]||ranked[1].gap-ranked[0].gap>unit*.018)?ranked[0].item:undefined;
  };
  for(const trace of traces.filter(b=>traceBounds(b)>unit*.043&&b.pixels.length>unit*.062)){
    const source=owner(trace);
    if(!source)continue;
    const {p:tip,peak}=head(trace);
    if(traceBounds(trace)>unit*.13&&peak>=9&&distance(tip,source.center)>unit*.12){
      const dx=tip.x-source.center.x,dy=tip.y-source.center.y,len2=dx*dx+dy*dy;
      const samples=Array.from({length:9},()=>({x:0,y:0,n:0}));
      for(const i of trace.pixels){
        const p=dot(i),t=((p.x-source.center.x)*dx+(p.y-source.center.y)*dy)/len2;
        if(t<.065||t>.95)continue;
        const b=samples[Math.min(8,Math.floor(t*9))];b.x+=p.x;b.y+=p.y;b.n++;
      }
      const to=canonical(tip),from=source.player;
      const points=[from,...samples.filter(b=>b.n).map(b=>canonical({x:b.x/b.n,y:b.y/b.n})),to];
      actions.push({action:"cut",from,to,points,fromPlayer:from.key,confidence:.84,source:"Trajet continu et pointe de flèche"});
      used.add(trace);
    }else if(traceBounds(trace)<unit*.115){
      const origin=source.center;
      const far=trace.pixels.map(dot).sort((a,b)=>distance(b,origin)-distance(a,origin))[0];
      const length=distance(far,origin), ux=(far.x-origin.x)/length,uy=(far.y-origin.y)/length;
      const projected=trace.pixels.map(dot).map(p=>({p,t:(p.x-origin.x)*ux+(p.y-origin.y)*uy,s:(p.y-origin.y)*ux-(p.x-origin.x)*uy}));
      const max=Math.max(...projected.map(p=>p.t));
      const end=projected.filter(p=>p.t>max-unit*.017);
      const stem=projected.filter(p=>p.t<max-unit*.019);
      const spread=(a:typeof projected)=>a.length?Math.max(...a.map(p=>p.s))-Math.min(...a.map(p=>p.s)):0;
      if(end.length>=8&&stem.length>=4&&spread(end)>unit*.020&&spread(end)>spread(stem)*1.45){
        const to=canonical({x:end.reduce((sum,p)=>sum+p.p.x,0)/end.length,y:end.reduce((sum,p)=>sum+p.p.y,0)/end.length});
        actions.push({action:"screen",from:source.player,to,fromPlayer:source.player.key,confidence:.86,source:"Écran : barre perpendiculaire au tracé"});
        used.add(trace);
      }
    }
  }
  const short=traces.filter(b=>!used.has(b)&&traceBounds(b)<unit*.073);
  for(const source of roster){
    const candidates=short.filter(b=>b.pixels.length>unit*.10&&head(b).peak>=9).flatMap(blob=>{
      const end=head(blob).p,origin=source.center,length=distance(end,origin);
      if(length<unit*.16)return [];
      const ux=(end.x-origin.x)/length,uy=(end.y-origin.y)/length;
      const dashes=short.filter(b=>b!==blob&&b.pixels.length<blob.pixels.length*.55).map(b=>{
        const dx=b.x-origin.x,dy=b.y-origin.y;
        return {t:dx*ux+dy*uy,cross:Math.abs(dy*ux-dx*uy)};
      }).filter(b=>b.t>source.radius*.65&&b.t<length-unit*.017&&b.cross<unit*.012).sort((a,b)=>a.t-b.t);
      if(dashes.length<4||dashes[0].t>source.radius+unit*.049||length-dashes.at(-1)!.t>unit*.081)return [];
      const gaps=dashes.slice(1).filter((b,i)=>b.t-dashes[i].t>unit*.014&&b.t-dashes[i].t<unit*.064);
      const tip=blob.pixels.map(dot).reduce((best,p)=>distance(p,origin)>distance(best,origin)?p:best,end);
      return gaps.length>=3&&gaps.length>=dashes.length*.66?[{end:tip,score:gaps.length}]:[];
    }).sort((a,b)=>b.score-a.score);
    if(candidates[0])actions.push({action:"pass",from:source.player,to:canonical(candidates[0].end),fromPlayer:source.player.key,
      confidence:.85,source:"Passe : pointillés alignés et pointe de flèche"});
  }
  return {canvas,play,players:roster.map(item=>item.player),actions};
}
