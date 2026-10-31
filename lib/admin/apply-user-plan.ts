import { getEffectiveSubscriptionForUser, normalizePlanSlug } from "@/lib/effective-subscription";

// Les actions appelantes vérifient le rôle administrateur et l’offre active.
export async function applyAdminUserPlan(client: any, userId: string, plan: {id: string; slug?: string | null; name?: string | null}) {
  const { data, error } = await client.auth.admin.getUserById(userId);
  if (error) throw error;
  if (!data.user) throw new Error("Utilisateur introuvable.");
  const access = await getEffectiveSubscriptionForUser({
    supabase: client, userId, email: data.user.email,
  });
  if (access.source === "free" && access.subscription?.id) {
    const slug = normalizePlanSlug(plan.slug || plan.name);
    if (!slug) throw new Error("Cette offre ne peut pas être attribuée.");
    const { error } = await client.from("free_access_grants")
      .update({plan_slug: slug, updated_at: new Date().toISOString()})
      .eq("id", access.subscription.id);
    if (error) throw error;
    return;
  }
  const { data: rows, error: readError } = await client.from("subscriptions")
    .select("id").eq("user_id", userId).in("status", ["active", "trialing"])
    .order("created_at", {ascending:false}).limit(1);
  if (readError) throw readError;
  const write = rows?.[0]?.id
    ? await client.from("subscriptions").update({plan_id:plan.id,status:"active"}).eq("id",rows[0].id)
    : await client.from("subscriptions").insert({user_id:userId,plan_id:plan.id,status:"active"});
  if(write.error)throw write.error;
}
