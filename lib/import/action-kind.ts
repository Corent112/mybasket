import type { AiDiagramAction, AiDiagramActionKind, AiPoint } from './types';
import { hasImportedTurnback, importedCurveHandle, sampleImportedArc } from './curve-handle';
/** Preserve the route, its owner and endpoints when changing its basketball meaning. */
export function changeImportedActionKind(line:AiDiagramAction,action:AiDiagramActionKind):AiDiagramAction{
 if(action===line.action)return line;
 let points=line.points;
 const from=line.from;
 if(from&&action==='dribble'){
  const route=hasImportedTurnback(points)?[from,...(points?.slice(1,-1)||[]),line.to]:sampleImportedArc(from,line.to,importedCurveHandle(points)?.point);
  const lengths=[0];for(let i=1;i<route.length;i++)lengths.push(lengths[i-1]+Math.hypot(route[i].x-route[i-1].x,(route[i].y-route[i-1].y)*1.6));
  const total=lengths.at(-1)||0,waves=Math.max(3,Math.round(total/.035)),steps=waves*12;
  if(total>.005)points=Array.from({length:steps+1},(_,i):AiPoint=>{
   if(i===0)return{...from};if(i===steps)return{...line.to};
   const distance=total*i/steps;let j=1;while(j<lengths.length-1&&lengths[j]<distance)j++;
   const a=route[j-1],b=route[j],t=(distance-lengths[j-1])/(lengths[j]-lengths[j-1]||1);
   const dx=b.x-a.x,dy=(b.y-a.y)*1.6,length=Math.hypot(dx,dy)||1,offset=Math.sin(i/steps*Math.PI*2*waves)*.005;
   return{x:a.x+(b.x-a.x)*t-dy/length*offset,y:a.y+(b.y-a.y)*t+dx/length*offset/1.6};
  });
 }else if(from&&line.action==='dribble'&&action!=='freedraw'){
  const middle=importedCurveHandle(points,true)?.point;
  points=[from,...(middle?[middle]:[]),line.to];
 }
 return{...line,action,points,toPlayer:action==='pass'?line.toPlayer:undefined,continuationChoice:action==='pass'?line.continuationChoice:undefined,confidence:action==='freedraw'||line.fromPlayer?1:line.confidence,source:`type corrigé à la main : ${action}`};
}
