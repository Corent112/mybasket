// lib/club-communication-pro.ts
"use client";

import { createClient } from "@/lib/supabase/client";
import type { ClubCoach, ClubPlayer, ClubTeam } from "@/lib/club-core";
import { listClubCoaches, listClubPlayers, listClubTeams } from "@/lib/club-core";

export type CommunicationTarget = "players" | "parents" | "coaches" | "custom";

export type CommunicationFilters = {
  target: CommunicationTarget;
  teamId?: string | null;
  category?: string | null;
  gender?: string | null;
  paymentStatus?: string | null;
  licenseStatus?: string | null;
  medicalOnly?: boolean;
  mailingListId?: string | null;
};

export type CommunicationGroup = {
  id: string;
  clubId: string;
  name: string;
  description: string;
  filters: CommunicationFilters;
};

export type CommunicationCampaign = {
  id: string;
  clubId: string;
  groupId: string | null;
  title: string;
  subject: string;
  body: string;
  channel: string;
  status: string;
  filters: CommunicationFilters;
  recipientsCount: number;
  sentCount: number;
  failedCount: number;
  sentAt: string | null;
  createdAt: string | null;
};

export type CommunicationRecipient = {
  id: string;
  clubId: string;
  campaignId: string;
  playerId: string | null;
  coachId: string | null;
  userId: string | null;
  recipientType: string;
  name: string;
  email: string | null;
  status: string;
  error: string | null;
  sentAt: string | null;
};

export type ResolvedRecipient = {
  type: "player" | "parent" | "coach";
  playerId?: string | null;
  coachId?: string | null;
  userId?: string | null;
  name: string;
  email: string | null;
};

function sb() {
  return createClient();
}

function fail(error: any) {
  console.error("CLUB_COMMUNICATION_PRO_ERROR", error);
  return new Error(error?.message || error?.details || error?.hint || "Erreur Supabase");
}

function rowToGroup(row: any): CommunicationGroup {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    name: row.name ?? "",
    description: row.description ?? "",
    filters: (row.filters ?? { target: "players" }) as CommunicationFilters,
  };
}

function rowToCampaign(row: any): CommunicationCampaign {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    groupId: row.group_id ?? null,
    title: row.title ?? "",
    subject: row.subject ?? "",
    body: row.body ?? "",
    channel: row.channel ?? "email",
    status: row.status ?? "draft",
    filters: (row.filters ?? { target: "players" }) as CommunicationFilters,
    recipientsCount: Number(row.recipients_count) || 0,
    sentCount: Number(row.sent_count) || 0,
    failedCount: Number(row.failed_count) || 0,
    sentAt: row.sent_at ?? null,
    createdAt: row.created_at ?? null,
  };
}

function rowToRecipient(row: any): CommunicationRecipient {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    campaignId: String(row.campaign_id),
    playerId: row.player_id ?? null,
    coachId: row.coach_id ?? null,
    userId: row.user_id ?? null,
    recipientType: row.recipient_type ?? "player",
    name: row.name ?? "",
    email: row.email ?? null,
    status: row.status ?? "pending",
    error: row.error ?? null,
    sentAt: row.sent_at ?? null,
  };
}

export function resolveRecipients(input: {
  filters: CommunicationFilters;
  players: ClubPlayer[];
  coaches: ClubCoach[];
}): ResolvedRecipient[] {
  const filters = input.filters;

  if (filters.target === "custom") return [];

  if (filters.target === "coaches") {
    return input.coaches
      .filter((coach) => !filters.teamId || coach.teamIds.includes(filters.teamId))
      .map((coach) => ({
        type: "coach",
        coachId: coach.id,
        userId: coach.userId,
        name: coach.name,
        email: coach.email,
      }));
  }

  let players = input.players;

  if (filters.teamId) players = players.filter((p) => p.teamId === filters.teamId);
  if (filters.category) players = players.filter((p) => p.category === filters.category);
  if (filters.gender) players = players.filter((p) => p.gender === filters.gender);
  if (filters.paymentStatus) players = players.filter((p) => p.paymentStatus === filters.paymentStatus);
  if (filters.licenseStatus) players = players.filter((p) => p.licenseStatus === filters.licenseStatus);
  if (filters.medicalOnly) players = players.filter((p) => Boolean(p.medicalStatus));

  return players.map((player) => {
    if (filters.target === "parents") {
      return {
        type: "parent",
        playerId: player.id,
        name: player.parentName || `${player.firstName} ${player.lastName}`,
        email: player.parentEmail || player.email,
      };
    }

    return {
      type: "player",
      playerId: player.id,
      name: `${player.firstName} ${player.lastName}`,
      email: player.email || player.parentEmail,
    };
  });
}

