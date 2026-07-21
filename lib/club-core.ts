// lib/club-core.ts
"use client";

import { createClient } from "@/lib/supabase/client";

export type ClubTeam = {
  id: string;
  clubId: string;
  name: string;
  category: string;
  gender: string;
  level: string;
  season: string;
  status: string;
  coachId: string | null;
  assistantId: string | null;
  notes: string;
  teamNumber?: number;
  playersCount?: number;
  sessionsCount?: number;
  matchesCount?: number;
  attendanceRate?: number;
  licenseRate?: number;
  paymentRate?: number;
};

export type ClubCoach = {
  id: string;
  clubId: string;
  userId: string | null;
  name: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  role: string;
  status: string;
  teamIds: string[];
};

export type ClubPlayer = {
  id: string;
  clubId: string;
  teamId: string | null;
  firstName: string;
  lastName: string;
  birthdate: string | null;
  category: string;
  gender: string;
  licenseNumber: string | null;
  licenseStatus: string;
  paymentStatus: string;
  medicalStatus: string | null;
  status: string;
  email: string | null;
  phone: string | null;
  parentName: string | null;
  parentEmail: string | null;
  parentPhone: string | null;
  notes: string;
};

export type ClubDocument = {
  id: string;
  clubId: string;
  teamId: string | null;
  playerId: string | null;
  title: string;
  category: string;
  fileUrl: string | null;
  storagePath: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string | null;
};

export type PlayerPerformance = {
  club_id: string;
  team_id: string | null;
  player_id: string;
  first_name: string;
  last_name: string;
  category: string | null;
  gender: string | null;
  status: string | null;
  points: number;
  rebounds: number;
  assists: number;
  steals: number;
  blocks: number;
  turnovers: number;
  fouls: number;
  stat_lines: number;
};

export type ClubCommunicationGroup = {
  id: string;
  clubId: string;
  name: string;
  description: string;
  filters: Record<string, unknown>;
};

function sb() {
  return createClient();
}

function normalizeError(error: any) {
  const details = {
    code: error?.code ?? null,
    message: error?.message ?? null,
    details: error?.details ?? null,
    hint: error?.hint ?? null,
  };
  console.error("CLUB_CORE_SUPABASE_ERROR", details);
  return new Error(
    error?.message || error?.details || error?.hint ||
    "Erreur Supabase : vérifie la migration Espace club et les droits RLS."
  );
}

async function assertClientClubLimit(
  clubId: string,
  kind: "players" | "coaches",
): Promise<void> {
  const supabase = sb();
  const { data: { user }, error: userError } = await supabase.auth.getUser();
  if (userError || !user) throw new Error("Non connecté.");

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role")
    .eq("id", user.id)
    .maybeSingle();

  if (["ceo", "superadmin", "admin"].includes(String(profile?.platform_role ?? ""))) return;

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan_id")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!subscription?.plan_id) throw new Error("Aucun abonnement actif.");

  const limitColumn = kind === "players" ? "max_players" : "max_coaches";
  const { data: plan, error: planError } = await supabase
    .from("subscription_plans")
    .select(`id,${limitColumn}`)
    .eq("id", subscription.plan_id)
    .maybeSingle();
  if (planError) throw normalizeError(planError);

  const rawLimit = (plan as Record<string, unknown> | null)?.[limitColumn];
  const limit = rawLimit === null || rawLimit === undefined ? null : Number(rawLimit);
  if (limit === null || !Number.isFinite(limit)) return;

  const table = kind === "players" ? "club_players" : "club_coaches";
  const { count, error: countError } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("club_id", clubId);
  if (countError) throw normalizeError(countError);

  if ((count ?? 0) >= limit) {
    throw new Error(
      kind === "players"
        ? `Limite de ${limit} joueur(s) atteinte pour votre abonnement.`
        : `Limite de ${limit} entraîneur(s) atteinte pour votre abonnement.`,
    );
  }
}

function isMissingColumn(error: any) {
  return error?.code === "PGRST204" || /column .* schema cache/i.test(String(error?.message || ""));
}

function rowToTeam(row: any): ClubTeam {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    name: row.name ?? "",
    category: row.category ?? "",
    gender: row.gender ?? "Mixte",
    level: row.level ?? "",
    season: row.season ?? "",
    status: row.status ?? "active",
    coachId: row.coach_id ?? null,
    assistantId: row.assistant_id ?? null,
    notes: row.notes ?? "",
    teamNumber: Number(row.team_number ?? (String(row.name || "").match(/Équipe\s+(\d+)/i)?.[1] || 1)),
  };
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

