// lib/club-store.ts
// Source Supabase de l'Espace Mon Club.
// Remplace la version Claude qui était en localStorage.
// Lit les équipes/joueurs via lib/equipes-store.ts et persiste finances,
// cotisations, coachs, documents, communications et infos club dans Supabase.

import { createClient } from "@/lib/supabase/client";
import { getTeams as getSupabaseTeams } from "@/lib/equipes-store";

/* =========================================================================
   TYPES
   ========================================================================= */

export type Player = {
  id: string;
  key: string;
  name: string;
  number?: string | number | null;
  category?: string | null;
  gender?: string | null;
  teamId: string;
  teamName: string;
  coach?: string | null;
};

export type Team = {
  id: string;
  name: string;
  category?: string | null;
  gender?: string | null;
  coach?: string | null;
  coachId?: string | null;
  players: Player[];
};

export type LicenseTier = {
  id: string;
  label: string;
  socle: number;
  extension: number;
  cotisation: number;
};

export type Expense = {
  id: string;
  label: string;
  amount: number;
  date?: string;
  recurring?: boolean;
};

export type Income = {
  id: string;
  label: string;
  amount: number;
  date?: string;
};

export type FinanceState = {
  affiliation: number;
  tiers: LicenseTier[];
  expenses: Expense[];
  extraIncome: Income[];
};

export type CotiPayment = {
  id: string;
  amount: number;
  method?: string;
  date: string;
  note?: string;
};

export type CotiRecord = {
  tierId: string;
  received: number;
  payments: CotiPayment[];
  note?: string;
};

export type CotiState = Record<string, CotiRecord>;

export type CotiStatus = "paid" | "partial" | "unpaid";

export type Coach = {
  id: string;
  name: string;
  email: string;
  status: "invited" | "active";
  teamIds: string[];
  invitedAt: string;
  note?: string;
};

export type ClubDoc = {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  section: string;
  addedAt: string;
};

export type DocsState = Record<string, ClubDoc[]>;

export type CommKind = "relance" | "convocation" | "info" | "autre";

export type Comm = {
  id: string;
  kind: CommKind;
  title: string;
  message?: string;
  docId?: string | null;
  recipients: string[];
  sentAt: string;
  status: "draft" | "queued";
};

export type ClubInfo = {
  name: string;
  season: string;
};

export type Subscription = {
  plan: string;
  seats: number;
  status?: string;
};

export type Money = {
  caLicences: number;
  extraIncome: number;
  totalRecettes: number;
  coutLicences: number;
  affiliation: number;
  autresDepenses: number;
  totalDepenses: number;
  soldePrevisionnel: number;
  encaisse: number;
  resteAEncaisser: number;
};

const FINANCE_DEFAULT: FinanceState = {
  affiliation: 0,
  tiers: [{ id: "tier_std", label: "Standard", socle: 0, extension: 0, cotisation: 0 }],
  expenses: [],
  extraIncome: [],
};

export const MAX_DOC_BYTES = 10 * 1024 * 1024;

/* =========================================================================
   HELPERS
   ========================================================================= */

export function uid(prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function currentSeason(): string {
  const now = new Date();
  const y = now.getMonth() >= 6 ? now.getFullYear() : now.getFullYear() - 1;
  return `${y}-${y + 1}`;
}

function playerName(p: any): string {
  return (
    p?.name ||
    p?.nom ||
    p?.fullName ||
    [p?.firstName, p?.lastName].filter(Boolean).join(" ") ||
    [p?.prenom, p?.nom].filter(Boolean).join(" ") ||
    [p?.first_name, p?.last_name].filter(Boolean).join(" ") ||
    "Joueur"
  ).trim();
}

function normalizeTeam(team: any): Team {
  const teamId = String(team?.id ?? "");
  const teamName = String(team?.name ?? team?.nom ?? team?.teamName ?? "Équipe");
  const rawPlayers = asArray<any>(team?.players ?? team?.joueurs ?? team?.effectif ?? team?.roster);

  const players: Player[] = rawPlayers.map((p, index) => {
    const pid = String(p?.id ?? p?.playerId ?? p?.player_id ?? `p_${index}`);
    return {
      id: pid,
      key: `${teamId}::${pid}`,
      name: playerName(p),
      number: p?.num ?? p?.numero ?? p?.number ?? null,
      category: p?.category ?? p?.categorie ?? team?.category ?? team?.cat ?? null,
      gender: p?.gender ?? p?.sexe ?? team?.gender ?? null,
      teamId,
      teamName,
      coach: team?.coach ?? team?.coach_name ?? team?.entraineur ?? null,
    };
  });

  return {
    id: teamId,
    name: teamName,
    category: team?.category ?? team?.cat ?? team?.categorie ?? null,
    gender: team?.gender ?? team?.sexe ?? null,
    coach: team?.coach ?? team?.coach_name ?? team?.entraineur ?? null,
    coachId: team?.coachId ?? team?.coach_id ?? null,
    players,
  };
}

async function getUserId(): Promise<string> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error) throw error;
  if (!data.user) throw new Error("Utilisateur non connecté");
  return data.user.id;
}

