import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

type Ctx={user:any;db:any;structure:any};
async function ctx(structureId:string):Promise<Ctx|null>{
 const sb=await createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return null;
 const db=createAdminClient()||sb;
 const [m,s]=await Promise.all([
  db.from("institutional_members").select("id").eq("structure_id",structureId).eq("user_id",user.id).eq("status","active").maybeSingle(),
  db.from("institutional_structures").select("id,name,structure_type").eq("id",structureId).maybeSingle()
 ]);
 if(!m.data||!s.data||s.data.structure_type!=="league")return null;return{user,db,structure:s.data};
}
function n(v:any){const x=Number(v);return Number.isFinite(x)&&x>0?x:null}
async function season(db:any,structureId:string,label:string,userId:string){
 const q=await db.from("institutional_player_tracking_seasons").select("id,season_label").eq("structure_id",structureId).eq("season_label",label).maybeSingle();if(q.data)return q.data;
 const c=await db.from("institutional_player_tracking_seasons").insert({structure_id:structureId,season_label:label,created_by:userId}).select("id,season_label").single();if(c.error)throw c.error;return c.data;
}

export async function POST(req:Request){
 const b=await req.json().catch(()=>({})),structureId=String(b.structureId||"");const c=await ctx(structureId);if(!c)return NextResponse.json({error:"Réservé aux Ligues."},{status:403});
 try{
  const sourcePoleTeamId=String(b.sourcePoleTeamId||""),targetSeasonLabel=String(b.targetSeasonLabel||"").trim(),targetName=String(b.targetTeamName||"").trim(),targetCategory=String(b.targetCategory||"").trim();
  const selected=Array.isArray(b.players)?b.players:[];if(!sourcePoleTeamId||!targetSeasonLabel||!targetName||!selected.length)throw new Error("Équipe source, nouvelle saison, nom d'équipe et joueurs sont obligatoires.");
  const sourceLink=await c.db.from("institutional_pole_teams").select("season_label").eq("structure_id",structureId).eq("team_id",sourcePoleTeamId).eq("team_kind","pole").eq("active",true).single();if(sourceLink.error)throw sourceLink.error;
  const prior=await c.db.from("institutional_pole_season_transitions").select("id,target_pole_team_id").eq("structure_id",structureId).eq("source_pole_team_id",sourcePoleTeamId).eq("target_season_label",targetSeasonLabel).maybeSingle();
  if(prior.data)return NextResponse.json({error:"Ce passage de saison a déjà été effectué.",teamId:prior.data.target_pole_team_id},{status:409});
  const targetSeason=await season(c.db,structureId,targetSeasonLabel,c.user.id);
  const team=await c.db.from("teams").insert({user_id:c.user.id,team_type:"coached",name:targetName,club_name:targetName,category:targetCategory||null,coach_name:c.structure.name,metadata:{institutionalStructureId:structureId,institutionalTeamKind:"pole",institutionalSupervisor:c.user.id,seasonLabel:targetSeasonLabel,createdFrom:"pole_season_transition"}}).select("id,user_id").single();if(team.error)throw team.error;
  const link=await c.db.from("institutional_pole_teams").insert({structure_id:structureId,team_id:team.data.id,team_kind:"pole",season_label:targetSeasonLabel,active:true,created_by:c.user.id});if(link.error){await c.db.from("teams").delete().eq("id",team.data.id);throw link.error}
  const sourceIds=selected.map((x:any)=>String(x.membershipId||"")).filter(Boolean);
  const memberships=await c.db.from("institutional_pole_player_memberships").select("*,institutional_players(*)").eq("structure_id",structureId).eq("pole_team_id",sourcePoleTeamId).in("id",sourceIds);if(memberships.error)throw memberships.error;
  let imported=0;
  for(const row of memberships.data||[]){
    const chosen=selected.find((x:any)=>String(x.membershipId)===String(row.id))||{};const p:any=row.institutional_players;
    const updates:any={};
    if(n(chosen.heightCm))updates.height_cm=n(chosen.heightCm);if(n(chosen.weightKg))updates.weight_kg=n(chosen.weightKg);if(n(chosen.wingspanCm))updates.wingspan_cm=n(chosen.wingspanCm);
    if(chosen.clubName!==undefined)updates.club_name=String(chosen.clubName||"")||null;if(chosen.category!==undefined)updates.category=String(chosen.category||"")||null;
    if(chosen.school!==undefined)updates.school=String(chosen.school||"")||null;if(chosen.className!==undefined)updates.class_name=String(chosen.className||"")||null;
    if(Object.keys(updates).length){const u=await c.db.from("institutional_players").update({...updates,updated_at:new Date().toISOString()}).eq("id",p.id);if(u.error)throw u.error}
    const roster=await c.db.from("players").insert({user_id:team.data.user_id,team_id:team.data.id,first_name:p.first_name,last_name:p.last_name,birth_date:p.birthdate,photo_url:p.photo_url,position_primary:p.position_primary||"",position_secondary:p.position_secondary||"",height:updates.height_cm?String(updates.height_cm):(p.height_cm?String(p.height_cm):""),weight:updates.weight_kg?String(updates.weight_kg):(p.weight_kg?String(p.weight_kg):""),dominant_hand:p.dominant_hand||"",status:"Disponible",license_number:p.license_number||null,tutor1_phone:p.tutor1_phone||null,tutor1_email:p.tutor1_email||null,tutor2_phone:p.tutor2_phone||null,tutor2_email:p.tutor2_email||null,presence_pct:0,punctuality_pct:0,metadata:{institutionalPolePlayerId:p.id,polePlayer:true,poleProtected:true,sex:p.sex||null,school:updates.school??p.school??"",className:updates.class_name??p.class_name??"",club:updates.club_name??p.club_name??"",category:updates.category??p.category??"",wingspanCm:updates.wingspan_cm??p.wingspan_cm??null}}).select("id").single();if(roster.error)throw roster.error;
    const mem=await c.db.from("institutional_pole_player_memberships").insert({structure_id:structureId,institutional_player_id:p.id,season_id:targetSeason.id,pole_team_id:team.data.id,pole_player_id:roster.data.id,active:true,created_by:c.user.id});if(mem.error)throw mem.error;
    if(n(chosen.heightCm)||n(chosen.weightKg)||n(chosen.wingspanCm)){const ms=await c.db.from("institutional_player_measurements").insert({structure_id:structureId,player_id:p.id,season_id:targetSeason.id,measured_at:chosen.measuredAt||new Date().toISOString().slice(0,10),height_cm:n(chosen.heightCm),weight_kg:n(chosen.weightKg),wingspan_cm:n(chosen.wingspanCm),created_by:c.user.id});if(ms.error)throw ms.error}
    const partnerTeamId=String(chosen.partnerTeamId||"");
    if(partnerTeamId){
      const partnerLink=await c.db.from("institutional_pole_teams").select("id").eq("structure_id",structureId).eq("team_id",partnerTeamId).eq("team_kind","partner").eq("season_label",targetSeasonLabel).eq("active",true).maybeSingle();
      if(partnerLink.data){const pt=await c.db.from("teams").select("id,user_id").eq("id",partnerTeamId).single();if(!pt.error){const pp=await c.db.from("players").insert({user_id:pt.data.user_id,team_id:partnerTeamId,first_name:p.first_name,last_name:p.last_name,birth_date:p.birthdate,photo_url:p.photo_url,position_primary:p.position_primary||"",position_secondary:p.position_secondary||"",height:updates.height_cm?String(updates.height_cm):(p.height_cm?String(p.height_cm):""),weight:updates.weight_kg?String(updates.weight_kg):(p.weight_kg?String(p.weight_kg):""),dominant_hand:p.dominant_hand||"",status:"Disponible",license_number:p.license_number||null,tutor1_phone:p.tutor1_phone||null,tutor1_email:p.tutor1_email||null,tutor2_phone:p.tutor2_phone||null,tutor2_email:p.tutor2_email||null,presence_pct:0,punctuality_pct:0,metadata:{institutionalPolePlayerId:p.id,poleProtected:true,secondaryTeam:true,sex:p.sex||null,school:updates.school??p.school??"",className:updates.class_name??p.class_name??"",club:updates.club_name??p.club_name??"",category:updates.category??p.category??""}}).select("id").single();if(!pp.error)await c.db.from("institutional_pole_player_team_links").insert({structure_id:structureId,institutional_player_id:p.id,season_id:targetSeason.id,pole_team_id:team.data.id,pole_player_id:roster.data.id,partner_team_id:partnerTeamId,partner_player_id:pp.data.id,active:true,created_by:c.user.id})}}
    }
    imported++;
  }
  await c.db.from("institutional_pole_season_transitions").insert({structure_id:structureId,source_pole_team_id:sourcePoleTeamId,target_pole_team_id:team.data.id,source_season_label:sourceLink.data.season_label,target_season_label:targetSeasonLabel,selected_player_ids:(memberships.data||[]).map((x:any)=>x.institutional_player_id),transition_payload:{players:selected},created_by:c.user.id});
  return NextResponse.json({ok:true,teamId:team.data.id,imported});
 }catch(e:any){return NextResponse.json({error:e?.message||"Passage de saison impossible."},{status:400})}
}
