import { createClient } from "@/lib/supabase/server";

type AccessResult = { userId: string | null; allowed: boolean };
type LimitResult = { userId: string | null; limit: number | null; count: number; canCreate: boolean };
type ClubSubscriptionAccess = {
  userId: string | null;
  planId: string | null;
  planName: string | null;
  planSlug: string | null;
  hasClubSubscription: boolean;
  isAdmin: boolean;
  limits: {
    maxCoaches: number | null;
    maxTeams: number | null;
    maxPlayers: number | null;
    maxDocuments: number | null;
    storageGb: number | null;
  };
};

const SECTION_ALIASES: Record<string, string[]> = {
  messagerie: ["messagerie"], calendrier: ["calendrier"],
  exercices: ["bibliotheque_exercice", "mes_exercices"],
  systemes: ["bibliotheque_systeme"], seances: ["bibliotheque_seance"],
  plaquette: ["plaquette"], playbooks: ["playbooks"],
  annonces: ["annonces", "mes_annonces"], documents: ["papiers"],
  equipes: ["equipes"],
  management: ["stats_joueur", "stats_jeu", "stats_live", "rotation", "gameplan"],
  coach_space: ["profil_coach"], club_space: ["club_space"],
};

async function getContext() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { supabase, user: null, profile: null, subscription: null, plan: null };

  const { data: profile } = await supabase.from("profiles")
    .select("platform_role,status").eq("id", user.id).maybeSingle();
  const { data: subscription } = await supabase.from("subscriptions")
    .select("plan_id,status").eq("user_id", user.id).eq("status", "active")
    .order("created_at", { ascending: false }).limit(1).maybeSingle();
  let plan = null;
  if (subscription?.plan_id) {
    const { data } = await supabase.from("subscription_plans")
      .select("id,name,slug,target,max_teams,max_documents,storage_gb,coach_limit_label")
      .eq("id", subscription.plan_id).maybeSingle();
    plan = data;
  }
  return { supabase, user, profile, subscription, plan };
}

function isAdminRole(role: string | null | undefined) {
  return role === "ceo" || role === "superadmin" || role === "admin";
}

export async function hasAccess(sectionKey: string): Promise<boolean> {
  const { supabase, user, profile, subscription } = await getContext();
  if (!user) return false;
  if (isAdminRole(profile?.platform_role)) return true;
  if (!subscription?.plan_id) return false;

  const aliases = SECTION_ALIASES[sectionKey] ?? [sectionKey];
  const { data, error } = await supabase.from("subscription_access")
    .select("section_key,enabled").eq("plan_id", subscription.plan_id)
    .in("section_key", aliases);
  if (error) {
    console.error("Erreur vérification accès:", error.message);
    return false;
  }
  return (data ?? []).some((row: { enabled: boolean | null }) => row.enabled === true);
}

export async function getAccessResult(sectionKey: string): Promise<AccessResult> {
  const { user } = await getContext();
  return { userId: user?.id ?? null, allowed: await hasAccess(sectionKey) };
}

async function getLimitResult(options: {
  limitKey: "max_teams" | "max_documents" | "max_playbooks";
  table: string;
  ownerColumn?: string;
}): Promise<LimitResult> {
  const { supabase, user, profile, plan } = await getContext();
  if (!user) return { userId: null, limit: 0, count: 0, canCreate: false };
  if (isAdminRole(profile?.platform_role)) return { userId: user.id, limit: null, count: 0, canCreate: true };
  if (!plan) return { userId: user.id, limit: 0, count: 0, canCreate: false };

  const limit = Number((plan as Record<string, unknown>)[options.limitKey]);
  const normalizedLimit = Number.isFinite(limit) ? limit : null;
  const ownerColumn = options.ownerColumn ?? "user_id";
  const { count, error } = await supabase.from(options.table)
    .select("*", { count: "exact", head: true }).eq(ownerColumn, user.id);
  if (error) return { userId: user.id, limit: normalizedLimit, count: 0, canCreate: false };
  const current = count ?? 0;
  return { userId: user.id, limit: normalizedLimit, count: current,
    canCreate: normalizedLimit === null ? true : current < normalizedLimit };
}

