import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      Object.fromEntries(Object.keys(SECTION_ALIASES).map((key) => [key, false])),
      { status: 401 }
    );
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role,status")
    .eq("id", user.id)
    .maybeSingle();

  const role = profile?.platform_role;
  const isCeo = role === "ceo" || role === "superadmin" || role === "admin";

  if (isCeo) {
    return NextResponse.json(
      Object.fromEntries(Object.keys(SECTION_ALIASES).map((key) => [key, true]))
    );
  }

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan_id,status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!subscription?.plan_id) {
    return NextResponse.json(
      Object.fromEntries(Object.keys(SECTION_ALIASES).map((key) => [key, false]))
    );
  }

  const { data: rows } = await supabase
    .from("subscription_access")
    .select("section_key,enabled")
    .eq("plan_id", subscription.plan_id);

  const enabled = new Set(
    (rows ?? [])
      .filter((row) => row.enabled)
      .map((row) => row.section_key)
  );

  const result = Object.fromEntries(
    Object.entries(SECTION_ALIASES).map(([publicKey, aliases]) => [
      publicKey,
      aliases.some((alias) => enabled.has(alias)),
    ])
  );

  return NextResponse.json(result);
}
