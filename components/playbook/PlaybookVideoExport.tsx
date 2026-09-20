'use client';
import {useMemo,useState} from 'react';
import type {Playbook,PlaybookSystem} from '@/lib/playbook';
import {getSystem} from '@/lib/systems';

type Props={playbook:Playbook;systems:PlaybookSystem[]};
const wait=(ms:number)=>new Promise(r=>setTimeout(r,ms));
async function img(url:string){return new Promise<HTMLImageElement>((res,rej)=>{const i=new Image();i.crossOrigin='anonymous';i.onload=()=>res(i);i.onerror=rej;i.src=url})}
export default function PlaybookVideoExport({playbook,systems}:Props){
 const [open,setOpen]=useState(false),[busy,setBusy]=useState(false),[selected,setSelected]=useState<string[]>(systems.map(x=>x.id));
 const chosen=useMemo(()=>selected.map(id=>systems.find(x=>x.id===id)).filter((x):x is PlaybookSystem=>!!x),[systems,selected]);
 const move=(id:string,d:number)=>setSelected(v=>{const i=v.indexOf(id),j=i+d;if(i<0||j<0||j>=v.length)return v;const n=[...v];[n[i],n[j]]=[n[j],n[i]];return n});
 async function exportVideo(){ if(!chosen.length)return; setBusy(true); try{
   const canvas=document.createElement('canvas');canvas.width=1280;canvas.height=720;const ctx=canvas.getContext('2d')!;const stream=canvas.captureStream(30);
   const mime=['video/mp4;codecs=avc1.42E01E','video/mp4','video/webm;codecs=vp9','video/webm'].find(x=>MediaRecorder.isTypeSupported(x))||'video/webm';
   const rec=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:8_000_000});const chunks:BlobPart[]=[];rec.ondataavailable=e=>e.data.size&&chunks.push(e.data);rec.start();
   const blackTitle=async(title:string)=>{ctx.fillStyle='#000';ctx.fillRect(0,0,1280,720);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='700 62px Arial';ctx.fillText(title.toUpperCase(),640,340,1120);ctx.font='28px Arial';ctx.fillStyle='#bbb';ctx.fillText(playbook.title,640,420,1100);await wait(1500)};
   for(const s of chosen){
     await blackTitle(s.title);
     let sourceSystem:any=null;
     if(s.system_id){
       try{sourceSystem=await getSystem(s.system_id)}
       catch(error){console.warn('PLAYBOOK_VIDEO_SOURCE',s.system_id,error)}
     }
     const sourceVideos=Array.isArray(sourceSystem?.videos)
       ? sourceSystem.videos.filter((value:any)=>typeof value==='string'&&value.trim())
       : [];
     const videoUrl=String(
       sourceSystem?.schemaVideo ||
       sourceSystem?.schema_video ||
       s.schema_video ||
       sourceVideos[0] ||
       ''
     ).trim();
     const sourceImages=Array.isArray(sourceSystem?.schemaImages)
       ? sourceSystem.schemaImages
       : Array.isArray(sourceSystem?.schema_images)
       ? sourceSystem.schema_images
       : [];
     const images=(sourceImages.length?sourceImages:(s.schema_images||[]))
       .filter((value:any)=>typeof value==='string'&&value.trim());
     let videoExported=false;
     if(videoUrl){
       try{
         const v=document.createElement('video');
         v.crossOrigin='anonymous';v.src=videoUrl;v.muted=true;v.playsInline=true;v.preload='auto';
         await new Promise<void>((resolve,reject)=>{v.onloadedmetadata=()=>resolve();v.onerror=()=>reject(new Error('Vidéo impossible à charger'))});
         await v.play();videoExported=true;
         while(!v.ended){
           ctx.fillStyle='#000';ctx.fillRect(0,0,1280,720);
           const scale=Math.min(1280/v.videoWidth,720/v.videoHeight);
           const w=v.videoWidth*scale,h=v.videoHeight*scale;
           ctx.drawImage(v,(1280-w)/2,(720-h)/2,w,h);
           await wait(33);
         }
         v.pause();v.removeAttribute('src');v.load();
       }catch(error){
         console.warn('PLAYBOOK_VIDEO_FALLBACK_TO_SCHEMAS',s.title,error);
         videoExported=false;
       }
     }
     if(!videoExported){
       for(const u of images){
         try{
           const im=await img(u);ctx.fillStyle='#111';ctx.fillRect(0,0,1280,720);
           const scale=Math.min(1180/im.width,650/im.height);
           const w=im.width*scale,h=im.height*scale;
           ctx.drawImage(im,(1280-w)/2,(720-h)/2,w,h);
           await wait(1800);
         }catch{await wait(300)}
       }
     }
     ctx.fillStyle='#000';ctx.fillRect(0,0,1280,720);await wait(350);
   }
   rec.stop();await new Promise<void>(r=>rec.onstop=()=>r());const blob=new Blob(chunks,{type:mime});const u=URL.createObjectURL(blob);const a=document.createElement('a');a.href=u;a.download=`${playbook.title.replace(/[^a-z0-9]+/gi,'-')}.${mime.startsWith('video/mp4')?'mp4':'webm'}`;a.click();setTimeout(()=>URL.revokeObjectURL(u),10000);
 }finally{setBusy(false)} }
 return <><button type='button' onClick={()=>setOpen(true)}>🎬 Exporter vidéo</button>{open&&<div style={{position:'fixed',inset:0,zIndex:5000,background:'#0009',display:'grid',placeItems:'center'}} onClick={()=>!busy&&setOpen(false)}><div onClick={e=>e.stopPropagation()} style={{width:620,maxWidth:'94vw',maxHeight:'84vh',overflow:'auto',background:'#fff',padding:24,borderRadius:14}}><h2>Vidéo du Playbook</h2><p>Choisis les systèmes et leur ordre actuel. Entre deux systèmes : écran noir + nom du système en grand.</p>{systems.map(s=><div key={s.id} style={{display:'flex',gap:8,padding:'8px 0',borderBottom:'1px solid #eee',alignItems:'center'}}><input type='checkbox' checked={selected.includes(s.id)} onChange={e=>setSelected(v=>e.target.checked?[...v,s.id]:v.filter(x=>x!==s.id))}/><b style={{flex:1}}>{s.title}</b><button onClick={()=>move(s.id,-1)}>↑</button><button onClick={()=>move(s.id,1)}>↓</button></div>)}<div style={{display:'flex',justifyContent:'flex-end',gap:8,marginTop:18}}><button disabled={busy} onClick={()=>setOpen(false)}>Annuler</button><button disabled={busy||!chosen.length} onClick={exportVideo}>{busy?'Création…':'Créer une seule vidéo'}</button></div><small style={{display:'block',marginTop:12,color:'#777'}}>Le montage utilise les médias enregistrés du système. Les schémas servent de secours lorsqu’aucun clip vidéo n’est disponible.</small></div></div>}</>
}
