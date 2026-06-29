// lib/club-coaches.ts
"use client";

import { createClient } from "@/lib/supabase/client";
import type { ClubCoach } from "@/lib/club-core";

function sb() {
  return createClient();
}

function normalizeError(error: any) {
  console.error("CLUB_COACHES_ERROR", error);
  return new Error(error?.message || error?.details || error?.hint || "Erreur Supabase");
}

function rowToCoach(row: any): ClubCoach {
  const first = row.first_name ?? "";
  const last = row.last_name ?? "";

  return {
    id: String(row.id),
    clubId: String(row.club_id),
    userId: row.user_id ?? null,
    name: row.name || `${first} ${last}`.trim() || row.email || "Coach",
    firstName: first,
    lastName: last,
    email: row.email ?? "",
    phone: row.phone ?? null,
    role: row.role ?? "coach",
    status: row.status ?? "active",
    teamIds: Array.isArray(row.team_ids) ? row.team_ids : [],
  };
}

export async function updateClubCoach(
  coachId: string,
  patch: Partial<ClubCoach>
): Promise<ClubCoach> {
  const payload: Record<string, unknown> = {};

  if (patch.firstName !== undefined) payload.first_name = patch.firstName;
  if (patch.lastName !== undefined) payload.last_name = patch.lastName;
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.email !== undefined) payload.email = patch.email;
  if (patch.phone !== undefined) payload.phone = patch.phone;
  if (patch.role !== undefined) payload.role = patch.role;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.teamIds !== undefined) payload.team_ids = patch.teamIds;

  const { data, error } = await sb()
    .from("club_coaches")
    .update(payload)
    .eq("id", coachId)
    .select("*")
    .single();

  if (error) throw normalizeError(error);
  return rowToCoach(data);
}

export async function deleteClubCoachById(coachId: string): Promise<void> {
  const { error } = await sb().from("club_coaches").delete().eq("id", coachId);
  if (error) throw normalizeError(error);
}

export async function deactivateClubCoachById(coachId: string): Promise<void> {
  const { error } = await sb()
    .from("club_coaches")
    .update({ status: "disabled" })
    .eq("id", coachId);

  if (error) throw normalizeError(error);
}
