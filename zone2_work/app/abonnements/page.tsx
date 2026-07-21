"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";

type Target = "individual" | "club";
type Billing = "monthly" | "yearly";

type Plan = {
  id: string;
  name: string;
  slug: string | null;
  target: Target;
  price_cents: number | null;
  price_monthly_cents: number | null;
  price_yearly_cents: number | null;
  period: string | null;
  storage_gb: number | null;
  coach_limit_label: string | null;
  description: string | null;
  features: unknown;
  status: string | null;
  is_recommended: boolean | null;
  sort_order: number | null;
};

function toFeatureList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);

  if (typeof value === "string") {
    const text = value.trim();
    if (!text) return [];

    try {
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {}

    return text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean);
  }

  return [];
}

function formatPrice(cents: number | null | undefined) {
  if (cents === null || cents === undefined) return "—";
  if (cents === 0) return "0 €";

  return (
    (cents / 100).toLocaleString("fr-FR", {
      minimumFractionDigits: cents % 100 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    }) + " €"
  );
}

function getPriceCents(plan: Plan, billing: Billing) {
  return billing === "yearly"
    ? plan.price_yearly_cents ?? plan.price_cents ?? 0
    : plan.price_monthly_cents ?? plan.price_cents ?? 0;
}

function getSaving(plan: Plan) {
  const monthly = plan.price_monthly_cents ?? plan.price_cents ?? 0;
  const yearly = plan.price_yearly_cents ?? 0;

  if (!monthly || !yearly) return 0;

  return Math.max(monthly * 12 - yearly, 0);
}

function logSupabaseError(context: string, error: unknown) {
  if (
    error &&
    typeof error === "object" &&
    ("message" in error || "code" in error || "details" in error || "hint" in error)
  ) {
    const err = error as {
      message?: string;
      code?: string;
      details?: string;
      hint?: string;
    };

    console.error(context, {
      message: err.message,
      code: err.code,
      details: err.details,
      hint: err.hint,
    });

    return;
  }

  console.error(context, error);
}

