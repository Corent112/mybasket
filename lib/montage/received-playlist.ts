import type { SupabaseClient } from "@supabase/supabase-js";
export const RECEIVED_PLAYLIST_NAME = "Clips reçus";

/** Store an existing action reference using the existing playlist schema. */
export async function saveReceivedClipReference(supabase: SupabaseClient, userId: string, teamId: string, actionId: string): Promise<{ id: string; name: string }> {
  const result = await supabase.from("livestat_clip_themes").select("id,name")
    .eq("user_id", userId).eq("team_id", teamId).eq("name", RECEIVED_PLAYLIST_NAME).order("sort_order").limit(1).maybeSingle();
  if (result.error) throw new Error(result.error.message);
  let playlist = result.data;
  if (!playlist) {
    const created = await supabase.from("livestat_clip_themes").insert({ user_id: userId, team_id: teamId, name: RECEIVED_PLAYLIST_NAME, sort_order: 0 }).select("id,name").single();
    if (created.error || !created.data) throw new Error(created.error?.message || "Création de la playlist impossible.");
    playlist = created.data;
  }
  const saved = await supabase.from("livestat_clip_theme_items").upsert({ theme_id: playlist.id, user_id: userId, action_id: actionId }, { onConflict: "theme_id,action_id" });
  if (saved.error) throw new Error(saved.error.message);
  return { id: String(playlist.id), name: String(playlist.name) };
}
