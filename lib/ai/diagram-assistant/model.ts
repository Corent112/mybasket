import { DiagramReadError, type DiagramStage } from './errors';
import { applyHomography, solveHomography } from '../../import/homography';
import { courtToCanonical } from '../../import/court-geometry';
import { changeImportedActionKind } from '../../import/action-kind';
import type { AiDiagramAction, AiDiagramPlayer, AiExerciseDiagram, AiPoint } from '../../import/types';
import type { ScanTerminal } from '../../import/scan-audit';
import { unresolvedScanTerminals } from '../../import/scan-audit';

type Json = Record<string, unknown>;
export const record=(value:unknown):Json=>value && typeof value==='object'&&!Array.isArray(value)?value as Json:{};
const list=(value:unknown)=>Array.isArray(value)?value:[];
const text=(value:unknown,max=80)=>typeof value==='string'?value.trim().slice(0,max):'';
const scalar=(value:unknown)=>typeof value==='number'&&Number.isFinite(value)?value:undefined;
const score=(value:unknown)=>Math.max(0,Math.min(1,scalar(value)??0));
export const point=(value:unknown):AiPoint|undefined=>{
 const row=record(value),x=scalar(row.x),y=scalar(row.y);
 return x!==undefined&&y!==undefined&&x>=0&&x<=1&&y>=0&&y<=1?{x,y}:undefined;
};
const distance=(a:AiPoint,b:AiPoint)=>Math.hypot(a.x-b.x,(a.y-b.y)*1.4);
export function parseVisionJson(value:string,stage:DiagramStage="inventory"):unknown{
 const clean=value.trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');
 const start=clean.indexOf('{'),end=clean.lastIndexOf('}');
 if(start<0||end<=start)throw new DiagramReadError('invalid_json',stage);
 try{return JSON.parse(clean.slice(start,end+1))}catch{throw new DiagramReadError('invalid_json',stage)}
}
export type Scene = {courtType:'half'|'full';players:AiDiagramPlayer[];terminals:ScanTerminal[];warnings:string[];map:(p:AiPoint)=>AiPoint;sourceCorners?:AiPoint[];sourceInventory:unknown};
export function readScene(raw:unknown,calibrated:boolean,expectedCourt?:'half'|'full'):Scene{
 const row=record(raw),court=record(row.court),courtType=expectedCourt??(court.type==='full'?'full':'half');
 if(list(row.players).length>20||list(row.terminals).length>60)throw new DiagramReadError('too_dense','inventory');
 const warnings=list(row.warnings).map(v=>text(v,240)).filter(Boolean);
 const corners=list(court.corners).map(point).filter((p):p is AiPoint=>!!p);
 const homography=!calibrated&&corners.length===4&&score(court.confidence)>=.5
  ?solveHomography(corners,[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]):null;
 if(!calibrated&&!homography)throw new DiagramReadError('invalid_geometry','inventory');
 const map=(p:AiPoint):AiPoint=>calibrated?{x:p.x,y:p.y*(courtType==='half'?.5:1)}:courtToCanonical(applyHomography(homography!,p),courtType);
 const inventoryPlayers:unknown[]=[],inventoryTerminals:unknown[]=[];
 const players:AiDiagramPlayer[]=[],keys=new Set<string>(),labels=new Set<string>();
 for(const [index,value] of list(row.players).slice(0,20).entries()){
  const p=record(value),at=point(p);if(!at)continue;
  let key=text(p.key,30)||`p${index+1}`;while(keys.has(key))key=`p${index+1}-${key}`;keys.add(key);
  const team=p.team==='def'?'def':'att';let label=text(p.label,4)||'?';const identity=`${team}:${label}`;
  if(label!=='?'&&labels.has(identity)){label='?';warnings.push('Numéro répété : un joueur reste à numéroter.')}else labels.add(identity);
  const confidence=score(p.confidence);
  inventoryPlayers.push({...at,key,label,team,hasBall:p.hasBall===true,confidence});
  players.push({...map(at),key,label,team,hasBall:p.hasBall===true,confidence,labelConfident:label!=='?'&&confidence>=.75,
   type:team==='def'?'defender':'attacker',typeConfidence:confidence,source:'Assistant schémas MyBasket · inventaire'});
 }
 if(!players.length)throw new DiagramReadError('no_players','inventory');
 const terminals:ScanTerminal[]=[],ids=new Set<string>();
 for(const [index,value] of list(row.terminals).slice(0,60).entries()){
  const t=record(value),at=point(t);if(!at||!['bar','arrow'].includes(String(t.kind)))continue;
  let id=text(t.id,40)||`t${index+1}`;while(ids.has(id))id=`t${index+1}-${id}`;ids.add(id);
  const kind=t.kind==='bar'?'bar':'arrow';
  if(terminals.some(other=>other.kind===kind&&distance(other,map(at))<.007))continue;
  const style=String(t.strokeStyle);
  const strokeStyle=['dashed','wave','solid','unknown'].includes(style)?style as ScanTerminal['strokeStyle']:undefined;
  const styleFields=strokeStyle?{strokeStyle,styleConfidence:score(t.styleConfidence)}:{};
  terminals.push({...map(at),id,kind,confidence:score(t.confidence),...styleFields});
  inventoryTerminals.push({...at,id,kind,confidence:score(t.confidence),...styleFields});
 }
 return{courtType,players,terminals,warnings,map,sourceCorners:calibrated?undefined:corners,sourceInventory:{court:{...court,type:courtType},players:inventoryPlayers,terminals:inventoryTerminals,warnings}};
}
export function assembleDiagram(scene:Scene,raw:unknown,passes:number):AiExerciseDiagram{
 const row=record(raw),warnings=[...scene.warnings,...list(row.warnings).map(v=>text(v,240)).filter(Boolean)];
 const byPlayer=new Map(scene.players.map(p=>[p.key,p]));
 const terminals=[...scene.terminals],terminalIds=new Set(terminals.map(t=>t.id));
 for(const value of list(row.additionalTerminals).slice(0,20)){
  const t=record(value),p=point(t),id=text(t.id,40);if(!p||!id||terminalIds.has(id)||!['bar','arrow'].includes(String(t.kind)))continue;
  const at=scene.map(p),kind=t.kind==='bar'?'bar':'arrow';
  if(terminals.some(other=>other.kind===kind&&distance(other,at)<.007))continue;
  terminals.push({...at,id,kind,confidence:score(t.confidence)});terminalIds.add(id);
 }
 if(list(row.actions).length>60)throw new DiagramReadError('too_dense','paths');
 const nodes=list(row.actions).slice(0,60).map(value=>({...record(value)})),byTerminal=new Map<string,Json>();
 for(const [index,node] of nodes.entries()){
  let id=text(node.terminalId,40);
  const prior=byTerminal.get(id);
  if(prior){
   const start=point(node.from),previousStart=point(prior.from);
   const end=point(node.to),previousEnd=point(prior.to);
   const distinct=Boolean(start&&previousStart&&distance(start,previousStart)>.025)
     ||Boolean(end&&previousEnd&&distance(end,previousEnd)>.025);
   if(!distinct)continue;
   warnings.push(`Repère ${id} partagé : le second tracé reste à vérifier.`);
   id='';
  }
  if(!id){
   id=`untracked-${index+1}`;
   while(terminalIds.has(id))id+='-';
  }
  if(!terminalIds.has(id)){
   const at=point(node.to);
   if(!at)throw new DiagramReadError('invalid_geometry','paths');
   terminals.push({...scene.map(at),id,kind:node.action==='screen'?'bar':'arrow',confidence:.3});terminalIds.add(id);
   warnings.push(`Trait ${id} : terminaison supplémentaire à confirmer.`);
  }
  if(!byTerminal.has(id))byTerminal.set(id,node);
 }
 const actions:AiDiagramAction[]=[],built=new Map<string,AiDiagramAction>(),visiting=new Set<string>();
 const visit=(id:string):AiDiagramAction|undefined=>{
  if(built.has(id))return built.get(id);
  if(visiting.has(id)){warnings.push('Enchaînement circulaire à vérifier.');return undefined}
  const node=byTerminal.get(id),terminal=terminals.find(t=>t.id===id);if(!node||!terminal)return undefined;
  visiting.add(id);
  const previousId=text(node.previousTerminalId,40);
  const previous=previousId?visit(previousId):undefined;
  const ownerKey=text(node.fromPlayer,30)||previous?.fromPlayer;
  const owner=byPlayer.get(ownerKey??'');
  const rawFrom=point(node.from),observedFrom=rawFrom?scene.map(rawFrom):undefined;
  const connected=!previousId&&owner&&observedFrom?actions.filter(a=>a.fromPlayer===owner.key&&['cut','screen','dribble'].includes(a.action)&&distance(a.to,observedFrom)<.035):[];
  const previousOwn=previous && previous.fromPlayer===owner?.key && ['cut','screen','dribble'].includes(previous.action)?previous:connected.length===1?connected[0]:undefined;
  let confidence=Math.min(score(node.confidence),terminal.confidence<.5?.4:1);
  if(previousId&&!previousOwn){confidence=Math.min(confidence,.4);warnings.push(`Action ${id} : enchaînement à vérifier.`)}
  const unexplained=!!owner&&!!observedFrom&&!previousOwn&&distance(owner,observedFrom)>.06;
  if(unexplained){confidence=Math.min(confidence,.4);warnings.push(`Action ${id} : départ éloigné du joueur, enchaînement à vérifier.`)}
  const from=previousOwn?.to??(unexplained?observedFrom:owner?{x:owner.x,y:owner.y}:observedFrom);
  const endpoint=point(node.to),to=endpoint?scene.map(endpoint):{x:terminal.x,y:terminal.y};
  const allowed=['cut','dribble','pass','shoot','screen','giveball'];
  let kind=allowed.includes(String(node.action))?String(node.action) as AiDiagramAction['action']:'cut';
  if(terminal.kind==='bar')kind='screen';
  else {
   const style=terminal.strokeStyle;
   const classified=(terminal.styleConfidence??0)>=.8
    ? style==='dashed'?'pass':style==='wave'?'dribble':style==='solid'&&kind!=='shoot'?'cut':undefined
    :undefined;
   if(classified&&kind!==classified){
    kind=classified;confidence=Math.min(confidence,.45);
    warnings.push(`Action ${id} : type choisi d’après le style du trait, à vérifier.`);
   }else if(kind==='screen'){kind='cut';confidence=Math.min(confidence,.4)}
  }
  if(!owner||!from||distance(to,terminal)>.035)confidence=Math.min(confidence,.4);
  if(!from||distance(from,to)<.004){visiting.delete(id);return undefined}
  const mids=list(node.points).map(point).filter((p):p is AiPoint=>!!p).map(scene.map);
  // A midpoint describes a smooth route. Preserve a genuine returning run when more points are needed.
  const points=mids.length>2?[from,...mids.slice(1,-1).slice(0,6),to]:[from,to];
  const receiver=text(node.toPlayer,30);
  if(kind==='pass'&&(!byPlayer.has(receiver)||receiver===owner?.key)){confidence=Math.min(confidence,.4);warnings.push(`Passe ${id} : destinataire à confirmer.`)}
  let action:AiDiagramAction={terminalId:id,action:kind,fromPlayer:owner?.key,toPlayer:kind==='pass'&&receiver!==owner?.key&&byPlayer.has(receiver)?receiver:undefined,
   from,to,points,confidence,order:actions.length+1,source:`Assistant schémas MyBasket · ${id}`};
  if(kind==='dribble')action={...changeImportedActionKind({...action,action:'cut'},'dribble'),confidence,source:action.source};
  actions.push(action);built.set(id,action);visiting.delete(id);return action;
 };
 for(const id of byTerminal.keys())visit(id);
 return{detected:true,courtType:scene.courtType,players:scene.players,objects:[],actions,notes:'',
  scanAudit:{version:'mybasket-diagram-v1',sourceCorners:scene.sourceCorners,terminals,passes,warnings:[...new Set(warnings)].slice(0,20)}};
}
export function coverage(diagram:AiExerciseDiagram){return{total:diagram.scanAudit?.terminals.length??0,missing:unresolvedScanTerminals(diagram)}}

/** Adjacent phase is supporting evidence only; never silently moves/adds a player in the new image. */
export function previousPhaseHints(value:unknown):unknown[]{
 const row=record(value),positions=new Map<string,{key:string;label:string;team:string;x:number;y:number}>();
 for(const value of list(row.players).slice(0,20)){
  const p=record(value),at=point(p),key=text(p.key,30),label=text(p.label,4);
  if(at&&key&&label&&label!=='?')positions.set(key,{...at,key,label,team:p.team==='def'?'def':'att'});
 }
 for(const value of list(row.actions).slice(0,60)){
  const action=record(value),at=point(action.to),player=positions.get(text(action.fromPlayer,30));
  if(player&&at&&score(action.confidence)>=.65&&['cut','screen','dribble'].includes(String(action.action)))Object.assign(player,at);
 }
 return [...positions.values()];
}
