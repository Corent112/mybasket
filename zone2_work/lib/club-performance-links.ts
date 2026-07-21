// lib/club-performance-links.ts
"use client";

import { createClient } from "@/lib/supabase/client";
import { listClubPlayers, listClubTeams, type ClubPlayer, type ClubTeam } from "@/lib/club-core";

export type ClubMatch = {
  id: string;
  clubId: string;
  teamId: string | null;
  eventId: string | null;
  opponent: string;
  matchDate: string;
  location: string;
  homeScore: number;
  awayScore: number;
  status: string;
};

export type PlayerGameStat = {
  id: string;
  clubId: string;
  teamId: string;
  playerId: string;
  matchId: string;
  minutes: number;
  pts: number;
  p2m: number;
  p2a: number;
  p3m: number;
  p3a: number;
  ftm: number;
  fta: number;
  offReb: number;
  defReb: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  turnovers: number;
  pf: number;
  plusMinus: number;
  present: boolean;
};

export type PlayerTotal = {
  clubId: string;
  teamId: string | null;
  playerId: string;
  firstName: string;
  lastName: string;
  category: string | null;
  gender: string | null;
  games: number;
  minutes: number;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  turnovers: number;
  p2m: number;
  p2a: number;
  p3m: number;
  p3a: number;
  ftm: number;
  fta: number;
  ppg: number;
  rpg: number;
  apg: number;
};

function sb() {
  return createClient();
}

function fail(context: string, error: any): never {
  console.error(context, error);
  throw new Error(error?.message || error?.details || error?.hint || error?.code || context);
}

function rowToMatch(row: any): ClubMatch {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    teamId: row.team_id ?? null,
    eventId: row.event_id ?? null,
    opponent: row.opponent ?? "",
    matchDate: row.match_date,
    location: row.location ?? "",
    homeScore: Number(row.home_score) || 0,
    awayScore: Number(row.away_score) || 0,
    status: row.status ?? "draft",
  };
}

function rowToTotal(row: any): PlayerTotal {
  return {
    clubId: String(row.club_id),
    teamId: row.team_id ?? null,
    playerId: String(row.player_id),
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    category: row.category ?? null,
    gender: row.gender ?? null,
    games: Number(row.games) || 0,
    minutes: Number(row.minutes) || 0,
    pts: Number(row.pts) || 0,
    reb: Number(row.reb) || 0,
    ast: Number(row.ast) || 0,
    stl: Number(row.stl) || 0,
    blk: Number(row.blk) || 0,
    turnovers: Number(row.turnovers) || 0,
    p2m: Number(row.p2m) || 0,
    p2a: Number(row.p2a) || 0,
    p3m: Number(row.p3m) || 0,
    p3a: Number(row.p3a) || 0,
    ftm: Number(row.ftm) || 0,
    fta: Number(row.fta) || 0,
    ppg: Number(row.ppg) || 0,
    rpg: Number(row.rpg) || 0,
    apg: Number(row.apg) || 0,
  };
}

export async function listClubMatches(clubId: string, teamId?: string): Promise<ClubMatch[]> {
  let query = sb()
    .from("club_matches")
    .select("*")
    .eq("club_id", clubId)
    .order("match_date", { ascending: false });

  if (teamId) query = query.eq("team_id", teamId);

  const { data, error } = await query;
  if (error) fail("LIST_CLUB_MATCHES_ERROR", error);
  return (data ?? []).map(rowToMatch);
}

export async function createClubMatch(input: {
  clubId: string;
  teamId: string;
  eventId?: string | null;
  opponent: string;
  matchDate: string;
  location?: string;
}): Promise<ClubMatch> {
  const supabase = sb();
  const { data: userData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("club_matches")
    .insert({
      club_id: input.clubId,
      team_id: input.teamId,
      event_id: input.eventId || null,
      opponent: input.opponent,
      match_date: input.matchDate,
      location: input.location || "",
      created_by: userData.user?.id ?? null,
    })
    .select("*")
    .single();

  if (error) fail("CREATE_CLUB_MATCH_ERROR", error);
  return rowToMatch(data);
}

export async function deleteClubMatch(clubId: string, matchId: string): Promise<void> {
  const supabase = sb();

  await supabase
    .from("club_player_game_stats")
    .delete()
    .eq("club_id", clubId)
    .eq("match_id", matchId);

  const { error } = await supabase
    .from("club_matches")
    .delete()
    .eq("club_id", clubId)
    .eq("id", matchId);

  if (error) fail("DELETE_CLUB_MATCH_ERROR", error);
}

export async function savePlayerGameStat(input: {
  clubId: string;
  teamId: string;
  matchId: string;
  playerId: string;
  minutes?: number;
  pts?: number;
  p2m?: number;
  p2a?: number;
  p3m?: number;
  p3a?: number;
  ftm?: number;
  fta?: number;
  offReb?: number;
  defReb?: number;
  reb?: number;
  ast?: number;
  stl?: number;
  blk?: number;
  turnovers?: number;
  pf?: number;
  plusMinus?: number;
  present?: boolean;
}): Promise<void> {
  const supabase = sb();
  const { data: userData } = await supabase.auth.getUser();

  const payload = {
    club_id: input.clubId,
    team_id: input.teamId,
    match_id: input.matchId,
    player_id: input.playerId,
    created_by: userData.user?.id ?? null,
    minutes: input.minutes || 0,
    pts: input.pts || 0,
    p2m: input.p2m || 0,
    p2a: input.p2a || 0,
    p3m: input.p3m || 0,
    p3a: input.p3a || 0,
    ftm: input.ftm || 0,
    fta: input.fta || 0,
    off_reb: input.offReb || 0,
    def_reb: input.defReb || 0,
    reb: input.reb ?? ((input.offReb || 0) + (input.defReb || 0)),
    ast: input.ast || 0,
    stl: input.stl || 0,
    blk: input.blk || 0,
    turnovers: input.turnovers || 0,
    pf: input.pf || 0,
    plus_minus: input.plusMinus || 0,
    present: input.present ?? true,
  };

  const { error } = await supabase
    .from("club_player_game_stats")
    .upsert(payload, { onConflict: "match_id,player_id" });

  if (error) fail("SAVE_PLAYER_GAME_STAT_ERROR", error);
}

export async function listPlayerTotals(clubId: string, teamId?: string): Promise<PlayerTotal[]> {
  let query = sb()
    .from("club_performance_player_totals")
    .select("*")
    .eq("club_id", clubId)
    .order("pts", { ascending: false });

  if (teamId) query = query.eq("team_id", teamId);

  const { data, error } = await query;
  if (error) fail("LIST_PLAYER_TOTALS_ERROR", error);
  return (data ?? []).map(rowToTotal);
}

export async function getPerformanceWorkspace(clubId: string): Promise<{
  teams: ClubTeam[];
  players: ClubPlayer[];
  matches: ClubMatch[];
  totals: PlayerTotal[];
}> {
  const [teams, players, matches, totals] = await Promise.all([
    listClubTeams(clubId),
    listClubPlayers(clubId),
    listClubMatches(clubId),
    listPlayerTotals(clubId),
  ]);

  return { teams, players, matches, totals };
}
