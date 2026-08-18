"use client";
import { createClient } from "@/lib/supabase/client";

export async function logActivity(input:{
  teamId?:string|null; clubId?:string|null; playerId?:string|null;
  scope:"team"|"player"|"calendar"|"training"|"resource"|"document"|"shooting"|"staff"|"club";
  actionKey:string; title:string; description?:string|null; href?:string|null; metadata?:Record<string,unknown>;
}){
  const supabase=createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)return;
  const {data,error}=await supabase.from("activity_log").insert({
    actor_id:user.id,team_id:input.teamId??null,club_id:input.clubId??null,player_id:input.playerId??null,
    scope:input.scope,action_key:input.actionKey,title:input.title,description:input.description??null,href:input.href??null,metadata:input.metadata??{}
  }).select("id").single();
  if(error){console.error("activity_log:",error);return}
  if(data?.id){
    fetch("/api/training/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({mode:"activity_email",activityId:data.id})}).catch(()=>undefined);
  }
}
