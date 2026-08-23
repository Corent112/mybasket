import { createAdminClient } from "@/lib/supabase/admin-server";
import { getEffectiveSubscriptionForUser } from "@/lib/effective-subscription";
import { PUBLIC_ACCESS_ALIASES } from "@/lib/subscription-permissions";

function isAdminRole(role: unknown) {
  const normalized = String(role || "").toLowerCase();
  return normalized === "ceo" || normalized === "superadmin" || normalized === "admin";
}

/**
 * Source unique des droits d'abonnement.
 * Tous les plans clients lisent subscription_access.
 * Seuls les rôles plateforme administrateurs contournent la matrice.
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

  const aliases = PUBLIC_ACCESS_ALIASES[options.sectionKey] ?? [options.sectionKey as any];
  const { data, error } = await client
    .from("subscription_access")
    .select("section_key,enabled")
    .eq("plan_id", planId)
    .in("section_key", aliases);

  if (error) {
    console.error(`Lecture droit abonnement ${options.sectionKey} impossible :`, error.message);
    return false;
  }

  return (data ?? []).some((row: { enabled?: boolean | null }) => row.enabled === true);
}
