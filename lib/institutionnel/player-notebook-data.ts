import { createAdminClient } from "@/lib/supabase/admin-server";
async function optionalRows(query:any){
  try{const r=await query; return r?.error?[]:(r?.data||[])}catch{return []}
}

async function buildPoleTracking(db:any, structureId:string, playerId:string){
  const [memberships,links,reports]=await Promise.all([
    optionalRows(db.from("institutional_pole_player_memberships").select("*").eq("structure_id",structureId).eq("institutional_player_id",playerId).eq("active",true)),
    optionalRows(db.from("institutional_pole_player_team_links").select("*").eq("structure_id",structureId).eq("institutional_player_id",playerId).eq("active",true)),
    optionalRows(db.from("institutional_pole_sports_reports").select("*").eq("structure_id",structureId).eq("institutional_player_id",playerId).order("report_date",{ascending:false}).limit(200)),
  ]);
  const seeds:any[]=[];
  memberships.forEach((m:any)=>seeds.push({kind:"pole",teamId:String(m.pole_team_id),playerId:String(m.pole_player_id)}));
  links.forEach((l:any)=>seeds.push({kind:"club",teamId:String(l.partner_team_id),playerId:String(l.partner_player_id)}));
  const uniq=new Map<string,any>();seeds.forEach(x=>uniq.set(`${x.teamId}|${x.playerId}`,x));
  const sources=[...uniq.values()];
  if(!sources.length)return null;
  const teamIds:string[]=[...new Set<string>(sources.map((x:any)=>String(x.teamId)))],playerIds:string[]=[...new Set<string>(sources.map((x:any)=>String(x.playerId)))];
  const teams=await optionalRows(db.from("teams").select("id,name,category").in("id",teamIds));
  const tmap=new Map<string,any>(teams.map((t:any)=>[String(t.id),t]));
  sources.forEach(x=>{x.teamName=tmap.get(x.teamId)?.name||(x.kind==="pole"?"Pôle":"Club");x.category=tmap.get(x.teamId)?.category||null});
  const combos=new Set(sources.map(x=>`${x.teamId}|${x.playerId}`));
  const stats0=await optionalRows(db.from("match_player_stats").select("*").in("player_id",playerIds).limit(5000));
  const stats=stats0.filter((r:any)=>combos.has(`${String(r.team_id)}|${String(r.player_id)}`));
  const matchIds=[...new Set(stats.map((r:any)=>String(r.match_id||"")).filter(Boolean))];
  const matches=matchIds.length?await optionalRows(db.from("match_stats").select("id,project_status").in("id",matchIds)):[];
  const draft=new Set(matches.filter((m:any)=>m.project_status==="draft").map((m:any)=>String(m.id)));
  const valid=stats.filter((r:any)=>!draft.has(String(r.match_id)));
  const sum=(key:string)=>valid.reduce((a:number,r:any)=>a+Number(r[key]||0),0);
  const games=valid.length;
  const presenceSets=await Promise.all(sources.map((x:any)=>optionalRows(db.from("player_event_presence").select("status").eq("team_id",x.teamId).eq("player_id",x.playerId))));
  const pres=presenceSets.flat();const counted=pres.filter((r:any)=>["present","late","absent"].includes(String(r.status||"")));const positive=counted.filter((r:any)=>["present","late"].includes(String(r.status||""))).length;
  const loadSets=await Promise.all(sources.map((x:any)=>optionalRows(db.from("training_load_entries").select("load_date,actual_load,duration_minutes,actual_rpe").eq("team_id",x.teamId).eq("player_id",x.playerId).order("load_date",{ascending:false}).limit(60))));
  const start=new Date();start.setDate(start.getDate()-6);const startIso=start.toISOString().slice(0,10);
  const load7=loadSets.flat().filter((r:any)=>String(r.load_date||"")>=startIso).reduce((a:number,r:any)=>a+(Number(r.actual_load||0)||Number(r.duration_minutes||0)*Number(r.actual_rpe||0)),0);
  const actionSets=await Promise.all(sources.map((x:any)=>optionalRows(db.from("match_actions").select("id,clip_start,clip_end,video_time,team_id").eq("team_id",x.teamId).or(`player_id.eq.${x.playerId},assist_player_id.eq.${x.playerId},rebound_player_id.eq.${x.playerId}`).limit(1000))));
  const clips=actionSets.flat().filter((a:any)=>a.clip_start!=null||a.clip_end!=null||a.video_time!=null).length;
  return {sources,games,minutes:sum("minutes"),pts:sum("pts"),reb:sum("reb")||sum("off_reb")+sum("def_reb"),ast:sum("ast"),presenceRate:counted.length?Math.round(positive/counted.length*100):null,load7:Math.round(load7),clips,reports};
}