export function onClubStoreChange(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  const handler = () => cb();
  window.addEventListener("mybasket:club-store", handler);
  return () => window.removeEventListener("mybasket:club-store", handler);
}

function notifyClubStoreChange() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("mybasket:club-store"));
  }
}

/* =========================================================================
   ÉQUIPES / JOUEURS / CALENDRIER
   ========================================================================= */

export async function readTeams(): Promise<Team[]> {
  const rows = await getSupabaseTeams();
  return (rows ?? []).map(normalizeTeam).filter((t) => t.id);
}

export async function readPlayers(): Promise<Player[]> {
  const teams = await readTeams();
  return teams.flatMap((t) => t.players);
}

export async function countCalendarSessions(teamIds?: string[]): Promise<number> {
  const supabase = createClient();
  const userId = await getUserId();

  let query = supabase
    .from("calendar_events")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (teamIds?.length) {
    query = query.in("team_id", teamIds);
  }

  const { count, error } = await query;

  if (error) {
    console.warn("Erreur countCalendarSessions:", error);
    return 0;
  }

  return count ?? 0;
}

export async function countCreneaux(): Promise<number> {
  const supabase = createClient();

  const { count, error } = await supabase
    .from("club_training_slots")
    .select("id", { count: "exact", head: true });

  if (error) {
    console.warn("Créneaux non disponibles :", error);
    return 0;
  }

  return count ?? 0;
}

/* =========================================================================
   FINANCES
   ========================================================================= */

export async function readFinance(): Promise<FinanceState> {
  const supabase = createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("club_finance")
    .select("affiliation, tiers, expenses, extra_income")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Erreur readFinance:", error);
    return FINANCE_DEFAULT;
  }

  if (!data) return FINANCE_DEFAULT;

  return {
    affiliation: safeNumber(data.affiliation),
    tiers: asArray<LicenseTier>(data.tiers).length ? asArray<LicenseTier>(data.tiers) : FINANCE_DEFAULT.tiers,
    expenses: asArray<Expense>(data.expenses),
    extraIncome: asArray<Income>(data.extra_income),
  };
}

