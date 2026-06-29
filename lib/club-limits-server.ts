import { createClient } from "@/lib/supabase/server";

export async function getTeamLimit(userId: string): Promise<number | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("subscriptions")
    .select(`
      plan_id,
      subscription_plans (
        team_limit
      )
    `)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (error) {
    console.error("Erreur getTeamLimit:", error);
    return null;
  }

  return (data as any)?.subscription_plans?.team_limit ?? null;
}

export async function canCreateTeam(userId: string): Promise<boolean> {
  const supabase = await createClient();

  const limit = await getTeamLimit(userId);

  if (limit === null || limit === undefined) {
    return true;
  }

  const { count, error } = await supabase
    .from("club_teams")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("owner_id", userId);

  if (error) {
    console.error("Erreur canCreateTeam:", error);
    return false;
  }

  return (count ?? 0) < limit;
}