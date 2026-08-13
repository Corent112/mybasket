import { createClient } from "@supabase/supabase-js";
import { spawn } from "node:child_process";
import { mkdtemp,writeFile,readFile,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const {NEXT_PUBLIC_SUPABASE_URL:URL,SUPABASE_SERVICE_ROLE_KEY:KEY,MONTAGE_RENDER_SECRET:SECRET,MONTAGE_APP_URL:APP}=process.env;
if(!URL||!KEY||!SECRET||!APP) throw new Error("Variables worker manquantes");
const sb=createClient(URL,KEY,{auth:{persistSession:false}});
const exec=(c,a,cwd)=>new Promise((ok,no)=>{const p=spawn(c,a,{cwd,stdio:["ignore","inherit","inherit"]});p.on("error",no);p.on("exit",x=>x===0?ok():no(new Error(`${c} code ${x}`)))});
const upd=(id,p)=>sb.from("livestat_render_jobs").update({...p,updated_at:new Date().toISOString()}).eq("id",id);
async function claim(){const r=await fetch(`${APP.replace(/\/$/,"")}/api/montages/render-worker`,{method:"POST",headers:{"x-render-secret":SECRET}});if(!r.ok)throw new Error(await r.text());return r.json()}
async function render(job){
 const items=Array.isArray(job.manifest?.items)?job.manifest.items:[];
 const videos=items.filter(x=>x.track==="video"&&x.source?.video_url).sort((a,b)=>Number(a.timeline_start||0)-Number(b.timeline_start||0));
 if(!videos.length)throw new Error("Aucun clip vidéo exportable");
 const dir=await mkdtemp(join(tmpdir(),"mybasket-"));
 try{
  const parts=[];
  for(let i=0;i<videos.length;i++){const x=videos[i],start=Number(x.source.clip_start??x.clip_start??0),end=Number(x.source.clip_end??x.clip_end??start+.1),out=join(dir,`p-${String(i).padStart(4,"0")}.mp4`);
   await exec("ffmpeg",["-y","-ss",String(start),"-i",String(x.source.video_url),"-t",String(Math.max(.1,end-start)),"-vf","scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2,setsar=1","-r","30","-c:v","libx264","-preset","veryfast","-crf","20","-an",out],dir);
   parts.push(out);await upd(job.id,{progress:Math.min(70,Math.round((i+1)/videos.length*70))});}
  const list=join(dir,"concat.txt");await writeFile(list,parts.map(f=>`file '${f}'`).join("\n"));const video=join(dir,"video.mp4");
  await exec("ffmpeg",["-y","-f","concat","-safe","0","-i",list,"-c","copy",video],dir);await upd(job.id,{progress:80});
  const audios=items.filter(x=>x.track==="audio"&&(x.image_url||x.asset_url));let final=video;
  if(audios.length){const a=["-y","-i",video];audios.forEach(x=>a.push("-i",String(x.image_url||x.asset_url)));const f=audios.map((x,i)=>{const d=Math.max(0,Math.round(Number(x.timeline_start||0)*1000));return `[${i+1}:a]adelay=${d}|${d},volume=${Math.max(0,Number(x.volume??1))}[a${i}]`});f.push(`${audios.map((_,i)=>`[a${i}]`).join("")}amix=inputs=${audios.length}:duration=longest:dropout_transition=0[mix]`);final=join(dir,"final.mp4");a.push("-filter_complex",f.join(";"),"-map","0:v:0","-map","[mix]","-c:v","copy","-c:a","aac","-b:a","192k","-shortest",final);await exec("ffmpeg",a,dir);}
  await upd(job.id,{progress:93});const bytes=await readFile(final),path=`renders/${job.montage_id}/${job.id}.mp4`;
  const {error}=await sb.storage.from("livestat-montages").upload(path,bytes,{contentType:"video/mp4",upsert:true});if(error)throw error;
  const {data}=sb.storage.from("livestat-montages").getPublicUrl(path);await upd(job.id,{status:"done",progress:100,output_url:data.publicUrl});
  await sb.from("livestat_montages").update({export_status:"done",export_url:data.publicUrl,updated_at:new Date().toISOString()}).eq("id",job.montage_id);
 }catch(e){await upd(job.id,{status:"failed",error_message:e instanceof Error?e.message:String(e)});throw e}finally{await rm(dir,{recursive:true,force:true})}
}
for(;;){const p=await claim();if(!p.job){await new Promise(r=>setTimeout(r,3000));continue}try{await render(p.job)}catch(e){console.error(e)}}
