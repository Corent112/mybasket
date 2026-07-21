// lib/club-performance-pro.ts
"use client";

import { createClient } from "@/lib/supabase/client";
import type { ClubPlayer, ClubTeam, ClubCoach } from "@/lib/club-core";
import { listClubPlayers, listClubTeams, listClubCoaches } from "@/lib/club-core";

export type ClubPerformanceDashboard = {
  clubId: string;
  clubName: string;
  city: string | null;
  playersCount: number;
  coachesCount: number;
  teamsCount: number;
  trainingSlotsCount: number;
  matchesCount: number;
  cotisationsExpectedCents: number;
  cotisationsPaidCents: number;
  cotisationsRemainingCents: number;
  missingLicensesCount: number;
  unpaidPlayersCount: number;
  medicalAlertsCount: number;
};

export type PlayerPerformancePro = {
  clubId: string;
  teamId: string | null;
  playerId: string;
  firstName: string;
  lastName: string;
  category: string | null;
  gender: string | null;
  status: string | null;
  licenseStatus: string | null;
  paymentStatus: string | null;
  medicalStatus: string | null;
  statLines: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  p2m: number;
  p2a: number;
  p3m: number;
  p3a: number;
  ftm: number;
  fta: number;
  efgPct: number;
  tsPct: number;
};

export type TeamPerformancePro = {
  clubId: string;
  teamId: string;
  teamName: string;
  category: string | null;
  gender: string | null;
  level: string | null;
  season: string | null;
  playersCount: number;
  matchesCount: number;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  turnovers: number;
  p2m: number;
  p2a: number;
  p3m: number;
  p3a: number;
  ftm: number;
  fta: number;
  licenseRate: number;
  paymentRate: number;
};

export type PerformanceAlert = {
  id: string;
  type: "license" | "payment" | "medical" | "attendance" | "activity";
  severity: "warning" | "danger" | "info";
  title: string;
  description: string;
  playerId?: string | null;
  teamId?: string | null;
};

function sb() {
  return createClient();
}

function fail(error: any) {
  console.error("CLUB_PERFORMANCE_PRO_ERROR", error);
  return new Error(error?.message || error?.details || error?.hint || "Erreur Supabase");
}

function rowToDashboard(row: any): ClubPerformanceDashboard {
  return {
    clubId: String(row.club_id),
    clubName: row.club_name ?? "",
    city: row.city ?? null,
    playersCount: Number(row.players_count) || 0,
    coachesCount: Number(row.coaches_count) || 0,
    teamsCount: Number(row.teams_count) || 0,
    trainingSlotsCount: Number(row.training_slots_count) || 0,
    matchesCount: Number(row.matches_count) || 0,
    cotisationsExpectedCents: Number(row.cotisations_expected_cents) || 0,
    cotisationsPaidCents: Number(row.cotisations_paid_cents) || 0,
    cotisationsRemainingCents: Number(row.cotisations_remaining_cents) || 0,
    missingLicensesCount: Number(row.missing_licenses_count) || 0,
    unpaidPlayersCount: Number(row.unpaid_players_count) || 0,
    medicalAlertsCount: Number(row.medical_alerts_count) || 0,
  };
}

function rowToPlayer(row: any): PlayerPerformancePro {
  return {
    clubId: String(row.club_id),
    teamId: row.team_id ?? null,
    playerId: String(row.player_id),
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    category: row.category ?? null,
    gender: row.gender ?? null,
    status: row.status ?? null,
    licenseStatus: row.license_status ?? null,
    paymentStatus: row.payment_status ?? null,
    medicalStatus: row.medical_status ?? null,
    statLines: Number(row.stat_lines) || 0,
    points: Number(row.points) || 0,
    rebounds: Number(row.rebounds) || 0,
    assists: Number(row.assists) || 0,
    steals: Number(row.steals) || 0,
    blocks: Number(row.blocks) || 0,
    turnovers: Number(row.turnovers) || 0,
    fouls: Number(row.fouls) || 0,
    p2m: Number(row.p2m) || 0,
    p2a: Number(row.p2a) || 0,
    p3m: Number(row.p3m) || 0,
    p3a: Number(row.p3a) || 0,
    ftm: Number(row.ftm) || 0,
    fta: Number(row.fta) || 0,
    efgPct: Number(row.efg_pct) || 0,
    tsPct: Number(row.ts_pct) || 0,
  };
}

