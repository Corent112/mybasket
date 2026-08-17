import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeSlug(value: unknown) {
  return normalize(value).replace(/[\s-]+/g, "_");
}

function isStillValid(endsAt: unknown) {
  if (!endsAt) return true;
  const value = new Date(String(endsAt)).getTime();
  if (Number.isNaN(value)) return true;
  return value >= Date.now();
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { active: false, source: null, plan: null, subscription: null },
      { status: 401 },
    );
  }

  const admin = createAdminClient();
  const client = admin || supabase;

  // ------------------------------------------------------------
  // 1. Abonnement payant actif
  // ------------------------------------------------------------
  // On ne sélectionne que les colonnes réellement nécessaires pour éviter
  // qu'une ancienne colonne absente fasse échouer toute la détection.
  const { data: paidSubscriptions, error: paidError } = await client
    .from("subscriptions")
    .select("plan_id,billing_period,status,current_period_end,created_at")
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(5);

  if (paidError) {
    console.error("Lecture abonnement utilisateur impossible :", paidError.message);
  }

  const paidSubscription = (paidSubscriptions ?? []).find(
    (row) => row?.plan_id && isStillValid(row?.current_period_end),
  );

  if (paidSubscription?.plan_id) {
    const { data: paidPlan, error: paidPlanError } = await client
      .from("subscription_plans")
      .select("*")
      .eq("id", paidSubscription.plan_id)
      .maybeSingle();

    if (paidPlanError) {
      console.error("Lecture plan abonnement impossible :", paidPlanError.message);
    }

    if (paidPlan) {
      return NextResponse.json({
        active: true,
        source: "paid",
        plan: paidPlan,
        subscription: {
          billing_period: paidSubscription.billing_period ?? null,
          status: "active",
          current_period_end: paidSubscription.current_period_end ?? null,
        },
      });
    }
  }

  // ------------------------------------------------------------
  // 2. Accès gratuit actif
  // ------------------------------------------------------------
  // Le statut "active" dans l'admin est la source de vérité.
  // On ne bloque plus un accès à cause d'un décalage horaire sur starts_at.
  if (admin && user.email) {
    const connectedEmail = normalize(user.email);

    const { data: grants, error: grantsError } = await admin
      .from("free_access_grants")
      .select(
        "id,user_email,plan_slug,status,starts_at,ends_at,created_at",
      )
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (grantsError) {
      console.error("Lecture accès gratuits impossible :", grantsError.message);
    }

    const activeGrant = (grants ?? []).find((grant) => {
      const grantEmail = normalize(grant?.user_email);

      return (
        grantEmail === connectedEmail &&
        grant?.status === "active" &&
        isStillValid(grant?.ends_at)
      );
    });

    if (activeGrant?.plan_slug) {
      const { data: plans, error: plansError } = await admin
        .from("subscription_plans")
        .select("*");

      if (plansError) {
        console.error("Lecture plans impossible :", plansError.message);
      }

      const wanted = normalizeSlug(activeGrant.plan_slug);

      const matchedPlan = (plans ?? []).find((plan) => {
        const slug = normalizeSlug(plan?.slug);
        const name = normalizeSlug(plan?.name);

        return slug === wanted || name === wanted;
      });

      const plan =
        matchedPlan ??
        ({
          id: null,
          name:
            wanted === "premium"
              ? "Premium"
              : wanted === "club_gold"
                ? "Club Gold"
                : String(activeGrant.plan_slug),
          slug: String(activeGrant.plan_slug),
          target: null,
          description: "Accès offert MyBasket",
          image_url: null,
          price_monthly_cents: null,
          price_yearly_cents: null,
          storage_gb: null,
          coach_limit_label: null,
          features: null,
        } as const);

      return NextResponse.json({
        active: true,
        source: "free",
        plan,
        subscription: {
          billing_period: null,
          status: "active",
          current_period_end: activeGrant.ends_at ?? null,
        },
      });
    }
  }

  return NextResponse.json({
    active: false,
    source: null,
    plan: null,
    subscription: null,
  });
}