export async function writeFinance(finance: FinanceState): Promise<void> {
  const supabase = createClient();
  const userId = await getUserId();

  const { error } = await supabase.from("club_finance").upsert(
    {
      user_id: userId,
      affiliation: safeNumber(finance.affiliation),
      tiers: finance.tiers ?? [],
      expenses: finance.expenses ?? [],
      extra_income: finance.extraIncome ?? [],
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) throw error;
  notifyClubStoreChange();
}

/* =========================================================================
   COTISATIONS
   ========================================================================= */

export async function readCotisations(): Promise<CotiState> {
  const supabase = createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("club_cotisations")
    .select("player_key, tier_id, received, payments, note")
    .eq("user_id", userId);

  if (error) {
    console.warn("Erreur readCotisations:", error);
    return {};
  }

  const result: CotiState = {};

  (data ?? []).forEach((row: any) => {
    result[String(row.player_key)] = {
      tierId: row.tier_id ?? "",
      received: safeNumber(row.received),
      payments: asArray<CotiPayment>(row.payments),
      note: row.note ?? undefined,
    };
  });

  return result;
}

export async function writeCotisations(cotisations: CotiState): Promise<void> {
  const supabase = createClient();
  const userId = await getUserId();

  const rows = Object.entries(cotisations).map(([playerKey, rec]) => ({
    user_id: userId,
    player_key: playerKey,
    tier_id: rec.tierId,
    received: safeNumber(rec.received),
    payments: rec.payments ?? [],
    note: rec.note ?? null,
    updated_at: new Date().toISOString(),
  }));

  if (!rows.length) {
    notifyClubStoreChange();
    return;
  }

  const { error } = await supabase
    .from("club_cotisations")
    .upsert(rows, { onConflict: "user_id,player_key" });

  if (error) throw error;
  notifyClubStoreChange();
}

export function cotiStatus(received: number, due: number): CotiStatus {
  if (due <= 0) return received > 0 ? "paid" : "unpaid";
  if (received >= due) return "paid";
  if (received > 0) return "partial";
  return "unpaid";
}

export function tierForPlayer(p: Player, coti: CotiState, finance: FinanceState): LicenseTier {
  const rec = coti[p.key];
  const fromRec = rec && finance.tiers.find((t) => t.id === rec.tierId);
  if (fromRec) return fromRec;

  const byCat =
    p.category &&
    finance.tiers.find((t) => t.label.toLowerCase().includes(String(p.category).toLowerCase()));

  return byCat || finance.tiers[0] || FINANCE_DEFAULT.tiers[0];
}

/* =========================================================================
   COACHS
   ========================================================================= */

export async function readCoaches(): Promise<Coach[]> {
  const supabase = createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("club_coaches")
    .select("id, name, email, status, team_ids, invited_at, note")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Erreur readCoaches:", error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    name: row.name ?? "",
    email: row.email ?? "",
    status: row.status === "active" ? "active" : "invited",
    teamIds: asArray<string>(row.team_ids).map(String),
    invitedAt: row.invited_at ?? row.created_at ?? new Date().toISOString(),
    note: row.note ?? undefined,
  }));
}

export async function writeCoaches(coaches: Coach[]): Promise<void> {
  const supabase = createClient();
  const userId = await getUserId();

  const rows = coaches.map((coach) => ({
    id: coach.id.startsWith("coach_") ? undefined : coach.id,
    user_id: userId,
    name: coach.name,
    email: coach.email,
    status: coach.status,
    team_ids: coach.teamIds ?? [],
    invited_at: coach.invitedAt ?? new Date().toISOString(),
    note: coach.note ?? null,
    updated_at: new Date().toISOString(),
  }));

  if (!rows.length) {
    notifyClubStoreChange();
    return;
  }

  const { error } = await supabase.from("club_coaches").upsert(rows);
  if (error) throw error;
  notifyClubStoreChange();
}

export async function upsertCoach(coach: Coach): Promise<Coach> {
  const supabase = createClient();
  const userId = await getUserId();

  const payload = {
    id: coach.id.startsWith("coach_") ? undefined : coach.id,
    user_id: userId,
    name: coach.name,
    email: coach.email,
    status: coach.status,
    team_ids: coach.teamIds ?? [],
    invited_at: coach.invitedAt ?? new Date().toISOString(),
    note: coach.note ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("club_coaches")
    .upsert(payload)
    .select("id, name, email, status, team_ids, invited_at, note")
    .single();

  if (error) throw error;

  notifyClubStoreChange();

  return {
    id: String(data.id),
    name: data.name ?? "",
    email: data.email ?? "",
    status: data.status === "active" ? "active" : "invited",
    teamIds: asArray<string>(data.team_ids).map(String),
    invitedAt: data.invited_at ?? new Date().toISOString(),
    note: data.note ?? undefined,
  };
}

export async function deleteCoach(id: string): Promise<void> {
  const supabase = createClient();
  const userId = await getUserId();

  const { error } = await supabase
    .from("club_coaches")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
  notifyClubStoreChange();
}

/* =========================================================================
   DOCUMENTS
   ========================================================================= */

export async function readDocs(): Promise<DocsState> {
  const supabase = createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("club_documents")
    .select("id, section, name, mime_type, size_bytes, file_url, created_at")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Erreur readDocs:", error);
    return {};
  }

  const grouped: DocsState = {};

  (data ?? []).forEach((row: any) => {
    const section = row.section ?? "club";
    if (!grouped[section]) grouped[section] = [];
    grouped[section].push({
      id: String(row.id),
      name: row.name ?? "Document",
      type: row.mime_type ?? "application/octet-stream",
      size: safeNumber(row.size_bytes),
      url: row.file_url ?? "",
      section,
      addedAt: row.created_at ?? new Date().toISOString(),
    });
  });

  return grouped;
}

