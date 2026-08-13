import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
export const runtime = "nodejs";
export const maxDuration = 60;
export async function POST(req: NextRequest) {
  try {
    if (!process.env.MONTAGE_RENDER_SECRET || req.headers.get("x-render-secret") !== process.env.MONTAGE_RENDER_SECRET)
      return NextResponse.json({ error: "Accès refusé" }, { status: 401 });
    const url=process.env.NEXT_PUBLIC_SUPABASE_URL, key=process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(!url||!key) throw new Error("Variables Supabase serveur manquantes");
    const supabase=createClient(url,key,{auth:{persistSession:false}});
    const {data,error}=await supabase.from("livestat_render_jobs").select("id,montage_id,render_manifest,status").eq("status","queued").order("created_at",{ascending:true}).limit(1);
    if(error) throw error;
    const job=data?.[0]; if(!job) return NextResponse.json({ok:true,job:null});
    const {data:claimed,error:claimError}=await supabase.from("livestat_render_jobs").update({status:"rendering",progress:1,updated_at:new Date().toISOString()}).eq("id",job.id).eq("status","queued").select("id").maybeSingle();
    if(claimError) throw claimError;
    if(!claimed) return NextResponse.json({ok:true,job:null});
    return NextResponse.json({ok:true,job:{id:job.id,montage_id:job.montage_id,manifest:job.render_manifest}});
  } catch(error:any){ return NextResponse.json({error:error?.message||"Erreur worker"},{status:500}); }
}