export async function getTeamLimitForCurrentUser() {
  return getLimitResult({ limitKey: "max_teams", table: "teams", ownerColumn: "user_id" });
}
export async function canCreateTeam() { return (await getTeamLimitForCurrentUser()).canCreate; }
export async function getPlaybookLimitForCurrentUser() {
  return getLimitResult({ limitKey: "max_playbooks", table: "playbooks", ownerColumn: "user_id" });
}
export async function canCreatePlaybook() { return (await getPlaybookLimitForCurrentUser()).canCreate; }
export async function getDocumentLimitForCurrentUser() {
  return getLimitResult({ limitKey: "max_documents", table: "user_documents", ownerColumn: "user_id" });
}
export async function canUploadDocument() { return (await getDocumentLimitForCurrentUser()).canCreate; }

export async function getClubSubscriptionAccess(): Promise<ClubSubscriptionAccess> {
  const { user, profile, subscription, plan } = await getContext();
  if (!user) return { userId: null, planId: null, planName: null, planSlug: null,
    hasClubSubscription: false, isAdmin: false,
    limits: { maxCoaches: 0, maxTeams: 0, maxPlayers: 0, maxDocuments: 0, storageGb: 0 } };

  const isAdmin = isAdminRole(profile?.platform_role);
  const isClub = isAdmin || plan?.target === "club" || String(plan?.slug ?? "").startsWith("club-");
  return {
    userId: user.id, planId: subscription?.plan_id ?? null,
    planName: isAdmin ? "Accès total CEO" : plan?.name ?? null,
    planSlug: isAdmin ? "ceo-full-access" : plan?.slug ?? null,
    hasClubSubscription: isClub, isAdmin,
    limits: {
      maxCoaches: null,
      maxTeams: isAdmin ? null : plan?.max_teams ?? 0,
      maxPlayers: null,
      maxDocuments: isAdmin ? null : plan?.max_documents ?? 0,
      storageGb: isAdmin ? null : plan?.storage_gb ?? 0,
    },
  };
}

export async function canAccessClubSpace() { return hasAccess("club_space"); }

export async function getClubLimitForCurrentUser(options: {
  table: string; clubId: string; clubColumn?: string;
  limitKey: keyof ClubSubscriptionAccess["limits"];
}): Promise<LimitResult> {
  const access = await getClubSubscriptionAccess();
  if (!access.userId) return { userId: null, limit: 0, count: 0, canCreate: false };
  if (access.isAdmin) return { userId: access.userId, limit: null, count: 0, canCreate: true };
  if (!access.hasClubSubscription) return { userId: access.userId, limit: 0, count: 0, canCreate: false };

  const supabase = await createClient();
  const limit = access.limits[options.limitKey];
  const { count, error } = await supabase.from(options.table)
    .select("*", { count: "exact", head: true })
    .eq(options.clubColumn ?? "club_id", options.clubId);
  if (error) return { userId: access.userId, limit, count: 0, canCreate: false };
  const current = count ?? 0;
  return { userId: access.userId, limit, count: current,
    canCreate: limit === null ? true : current < limit };
}

export async function canCreateClubTeam(clubId: string) {
  return (await getClubLimitForCurrentUser({ table: "club_teams", clubId, limitKey: "maxTeams" })).canCreate;
}
export async function canCreateClubCoach(clubId: string) {
  return (await getClubLimitForCurrentUser({ table: "club_staff", clubId, limitKey: "maxCoaches" })).canCreate;
}
export async function canCreateClubPlayer(clubId: string) {
  return (await getClubLimitForCurrentUser({ table: "club_players", clubId, limitKey: "maxPlayers" })).canCreate;
}
export async function canUploadClubDocument(clubId: string) {
  return (await getClubLimitForCurrentUser({ table: "club_documents", clubId, limitKey: "maxDocuments" })).canCreate;
}
