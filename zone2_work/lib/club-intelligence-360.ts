// lib/club-intelligence-360.ts
"use client";

import { createClient } from "@/lib/supabase/client";
import type { ClubCoach, ClubPlayer, ClubTeam } from "@/lib/club-core";
import { listClubCoaches, listClubPlayers, listClubTeams } from "@/lib/club-core";
import { listClubNotificationsCenter, listClubTasks, type ClubNotificationCenterItem, type ClubTask } from "@/lib/club-notifications-center";

export type ClubIntelligence360 = {
  clubId: string;
  clubName: string;
  city: string | null;
  playersCount: number;
  coachesCount: number;
  teamsCount: number;
  documentsCount: number;
  eventsCount: number;
  slotsCount: number;
  validLicensesCount: number;
  paidPlayersCount: number;
  medicalAlertsCount: number;
  cotisationsExpectedCents: number;
  cotisationsPaidCents: number;
  cotisationsRemainingCents: number;
  incomeCents: number;
  expenseCents: number;
  unreadNotificationsCount: number;
  openTasksCount: number;
  licenseRate: number;
  paymentRate: number;
};

export type TeamHealth360 = {
  clubId: string;
  teamId: string;
  teamName: string;
  category: string | null;
  gender: string | null;
  level: string | null;
  season: string | null;
  playersCount: number;
  validLicensesCount: number;
  paidPlayersCount: number;
  slotsCount: number;
  eventsCount: number;
  licenseRate: number;
  paymentRate: number;
};

export type IntelligenceInsight = {
  id: string;
  type: "success" | "warning" | "danger" | "info";
  title: string;
  description: string;
  scoreImpact: number;
};

function sb() {
  return createClient();
}

function fail(error: any) {
  console.error("CLUB_INTELLIGENCE_360_ERROR", error);
  return new Error(error?.message || error?.details || error?.hint || "Erreur Supabase");
}

function rowToIntel(row: any): ClubIntelligence360 {
  return {
    clubId: String(row.club_id),
    clubName: row.club_name ?? "",
    city: row.city ?? null,
    playersCount: Number(row.players_count) || 0,
    coachesCount: Number(row.coaches_count) || 0,
    teamsCount: Number(row.teams_count) || 0,
    documentsCount: Number(row.documents_count) || 0,
    eventsCount: Number(row.events_count) || 0,
    slotsCount: Number(row.slots_count) || 0,
    validLicensesCount: Number(row.valid_licenses_count) || 0,
    paidPlayersCount: Number(row.paid_players_count) || 0,
    medicalAlertsCount: Number(row.medical_alerts_count) || 0,
    cotisationsExpectedCents: Number(row.cotisations_expected_cents) || 0,
    cotisationsPaidCents: Number(row.cotisations_paid_cents) || 0,
    cotisationsRemainingCents: Number(row.cotisations_remaining_cents) || 0,
    incomeCents: Number(row.income_cents) || 0,
    expenseCents: Number(row.expense_cents) || 0,
    unreadNotificationsCount: Number(row.unread_notifications_count) || 0,
    openTasksCount: Number(row.open_tasks_count) || 0,
    licenseRate: Number(row.license_rate) || 0,
    paymentRate: Number(row.payment_rate) || 0,
  };
}

function rowToTeam(row: any): TeamHealth360 {
  return {
    clubId: String(row.club_id),
    teamId: String(row.team_id),
    teamName: row.team_name ?? "",
    category: row.category ?? null,
    gender: row.gender ?? null,
    level: row.level ?? null,
    season: row.season ?? null,
    playersCount: Number(row.players_count) || 0,
    validLicensesCount: Number(row.valid_licenses_count) || 0,
    paidPlayersCount: Number(row.paid_players_count) || 0,
    slotsCount: Number(row.slots_count) || 0,
    eventsCount: Number(row.events_count) || 0,
    licenseRate: Number(row.license_rate) || 0,
    paymentRate: Number(row.payment_rate) || 0,
  };
}

export async function loadClubIntelligence360(clubId: string): Promise<ClubIntelligence360 | null> {
  const { data, error } = await sb()
    .from("club_intelligence_360")
    .select("*")
    .eq("club_id", clubId)
    .maybeSingle();

  if (error) throw fail(error);
  return data ? rowToIntel(data) : null;
}

export async function loadTeamHealth360(clubId: string): Promise<TeamHealth360[]> {
  const { data, error } = await sb()
    .from("club_team_health_360")
    .select("*")
    .eq("club_id", clubId)
    .order("team_name", { ascending: true });

  if (error) throw fail(error);
  return (data ?? []).map(rowToTeam);
}

