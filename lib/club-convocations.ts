// lib/club-convocations.ts
"use client";

import { createClient } from "@/lib/supabase/client";
import type { ClubEvent } from "@/lib/club-engine";
import type { ClubPlayer, ClubTeam } from "@/lib/club-core";
import { listClubEvents } from "@/lib/club-engine";
import { listClubPlayers, listClubTeams } from "@/lib/club-core";

export type EventRecipient = {
  id: string;
  clubId: string;
  eventId: string;
  playerId: string;
  teamId: string | null;
  recipientType: string;
  status: string;
  response: string | null;
  responseAt: string | null;
  sentAt: string | null;
};

export type EventAttendance = {
  id: string;
  clubId: string;
  eventId: string | null;
  teamId: string | null;
  playerId: string;
  status: string;
  note: string;
};

function sb() {
  return createClient();
}

function fail(error: any) {
  console.error("CLUB_CONVOCATIONS_ERROR", error);
  return new Error(error?.message || error?.details || error?.hint || "Erreur Supabase");
}

function rowToRecipient(row: any): EventRecipient {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    eventId: String(row.event_id),
    playerId: String(row.player_id),
    teamId: row.team_id ?? null,
    recipientType: row.recipient_type ?? "player",
    status: row.status ?? "pending",
    response: row.response ?? null,
    responseAt: row.response_at ?? null,
    sentAt: row.sent_at ?? null,
  };
}

function rowToAttendance(row: any): EventAttendance {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    eventId: row.event_id ?? null,
    teamId: row.team_id ?? null,
    playerId: String(row.player_id),
    status: row.status ?? "pending",
    note: row.note ?? "",
  };
}

export async function getConvocationWorkspace(clubId: string) {
  const [events, teams, players] = await Promise.all([
    listClubEvents({ clubId }),
    listClubTeams(clubId),
    listClubPlayers(clubId),
  ]);

  return { events, teams, players };
}

export async function listEventRecipients(clubId: string, eventId: string): Promise<EventRecipient[]> {
  const { data, error } = await sb()
    .from("club_event_recipients")
    .select("*")
    .eq("club_id", clubId)
    .eq("event_id", eventId)
    .order("created_at", { ascending: true });

  if (error) throw fail(error);
  return (data ?? []).map(rowToRecipient);
}

export async function listEventAttendances(clubId: string, eventId: string): Promise<EventAttendance[]> {
  const { data, error } = await sb()
    .from("club_attendances")
    .select("*")
    .eq("club_id", clubId)
    .eq("event_id", eventId);

  if (error) throw fail(error);
  return (data ?? []).map(rowToAttendance);
}

export async function generateEventRecipients(input: {
  clubId: string;
  eventId: string;
  teamId: string;
}): Promise<EventRecipient[]> {
  const players = await listClubPlayers(input.clubId, { teamId: input.teamId });

  if (!players.length) return [];

  const rows = players.map((player) => ({
    club_id: input.clubId,
    event_id: input.eventId,
    team_id: input.teamId,
    player_id: player.id,
    recipient_type: "player",
    status: "pending",
  }));

  const { data, error } = await sb()
    .from("club_event_recipients")
    .upsert(rows, { onConflict: "event_id,player_id,recipient_type" })
    .select("*");

  if (error) throw fail(error);
  return (data ?? []).map(rowToRecipient);
}

export async function markConvocationsSent(input: {
  clubId: string;
  eventId: string;
}): Promise<void> {
  const { error } = await sb()
    .from("club_event_recipients")
    .update({
      status: "sent",
      sent_at: new Date().toISOString(),
    })
    .eq("club_id", input.clubId)
    .eq("event_id", input.eventId);

  if (error) throw fail(error);
}

export async function updateRecipientResponse(input: {
  clubId: string;
  eventId: string;
  playerId: string;
  response: "present" | "absent" | "late" | "injured" | "excused";
}): Promise<EventRecipient> {
  const { data, error } = await sb()
    .from("club_event_recipients")
    .update({
      response: input.response,
      response_at: new Date().toISOString(),
      status: "responded",
    })
    .eq("club_id", input.clubId)
    .eq("event_id", input.eventId)
    .eq("player_id", input.playerId)
    .select("*")
    .single();

  if (error) throw fail(error);
  return rowToRecipient(data);
}

export async function saveEventAttendance(input: {
  clubId: string;
  eventId: string;
  teamId?: string | null;
  playerId: string;
  status: "present" | "absent" | "late" | "injured" | "excused";
  note?: string;
}): Promise<EventAttendance> {
  const { data, error } = await sb()
    .from("club_attendances")
    .upsert(
      {
        club_id: input.clubId,
        event_id: input.eventId,
        team_id: input.teamId || null,
        player_id: input.playerId,
        status: input.status,
        note: input.note || "",
      },
      { onConflict: "event_id,player_id" }
    )
    .select("*")
    .single();

  if (error) throw fail(error);
  return rowToAttendance(data);
}

export function getEventTeam(event: ClubEvent, teams: ClubTeam[]) {
  return teams.find((team) => team.id === event.teamId) || null;
}

export function getRecipientPlayer(recipient: EventRecipient, players: ClubPlayer[]) {
  return players.find((player) => player.id === recipient.playerId) || null;
}
