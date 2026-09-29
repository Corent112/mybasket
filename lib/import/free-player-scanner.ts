import type { AiDiagramObject, AiDiagramPlayer, AiExerciseDiagram, AiExerciseImport } from "./types";
import { scanExerciseLocally } from "./local-exercise-scanner";

const clamp=(v:number,a=0,b=1)=>Math.max(a,Math.min(b,v));
const dist=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,(a.y-b.y)*1.6);
const numberOf=(s:string)=>{const m=String(s||"").match(/\d{1,2}/); return m?m[0]:"";};

function conesOf(objects:AiDiagramObject[]){
 const out:AiDiagramObject[]=[];
 for(const raw of objects.filter(o=>o.kind==="cone"||o.kind==="triangle").sort((a,b)=>(b.confidence??0)-(a.confidence??0))){
  const o={...raw,kind:"cone" as const,x:clamp(raw.x),y:clamp(raw.y),source:"vision2-paper-cone"};
  if((o.confidence??.65)<.48) continue;
  if(!out.some(q=>dist(q,o)<.04)) out.push(o);
 }
 return out.slice(0,12);
}
function playersOf(players:AiDiagramPlayer[],cones:AiDiagramObject[]){
 const out:AiDiagramPlayer[]=[];
 for(const [i,raw] of players.entries()){
  if((raw.confidence??.55)<.40) continue;
  if(cones.some(c=>dist(c,raw)<.05)) continue;
  const defender=raw.type==="defender"||raw.team==="def"||/def|bras|parenth|arc/i.test(String(raw.source??""));
  const p:AiDiagramPlayer={...raw,key:`v2-paper-${defender?"def":"att"}-${i}`,label:numberOf(raw.label),
   team:defender?"def":"att",type:defender?"defender":"attacker",
   x:clamp(raw.x),y:clamp(raw.y),source:defender?"vision2-paper-defender":"vision2-paper-attacker"};
  const dup=out.find(q=>dist(q,p)<.028);
  if(!dup) out.push(p);
  else if((p.type==="defender"&&dup.type!=="defender") || (!dup.label&&p.label)) out[out.indexOf(dup)]=p;
 }
 return out.slice(0,10);
}
function clean(d:AiExerciseDiagram):AiExerciseDiagram{
 const objects=conesOf(d.objects||[]);
 const players=playersOf(d.players||[],objects);
 return {...d,detected:!!(players.length||objects.length),players,objects,actions:[],
  notes:"Vision 2 papier · numéro/rond = attaquant · bras = défenseur · triangle = plot"};
}
export async function scanPlayersFree(file:File,onStatus?:(m:string)=>void):Promise<AiExerciseImport>{
 onStatus?.("Vision 2 papier · analyse du terrain et des symboles…");
 const scanned=await scanExerciseLocally(file,onStatus);
 const diagrams=(scanned.diagrams?.length?scanned.diagrams:[scanned.diagram]).map(clean);
 const diagram=diagrams[0]??clean(scanned.diagram);
 const players=diagrams.flatMap(d=>d.players), cones=diagrams.flatMap(d=>d.objects);
 const attackers=players.filter(p=>p.team==="att").length, defenders=players.filter(p=>p.team==="def").length;
 return {...scanned,title:"",organisation:"",deroulement:[],consignes:[],variantes:[],
  plots:cones.length||null,ballons:null,paniers:null,joueurs:players.length||null,categorie:"— Choisir —",temps:null,themes:[],
  diagram,diagrams,source:"local",
  warnings:[`Vision 2 papier : ${players.length} joueurs (${attackers} attaquants, ${defenders} défenseurs), ${cones.length} plots.`,
   `Numéros réellement lus : ${players.filter(p=>p.label).length}/${players.length}. Aucun numéro inventé.`,
   "Règle : numéro/rond = attaquant · parenthèses/bras = défenseur · triangle = plot."]};
}
