import Link from "next/link";
import styles from "./page.module.css";
import { requireAdmin } from "@/lib/admin/guard";

async function countTable(
  supabase: any,
  table: string,
  filter?: (query: any) => any
) {
  try {
    let query = supabase.from(table).select("*", {
      count: "exact",
      head: true,
    });

    if (filter) query = filter(query);

    const { count, error } = await query;

    if (error) return 0;

    return count ?? 0;
  } catch {
    return 0;
  }
}

async function sumPayments(supabase: any) {
  try {
    const { data, error } = await supabase
      .from("payments")
      .select("amount_cents, amount, status");

    if (error || !data) return 0;

    return data.reduce((sum: number, payment: any) => {
      if (!["paid", "succeeded"].includes(payment.status || "")) return sum;

      if (payment.amount_cents !== null && payment.amount_cents !== undefined) {
        return sum + Number(payment.amount_cents || 0);
      }

      return sum + Math.round(Number(payment.amount || 0) * 100);
    }, 0);
  } catch {
    return 0;
  }
}

function money(cents: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(cents / 100);
}

export default async function AdminStatistiquesPage() {
  const { supabase } = await requireAdmin();

  const [
    users,
    activeUsers,
    clubs,
    coachs,
    exercises,
    systems,
    sessions,
    annonces,
    payments,
    subscriptions,
    coachBookings,
    livestatMatches,
    formationRequests,
    accompagnementRequests,
    totalRevenueCents,
  ] = await Promise.all([
    countTable(supabase, "profiles"),
    countTable(supabase, "profiles", (q: any) => q.eq("status", "active")),
    countTable(supabase, "clubs"),
    countTable(supabase, "coach_profiles"),
    countTable(supabase, "exercises"),
    countTable(supabase, "systems"),
    countTable(supabase, "practice_sessions"),
    countTable(supabase, "annonces"),
    countTable(supabase, "payments"),
    countTable(supabase, "subscriptions", (q: any) => q.eq("status", "active")),
    countTable(supabase, "coach_bookings"),
    countTable(supabase, "match_stats"),
    countTable(supabase, "formation_requests"),
    countTable(supabase, "accompagnement_requests"),
    sumPayments(supabase),
  ]);

  const contentTotal = exercises + systems + sessions;
  const requestTotal = formationRequests + accompagnementRequests;
  const conversionRate =
    users > 0 ? Math.round((subscriptions / users) * 100) : 0;

  const cards = [
    ["👥", "Utilisateurs", users, "Comptes créés sur la plateforme"],
    ["✅", "Utilisateurs actifs", activeUsers, "Comptes actifs"],
    ["🏛️", "Clubs", clubs, "Clubs créés"],
    ["🧑‍🏫", "Coachs individuels", coachs, "Profils coachs"],
    ["📚", "Contenus", contentTotal, "Exercices + systèmes + séances"],
    ["📣", "Annonces", annonces, "Annonces publiées ou en attente"],
    ["💳", "Abonnements actifs", subscriptions, `${conversionRate}% des comptes`],
    ["💰", "CA encaissé", money(totalRevenueCents), "Paiements réussis"],
    ["📈", "Matchs LiveStat", livestatMatches, "Matchs enregistrés"],
    ["🤝", "Demandes entrantes", requestTotal, "Formation + accompagnement"],
  ] as const;

  const contentRows = [
    ["Exercices", exercises],
    ["Systèmes", systems],
    ["Séances", sessions],
    ["Annonces", annonces],
    ["Matchs LiveStat", livestatMatches],
  ] as const;

  const businessRows = [
    ["Paiements", payments],
    ["Abonnements actifs", subscriptions],
    ["Réservations coachs", coachBookings],
    ["CA encaissé", money(totalRevenueCents)],
    ["Taux abonnement", `${conversionRate}%`],
  ] as const;

  const requestRows = [
    ["Demandes formation", formationRequests],
    ["Demandes accompagnement", accompagnementRequests],
    ["Total demandes", requestTotal],
  ] as const;

  return (
    <main className={styles.adminStats}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour Dashboard CEO
        </Link>

        <section className={styles.hero}>
          <div>
            <p>Administration MyBasket</p>
            <h1>Statistiques</h1>
            <span>
              Vue globale sur l’activité du site : utilisateurs, contenus,
              revenus, demandes et usages.
            </span>
          </div>
        </section>

        <section className={styles.statsGrid}>
          {cards.map(([icon, label, value, help]) => (
            <article key={label} className={styles.statCard}>
              <div className={styles.icon}>{icon}</div>
              <strong>{value}</strong>
              <span>{label}</span>
              <p>{help}</p>
            </article>
          ))}
        </section>

        <section className={styles.panels}>
          <article className={styles.panel}>
            <h2>Activité contenu</h2>
            <div className={styles.rows}>
              {contentRows.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.panel}>
            <h2>Business</h2>
            <div className={styles.rows}>
              {businessRows.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </article>

          <article className={styles.panel}>
            <h2>Demandes</h2>
            <div className={styles.rows}>
              {requestRows.map(([label, value]) => (
                <div key={label}>
                  <span>{label}</span>
                  <strong>{value}</strong>
                </div>
              ))}
            </div>
          </article>
        </section>
      </div>
    </main>
  );
}