import type { AiDiagramAction, AiPoint } from "./types";
import { isWave } from "./terminal-reader";
import type { InkMarker, TerminalRoute } from "./terminal-reader";

const distance=(a:AiPoint,b:AiPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
const direction=(a:AiPoint,b:AiPoint)=>{const d=distance(a,b)||1;return {x:(b.x-a.x)/d,y:(b.y-a.y)/d};};
const dot=(a:AiPoint,b:AiPoint)=>a.x*b.x+a.y*b.y;

/** Thin ink without disconnecting branches. This retains the topology of
 * the original stroke when two actions touch or cross. */
function skeleton(mask:Uint8Array,w:number,h:number){
  const result=mask.slice();
  for(let pass=0;pass<40;pass++){
    let changed=0;
    for(let step=0;step<2;step++){
      const remove:number[]=[];
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
        const i=y*w+x;if(!result[i])continue;
        const n=[result[i-w],result[i-w+1],result[i+1],result[i+w+1],result[i+w],result[i+w-1],result[i-1],result[i-w-1]];
        const count=n.reduce((a,b)=>a+b,0);
        if(count<2||count>6||n.filter((v,j)=>!v&&n[(j+1)%8]).length!==1)continue;
        if(step===0?n[0]*n[2]*n[4]||n[2]*n[4]*n[6]:n[0]*n[2]*n[6]||n[0]*n[4]*n[6])continue;
        remove.push(i);
      }
      for(const i of remove)result[i]=0;
      changed+=remove.length;
    }
    if(!changed)break;
  }
  return result;
}

