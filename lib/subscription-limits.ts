import { createClient } from "@/lib/supabase/server";
import { getEffectiveSubscriptionForUser } from "@/lib/effective-subscription";

export async function getTeamLimit(userId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.id !== userId) return 0;

  const effective = await getEffectiveSubscriptionForUser({
    supabase,
    userId,
    email: user.email,
  });

  if (!effective.active || !effective.plan) return 0;

  const raw = effective.plan.max_teams ?? effective.plan.team_limit ?? null;
  if (raw === null || raw === undefined) return null;

  const limit = Number(raw);
  return Number.isFinite(limit) ? limit : null;
}

export async function canCreateTeam(userId: string) {
  const supabase = await createClient();
  const limit = await getTeamLimit(userId);

  if (limit === null) return true;
  if (limit <= 0) return false;

  const { count, error } = await supabase
    .from("teams")
    .select("*", { count: "exact", head: true })
    .eq("user_id", userId);

  if (error) {
    console.error("Erreur comptage équipes :", error.message);
    return false;
  }

  return (count ?? 0) < limit;
}
