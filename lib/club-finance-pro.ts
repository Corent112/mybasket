// lib/club-finance-pro.ts
"use client";

import { createClient } from "@/lib/supabase/client";
import type { ClubPlayer, ClubTeam } from "@/lib/club-core";
import { listClubPlayers, listClubTeams } from "@/lib/club-core";
import {
  listPlayerCotisations,
  type PlayerCotisation,
} from "@/lib/club-cotisations";

export type FinanceEntryType = "income" | "expense";

export type FinanceEntry = {
  id: string;
  clubId: string;
  entryType: FinanceEntryType;
  category: string;
  title: string;
  description: string;
  amountCents: number;
  vatCents: number;
  currency: string;
  entryDate: string;
  paymentMethod: string | null;
  supplier: string;
  customer: string;
  documentId: string | null;
  status: string;
};

export type ClubSponsor = {
  id: string;
  clubId: string;
  name: string;
  contactName: string;
  email: string;
  phone: string;
  amountCents: number;
  season: string;
  status: string;
  notes: string;
};

export type FinanceSummaryPro = {
  clubId: string;
  clubName: string;
  cotisationsPaidCents: number;
  cotisationsRemainingCents: number;
  cotisationsExpectedCents: number;
  otherIncomeCents: number;
  expensesCents: number;
  sponsorsCents: number;
  totalIncomeCents: number;
  balanceCents: number;
  unpaidCount: number;
};

function sb() {
  return createClient();
}

function fail(error: any) {
  console.error("CLUB_FINANCE_PRO_ERROR", error);
  return new Error(
    error?.message || error?.details || error?.hint || "Erreur Supabase"
  );
}

function rowToEntry(row: any): FinanceEntry {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    entryType: row.entry_type ?? "income",
    category: row.category ?? "Autre",
    title: row.title ?? "",
    description: row.description ?? "",
    amountCents: Number(row.amount_cents) || 0,
    vatCents: Number(row.vat_cents) || 0,
    currency: row.currency ?? "EUR",
    entryDate: row.entry_date,
    paymentMethod: row.payment_method ?? null,
    supplier: row.supplier ?? "",
    customer: row.customer ?? "",
    documentId: row.document_id ?? null,
    status: row.status ?? "validated",
  };
}

function rowToSponsor(row: any): ClubSponsor {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    name: row.name ?? "",
    contactName: row.contact_name ?? "",
    email: row.email ?? "",
    phone: row.phone ?? "",
    amountCents: Number(row.amount_cents) || 0,
    season: row.season ?? "2026-2027",
    status: row.status ?? "active",
    notes: row.notes ?? "",
  };
}

function rowToSummary(row: any): FinanceSummaryPro {
  return {
    clubId: String(row.club_id),
    clubName: row.club_name ?? "",
    cotisationsPaidCents: Number(row.cotisations_paid_cents) || 0,
    cotisationsRemainingCents: Number(row.cotisations_remaining_cents) || 0,
    cotisationsExpectedCents: Number(row.cotisations_expected_cents) || 0,
    otherIncomeCents: Number(row.other_income_cents) || 0,
    expensesCents: Number(row.expenses_cents) || 0,
    sponsorsCents: Number(row.sponsors_cents) || 0,
    totalIncomeCents: Number(row.total_income_cents) || 0,
    balanceCents: Number(row.balance_cents) || 0,
    unpaidCount: Number(row.unpaid_count) || 0,
  };
}

export async function loadFinanceSummary(
  clubId: string
): Promise<FinanceSummaryPro | null> {
  const { data, error } = await sb()
    .from("club_finance_summary_pro")
    .select("*")
    .eq("club_id", clubId)
    .maybeSingle();

  if (error) throw fail(error);
  return data ? rowToSummary(data) : null;
}

export async function listFinanceEntries(
  clubId: string
): Promise<FinanceEntry[]> {
  const { data, error } = await sb()
    .from("club_finance_entries")
    .select("*")
    .eq("club_id", clubId)
    .order("entry_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) throw fail(error);
  return (data ?? []).map(rowToEntry);
}

export async function createFinanceEntry(input: {
  clubId: string;
  entryType: FinanceEntryType;
  category: string;
  title: string;
  description?: string;
  amountCents: number;
  vatCents?: number;
  entryDate: string;
  paymentMethod?: string;
  supplier?: string;
  customer?: string;
}): Promise<FinanceEntry> {
  const supabase = sb();
  const { data: userData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("club_finance_entries")
    .insert({
      club_id: input.clubId,
      entry_type: input.entryType,
      category: input.category,
      title: input.title,
      description: input.description || "",
      amount_cents: input.amountCents,
      vat_cents: input.vatCents || 0,
      entry_date: input.entryDate,
      payment_method: input.paymentMethod || "manual",
      supplier: input.supplier || "",
      customer: input.customer || "",
      status: "validated",
      created_by: userData.user?.id ?? null,
    })
    .select("*")
    .single();

  if (error) throw fail(error);
  return rowToEntry(data);
}

export async function updateFinanceEntry(
  entryId: string,
  input: {
    clubId: string;
    entryType: FinanceEntryType;
    category: string;
    title: string;
    description?: string;
    amountCents: number;
    vatCents?: number;
    entryDate: string;
    paymentMethod?: string;
    supplier?: string;
    customer?: string;
    status?: string;
  }
): Promise<FinanceEntry> {
  const { data, error } = await sb()
    .from("club_finance_entries")
    .update({
      entry_type: input.entryType,
      category: input.category,
      title: input.title,
      description: input.description || "",
      amount_cents: input.amountCents,
      vat_cents: input.vatCents || 0,
      entry_date: input.entryDate,
      payment_method: input.paymentMethod || "manual",
      supplier: input.supplier || "",
      customer: input.customer || "",
      status: input.status || "validated",
      updated_at: new Date().toISOString(),
    })
    .eq("id", entryId)
    .eq("club_id", input.clubId)
    .select("*")
    .single();

  if (error) throw fail(error);
  return rowToEntry(data);
}

export async function deleteFinanceEntry(
  clubId: string,
  entryId: string
): Promise<void> {
  const { error } = await sb()
    .from("club_finance_entries")
    .delete()
    .eq("id", entryId)
    .eq("club_id", clubId);

  if (error) throw fail(error);
}

export async function listSponsors(clubId: string): Promise<ClubSponsor[]> {
  const { data, error } = await sb()
    .from("club_sponsors")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });

  if (error) throw fail(error);
  return (data ?? []).map(rowToSponsor);
}

