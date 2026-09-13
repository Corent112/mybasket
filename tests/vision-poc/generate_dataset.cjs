#!/usr/bin/env node
const fs=require("fs"), path=require("path");
const {createCanvas}=require("@napi-rs/canvas");

const OUT=process.argv[2]||"tests/vision-poc/generated";
const COUNT=Number(process.argv[3]||300);
const SEED=Number(process.argv[4]||20260913);
const W=900,H=720;
const CATS=[
 {id:1,name:"attacker"},
 {id:2,name:"ball_carrier"},
 {id:3,name:"defender"},
 {id:4,name:"ball"},
 {id:5,name:"cone"},
];
let state=SEED>>>0;
function rnd(){state=(1664525*state+1013904223)>>>0;return state/4294967296;}
function ri(a,b){return Math.floor(a+rnd()*(b-a+1))}
function pick(a){return a[Math.floor(rnd()*a.length)]}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
function mkdir(p){fs.mkdirSync(p,{recursive:true})}
mkdir(path.join(OUT,"images"));

function tfPoint(m,x,y){return {x:m.a*x+m.c*y+m.e,y:m.b*x+m.d*y+m.f}}
function bboxFromLocal(m,x1,y1,x2,y2){
 const pts=[tfPoint(m,x1,y1),tfPoint(m,x2,y1),tfPoint(m,x2,y2),tfPoint(m,x1,y2)];
 const xs=pts.map(p=>p.x),ys=pts.map(p=>p.y);
 const X1=clamp(Math.min(...xs),0,W),Y1=clamp(Math.min(...ys),0,H);
 const X2=clamp(Math.max(...xs),0,W),Y2=clamp(Math.max(...ys),0,H);
 return [X1,Y1,Math.max(1,X2-X1),Math.max(1,Y2-Y1)];
}
function mat(angle,scale,tx,ty){
 const c=Math.cos(angle)*scale,s=Math.sin(angle)*scale;
 return {a:c,b:s,c:-s,d:c,e:tx,f:ty};
}
function setTf(ctx,m){ctx.setTransform(m.a,m.b,m.c,m.d,m.e,m.f)}

