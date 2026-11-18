import type { AiExerciseImport, AiExerciseDiagram } from './types';
const distance=(a:{x:number;y:number},b:{x:number;y:number})=>Math.hypot(a.x-b.x,(a.y-b.y)*1.4);
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
 return{...local,diagram,diagrams:[diagram],source:'ai',warnings:[...local.warnings,...ai.warnings,`L’IA a proposé ${added} action(s) supplémentaire(s). Vérifie leur départ, leur arrivée et leur ordre avant de valider.`]};
}
export async function scanWithAI(file:File,rectifiedImage?:string):Promise<AiExerciseImport>{
 const source=rectifiedImage||URL.createObjectURL(file);
 try{
  const image=new Image();image.src=source;await image.decode();
  const canvas=document.createElement('canvas');const ratio=Math.min(1,1800/image.naturalWidth,1800/image.naturalHeight);canvas.width=Math.max(1,Math.round(image.naturalWidth*ratio));canvas.height=Math.max(1,Math.round(image.naturalHeight*ratio));
  const ctx=canvas.getContext('2d');if(!ctx)throw Error('Image illisible.');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);
  const encoded=canvas.toDataURL('image/jpeg',.82);if(encoded.length>4_000_000)throw Error('Image trop grande pour l’assistance IA.');
  const response=await fetch('/api/ai/import/exercise',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({image:encoded,note:'Contrôle complet des joueurs et de TOUS les traits. Une barre termine un écran ; une flèche termine un déplacement distinct, y compris après un écran du même joueur. Zigzag = dribble. Conserver les joueurs hors des limites. Ne jamais confondre les marquages du terrain avec une action.'})});
  const body=await response.json();if(!response.ok||!body.exercise)throw Error(body.error||'Analyse IA indisponible.');return body.exercise;
 }finally{if(!rectifiedImage)URL.revokeObjectURL(source)}
}
