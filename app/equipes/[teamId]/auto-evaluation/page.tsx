"use client";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function TeamAutoEvaluationLinkPage(){
 const params=useParams<{teamId:string}>(); const teamId=String(params?.teamId||"");
 const router=useRouter(); const supabase=useMemo(()=>createClient(),[]);
 const [message,setMessage]=useState("Recherche de la séance…");
 useEffect(()=>{void resolve()},[teamId]);
 async function resolve(){
   const {data:{user}}=await supabase.auth.getUser();
   if(!user){router.replace(`/connexion?redirect=${encodeURIComponent(`/equipes/${teamId}/auto-evaluation`)}`);return;}
   const today=new Date().toISOString().slice(0,10);
   let {data}=await supabase.from("practice_sessions").select("id,session_date,start_time,title,theme").eq("team_id",teamId).lte("session_date",today).order("session_date",{ascending:false}).order("start_time",{ascending:false}).limit(1);
   if(!data?.length){
     const fallback=await supabase.from("practice_sessions").select("id,session_date,start_time,title,theme").eq("team_reference_id",teamId).lte("session_date",today).order("session_date",{ascending:false}).order("start_time",{ascending:false}).limit(1);
     data=fallback.data;
   }
   if(data?.[0]?.id){router.replace(`/seances/${data[0].id}/evaluation`);return;}
   setMessage("Aucune séance passée ou prévue aujourd'hui n'est associée à cette équipe.");
 }
 return <main style={{minHeight:"70vh",display:"grid",placeItems:"center",padding:24}}><div style={{maxWidth:520,textAlign:"center",border:"1px solid #eadccc",borderRadius:18,padding:24,background:"#fff"}}><h1 style={{color:"#6b1a2c",marginTop:0}}>Auto-évaluation</h1><p>{message}</p></div></main>
}
