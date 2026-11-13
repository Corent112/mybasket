import { courtToCanonical } from "./court-geometry";
import { ocrLandmarkGlyph } from "./ocr";
import type { AiDiagramAction, AiDiagramObject, AiDiagramPlayer, AiPoint, AiRect } from "./types";

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
  const floor=new Uint8Array(w*h), white=new Uint8Array(w*h);
  for(let i=0;i<floor.length;i++){
    const r=rgba[4*i],g=rgba[4*i+1],b=rgba[4*i+2];
    if(r<75&&g>r+45&&b>g+25)keyMask[i]=1;
    if(r<95&&g<120&&g>r+9&&b>r+17)blue[i]=1;
    if(r>152&&r>g+7&&g>b+5&&g>125)floor[i]=1;
    if((Math.max(r,g,b)<157&&b<=r+24)||(r<34&&g<105&&b<151))ink[i]=1;
    if(Math.min(r,g,b)>220&&Math.max(r,g,b)-Math.min(r,g,b)<27)white[i]=1;
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
  const tokens=components(blue.slice(),w,Math.max(20,unit*.24)).filter(b=>{
    const bw=width(b),bh=height(b);
    if(bw<unit*.044||bw>unit*.105||bh/bw<.78||bh/bw>1.23||b.pixels.length/(bw*bh)>.42
      ||b.x0<x0-unit*.012||b.x1>x1+unit*.012||b.y0<y0-unit*.012||b.y1>y1+unit*.012)return false;
    const p=center(b),radius=(bw+bh)/4;
    const arcs=new Set<number>();
    for (const i of b.pixels) {
      const dx=i%w-p.x, dy=Math.floor(i/w)-p.y, r=Math.hypot(dx,dy);
      if (r>=radius*.74 && r<=radius*1.15) arcs.add(Math.floor((Math.atan2(dy,dx)+Math.PI)*6/Math.PI)%12);
    }
    if (arcs.size<9) return false;
    let white=0,total=0;
    for(let y=Math.ceil(p.y-radius*.56);y<=p.y+radius*.56;y++)for(let x=Math.ceil(p.x-radius*.56);x<=p.x+radius*.56;x++){
      const i=(y*w+x)*4;
      if(Math.min(rgba[i],rgba[i+1],rgba[i+2])>185)white++;
      total++;
    }
    return white>total*.40;
  });
  // A nearby ball or arrow can join the ring to another component. Use
  // its enclosed white interior to recover the centre in that case.
  for (const interior of components(white,w,Math.max(14,unit*.09))) {
    const bw=width(interior),bh=height(interior),p=center(interior);
    if (bw<unit*.025||bw>unit*.079||bh/bw<.68||bh/bw>1.47
      ||p.x<x0||p.x>x1||p.y<y0||p.y>y1
      ||tokens.some(token=>distance(center(token),p)<unit*.045)) continue;
    const radius=(bw+bh)/4;
    const sectors=Array.from({length:16},(_,i)=>{
      const angle=i*Math.PI/8;
      return [1,1.12,1.25,1.38,1.51].some(scale=>{
        const x=Math.round(p.x+Math.cos(angle)*radius*scale);
        const y=Math.round(p.y+Math.sin(angle)*radius*scale);
        return blue[y*w+x]===1;
      });
    });
    if(sectors.filter(Boolean).length<12)continue;
    const r=Math.round(radius*1.24);
    tokens.push({...interior,x0:p.x-r,x1:p.x+r,y0:p.y-r,y1:p.y+r});
  }
  // The court is already proven. If some rings are unreadable, keep this
  // crop for review rather than asking the generic scanner to invent players.
  if(tokens.length>20)return {canvas,play,players:[],objects:[],actions:[]};

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
    const numbered=!!read&&read.confidence>=.5;
    roster.push({center:p,radius,player:{key:`ring-${n}`,label:read&&read.confidence>=.45?read.text:"",...canonical(p),team:"att",
      type:numbered?"attacker":"unknown",typeConfidence:numbered ? .94 : .35,labelConfident:numbered,confidence:.94,
      source:"Centre du cercle numéroté détecté"}});
  }
  const objects: AiDiagramObject[]=[];
  for (const ball of balls) {
    if(ball.x<x0||ball.x>x1||ball.y<y0||ball.y>y1||width(ball)/height(ball)<.65||width(ball)/height(ball)>1.5)continue;
    const nearest=roster.filter(item=>distance(item.center,ball)<=item.radius*1.45+Math.max(width(ball),height(ball))/2)
      .sort((a,b)=>distance(a.center,ball)-distance(b.center,ball))[0];
    if(nearest)nearest.player.hasBall=true;
    else objects.push({kind:"ball",...canonical(ball),confidence:.87,source:"Ballon orange détecté"});
  }
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
  const head=(blob:Blob,origin?:AiPoint,minDistance=0)=>{
    let peak=0,p:AiPoint=blob;
    for(const i of blob.pixels){
      if(origin&&distance(dot(i),origin)<minDistance)continue;
      const count=ink[i-1]+ink[i+1]+ink[i-w]+ink[i+w]+ink[i-2]+ink[i+2]+ink[i-2*w]+ink[i+2*w]
        +ink[i-w-1]+ink[i-w+1]+ink[i+w-1]+ink[i+w+1];
      if(count>peak){peak=count;p=dot(i);}
    }
    return {p,peak};
  };
  // A marker can hide the middle of a stroke. Reconnect only opposite
  // fragments whose local directions agree with the gap through the ring.
  for(const {center:marker,radius} of roster){
    const contacts=traces.filter(blob=>traceBounds(blob)>unit*.105).flatMap(blob=>{
      const points=blob.pixels.map(dot);
      const entry=points.reduce((best,p)=>distance(p,marker)<distance(best,marker)?p:best);
      if(distance(entry,marker)>radius+unit*.023)return [];
      const shaft=points.filter(p=>distance(p,entry)>radius*.55&&distance(p,entry)<radius*1.25);
      if(shaft.length<4)return [];
      const tangent={x:shaft.reduce((sum,p)=>sum+p.x-entry.x,0)/shaft.length,
        y:shaft.reduce((sum,p)=>sum+p.y-entry.y,0)/shaft.length};
      return [{blob,entry,tangent}];
    });
    const pairs=contacts.flatMap((a,i)=>contacts.slice(i+1).flatMap(b=>{
      const dx=b.entry.x-a.entry.x,dy=b.entry.y-a.entry.y,len=Math.hypot(dx,dy);
      if(len<radius*1.35||len>radius*2.9)return [];
      const alignment=(v:AiPoint)=>(v.x*dx+v.y*dy)/(Math.hypot(v.x,v.y)*len||1);
      const score=Math.min(-alignment(a.tangent),alignment(b.tangent));
      return score>.78?[{a,b,score,len}]:[];
    })).sort((a,b)=>b.score-a.score);
    const pair=pairs[0];
    if(!pair||(pairs[1]&&pair.score-pairs[1].score<.09))continue;
    const {a,b,len}=pair;
    const pixels=[...a.blob.pixels,...b.blob.pixels];
    for(let i=1;i<len;i++){
      const t=i/len;
      pixels.push(Math.round(a.entry.y+(b.entry.y-a.entry.y)*t)*w+Math.round(a.entry.x+(b.entry.x-a.entry.x)*t));
    }
    traces.splice(traces.indexOf(a.blob),1);
    traces.splice(traces.indexOf(b.blob),1);
    traces.push({...a.blob,pixels,x0:Math.min(a.blob.x0,b.blob.x0),y0:Math.min(a.blob.y0,b.blob.y0),
      x1:Math.max(a.blob.x1,b.blob.x1),y1:Math.max(a.blob.y1,b.blob.y1)});
  }
  const actions:AiDiagramAction[]=[];
  const used=new Set<Blob>();
  const owner=(blob:Blob)=>{
    const ranked=roster.map(item=>({item,gap:blob.pixels.reduce((gap,i)=>Math.min(gap,distance(dot(i),item.center)),Infinity)-item.radius}))
      .sort((a,b)=>a.gap-b.gap);
    return ranked[0]?.gap<unit*.026 && (!ranked[1]||ranked[1].gap-ranked[0].gap>unit*.018)?ranked[0].item:undefined;
  };
  for(const trace of traces.filter(b=>traceBounds(b)>unit*.043&&b.pixels.length>unit*.062)){
    const {p:tip,peak}=head(trace);
    if(traceBounds(trace)>unit*.13&&peak>=9){
      const pixels=new Set(trace.pixels);
      const seed=Math.round(tip.y)*w+Math.round(tip.x);
      const parents=new Map([[seed,seed]]);
      const queue=[seed];
      let start=seed;
      for(let k=0;k<queue.length;k++){
        const i=queue[k], p=dot(i);
        if(distance(p,tip)>distance(dot(start),tip))start=i;
        for(const dy of [-1,0,1])for(const dx of [-1,0,1]){
          if(p.x+dx<0||p.x+dx>=w)continue;
          const next=i+dy*w+dx;
          if(!pixels.has(next)||parents.has(next))continue;
          parents.set(next,i);
          queue.push(next);
        }
      }
      const origin=dot(start);
      const candidates=roster.map(item=>({item,gap:distance(origin,item.center)-item.radius}))
        .sort((a,b)=>a.gap-b.gap);
      const source=candidates[0]?.gap<unit*.055&&(!candidates[1]||candidates[1].gap-candidates[0].gap>unit*.018)
        ?candidates[0].item:undefined;
      if(distance(origin,tip)<unit*.12)continue;
      const from=source?.player??canonical(origin),to=canonical(tip);
      const shaft:AiPoint[]=[];
      for(let i=start;i!==seed;i=parents.get(i)!)shaft.push(dot(i));
      const step=Math.max(2,Math.ceil(shaft.length/36));
      const points=[from,...shaft.filter((_,i)=>i%step===0).map(p=>canonical(p)),to];
      actions.push({action:"cut",from,to,points,fromPlayer:source?.player.key,confidence:source?.player ? .84 : .47,source:"Trajet continu et pointe de flèche"});
      used.add(trace);
    }else if(traceBounds(trace)<unit*.115){
      const source=owner(trace);
      if(!source)continue;
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
  const dribbleEnds=new Map<string,AiPoint>();
  for(const source of roster.filter(item=>item.player.hasBall)){
    const origin=source.center;
    const ball=balls.find(item=>distance(item,origin)<source.radius*2);
    if(!ball)continue;
    const trace=traces.find(blob=>!used.has(blob)&&traceBounds(blob)>unit*.075&&traceBounds(blob)<unit*.16
      &&blob.pixels.some(i=>distance(dot(i),ball)<Math.max(width(ball),height(ball))*.8)
      && head(blob,ball,unit*.045).peak>=7);
    if(!trace)continue;
    const end=trace.pixels.map(dot).reduce((best,p)=>distance(p,ball)>distance(best,ball)?p:best,ball);
    dribbleEnds.set(source.player.key,end);
    used.add(trace);
    actions.push({action:"dribble",from:source.player,to:canonical(end),fromPlayer:source.player.key,
      confidence:.8,source:"Trajet court dans le prolongement du ballon"});
  }
  const short=traces.filter(b=>!used.has(b)&&traceBounds(b)<unit*.125);
  for(const source of roster){
    const candidates=short.filter(b=>b.pixels.length>unit*.085&&head(b).peak>=5).flatMap(blob=>{
      const origin=dribbleEnds.get(source.player.key) ?? source.center;
      const end=blob.pixels.map(dot).reduce((best,p)=>distance(p,origin)>distance(best,origin)?p:best,blob);
      const length=distance(end,origin);
      if(length<unit*.16)return [];
      const ux=(end.x-origin.x)/length,uy=(end.y-origin.y)/length;
      const dashes=short.filter(b=>b!==blob&&b.pixels.length<Math.max(16,blob.pixels.length*.65)).map(b=>{
        const dx=b.x-origin.x,dy=b.y-origin.y;
        return {t:dx*ux+dy*uy,cross:Math.abs(dy*ux-dx*uy)};
      }).filter(b=>b.t>source.radius*.65&&b.t<length-unit*.017&&b.cross<unit*.014).sort((a,b)=>a.t-b.t);
      if(dashes.length<4||dashes[0].t>source.radius+unit*.055||length-dashes.at(-1)!.t>unit*.09)return [];
      const gaps=dashes.slice(1).filter((b,i)=>b.t-dashes[i].t>unit*.014&&b.t-dashes[i].t<unit*.064);
      return gaps.length>=3&&gaps.length>=(dashes.length-1)*.75?[{
        end,score:gaps.length,
        receiver:roster.find(item=>item!==source&&distance(item.center,end)<item.radius+unit*.045),
      }]:[];
    }).sort((a,b)=>b.score-a.score);
    const accepted: AiPoint[]=[];
    for (const candidate of candidates) {
      if (accepted.some(end=>distance(end,candidate.end)<unit*.055)) continue;
      accepted.push(candidate.end);
      actions.push({action:"pass",from:canonical(dribbleEnds.get(source.player.key) ?? source.center),to:canonical(candidate.end),fromPlayer:source.player.key,
        toPlayer:candidate.receiver?.player.key,confidence:.85,source:"Passe : pointillés alignés et pointe de flèche"});
    }
  }
  // An unassigned pass can meet a cut that starts at the end of an
  // screen. Look for the intervening solid stroke before linking them.
  const topLeft=canonical({x:x0,y:y0}),bottomRight=canonical({x:x1,y:y1});
  const toImage=({x,y}:AiPoint)=>({
    x:x0+(x-topLeft.x)*unit/(bottomRight.x-topLeft.x),
    y:y0+(y-topLeft.y)*(y1-y0)/(bottomRight.y-topLeft.y),
  });
  for (const pass of actions.filter(action=>action.action==="pass"&&!action.toPlayer)) {
    const catchPoint=toImage(pass.to);
    const continuations=actions.filter(action=>action.action==="screen"&&action.fromPlayer&&action.fromPlayer!==pass.fromPlayer).flatMap(screen=>{
      const start=toImage(screen.to);
      const dx=catchPoint.x-start.x,dy=catchPoint.y-start.y,length=Math.hypot(dx,dy);
      if(length<unit*.075||length>unit*.29)return [];
      return traces.filter(blob=>!used.has(blob)&&traceBounds(blob)>length*.55&&traceBounds(blob)<length*1.45)
        .flatMap(blob=>{
          const pixels=blob.pixels.map(dot);
          const entry=pixels.reduce((best,p)=>distance(p,start)<distance(best,start)?p:best);
          const tip=pixels.reduce((best,p)=>distance(p,catchPoint)<distance(best,catchPoint)?p:best);
          if(distance(entry,start)>unit*.045||distance(tip,catchPoint)>unit*.026
            ||distance(entry,tip)<length*.55||head(blob,start,length*.48).peak<7)return [];
          const bins=Array.from({length:5},()=>({x:0,y:0,count:0}));
          for(const p of pixels){
            const t=((p.x-start.x)*dx+(p.y-start.y)*dy)/(length*length);
            if(t<.12||t>.88)continue;
            const bin=bins[Math.floor(t*bins.length)];
            bin.x+=p.x;bin.y+=p.y;bin.count++;
          }
          const curve=bins.filter(bin=>bin.count).map(bin=>canonical({x:bin.x/bin.count,y:bin.y/bin.count}));
          return [{screen,blob,curve,score:distance(entry,start)+distance(tip,catchPoint)}];
        });
    }).sort((a,b)=>a.score-b.score);
    const match=continuations[0];
    if(!match||(continuations[1]&&continuations[1].score-match.score<unit*.015))continue;
    used.add(match.blob);
    const cut:AiDiagramAction={action:"cut",from:match.screen.to,to:pass.to,
      points:[match.screen.to,...match.curve,pass.to],fromPlayer:match.screen.fromPlayer,
      confidence:.79,source:"Coupe après écran : trait continu jusqu’au point de réception"};
    pass.toPlayer=cut.fromPlayer;
    // The receiver first needs to get to the end of the cut, and the
    // passer needs the ball if a feed to that player was detected.
    actions.splice(actions.indexOf(pass),1);
    const feed=actions.find(action=>action.action==="pass"&&action.toPlayer===pass.fromPlayer);
    const after=Math.max(actions.indexOf(match.screen),feed?actions.indexOf(feed):-1);
    actions.splice(after+1,0,cut,pass);
  }
  // A player's initial movement must not move the starting point of a
  // detected dribble from the original ball position.
  for (const dribble of actions.filter(action=>action.action==="dribble")) {
    const index=actions.indexOf(dribble);
    const priorCut=actions.slice(0,index).find(action=>action.action==="cut"&&action.fromPlayer===dribble.fromPlayer
      &&action.from&&dribble.from&&distance(action.from,dribble.from)<.018);
    if(priorCut){
      actions.splice(actions.indexOf(priorCut),1);
      actions.push(priorCut);
    }
  }
  return {canvas,play,players:roster.map(item=>item.player),objects,actions};
}
