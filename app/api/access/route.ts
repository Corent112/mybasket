import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { getEffectiveSubscriptionForUser } from "@/lib/effective-subscription";
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

function buildAccess(enabled: Set<string>, forceAll = false) {
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

  const [profileResult, effective] = await Promise.all([
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
  ]);

  if (isAdminRole(profileResult.data?.platform_role)) {
    return NextResponse.json(buildAccess(new Set(), true), {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  const planId = effective.subscription?.plan_id || effective.plan?.id || null;
  if (!effective.active || !planId) {
    return NextResponse.json(buildAccess(new Set()), {
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
    return NextResponse.json(buildAccess(new Set()), {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  const enabled = new Set<string>(
    (rows ?? [])
      .filter((row: { enabled?: boolean | null }) => row.enabled === true)
      .map((row: { section_key: string }) => row.section_key),
  );

  return NextResponse.json(buildAccess(enabled), {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