export async function addDoc(section: string, file: File): Promise<ClubDoc> {
  const supabase = createClient();
  const userId = await getUserId();

  if (file.size > MAX_DOC_BYTES) {
    throw new Error(`"${file.name}" dépasse ${Math.round(MAX_DOC_BYTES / 1024 / 1024)} Mo.`);
  }

  const safeName = file.name.replace(/[^\w.\-À-ÿ ]+/g, "_");
  const path = `${userId}/${section}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("club-documents")
    .upload(path, file, {
      cacheControl: "3600",
      upsert: false,
      contentType: file.type || "application/octet-stream",
    });

  if (uploadError) throw uploadError;

  const { data: publicUrlData } = supabase.storage.from("club-documents").getPublicUrl(path);
  const fileUrl = publicUrlData.publicUrl;

  const { data, error } = await supabase
    .from("club_documents")
    .insert({
      user_id: userId,
      section,
      name: file.name,
      mime_type: file.type || "application/octet-stream",
      size_bytes: file.size,
      storage_path: path,
      file_url: fileUrl,
    })
    .select("id, section, name, mime_type, size_bytes, file_url, created_at")
    .single();

  if (error) throw error;
  notifyClubStoreChange();

  return {
    id: String(data.id),
    name: data.name,
    type: data.mime_type,
    size: data.size_bytes,
    url: data.file_url,
    section: data.section,
    addedAt: data.created_at,
  };
}

export async function removeDoc(section: string, id: string): Promise<void> {
  const supabase = createClient();
  const userId = await getUserId();

  const { data: doc, error: readError } = await supabase
    .from("club_documents")
    .select("storage_path")
    .eq("id", id)
    .eq("user_id", userId)
    .maybeSingle();

  if (readError) throw readError;

  if (doc?.storage_path) {
    await supabase.storage.from("club-documents").remove([doc.storage_path]);
  }

  const { error } = await supabase
    .from("club_documents")
    .delete()
    .eq("id", id)
    .eq("user_id", userId);

  if (error) throw error;
  notifyClubStoreChange();
}

export async function totalDocs(): Promise<number> {
  const supabase = createClient();
  const userId = await getUserId();

  const { count, error } = await supabase
    .from("club_documents")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) return 0;
  return count ?? 0;
}

/* =========================================================================
   COMMUNICATION
   ========================================================================= */

export async function readComms(): Promise<Comm[]> {
  const supabase = createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("club_communications")
    .select("id, kind, title, message, doc_id, recipients, sent_at, status")
    .eq("user_id", userId)
    .order("sent_at", { ascending: false });

  if (error) {
    console.warn("Erreur readComms:", error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    id: String(row.id),
    kind: (row.kind ?? "autre") as CommKind,
    title: row.title ?? "",
    message: row.message ?? "",
    docId: row.doc_id ?? null,
    recipients: asArray<string>(row.recipients).map(String),
    sentAt: row.sent_at ?? new Date().toISOString(),
    status: row.status === "draft" ? "draft" : "queued",
  }));
}

export async function writeComms(comms: Comm[]): Promise<void> {
  const supabase = createClient();
  const userId = await getUserId();

  const rows = comms.map((comm) => ({
    id: comm.id.startsWith("comm_") ? undefined : comm.id,
    user_id: userId,
    kind: comm.kind,
    title: comm.title,
    message: comm.message ?? null,
    doc_id: comm.docId ?? null,
    recipients: comm.recipients ?? [],
    sent_at: comm.sentAt ?? new Date().toISOString(),
    status: comm.status ?? "queued",
    updated_at: new Date().toISOString(),
  }));

  if (!rows.length) {
    notifyClubStoreChange();
    return;
  }

  const { error } = await supabase.from("club_communications").upsert(rows);
  if (error) throw error;
  notifyClubStoreChange();
}

export async function addComm(comm: Omit<Comm, "id">): Promise<Comm> {
  const supabase = createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("club_communications")
    .insert({
      user_id: userId,
      kind: comm.kind,
      title: comm.title,
      message: comm.message ?? null,
      doc_id: comm.docId ?? null,
      recipients: comm.recipients ?? [],
      sent_at: comm.sentAt,
      status: comm.status,
    })
    .select("id, kind, title, message, doc_id, recipients, sent_at, status")
    .single();

  if (error) throw error;
  notifyClubStoreChange();

  return {
    id: String(data.id),
    kind: data.kind,
    title: data.title,
    message: data.message ?? "",
    docId: data.doc_id ?? null,
    recipients: asArray<string>(data.recipients).map(String),
    sentAt: data.sent_at,
    status: data.status,
  };
}

/* =========================================================================
   INFOS CLUB + ABONNEMENT
   ========================================================================= */

export async function readClubInfo(): Promise<ClubInfo> {
  const supabase = createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("club_info")
    .select("name, season")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Erreur readClubInfo:", error);
    return { name: "Mon Club", season: currentSeason() };
  }

  return {
    name: data?.name ?? "Mon Club",
    season: data?.season ?? currentSeason(),
  };
}

export async function writeClubInfo(info: ClubInfo): Promise<void> {
  const supabase = createClient();
  const userId = await getUserId();

  const { error } = await supabase.from("club_info").upsert(
    {
      user_id: userId,
      name: info.name,
      season: info.season,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );

  if (error) throw error;
  notifyClubStoreChange();
}

export async function readSubscription(): Promise<Subscription | null> {
  const supabase = createClient();
  const userId = await getUserId();

  // Optionnel. Si ta table subscriptions n'existe pas encore, on renvoie null.
  const { data, error } = await supabase
    .from("subscriptions")
    .select("plan, coach_seats, seats, status")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("Abonnement non disponible:", error);
    return null;
  }

  if (!data) return null;

  return {
    plan: data.plan ?? "Club",
    seats: safeNumber(data.coach_seats ?? data.seats),
    status: data.status ?? undefined,
  };
}

/* =========================================================================
   CALCULS
   ========================================================================= */

export function computeMoney(opts: {
  teams: Team[];
  finance: FinanceState;
  coti: CotiState;
}): Money {
  const teams = opts.teams ?? [];
  const finance = opts.finance ?? FINANCE_DEFAULT;
  const coti = opts.coti ?? {};
  const players = teams.flatMap((t) => t.players);

  let caLicences = 0;
  let coutLicences = 0;
  let encaisse = 0;

  for (const p of players) {
    const tier = tierForPlayer(p, coti, finance);

    caLicences += safeNumber(tier?.cotisation);
    coutLicences += safeNumber(tier?.socle) + safeNumber(tier?.extension);

    const rec = coti[p.key];
    if (rec) encaisse += safeNumber(rec.received);
  }

  const extraIncome = finance.extraIncome.reduce((s, i) => s + safeNumber(i.amount), 0);
  const autresDepenses = finance.expenses.reduce((s, e) => s + safeNumber(e.amount), 0);
  const affiliation = safeNumber(finance.affiliation);

  const totalRecettes = caLicences + extraIncome;
  const totalDepenses = coutLicences + affiliation + autresDepenses;

  return {
    caLicences,
    extraIncome,
    totalRecettes,
    coutLicences,
    affiliation,
    autresDepenses,
    totalDepenses,
    soldePrevisionnel: totalRecettes - totalDepenses,
    encaisse,
    resteAEncaisser: caLicences - encaisse,
  };
}

export function emptyMoney(): Money {
  return {
    caLicences: 0,
    extraIncome: 0,
    totalRecettes: 0,
    coutLicences: 0,
    affiliation: 0,
    autresDepenses: 0,
    totalDepenses: 0,
    soldePrevisionnel: 0,
    encaisse: 0,
    resteAEncaisser: 0,
  };
}

export function defaultFinance(): FinanceState {
  return FINANCE_DEFAULT;
}

export function fmtEuro(n: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
}
