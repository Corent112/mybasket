import { createAdminClient } from "@/lib/supabase/admin-server";

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
      .select("id,first_name,last_name,birthdate,club_name,category,height_cm,father_height_cm,mother_height_cm,email,phone,sex,photo_url")
      .eq("id",playerId).eq("structure_id",structureId).single(),
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
  };
}

export type PlayerNotebookSnapshot = Awaited<ReturnType<typeof buildPlayerNotebookSnapshot>>;
