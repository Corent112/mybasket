import { createClient } from "@/lib/supabase/client";

export type ClubRole =
  | "owner"
  | "admin"
  | "direction_technique"
  | "secretariat"
  | "coach"
  | "viewer";

export type ClubDashboardStats = {
  playersCount: number;
  coachesCount: number;
  teamsCount: number;
  sessionsThisMonth: number;
  averageAttendance: number;
  pendingPayments: number;
  documentsCount: number;
  trainingSlotsCount: number;
};

export type MyClub = {
  id: string;
  name: string;
  city: string | null;
  logo_url: string | null;
  banner_url: string | null;
  status: string | null;
  role: ClubRole;
};

export async function getMyClub(): Promise<MyClub | null> {
  return {
    id: "d708e05b-cb8d-43f6-9cbf-b683c3bc2562",
    name: "MyBasket Club Test",
    city: "Paris",
    logo_url: null,
    banner_url: null,
    status: "active",
    role: "owner",
  };
}

export async function getClubStats(
  clubId: string
): Promise<ClubDashboardStats> {
  const supabase = createClient();

  const [
    playersRes,
    coachesRes,
    teamsRes,
    slotsRes,
    paymentsRes,
    documentsRes,
    attendancesRes,
  ] = await Promise.all([
    supabase
      .from("club_players")
      .select("id", { count: "exact", head: true })
      .eq("club_id", clubId)
      .eq("status", "active"),

    supabase
      .from("club_coaches")
      .select("id", { count: "exact", head: true })
      .eq("club_id", clubId)
      .eq("status", "active"),

    supabase
      .from("club_teams")
      .select("id", { count: "exact", head: true })
      .eq("club_id", clubId)
      .eq("status", "active"),

    supabase
      .from("club_training_slots")
      .select("id", { count: "exact", head: true })
      .eq("club_id", clubId),

    supabase
      .from("club_payments")
      .select("id", { count: "exact", head: true })
      .eq("club_id", clubId)
      .neq("status", "paid"),

    supabase
      .from("club_documents")
      .select("id", { count: "exact", head: true })
      .eq("club_id", clubId),

    supabase
      .from("club_attendances")
      .select("status")
      .eq("club_id", clubId),
  ]);

  const attendances = attendancesRes.data ?? [];
  const totalAttendances = attendances.length;
  const presentAttendances = attendances.filter(
    (item: { status?: string | null }) => item.status === "present" || item.status === "late"
  ).length;

  return {
    playersCount: playersRes.count ?? 0,
    coachesCount: coachesRes.count ?? 0,
    teamsCount: teamsRes.count ?? 0,
    sessionsThisMonth: 0,
    averageAttendance:
      totalAttendances > 0
        ? Math.round((presentAttendances / totalAttendances) * 100)
        : 0,
    pendingPayments: paymentsRes.count ?? 0,
    documentsCount: documentsRes.count ?? 0,
    trainingSlotsCount: slotsRes.count ?? 0,
  };
}

export async function getClubTeams(clubId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("club_teams")
    .select("*")
    .eq("club_id", clubId)
    .order("category", { ascending: true });

  if (error) {
    console.error("Erreur getClubTeams:", error);
    return [];
  }

  return data ?? [];
}

export async function getClubPlayers(clubId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("club_players")
    .select("*")
    .eq("club_id", clubId)
    .order("last_name", { ascending: true });

  if (error) {
    console.error("Erreur getClubPlayers:", error);
    return [];
  }

  return data ?? [];
}

export async function getClubCoaches(clubId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("club_coaches")
    .select("*")
    .eq("club_id", clubId)
    .order("last_name", { ascending: true });

  if (error) {
    console.error("Erreur getClubCoaches:", error);
    return [];
  }

  return data ?? [];
}

export async function getClubPlanning(clubId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("club_training_slots")
    .select("*")
    .eq("club_id", clubId)
    .order("day_of_week", { ascending: true })
    .order("start_time", { ascending: true });

  if (error) {
    console.error("Erreur getClubPlanning:", error);
    return [];
  }

  return data ?? [];
}

export async function getClubPayments(clubId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("club_payments")
    .select("*")
    .eq("club_id", clubId)
    .order("due_date", { ascending: true });

  if (error) {
    console.error("Erreur getClubPayments:", error);
    return [];
  }

  return data ?? [];
}

export async function getClubDocuments(clubId: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("club_documents")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erreur getClubDocuments:", error);
    return [];
  }

  return data ?? [];
}

export async function createClubTrainingSlot(payload: {
  club_id: string;
  gym_name: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  category?: string | null;
}) {
  const supabase = createClient();

  const insertPayload = {
    club_id: payload.club_id,
    gym_name: payload.gym_name,
    day_of_week: payload.day_of_week,
    start_time: payload.start_time,
    end_time: payload.end_time,
    category: payload.category ?? null,
  };

  const { data, error } = await supabase
    .from("club_training_slots")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    console.error("Erreur createClubTrainingSlot détaillée:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      payload: insertPayload,
    });

    throw new Error(error.message || "Impossible de créer le créneau club.");
  }

  return data;
}

export async function createClubTeam(payload: {
  club_id: string;
  name: string;
  category?: string | null;
  level?: string | null;
  season?: string | null;
}) {
  const supabase = createClient();

  const insertPayload = {
    club_id: payload.club_id,
    name: payload.name,
    category: payload.category ?? null,
    level: payload.level ?? null,
    season: payload.season ?? null,
    status: "active",
  };

  const { data, error } = await supabase
    .from("club_teams")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    console.error("Erreur createClubTeam détaillée:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      payload: insertPayload,
    });

    throw new Error(error.message || "Impossible de créer l’équipe club.");
  }

  return data;
}

export async function createClubPlayer(payload: {
  club_id: string;
  team_id: string;
  first_name: string;
  last_name: string;
  category?: string | null;
}) {
  const supabase = createClient();

  const insertPayload = {
    club_id: payload.club_id,
    team_id: payload.team_id,
    first_name: payload.first_name,
    last_name: payload.last_name,
    category: payload.category ?? null,
    status: "active",
    license_status: "pending",
    payment_status: "pending",
  };

  const { data, error } = await supabase
    .from("club_players")
    .insert(insertPayload)
    .select("*")
    .single();

  if (error) {
    console.error("Erreur createClubPlayer détaillée:", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
      payload: insertPayload,
    });

    throw new Error(error.message || "Impossible de créer le joueur club.");
  }

  return data;
}