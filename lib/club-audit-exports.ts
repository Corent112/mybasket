// lib/club-audit-exports.ts
"use client";

import { createClient } from "@/lib/supabase/client";
import type { ClubPlayer, ClubTeam, ClubCoach, ClubDocument } from "@/lib/club-core";
import {
  listClubPlayers,
  listClubTeams,
  listClubCoaches,
  listClubDocuments,
} from "@/lib/club-core";
import { listPlayerCotisations, type PlayerCotisation } from "@/lib/club-cotisations";

export type ClubAuditLog = {
  id: string;
  clubId: string;
  userId: string | null;
  action: string;
  entityType: string;
  entityId: string | null;
  title: string;
  description: string;
  beforeData: Record<string, unknown> | null;
  afterData: Record<string, unknown> | null;
  createdAt: string;
};

export type ExportBundle = {
  players: ClubPlayer[];
  teams: ClubTeam[];
  coaches: ClubCoach[];
  documents: ClubDocument[];
  cotisations: PlayerCotisation[];
};

function sb() {
  return createClient();
}

function fail(error: any) {
  console.error("CLUB_AUDIT_EXPORTS_ERROR", error);
  return new Error(error?.message || error?.details || error?.hint || "Erreur Supabase");
}

function rowToLog(row: any): ClubAuditLog {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    userId: row.user_id ?? null,
    action: row.action ?? "",
    entityType: row.entity_type ?? "club",
    entityId: row.entity_id ?? null,
    title: row.title ?? "",
    description: row.description ?? "",
    beforeData: row.before_data ?? null,
    afterData: row.after_data ?? null,
    createdAt: row.created_at,
  };
}

export async function listClubAuditLogs(clubId: string, filters?: {
  entityType?: string;
  action?: string;
  limit?: number;
}): Promise<ClubAuditLog[]> {
  let query = sb()
    .from("club_audit_logs")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false })
    .limit(filters?.limit || 200);

  if (filters?.entityType) query = query.eq("entity_type", filters.entityType);
  if (filters?.action) query = query.eq("action", filters.action);

  const { data, error } = await query;
  if (error) throw fail(error);
  return (data ?? []).map(rowToLog);
}

export async function createClubAuditLog(input: {
  clubId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  title: string;
  description?: string;
  afterData?: Record<string, unknown> | null;
}): Promise<string> {
  const { data, error } = await sb().rpc("create_club_audit_log", {
    p_club_id: input.clubId,
    p_action: input.action,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId || null,
    p_title: input.title,
    p_description: input.description || "",
    p_after_data: input.afterData || null,
  });

  if (error) throw fail(error);
  return String(data);
}

export async function getExportBundle(clubId: string): Promise<ExportBundle> {
  const [players, teams, coaches, documents, cotisations] = await Promise.all([
    listClubPlayers(clubId),
    listClubTeams(clubId),
    listClubCoaches(clubId),
    listClubDocuments(clubId),
    listPlayerCotisations(clubId),
  ]);

  return { players, teams, coaches, documents, cotisations };
}

function csvEscape(value: unknown) {
  return `"${String(value ?? "").replace(/"/g, '""')}"`;
}

export function buildCsv(rows: unknown[][]) {
  return rows.map((row) => row.map(csvEscape).join(";")).join("\n");
}

export function buildPlayersCsv(players: ClubPlayer[], teams: ClubTeam[]) {
  const rows: unknown[][] = [[
    "id", "nom", "prenom", "equipe", "categorie", "genre", "licence", "paiement", "medical", "parent", "email", "telephone"
  ]];

  players.forEach((player) => {
    const team = teams.find((item) => item.id === player.teamId);
    rows.push([
      player.id,
      player.lastName,
      player.firstName,
      team?.name || "",
      player.category,
      player.gender,
      player.licenseStatus,
      player.paymentStatus,
      player.medicalStatus || "",
      player.parentName || "",
      player.parentEmail || player.email || "",
      player.parentPhone || "",
    ]);
  });

  return buildCsv(rows);
}

export function buildTeamsCsv(teams: ClubTeam[], players: ClubPlayer[]) {
  const rows: unknown[][] = [["id", "nom", "categorie", "genre", "niveau", "saison", "joueurs"]];
  teams.forEach((team) => {
    rows.push([
      team.id,
      team.name,
      team.category,
      team.gender,
      team.level,
      team.season,
      players.filter((player) => player.teamId === team.id).length,
    ]);
  });
  return buildCsv(rows);
}

export function buildCotisationsCsv(cotisations: PlayerCotisation[], players: ClubPlayer[]) {
  const rows: unknown[][] = [["id", "joueur", "saison", "montant", "paye", "reste", "statut", "echeance"]];
  cotisations.forEach((cotisation) => {
    const player = players.find((item) => item.id === cotisation.playerId);
    rows.push([
      cotisation.id,
      player ? `${player.lastName} ${player.firstName}` : "",
      cotisation.season,
      cotisation.amountCents / 100,
      cotisation.paidCents / 100,
      cotisation.remainingCents / 100,
      cotisation.status,
      cotisation.dueDate || "",
    ]);
  });
  return buildCsv(rows);
}

export async function getAuditExportWorkspace(clubId: string): Promise<{
  logs: ClubAuditLog[];
  bundle: ExportBundle;
}> {
  const [logs, bundle] = await Promise.all([
    listClubAuditLogs(clubId),
    getExportBundle(clubId),
  ]);

  return { logs, bundle };
}
