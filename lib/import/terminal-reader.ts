import type { DiagramScanAudit, ScanTerminal } from "./scan-audit";
import { courtToCanonical } from "./court-geometry";
import type { AiDiagramAction, AiDiagramPlayer, AiPoint, AiRect } from "./types";

export type InkTerminal = AiPoint & {
  kind: "arrow" | "bar";
  /** Unit vector pointing from the terminal back towards the shaft. */
  inward: AiPoint;
  size: number;
  score: number;
};
export type InkMarker = { key: string; center: AiPoint; radius: number };
export type TerminalRoute = {
  terminal: InkTerminal;
  action: "cut" | "screen" | "dribble" | "pass";
  fromPlayer: string;
  toPlayer?: string;
  points: AiPoint[];
  confidence?: number;
};

const distance=(a:AiPoint,b:AiPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
const dot=(a:AiPoint,b:AiPoint)=>a.x*b.x+a.y*b.y;
const vector=(a:AiPoint,b:AiPoint)=>{
  const length=distance(a,b)||1;
  return {x:(b.x-a.x)/length,y:(b.y-a.y)/length};
};
const add=(p:AiPoint,d:AiPoint,t:number)=>({x:p.x+d.x*t,y:p.y+d.y*t});

function makeSampler(mask:Uint8Array,width:number,height:number){
  return (point:AiPoint,radius=1)=>{
    const x=Math.round(point.x),y=Math.round(point.y);
    for(let dy=-radius;dy<=radius;dy++)for(let dx=-radius;dx<=radius;dx++){
      const px=x+dx,py=y+dy;
      if(px>=0&&px<width&&py>=0&&py<height&&mask[py*width+px])return true;
    }
    return false;
  };
}
type InkSampler=ReturnType<typeof makeSampler>;

function raySupport(ink:InkSampler,p:AiPoint,d:AiPoint,start:number,end:number,radius=1) {
  const steps=Math.max(3,Math.ceil(end-start));
  let hits=0;
  for(let i=0;i<steps;i++)if(ink(add(p,d,start+(end-start)*i/(steps-1)),radius))hits++;
  return hits/steps;
}

/** Find terminal geometry independently of a connected component's densest pixel. */
export function detectInkTerminals(mask:Uint8Array,width:number,height:number,unit:number):InkTerminal[]{
  const ink=makeSampler(mask,width,height);
  const directions=Array.from({length:24},(_,i)=>({x:Math.cos(i*Math.PI/12),y:Math.sin(i*Math.PI/12)}));
  // A thick felt-tip shaft must not fit a micro-arrow template. Estimate
  // representative stroke width from the distance of ink pixels to paper.
  const depth=new Uint16Array(mask.length);
  for(let i=0;i<mask.length;i++)if(mask[i])depth[i]=10000;
  for(let y=1;y<height-1;y++)for(let x=1;x<width-1;x++){
    const i=y*width+x;
    if(depth[i])depth[i]=Math.min(depth[i],depth[i-1]+1,depth[i-width]+1,depth[i-width-1]+2,depth[i-width+1]+2);
  }
  const histogram=new Uint32Array(50);
  let inkCount=0;
  for(let y=height-2;y>=1;y--)for(let x=width-2;x>=1;x--){
    const i=y*width+x;
    if(depth[i]){
      depth[i]=Math.min(depth[i],depth[i+1]+1,depth[i+width]+1,depth[i+width-1]+2,depth[i+width+1]+2);
      histogram[Math.min(histogram.length-1,depth[i])]++;inkCount++;
    }
  }
  let radius=1,cumulative=0;
  for(let i=1;i<histogram.length;i++){
    cumulative+=histogram[i];if(cumulative>=inkCount*.90){radius=i;break;}
  }
  const sizes=[.011,.015,.020,.028].map(scale=>Math.max(4,unit*scale,radius*3.2))
    .filter((size,i,all)=>i===0||size-all[i-1]>1.5);
  const candidates:InkTerminal[]=[];
  for(let index=0;index<mask.length;index++){
    if(!mask[index])continue;
    const p={x:index%width,y:Math.floor(index/width)};
    for(const inward of directions){
      // A terminal cannot have a continuation in front of it. This first
      // inexpensive check also rejects the middle of most ordinary curves.
      if(ink(add(p,inward,-sizes[0]),0))continue;
      const normal={x:-inward.y,y:inward.x};
      for(const size of sizes){
        if(raySupport(ink,p,inward,-size*2.4,-size*.55)>.15)continue;
        const shaft=raySupport(ink,p,inward,size*.9,size*2.1);
        if(shaft<.76)continue;
        const forwardContinues=[-75,-60,-45,-30,-15,0,15,30,45,60,75].some(degrees=>{
          const angle=degrees*Math.PI/180;
          const forward={x:-inward.x*Math.cos(angle)+inward.y*Math.sin(angle),y:-inward.y*Math.cos(angle)-inward.x*Math.sin(angle)};
          return raySupport(ink,p,forward,size*.85,size*2.3,1)>.48;
        });
        if(forwardContinues)continue;
        const left=vector({x:0,y:0},{x:inward.x+normal.x*.72,y:inward.y+normal.y*.72});
        const right=vector({x:0,y:0},{x:inward.x-normal.x*.72,y:inward.y-normal.y*.72});
        // Open or filled arrow: both backward arms converge at the tip.
        const a=raySupport(ink,p,left,size*.42,size*1.15);
        const b=raySupport(ink,p,right,size*.42,size*1.15);
        const arrowTail=raySupport(ink,p,left,size*1.45,size*1.9)+raySupport(ink,p,right,size*1.45,size*1.9);
        const leftWing=ink(add(p,left,size*1.15),0),rightWing=ink(add(p,right,size*1.15),0);
        if(a>=.76&&b>=.76&&arrowTail<=.8&&leftWing&&rightWing){
          candidates.push({...p,kind:"arrow",inward,size,score:(a+b+shaft)/3-arrowTail*.08});
        }
        // T-shaped terminal: symmetric perpendicular bar, empty beyond its
        // two ends and no shaft extending forward through the intersection.
        const barLeft=raySupport(ink,p,normal,size*.25,size);
        const barRight=raySupport(ink,p,normal,-size,-size*.25);
        const extended=raySupport(ink,p,normal,size*1.25,size*1.8)+raySupport(ink,p,normal,-size*1.8,-size*1.25);
        if(barLeft>=.85&&barRight>=.85&&extended<=.55&&a+b<1.45){
          const extent=(side:number)=>{
            let length=0;
            for(let t=1;t<=size*2;t++){
              if(!ink(add(p,normal,side*t),1))break;
              length=t;
            }
            return length;
          };
          const l=extent(1),r=extent(-1);
          if(Math.min(l,r)>=Math.max(l,r)*.70){
            candidates.push({...p,kind:"bar",inward,size,score:(barLeft+barRight+shaft)/3-extended*.08-Math.abs(l-r)*.01});
          }
        }
      }
    }
  }
  const result:InkTerminal[]=[];
  for(const candidate of candidates.sort((a,b)=>b.score-a.score)){
    // Different orientations at the same tip are alternative readings of
    // one mark. Prefer the stronger actual geometric support.
    if(result.some(other=>distance(other,candidate)<Math.max(other.size,candidate.size)*1.15))continue;
    result.push(candidate);
  }
  return result;
}

function uniqueMarker(markers:InkMarker[],p:AiPoint,margin:number){
  const candidates=markers.map(marker=>({marker,gap:distance(marker.center,p)-marker.radius})).sort((a,b)=>a.gap-b.gap);
  return candidates[0]?.gap<=margin&&(!candidates[1]||candidates[1].gap-candidates[0].gap>margin*.7)?candidates[0].marker:undefined;
}

function passReceiver(markers:InkMarker[],terminal:InkTerminal,source:string,unit:number){
  const others=markers.filter(marker=>marker.key!==source);
  const close=uniqueMarker(others,terminal,unit*.035);
  if(close)return close;
  // The drawn point often ends a little before the receiver's ring.
  // Continue the arrow axis only over a short gap, with no other candidate.
  const outward={x:-terminal.inward.x,y:-terminal.inward.y};
  const aligned=others.filter(marker=>distance(marker.center,terminal)<marker.radius+unit*.063
    &&dot(outward,vector(terminal,marker.center))>.86);
  return aligned.length===1?aligned[0]:undefined;
}

/** Passes are supported by multiple distinct ink runs, ordered towards an arrow. */
function dashedRoute(ink:InkSampler,terminal:InkTerminal,markers:InkMarker[],unit:number):TerminalRoute|null {
  if(terminal.kind!=="arrow")return null;
  const candidates:TerminalRoute[]=[];
  for(const marker of markers){
    const length=distance(marker.center,terminal);
    if(length<unit*.055||length<marker.radius+terminal.size*2.1)continue;
    const inward=vector(terminal,marker.center);
    if(dot(inward,terminal.inward)<.78)continue;
    const start=terminal.size*1.25,end=length-marker.radius*.95;
    if(end<=start)continue;
    const runs:{ink:boolean;length:number}[]=[];
    for(let t=start;t<=end;t+=1){
      const hit=ink(add(terminal,inward,t),2);
      const last=runs.at(-1);
      if(last?.ink===hit)last.length++;
      else runs.push({ink:hit,length:1});
    }
    const dashRuns=runs.filter(run=>run.ink&&run.length>=Math.max(4,unit*.008));
    const clearRuns=runs.slice(1,-1).filter(run=>!run.ink&&run.length>=Math.max(4,unit*.007));
    const occupied=runs.filter(run=>run.ink).reduce((sum,run)=>sum+run.length,0)/(end-start+1);
    const receiver=passReceiver(markers,terminal,marker.key,unit);
    const short=!!receiver&&terminal.score>=.90&&dashRuns.length===2&&clearRuns.length>=1;
    if((!short&&(dashRuns.length<3||clearRuns.length<2))||occupied<.23||occupied>.8)continue;
    const gaps=clearRuns.map(run=>run.length).sort((a,b)=>a-b);
    const medianGap=gaps[Math.floor(gaps.length/2)];
    if(gaps.at(-1)!>Math.max(unit*.075,medianGap*2.5)||gaps[0]<medianGap*.35)continue;
    const dashes=dashRuns.map(run=>run.length).sort((a,b)=>a-b);
    const medianDash=dashes[Math.floor(dashes.length/2)];
    if(dashes.filter(length=>length>=medianDash*.4&&length<=medianDash*2.5).length<Math.ceil(dashes.length*.75))continue;
    if(runs[0]?.ink===false&&runs[0].length>unit*.035)continue;
    if(runs.at(-1)?.ink===false&&runs.at(-1)!.length>unit*.035)continue;
    candidates.push({terminal,action:"pass",fromPlayer:marker.key,toPlayer:receiver?.key,points:[marker.center,terminal],
      confidence:short?.78:.86});
  }
  return candidates.length===1?candidates[0]:null;
}

export function isWave(points:AiPoint[],unit:number){
  // One-pixel stair steps and tracker jitter should never create a
  // dribble. Smooth at pixel scale, then measure alternating bends over
  // a window comparable to one real wave.
  const smooth=points.map((point,i)=>{
    const a=points[Math.max(0,i-1)],b=points[Math.min(points.length-1,i+1)];
    return {x:(a.x+point.x*2+b.x)/4,y:(a.y+point.y*2+b.y)/4};
  });
  let turns=0,last=0,lastChange=-10;
  for(let i=3;i<smooth.length-3;i++){
    const before=smooth[i-3],p=smooth[i],after=smooth[i+3];
    const base=distance(before,after);
    if(base<unit*.009)continue;
    const offset=((after.x-before.x)*(p.y-before.y)-(after.y-before.y)*(p.x-before.x))/base;
    if(Math.abs(offset)<Math.max(2,unit*.0045))continue;
    const side=Math.sign(offset);
    if(last&&last!==side&&i-lastChange>=2){turns++;lastChange=i;}
    last=side;
  }
  return turns>=4;
}

/** Follow a shaft backwards, locally, favouring its tangent at crossings. */
function continuousRoute(ink:InkSampler,terminal:InkTerminal,markers:InkMarker[],unit:number,allowUnowned=false):TerminalRoute|null{
  const step=Math.max(3,Math.round(unit*.007));
  let direction=terminal.inward;
  let current=add(terminal,direction,terminal.size*1.25);
  if(!ink(current,2))return null;
  const back=[{x:terminal.x,y:terminal.y},current];
  const angles=[0,15,-15,30,-30,45,-45,60,-60,80,-80].map(angle=>angle*Math.PI/180);
  let marker:InkMarker|undefined;
  let bridged=false;
  let gaps=0;
  const crossedMarkers=new Set<InkMarker>();
  for(let count=0;count<Math.ceil(unit*2.4/step);count++){
    const nearby=uniqueMarker(markers.filter(candidate=>!crossedMarkers.has(candidate)),current,Math.max(step,unit*.028));
    const approaching=nearby&&back.length>=3&&dot(direction,vector(current,nearby.center))>.55?nearby:undefined;
    if(approaching&&distance(approaching.center,current)-approaching.radius<=step*.85){
      // A marker can cover a crossing route. Never attach just because it
      // is nearby: look for an aligned shaft on the opposite edge.
      const center=approaching.center;
      const toCenter={x:center.x-current.x,y:center.y-current.y};
      const projection=dot(toCenter,direction);
      const lateral=Math.abs(toCenter.x*direction.y-toCenter.y*direction.x);
      const radius=approaching.radius;
      let continuation:AiPoint|undefined;
      if(projection>0&&lateral<radius*.40){
        const far=projection+Math.sqrt(radius*radius-lateral*lateral);
        for(let offset=1;offset<=step;offset++){
          const exit=add(current,direction,far+offset);
          if(ink(exit,1)&&raySupport(ink,exit,direction,0,step*2,1)>=.90){continuation=exit;break;}
        }
      }
      if(continuation){
        crossedMarkers.add(approaching);
        current=continuation;back.push(current);bridged=true;continue;
      }
      marker=approaching;break;
    }
    const choices=angles.flatMap(angle=>{
      const nextDirection={x:direction.x*Math.cos(angle)-direction.y*Math.sin(angle),y:direction.x*Math.sin(angle)+direction.y*Math.cos(angle)};
      const point=add(current,nextDirection,step);
      if(!ink(point,1)||back.slice(0,-3).some(old=>distance(old,point)<step*.8))return [];
      const support=raySupport(ink,current,nextDirection,0,step,1);
      if(support<.85)return [];
      const centered=ink(point,0)?1:0;
      return [{point,nextDirection,score:support*2+centered*.8+Math.cos(angle)*.9}];
    }).sort((a,b)=>b.score-a.score);
    if(!choices.length){
      // Weak ink or a thin court-line mask can leave a small hole. Recover
      // only along the current tangent with sustained ink on the far side.
      let resumed:AiPoint|undefined;
      if(!approaching&&gaps<2&&back.length>=4){
        const tangent=vector(back[Math.max(0,back.length-5)],current);
        for(const angle of [0,-15,15,-30,30].map(value=>value*Math.PI/180)){
          const heading={x:tangent.x*Math.cos(angle)-tangent.y*Math.sin(angle),y:tangent.x*Math.sin(angle)+tangent.y*Math.cos(angle)};
          for(let gap=step+1;gap<=Math.min(step*3,unit*.022);gap++){
            const point=add(current,heading,gap);
            if(ink(point,1)&&raySupport(ink,point,heading,0,step*2,1)>=.85){
              resumed=point;direction=heading;break;
            }
          }
          if(resumed)break;
        }
      }
      if(resumed){current=resumed;back.push(current);gaps++;continue;}
      marker=approaching;break;
    }
    const next=choices[0];
    current=next.point;direction=next.nextDirection;
    back.push(current);
  }
  if(!marker){
    if(!allowUnowned||terminal.score<.94||back.length<8||distance(current,terminal)<unit*.065)return null;
    const points=back.reverse();
    return {terminal,action:terminal.kind==="bar"?"screen":isWave(points,unit)?"dribble":"cut",fromPlayer:"",points,confidence:.45};
  }
  if(distance(marker.center,terminal)<marker.radius+unit*.035)return null;
  const points=[marker.center,...back.reverse()];
  return {terminal,action:terminal.kind==="bar"?"screen":isWave(back,unit)?"dribble":"cut",fromPlayer:marker.key,points,...(bridged||gaps?{confidence:.78}:{})};
}

export function readTerminalRoutes(mask:Uint8Array,width:number,height:number,unit:number,markers:InkMarker[],inventory?:InkTerminal[]){
  if(unit<80||mask.length!==width*height||!markers.length)return [];
  const inkCount=mask.reduce((sum,pixel)=>sum+Number(!!pixel),0);
  if(inkCount>unit*unit*.15)return [];
  const ink=makeSampler(mask,width,height);
  const terminals=inventory??detectInkTerminals(mask,width,height,unit);
  const routes:TerminalRoute[]=[];
  const claimed=new Set<InkTerminal>();
  // Classify the ink before assigning a fallback movement type. A dotted
  // route cannot become a cut merely because its final dash is continuous.
  const collect=(starts:InkMarker[])=>{
    const pending=terminals.filter(terminal=>!claimed.has(terminal));
    const candidates=pending.flatMap(terminal=>{
      const origins=starts.filter(marker=>marker.center!==terminal);
      const pass=dashedRoute(ink,terminal,origins,unit);
      const continuous=pass?null:continuousRoute(ink,terminal,origins,unit);
      const route=pass??continuous;
      return route?[route]:[];
    });
    for(const kind of ["pass","dribble","screen","cut"] as const){
      for(const route of candidates.filter(candidate=>candidate.action===kind)){
        claimed.add(route.terminal);
        routes.push(route);
      }
    }
  };
  collect(markers);
  // Resolve further departures in waves: the end of a screen or a cut can
  // be the start of another movement by the same player.
  const arrivals=()=>routes.filter(route=>route.action!=="pass").map(route=>({
    key:route.fromPlayer,center:route.terminal,radius:Math.max(3,route.terminal.size*.45),
  }));
  while(claimed.size<terminals.length){
    const previous=claimed.size;
    collect([...markers,...arrivals()]);
    if(claimed.size===previous)break;
  }
  const receptionPoints=arrivals();
  for(const route of routes){
    if(route.action==="pass"&&!route.toPlayer){
      route.toPlayer=passReceiver(receptionPoints,route.terminal,route.fromPlayer,unit)?.key;
    }
  }
  return routes;
}

function distanceToSegment(point:AiPoint,start:AiPoint,end:AiPoint){
  const dx=end.x-start.x,dy=end.y-start.y;
  const t=Math.max(0,Math.min(1,((point.x-start.x)*dx+(point.y-start.y)*dy)/(dx*dx+dy*dy||1)));
  return distance(point,{x:start.x+t*dx,y:start.y+t*dy});
}

function pathDistance(point:AiPoint,path:AiPoint[]){
  return path.slice(1).reduce((best,end,i)=>Math.min(best,distanceToSegment(point,path[i],end)),Infinity);
}

/** Reconcile with the existing reader only where a geometric terminal and route agree. */
export function mergeTerminalRoutes(
  actions:AiDiagramAction[],routes:TerminalRoute[],unit:number,
  toImage:(point:AiPoint)=>AiPoint,canonical:(point:AiPoint)=>AiPoint,
):AiDiagramAction[]{
  const merged=actions.map(action=>({...action}));
  const confirmed=new Map<AiDiagramAction,TerminalRoute>();
  const kindMatches=(action:AiDiagramAction,route:TerminalRoute)=>route.terminal.kind==="bar"?action.action==="screen":action.action!=="screen";
  for(const route of routes){
    const endpoint=route.terminal;
    const from=route.points[0];
    const candidates=merged.filter(action=>{
      if(confirmed.has(action)||action.action==="freedraw"||action.action==="giveball")return false;
      if(distance(toImage(action.to),endpoint)>unit*.027)return false;
      const points=(action.points?.length?action.points:action.from?[action.from,action.to]:[]).map(toImage);
      const last=points.at(-1);
      const tail=last&&points.findLast(p=>distance(p,last)>unit*.018);
      const aligned=!!last&&!!tail&&dot(vector(last,tail),endpoint.inward)>.70;
      return action.fromPlayer===route.fromPlayer||(!action.fromPlayer&&aligned)||aligned&&kindMatches(action,route);
    });
    // If another verified arrow points into the same area from a different
    // player, keep the two actions independent.
    const competitors=routes.filter(other=>other!==route&&distance(other.terminal,endpoint)<unit*.027);
    const available=candidates.filter(action=>!competitors.some(other=>other.fromPlayer===action.fromPlayer&&other.fromPlayer!==route.fromPlayer));
    const exact=available.find(action=>action.fromPlayer===route.fromPlayer&&action.action===route.action);
    const match=exact??(available.length===1?available[0]:undefined);
    const stride=Math.max(1,Math.ceil(route.points.length/72));
    const points=route.points.filter((_,i)=>i===0||i===route.points.length-1||i%stride===0).map(canonical);
    const evidence:AiDiagramAction={
      action:route.action,from:canonical(from),to:canonical(endpoint),points,
      fromPlayer:route.fromPlayer,toPlayer:route.action==="pass"?route.toPlayer:undefined,
      confidence:route.confidence??.86,geometry:"traced",source:"Pointe ou barre vérifiée · encre suivie jusqu’au départ",
    };
    if(match?.action==="shoot"&&route.action==="cut")evidence.action="shoot";
    if(match){
      if(match.fromPlayer&&match.fromPlayer!==route.fromPlayer&&((match.confidence??0)>=.65||match.action!==route.action)){
        // A route that could have followed an adjacent court marking must
        // not silently steal a known departure. Keep one line for review.
        match.confidence=Math.min(match.confidence??1,.45);
        match.source=`${match.source??"Détection"} · départ contradictoire à vérifier`;
        continue;
      }
      // Keep an already reliable pass target when the receiver is moving.
      if(evidence.action==="pass"&&!evidence.toPlayer&&match.action==="pass")evidence.toPlayer=match.toPlayer;
      if(match.fromPlayer&&match.fromPlayer!==route.fromPlayer)evidence.confidence=.45;
      const replacement={...match,...evidence,geometry:"traced" as const,...(evidence.action!=="pass"?{continuationChoice:undefined}:{})};
      merged[merged.indexOf(match)]=replacement;confirmed.set(replacement,route);
    }else if(!available.length){
      merged.push(evidence);confirmed.set(evidence,route);
    }
  }
  const result=merged.filter(action=>{
    if(confirmed.has(action))return true;
    if(action.action!=="freedraw"&&action.action!=="giveball"&&action.fromPlayer){
      const start=action.from&&toImage(action.from),end=toImage(action.to);
      const path=(action.points?.length?action.points:action.from?[action.from,action.to]:[]).map(toImage);
      const duplicate=routes.some(route=>{
        if(route.fromPlayer!==action.fromPlayer||!start||distance(route.points[0],start)>unit*.065)return false;
        if(distance(route.terminal,end)<unit*.027)return true;
        if(action.action==="screen"||action.action==="pass"||route.action==="pass"||route.action==="screen")return false;
        if(distance(route.terminal,end)<unit*.035||distance(route.points[0],end)<unit*.07)return false;
        // Only discard an incomplete trace if its entire visible path lies on
        // a longer, independently verified path and it has no own terminal.
        return !routes.some(other=>distance(other.terminal,end)<unit*.025)&&
          path.length>=3&&path.every(point=>pathDistance(point,route.points)<unit*.016)&&
          pathDistance(end,route.points)<unit*.012;
      });
      if(duplicate)return false;
    }
    if(action.action!=="screen")return true;
    const end=toImage(action.to);
    if(routes.some(route=>route.terminal.kind==="bar"&&distance(route.terminal,end)<unit*.027))return true;
    // A crossing of two independently verified paths cannot be counted as
    // a third screen. Require both paths to continue on either side.
    const crossing=routes.filter(route=>route.action!=="pass"&&route.action!=="screen"
      &&distance(route.points[0],end)>unit*.055&&distance(route.terminal,end)>unit*.055
      &&pathDistance(end,route.points)<unit*.014);
    if(new Set(crossing.map(route=>route.fromPlayer)).size>=2||crossing.some(route=>route.fromPlayer===action.fromPlayer&&action.from&&pathDistance(toImage(action.from),route.points)<unit*.025))return false;
    if(crossing.length){
      action.confidence=Math.min(action.confidence??1,.45);
      action.source=`${action.source??"Détection"} · barre terminale à distinguer du croisement`;
    }
    return true;
  });
  // A route beginning where the same player's verified movement ends
  // must occur after that movement, even when the arrow was found first.
  for(const action of [...result]){
    const route=confirmed.get(action);
    if(!route)continue;
    const predecessor=result.filter(other=>other!==action&&other.fromPlayer===action.fromPlayer
      &&other.action!=="pass"&&confirmed.has(other)&&distance(toImage(other.to),route.points[0])<unit*.018);
    if(predecessor.length===1&&result.indexOf(predecessor[0])>result.indexOf(action)){
      result.splice(result.indexOf(action),1);
      result.splice(result.indexOf(predecessor[0])+1,0,action);
    }
  }
  return result;
}

/** Review the actual end of every putative screen against the ink. */
export function rejectCrossingScreens(mask:Uint8Array,width:number,height:number,unit:number,actions:AiDiagramAction[],toImage:(p:AiPoint)=>AiPoint){
  const ink=makeSampler(mask,width,height);
  return actions.filter(action=>{
    if(action.action!=="screen"||!action.from)return true;
    const end=toImage(action.to);
    const path=(action.points?.length?action.points:[action.from,action.to]).map(toImage);
    const before=path.findLast(point=>distance(point,end)>unit*.025);
    if(!before)return true;
    const forward=vector(before,end);
    // A genuine bar is short; a continuing shaft has ink beyond it.
    const continues=[0,-12,12,-24,24].some(degrees=>{
      const angle=degrees*Math.PI/180;
      const direction={x:forward.x*Math.cos(angle)-forward.y*Math.sin(angle),y:forward.x*Math.sin(angle)+forward.y*Math.cos(angle)};
      return raySupport(ink,end,direction,unit*.018,unit*.065,1)>.85;
    });
    if(!continues)return true;
    const longer=actions.find(other=>other!==action&&other.action!=="screen"&&other.action!=="pass"&&other.fromPlayer===action.fromPlayer&&other.from&&distance(toImage(other.to),end)>unit*.045&&
      pathDistance(end,(other.points?.length?other.points:[other.from,other.to]).map(toImage))<unit*.022);
    if(longer)return false;
    // Preserve the visible partial trace for review when the full endpoint
    // has not yet been recovered, without labelling the crossing an screen.
    action.action="cut";
    action.confidence=Math.min(action.confidence??1,.45);
    action.source="Trait continu après le croisement · extrémité à vérifier";
    return true;
  });
}

/** Audit independent terminals even when the external vision service is down. */
export function auditLocalInk(mask:Uint8Array,width:number,height:number,unit:number,markers:InkMarker[],actions:AiDiagramAction[],
  toImage:(p:AiPoint)=>AiPoint,canonical:(p:AiPoint)=>AiPoint,paper=false):{actions:AiDiagramAction[];scanAudit?:DiagramScanAudit}{
  if(unit<80||mask.length!==width*height||mask.reduce((sum,p)=>sum+Number(!!p),0)>unit*unit*.15)return {actions};
  const inventory=detectInkTerminals(mask,width,height,unit);
  const routes=readTerminalRoutes(mask,width,height,unit,markers,inventory).flatMap(route=>{
    if(!paper||route.action==="pass"||route.action==="dribble"||actions.some(action=>distance(toImage(action.to),route.terminal)<unit*.035))return [route];
    return route.terminal.score>=.94&&(route.confidence??.86)>=.85?[{...route,confidence:.45}]:[];
  });
  const merged=mergeTerminalRoutes(actions,routes,unit,toImage,canonical);
  // Recover the visible shaft even when its owner was obscured or the
  // player OCR failed. The review must explicitly resolve that ownership.
  const unownedTerminals = new Set<InkTerminal>();
  const ink = makeSampler(mask, width, height);
  for (const terminal of inventory) {
    if (paper && terminal.score < .97) continue;
    if (routes.some(route => route.terminal === terminal) ||
        merged.some(action => distance(toImage(action.to), terminal) < unit * .027)) continue;
    const partial = continuousRoute(ink, terminal, markers, unit, true);
    if (!partial || partial.fromPlayer) continue;
    const points = partial.points.map(canonical);
    merged.push({ action: partial.action, from: points[0], to: points.at(-1)!, points,
      geometry: "traced", confidence: .45, source: "Trajectoire visible · joueur au départ à confirmer" });
    unownedTerminals.add(terminal);
  }
  const recovered=recoverArrivalPasses(mask,width,height,unit,markers,merged,toImage,canonical);
  const final=rejectCrossingScreens(mask,width,height,unit,recovered,toImage);
  const terminals:ScanTerminal[]=[];
  for(const terminal of inventory){
    const route=routes.find(item=>item.terminal===terminal);
    if(!route&&terminal.score<.94)continue;
    // Masking may leave highlights in printed court markings. Unattached
    // terminals on paper are only counted when close to an existing trace.
    if(paper&&!route&&!unownedTerminals.has(terminal)&&!actions.some(action=>distance(toImage(action.to),terminal)<unit*.035))continue;
    const position=canonical(terminal);
    const style=route?.action==="pass"?"dashed":route?.action==="dribble"?"wave":route?"solid":"unknown";
    terminals.push({...position,id:`local-${terminals.length+1}`,kind:terminal.kind,confidence:terminal.score,strokeStyle:style,styleConfidence:route?.confidence??(route ? .86 : undefined)});
  }
  return {actions:final,scanAudit:{version:"mybasket-diagram-v1",terminals,passes:1,warnings:[]}};
}

/** Use the same terminal reader on paper after the existing court-line mask. */
export async function readAlignedTerminalRoutes(
  source: HTMLCanvasElement, play: AiRect, players: AiDiagramPlayer[], actions: AiDiagramAction[],
): Promise<{actions:AiDiagramAction[];scanAudit?:DiagramScanAudit}> {
  if(!players.length)return {actions};
  const canvas=document.createElement("canvas");
  const scale=Math.min(1,900/Math.max(source.width,source.height));
  canvas.width=Math.round(source.width*scale);canvas.height=Math.round(source.height*scale);
  const ctx=canvas.getContext("2d",{willReadFrequently:true});
  if(!ctx)return {actions};
  const {width,height}=canvas;
  ctx.drawImage(source,0,0,width,height);
  const {data}=ctx.getImageData(0,0,width,height);
  const unit=(play.x1-play.x0)*scale,depth=(play.y1-play.y0)*scale;
  if(unit<=80||depth<=80)return {actions};
  const top=courtToCanonical({x:0,y:0},"half"),bottom=courtToCanonical({x:1,y:1},"half");
  const toImage=(p:AiPoint)=>({x:play.x0*scale+unit*(p.x-top.x)/(bottom.x-top.x),y:play.y0*scale+depth*(p.y-top.y)/(bottom.y-top.y)});
  const canonical=(p:AiPoint)=>courtToCanonical({x:(p.x-play.x0*scale)/unit,y:(p.y-play.y0*scale)/depth},"half");
  const markers=players.map(player=>({key:player.key,center:toImage(player),radius:unit*.035}));
  const ink=new Uint8Array(width*height);
  for(let i=0;i<ink.length;i++){
    const p={x:i%width,y:Math.floor(i/width)};
    if(p.x<play.x0*scale||p.x>play.x1*scale||p.y<play.y0*scale||p.y>play.y1*scale)continue;
    if(Math.max(data[i*4],data[i*4+1],data[i*4+2])<145
      && !markers.some(marker=>distance(marker.center,p)<marker.radius))ink[i]=1;
  }
  return auditLocalInk(ink,width,height,unit,markers,actions,toImage,canonical,true);
}

/** A pass can start and finish at movement arrivals, including a shared
 * arrowhead where the connected-component reader sees only one movement. */
export function recoverArrivalPasses(mask:Uint8Array,width:number,height:number,unit:number,
  markers:InkMarker[],actions:AiDiagramAction[],toImage:(p:AiPoint)=>AiPoint,canonical:(p:AiPoint)=>AiPoint):AiDiagramAction[]{
  const ink=makeSampler(mask,width,height);
  const arrivals=actions.flatMap(action=>action.fromPlayer&&["cut","dribble"].includes(action.action)&&(action.confidence??0)>=.55
    ?[{key:action.fromPlayer,center:toImage(action.to),radius:unit*.012,action}]:[]);
  const positions=[...markers.map(marker=>({...marker,action:undefined as AiDiagramAction|undefined})),...arrivals];
  const proposals:{source:typeof positions[number];target:typeof positions[number];score:number}[]=[];
  for(const source of positions)for(const target of positions){
    if(source.key===target.key||(!source.action&&!target.action))continue;
    const length=distance(source.center,target.center);
    if(length<unit*.075)continue;
    const axis=vector(source.center,target.center);
    const perpendicular={x:-axis.y,y:axis.x};
    // A movement arrowhead may end a few pixels beside the first dash.
    // Sample a narrow fan at action arrivals; keep the best continuous
    // dash series instead of requiring perfect pixel alignment.
    const shifts=[0,-.012,.012,-.024,.024,-.03,.03].map(factor=>factor*unit);
    const offsets=source.action?shifts:[0];
    for(const offset of offsets){
      const origin=add(source.center,perpendicular,offset);
      const heading=vector(origin,target.center);
      const span=distance(origin,target.center);
      const start=source.radius+unit*.009,end=span-target.radius-unit*.009;
      if(end-start<unit*.055)continue;
      const runs:{hit:boolean;size:number}[]=[];
      for(let t=start;t<=end;t++){
        const hit=ink(add(origin,heading,t),1);
        const last=runs.at(-1);
        if(last?.hit===hit)last.size++;else runs.push({hit,size:1});
      }
      const dashes=runs.filter(r=>r.hit&&r.size>=Math.max(3,unit*.005));
      const gaps=runs.slice(1,-1).filter(r=>!r.hit&&r.size>=Math.max(3,unit*.005));
      if(dashes.length<3||gaps.length<2)continue;
      const coverage=dashes.reduce((sum,r)=>sum+r.size,0)/(end-start+1);
      if(coverage<.20||coverage>.80)continue;
      const median=gaps.map(r=>r.size).sort((a,b)=>a-b)[Math.floor(gaps.length/2)];
      if(gaps.some(r=>r.size>Math.max(unit*.045,median*2.4)||r.size<median*.36))continue;
      if(runs[0]?.hit===false&&runs[0].size>unit*.035||runs.at(-1)?.hit===false&&runs.at(-1)!.size>unit*.035)continue;
      // Inspect both wings at the destination even when the tip coincides
      // with another action. A series of unrelated spots is not sufficient.
      const inward={x:-heading.x,y:-heading.y};
      const normal={x:-inward.y,y:inward.x};
      const left=vector({x:0,y:0},{x:inward.x+normal.x*.72,y:inward.y+normal.y*.72});
      const right=vector({x:0,y:0},{x:inward.x-normal.x*.72,y:inward.y-normal.y*.72});
      let arrow=false;
      for(let offset=0;offset<=target.radius+unit*.018&&!arrow;offset+=2){
        const tip=add(target.center,inward,offset);
        for(const size of [unit*.012,unit*.018,unit*.024]){
          if(raySupport(ink,tip,left,size*.35,size*1.1,1)>=.65&&raySupport(ink,tip,right,size*.35,size*1.1,1)>=.65){arrow=true;break;}
        }
      }
      if(!arrow)continue;
      proposals.push({source,target,score:dashes.length+gaps.length-Math.abs(offset)/unit});
    }
  }
  const result=[...actions];
  for(const proposal of proposals.sort((a,b)=>b.score-a.score)){
    const {source,target}=proposal;
    const from=canonical(source.center),to=canonical(target.center);
    if(result.some(a=>a.action==="pass"&&distance(toImage(a.to),target.center)<unit*.045&&a.from&&distance(toImage(a.from),source.center)<unit*.045))continue;
    const reverse=proposals.find(p=>p.source.key===target.key&&p.target.key===source.key&&distance(p.source.center,target.center)<unit*.035&&distance(p.target.center,source.center)<unit*.035);
    if(reverse&&reverse.score>=proposal.score)continue;
    const action:AiDiagramAction={action:"pass",from,to,points:[from,to],fromPlayer:source.key,toPlayer:target.key,confidence:.72,source:"Pointillés et flèche vérifiés entre deux positions de jeu"};
    const after=Math.max(source.action?result.indexOf(source.action):-1,target.action?result.indexOf(target.action):-1);
    result.splice(after+1,0,action);
  }
  return result;
}
