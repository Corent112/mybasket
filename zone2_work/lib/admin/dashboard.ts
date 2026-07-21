import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

export type AdminDashboardData = {
  users: number;
  clubs: number;
  coachs: number;
  exercices: number;
  exercicesPending: number;
  systemes: number;
  systemesPending: number;
  seances: number;
  seancesPending: number;
  produits: number;
  annonces: number;
  annoncesPending: number;
  abonnements: number;
  coachsPending: number;
  formationPending: number;
  accompagnementPending: number;
  scoutingPending: number;
  livestatMatches: number;
  revenue: number;
};

async function countFirstExisting(
  supabase: any,
  tables: string[],
  filter?: (query: any) => any
): Promise<number> {
  for (const table of tables) {
    try {
      let query = supabase
        .from(table)
        .select("*", { count: "exact", head: true });

      if (filter) query = filter(query);

      const { count, error } = await query;

      if (!error) return count ?? 0;
    } catch {
      // on teste la table suivante
    }
  }

  return 0;
}

async function sumMonthlyRevenue(supabase: any): Promise<number> {
  const paymentTables = ["payments", "paiements", "transactions"];

  const start = new Date();
  start.setDate(1);
  start.setHours(0, 0, 0, 0);

  for (const table of paymentTables) {
    try {
      const { data, error } = await supabase
        .from(table)
        .select("amount, amount_cents, status, created_at")
        .gte("created_at", start.toISOString());

      if (error || !data) continue;

      return data.reduce((total: number, row: any) => {
        const status = String(row.status ?? "").toLowerCase();

        if (
          status &&
          !["paid", "succeeded", "success", "active", "completed"].includes(status)
        ) {
          return total;
        }

        if (row.amount_cents !== null && row.amount_cents !== undefined) {
          return total + Number(row.amount_cents || 0) / 100;
        }

        return total + Number(row.amount || 0);
      }, 0);
    } catch {
      // table suivante
    }
  }

  return 0;
}

export async function getAdminDashboardData(): Promise<AdminDashboardData> {
  const supabase = await createClient();

  const pendingFilter = (q: any) =>
    q.or("status.eq.pending,status.eq.submitted,review_status.eq.pending,review_status.eq.submitted");

  const admin = createAdminClient();
  const authUsersPromise = admin
    ? admin.auth.admin.listUsers({ page: 1, perPage: 1000 }).then(({ data, error }: { data: { users: unknown[] }; error: unknown }) => error ? null : data.users.length).catch(() => null)
    : Promise.resolve(null);

  const [
    profileUsers,
    clubs,
    coachs,
    exercices,
    exercicesPending,
    systemes,
    systemesPending,
    seances,
    seancesPending,
    produits,
    annonces,
    annoncesPending,
    abonnements,
    coachsPending,
    formationPending,
    accompagnementPending,
    scoutingPending,
    livestatMatches,
    revenue,
  ] = await Promise.all([
    countFirstExisting(supabase, ["profiles"]),

    countFirstExisting(supabase, ["clubs"]),

    countFirstExisting(supabase, ["coach_profiles", "coachs", "coaches"]),

    countFirstExisting(supabase, ["exercises", "exercices"]),
    countFirstExisting(supabase, ["exercises", "exercices"], pendingFilter),

    countFirstExisting(supabase, ["systems", "systemes"]),
    countFirstExisting(supabase, ["systems", "systemes"], pendingFilter),

    countFirstExisting(supabase, ["practice_sessions", "sessions", "seances"]),
    countFirstExisting(supabase, ["practice_sessions", "sessions", "seances"], pendingFilter),

    countFirstExisting(supabase, ["products", "produits"]),

    countFirstExisting(supabase, ["announcements", "annonces"]),
    countFirstExisting(supabase, ["announcements", "annonces"], (q) =>
      q.or("status.eq.pending,status.eq.submitted,status.eq.draft")
    ),

    countFirstExisting(supabase, ["subscriptions", "user_subscriptions"], (q) =>
      q.eq("status", "active")
    ),

    countFirstExisting(supabase, ["coach_profiles", "coachs", "coaches"], (q) =>
      q.or("status.eq.pending,review_status.eq.pending,is_published.eq.false")
    ),

    countFirstExisting(supabase, ["formation_requests"], (q) =>
      q.or("status.eq.new,status.eq.pending")
    ),

    countFirstExisting(supabase, ["accompagnement_requests"], (q) =>
      q.or("status.eq.new,status.eq.pending")
    ),

    countFirstExisting(supabase, ["accompagnement_requests"], (q) =>
      q.or("status.eq.new,status.eq.pending").or("service_type.ilike.%scouting%,service_type.ilike.%vidéo%,service_type.ilike.%video%")
    ),

    countFirstExisting(supabase, ["livestat_matches", "match_stats"]),

    sumMonthlyRevenue(supabase),
  ]);

  const authUsers = await authUsersPromise;

  return {
    users: authUsers ?? profileUsers,
    clubs,
    coachs,
    exercices,
    exercicesPending,
    systemes,
    systemesPending,
    seances,
    seancesPending,
    produits,
    annonces,
    annoncesPending,
    abonnements,
    coachsPending,
    formationPending,
    accompagnementPending,
    scoutingPending,
    livestatMatches,
    revenue,
  };
}