export default function AbonnementsPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [billing, setBilling] = useState<Billing>("monthly");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    async function loadPlans() {
      setLoading(true);

      try {
        const supabase = createClient();

        const { data, error } = await supabase
          .from("subscription_plans")
          .select("*")
          .eq("status", "active")
          .order("sort_order", { ascending: true });

        if (!mounted) return;

        if (error) {
          logSupabaseError("Erreur chargement abonnements:", error);
          setPlans([]);
          return;
        }

        setPlans((data || []) as Plan[]);
      } catch (error) {
        if (!mounted) return;

        logSupabaseError("Erreur inattendue loadPlans:", error);
        setPlans([]);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadPlans();

    return () => {
      mounted = false;
    };
  }, []);

  const individualPlans = useMemo(
    () => plans.filter((plan) => plan.target === "individual"),
    [plans]
  );

  const clubPlans = useMemo(
    () => plans.filter((plan) => plan.target === "club"),
    [plans]
  );

  return (
    <main className="page">
      <section className="hero">
        <div className="heroTop">
          <span />
          <p>MYBASKET</p>
          <span />
        </div>

        <h1>Abonnements</h1>

        <p className="intro">
          Choisis l’offre adaptée à ton profil, ton équipe ou ton club.
        </p>

        <div className="billing">
          <button
            type="button"
            className={billing === "monthly" ? "active" : ""}
            onClick={() => setBilling("monthly")}
          >
            Mensuel
          </button>

          <button
            type="button"
            className={billing === "yearly" ? "active" : ""}
            onClick={() => setBilling("yearly")}
          >
            Annuel
            <small>2 mois offerts</small>
          </button>
        </div>
      </section>

      {loading ? (
        <div className="loading">Chargement des offres...</div>
      ) : (
        <>
          <PlansSection
            title="Abonnements individuels"
            subtitle="Basic, Pro ou Premium : l’offre adaptée à ton utilisation."
            icon="👤"
            plans={individualPlans}
            billing={billing}
          />

          <PlansSection
            title="Abonnements clubs"
            subtitle="Bronze, Silver ou Gold : selon la taille de ton staff."
            icon="🏀"
            plans={clubPlans}
            billing={billing}
          />

          {plans.length === 0 && (
            <div className="empty">
              Aucune offre active pour le moment.
            </div>
          )}
        </>
      )}

      <section className="bottom">
        <div>
          <strong>Besoin d’un conseil ?</strong>
          <p>Notre équipe t’aide à choisir la bonne formule.</p>
        </div>

        <Link href="/contact">Nous contacter</Link>
      </section>

      <style jsx>{`
        .page {
          min-height: 100vh;
          background:
            radial-gradient(circle at top left, rgba(212, 162, 76, 0.16), transparent 30%),
            linear-gradient(180deg, #fff 0%, #f8f4ee 100%);
          padding: 56px 24px 80px;
          color: #17121a;
        }

        .hero {
          max-width: 1100px;
          margin: 0 auto 42px;
          text-align: center;
        }

        .heroTop {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 16px;
          margin-bottom: 10px;
        }

        .heroTop span {
          width: 90px;
          height: 2px;
          background: #d4a24c;
        }

        .heroTop p {
          margin: 0;
          color: #6b1a2c;
          font-weight: 1000;
          letter-spacing: 0.24em;
          font-size: 13px;
        }

        h1 {
          margin: 0;
          color: #6b1a2c;
          font-size: clamp(48px, 8vw, 92px);
          text-transform: uppercase;
          letter-spacing: -0.05em;
          line-height: 0.9;
        }

        .intro {
          max-width: 650px;
          margin: 22px auto 0;
          color: #5d5358;
          font-size: 18px;
          line-height: 1.6;
        }

        .billing {
          width: fit-content;
          margin: 30px auto 0;
          padding: 7px;
          display: flex;
          gap: 7px;
          background: white;
          border: 1px solid rgba(107, 26, 44, 0.1);
          border-radius: 999px;
          box-shadow: 0 18px 40px rgba(107, 26, 44, 0.1);
        }

        .billing button {
          border: none;
          border-radius: 999px;
          padding: 13px 24px;
          background: transparent;
          color: #6b1a2c;
          font-weight: 1000;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .billing button.active {
          background: #6b1a2c;
          color: white;
        }

        .billing small {
          background: #d4a24c;
          color: #26170b;
          padding: 4px 8px;
          border-radius: 999px;
          font-weight: 1000;
        }

        .loading,
        .empty {
          max-width: 1180px;
          margin: 0 auto;
          background: white;
          border-radius: 26px;
          padding: 34px;
          text-align: center;
          font-weight: 900;
          color: #6b1a2c;
          box-shadow: 0 18px 45px rgba(0, 0, 0, 0.08);
        }

        .bottom {
          max-width: 1180px;
          margin: 38px auto 0;
          background: linear-gradient(135deg, #6b1a2c, #8a0f24);
          color: white;
          border-radius: 28px;
          padding: 30px 34px;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          box-shadow: 0 22px 45px rgba(107, 26, 44, 0.22);
        }

        .bottom strong {
          font-size: 28px;
          text-transform: uppercase;
        }

        .bottom p {
          margin: 6px 0 0;
          color: rgba(255, 255, 255, 0.78);
        }

        .bottom a {
          background: linear-gradient(135deg, #d4a24c, #f3cf78);
          color: #24170b;
          text-decoration: none;
          padding: 15px 28px;
          border-radius: 14px;
          font-weight: 1000;
          text-transform: uppercase;
          white-space: nowrap;
        }

        @media (max-width: 700px) {
          .page {
            padding: 42px 16px 64px;
          }

          .heroTop span {
            width: 42px;
          }

          .billing {
            width: 100%;
          }

          .billing button {
            flex: 1;
            justify-content: center;
            padding: 12px 10px;
          }

          .billing small {
            display: none;
          }

          .bottom {
            flex-direction: column;
            align-items: flex-start;
          }

          .bottom a {
            width: 100%;
            text-align: center;
          }
        }
      `}</style>
    </main>
  );
}

