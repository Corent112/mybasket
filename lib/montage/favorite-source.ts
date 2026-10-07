import type { SupabaseClient } from "@supabase/supabase-js";

// Persist only a reference to the saved action. Never create or overwrite stats.
export async function sendActionToMontageLibrary(
  supabase: SupabaseClient, teamId: string, sourceId: string, matchId?: string | null,
): Promise<string> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError) throw new Error(authError.message);
  if (!user || !teamId || !sourceId) throw new Error("Équipe, action ou utilisateur introuvable.");

  let query = supabase.from("match_actions").select("id").eq("team_id", teamId).eq("client_action_id", sourceId);
  if (matchId && !matchId.startsWith("local_")) query = query.eq("match_id", matchId);
  const byClient = await query.maybeSingle();
  if (byClient.error) throw new Error(byClient.error.message);
  let actionId = byClient.data?.id as string | undefined;
  if (!actionId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sourceId)) {
    let byIdQuery = supabase.from("match_actions").select("id").eq("team_id", teamId).eq("id", sourceId);
    if (matchId && !matchId.startsWith("local_")) byIdQuery = byIdQuery.eq("match_id", matchId);
    const byId = await byIdQuery.maybeSingle();
    if (byId.error) throw new Error(byId.error.message);
    actionId = byId.data?.id;
  }
  if (!actionId) throw new Error("L’action doit d’abord être enregistrée dans le projet avant d’être envoyée dans Montage.");

  const { error } = await supabase.from("livestat_clip_favorites").upsert(
    { user_id: user.id, team_id: teamId, action_id: actionId },
    { onConflict: "user_id,team_id,action_id" },
  );
  if (error) throw new Error(error.message);
  return actionId;
}