function rowToTeam(row: any): TeamPerformancePro {
  return {
    clubId: String(row.club_id),
    teamId: String(row.team_id),
    teamName: row.team_name ?? "",
    category: row.category ?? null,
    gender: row.gender ?? null,
    level: row.level ?? null,
    season: row.season ?? null,
    playersCount: Number(row.players_count) || 0,
    matchesCount: Number(row.matches_count) || 0,
    points: Number(row.points) || 0,
    rebounds: Number(row.rebounds) || 0,
    assists: Number(row.assists) || 0,
    steals: Number(row.steals) || 0,
    turnovers: Number(row.turnovers) || 0,
    p2m: Number(row.p2m) || 0,
    p2a: Number(row.p2a) || 0,
    p3m: Number(row.p3m) || 0,
    p3a: Number(row.p3a) || 0,
    ftm: Number(row.ftm) || 0,
    fta: Number(row.fta) || 0,
    licenseRate: Number(row.license_rate) || 0,
    paymentRate: Number(row.payment_rate) || 0,
  };
}

export async function loadPerformanceDashboard(clubId: string): Promise<ClubPerformanceDashboard | null> {
  const { data, error } = await sb()
    .from("club_dashboard_performance_pro")
    .select("*")
    .eq("club_id", clubId)
    .maybeSingle();

  if (error) throw fail(error);
  return data ? rowToDashboard(data) : null;
}

export async function loadTeamPerformancePro(clubId: string): Promise<TeamPerformancePro[]> {
  const { data, error } = await sb()
    .from("club_team_performance_pro")
    .select("*")
    .eq("club_id", clubId)
    .order("team_name", { ascending: true });

  if (error) throw fail(error);
  return (data ?? []).map(rowToTeam);
}

export async function loadPlayerPerformancePro(clubId: string, filters?: {
  teamId?: string;
  category?: string;
  gender?: string;
}): Promise<PlayerPerformancePro[]> {
  let query = sb()
    .from("club_player_performance_pro")
    .select("*")
    .eq("club_id", clubId)
    .order("points", { ascending: false });

  if (filters?.teamId) query = query.eq("team_id", filters.teamId);
  if (filters?.category) query = query.eq("category", filters.category);
  if (filters?.gender) query = query.eq("gender", filters.gender);

  const { data, error } = await query;
  if (error) throw fail(error);
  return (data ?? []).map(rowToPlayer);
}

export function computePerformanceAlerts(input: {
  players: ClubPlayer[];
  teams: ClubTeam[];
  playerPerformance: PlayerPerformancePro[];
}): PerformanceAlert[] {
  const alerts: PerformanceAlert[] = [];

  input.players.forEach((player) => {
    if (!["valid", "ok"].includes(player.licenseStatus)) {
      alerts.push({
        id: `license-${player.id}`,
        type: "license",
        severity: "danger",
        title: "Licence à régulariser",
        description: `${player.firstName} ${player.lastName} n’a pas une licence validée.`,
        playerId: player.id,
        teamId: player.teamId,
      });
    }

    if (!["paid", "ok"].includes(player.paymentStatus)) {
      alerts.push({
        id: `payment-${player.id}`,
        type: "payment",
        severity: "warning",
        title: "Cotisation non soldée",
        description: `${player.firstName} ${player.lastName} n’est pas indiqué comme payé.`,
        playerId: player.id,
        teamId: player.teamId,
      });
    }

    if (player.medicalStatus) {
      alerts.push({
        id: `medical-${player.id}`,
        type: "medical",
        severity: "info",
        title: "Info médicale",
        description: `${player.firstName} ${player.lastName} : ${player.medicalStatus}.`,
        playerId: player.id,
        teamId: player.teamId,
      });
    }
  });

  input.teams.forEach((team) => {
    const hasStats = input.playerPerformance.some((row) => row.teamId === team.id && row.statLines > 0);
    if (!hasStats) {
      alerts.push({
        id: `activity-${team.id}`,
        type: "activity",
        severity: "info",
        title: "Aucune statistique match",
        description: `${team.name} n’a pas encore de stats match enregistrées.`,
        teamId: team.id,
      });
    }
  });

  return alerts.slice(0, 80);
}

export async function getPerformanceWorkspace(clubId: string): Promise<{
  dashboard: ClubPerformanceDashboard | null;
  teams: ClubTeam[];
  coaches: ClubCoach[];
  players: ClubPlayer[];
  teamPerformance: TeamPerformancePro[];
  playerPerformance: PlayerPerformancePro[];
  alerts: PerformanceAlert[];
}> {
  const [dashboard, teams, coaches, players, teamPerformance, playerPerformance] = await Promise.all([
    loadPerformanceDashboard(clubId),
    listClubTeams(clubId),
    listClubCoaches(clubId),
    listClubPlayers(clubId),
    loadTeamPerformancePro(clubId),
    loadPlayerPerformancePro(clubId),
  ]);

  const alerts = computePerformanceAlerts({ players, teams, playerPerformance });

  return {
    dashboard,
    teams,
    coaches,
    players,
    teamPerformance,
    playerPerformance,
    alerts,
  };
}
