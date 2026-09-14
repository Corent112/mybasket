import { createAdminClient } from "@/lib/supabase/admin-server";
import {
  getEffectiveSubscriptionForUser,
  isTotalAccessPlan,
} from "@/lib/effective-subscription";
import { PUBLIC_ACCESS_ALIASES } from "@/lib/subscription-permissions";

function isAdminRole(role: unknown) {
  const normalized = String(role ?? "").trim().toLowerCase();
  return normalized === "ceo" || normalized === "superadmin" || normalized === "admin";
}

/**
 * Source unique des droits d'abonnement.
 * CEO / superadmin / admin et Premium ont un accès total.
 * Les autres plans lisent la matrice subscription_access.
 */
export async function userHasSubscriptionAccess(options: {
  supabase: any;
  userId: string;
  email?: string | null;
  sectionKey: string;
}): Promise<boolean> {
  const admin = createAdminClient();
  const client = admin || options.supabase;

  const { data: profile } = await client
    .from("profiles")
    .select("platform_role")
    .eq("id", options.userId)
    .maybeSingle();

  if (isAdminRole(profile?.platform_role)) return true;

  const effective = await getEffectiveSubscriptionForUser({
    supabase: options.supabase,
    userId: options.userId,
    email: options.email,
  });

  if (effective.active && isTotalAccessPlan(effective.plan)) return true;

  const planId = effective.subscription?.plan_id || effective.plan?.id || null;
  if (!effective.active || !planId) return false;

  const aliases =
    PUBLIC_ACCESS_ALIASES[options.sectionKey] ?? [options.sectionKey as any];

  const { data, error } = await client
    .from("subscription_access")
    .select("section_key,enabled")
    .eq("plan_id", planId)
    .in("section_key", aliases);

  if (error) {
    console.error(
      `Lecture droit abonnement ${options.sectionKey} impossible :`,
      error.message,
    );
    return false;
  }

  return (data ?? []).some(
    (row: { enabled?: boolean | null }) => row.enabled === true,
  );
}