export function computeClubHealthScore(input: {
  intelligence: ClubIntelligence360 | null;
  teams: TeamHealth360[];
  players: ClubPlayer[];
  coaches: ClubCoach[];
}) {
  if (!input.intelligence) return 0;

  let score = 100;

  if (input.intelligence.licenseRate < 90) score -= 15;
  if (input.intelligence.paymentRate < 85) score -= 15;
  if (input.intelligence.coachesCount < Math.max(1, Math.ceil(input.intelligence.teamsCount / 2))) score -= 12;
  if (input.intelligence.medicalAlertsCount > 0) score -= Math.min(10, input.intelligence.medicalAlertsCount * 2);
  if (input.intelligence.unreadNotificationsCount > 10) score -= 8;
  if (input.intelligence.openTasksCount > 10) score -= 8;
  if (input.teams.some((team) => team.playersCount === 0)) score -= 10;
  if (input.teams.some((team) => team.playersCount > 15)) score -= 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

export function computeInsights(input: {
  intelligence: ClubIntelligence360 | null;
  teamHealth: TeamHealth360[];
  players: ClubPlayer[];
  coaches: ClubCoach[];
  notifications: ClubNotificationCenterItem[];
  tasks: ClubTask[];
}): IntelligenceInsight[] {
  const i = input.intelligence;
  const insights: IntelligenceInsight[] = [];

  if (!i) return insights;

  if (i.licenseRate >= 90) {
    insights.push({
      id: "license-good",
      type: "success",
      title: "Licences bien avancées",
      description: `${i.licenseRate}% des licences sont validées.`,
      scoreImpact: 8,
    });
  } else {
    insights.push({
      id: "license-low",
      type: "danger",
      title: "Licences à finaliser",
      description: `${i.playersCount - i.validLicensesCount} joueur(s) ont une licence à régulariser.`,
      scoreImpact: -15,
    });
  }

  if (i.paymentRate < 85) {
    insights.push({
      id: "payment-low",
      type: "warning",
      title: "Paiements à suivre",
      description: `${i.playersCount - i.paidPlayersCount} joueur(s) ne sont pas indiqués comme payés.`,
      scoreImpact: -15,
    });
  }

  if (i.cotisationsRemainingCents > 0) {
    insights.push({
      id: "remaining-money",
      type: "info",
      title: "Reste à encaisser",
      description: `Il reste ${(i.cotisationsRemainingCents / 100).toLocaleString("fr-FR")} € de cotisations à encaisser.`,
      scoreImpact: -5,
    });
  }

  const teamsWithoutPlayers = input.teamHealth.filter((team) => team.playersCount === 0);
  if (teamsWithoutPlayers.length) {
    insights.push({
      id: "empty-teams",
      type: "warning",
      title: "Équipes sans joueur",
      description: `${teamsWithoutPlayers.length} équipe(s) n’ont pas encore d’effectif.`,
      scoreImpact: -10,
    });
  }

  const overloadedTeams = input.teamHealth.filter((team) => team.playersCount > 15);
  if (overloadedTeams.length) {
    insights.push({
      id: "overloaded-teams",
      type: "warning",
      title: "Effectifs chargés",
      description: `${overloadedTeams.length} équipe(s) dépassent 15 joueurs.`,
      scoreImpact: -5,
    });
  }

  if (!input.coaches.length) {
    insights.push({
      id: "no-coach",
      type: "danger",
      title: "Aucun coach enregistré",
      description: "Le club n’a encore aucun coach actif.",
      scoreImpact: -12,
    });
  }

  if (i.openTasksCount > 0) {
    insights.push({
      id: "open-tasks",
      type: "info",
      title: "Tâches ouvertes",
      description: `${i.openTasksCount} tâche(s) restent à traiter.`,
      scoreImpact: -3,
    });
  }

  if (i.eventsCount === 0) {
    insights.push({
      id: "no-events",
      type: "info",
      title: "Calendrier vide",
      description: "Aucun événement club n’est encore enregistré.",
      scoreImpact: -5,
    });
  }

  return insights.slice(0, 12);
}

export async function getIntelligenceWorkspace(clubId: string): Promise<{
  intelligence: ClubIntelligence360 | null;
  teamHealth: TeamHealth360[];
  players: ClubPlayer[];
  teams: ClubTeam[];
  coaches: ClubCoach[];
  notifications: ClubNotificationCenterItem[];
  tasks: ClubTask[];
  score: number;
  insights: IntelligenceInsight[];
}> {
  const [intelligence, teamHealth, players, teams, coaches, notifications, tasks] = await Promise.all([
    loadClubIntelligence360(clubId),
    loadTeamHealth360(clubId),
    listClubPlayers(clubId),
    listClubTeams(clubId),
    listClubCoaches(clubId),
    listClubNotificationsCenter(clubId),
    listClubTasks(clubId),
  ]);

  const score = computeClubHealthScore({ intelligence, teams: teamHealth, players, coaches });
  const insights = computeInsights({ intelligence, teamHealth, players, coaches, notifications, tasks });

  return {
    intelligence,
    teamHealth,
    players,
    teams,
    coaches,
    notifications,
    tasks,
    score,
    insights,
  };
}