function PlansSection({
  title,
  subtitle,
  icon,
  plans,
  billing,
}: {
  title: string;
  subtitle: string;
  icon: string;
  plans: Plan[];
  billing: Billing;
}) {
  if (plans.length === 0) return null;

  return (
    <section className="section">
      <div className="sectionHead">
        <div className="icon">{icon}</div>

        <div>
          <h2>{title}</h2>
          <p>{subtitle}</p>
        </div>
      </div>

      <div className="grid">
        {plans.map((plan) => (
          <PlanCard key={plan.id} plan={plan} billing={billing} />
        ))}
      </div>

      <style jsx>{`
        .section {
          max-width: 1180px;
          margin: 0 auto 32px;
          background: rgba(255, 255, 255, 0.78);
          border: 1px solid rgba(107, 26, 44, 0.08);
          border-radius: 34px;
          padding: 30px;
          box-shadow: 0 22px 55px rgba(0, 0, 0, 0.07);
          backdrop-filter: blur(10px);
        }

        .sectionHead {
          display: flex;
          align-items: center;
          gap: 18px;
          margin-bottom: 26px;
        }

        .icon {
          width: 70px;
          height: 70px;
          border-radius: 22px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, #6b1a2c, #8a0f24);
          color: white;
          font-size: 32px;
          box-shadow: 0 14px 26px rgba(107, 26, 44, 0.2);
        }

        h2 {
          margin: 0;
          color: #6b1a2c;
          font-size: 34px;
          text-transform: uppercase;
          line-height: 1;
        }

        p {
          margin: 8px 0 0;
          color: #5f555a;
          font-size: 15px;
        }

        .grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 22px;
        }

        @media (max-width: 950px) {
          .grid {
            grid-template-columns: 1fr;
          }

          .sectionHead {
            align-items: flex-start;
          }
        }

        @media (max-width: 560px) {
          .section {
            padding: 20px;
          }

          .icon {
            width: 56px;
            height: 56px;
            border-radius: 18px;
            font-size: 26px;
          }

          h2 {
            font-size: 24px;
          }
        }
      `}</style>
    </section>
  );
}

