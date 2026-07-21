import { createClient } from "@/lib/supabase/server";

export async function getTeamLimit(userId: string) {
  const supabase = await createClient();

  const { data: subscription } = await supabase
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

  const limit =
    (subscription as any)?.subscription_plans?.team_limit;

  return limit;
}

export async function canCreateTeam(userId: string) {
  const supabase = await createClient();

  const limit = await getTeamLimit(userId);

  if (limit === null || limit === undefined) {
    return true;
  }

  const { count } = await supabase
    .from("teams")
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq("owner_id", userId);

  return (count ?? 0) < limit;
}