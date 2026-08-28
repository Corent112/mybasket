"use client";
import { createClient } from "@/lib/supabase/client";

export type ClubAdminFile = {
  id?:string; club_id:string; player_id:string; season:string;
  identity_ok:boolean; photo_ok:boolean; parental_ok:boolean; medical_ok:boolean;
  registration_form_ok:boolean; license_file_ok:boolean; notes:string;
};
export type AdminMap=Record<string,ClubAdminFile>;

export function currentClubSeason(){
 const d=new Date(),y=d.getMonth()>=6?d.getFullYear():d.getFullYear()-1;return `${y}-${y+1}`;
}
export async function listAdminFiles(clubId:string,season=currentClubSeason()):Promise<AdminMap>{
 const sb=createClient();
 const {data,error}=await sb.from("club_player_admin_files").select("*").eq("club_id",clubId).eq("season",season);
 if(error) throw error; const m:AdminMap={};(data||[]).forEach((r:any)=>m[r.player_id]=r);return m;
}
export async function saveAdminFile(clubId:string,playerId:string,patch:Partial<ClubAdminFile>,season=currentClubSeason()){
 const sb=createClient();
 const {data,error}=await sb.from("club_player_admin_files").upsert(
  {club_id:clubId,player_id:playerId,season,...patch,updated_at:new Date().toISOString()},
  {onConflict:"club_id,player_id,season"}
 ).select("*").single();
 if(error)throw error;return data as ClubAdminFile;
}
export function adminFileComplete(x?:Partial<ClubAdminFile>|null){
 return !!(x?.identity_ok&&x?.photo_ok&&x?.parental_ok&&x?.medical_ok&&x?.registration_form_ok&&x?.license_file_ok);
}