function rowToPlayer(row: any): ClubPlayer {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    teamId: row.team_id ?? null,
    firstName: row.first_name ?? "",
    lastName: row.last_name ?? "",
    birthdate: row.birthdate ?? null,
    category: row.category ?? "",
    gender: row.gender ?? "Mixte",
    licenseNumber: row.license_number ?? null,
    licenseStatus: row.license_status ?? "pending",
    paymentStatus: row.payment_status ?? "pending",
    medicalStatus: row.medical_status ?? null,
    status: row.status ?? "active",
    email: row.email ?? null,
    phone: row.phone ?? null,
    parentName: row.parent_name ?? null,
    parentEmail: row.parent_email ?? null,
    parentPhone: row.parent_phone ?? null,
    notes: row.notes ?? "",
  };
}

function rowToDocument(row: any): ClubDocument {
  return {
    id: String(row.id),
    clubId: String(row.club_id),
    teamId: row.team_id ?? null,
    playerId: row.player_id ?? null,
    title: row.title ?? row.name ?? "Document",
    category: row.category ?? row.section ?? "Document",
    fileUrl: row.file_url ?? null,
    storagePath: row.storage_path ?? row.file_path ?? null,
    mimeType: row.mime_type ?? null,
    sizeBytes: row.size_bytes ?? null,
    createdAt: row.created_at ?? null,
  };
}

async function safeCount(table: string, filters: Record<string, string | number | null>) {
  const supabase = sb();
  let query = supabase.from(table).select("id", { count: "exact", head: true });

  Object.entries(filters).forEach(([key, value]) => {
    if (value !== null && value !== undefined) query = query.eq(key, value);
  });

  const { count, error } = await query;
  if (error) return 0;
  return count ?? 0;
}

export async function listClubTeams(clubId: string): Promise<ClubTeam[]> {
  const supabase = sb();

  const { data, error } = await supabase
    .from("club_teams")
    .select("*")
    .eq("club_id", clubId)
    .order("category", { ascending: true })
    .order("name", { ascending: true });

  if (error) throw normalizeError(error);

  const teams = (data ?? []).map(rowToTeam);

  const enriched = await Promise.all(
    teams.map(async (team: ClubTeam) => {
      const playersCount = await safeCount("club_players", { club_id: clubId, team_id: team.id });
      const sessionsCount = await safeCount("club_training_slots", { club_id: clubId });
      const matchesCount = await safeCount("match_stats", { club_id: clubId, team_id: team.id });

      const { data: players } = await supabase
        .from("club_players")
        .select("license_status, payment_status")
        .eq("club_id", clubId)
        .eq("team_id", team.id);

      const licenseOk = (players ?? []).filter((p: any) => p.license_status === "valid" || p.license_status === "ok").length;
      const paymentOk = (players ?? []).filter((p: any) => p.payment_status === "paid" || p.payment_status === "ok").length;
      const total = Math.max((players ?? []).length, 1);

      return {
        ...team,
        playersCount,
        sessionsCount,
        matchesCount,
        attendanceRate: 0,
        licenseRate: Math.round((licenseOk / total) * 100),
        paymentRate: Math.round((paymentOk / total) * 100),
      };
    })
  );

  return enriched;
}