export async function getCommunicationWorkspace(clubId: string): Promise<{
  groups: CommunicationGroup[];
  campaigns: CommunicationCampaign[];
  teams: ClubTeam[];
  players: ClubPlayer[];
  coaches: ClubCoach[];
}> {
  const supabase = sb();

  const [teams, players, coaches] = await Promise.all([
    listClubTeams(clubId),
    listClubPlayers(clubId),
    listClubCoaches(clubId),
  ]);

  const [{ data: groupRows, error: groupError }, { data: campaignRows, error: campaignError }] =
    await Promise.all([
      supabase
        .from("club_communication_groups")
        .select("*")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false }),
      supabase
        .from("club_communication_campaigns")
        .select("*")
        .eq("club_id", clubId)
        .order("created_at", { ascending: false }),
    ]);

  if (groupError) throw fail(groupError);
  if (campaignError) throw fail(campaignError);

  return {
    groups: (groupRows ?? []).map(rowToGroup),
    campaigns: (campaignRows ?? []).map(rowToCampaign),
    teams,
    players,
    coaches,
  };
}

export async function createCommunicationGroupPro(input: {
  clubId: string;
  name: string;
  description?: string;
  filters: CommunicationFilters;
}): Promise<CommunicationGroup> {
  const supabase = sb();
  const { data: userData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("club_communication_groups")
    .insert({
      club_id: input.clubId,
      name: input.name,
      description: input.description || "",
      filters: input.filters,
      created_by: userData.user?.id ?? null,
    })
    .select("*")
    .single();

  if (error) throw fail(error);
  return rowToGroup(data);
}

export async function deleteCommunicationGroupPro(
  clubId: string,
  groupId: string
): Promise<void> {
  const { error } = await sb()
    .from("club_communication_groups")
    .delete()
    .eq("id", groupId)
    .eq("club_id", clubId);

  if (error) throw fail(error);
}

async function replaceRecipients(input: {
  clubId: string;
  campaignId: string;
  recipients: ResolvedRecipient[];
}) {
  const supabase = sb();

  const { error: deleteError } = await supabase
    .from("club_communication_recipients")
    .delete()
    .eq("club_id", input.clubId)
    .eq("campaign_id", input.campaignId);

  if (deleteError) throw fail(deleteError);

  if (!input.recipients.length) return;

  const rows = input.recipients.map((recipient) => ({
    club_id: input.clubId,
    campaign_id: input.campaignId,
    player_id: recipient.playerId || null,
    coach_id: recipient.coachId || null,
    user_id: recipient.userId || null,
    recipient_type: recipient.type,
    name: recipient.name,
    email: recipient.email || null,
    status: recipient.email ? "pending" : "missing_email",
  }));

  const { error } = await supabase.from("club_communication_recipients").insert(rows);
  if (error) throw fail(error);
}

export async function createCommunicationCampaign(input: {
  clubId: string;
  groupId?: string | null;
  title: string;
  subject: string;
  body: string;
  filters: CommunicationFilters;
  recipients: ResolvedRecipient[];
}): Promise<CommunicationCampaign> {
  const supabase = sb();
  const { data: userData } = await supabase.auth.getUser();

  const { data: campaignRow, error: campaignError } = await supabase
    .from("club_communication_campaigns")
    .insert({
      club_id: input.clubId,
      group_id: input.groupId || null,
      title: input.title,
      subject: input.subject,
      body: input.body,
      filters: input.filters,
      recipients_count: input.recipients.length,
      status: "draft",
      created_by: userData.user?.id ?? null,
    })
    .select("*")
    .single();

  if (campaignError) throw fail(campaignError);

  await replaceRecipients({
    clubId: input.clubId,
    campaignId: campaignRow.id,
    recipients: input.recipients,
  });

  return rowToCampaign(campaignRow);
}

export async function updateCommunicationCampaign(input: {
  clubId: string;
  campaignId: string;
  title: string;
  subject: string;
  body: string;
  filters: CommunicationFilters;
  recipients: ResolvedRecipient[];
}): Promise<CommunicationCampaign> {
  const supabase = sb();

  const { data, error } = await supabase
    .from("club_communication_campaigns")
    .update({
      title: input.title,
      subject: input.subject,
      body: input.body,
      filters: input.filters,
      recipients_count: input.recipients.length,
      status: "draft",
    })
    .eq("id", input.campaignId)
    .eq("club_id", input.clubId)
    .select("*")
    .single();

  if (error) throw fail(error);

  await replaceRecipients({
    clubId: input.clubId,
    campaignId: input.campaignId,
    recipients: input.recipients,
  });

  return rowToCampaign(data);
}

export async function deleteCommunicationCampaign(
  clubId: string,
  campaignId: string
): Promise<void> {
  const supabase = sb();

  const { error: recipientsError } = await supabase
    .from("club_communication_recipients")
    .delete()
    .eq("club_id", clubId)
    .eq("campaign_id", campaignId);

  if (recipientsError) throw fail(recipientsError);

  const { error } = await supabase
    .from("club_communication_campaigns")
    .delete()
    .eq("id", campaignId)
    .eq("club_id", clubId);

  if (error) throw fail(error);
}

export async function listCampaignRecipients(
  clubId: string,
  campaignId: string
): Promise<CommunicationRecipient[]> {
  const { data, error } = await sb()
    .from("club_communication_recipients")
    .select("*")
    .eq("club_id", clubId)
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: true });

  if (error) throw fail(error);
  return (data ?? []).map(rowToRecipient);
}

export async function sendCommunicationCampaign(campaignId: string): Promise<void> {
  const response = await fetch("/api/club/communications/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ campaignId }),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    throw new Error(json?.error || "Campagne non envoyée.");
  }
}