function PlanCard({ plan, billing }: { plan: Plan; billing: Billing }) {
  const features = toFeatureList(plan.features);
  const priceCents = getPriceCents(plan, billing);
  const saving = getSaving(plan);
  const isClub = plan.target === "club";

  const addToCart = async () => {
    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      logSupabaseError("Erreur récupération utilisateur:", userError);
    }

    if (!user) {
      window.location.href = "/connexion?next=/abonnements";
      return;
    }

    const { data: existing, error: existingError } = await supabase
      .from("cart_items")
      .select("id, quantity")
      .eq("user_id", user.id)
      .eq("item_type", "subscription")
      .eq("item_id", plan.id)
      .eq("assigned_to", billing)
      .maybeSingle();

    if (existingError) {
      logSupabaseError("Erreur vérification panier:", existingError);
      alert("Erreur lors de la vérification du panier.");
      return;
    }

    if (existing) {
      const { error: updateError } = await supabase
        .from("cart_items")
        .update({ quantity: Number(existing.quantity ?? 1) + 1 })
        .eq("id", existing.id);

      if (updateError) {
        logSupabaseError("Erreur mise à jour panier:", updateError);
        alert("Erreur lors de la mise à jour du panier.");
        return;
      }
    } else {
      const { error: insertError } = await supabase.from("cart_items").insert({
        user_id: user.id,
        item_type: "subscription",
        item_id: plan.id,
        title: plan.name,
        description: plan.description,
        image_url: null,
        price: priceCents / 100,
        quantity: 1,
        duration_minutes: null,
        assigned_to: billing,
        sort_order: 0,
      });

      if (insertError) {
        logSupabaseError("Erreur ajout panier:", insertError);
        alert("Erreur lors de l'ajout au panier.");
        return;
      }
    }

    window.location.href = "/panier";
  };

  return (
    <article className={`card ${plan.is_recommended ? "featured" : ""}`}>
      {plan.is_recommended && <div className="ribbon">Recommandé</div>}

      <div className="top">
        <div className={`badge ${isClub ? "club" : ""}`}>
          {plan.name.slice(0, 1)}
        </div>

        <div>
          <h3>{plan.name}</h3>
          {plan.coach_limit_label && (
            <p className="coach">{plan.coach_limit_label}</p>
          )}
        </div>
      </div>

      {plan.description && <p className="desc">{plan.description}</p>}

      <div className="price">
        {formatPrice(priceCents)}
        {priceCents !== 0 && (
          <span>{billing === "yearly" ? "/ an" : "/ mois"}</span>
        )}
      </div>

      {billing === "yearly" && saving > 0 && (
        <div className="saving">Économisez {formatPrice(saving)}</div>
      )}

      {plan.storage_gb !== null && (
        <div className="storage">☁️ {plan.storage_gb} Go de stockage</div>
      )}

      <ul>
        {features.length > 0 ? (
          features.map((feature, index) => <li key={index}>{feature}</li>)
        ) : (
          <li>Détails à venir</li>
        )}
      </ul>

      <button type="button" className="cta" onClick={addToCart}>
        <span className="cart-icon">🛒</span>
        Ajouter au panier
      </button>

      <style jsx>{`
        .card {
          position: relative;
          background: white;
          border-radius: 28px;
          padding: 28px;
          border: 1px solid rgba(107, 26, 44, 0.1);
          box-shadow: 0 18px 38px rgba(0, 0, 0, 0.08);
          display: flex;
          flex-direction: column;
          min-height: 100%;
          transition: 0.2s ease;
          overflow: hidden;
        }

        .card::before {
          content: "";
          position: absolute;
          inset: 0 0 auto 0;
          height: 7px;
          background: linear-gradient(90deg, #6b1a2c, #d4a24c);
        }

        .card:hover {
          transform: translateY(-6px);
        }

        .featured {
          border: 2px solid #d4a24c;
        }

        .ribbon {
          position: absolute;
          top: 16px;
          right: -38px;
          background: #d4a24c;
          color: #24170b;
          font-size: 12px;
          font-weight: 1000;
          text-transform: uppercase;
          padding: 8px 42px;
          transform: rotate(35deg);
        }

        .top {
          display: flex;
          align-items: center;
          gap: 14px;
          margin-bottom: 18px;
        }

        .badge {
          width: 56px;
          height: 56px;
          border-radius: 18px;
          display: grid;
          place-items: center;
          background: linear-gradient(135deg, #6b1a2c, #8a0f24);
          color: white;
          font-weight: 1000;
          font-size: 24px;
        }

        .badge.club {
          background: linear-gradient(135deg, #d4a24c, #f3cf78);
          color: #321018;
        }

        h3 {
          margin: 0;
          color: #6b1a2c;
          text-transform: uppercase;
          font-size: 28px;
        }

        .coach,
        .desc {
          color: #5d5358;
          font-weight: 800;
        }

        .desc {
          margin: 0 0 18px;
          line-height: 1.5;
        }

        .price {
          color: #17121a;
          font-size: 44px;
          font-weight: 1000;
          margin-bottom: 12px;
        }

        .price span {
          display: block;
          font-size: 14px;
          color: #6c6166;
        }

        .saving,
        .storage {
          width: fit-content;
          background: #fff4d8;
          color: #6b1a2c;
          border-radius: 999px;
          padding: 8px 12px;
          font-size: 12px;
          font-weight: 1000;
          margin-bottom: 14px;
        }

        ul {
          list-style: none;
          padding: 20px 0 0;
          margin: 0 0 24px;
          border-top: 1px solid rgba(107, 26, 44, 0.1);
          display: grid;
          gap: 12px;
          flex: 1;
        }

        li {
          font-size: 14px;
          font-weight: 700;
        }

        li::before {
          content: "✓";
          margin-right: 9px;
          color: #6b1a2c;
          font-weight: 1000;
        }

        .cta {
          margin-top: auto;
          width: 100%;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 16px 18px;
          border-radius: 16px;
          background: linear-gradient(135deg, #6b1a2c, #8a0f24);
          color: #fff;
          font-size: 14px;
          font-weight: 900;
          text-transform: uppercase;
        }

        .featured .cta {
          background: linear-gradient(135deg, #d4a24c, #f3cf78);
          color: #24170b;
        }
      `}</style>
    </article>
  );
}