export async function createClubTeam(clubId: string, input: Partial<ClubTeam>): Promise<ClubTeam> {
  const supabase = sb();
  const { data: userData, error: authError } = await supabase.auth.getUser();
  if (authError || !userData.user) throw new Error("Tu dois être connecté pour créer une équipe.");

  const category = String(input.category || "Équipe").trim();
  const parsedNumber = Number(input.teamNumber ?? String(input.name || "").match(/Équipe\s+(\d+)/i)?.[1] ?? 1);
  const teamNumber = Number.isFinite(parsedNumber) && parsedNumber > 0 ? Math.floor(parsedNumber) : 1;
  const generatedName = `${category} Équipe ${teamNumber}`;
  const fullPayload: Record<string, unknown> = {
    club_id: clubId,
    name: generatedName,
    team_number: teamNumber,
    category,
    gender: input.gender || "Mixte",
    level: input.level || "",
    season: input.season || "",
    status: input.status || "active",
    coach_id: input.coachId || null,
    assistant_id: input.assistantId || null,
    notes: input.notes || "",
    created_by: userData.user.id,
  };

  let result = await supabase.from("club_teams").insert(fullPayload).select("*").single();

  // Compatibilité avec les anciennes tables : on retire seulement les colonnes absentes,
  // sans perdre la catégorie, le nom généré ni l'affectation du coach.
  if (result.error && isMissingColumn(result.error)) {
    const compatiblePayload = { ...fullPayload };
    for (const optional of ["team_number", "created_by", "assistant_id", "notes", "status", "season", "level"]) {
      delete compatiblePayload[optional];
      result = await supabase.from("club_teams").insert(compatiblePayload).select("*").single();
      if (!result.error) break;
      if (!isMissingColumn(result.error)) break;
    }
  }

  if (result.error) throw normalizeError(result.error);
  return rowToTeam(result.data);
}

export async function updateClubTeam(teamId: string, patch: Partial<ClubTeam>): Promise<ClubTeam> {
  const supabase = sb();

  const payload: Record<string, unknown> = {};
  if (patch.category !== undefined || patch.teamNumber !== undefined || patch.name !== undefined) {
    const current = await supabase.from("club_teams").select("category, name, team_number").eq("id", teamId).single();
    if (current.error) throw normalizeError(current.error);
    const category = String(patch.category ?? current.data.category ?? "Équipe");
    const number = Number(patch.teamNumber ?? current.data.team_number ?? String(patch.name ?? current.data.name ?? "").match(/Équipe\s+(\d+)/i)?.[1] ?? 1);
    payload.category = category;
    payload.team_number = Number.isFinite(number) && number > 0 ? Math.floor(number) : 1;
    payload.name = `${category} Équipe ${payload.team_number}`;
  }
  if (patch.gender !== undefined) payload.gender = patch.gender;
  if (patch.level !== undefined) payload.level = patch.level;
  if (patch.season !== undefined) payload.season = patch.season;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.coachId !== undefined) payload.coach_id = patch.coachId;
  if (patch.assistantId !== undefined) payload.assistant_id = patch.assistantId;
  if (patch.notes !== undefined) payload.notes = patch.notes;

  const { data, error } = await supabase
    .from("club_teams")
    .update(payload)
    .eq("id", teamId)
    .select("*")
    .single();

  if (error) throw normalizeError(error);
  return rowToTeam(data);
}

export async function listClubCoaches(clubId: string): Promise<ClubCoach[]> {
  const supabase = sb();

  const { data, error } = await supabase
    .from("club_coaches")
    .select("*")
    .eq("club_id", clubId)
    .order("name", { ascending: true });

  if (error) throw normalizeError(error);
  return (data ?? []).map(rowToCoach);
}

export async function listClubPlayers(
  clubId: string,
  filters?: { teamId?: string; category?: string; gender?: string; status?: string; search?: string }
): Promise<ClubPlayer[]> {
  const supabase = sb();

  let query = supabase
    .from("club_players")
    .select("*")
    .eq("club_id", clubId)
    .order("last_name", { ascending: true });

  if (filters?.teamId) query = query.eq("team_id", filters.teamId);
  if (filters?.category) query = query.eq("category", filters.category);
  if (filters?.gender) query = query.eq("gender", filters.gender);
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.search) {
    query = query.or(
      `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,license_number.ilike.%${filters.search}%`
    );
  }

  const { data, error } = await query;
  if (error) throw normalizeError(error);
  return (data ?? []).map(rowToPlayer);
}

export async function createClubPlayer(clubId: string, input: Partial<ClubPlayer>): Promise<ClubPlayer> {
  await assertClientClubLimit(clubId, "players");
  const supabase = sb();
  const { data: userData } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("club_players")
    .insert({
      club_id: clubId,
      team_id: input.teamId || null,
      first_name: input.firstName || "",
      last_name: input.lastName || "",
      birthdate: input.birthdate || null,
      category: input.category || "",
      gender: input.gender || "Mixte",
      license_number: input.licenseNumber || null,
      license_status: input.licenseStatus || "pending",
      payment_status: input.paymentStatus || "pending",
      medical_status: input.medicalStatus || null,
      status: input.status || "active",
      email: input.email || null,
      phone: input.phone || null,
      parent_name: input.parentName || null,
      parent_email: input.parentEmail || null,
      parent_phone: input.parentPhone || null,
      notes: input.notes || "",
      created_by: userData.user?.id ?? null,
    })
    .select("*")
    .single();

  if (error) throw normalizeError(error);
  return rowToPlayer(data);
}

