import { createAdminClient } from "@/lib/supabase/admin-server";
import { getEffectiveSubscriptionForUser } from "@/lib/effective-subscription";

export const SUBSCRIPTION_SECTION_ALIASES: Record<string, string[]> = {
  messagerie: ["messagerie"],
  calendrier: ["calendrier"],
  exercices: ["bibliotheque_exercice", "mes_exercices"],
  systemes: ["bibliotheque_systeme"],
  seances: ["bibliotheque_seance"],
  plaquette: ["plaquette"],
  playbooks: ["playbooks"],
  annonces: ["annonces", "mes_annonces"],
  documents: ["papiers"],
  equipes: ["equipes"],
  collaboration: ["collaboration_equipe"],
  management: ["stats_joueur", "stats_jeu", "stats_live", "rotation", "gameplan"],
  coach_space: ["profil_coach"],
  club_space: ["club_space"],
  institutionnel: ["institutionnel"],
};

function isAdminRole(role: unknown) {
  const normalized = String(role || "").toLowerCase();
  return normalized === "ceo" || normalized === "superadmin" || normalized === "admin";
}

/**
 * Source unique des droits d'abonnement.
 * Les plans clients lisent TOUJOURS subscription_access (la matrice CEO).
 * Seuls les rôles plateforme admin contournent la matrice.
 */
export async function userHasSubscriptionAccess(options: {
  supabase: any;
  userId: string;
  email?: string | null;
  sectionKey: string;
}): Promise<boolean> {
  const admin = createAdminClient();
  const client = admin || options.supabase;

  const [{ data: profile }, effective] = await Promise.all([
    client
      .from("profiles")
      .select("platform_role")
      .eq("id", options.userId)
      .maybeSingle(),
    getEffectiveSubscriptionForUser({
      supabase: options.supabase,
      userId: options.userId,
      email: options.email,
    }),
  ]);

  if (isAdminRole(profile?.platform_role)) return true;

  const planId = effective.subscription?.plan_id || effective.plan?.id || null;
  if (!effective.active || !planId) return false;

  const aliases = SUBSCRIPTION_SECTION_ALIASES[options.sectionKey] ?? [options.sectionKey];
  const { data, error } = await client
    .from("subscription_access")
    .select("section_key,enabled")
    .eq("plan_id", planId)
    .in("section_key", aliases);

  if (error) {
    console.error(`Lecture droit abonnement ${options.sectionKey} impossible :`, error.message);
    return false;
  }

  return (data ?? []).some((row: any) => row.enabled === true);
}