function drawCourt(ctx,style){
 const x=90,y=60,w=720,h=600;
 ctx.lineWidth=style==="paper"?2:4;
 ctx.strokeStyle=style==="paper"?"#111":"#f7f7f7";
 ctx.strokeRect(x,y,w,h);
 ctx.beginPath();ctx.rect(x+w*.34,y,w*.32,h*.34);ctx.stroke();
 ctx.beginPath();ctx.arc(x+w*.5,y+h*.34,w*.12,0,Math.PI*2);ctx.stroke();
 ctx.beginPath();ctx.arc(x+w*.5,y+34,12,0,Math.PI*2);ctx.stroke();
 ctx.beginPath();ctx.arc(x+w*.5,y+h*.67,w*.36,Math.PI,Math.PI*2);ctx.stroke();
 ctx.beginPath();ctx.arc(x+w*.5,y+h,80,Math.PI,Math.PI*2);ctx.stroke();
}
function drawTrajectory(ctx,a,b,kind,ink){
 ctx.strokeStyle=ink;ctx.fillStyle=ink;ctx.lineWidth=ri(2,5);ctx.lineCap="round";
 if(kind==="dribble"){
  const dx=b.x-a.x,dy=b.y-a.y,L=Math.hypot(dx,dy),nx=-dy/L,ny=dx/L,waves=ri(5,12);
  ctx.beginPath();
  for(let i=0;i<=60;i++){
   const t=i/60, amp=(5+rnd()*6)*(1+.25*Math.sin(t*11));
   const off=Math.sin(t*Math.PI*2*waves)*amp;
   const x=a.x+dx*t+nx*off,y=a.y+dy*t+ny*off;
   i?ctx.lineTo(x,y):ctx.moveTo(x,y);
  }ctx.stroke();
 }else{
  ctx.beginPath();ctx.moveTo(a.x,a.y);
  const mx=(a.x+b.x)/2+(rnd()-.5)*40,my=(a.y+b.y)/2+(rnd()-.5)*40;
  ctx.quadraticCurveTo(mx,my,b.x,b.y);ctx.stroke();
 }
 const ang=Math.atan2(b.y-a.y,b.x-a.x),head=16;
 ctx.beginPath();ctx.moveTo(b.x,b.y);
 ctx.lineTo(b.x-head*Math.cos(ang-.45),b.y-head*Math.sin(ang-.45));
 ctx.lineTo(b.x-head*Math.cos(ang+.45),b.y-head*Math.sin(ang+.45));
 ctx.closePath();rnd()<.75?ctx.fill():ctx.stroke();
}
function drawAttacker(ctx,x,y,label,carrier,ink){
 ctx.fillStyle=ink;ctx.strokeStyle=ink;ctx.lineWidth=3;
 ctx.font="bold 30px Arial";ctx.textAlign="center";ctx.textBaseline="middle";
 if(carrier){ctx.beginPath();ctx.arc(x,y,24,0,Math.PI*2);ctx.stroke();}
 ctx.fillText(String(label),x,y+1);
}
function drawDefender(ctx,x,y,label,mode){
 ctx.font="bold 29px Arial";ctx.textAlign="center";ctx.textBaseline="middle";
 if(mode==="red"){
  ctx.fillStyle="#e32636";ctx.fillText(String(label),x,y);
 }else if(mode==="cross"){
  ctx.strokeStyle="#111";ctx.lineWidth=4;
  ctx.beginPath();ctx.moveTo(x-17,y-17);ctx.lineTo(x+17,y+17);ctx.moveTo(x+17,y-17);ctx.lineTo(x-17,y+17);ctx.stroke();
  ctx.fillStyle="#111";ctx.font="bold 18px Arial";ctx.fillText(String(label),x,y);
 }else{
  ctx.strokeStyle="#111";ctx.lineWidth=4;ctx.fillStyle="#111";
  ctx.beginPath();ctx.arc(x-18,y,18,Math.PI/2,Math.PI*1.5);ctx.stroke();
  ctx.beginPath();ctx.arc(x+18,y,18,-Math.PI/2,Math.PI/2);ctx.stroke();
  ctx.fillText(String(label),x,y);
 }
}
function drawCone(ctx,x,y,ink){
 ctx.strokeStyle=ink;ctx.lineWidth=3;
 ctx.beginPath();ctx.moveTo(x,y-18);ctx.lineTo(x+13,y+17);ctx.lineTo(x-13,y+17);ctx.closePath();ctx.stroke();
 ctx.beginPath();ctx.moveTo(x-15,y+17);ctx.lineTo(x+15,y+17);ctx.stroke();
}
function drawBall(ctx,x,y,ink){
 ctx.strokeStyle=ink;ctx.lineWidth=2;ctx.beginPath();ctx.arc(x,y,11,0,Math.PI*2);ctx.stroke();
 ctx.beginPath();ctx.moveTo(x-11,y);ctx.lineTo(x+11,y);ctx.moveTo(x,y-11);ctx.lineTo(x,y+11);ctx.stroke();
}