export async function updateClubPlayer(playerId: string, patch: Partial<ClubPlayer>): Promise<ClubPlayer> {
  const supabase = sb();

  const payload: Record<string, unknown> = {};
  if (patch.teamId !== undefined) payload.team_id = patch.teamId;
  if (patch.firstName !== undefined) payload.first_name = patch.firstName;
  if (patch.lastName !== undefined) payload.last_name = patch.lastName;
  if (patch.birthdate !== undefined) payload.birthdate = patch.birthdate;
  if (patch.category !== undefined) payload.category = patch.category;
  if (patch.gender !== undefined) payload.gender = patch.gender;
  if (patch.licenseNumber !== undefined) payload.license_number = patch.licenseNumber;
  if (patch.licenseStatus !== undefined) payload.license_status = patch.licenseStatus;
  if (patch.paymentStatus !== undefined) payload.payment_status = patch.paymentStatus;
  if (patch.medicalStatus !== undefined) payload.medical_status = patch.medicalStatus;
  if (patch.status !== undefined) payload.status = patch.status;
  if (patch.email !== undefined) payload.email = patch.email;
  if (patch.phone !== undefined) payload.phone = patch.phone;
  if (patch.parentName !== undefined) payload.parent_name = patch.parentName;
  if (patch.parentEmail !== undefined) payload.parent_email = patch.parentEmail;
  if (patch.parentPhone !== undefined) payload.parent_phone = patch.parentPhone;
  if (patch.notes !== undefined) payload.notes = patch.notes;

  const { data, error } = await supabase
    .from("club_players")
    .update(payload)
    .eq("id", playerId)
    .select("*")
    .single();

  if (error) throw normalizeError(error);
  return rowToPlayer(data);
}

export async function listClubDocuments(clubId: string): Promise<ClubDocument[]> {
  const supabase = sb();

  const { data, error } = await supabase
    .from("club_documents")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });

  if (error) throw normalizeError(error);
  return (data ?? []).map(rowToDocument);
}

