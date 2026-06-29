// lib/club-mailing-lists.ts
"use client";

import { createClient } from "@/lib/supabase/client";
import type { ClubCoach, ClubPlayer, ClubTeam } from "@/lib/club-core";
import { listClubCoaches, listClubPlayers, listClubTeams } from "@/lib/club-core";

export type MailingList = {
  id: string;
  clubId: string;
  name: string;
  description: string;
  color: string;
  membersCount?: number;
};

export type MailingListMember = {
  id: string;
  clubId: string;
  listId: string;
  memberType: "player" | "parent" | "coach" | "member" | "custom";
  playerId: string | null;
  coachId: string | null;
  userId: string | null;
  displayName: string;
  email: string;
  phone: string;
};

export type MessageTemplate = {
  id: string;
  clubId: string;
  templateKey: string;
  name: string;
  subject: string;
  body: string;
  category: string;
  status: string;
};

export type RecipientCandidate = {
  id: string;
  type: "player" | "parent" | "coach" | "custom";
  name: string;
  email: string;
  playerId?: string | null;
  coachId?: string | null;
  userId?: string | null;
  teamId?: string | null;
  teamName?: string | null;
};

function sb() {
  return createClient();
}

function fail(context: string, error: any): never {
  console.error(context, error);
  throw new Error(error?.message || error?.details || error?.hint || error?.code || context);
}

function rowToList(row: any): MailingList {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    name: row.name ?? "",
    description: row.description ?? "",
    color: row.color ?? "#6B1A2C",
    membersCount: Number(row.members_count) || 0,
  };
}

function rowToMember(row: any): MailingListMember {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    listId: String(row.list_id),
    memberType: row.member_type ?? "custom",
    playerId: row.player_id ?? null,
    coachId: row.coach_id ?? null,
    userId: row.user_id ?? null,
    displayName: row.display_name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
  };
}

function rowToTemplate(row: any): MessageTemplate {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    templateKey: row.template_key ?? "custom",
    name: row.name ?? "",
    subject: row.subject ?? "",
    body: row.body ?? "",
    category: row.category ?? "general",
    status: row.status ?? "active",
  };
}

export async function listMailingLists(clubId: string): Promise<MailingList[]> {
  const { data, error } = await sb()
    .from("club_mailing_lists")
    .select("*, club_mailing_list_members(count)")
    .eq("club_id", clubId)
    .order("name", { ascending: true });

  if (error) fail("LIST_MAILING_LISTS_ERROR", error);

  return (data ?? []).map((row: any) => ({
    ...rowToList(row),
    membersCount: row.club_mailing_list_members?.[0]?.count ?? 0,
  }));
}

export async function createMailingList(input: {
  clubId: string;
  name: string;
  description?: string;
  color?: string;
}): Promise<MailingList> {
  const supabase = sb();
  const { data: userData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("club_mailing_lists")
    .insert({
      club_id: input.clubId,
      name: input.name,
      description: input.description || "",
      color: input.color || "#6B1A2C",
      created_by: userData.user?.id ?? null,
    })
    .select("*")
    .single();

  if (error) fail("CREATE_MAILING_LIST_ERROR", error);
  return rowToList(data);
}

export async function updateMailingList(
  clubId: string,
  listId: string,
  patch: Partial<Pick<MailingList, "name" | "description" | "color">>
): Promise<MailingList> {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.description !== undefined) payload.description = patch.description;
  if (patch.color !== undefined) payload.color = patch.color;

  const { data, error } = await sb()
    .from("club_mailing_lists")
    .update(payload)
    .eq("club_id", clubId)
    .eq("id", listId)
    .select("*")
    .single();

  if (error) fail("UPDATE_MAILING_LIST_ERROR", error);
  return rowToList(data);
}

export async function deleteMailingList(clubId: string, listId: string): Promise<void> {
  const { error } = await sb()
    .from("club_mailing_lists")
    .delete()
    .eq("club_id", clubId)
    .eq("id", listId);

  if (error) fail("DELETE_MAILING_LIST_ERROR", error);
}

export async function listMailingListMembers(clubId: string, listId: string): Promise<MailingListMember[]> {
  const { data, error } = await sb()
    .from("club_mailing_list_members")
    .select("*")
    .eq("club_id", clubId)
    .eq("list_id", listId)
    .order("display_name", { ascending: true });

  if (error) fail("LIST_MAILING_LIST_MEMBERS_ERROR", error);
  return (data ?? []).map(rowToMember);
}