const coco={info:{description:"MyBasket semantic synthetic POC",version:"2"},images:[],annotations:[],categories:CATS};
let annId=1;
for(let n=1;n<=COUNT;n++){
 const canvas=createCanvas(W,H),ctx=canvas.getContext("2d");
 const style=rnd()<.45?"paper":"screen";
 if(style==="paper"){ctx.fillStyle=pick(["#fff","#fbfaf6","#f3f3f3"]);ctx.fillRect(0,0,W,H);}
 else{
  ctx.fillStyle=pick(["#6b1a2c","#d6b27b","#e0c69d"]);ctx.fillRect(0,0,W,H);
  ctx.globalAlpha=.16;ctx.strokeStyle="#7d6b55";
  for(let i=0;i<180;i++){ctx.beginPath();ctx.moveTo(rnd()*W,rnd()*H);ctx.lineTo(rnd()*W,rnd()*H);ctx.stroke()}
  ctx.globalAlpha=1;
 }
 const angle=(rnd()-.5)*.10,scale=.90+rnd()*.12,tx=(rnd()-.5)*20,ty=(rnd()-.5)*15;
 const m=mat(angle,scale,W/2+tx,H/2+ty);
 m.e-=m.a*W/2+m.c*H/2; m.f-=m.b*W/2+m.d*H/2;
 ctx.save();setTf(ctx,m);drawCourt(ctx,style);
 const ink="#111";
 const objects=[];
 const total=ri(5,14);
 for(let i=0;i<total;i++){
  const r=rnd(); let cls;
  if(r<.32)cls="attacker"; else if(r<.49)cls="ball_carrier"; else if(r<.69)cls="defender"; else if(r<.94)cls="cone"; else cls="ball";
  objects.push({cls,x:ri(125,775),y:ri(95,625),label:ri(1,5),mode:pick(["red","bracket","cross"])});
 }
 for(let i=0;i<ri(2,7);i++){
  const target=objects[ri(0,objects.length-1)], a={x:ri(110,790),y:ri(90,640)};
  const b=rnd()<.7?{x:target.x+(rnd()-.5)*8,y:target.y+(rnd()-.5)*8}:{x:ri(110,790),y:ri(90,640)};
  drawTrajectory(ctx,a,b,rnd()<.55?"dribble":"run",ink);
 }
 for(const o of objects){
  let local;
  if(o.cls==="attacker"){drawAttacker(ctx,o.x,o.y,o.label,false,ink);local=[o.x-18,o.y-20,o.x+18,o.y+20];}
  else if(o.cls==="ball_carrier"){drawAttacker(ctx,o.x,o.y,o.label,true,ink);local=[o.x-27,o.y-27,o.x+27,o.y+27];}
  else if(o.cls==="defender"){drawDefender(ctx,o.x,o.y,o.label,o.mode);local=o.mode==="red"?[o.x-18,o.y-20,o.x+18,o.y+20]:[o.x-42,o.y-27,o.x+42,o.y+27];}
  else if(o.cls==="cone"){drawCone(ctx,o.x,o.y,ink);local=[o.x-17,o.y-21,o.x+17,o.y+21];}
  else {drawBall(ctx,o.x,o.y,ink);local=[o.x-13,o.y-13,o.x+13,o.y+13];}
  o.bbox=bboxFromLocal(m,...local);
 }
 ctx.restore();
 if(rnd()<.55){
  const id=ctx.getImageData(0,0,W,H),d=id.data;
  for(let y=0;y<H;y++)for(let x=0;x<W;x++){
   const k=(y*W+x)*4,moire=4*Math.sin(x*.21+y*.035),noise=(rnd()-.5)*7;
   d[k]=clamp(d[k]+moire+noise,0,255);d[k+1]=clamp(d[k+1]+moire+noise,0,255);d[k+2]=clamp(d[k+2]+moire+noise,0,255);
  }
  ctx.putImageData(id,0,0);
 }
 const file=`semantic-${String(n).padStart(4,"0")}.jpg`;
 fs.writeFileSync(path.join(OUT,"images",file),canvas.toBuffer("image/jpeg"));
 coco.images.push({id:n,file_name:file,width:W,height:H,source:"synthetic-semantic"});
 for(const o of objects){
  const cat=CATS.find(c=>c.name===o.cls);
  coco.annotations.push({id:annId++,image_id:n,category_id:cat.id,bbox:o.bbox,area:o.bbox[2]*o.bbox[3],iscrowd:0});
 }
}
fs.writeFileSync(path.join(OUT,"annotations-coco.json"),JSON.stringify(coco,null,2));
const counts=Object.fromEntries(CATS.map(c=>[c.name,coco.annotations.filter(a=>a.category_id===c.id).length]));
console.log(JSON.stringify({images:COUNT,annotations:coco.annotations.length,classes:counts,out:OUT},null,2));