export async function uploadClubDocument(input: {
  clubId: string;
  file: File;
  title?: string;
  category?: string;
  teamId?: string | null;
  playerId?: string | null;
  section?: string;
}) {
  const supabase = sb();
  const { data: userData } = await supabase.auth.getUser();

  const safeName = input.file.name.replace(/[^\w.\-() ]+/g, "_");
  const storagePath = `${input.clubId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from("club-documents")
    .upload(storagePath, input.file, {
      cacheControl: "3600",
      upsert: false,
      contentType: input.file.type || undefined,
    });

  if (uploadError) throw normalizeError(uploadError);

  const { data: signed } = await supabase.storage
    .from("club-documents")
    .createSignedUrl(storagePath, 60 * 60 * 24 * 7);

  const { data, error } = await supabase
    .from("club_documents")
    .insert({
      club_id: input.clubId,
      team_id: input.teamId || null,
      player_id: input.playerId || null,
      title: input.title || input.file.name,
      name: input.title || input.file.name,
      category: input.category || "Document",
      section: input.section || "Club",
      storage_path: storagePath,
      file_path: storagePath,
      file_url: signed?.signedUrl ?? null,
      mime_type: input.file.type || null,
      size_bytes: input.file.size,
      user_id: userData.user?.id ?? null,
      uploaded_by: userData.user?.id ?? null,
    })
    .select("*")
    .single();

  if (error) throw normalizeError(error);
  return rowToDocument(data);
}

export async function loadClubPerformance(clubId: string, teamId?: string) {
  const supabase = sb();

  let query = supabase
    .from("club_player_performance_summary")
    .select("*")
    .eq("club_id", clubId)
    .order("points", { ascending: false });

  if (teamId) query = query.eq("team_id", teamId);

  const { data, error } = await query;
  if (error) throw normalizeError(error);
  return (data ?? []) as PlayerPerformance[];
}

export async function createCommunicationGroup(input: {
  clubId: string;
  name: string;
  description?: string;
  filters: Record<string, unknown>;
}) {
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

  if (error) throw normalizeError(error);
  return data;
}

export async function createClubCommunication(input: {
  clubId: string;
  subject: string;
  body: string;
  groupId?: string | null;
  filters?: Record<string, unknown>;
}) {
  const supabase = sb();
  const { data: userData } = await supabase.auth.getUser();

  const { error } = await supabase
    .from("club_communications")
    .insert({
      club_id: input.clubId,
      title: input.subject,
      subject: input.subject,
      message: input.body,
      body: input.body,
      kind: "email",
      status: "draft",
      group_id: input.groupId || null,
      target_filters: input.filters || {},
      recipients: [],
      created_by: userData.user?.id ?? null,
      user_id: userData.user?.id ?? null,
    });

  if (error) throw normalizeError(error);
}

export async function uploadClubAsset(input: { clubId: string; file: File; kind: "logo" | "banner" }) {
  const supabase = sb();

  const ext = input.file.name.split(".").pop() || "png";
  const path = `${input.clubId}/${input.kind}-${Date.now()}.${ext}`;

  const { error } = await supabase.storage
    .from("club-assets")
    .upload(path, input.file, {
      upsert: true,
      contentType: input.file.type || undefined,
    });

  if (error) throw normalizeError(error);

  const { data } = supabase.storage.from("club-assets").getPublicUrl(path);
  return data.publicUrl;
}

export async function updateClubSettings(
  clubId: string,
  patch: {
    name?: string;
    city?: string;
    logoUrl?: string | null;
    bannerUrl?: string | null;
    primaryColor?: string;
    secondaryColor?: string;
    contactEmail?: string;
    contactPhone?: string;
    address?: string;
  }
) {
  const supabase = sb();

  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name;
  if (patch.city !== undefined) payload.city = patch.city;
  if (patch.logoUrl !== undefined) payload.logo_url = patch.logoUrl;
  if (patch.bannerUrl !== undefined) payload.banner_url = patch.bannerUrl;
  if (patch.primaryColor !== undefined) payload.primary_color = patch.primaryColor;
  if (patch.secondaryColor !== undefined) payload.secondary_color = patch.secondaryColor;
  if (patch.contactEmail !== undefined) payload.contact_email = patch.contactEmail;
  if (patch.contactPhone !== undefined) payload.contact_phone = patch.contactPhone;
  if (patch.address !== undefined) payload.address = patch.address;

  const { error } = await supabase.from("clubs").update(payload).eq("id", clubId);
  if (error) throw normalizeError(error);
}

export async function inviteCoachAndSendEmail(input: {
  clubId: string;
  clubName: string;
  email: string;
  firstName?: string;
  lastName?: string;
  role?: string;
  teamIds?: string[];
}): Promise<void> {
  const supabase = sb();

  const { data: userData } = await supabase.auth.getUser();

  const cleanEmail = input.email.trim().toLowerCase();
  const firstName = input.firstName || "";
  const lastName = input.lastName || "";
  const fullName = `${firstName} ${lastName}`.trim() || cleanEmail;

  const { data: invitation, error: invitationError } = await supabase
    .from("club_member_invitations")
    .insert({
      club_id: input.clubId,
      email: cleanEmail,
      role: input.role || "coach",
      status: "pending",
      invited_by: userData.user?.id ?? null,
      first_name: firstName,
      last_name: lastName,
      token: crypto.randomUUID(),
    })
    .select("id, token")
    .single();

  if (invitationError) throw normalizeError(invitationError);

  const { error: coachError } = await supabase
    .from("club_coaches")
    .insert({
      club_id: input.clubId,
      first_name: firstName,
      last_name: lastName,
      name: fullName,
      email: cleanEmail,
      role: input.role || "coach",
      status: "invited",
      team_ids: input.teamIds || [],
      invited_at: new Date().toISOString(),
    });

  if (coachError) throw normalizeError(coachError);

  const response = await fetch("/api/club/invitations/send", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      invitationId: invitation.id,
      clubId: input.clubId,
      clubName: input.clubName,
      email: cleanEmail,
      firstName,
      token: String(invitation.token),
    }),
  });

  if (!response.ok) {
    const json = await response.json().catch(() => null);
    throw new Error(json?.error || "Invitation créée, mais email non envoyé.");
  }
}

