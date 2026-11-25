import type { AiExerciseImport, AiExerciseDiagram } from './types';
import { refineDiagramInk } from './guided-ink';
import { courtToCanonical } from './court-geometry';
import { changeImportedActionKind } from './action-kind';
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,(a.y-b.y)*1.4);
/** A weak contour scan must not overrule a coherent reading of the whole diagram. */
export function reconcileScan(local: AiExerciseImport, ai: AiExerciseImport): AiExerciseImport {
 const current=local.diagrams?.length?local.diagrams:local.diagram?.detected?[local.diagram]:[];
 const base=current[0]||local.referenceFallback;
 // The request currently analyses one court. Never replace a multi-court page.
 if(current.length>1)return supplementScan(local,ai);
 const diagram=ai.diagram;
 const labels=diagram?.players.filter(p=>p.label && p.label!=='?' && p.labelConfident!==false)??[];
 const unique=new Set(labels.map(p=>`${p.team}:${p.label}`));
 const keys=new Set(diagram?.players.map(p=>p.key));
 const audited=diagram?.scanAudit?.version==='mybasket-diagram-v1';
 const coherent=diagram?.detected && (!base||diagram.courtType===base.courtType) && (audited || (labels.length>=2 && unique.size===labels.length && labels.length/diagram.players.length>=.75))
   && keys.size===diagram.players.length
   && diagram.actions.every(a=>(!a.fromPlayer||keys.has(a.fromPlayer))&&(!a.toPlayer||keys.has(a.toPlayer)));
 const weak=audited || !base || !!local.referenceFallback || base.players.length===0
   || base.players.filter(p=>p.label==='?'||p.labelConfident===false||(p.confidence??1)<.5).length>base.players.length/3;
 if(!weak)return supplementScan(local,ai);
 if(!coherent)return {...local,assistantResult:ai.assistantResult,warnings:[...local.warnings,'La lecture IA reste incertaine : le calque local est conservé pour vérification.']};
 // Keep reliable numbered players even if vision misses an isolated/off-court marker.
 const players=diagram.players.map(p=>({...p}));
 for(const p of base?.players??[]){
  if(p.label && p.label!=='?' && p.labelConfident!==false && (p.confidence??0)>=.8
    && !players.some(v=>v.label===p.label&&v.team===p.team)){
   const nearby=players.filter(v=>v.team===p.team && (!v.label||v.label==='?'||v.labelConfident===false) && distance(v,p)<.04);
   if(nearby.length===1){Object.assign(nearby[0],{label:p.label,labelConfident:true});continue}
   let key=`local-${p.key}`;while(players.some(v=>v.key===key))key=`local-${key}`;
   players.push({...p,key});
  }
 }
 // Match players by known number, or by a single nearby marker when OCR
 // could not read a number. Never map multiple unknown labels by text alone.
 const mapping=new Map((base?.players??[]).map(p=>{
  const labelKnown=!!p.label&&p.label!=='?'&&p.labelConfident!==false;
  const exact=labelKnown?players.filter(v=>v.label===p.label&&v.team===p.team):[];
  const nearby=players.filter(v=>v.team===p.team).map(v=>({v,gap:distance(v,p)})).sort((a,b)=>a.gap-b.gap);
  const match=exact.length===1?exact[0]:nearby[0]?.gap<.035&&(!nearby[1]||nearby[1].gap-nearby[0].gap>.018)?nearby[0].v:undefined;
  return [p.key,match?.key];
 }));
 const localActions=(base?.actions??[]).flatMap(action=>{
  const fromPlayer=mapping.get(action.fromPlayer||'');
  return fromPlayer?[{...action,fromPlayer,toPlayer:mapping.get(action.toPlayer||'')}]:[];
 });
 const verified=localActions.filter(action=>action.source?.startsWith("Pointe ou barre vérifiée")&&(action.confidence??0)>=.85);
 const used=new Set<typeof verified[number]>();
 const sameTail=(a:AiExerciseDiagram["actions"][number],b:AiExerciseDiagram["actions"][number])=>{
  const before=(line:typeof a)=>line.points?.findLast(p=>distance(p,line.to)>.025)??line.from;
  const p=before(a),q=before(b);if(!p||!q)return false;
  const dx=a.to.x-p.x,dy=(a.to.y-p.y)*1.4,ex=b.to.x-q.x,ey=(b.to.y-q.y)*1.4;
  return (dx*ex+dy*ey)/(Math.hypot(dx,dy)*Math.hypot(ex,ey)||1)>.78;
 };
 const corrected=diagram.actions.map(action=>{
  const matching=verified.filter(local=>!used.has(local)&&distance(local.to,action.to)<.027
    &&(local.fromPlayer===action.fromPlayer||sameTail(local,action)));
  if(matching.length!==1)return action;
  const local=matching[0];used.add(local);
  const conflict=action.fromPlayer&&action.fromPlayer!==local.fromPlayer&&(action.confidence??0)>=.65;
  return {...action,...local,terminalId:action.terminalId,order:action.order,
   ...(conflict?{confidence:.45,source:`${local.source} · départ IA et lecteur local différents, à vérifier`}:{}),
   ...(local.action==="pass"&&!local.toPlayer&&action.action==="pass"?{toPlayer:action.toPlayer}:{})};
 });
 // Keep independently reliable local movements that vision did not recover.
 const retained=localActions.filter(a=>(a.confidence??0)>=.8&&!used.has(a)
   && !corrected.some(b=>b.action===a.action&&distance(b.to,a.to)<.04&&b.fromPlayer===a.fromPlayer));
 const actions=[...corrected,...retained].map((a,index)=>{
  const line={...a,order:index+1};
  if(line.action!=='dribble'||!line.from||audited)return line;
  // Vision supplies the centreline; generate the visible dribble wave once.
  return {...changeImportedActionKind({...line,action:'cut'},'dribble'),confidence:line.confidence,source:line.source};
 });
 const revised={...diagram,players,courtReference:base?.courtReference,rectified:base?.rectified,actions};
 return {...local,source:'ai',assistantResult:ai.assistantResult,referenceFallback:undefined,diagram:revised,diagrams:[revised],
   confidence:{...local.confidence,diagram:ai.confidence.diagram},
   warnings:[...ai.warnings,'Lecture approfondie utilisée : vérifie les numéros, les extrémités et les joueurs liés aux traits.']};
}