export function readDigitalStrokeGraph(mask:Uint8Array,w:number,h:number,unit:number,markers:InkMarker[]):TerminalRoute[]{
  const thin=skeleton(mask,w,h);
  const point=(i:number):AiPoint=>({x:i%w,y:Math.floor(i/w)});
  const adjacent=(i:number)=>{
    const x=i%w, result:number[]=[];
    for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){
      if((!dx&&!dy)||x+dx<0||x+dx>=w)continue;
      const j=i+dy*w+dx;
      if(!thin[j]||dx&&dy&&(thin[i+dx]||thin[i+dy*w]))continue;
      result.push(j);
    }
    return result;
  };
  const length=(path:number[])=>path.slice(1).reduce((s,i,j)=>s+distance(point(i),point(path[j])),0);
  const atDistance=(path:number[],span:number)=>{
    let total=0;
    for(let i=1;i<path.length;i++){total+=distance(point(path[i-1]),point(path[i]));if(total>=span)return point(path[i]);}
    return point(path.at(-1)!);
  };
  const branch=(start:number,next:number)=>{
    const path=[start,next];
    while(path.length<unit*3){
      const options=adjacent(path.at(-1)!).filter(i=>i!==path.at(-2));
      if(options.length!==1||path.includes(options[0]))break;
      path.push(options[0]);
    }
    return path;
  };
  type Candidate={ node:number; shaft:number[]; kind:"arrow"|"bar"; score:number };
  const candidates:Candidate[]=[];
  const nearMarker=(p:AiPoint)=>markers.some(m=>distance(m.center,p)<m.radius+unit*.018);
  const arrowScore=(p:AiPoint,shaft:number[])=>{
    const axis=direction(p,atDistance(shaft,unit*.027)),normal={x:-axis.y,y:axis.x};
    const widths:number[]=[];
    for(let t=0;t<=unit*.035;t++){
      let extent=0;
      for(let s=-Math.ceil(unit*.017);s<=unit*.017;s++){
        const x=Math.round(p.x+axis.x*t+normal.x*s),y=Math.round(p.y+axis.y*t+normal.y*s);
        if(mask[y*w+x])extent++;
      }
      widths.push(extent);
    }
    const head=Math.max(...widths.slice(0,Math.ceil(unit*.019)));
    const stem=widths.slice(Math.ceil(unit*.022)).sort((a,b)=>a-b);
    const typical=stem[Math.floor(stem.length/2)]??1;
    return head>=4&&head>=typical*1.6&&typical<=4?Math.min(.98,.80+head*.02):0;
  };
  const extendWing=(path:number[])=>{
    if(length(path)>unit*.012||adjacent(path.at(-1)!).length===1)return path;
    const end=path.at(-1)!;
    const options=adjacent(end).filter(n=>!path.includes(n)).map(n=>branch(end,n))
      .filter(b=>length(b)<unit*.023&&adjacent(b.at(-1)!).length===1)
      .sort((a,b)=>length(a)-length(b));
    return options.length?[...path,...options[0].slice(1)]:path;
  };
  for(let i=0;i<thin.length;i++){
    if(!thin[i]||nearMarker(point(i)))continue;
    const neighbors=adjacent(i);
    if(neighbors.length===1){
      const shaft=branch(i,neighbors[0]);
      if(length(shaft)<unit*.023)continue;
      const score=arrowScore(point(i),shaft);
      if(score)candidates.push({node:i,shaft,kind:"arrow",score});
    }else if(neighbors.length===3){
      const branches=neighbors.map(n=>branch(i,n));
      for(const shaft of branches){
        const wings=branches.filter(b=>b!==shaft).map(extendWing);
        const lengths=wings.map(length);


        if(length(shaft)<unit*.020)continue;
        const p=point(i),axis=direction(p,atDistance(shaft,unit*.017));
        if(lengths.some(n=>n>unit*.028)){
          // A filled arrow may be joined to another arrow at the landing.
          const score=arrowScore(p,shaft);
          if(score>=.94&&length(shaft)>unit*.055&&lengths.some(n=>n<unit*.018)&&
            Math.abs(dot(axis,direction(p,atDistance(wings.find(b=>length(b)>unit*.028)!,unit*.025))))<.65)
            candidates.push({node:i,shaft,kind:"arrow",score});
          continue;
        }
        if(lengths.some(n=>n<unit*.005)||!wings.some(b=>adjacent(b.at(-1)!).length===1))continue;
        const a=direction(p,atDistance(wings[0],unit*.010)),b=direction(p,atDistance(wings[1],unit*.010));

        if(dot(a,b)<-.65&&Math.abs(dot(axis,a))<.76&&Math.abs(dot(axis,b))<.76){
          candidates.push({node:i,shaft,kind:"bar",score:.94});
        }else{
          const score=arrowScore(p,shaft);
          if(score>=.94&&length(shaft)>unit*.055)candidates.push({node:i,shaft,kind:"arrow",score});
        }
      }
    }
  }
  const routes:TerminalRoute[]=[];
  for(const candidate of candidates.sort((a,b)=>Number(b.kind==="bar")-Number(a.kind==="bar")||b.score-a.score)){
    const origin=point(candidate.node);
    const path=[...candidate.shaft];
    const visited=new Set(path);
    for(let turns=0;turns<25;turns++){
      const end=path.at(-1)!;
      if(candidate.kind==="arrow"&&routes.some(route=>route.action==="screen"&&distance(route.terminal,point(end))<unit*.012&&distance(origin,point(end))>unit*.065))break;
      const incoming=direction(atDistance([...path].reverse(),unit*.055),point(end));
      const options=adjacent(end).filter(i=>!visited.has(i)).map(i=>branch(end,i)).filter(b=>b.slice(1).every(i=>!visited.has(i)));
      const ranked=options.map(b=>({b,score:dot(incoming,direction(point(end),atDistance(b,unit*.055)))})).sort((a,b)=>b.score-a.score);
      if(!ranked.length||ranked[0].score<.25){
        const marker=markers.find(m=>distance(m.center,point(end))<m.radius+unit*.016);
        if(!marker||candidate.kind==="bar"||adjacent(end).length!==1)break;
        const bridges:{index:number;score:number}[]=[];
        for(let y=Math.max(0,Math.floor(marker.center.y-marker.radius-unit*.018));y<=Math.min(h-1,marker.center.y+marker.radius+unit*.018);y++)
          for(let x=Math.max(0,Math.floor(marker.center.x-marker.radius-unit*.018));x<=Math.min(w-1,marker.center.x+marker.radius+unit*.018);x++){
            const i=y*w+x;
            if(!thin[i]||visited.has(i)||adjacent(i).length!==1)continue;
            const gap=distance(point(end),point(i));
            if(gap<marker.radius*.65||gap>marker.radius*2.6||dot(incoming,direction(point(end),point(i)))<.82)continue;
            const next=branch(i,adjacent(i)[0]);
            if(length(next)<unit*.018||dot(direction(point(end),point(i)),direction(point(i),atDistance(next,unit*.023)))<.72)continue;
            const bridgeDirection=direction(point(end),point(i));
            const score=dot(incoming,bridgeDirection)+dot(bridgeDirection,direction(point(i),atDistance(next,unit*.035)))-gap/unit;
            bridges.push({index:i,score});
          }
        bridges.sort((a,b)=>b.score-a.score);
        if(!bridges.length||(bridges[1]&&bridges[0].score-bridges[1].score<.06))break;
        const i=bridges[0].index,next=branch(i,adjacent(i)[0]);
        for(const j of next){path.push(j);visited.add(j);}
        continue;
      }
      for(const i of ranked[0].b.slice(1)){path.push(i);visited.add(i);}
    }
    const end=point(path.at(-1)!);
    const owners=markers.map(m=>({m,gap:distance(m.center,end)-m.radius})).sort((a,b)=>a.gap-b.gap);
    const screen=routes.find(route=>route.action==="screen"&&distance(route.terminal,end)<unit*.018&&distance(origin,end)>unit*.065);
    const owner=screen?markers.find(marker=>marker.key===screen.fromPlayer):
      owners[0]?.gap<unit*.037&&(!owners[1]||owners[1].gap-owners[0].gap>unit*.012)?owners[0].m:undefined;
    const departure=screen?.terminal??owner?.center;
    if(!owner||!departure||distance(departure,origin)<(screen?unit*.04:owner.radius+unit*.022))continue;
    const points=[departure,...path.reverse().map(point)];
    // Compare the change of tangent over a real drawing-scale window;
    // staircase noise in a straight shaft has no effect at that scale.
    const sampled=points.filter((_,i)=>i%3===0);
    const kind=candidate.kind==="bar"?"screen":isWave(sampled,unit)?"dribble":"cut";
    const inward=direction(origin,atDistance(candidate.shaft,unit*.018));
    if(routes.some(r=>r.action===kind&&r.fromPlayer===owner.key&&distance(r.terminal,origin)<unit*.023))continue;
    routes.push({action:kind,fromPlayer:owner.key,points,terminal:{...origin,kind:candidate.kind,inward,size:unit*.012,score:candidate.score},confidence:.90});
  }
  return routes;
}

