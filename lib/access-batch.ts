import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import {
  getEffectiveSubscriptionForUser,
  isTotalAccessPlan,
} from "@/lib/effective-subscription";
import { userHasSubscriptionAccess } from "@/lib/subscription-entitlements";

function isAdminRole(role: unknown) {
  const normalized = String(role ?? "").trim().toLowerCase();
  return normalized === "ceo" || normalized === "superadmin" || normalized === "admin";
}

export async function hasAllAccess(sectionKeys: string[]): Promise<boolean> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const admin = createAdminClient();
  const profileClient = admin || supabase;

  const { data: profile } = await profileClient
    .from("profiles")
    .select("platform_role,status")
    .eq("id", user.id)
    .maybeSingle();

  if (isAdminRole(profile?.platform_role)) return true;

  const effective = await getEffectiveSubscriptionForUser({
    supabase,
    userId: user.id,
    email: user.email,
  });

  if (effective.active && isTotalAccessPlan(effective.plan)) return true;

  const planId = effective.subscription?.plan_id || effective.plan?.id || null;
  if (!effective.active || !planId || !effective.plan) return false;

  const access = await Promise.all(
    sectionKeys.map((sectionKey) =>
      userHasSubscriptionAccess({
        supabase,
        userId: user.id,
        email: user.email,
        sectionKey,
      }),
    ),
  );

  return access.every(Boolean);
}