/** Add reviewable suggestions, preserving local geometry and all existing actions. */
export function supplementScan(local:AiExerciseImport,ai:AiExerciseImport):AiExerciseImport{
 if(!ai.diagram?.detected)return{...local,warnings:[...local.warnings,'L’IA n’a pas proposé de schéma exploitable. La lecture locale est conservée.']};
 const current=local.diagrams?.length?local.diagrams:local.diagram?.detected?[local.diagram]:[];
 if(current.length>1)return{...local,warnings:[...local.warnings,'Plusieurs terrains dans cette image : utilise une photo par phase pour l’assistance IA.']};
 const base:AiExerciseDiagram=current[0]||local.referenceFallback||{...ai.diagram,players:[],actions:[],objects:[]};
 if(base.courtType!==ai.diagram.courtType)return{...local,warnings:[...local.warnings,'Les lectures du terrain diffèrent. Vérifie le cadrage ; la lecture locale est conservée.']};
 const players=base.players.map(p=>({...p})),mapping=new Map<string,string>();
 for(const candidate of ai.diagram.players){
  const existing=players.find(p=>p.team===candidate.team&&p.label===candidate.label&&p.label!=='?');
  if(existing){mapping.set(candidate.key,existing.key);continue}
  if(!candidate.label||candidate.label==='?')continue;
  const nearby=players.find(p=>p.team===candidate.team&&(p.label==='?'||p.labelConfident===false)&&distance(p,candidate)<.05);
  if(nearby){nearby.label=candidate.label;nearby.labelConfident=false;mapping.set(candidate.key,nearby.key);continue}
  const key=`ai-${candidate.key}`;players.push({...candidate,key,confidence:Math.min(candidate.confidence??.5,.65),labelConfident:false,source:'Proposition IA à confirmer'});mapping.set(candidate.key,key);
 }
 const actions=base.actions.map(a=>({...a}));let added=0;
 for(const candidate of ai.diagram.actions){
  const fromPlayer=mapping.get(candidate.fromPlayer||''),toPlayer=mapping.get(candidate.toPlayer||'');
  if(actions.some(a=>a.action===candidate.action&&a.fromPlayer===fromPlayer&&distance(a.to,candidate.to)<.035&&(!a.from||!candidate.from||distance(a.from,candidate.from)<.04)))continue;
  actions.push({...candidate,fromPlayer,toPlayer,confidence:Math.min(candidate.confidence??.5,fromPlayer ? .7 : .35),source:'Proposition IA à confirmer',order:actions.length+1});added++;
 }
 const diagram={...base,detected:players.length>0,players,actions};
 return{...local,diagram,diagrams:[diagram],source:'ai',assistantResult:ai.assistantResult,warnings:[...local.warnings,...ai.warnings,`L’IA a proposé ${added} action(s) supplémentaire(s). Vérifie leur départ, leur arrivée et leur ordre avant de valider.`]};
}
/** Send precisely the same calibrated photograph as the review canvas, without native court lines. */
export async function scanWithAI(file:File,reference?:AiExerciseDiagram['courtReference'],courtType:'half'|'full'='half',previousDiagram?:AiExerciseDiagram):Promise<AiExerciseImport>{
 const source=reference?.url||URL.createObjectURL(file);
 try{
  const image=new Image();image.src=source;await image.decode();
  const canvas=document.createElement('canvas');
  const ratio=Math.min(1,1800/image.naturalWidth,1800/image.naturalHeight);
  canvas.width=reference?1000:Math.max(1,Math.round(image.naturalWidth*ratio));
  canvas.height=reference?(courtType==='half'?783:1569):Math.max(1,Math.round(image.naturalHeight*ratio));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image illisible.');
  ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);
  if(reference){
   const top=courtToCanonical({x:0,y:0},courtType),bottom=courtToCanonical({x:1,y:1},courtType);
   const factor=courtType==='half'?2:1,play=reference.play;
   const w=(bottom.x-top.x)*canvas.width/(play.x1-play.x0);
   const h=(bottom.y-top.y)*factor*canvas.height/(play.y1-play.y0);
   ctx.drawImage(image,top.x*canvas.width-play.x0*w,top.y*factor*canvas.height-play.y0*h,w,h);
  }else ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const encoded=canvas.toDataURL('image/jpeg',.9);if(encoded.length>4_000_000)throw Error('Image trop grande pour l’assistance IA.');
  const response=await fetch('/api/ai/import/exercise',{method:'POST',headers:{'Content-Type':'application/json'},signal:AbortSignal.timeout(175_000),body:JSON.stringify({image:encoded,diagramOnly:true,previousDiagram,coordinateSpace:reference?'image':undefined,courtType:reference?courtType:undefined,note:'Distinguer les lignes du terrain, les cercles autour des numéros et les véritables actions. Suivre chaque trait depuis son joueur jusqu’à sa barre ou sa flèche. Une barre puis une flèche = deux actions distinctes du même joueur. Zigzag = dribble.'})});
  const body=await response.json();if(!response.ok||!body.exercise){const error=Object.assign(new Error(body.error||'Analyse IA indisponible.'),{status:response.status,diagnostic:body.diagnostic});throw error;}const exercise=body.exercise as AiExerciseImport;
  if(exercise.diagram?.scanAudit && typeof ctx.getImageData==='function')exercise.diagram=refineDiagramInk(exercise.diagram,ctx.getImageData(0,0,canvas.width,canvas.height));
  return exercise;
 }finally{if(!reference)URL.revokeObjectURL(source)}
}
