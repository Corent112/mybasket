import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

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

function emptyAccess() {
  return Object.fromEntries(
    Object.keys(SECTION_ALIASES).map((key) => [key, false]),
  );
}

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(emptyAccess(), { status: 401 });
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
      Object.fromEntries(
        Object.keys(SECTION_ALIASES).map((key) => [key, true]),
      ),
    );
  }

  let effectivePlanId: string | null = null;

  // 1. Abonnement classique.
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("plan_id,status")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (subscription?.plan_id) {
    effectivePlanId = String(subscription.plan_id);
  }

  // 2. Sinon, accès gratuit CEO.
  // Utilisation du client admin afin que le grant fonctionne même si
  // free_access_grants n'est pas lisible directement par l'utilisateur via RLS.
  if (!effectivePlanId && user.email) {
    const admin = createAdminClient();

    if (admin) {
      const now = new Date().toISOString();
      const email = normalize(user.email);

      const { data: grants, error: grantError } = await admin
        .from("free_access_grants")
        .select("id,user_email,plan_slug,status,starts_at,ends_at,created_at")
        .ilike("user_email", email)
        .eq("status", "active")
        .order("created_at", { ascending: false });

      if (grantError) {
        console.error("Lecture accès gratuit impossible :", grantError.message);
      }

      const activeGrant = (grants ?? []).find((grant) => {
        const startsAt = grant.starts_at ? new Date(grant.starts_at).getTime() : 0;
        const endsAt = grant.ends_at
          ? new Date(grant.ends_at).getTime()
          : Number.POSITIVE_INFINITY;
        const current = new Date(now).getTime();

        return (
          (!startsAt || startsAt <= current) &&
          (!endsAt || endsAt >= current)
        );
      });

      if (activeGrant?.plan_slug) {
        const { data: plans, error: plansError } = await admin
          .from("subscription_plans")
          .select("id,slug,name,status");

        if (plansError) {
          console.error("Lecture plans impossible :", plansError.message);
        } else {
          const wanted = normalize(activeGrant.plan_slug).replace(/[\s-]+/g, "_");

          const matched = (plans ?? []).find((plan) => {
            if (plan.status && plan.status !== "active") return false;

            const slug = normalize(plan.slug).replace(/[\s-]+/g, "_");
            const name = normalize(plan.name).replace(/[\s-]+/g, "_");

            return slug === wanted || name === wanted;
          });

          if (matched?.id) {
            effectivePlanId = String(matched.id);
          } else {
            console.error(
              `Accès gratuit actif mais plan "${activeGrant.plan_slug}" introuvable dans subscription_plans.`,
            );
          }
        }
      }
    }
  }

  if (!effectivePlanId) {
    return NextResponse.json(emptyAccess());
  }

  const admin = createAdminClient();

  const accessQuery = admin
    ? admin
        .from("subscription_access")
        .select("section_key,enabled")
        .eq("plan_id", effectivePlanId)
    : supabase
        .from("subscription_access")
        .select("section_key,enabled")
        .eq("plan_id", effectivePlanId);

  const { data: rows, error: accessError } = await accessQuery;

  if (accessError) {
    console.error("Lecture droits abonnement impossible :", accessError.message);
    return NextResponse.json(emptyAccess());
  }

  const enabled = new Set(
    (rows ?? [])
      .filter((row) => row.enabled)
      .map((row) => row.section_key),
  );

  const result = Object.fromEntries(
    Object.entries(SECTION_ALIASES).map(([publicKey, aliases]) => [
      publicKey,
      aliases.some((alias) => enabled.has(alias)),
    ]),
  );

  return NextResponse.json(result);
}
