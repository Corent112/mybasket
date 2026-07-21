// lib/club-notifications-center.ts
"use client";

import { createClient } from "@/lib/supabase/client";
import type { ClubPlayer, ClubTeam, ClubCoach } from "@/lib/club-core";
import { listClubPlayers, listClubTeams, listClubCoaches } from "@/lib/club-core";

export type ClubNotificationCenterItem = {
  id: string;
  clubId: string;
  userId: string | null;
  type: string;
  title: string;
  message: string;
  status: string;
  priority: string;
  actionUrl: string | null;
  relatedPlayerId: string | null;
  relatedTeamId: string | null;
  relatedCoachId: string | null;
  createdAt: string | null;
};

export type ClubTask = {
  id: string;
  clubId: string;
  assignedTo: string | null;
  relatedPlayerId: string | null;
  relatedTeamId: string | null;
  relatedCoachId: string | null;
  title: string;
  description: string;
  priority: string;
  status: string;
  dueDate: string | null;
  createdAt: string | null;
};

function sb() {
  return createClient();
}

function fail(error: any) {
  console.error("CLUB_NOTIFICATIONS_CENTER_ERROR", error);
  return new Error(error?.message || error?.details || error?.hint || "Erreur Supabase");
}

function rowToNotification(row: any): ClubNotificationCenterItem {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    userId: row.user_id ?? null,
    type: row.type ?? "info",
    title: row.title ?? "",
    message: row.message ?? "",
    status: row.status ?? "unread",
    priority: row.priority ?? "normal",
    actionUrl: row.action_url ?? null,
    relatedPlayerId: row.related_player_id ?? null,
    relatedTeamId: row.related_team_id ?? null,
    relatedCoachId: row.related_coach_id ?? null,
    createdAt: row.created_at ?? null,
  };
}

function rowToTask(row: any): ClubTask {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    assignedTo: row.assigned_to ?? null,
    relatedPlayerId: row.related_player_id ?? null,
    relatedTeamId: row.related_team_id ?? null,
    relatedCoachId: row.related_coach_id ?? null,
    title: row.title ?? "",
    description: row.description ?? "",
    priority: row.priority ?? "normal",
    status: row.status ?? "todo",
    dueDate: row.due_date ?? null,
    createdAt: row.created_at ?? null,
  };
}

export async function listClubNotificationsCenter(clubId: string): Promise<ClubNotificationCenterItem[]> {
  const { data, error } = await sb()
    .from("club_notifications")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });

  if (error) throw fail(error);
  return (data ?? []).map(rowToNotification);
}

export async function createClubNotificationCenter(input: {
  clubId: string;
  title: string;
  message: string;
  type?: string;
  priority?: string;
  actionUrl?: string | null;
  relatedPlayerId?: string | null;
  relatedTeamId?: string | null;
  relatedCoachId?: string | null;
}): Promise<ClubNotificationCenterItem> {
  const { data, error } = await sb()
    .from("club_notifications")
    .insert({
      club_id: input.clubId,
      title: input.title,
      message: input.message,
      type: input.type || "info",
      priority: input.priority || "normal",
      status: "unread",
      action_url: input.actionUrl || null,
      related_player_id: input.relatedPlayerId || null,
      related_team_id: input.relatedTeamId || null,
      related_coach_id: input.relatedCoachId || null,
    })
    .select("*")
    .single();

  if (error) throw fail(error);
  return rowToNotification(data);
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await sb()
    .from("club_notifications")
    .update({ status: "read" })
    .eq("id", id);

  if (error) throw fail(error);
}

export async function listClubTasks(clubId: string): Promise<ClubTask[]> {
  const { data, error } = await sb()
    .from("club_tasks")
    .select("*")
    .eq("club_id", clubId)
    .order("due_date", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw fail(error);
  return (data ?? []).map(rowToTask);
}

export async function createClubTask(input: {
  clubId: string;
  title: string;
  description?: string;
  priority?: string;
  dueDate?: string | null;
  relatedPlayerId?: string | null;
  relatedTeamId?: string | null;
  relatedCoachId?: string | null;
}): Promise<ClubTask> {
  const supabase = sb();
  const { data: userData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("club_tasks")
    .insert({
      club_id: input.clubId,
      title: input.title,
      description: input.description || "",
      priority: input.priority || "normal",
      due_date: input.dueDate || null,
      related_player_id: input.relatedPlayerId || null,
      related_team_id: input.relatedTeamId || null,
      related_coach_id: input.relatedCoachId || null,
      created_by: userData.user?.id ?? null,
    })
    .select("*")
    .single();

  if (error) throw fail(error);
  return rowToTask(data);
}

export async function updateClubTaskStatus(id: string, status: "todo" | "doing" | "done" | "archived"): Promise<void> {
  const { error } = await sb()
    .from("club_tasks")
    .update({ status })
    .eq("id", id);

  if (error) throw fail(error);
}

export async function generateClubSystemAlerts(clubId: string): Promise<ClubNotificationCenterItem[]> {
  const [players, teams, coaches] = await Promise.all([
    listClubPlayers(clubId),
    listClubTeams(clubId),
    listClubCoaches(clubId),
  ]);

  const created: ClubNotificationCenterItem[] = [];

  for (const player of players) {
    if (!["valid", "ok"].includes(player.licenseStatus)) {
      const item = await createClubNotificationCenter({
        clubId,
        title: "Licence à vérifier",
        message: `${player.firstName} ${player.lastName} n'a pas une licence validée.`,
        type: "license",
        priority: "high",
        relatedPlayerId: player.id,
        relatedTeamId: player.teamId,
      });
      created.push(item);
    }

    if (!["paid", "ok"].includes(player.paymentStatus)) {
      const item = await createClubNotificationCenter({
        clubId,
        title: "Paiement à suivre",
        message: `${player.firstName} ${player.lastName} n'est pas indiqué comme payé.`,
        type: "payment",
        priority: "normal",
        relatedPlayerId: player.id,
        relatedTeamId: player.teamId,
      });
      created.push(item);
    }
  }

  for (const team of teams) {
    const teamPlayers = players.filter((player) => player.teamId === team.id);
    if (!teamPlayers.length) {
      const item = await createClubNotificationCenter({
        clubId,
        title: "Équipe sans joueur",
        message: `${team.name} n'a encore aucun joueur affecté.`,
        type: "team",
        priority: "normal",
        relatedTeamId: team.id,
      });
      created.push(item);
    }
  }

  if (!coaches.length) {
    const item = await createClubNotificationCenter({
      clubId,
      title: "Aucun coach",
      message: "Aucun coach n'est encore enregistré dans le club.",
      type: "coach",
      priority: "high",
    });
    created.push(item);
  }

  return created;
}

export async function getNotificationsWorkspace(clubId: string): Promise<{
  notifications: ClubNotificationCenterItem[];
  tasks: ClubTask[];
  players: ClubPlayer[];
  teams: ClubTeam[];
  coaches: ClubCoach[];
}> {
  const [notifications, tasks, players, teams, coaches] = await Promise.all([
    listClubNotificationsCenter(clubId),
    listClubTasks(clubId),
    listClubPlayers(clubId),
    listClubTeams(clubId),
    listClubCoaches(clubId),
  ]);

  return { notifications, tasks, players, teams, coaches };
}
