import { createAdminClient } from "@/lib/supabase/admin-server";

type SupabaseLike = any;

export type EffectivePlan = Record<string, any> & {
  id?: string | null;
  name?: string | null;
  slug?: string | null;
  target?: string | null;
};

export type EffectiveSubscription = {
  active: boolean;
  source: "paid" | "free" | null;
  plan: EffectivePlan | null;
  subscription: {
    id?: string | null;
    plan_id?: string | null;
    billing_period?: string | null;
    status?: string | null;
    current_period_start?: string | null;
    current_period_end?: string | null;
  } | null;
};

function normalize(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

export function normalizePlanSlug(value: unknown) {
  return normalize(value).replace(/[\s-]+/g, "_");
}

export function isTotalAccessPlan(plan: EffectivePlan | null | undefined) {
  if (!plan) return false;

  const slug = normalizePlanSlug(plan.slug);
  const name = normalizePlanSlug(plan.name);

  // Premium est l'offre individuelle "accès total" de MyBasket.
  return slug === "premium" || name === "premium";
}

function timestamp(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value)).getTime();
  return Number.isFinite(parsed) ? parsed : null;
}

function subscriptionIsUsable(row: any, now = Date.now()) {
  const status = normalize(row?.status);
  if (!['active', 'trialing'].includes(status)) return false;

  const startsAt = timestamp(row?.current_period_start);
  const endsAt = timestamp(row?.current_period_end);

  // Petite tolérance pour éviter un faux refus lié à l'horloge / au webhook
  // au moment exact d'un renouvellement. Elle ne prolonge pas réellement le plan.
  const clockGraceMs = 6 * 60 * 60 * 1000;

  if (startsAt !== null && startsAt > now + clockGraceMs) return false;
  if (endsAt !== null && endsAt + clockGraceMs < now) return false;
  return true;
}

function grantIsUsable(row: any, now = Date.now()) {
  if (normalize(row?.status) !== "active") return false;
  const startsAt = timestamp(row?.starts_at);
  const endsAt = timestamp(row?.ends_at);
  const clockGraceMs = 6 * 60 * 60 * 1000;

  if (startsAt !== null && startsAt > now + clockGraceMs) return false;
  if (endsAt !== null && endsAt + clockGraceMs < now) return false;
  return true;
}

export async function getEffectiveSubscriptionForUser(options: {
  supabase: SupabaseLike;
  userId: string;
  email?: string | null;
}): Promise<EffectiveSubscription> {
  const admin = createAdminClient();
  const client = admin || options.supabase;
  const now = Date.now();

  // Ne jamais utiliser maybeSingle() ici : après un renouvellement, plusieurs
  // lignes peuvent coexister quelques instants. On choisit la plus récente
  // encore utilisable au lieu de faire tomber l'utilisateur sur /abonnements.
  const { data: subscriptions, error: subscriptionsError } = await client
    .from("subscriptions")
    // Important : ne pas sélectionner ici une liste de colonnes optionnelles.
    // Les schémas historiques de MyBasket ne possèdent pas tous
    // current_period_start/current_period_end. select("*") garde le resolver
    // compatible avec ces bases, tandis que subscriptionIsUsable() sait déjà
    // traiter proprement l'absence de ces dates.
    .select("*")
    .eq("user_id", options.userId)
    .in("status", ["active", "trialing"])
    .order("created_at", { ascending: false })
    .limit(20);

  if (subscriptionsError) {
    console.error(
      "Lecture abonnements impossible :",
      subscriptionsError.message,
    );
  }

  const paidSubscription = (subscriptions ?? []).find(
    (row: any) => row?.plan_id && subscriptionIsUsable(row, now),
  );

  if (paidSubscription?.plan_id) {
    const { data: plan, error: planError } = await client
      .from("subscription_plans")
      .select("*")
      .eq("id", paidSubscription.plan_id)
      .maybeSingle();

    if (planError) {
      console.error("Lecture plan abonnement impossible :", planError.message);
    }

    if (plan) {
      return {
        active: true,
        source: "paid",
        plan,
        subscription: paidSubscription,
      };
    }
  }

  if (admin && options.email) {
    const email = normalize(options.email);
    const { data: grants, error: grantsError } = await admin
      .from("free_access_grants")
      .select("id,user_email,plan_slug,status,starts_at,ends_at,created_at")
      .ilike("user_email", email)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(20);

    if (grantsError) {
      console.error("Lecture accès gratuits impossible :", grantsError.message);
    }

    const grant = (grants ?? []).find((row: any) => grantIsUsable(row, now));

    if (grant?.plan_slug) {
      const wanted = normalizePlanSlug(grant.plan_slug);
      const { data: plans, error: plansError } = await admin
        .from("subscription_plans")
        .select("*")
        .eq("status", "active");

      if (plansError) {
        console.error("Lecture plans impossible :", plansError.message);
      }

      const matchedPlan = (plans ?? []).find((plan: any) => {
        return (
          normalizePlanSlug(plan?.slug) === wanted ||
          normalizePlanSlug(plan?.name) === wanted
        );
      });

      const fallbackPlan: EffectivePlan = {
        id: null,
        name: wanted === "premium" ? "Premium" : String(grant.plan_slug),
        slug: String(grant.plan_slug),
        target: null,
        description: "Accès offert MyBasket",
      };

      return {
        active: true,
        source: "free",
        plan: matchedPlan ?? fallbackPlan,
        subscription: {
          id: grant.id,
          plan_id: matchedPlan?.id ?? null,
          billing_period: null,
          status: "active",
          current_period_start: grant.starts_at ?? null,
          current_period_end: grant.ends_at ?? null,
        },
      };
    }
  }

  return { active: false, source: null, plan: null, subscription: null };
}