export async function buildPlayerNotebookSnapshot(input:{
  structureId:string;
  playerId:string;
  seasonId?:string|null;
}) {
  const db=createAdminClient();
  if(!db) throw new Error("Admin Supabase indisponible.");

  const {structureId,playerId,seasonId}=input;
  const [
    structure,player,seasons,entries,measurements,
    attendanceSessions,attendanceRecords,comments,parent
  ]=await Promise.all([
    db.from("institutional_structures")
      .select("id,name,short_name,structure_type,season_label,city,email,logo_url")
      .eq("id",structureId).single(),
    db.from("institutional_players")
      .select("id,structure_id,first_name,last_name,birthdate,club_name,category,height_cm,father_height_cm,mother_height_cm,email,phone,sex,photo_url")
      .eq("id",playerId).single(),
    db.from("institutional_player_tracking_seasons")
      .select("id,season_label,start_date,end_date")
      .eq("structure_id",structureId).order("start_date"),
    db.from("institutional_player_season_entries")
      .select("*").eq("structure_id",structureId).eq("player_id",playerId),
    db.from("institutional_player_measurements")
      .select("*").eq("structure_id",structureId).eq("player_id",playerId).order("measured_at"),
    db.from("institutional_player_attendance_sessions")
      .select("*").eq("structure_id",structureId).order("session_date"),
    db.from("institutional_player_attendance_records")
      .select("*").eq("structure_id",structureId).eq("player_id",playerId),
    db.from("institutional_player_basket_comments")
      .select("*").eq("structure_id",structureId).eq("player_id",playerId)
      .eq("share_with_club",true).order("comment_date"),
    db.from("institutional_parent_questionnaires")
      .select("response,submitted_at").eq("structure_id",structureId).eq("player_id",playerId)
      .eq("status","completed").order("submitted_at",{ascending:false}).limit(1).maybeSingle(),
  ]);

  const error=structure.error||player.error||seasons.error||entries.error||
    measurements.error||attendanceSessions.error||attendanceRecords.error||comments.error;
  if(error) throw new Error(error.message);

  // Un joueur peut provenir d'un Comité/Ligue et être partagé au Pôle.
  // On accepte la fiche si elle appartient à la structure OU si un partage actif existe.
  if(String((player.data as any)?.structure_id||"")!==structureId){
    const share=await db.from("institutional_player_shares").select("id").eq("player_id",playerId).eq("target_structure_id",structureId).is("revoked_at",null).maybeSingle();
    if(share.error||!share.data) throw new Error("Ce joueur n'est pas accessible depuis cette Institution.");
  }

  const poleTracking=await buildPoleTracking(db,structureId,playerId);

  return {
    generatedAt:new Date().toISOString(),
    activeSeasonId:seasonId||null,
    structure:structure.data,
    player:player.data,
    seasons:seasons.data||[],
    entries:entries.data||[],
    measurements:measurements.data||[],
    attendanceSessions:attendanceSessions.data||[],
    attendanceRecords:attendanceRecords.data||[],
    comments:comments.data||[],
    parentContext:parent.data?.response||{},
    poleTracking,
  };
}

export type PlayerNotebookSnapshot = Awaited<ReturnType<typeof buildPlayerNotebookSnapshot>>;