export async function addMailingListMembers(input: {
  clubId: string;
  listId: string;
  members: RecipientCandidate[];
}): Promise<void> {
  if (!input.members.length) return;

  const rows = input.members.map((member) => ({
    club_id: input.clubId,
    list_id: input.listId,
    member_type: member.type,
    player_id: member.playerId || null,
    coach_id: member.coachId || null,
    user_id: member.userId || null,
    display_name: member.name,
    email: member.email,
    phone: "",
  }));

  const { error } = await sb().from("club_mailing_list_members").insert(rows);
  if (error) fail("ADD_MAILING_LIST_MEMBERS_ERROR", error);
}

export async function removeMailingListMember(clubId: string, memberId: string): Promise<void> {
  const { error } = await sb()
    .from("club_mailing_list_members")
    .delete()
    .eq("club_id", clubId)
    .eq("id", memberId);

  if (error) fail("REMOVE_MAILING_LIST_MEMBER_ERROR", error);
}

export async function listMessageTemplates(clubId: string, category?: string): Promise<MessageTemplate[]> {
  let query = sb()
    .from("club_message_templates")
    .select("*")
    .eq("club_id", clubId)
    .neq("status", "deleted")
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (category) query = query.eq("category", category);

  const { data, error } = await query;
  if (error) fail("LIST_MESSAGE_TEMPLATES_ERROR", error);
  return (data ?? []).map(rowToTemplate);
}

export async function createMessageTemplate(input: {
  clubId: string;
  name: string;
  subject: string;
  body: string;
  category: string;
}): Promise<MessageTemplate> {
  const supabase = sb();
  const { data: userData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("club_message_templates")
    .insert({
      club_id: input.clubId,
      template_key: "custom",
      name: input.name,
      subject: input.subject,
      body: input.body,
      category: input.category,
      created_by: userData.user?.id ?? null,
    })
    .select("*")
    .single();

  if (error) fail("CREATE_MESSAGE_TEMPLATE_ERROR", error);
  return rowToTemplate(data);
}

export async function updateMessageTemplate(
  templateId: string,
  patch: Partial<Pick<MessageTemplate, "name" | "subject" | "body" | "category" | "status">>
): Promise<MessageTemplate> {
  const { data, error } = await sb()
    .from("club_message_templates")
    .update(patch)
    .eq("id", templateId)
    .select("*")
    .single();

  if (error) fail("UPDATE_MESSAGE_TEMPLATE_ERROR", error);
  return rowToTemplate(data);
}

export async function deleteMessageTemplate(templateId: string): Promise<void> {
  const { error } = await sb()
    .from("club_message_templates")
    .update({ status: "deleted" })
    .eq("id", templateId);

  if (error) fail("DELETE_MESSAGE_TEMPLATE_ERROR", error);
}

export function buildRecipientCandidates(input: {
  players: ClubPlayer[];
  coaches: ClubCoach[];
  teams: ClubTeam[];
}): RecipientCandidate[] {
  const teamName = (teamId?: string | null) => input.teams.find((team) => team.id === teamId)?.name || null;
  const rows: RecipientCandidate[] = [];

  input.players.forEach((player) => {
    if (player.email) {
      rows.push({
        id: `player-${player.id}`,
        type: "player",
        name: `${player.firstName} ${player.lastName}`,
        email: player.email,
        playerId: player.id,
        teamId: player.teamId,
        teamName: teamName(player.teamId),
      });
    }

    if (player.parentEmail) {
      rows.push({
        id: `parent-${player.id}`,
        type: "parent",
        name: player.parentName || `Parent ${player.firstName} ${player.lastName}`,
        email: player.parentEmail,
        playerId: player.id,
        teamId: player.teamId,
        teamName: teamName(player.teamId),
      });
    }
  });

  input.coaches.forEach((coach) => {
    if (coach.email) {
      rows.push({
        id: `coach-${coach.id}`,
        type: "coach",
        name: coach.name,
        email: coach.email,
        coachId: coach.id,
        userId: coach.userId,
      });
    }
  });

  return rows;
}

export async function getMailingWorkspace(clubId: string): Promise<{
  lists: MailingList[];
  templates: MessageTemplate[];
  players: ClubPlayer[];
  coaches: ClubCoach[];
  teams: ClubTeam[];
  candidates: RecipientCandidate[];
}> {
  const [lists, templates, players, coaches, teams] = await Promise.all([
    listMailingLists(clubId),
    listMessageTemplates(clubId),
    listClubPlayers(clubId),
    listClubCoaches(clubId),
    listClubTeams(clubId),
  ]);

  return {
    lists,
    templates,
    players,
    coaches,
    teams,
    candidates: buildRecipientCandidates({ players, coaches, teams }),
  };
}

export function renderTemplate(text: string, values: Record<string, string | number | null | undefined>) {
  let output = text;
  Object.entries(values).forEach(([key, value]) => {
    output = output.replaceAll(`{${key}}`, String(value ?? ""));
  });
  return output;
}
