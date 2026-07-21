// lib/club-engine.ts
"use client";

import { createClient } from "@/lib/supabase/client";
import type { Slot } from "@/lib/creneaux-supabase";

export type ClubEvent = {
  id: string;
  clubId: string;
  teamId: string | null;
  coachId: string | null;
  gymnaseId: string | null;
  trainingSlotId: string | null;
  title: string;
  description: string;
  eventType: string;
  eventDate: string;
  day: number | null;
  startMin: number | null;
  endMin: number | null;
  allDay: boolean;
  location: string;
  status: string;
  source: string;
};

export type EventRecipientInput = {
  recipientType: "team" | "coach" | "player" | "parent";
  teamId?: string | null;
  coachId?: string | null;
  playerId?: string | null;
  userId?: string | null;
  email?: string | null;
};

export type ScheduleConflict = {
  type: "gymnase" | "coach" | "team" | "availability" | "event";
  severity: "warning" | "blocking";
  message: string;
  relatedId?: string | null;
};

export type SlotWithEngine = Slot & {
  teamId?: string | null;
  coachId?: string | null;
  slotType?: string | null;
  notes?: string | null;
  locked?: boolean | null;
};

function sb() {
  return createClient();
}

function normalizeError(error: any) {
  console.error("CLUB_ENGINE_ERROR", error);
  return new Error(error?.message || error?.details || error?.hint || "Erreur Supabase");
}

function overlap(aStart: number, aEnd: number, bStart: number, bEnd: number) {
  return aStart < bEnd && bStart < aEnd;
}

function rowToEvent(row: any): ClubEvent {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    teamId: row.team_id ?? null,
    coachId: row.coach_id ?? null,
    gymnaseId: row.gymnase_id ?? null,
    trainingSlotId: row.training_slot_id ?? null,
    title: row.title ?? "",
    description: row.description ?? "",
    eventType: row.event_type ?? "training",
    eventDate: row.event_date,
    day: row.day ?? null,
    startMin: row.start_min ?? null,
    endMin: row.end_min ?? null,
    allDay: Boolean(row.all_day),
    location: row.location ?? "",
    status: row.status ?? "scheduled",
    source: row.source ?? "manual",
  };
}

export async function listClubEvents(params: {
  clubId: string;
  startDate?: string;
  endDate?: string;
  teamId?: string;
  coachId?: string;
}): Promise<ClubEvent[]> {
  const supabase = sb();

  let query = supabase
    .from("club_events")
    .select("*")
    .eq("club_id", params.clubId)
    .order("event_date", { ascending: true })
    .order("start_min", { ascending: true });

  if (params.startDate) query = query.gte("event_date", params.startDate);
  if (params.endDate) query = query.lte("event_date", params.endDate);
  if (params.teamId) query = query.eq("team_id", params.teamId);
  if (params.coachId) query = query.eq("coach_id", params.coachId);

  const { data, error } = await query;
  if (error) throw normalizeError(error);

  return (data ?? []).map(rowToEvent);
}

export async function replaceEventRecipients(input: {
  clubId: string;
  eventId: string;
  recipients: EventRecipientInput[];
}): Promise<void> {
  const supabase = sb();

  const { error: deleteError } = await supabase
    .from("club_event_recipients")
    .delete()
    .eq("club_id", input.clubId)
    .eq("event_id", input.eventId);

  if (deleteError) throw normalizeError(deleteError);
  if (!input.recipients.length) return;

  const rows = input.recipients.map((recipient) => ({
    club_id: input.clubId,
    event_id: input.eventId,
    recipient_type: recipient.recipientType,
    team_id: recipient.teamId || null,
    coach_id: recipient.coachId || null,
    player_id: recipient.playerId || null,
    user_id: recipient.userId || null,
    email: recipient.email || "",
    status: "pending",
  }));

  const { error } = await supabase.from("club_event_recipients").insert(rows);
  if (error) throw normalizeError(error);
}

