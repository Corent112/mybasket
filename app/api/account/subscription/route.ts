import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeSlug(value: unknown) {
  return normalize(value).replace(/[\s-]+/g, "_");
}

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { active: false, source: null, plan: null, subscription: null },
      { status: 401 },
    );
  }

  const admin = createAdminClient();

  // 1) Abonnement classique actif.
  const paidClient = admin || supabase;

  const { data: paidSubscription, error: paidError } = await paidClient
    .from("subscriptions")
    .select(
      "plan_id,billing_period,status,current_period_start,current_period_end,created_at",
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (paidError) {
    console.error(
      "Lecture abonnement utilisateur impossible :",
      paidError.message,
    );
  }

  if (paidSubscription?.plan_id) {
    const { data: paidPlan, error: paidPlanError } = await paidClient
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
          status: paidSubscription.status ?? "active",
          current_period_start:
            paidSubscription.current_period_start ?? null,
          current_period_end: paidSubscription.current_period_end ?? null,
        },
      });
    }
  }

  // 2) Accès gratuit CEO actif.
  // Le service role est nécessaire car free_access_grants peut être masqué par RLS.
  if (admin && user.email) {
    const email = normalize(user.email);
    const now = Date.now();

    const { data: grants, error: grantError } = await admin
      .from("free_access_grants")
      .select(
        "id,user_email,plan_slug,status,starts_at,ends_at,created_at",
      )
      .ilike("user_email", email)
      .eq("status", "active")
      .order("created_at", { ascending: false });

    if (grantError) {
      console.error("Lecture accès gratuit impossible :", grantError.message);
    }

    const activeGrant = (grants ?? []).find((grant) => {
      const startsAt = grant.starts_at
        ? new Date(grant.starts_at).getTime()
        : Number.NEGATIVE_INFINITY;

      const endsAt = grant.ends_at
        ? new Date(grant.ends_at).getTime()
        : Number.POSITIVE_INFINITY;

      return startsAt <= now && endsAt >= now;
    });

    if (activeGrant?.plan_slug) {
      const { data: plans, error: plansError } = await admin
        .from("subscription_plans")
        .select("*");

      if (plansError) {
        console.error("Lecture plans impossible :", plansError.message);
      } else {
        const wanted = normalizeSlug(activeGrant.plan_slug);

        const matchedPlan = (plans ?? []).find((plan) => {
          const slug = normalizeSlug(plan.slug);
          const name = normalizeSlug(plan.name);

          return slug === wanted || name === wanted;
        });

        if (matchedPlan) {
          return NextResponse.json({
            active: true,
            source: "free",
            plan: matchedPlan,
            subscription: {
              billing_period: null,
              status: "active",
              current_period_start: activeGrant.starts_at ?? null,
              current_period_end: activeGrant.ends_at ?? null,
            },
          });
        }

        // Même si le plan n'est pas dans subscription_plans, on affiche
        // au minimum correctement le slug offert au client.
        return NextResponse.json({
          active: true,
          source: "free",
          plan: {
            id: null,
            name: String(activeGrant.plan_slug),
            slug: String(activeGrant.plan_slug),
            target: null,
            description: "Accès offert MyBasket",
            image_url: null,
            price_monthly_cents: null,
            price_yearly_cents: null,
            storage_gb: null,
            coach_limit_label: null,
            features: null,
          },
          subscription: {
            billing_period: null,
            status: "active",
            current_period_start: activeGrant.starts_at ?? null,
            current_period_end: activeGrant.ends_at ?? null,
          },
        });
      }
    }
  }

  return NextResponse.json({
    active: false,
    source: null,
    plan: null,
    subscription: null,
  });
}
