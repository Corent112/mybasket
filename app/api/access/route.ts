import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import {
  getEffectiveSubscriptionForUser,
  isTotalAccessPlan,
} from "@/lib/effective-subscription";
import {
  ALL_MATRIX_PERMISSION_KEYS,
  PUBLIC_ACCESS_ALIASES,
  SYSTEM_ACCESS,
} from "@/lib/subscription-permissions";

export const dynamic = "force-dynamic";

function isAdminRole(role: unknown) {
  const normalized = String(role || "").toLowerCase();
  return normalized === "ceo" || normalized === "superadmin" || normalized === "admin";
}

function buildAccess(enabled: Set<string>, forceAll = false, institutionMember = false) {
  const exact = Object.fromEntries(
    ALL_MATRIX_PERMISSION_KEYS.map((key) => [key, forceAll || enabled.has(key)]),
  );

  const aliases = Object.fromEntries(
    Object.entries(PUBLIC_ACCESS_ALIASES).map(([publicKey, keys]) => [
      publicKey,
      forceAll || keys.some((key) => enabled.has(key)),
    ]),
  );

  return {
    ...exact,
    ...aliases,
    ...SYSTEM_ACCESS,
    institutionnel: forceAll || institutionMember || enabled.has("institutionnel"),
  };
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(buildAccess(new Set()), {
      status: 401,
      headers: { "Cache-Control": "no-store" },
    });
  }

  const membershipClient = createAdminClient() || supabase;
  const institutionAccess = async () => {
    const memberships = await membershipClient.from("institutional_members")
      .select("structure_id").eq("user_id", user.id).eq("status", "active");
    if (memberships.error || !memberships.data?.length) return false;
    const structures = await membershipClient.from("institutional_structures")
      .select("id").in("id", memberships.data.map(row => row.structure_id))
      .eq("archived", false).limit(1);
    return !structures.error && !!structures.data?.length;
  };
  const [profileResult, effective, institutionMember] = await Promise.all([
    supabase
      .from("profiles")
      .select("platform_role,status")
      .eq("id", user.id)
      .maybeSingle(),
    getEffectiveSubscriptionForUser({
      supabase,
      userId: user.id,
      email: user.email,
    }),
    institutionAccess(),
  ]);

  if (isAdminRole(profileResult.data?.platform_role)) {
    return NextResponse.json(buildAccess(new Set(), true), {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  if (effective.active && isTotalAccessPlan(effective.plan)) {
    return NextResponse.json(buildAccess(new Set(), true), {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  const planId = effective.subscription?.plan_id || effective.plan?.id || null;
  if (!effective.active || !planId) {
    return NextResponse.json(buildAccess(new Set(), false, institutionMember), {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  const admin = createAdminClient();
  const client = admin || supabase;
  const { data: rows, error } = await client
    .from("subscription_access")
    .select("section_key,enabled")
    .eq("plan_id", planId);

  if (error) {
    console.error("Lecture droits abonnement impossible :", error.message);
    return NextResponse.json(buildAccess(new Set(), false, institutionMember), {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  const enabled = new Set<string>(
    (rows ?? [])
      .filter((row: { enabled?: boolean | null }) => row.enabled === true)
      .map((row: { section_key: string }) => row.section_key),
  );

  return NextResponse.json(buildAccess(enabled, false, institutionMember), {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