export async function createClubEvent(input: {
  clubId: string;
  teamId?: string | null;
  coachId?: string | null;
  gymnaseId?: string | null;
  trainingSlotId?: string | null;
  title: string;
  description?: string;
  eventType?: string;
  eventDate: string;
  day?: number | null;
  startMin?: number | null;
  endMin?: number | null;
  allDay?: boolean;
  location?: string;
  source?: string;
  metadata?: Record<string, unknown>;
  recipients?: EventRecipientInput[];
}): Promise<ClubEvent> {
  const supabase = sb();
  const { data: userData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("club_events")
    .insert({
      club_id: input.clubId,
      team_id: input.teamId || null,
      coach_id: input.coachId || null,
      gymnase_id: input.gymnaseId || null,
      training_slot_id: input.trainingSlotId || null,
      title: input.title,
      description: input.description || "",
      event_type: input.eventType || "training",
      event_date: input.eventDate,
      day: input.day ?? null,
      start_min: input.startMin ?? null,
      end_min: input.endMin ?? null,
      all_day: Boolean(input.allDay),
      location: input.location || "",
      source: input.source || "manual",
      metadata: input.metadata || {},
      created_by: userData.user?.id ?? null,
    })
    .select("*")
    .single();

  if (error) throw normalizeError(error);

  const event = rowToEvent(data);

  if (input.recipients?.length) {
    await replaceEventRecipients({
      clubId: input.clubId,
      eventId: event.id,
      recipients: input.recipients,
    });
  }

  return event;
}

export async function deleteClubEvent(eventId: string, clubId?: string): Promise<void> {
  const supabase = sb();

  await supabase.from("club_event_recipients").delete().eq("event_id", eventId);
  await supabase.from("club_event_attendances").delete().eq("event_id", eventId);

  let query = supabase.from("club_events").delete().eq("id", eventId);
  if (clubId) query = query.eq("club_id", clubId);

  const { error } = await query;
  if (error) throw normalizeError(error);
}

export async function syncSlotToCalendar(input: {
  clubId: string;
  slot: SlotWithEngine;
  eventDate: string;
  title?: string;
  location?: string;
}): Promise<ClubEvent> {
  return createClubEvent({
    clubId: input.clubId,
    teamId: input.slot.teamId || null,
    coachId: input.slot.coachId || null,
    gymnaseId: input.slot.gymnaseId,
    trainingSlotId: input.slot.id,
    title: input.title || `${input.slot.category}${input.slot.team ? ` - ${input.slot.team}` : ""}`,
    description: input.slot.notes || "",
    eventType: input.slot.slotType || "training",
    eventDate: input.eventDate,
    day: input.slot.day,
    startMin: input.slot.startMin,
    endMin: input.slot.startMin + input.slot.durationMin,
    allDay: false,
    location: input.location || "",
    source: "training_slot",
    metadata: {
      category: input.slot.category,
      gender: input.slot.gender,
      team: input.slot.team,
    },
  });
}

export async function detectSlotConflicts(params: {
  clubId: string;
  candidate: {
    id?: string | null;
    day: number;
    gymnaseId: string;
    startMin: number;
    durationMin: number;
    teamId?: string | null;
    coachId?: string | null;
  };
}): Promise<ScheduleConflict[]> {
  const supabase = sb();
  const c = params.candidate;
  const cStart = c.startMin;
  const cEnd = c.startMin + c.durationMin;
  const conflicts: ScheduleConflict[] = [];

  const { data: slots, error: slotsError } = await supabase
    .from("club_training_slots")
    .select("id, gymnase_id, day, start_min, duration_min, category, team, team_id, coach_id")
    .eq("club_id", params.clubId)
    .eq("day", c.day);

  if (slotsError) throw normalizeError(slotsError);

  for (const slot of slots ?? []) {
    if (c.id && slot.id === c.id) continue;

    const sStart = Number(slot.start_min) || 0;
    const sEnd = sStart + (Number(slot.duration_min) || 0);

    if (!overlap(cStart, cEnd, sStart, sEnd)) continue;

    if (String(slot.gymnase_id) === c.gymnaseId) {
      conflicts.push({
        type: "gymnase",
        severity: "blocking",
        relatedId: slot.id,
        message: `Salle déjà utilisée par ${slot.category || "un créneau"}.`,
      });
    }

    if (c.teamId && slot.team_id && String(slot.team_id) === c.teamId) {
      conflicts.push({
        type: "team",
        severity: "blocking",
        relatedId: slot.id,
        message: "Équipe déjà programmée sur ce créneau.",
      });
    }

    if (c.coachId && slot.coach_id && String(slot.coach_id) === c.coachId) {
      conflicts.push({
        type: "coach",
        severity: "blocking",
        relatedId: slot.id,
        message: "Coach déjà occupé sur ce créneau.",
      });
    }
  }

  return conflicts;
}

export async function saveConflicts(params: {
  clubId: string;
  slotId?: string | null;
  eventId?: string | null;
  conflicts: ScheduleConflict[];
}): Promise<void> {
  const supabase = sb();

  if (params.slotId) {
    await supabase
      .from("club_schedule_conflicts")
      .delete()
      .eq("club_id", params.clubId)
      .eq("slot_id", params.slotId)
      .eq("resolved", false);
  }

  if (!params.conflicts.length) return;

  const rows = params.conflicts.map((conflict) => ({
    club_id: params.clubId,
    slot_id: params.slotId || null,
    event_id: params.eventId || null,
    conflict_type: conflict.type,
    severity: conflict.severity,
    message: conflict.message,
    related_id: conflict.relatedId || null,
  }));

  const { error } = await supabase.from("club_schedule_conflicts").insert(rows);
  if (error) throw normalizeError(error);
}

export async function assertNoBlockingConflicts(params: {
  clubId: string;
  candidate: Parameters<typeof detectSlotConflicts>[0]["candidate"];
}): Promise<ScheduleConflict[]> {
  const conflicts = await detectSlotConflicts(params);
  const blocking = conflicts.filter((conflict) => conflict.severity === "blocking");

  if (blocking.length) {
    const error = new Error(blocking.map((conflict) => conflict.message).join("\n"));
    (error as any).conflicts = conflicts;
    throw error;
  }

  return conflicts;
}
