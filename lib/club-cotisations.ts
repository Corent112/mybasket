// lib/club-cotisations.ts
"use client";

import { createClient } from "@/lib/supabase/client";
import type { ClubPlayer, ClubTeam } from "@/lib/club-core";
import { listClubPlayers, listClubTeams } from "@/lib/club-core";

export type CotisationPlan = {
  id: string;
  clubId: string;
  name: string;
  season: string;
  category: string;
  amountCents: number;
  currency: string;
  dueDate: string | null;
  installments: number;
  status: string;
};

export type PlayerCotisation = {
  id: string;
  clubId: string;
  playerId: string;
  teamId: string | null;
  planId: string | null;
  season: string;
  amountCents: number;
  paidCents: number;
  remainingCents: number;
  dueDate: string | null;
  status: string;
  paymentMethod: string | null;
  note: string;
};

export type CotisationPayment = {
  id: string;
  clubId: string;
  cotisationId: string;
  playerId: string;
  amountCents: number;
  paymentDate: string;
  paymentMethod: string;
  reference: string | null;
  note: string;
};

function sb() {
  return createClient();
}

function fail(error: any) {
  console.error("CLUB_COTISATIONS_ERROR", error);
  return new Error(error?.message || error?.details || error?.hint || "Erreur Supabase");
}

function rowToPlan(row: any): CotisationPlan {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    name: row.name ?? "",
    season: row.season ?? "",
    category: row.category ?? "",
    amountCents: Number(row.amount_cents) || 0,
    currency: row.currency ?? "EUR",
    dueDate: row.due_date ?? null,
    installments: Number(row.installments) || 1,
    status: row.status ?? "active",
  };
}

function rowToCotisation(row: any): PlayerCotisation {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    playerId: String(row.player_id),
    teamId: row.team_id ?? null,
    planId: row.plan_id ?? null,
    season: row.season ?? "",
    amountCents: Number(row.amount_cents) || 0,
    paidCents: Number(row.paid_cents) || 0,
    remainingCents: Number(row.remaining_cents) || 0,
    dueDate: row.due_date ?? null,
    status: row.status ?? "pending",
    paymentMethod: row.payment_method ?? null,
    note: row.note ?? "",
  };
}

function rowToPayment(row: any): CotisationPayment {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    cotisationId: String(row.cotisation_id),
    playerId: String(row.player_id),
    amountCents: Number(row.amount_cents) || 0,
    paymentDate: row.payment_date,
    paymentMethod: row.payment_method ?? "manual",
    reference: row.reference ?? null,
    note: row.note ?? "",
  };
}

export async function listCotisationPlans(clubId: string): Promise<CotisationPlan[]> {
  const { data, error } = await sb()
    .from("club_cotisation_plans")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });

  if (error) throw fail(error);
  return (data ?? []).map(rowToPlan);
}

export async function createCotisationPlan(input: {
  clubId: string;
  name: string;
  season: string;
  category?: string;
  amountCents: number;
  dueDate?: string | null;
  installments?: number;
}): Promise<CotisationPlan> {
  const supabase = sb();
  const { data: userData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("club_cotisation_plans")
    .insert({
      club_id: input.clubId,
      name: input.name,
      season: input.season,
      category: input.category || "",
      amount_cents: input.amountCents,
      due_date: input.dueDate || null,
      installments: input.installments || 1,
      created_by: userData.user?.id ?? null,
    })
    .select("*")
    .single();

  if (error) throw fail(error);
  return rowToPlan(data);
}

export async function listPlayerCotisations(clubId: string): Promise<PlayerCotisation[]> {
  const { data, error } = await sb()
    .from("club_player_cotisations")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });

  if (error) throw fail(error);
  return (data ?? []).map(rowToCotisation);
}

export async function assignPlanToTeam(input: {
  clubId: string;
  planId: string;
  teamId: string;
}): Promise<PlayerCotisation[]> {
  const supabase = sb();
  const { data: userData } = await supabase.auth.getUser();

  const [plans, players] = await Promise.all([
    listCotisationPlans(input.clubId),
    listClubPlayers(input.clubId, { teamId: input.teamId }),
  ]);

  const selectedPlan = plans.find((item) => item.id === input.planId);
  if (!selectedPlan) throw new Error("Plan introuvable.");

  const rows = players.map((player) => ({
    club_id: input.clubId,
    player_id: player.id,
    team_id: input.teamId,
    plan_id: selectedPlan.id,
    season: selectedPlan.season,
    amount_cents: selectedPlan.amountCents,
    paid_cents: 0,
    due_date: selectedPlan.dueDate,
    status: "pending",
    created_by: userData.user?.id ?? null,
  }));

  if (!rows.length) return [];

  const { data, error } = await supabase
    .from("club_player_cotisations")
    .upsert(rows, { onConflict: "player_id,plan_id" })
    .select("*");

  if (error) throw fail(error);
  return (data ?? []).map(rowToCotisation);
}

export async function recordCotisationPayment(input: {
  clubId: string;
  cotisationId: string;
  playerId: string;
  amountCents: number;
  paymentMethod?: string;
  reference?: string;
  note?: string;
}): Promise<CotisationPayment> {
  const supabase = sb();
  const { data: userData } = await supabase.auth.getUser();

  const { data: paymentRow, error: paymentError } = await supabase
    .from("club_cotisation_payments")
    .insert({
      club_id: input.clubId,
      cotisation_id: input.cotisationId,
      player_id: input.playerId,
      amount_cents: input.amountCents,
      payment_method: input.paymentMethod || "manual",
      reference: input.reference || null,
      note: input.note || "",
      created_by: userData.user?.id ?? null,
    })
    .select("*")
    .single();

  if (paymentError) throw fail(paymentError);

  const { data: current, error: currentError } = await supabase
    .from("club_player_cotisations")
    .select("paid_cents, amount_cents")
    .eq("id", input.cotisationId)
    .single();

  if (currentError) throw fail(currentError);

  const newPaid = Number(current.paid_cents || 0) + input.amountCents;
  const amount = Number(current.amount_cents || 0);

  const { error: updateError } = await supabase
    .from("club_player_cotisations")
    .update({
      paid_cents: newPaid,
      status: newPaid >= amount ? "paid" : "partial",
      payment_method: input.paymentMethod || "manual",
    })
    .eq("id", input.cotisationId);

  if (updateError) throw fail(updateError);

  await supabase
    .from("club_players")
    .update({ payment_status: newPaid >= amount ? "paid" : "partial" })
    .eq("id", input.playerId)
    .then(() => null);

  return rowToPayment(paymentRow);
}

export async function getCotisationsWorkspace(clubId: string): Promise<{
  plans: CotisationPlan[];
  cotisations: PlayerCotisation[];
  players: ClubPlayer[];
  teams: ClubTeam[];
}> {
  const [plans, cotisations, players, teams] = await Promise.all([
    listCotisationPlans(clubId),
    listPlayerCotisations(clubId),
    listClubPlayers(clubId),
    listClubTeams(clubId),
  ]);

  return { plans, cotisations, players, teams };
}
