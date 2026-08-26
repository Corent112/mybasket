import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

async function resolvePlayer(db:any, rosterPlayerId:string){
  const linked=await db.from("institutional_pole_player_team_links").select("institutional_player_id,structure_id,season_id,pole_team_id,partner_team_id").or(`partner_player_id.eq.${rosterPlayerId},pole_player_id.eq.${rosterPlayerId}`).maybeSingle();
  if(linked.data)return linked.data;
  const membership=await db.from("institutional_pole_player_memberships").select("institutional_player_id,structure_id,season_id,pole_team_id").eq("pole_player_id",rosterPlayerId).eq("active",true).maybeSingle();
  return membership.data||null;
}

export async function GET(req:Request){
  const sb=await createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:"Non connecté"},{status:401});
  const u=new URL(req.url),rosterPlayerId=u.searchParams.get("partnerPlayerId")||"";const db=createAdminClient()||sb;
  const resolved=await resolvePlayer(db,rosterPlayerId);if(!resolved)return NextResponse.json({linked:false,reports:[]});
  const q=await db.from("institutional_pole_sports_reports").select("*").eq("institutional_player_id",resolved.institutional_player_id).order("report_date",{ascending:false}).order("created_at",{ascending:false});
  return NextResponse.json({linked:true,link:resolved,reports:q.data||[]});
}

export async function POST(req:Request){
  const sb=await createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:"Non connecté"},{status:401});
  const b=await req.json().catch(()=>({}));const db=createAdminClient()||sb;
  let institutionalPlayerId=b.institutionalPlayerId,structureId=b.structureId,seasonId=b.seasonId;
  if(!institutionalPlayerId&&b.partnerPlayerId){const resolved=await resolvePlayer(db,String(b.partnerPlayerId));institutionalPlayerId=resolved?.institutional_player_id;structureId=resolved?.structure_id;seasonId=seasonId||resolved?.season_id}
  if(!institutionalPlayerId||!structureId)return NextResponse.json({error:"Joueur non relié au Pôle"},{status:400});
  const teamLink=await db.from("institutional_pole_teams").select("team_kind").eq("structure_id",structureId).eq("team_id",b.teamId).eq("active",true).maybeSingle();
  const authorContext=teamLink.data?.team_kind==="pole"?"pole":"club";
  const q=await db.from("institutional_pole_sports_reports").insert({structure_id:structureId,institutional_player_id:institutionalPlayerId,team_id:b.teamId,season_id:seasonId||null,report_type:b.reportType,report_date:b.reportDate,opponent:b.opponent||null,event_title:b.eventTitle||null,minutes_played:b.minutesPlayed?Number(b.minutesPlayed):null,starter:!!b.starter,attendance_status:b.attendanceStatus||null,involvement:b.involvement||null,behavior:b.behavior||null,intensity:b.intensity||null,physical_state:b.physicalState||null,role_text:b.roleText||null,positives:b.positives||null,improvement_areas:b.improvementAreas||null,coach_comment:b.coachComment||null,author_user_id:user.id,author_context:authorContext}).select("*").single();
  if(q.error)return NextResponse.json({error:q.error.message},{status:400});return NextResponse.json({ok:true,report:q.data});
}
