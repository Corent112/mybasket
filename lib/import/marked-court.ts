import { applyHomography, invert, solveHomography } from "./homography";
import type { AiPoint } from "./types";

type Dot = AiPoint & { radius: number };
const gap = (a: AiPoint, b: AiPoint) => Math.hypot(a.x-b.x,a.y-b.y);
const KEY_L = 5.05/15, KEY_R = 9.95/15, KEY_END = 5.8/14;
const key = [{x:KEY_L,y:0},{x:KEY_R,y:0},{x:KEY_R,y:KEY_END},{x:KEY_L,y:KEY_END}];
const edge = [{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}];
const three = [{x:.9/15,y:0},{x:14.1/15,y:0}];

/** Read solid calibration dots on a colored half-court, separately from player ink. */
export function registerMarkedCourt(photo: HTMLCanvasElement) {
  const probe = document.createElement("canvas");
  const ratio = Math.min(1, 420/Math.max(photo.width, photo.height));
  const w=probe.width=Math.round(photo.width*ratio), h=probe.height=Math.round(photo.height*ratio);
  if (w<100 || h<100) return null;
  const ctx=probe.getContext("2d", {willReadFrequently:true});
  if (!ctx) return null;
  ctx.drawImage(photo,0,0,w,h);
  const {data}=ctx.getImageData(0,0,w,h);
  const rows=new Uint32Array(h), cols=new Uint32Array(w);
  let red=0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=(y*w+x)*4, r=data[i];
    if(r>=85 && r-data[i+1]>=45 && r-data[i+2]>=45){cols[x]++;rows[y]++;red++;}
  }
  if(red<w*h*.022) return null;
  const quantile=(axis:Uint32Array,t:number)=>{
    let sum=0;
    for(let i=0;i<axis.length;i++){sum+=axis[i];if(sum>=red*t)return i;}
    return axis.length-1;
  };
  const l=quantile(cols,.015)/w,r=quantile(cols,.985)/w,t=quantile(rows,.018)/h,b=quantile(rows,.982)/h;
  const area=(r-l)*(b-t)*w*h;
  if (red/area<.53 || red/area>1.18 || r-l<.1 || b-t<.11) return null;

  const mask=new Uint8Array(w*h), radius=Math.max(2,Math.round((r-l)*w*.034));
  const dark=(x:number,y:number)=>{
    if(x<0||x>=w||y<0||y>=h)return false;
    const i=(y*w+x)*4, hi=Math.max(data[i],data[i+1],data[i+2]);
    return hi<56 && hi-Math.min(data[i],data[i+1],data[i+2])<20;
  };
  for(let y=radius;y<h-radius;y++)for(let x=radius;x<w-radius;x++){
    if(dark(x,y) && dark(x-radius,y) && dark(x+radius,y) &&
      dark(x,y-radius) && dark(x,y+radius)) mask[y*w+x]=1;
  }
  const dots:Dot[]=[];
  for(let i=0;i<mask.length;i++){
    if(!mask[i]) continue;
    mask[i]=0;
    const list=[i];
    let sx=0,sy=0,x0=w,y0=h,x1=0,y1=0;
    for(let j=0;j<list.length;j++){
      const p=list[j],x=p%w,y=Math.floor(p/w);
      sx+=x;sy+=y;x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
      for(const next of [p-1,p+1,p-w,p+w]) if(mask[next]){mask[next]=0;list.push(next);}
    }
    const bw=x1-x0+1,bh=y1-y0+1;
    if(list.length<radius*radius*2 || bw>radius*10 || bh>radius*10 || Math.min(bw,bh)<Math.max(bw,bh)*.46) continue;
    dots.push({x:sx/list.length/w,y:sy/list.length/h,radius:(Math.max(bw,bh)/2+radius)/w});
  }
  const used=new Set<Dot>();
  const pick=(target:AiPoint,max:number)=>{
    const nearest=dots.filter(dot=>!used.has(dot)).sort((a,b)=>gap(a,target)-gap(b,target))[0];
    if(nearest && gap(nearest,target)<max){used.add(nearest);return nearest;}
  };
  const observedKey=[{x:l,y:t},{x:r,y:t},{x:r,y:b},{x:l,y:b}].map(p=>pick(p,.05));
  if(observedKey.some(p=>!p)) return null;
  const keyDots=observedKey as Dot[];
  if(Math.min(...keyDots.map(d=>d.radius)) / Math.max(...keyDots.map(d=>d.radius)) < .55) return null;
  const forward=solveHomography(key,keyDots);
  const inverse=forward && invert(forward);
  if(!forward || !inverse) return null;

  const inBaseline = (dot:Dot) => Math.abs(dot.y-(keyDots[0].y+keyDots[1].y)/2) < .075;
  const take = (dot: Dot | undefined) => {if (dot) used.add(dot);return dot;};
  const topSide = (side: number) => {
    const boundary = keyDots[side].x;
    return take(dots.filter(dot => !used.has(dot) && inBaseline(dot) && (dot.x-boundary)*(side ? 1 : -1) > (r-l)*.48)
      .sort((a,b)=>(side ? b.x-a.x : a.x-b.x))[0]);
  };
  const left=topSide(0),right=topSide(1);
  const lower=(upper:Dot|undefined, side:number)=>{
    const target = upper?.x ?? applyHomography(forward,edge[side]).x;
    return take(dots.filter(dot=>!used.has(dot) && dot.y>b+(b-t)*.7 && Math.abs(dot.x-target)<(r-l)*.58)
      .sort((a,b)=>b.y-a.y)[0]);
  };
  const edgeDots=[left,right,lower(right,2),lower(left,3)];
  const threeDots=[left,right].map((outer,side)=>{
    if(!outer)return undefined;
    const inner=keyDots[side].x, sign=side?-1:1;
    return take(dots.filter(dot=>!used.has(dot)&&inBaseline(dot) && (dot.x-outer.x)*sign>.024 &&
      (inner-dot.x)*sign>.05 && Math.abs(dot.x-outer.x)<.42*Math.abs(inner-outer.x))
      .sort((a,b)=>Math.abs(a.x-outer.x)-Math.abs(b.x-outer.x))[0]);
  });
  if(edgeDots.filter(Boolean).length+threeDots.filter(Boolean).length<2) return null;
  // The four key intersections remain exact. If available, the perimeter
  // points also fix the outer scale rather than extrapolating through the paint.
  const observedOuter=edgeDots.map(p=>p?applyHomography(inverse,p):null);
  const observedThree=threeDots.map(p=>p?applyHomography(inverse,p):null);
  if (observedOuter.some((p,i) => p && (Math.abs(p.x-edge[i].x)>.32 ||
    (i<2 ? Math.abs(p.y)>.17 : p.y<.7 || p.y>1.38)))) return null;
  const lerp=(a:number,b:number,t:number)=>a+(b-a)*t;
  const axis=(x:number, pairs:[number,number][])=>{
    let i=1;
    while(i<pairs.length-1 && x>pairs[i][0])i++;
    const [a,b]=[pairs[i-1],pairs[i]];
    return lerp(a[1],b[1],(x-a[0])/(b[0]-a[0]));
  };
  const knots=(y:number):[number,number][]=>{
    const s=Math.max(0,Math.min(1,y));
    const left=lerp(observedOuter[0]?.x??0,observedOuter[3]?.x??0,s);
    const right=lerp(observedOuter[1]?.x??1,observedOuter[2]?.x??1,s);
    const list:[number,number][]=[[0,left],[KEY_L,KEY_L],[KEY_R,KEY_R],[1,right]];
    if(observedThree[0] && observedThree[0].x>left+.014 && observedThree[0].x<KEY_L-.014)
      list.splice(1,0,[three[0].x,lerp(observedThree[0].x,three[0].x,s)]);
    if(observedThree[1] && observedThree[1].x<right-.014 && observedThree[1].x>KEY_R+.014)
      list.splice(list.length-1,0,[three[1].x,lerp(observedThree[1].x,three[1].x,s)]);
    return list;
  };
  const top=(x:number)=>{
    const pairs:[number,number][]=[[0,observedOuter[0]?.y??0],[KEY_L,0],[KEY_R,0],[1,observedOuter[1]?.y??0]];
    if(observedThree[0])pairs.splice(1,0,[three[0].x,observedThree[0].y]);
    if(observedThree[1])pairs.splice(pairs.length-1,0,[three[1].x,observedThree[1].y]);
    return axis(x,pairs);
  };
  const bottom=(x:number)=>lerp(observedOuter[3]?.y??1,observedOuter[2]?.y??1,Math.max(0,Math.min(1,x)));
  const toPhoto=({x,y}:AiPoint)=>{
    const u=axis(x,knots(y));
    return applyHomography(forward,{x:u,y:y<=KEY_END?lerp(top(x),KEY_END,y/KEY_END):lerp(KEY_END,bottom(x),(y-KEY_END)/(1-KEY_END))});
  };
  const toCourt=(point:AiPoint)=>{
    const p=applyHomography(inverse,point);
    let x=p.x,y=p.y;
    for(let i=0;i<3;i++){
      x=axis(p.x,knots(y).map(([a,b])=>[b,a]));
      y=p.y<=KEY_END?(p.y-top(x))*KEY_END/(KEY_END-top(x)):lerp(KEY_END,1,(p.y-KEY_END)/(bottom(x)-KEY_END));
    }
    return {x,y};
  };

  const clean=document.createElement("canvas");
  clean.width=photo.width;clean.height=photo.height;
  const cleanCtx=clean.getContext("2d",{willReadFrequently:true});
  const rawCtx=photo.getContext("2d");
  if(!cleanCtx||!rawCtx)return null;
  cleanCtx.drawImage(photo,0,0);
  const markers=[...used];
  cleanCtx.fillStyle="#eeeeeb";
  for(const dot of markers){
    cleanCtx.beginPath();cleanCtx.arc(dot.x*photo.width,dot.y*photo.height,dot.radius*photo.width*1.52,0,2*Math.PI);cleanCtx.fill();
  }
  const width=900,height=840;
  const warp=(source:ImageData)=>{
    const canvas=document.createElement("canvas");
    canvas.width=width;canvas.height=height;
    const context=canvas.getContext("2d");
    if(!context)return null;
    const image=context.createImageData(width,height);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){
      const p=toPhoto({x:x/(width-1),y:y/(height-1)});
      const at=(y*width+x)*4;
      const index=(Math.round(p.y*(photo.height-1))*photo.width+Math.round(p.x*(photo.width-1)))*4;
      for(let c=0;c<3;c++)image.data[at+c]=p.x>=0&&p.x<=1&&p.y>=0&&p.y<=1?source.data[index+c]:255;
      image.data[at+3]=255;
    }
    context.putImageData(image,0,0);
    return canvas;
  };
  const canvas=warp(rawCtx.getImageData(0,0,photo.width,photo.height));
  const analysisCanvas=warp(cleanCtx.getImageData(0,0,photo.width,photo.height));
  if(!canvas||!analysisCanvas)return null;
  return {canvas,analysisCanvas,source:clean,toCourt,play:{x0:0,y0:0,x1:width,y1:height},
    markers:markers.map(toCourt)};
}
