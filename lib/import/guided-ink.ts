import type { AiExerciseDiagram, AiPoint } from './types';
import { courtToCanonical } from './court-geometry';
import { applyHomography, invert, solveHomography } from './homography';
import { sampleImportedArc } from './curve-handle';

type Pixels={width:number;height:number;data:Uint8ClampedArray};
const gap=(a:AiPoint,b:AiPoint)=>Math.hypot(a.x-b.x,a.y-b.y);
function simplify(points:AiPoint[],epsilon:number):AiPoint[]{
 if(points.length<3)return points;
 const a=points[0],b=points.at(-1)!,dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
 let index=0,max=0;
 for(let i=1;i<points.length-1;i++){
  const p=points[i],t=length?Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/length)):0;
  const distance=Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy);
  if(distance>max){max=distance;index=i}
 }
 return max<=epsilon?[a,b]:[...simplify(points.slice(0,index+1),epsilon).slice(0,-1),...simplify(points.slice(index),epsilon)];
}
/** Follow a narrow, model-supplied corridor through actual ink. Never search the whole court for an imagined route. */
function inkSampler(pixels:Pixels){
 const {width,height,data}=pixels;
 const grey=new Float32Array(width*height),integral=new Float64Array((width+1)*(height+1));
 for(let y=0;y<height;y++){
  let sum=0;
  for(let x=0;x<width;x++){
   const i=y*width+x;grey[i]=Math.max(data[i*4],data[i*4+1],data[i*4+2]);sum+=grey[i];
   integral[(y+1)*(width+1)+x+1]=integral[y*(width+1)+x+1]+sum;
  }
 }
 const ink=(x:number,y:number)=>{
  const px=Math.round(x),py=Math.round(y);if(px<0||px>=width||py<0||py>=height)return 0;
  const r=Math.max(5,Math.round(width*.012)),x0=Math.max(0,px-r),x1=Math.min(width,px+r+1),y0=Math.max(0,py-r),y1=Math.min(height,py+r+1),stride=width+1;
  const mean=(integral[y1*stride+x1]-integral[y0*stride+x1]-integral[y1*stride+x0]+integral[y0*stride+x0])/((x1-x0)*(y1-y0));
  return Math.max(0,Math.min(1,(mean-grey[py*width+px]-8)/45));
 };
 return ink;
}
export function traceGuidedInk(pixels:Pixels,guide:AiPoint[],prepared?:(x:number,y:number)=>number):{points:AiPoint[];support:number}|null{
 const {width,height,data}=pixels;if(width<2||height<2||guide.length<2||data.length!==width*height*4)return null;
 const ink=prepared??inkSampler(pixels);
 const route=guide.map(p=>({x:p.x*width,y:p.y*height})),samples:AiPoint[]=[];
 for(let i=1;i<route.length;i++){
  const a=route[i-1],b=route[i],steps=Math.max(1,Math.ceil(gap(a,b)/4));
  for(let j=0;j<steps;j++)samples.push({x:a.x+(b.x-a.x)*j/steps,y:a.y+(b.y-a.y)*j/steps});
 }
 samples.push(route.at(-1)!);if(samples.length<8||samples.length>1800)return null;
 const radius=Math.max(3,Math.min(24,Math.round(width*.025))),states=radius*2+1,n=samples.length;
 const previous=new Int16Array(n*states),scores=new Float64Array(states);scores.fill(Infinity);scores[radius]=0;
 const normals=samples.map((p,i)=>{const a=samples[Math.max(0,i-1)],b=samples[Math.min(n-1,i+1)],length=gap(a,b)||1;return{x:-(b.y-a.y)/length,y:(b.x-a.x)/length}});
 const observations=samples.map((p,i)=>Array.from({length:states},(_,j)=>ink(p.x+normals[i].x*(j-radius),p.y+normals[i].y*(j-radius))));
 for(let i=1;i<n;i++){
  const next=new Float64Array(states);next.fill(Infinity);
  for(let j=0;j<states;j++){
   // Keep the centre of the player and the exact arrow/bar endpoint fixed.
   if(i===n-1&&j!==radius)continue;
   const offset=j-radius,cost=4*(1-observations[i][j])+1.4*(offset/radius)**2;
   for(let k=Math.max(0,j-5);k<=Math.min(states-1,j+5);k++){
    const candidate=scores[k]+cost+.075*(j-k)**2;
    if(candidate<next[j]){next[j]=candidate;previous[i*states+j]=k}
   }
  }
  scores.set(next);
 }
 const chosen=new Int16Array(n);chosen[n-1]=radius;
 for(let i=n-1;i>0;i--)chosen[i-1]=previous[i*states+chosen[i]];
 let supported=0,total=0;
 for(let i=Math.ceil(n*.12);i<n*.88;i++){total++;if(observations[i][chosen[i]]>.35)supported++}
 const support=supported/Math.max(1,total);
 if(support<.58)return null;
 const points=samples.map((p,i)=>({x:(p.x+normals[i].x*(chosen[i]-radius))/width,y:(p.y+normals[i].y*(chosen[i]-radius))/height}));
 points[0]=guide[0];points[n-1]=guide.at(-1)!;
 return{points:simplify(points,1.5/Math.max(width,height)),support};
}

/** Preserve sampled route points through review, animation and export. Semantic labels still come from the assistant. */
export function refineDiagramInk(diagram:AiExerciseDiagram,pixels:Pixels):AiExerciseDiagram{
 const corners=diagram.scanAudit?.sourceCorners;
 const matrix=corners?solveHomography(corners,[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]):null;
 const inverse=matrix?invert(matrix):null;
 const top=courtToCanonical({x:0,y:0},diagram.courtType),bottom=courtToCanonical({x:1,y:1},diagram.courtType);
 const toPhoto=(p:AiPoint)=>inverse?applyHomography(inverse,{x:(p.x-top.x)/(bottom.x-top.x),y:(p.y-top.y)/(bottom.y-top.y)}):{x:p.x,y:p.y*(diagram.courtType==='half'?2:1)};
 const fromPhoto=(p:AiPoint)=>matrix?courtToCanonical(applyHomography(matrix,p),diagram.courtType):{x:p.x,y:p.y*(diagram.courtType==='half'?.5:1)};
 const sampler=inkSampler(pixels);
 const actions=diagram.actions.map(action=>{
  if(!action.from||!['cut','screen','dribble'].includes(action.action))return action;
  const guide=action.points&&action.points.length>3?action.points:sampleImportedArc(action.from,action.to,action.points?.length===3?action.points[1]:undefined);
  const fitted=traceGuidedInk(pixels,guide.map(toPhoto),sampler);
  if(!fitted)return{...action,confidence:Math.min(action.confidence??1,.45),source:`${action.source??''} · forme du trait à vérifier`};
  const points=fitted.points.map(fromPhoto);points[0]=action.from;points[points.length-1]=action.to;
  return{...action,points,geometry:'traced' as const,source:`${action.source??''} · géométrie suivie sur la photo`};
 });
 return{...diagram,actions};
}
