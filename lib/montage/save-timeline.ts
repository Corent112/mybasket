import type { SupabaseClient } from "@supabase/supabase-js";

export type MontageSaveResult = { id: string; updated_at: string };
export async function saveMontageAtomically(
  supabase: SupabaseClient, montageId: string, montage: Record<string, unknown>,
  items: Record<string, unknown>[], expectedUpdatedAt: string | null,
): Promise<MontageSaveResult> {
  const { data, error } = await supabase.rpc("save_montage_timeline_atomic", {
    p_montage_id: montageId, p_montage: montage, p_rows: items,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) {
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error("La migration de sauvegarde Montage doit être installée avant d’enregistrer. Tes modifications restent à l’écran.");
    }
    throw new Error(`Montage non enregistré : ${error.message}`);
  }
  if (!data?.id || !data?.updated_at) throw new Error("Réponse de sauvegarde Montage invalide.");
  return data as MontageSaveResult;
}
