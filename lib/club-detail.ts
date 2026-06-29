// lib/club-detail.ts
"use client";

import { createClient } from "@/lib/supabase/client";
import type { ClubDocument, ClubPlayer, ClubTeam } from "@/lib/club-core";
import { listClubDocuments, listClubPlayers, listClubTeams, loadClubPerformance, uploadClubDocument } from "@/lib/club-core";

export type ClubNote = {
  id: string;
  clubId: string;
  playerId?: string | null;
  teamId?: string | null;
  title: string;
  body: string;
  kind: string;
  createdAt: string | null;
};

export type ClubObjective = {
  id: string;
  clubId: string;
  playerId: string;
  title: string;
  description: string;
  status: string;
  dueDate: string | null;
};

function sb() { return createClient(); }

function fail(error: any) {
  console.error("CLUB_DETAIL_ERROR", error);
  return new Error(error?.message || error?.details || error?.hint || "Erreur Supabase");
}

function note(row: any): ClubNote {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    playerId: row.player_id ?? null,
    teamId: row.team_id ?? null,
    title: row.title ?? "",
    body: row.body ?? "",
    kind: row.kind ?? "note",
    createdAt: row.created_at ?? null,
  };
}

function objective(row: any): ClubObjective {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    playerId: String(row.player_id),
    title: row.title ?? "",
    description: row.description ?? "",
    status: row.status ?? "active",
    dueDate: row.due_date ?? null,
  };
}

export async function getTeamWorkspace(clubId: string, teamId: string) {
  const [teams, players, docs, performance] = await Promise.all([
    listClubTeams(clubId),
    listClubPlayers(clubId, { teamId }),
    listClubDocuments(clubId),
    loadClubPerformance(clubId, teamId),
  ]);

  const { data, error } = await sb()
    .from("club_team_notes")
    .select("*")
    .eq("club_id", clubId)
    .eq("team_id", teamId)
    .order("created_at", { ascending: false });

  if (error) throw fail(error);

  return {
    team: teams.find((team: ClubTeam) => team.id === teamId) || null,
    players,
    documents: docs.filter((doc: ClubDocument) => doc.teamId === teamId),
    performance,
    notes: (data ?? []).map(note),
  };
}

export async function getPlayerWorkspace(clubId: string, playerId: string) {
  const [players, teams, docs, performance] = await Promise.all([
    listClubPlayers(clubId),
    listClubTeams(clubId),
    listClubDocuments(clubId),
    loadClubPerformance(clubId),
  ]);

  const player = players.find((p: ClubPlayer) => p.id === playerId) || null;

  const supabase = sb();
  const notesReq = supabase.from("club_player_notes").select("*").eq("club_id", clubId).eq("player_id", playerId).order("created_at", { ascending: false });
  const objectivesReq = supabase.from("club_player_objectives").select("*").eq("club_id", clubId).eq("player_id", playerId).order("created_at", { ascending: false });

  const [{ data: notes, error: nErr }, { data: objectives, error: oErr }] = await Promise.all([notesReq, objectivesReq]);
  if (nErr) throw fail(nErr);
  if (oErr) throw fail(oErr);

  return {
    player,
    team: player ? teams.find((team: ClubTeam) => team.id === player.teamId) || null : null,
    documents: docs.filter((doc: ClubDocument) => doc.playerId === playerId),
    performance: performance.find((row: any) => row.player_id === playerId) || null,
    notes: (notes ?? []).map(note),
    objectives: (objectives ?? []).map(objective),
  };
}

export async function createTeamNote(input: { clubId: string; teamId: string; title: string; body: string }) {
  const { data: userData } = await sb().auth.getUser();
  const { data, error } = await sb()
    .from("club_team_notes")
    .insert({ club_id: input.clubId, team_id: input.teamId, title: input.title, body: input.body, author_id: userData.user?.id ?? null })
    .select("*")
    .single();
  if (error) throw fail(error);
  return note(data);
}

export async function createPlayerNote(input: { clubId: string; playerId: string; title: string; body: string }) {
  const { data: userData } = await sb().auth.getUser();
  const { data, error } = await sb()
    .from("club_player_notes")
    .insert({ club_id: input.clubId, player_id: input.playerId, title: input.title, body: input.body, author_id: userData.user?.id ?? null })
    .select("*")
    .single();
  if (error) throw fail(error);
  return note(data);
}

export async function createPlayerObjective(input: { clubId: string; playerId: string; title: string; description?: string; dueDate?: string | null }) {
  const { data, error } = await sb()
    .from("club_player_objectives")
    .insert({ club_id: input.clubId, player_id: input.playerId, title: input.title, description: input.description || "", due_date: input.dueDate || null })
    .select("*")
    .single();
  if (error) throw fail(error);
  return objective(data);
}

export async function uploadTeamDocument(input: { clubId: string; teamId: string; file: File }) {
  return uploadClubDocument({ clubId: input.clubId, teamId: input.teamId, file: input.file, section: "Équipes", category: "Document équipe" });
}

export async function uploadPlayerDocument(input: { clubId: string; playerId: string; file: File }) {
  return uploadClubDocument({ clubId: input.clubId, playerId: input.playerId, file: input.file, section: "Joueurs", category: "Document joueur" });
}
