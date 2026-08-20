import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { getEffectiveSubscriptionForUser } from "@/lib/effective-subscription";

export const dynamic = "force-dynamic";

const SECTION_ALIASES: Record<string, string[]> = {
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
  management: ["stats_joueur", "stats_jeu", "stats_live", "rotation", "gameplan"],
  coach_space: ["profil_coach"],
  club_space: ["club_space"],
  institutionnel: ["institutionnel"],
};

function accessWithValue(value: boolean) {
  return Object.fromEntries(Object.keys(SECTION_ALIASES).map((key) => [key, value]));
}

function isAdminRole(role: unknown) {
  const normalized = String(role || "").toLowerCase();
  return normalized === "ceo" || normalized === "superadmin" || normalized === "admin";
}

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(accessWithValue(false), {
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

  // Seuls les rôles plateforme administrateurs contournent la matrice.
  // Tous les plans clients, y compris Premium, lisent subscription_access.
  if (isAdminRole(profileResult.data?.platform_role)) {
    return NextResponse.json(accessWithValue(true), {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  const planId = effective.subscription?.plan_id || effective.plan?.id || null;
  if (!effective.active || !planId) {
    return NextResponse.json(accessWithValue(false), {
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
    return NextResponse.json(accessWithValue(false), {
      headers: { "Cache-Control": "private, no-store, max-age=0" },
    });
  }

  const enabled = new Set(
    (rows ?? []).filter((row: any) => row.enabled === true).map((row: any) => row.section_key),
  );

  const result = Object.fromEntries(
    Object.entries(SECTION_ALIASES).map(([publicKey, aliases]) => [
      publicKey,
      aliases.some((alias) => enabled.has(alias)),
    ]),
  );

  return NextResponse.json(result, {
    headers: { "Cache-Control": "private, no-store, max-age=0" },
  });
}
