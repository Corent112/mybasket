import { resolveAdminActor } from "@/lib/ai/knowledge";
import { apiError, apiOk, apiServerError, intInRange, oneOf, str } from "@/lib/ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Recherche dans les tables EXISTANTES `exercises` / `systems` pour choisir
 * un contenu à marquer comme référence IA. Aucune duplication : on ne renvoie
 * que l'id et un aperçu.
 */
export async function GET(request: Request) {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  const url = new URL(request.url);
  const type = oneOf(url.searchParams.get("type"), ["exercise", "system"] as const, "exercise");
  const search = str(url.searchParams.get("q"), 120);
  const limit = intInRange(url.searchParams.get("limit"), 1, 50, 20);

  const table = type === "exercise" ? "exercises" : "systems";
  const fields =
    type === "exercise"
      ? "id, title, categorie, niveau, review_status, visibility"
      : "id, title, famille, categorie, review_status, visibility";

  try {
    let query = result.actor.supabase
      .from(table)
      .select(fields)
      .order("updated_at", { ascending: false })
      .limit(limit);

    if (search) query = query.ilike("title", `%${search}%`);

    const { data, error } = await query;
    if (error) return apiError(error.message, 500);

    // Ids déjà marqués comme références, pour griser le bouton côté UI.
    const { data: existing } = await result.actor.supabase
      .from("ai_reference_content")
      .select("content_id")
      .eq("content_type", type)
      .eq("scope", "global");

    return apiOk({
      candidates: data || [],
      alreadyReferenced: (existing || []).map(
        (row: { content_id: string }) => row.content_id
      ),
    });
  } catch (error) {
    return apiServerError("references.candidates", error);
  }
}
