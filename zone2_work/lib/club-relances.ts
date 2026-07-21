// lib/club-relances.ts
"use client";

import { createClient } from "@/lib/supabase/client";
import type { ClubPlayer } from "@/lib/club-core";
import type { PlayerCotisation } from "@/lib/club-cotisations";

export type CotisationReminder = {
  id: string;
  clubId: string;
  cotisationId: string;
  playerId: string;
  recipientEmail: string | null;
  subject: string;
  body: string;
  status: string;
  sentAt: string | null;
};

function sb() {
  return createClient();
}

function fail(error: any) {
  console.error("CLUB_RELANCES_ERROR", error);
  return new Error(error?.message || error?.details || error?.hint || "Erreur Supabase");
}

function rowToReminder(row: any): CotisationReminder {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    cotisationId: String(row.cotisation_id),
    playerId: String(row.player_id),
    recipientEmail: row.recipient_email ?? null,
    subject: row.subject ?? "",
    body: row.body ?? "",
    status: row.status ?? "draft",
    sentAt: row.sent_at ?? null,
  };
}

export function buildCotisationReminder(input: {
  clubName: string;
  player: ClubPlayer;
  cotisation: PlayerCotisation;
}) {
  const fullName = `${input.player.firstName} ${input.player.lastName}`.trim();
  const remaining = (input.cotisation.remainingCents / 100).toLocaleString("fr-FR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  return {
    subject: `Rappel cotisation - ${input.clubName}`,
    body: `Bonjour,

Nous vous contactons concernant la cotisation de ${fullName} pour la saison ${input.cotisation.season}.

Montant restant à régler : ${remaining} €.

Merci de régulariser la situation auprès du club.

Sportivement,
${input.clubName}`,
  };
}

export async function createCotisationReminder(input: {
  clubId: string;
  cotisationId: string;
  playerId: string;
  recipientEmail?: string | null;
  subject: string;
  body: string;
}): Promise<CotisationReminder> {
  const supabase = sb();
  const { data: userData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("club_cotisation_reminders")
    .insert({
      club_id: input.clubId,
      cotisation_id: input.cotisationId,
      player_id: input.playerId,
      recipient_email: input.recipientEmail || null,
      subject: input.subject,
      body: input.body,
      status: "draft",
      created_by: userData.user?.id ?? null,
    })
    .select("*")
    .single();

  if (error) throw fail(error);
  return rowToReminder(data);
}

export async function listCotisationReminders(clubId: string): Promise<CotisationReminder[]> {
  const { data, error } = await sb()
    .from("club_cotisation_reminders")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });

  if (error) throw fail(error);
  return (data ?? []).map(rowToReminder);
}

export async function sendCotisationReminder(reminderId: string): Promise<void> {
  const response = await fetch("/api/club/cotisations/send-reminder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ reminderId }),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    throw new Error(json?.error || "Relance non envoyée.");
  }
}