export async function createSponsor(input: {
  clubId: string;
  name: string;
  contactName?: string;
  email?: string;
  phone?: string;
  amountCents: number;
  season: string;
  notes?: string;
}): Promise<ClubSponsor> {
  const supabase = sb();
  const { data: userData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("club_sponsors")
    .insert({
      club_id: input.clubId,
      name: input.name,
      contact_name: input.contactName || "",
      email: input.email || "",
      phone: input.phone || "",
      amount_cents: input.amountCents,
      season: input.season,
      notes: input.notes || "",
      status: "active",
      created_by: userData.user?.id ?? null,
    })
    .select("*")
    .single();

  if (error) throw fail(error);
  return rowToSponsor(data);
}

export async function updateSponsor(
  sponsorId: string,
  input: {
    clubId: string;
    name: string;
    contactName?: string;
    email?: string;
    phone?: string;
    amountCents: number;
    season: string;
    notes?: string;
    status?: string;
  }
): Promise<ClubSponsor> {
  const { data, error } = await sb()
    .from("club_sponsors")
    .update({
      name: input.name,
      contact_name: input.contactName || "",
      email: input.email || "",
      phone: input.phone || "",
      amount_cents: input.amountCents,
      season: input.season,
      notes: input.notes || "",
      status: input.status || "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", sponsorId)
    .eq("club_id", input.clubId)
    .select("*")
    .single();

  if (error) throw fail(error);
  return rowToSponsor(data);
}

export async function deleteSponsor(
  clubId: string,
  sponsorId: string
): Promise<void> {
  const { error } = await sb()
    .from("club_sponsors")
    .delete()
    .eq("id", sponsorId)
    .eq("club_id", clubId);

  if (error) throw fail(error);
}

export function financeByCategory(
  entries: FinanceEntry[],
  type: FinanceEntryType
) {
  const map = new Map<string, number>();

  entries
    .filter((entry) => entry.entryType === type)
    .forEach((entry) =>
      map.set(entry.category, (map.get(entry.category) || 0) + entry.amountCents)
    );

  return Array.from(map.entries())
    .map(([category, amountCents]) => ({ category, amountCents }))
    .sort((a, b) => b.amountCents - a.amountCents);
}

export function financeByMonth(entries: FinanceEntry[]) {
  const map = new Map<string, { income: number; expense: number }>();

  entries.forEach((entry) => {
    const month = String(entry.entryDate || "").slice(0, 7) || "Sans date";
    const current = map.get(month) || { income: 0, expense: 0 };

    if (entry.entryType === "income") current.income += entry.amountCents;
    else current.expense += entry.amountCents;

    map.set(month, current);
  });

  return Array.from(map.entries())
    .map(([month, values]) => ({
      month,
      ...values,
      balance: values.income - values.expense,
    }))
    .sort((a, b) => a.month.localeCompare(b.month));
}

export async function getFinanceWorkspace(clubId: string): Promise<{
  summary: FinanceSummaryPro | null;
  entries: FinanceEntry[];
  sponsors: ClubSponsor[];
  cotisations: PlayerCotisation[];
  players: ClubPlayer[];
  teams: ClubTeam[];
}> {
  const [summary, entries, sponsors, cotisations, players, teams] =
    await Promise.all([
      loadFinanceSummary(clubId),
      listFinanceEntries(clubId),
      listSponsors(clubId),
      listPlayerCotisations(clubId),
      listClubPlayers(clubId),
      listClubTeams(clubId),
    ]);

  return { summary, entries, sponsors, cotisations, players, teams };
}

export function buildFinanceCsv(input: {
  entries: FinanceEntry[];
  sponsors: ClubSponsor[];
  cotisations: PlayerCotisation[];
  players: ClubPlayer[];
}) {
  const rows: string[][] = [
    ["type", "date", "categorie", "titre", "joueur", "montant_euros", "statut"],
  ];

  input.entries.forEach((entry) => {
    rows.push([
      entry.entryType,
      entry.entryDate,
      entry.category,
      entry.title,
      "",
      String(entry.amountCents / 100).replace(".", ","),
      entry.status,
    ]);
  });

  input.sponsors.forEach((sponsor) => {
    rows.push([
      "sponsor",
      "",
      "Sponsor",
      sponsor.name,
      "",
      String(sponsor.amountCents / 100).replace(".", ","),
      sponsor.status,
    ]);
  });

  input.cotisations.forEach((cotisation) => {
    const player = input.players.find((p) => p.id === cotisation.playerId);
    rows.push([
      "cotisation",
      cotisation.dueDate || "",
      "Cotisation",
      cotisation.season,
      player ? `${player.lastName} ${player.firstName}` : "",
      String(cotisation.paidCents / 100).replace(".", ","),
      cotisation.status,
    ]);
  });

  return rows
    .map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")
    )
    .join("\n");
}