/** Prefer topology-proven complete routes over fragments guessed from a
 * connected component. A separately verified bar keeps its screen type. */
export function reconcileDigitalRoutes(actions:AiDiagramAction[],routes:TerminalRoute[],unit:number,
  toImage:(p:AiPoint)=>AiPoint,canonical:(p:AiPoint)=>AiPoint):AiDiagramAction[]{
  const result=[...actions];
  const reconstructed=new Set<AiDiagramAction>();
  for(const route of routes){
    const near=result.filter(action=>!reconstructed.has(action)&&action.action!=="pass"&&action.action!=="freedraw"&&
      distance(toImage(action.to),route.terminal)<unit*.027);
    const verifiedBar=near.find(action=>action.action==="screen"&&action.fromPlayer===route.fromPlayer&&
      action.source?.startsWith("Pointe ou barre vérifiée"));
    if(verifiedBar&&route.action!=="screen")continue;
    const points=route.points.filter((_,i)=>i===0||i===route.points.length-1||i%Math.max(1,Math.ceil(route.points.length/72))===0).map(canonical);
    const replacement:AiDiagramAction={action:route.action,fromPlayer:route.fromPlayer,from:points[0],to:points.at(-1)!,
      points,confidence:route.confidence,geometry:"traced",source:"Trajectoire et terminaison vérifiées par topologie"};
    const matching=near.filter(action=>!action.fromPlayer||action.fromPlayer===route.fromPlayer||distance(toImage(action.to),route.terminal)<unit*.012);
    const index=matching.length?Math.min(...matching.map(action=>result.indexOf(action))):result.length;
    for(const action of matching)result.splice(result.indexOf(action),1);
    result.splice(index,0,replacement);
    reconstructed.add(replacement);
  }
  // A legacy screen placed in the middle of its owner's complete graph
  // route is not a second action. Require independent bar evidence to keep it.
  return result.filter(action=>{
    if(action.action!=="screen"||action.source?.startsWith("Trajectoire et terminaison")||action.source?.startsWith("Pointe ou barre vérifiée"))return true;
    const end=toImage(action.to);
    return !routes.some(route=>route.action==="cut"&&route.fromPlayer===action.fromPlayer&&
      distance(route.terminal,end)>unit*.04&&route.points.some(point=>distance(point,end)<unit*.018));
  });
}

/** Resolve the dependencies visible in the geometry without guessing a
 * chronology for unrelated movements. */
export function orderDigitalActions(actions:AiDiagramAction[],unit:number,toImage:(p:AiPoint)=>AiPoint){
  const remaining=[...actions],ordered:AiDiagramAction[]=[];
  const movement=(action:AiDiagramAction)=>["cut","screen","dribble"].includes(action.action);
  const close=(a:AiPoint|undefined,b:AiPoint|undefined)=>!!a&&!!b&&distance(toImage(a),toImage(b))<unit*.045;
  const before=(a:AiDiagramAction,b:AiDiagramAction)=>{
    if(a===b||!a.fromPlayer||!b.fromPlayer)return false;
    if(movement(a)&&a.fromPlayer===b.fromPlayer&&close(a.to,b.from)&&!close(a.from,b.from))return true;
    if(a.action==="pass"&&b.action==="dribble"&&a.toPlayer===b.fromPlayer&&b.from&&distance(toImage(a.to),toImage(b.from))<unit*.065)return true;
    if(a.action==="pass"&&movement(b)&&a.fromPlayer===b.fromPlayer&&close(a.from,b.from))return true;
    if(movement(a)&&b.action==="pass"&&a.fromPlayer===b.toPlayer&&close(a.to,b.to))return true;
    return false;
  };
  while(remaining.length){
    const ready=remaining.findIndex(action=>!remaining.some(previous=>before(previous,action)));
    // Conflicting drawing conventions can form a cycle. Keep the original
    // relative order for that unresolved group.
    ordered.push(remaining.splice(ready<0?0:ready,1)[0]);
  }
  return ordered.map((action,index)=>({...action,order:index+1}));
}
