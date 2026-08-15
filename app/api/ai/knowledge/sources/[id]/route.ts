import { AI_SOURCE_STATUSES, AI_STORAGE_BUCKET } from "@/lib/ai/config";
import { getWriterClient, resolveAdminActor } from "@/lib/ai/knowledge";
import {
  apiError,
  apiOk,
  apiServerError,
  boolOr,
  isUuid,
  oneOf,
  optionalStr,
  readJson,
  str,
} from "@/lib/ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

/* --------------------------------------------------------------------- */
/* PATCH — renommer, recatégoriser, activer/désactiver, archiver          */
/* --------------------------------------------------------------------- */

export async function PATCH(request: Request, context: Ctx) {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  const { id } = await context.params;
  if (!isUuid(id)) return apiError("Identifiant invalide.");

  const body = await readJson(request);
  if (!body) return apiError("Corps de requête invalide.");

  const patch: Record<string, unknown> = { updated_by: result.actor.userId };

  if ("title" in body) {
    const title = str(body.title, 200);
    if (!title) return apiError("Le titre ne peut pas être vide.");
    patch.title = title;
  }
  if ("description" in body) patch.description = optionalStr(body.description, 2000);
  if ("category" in body) patch.category_slug = optionalStr(body.category, 60);
  if ("provenance" in body) patch.provenance = optionalStr(body.provenance, 300);
  if ("author" in body) patch.author = optionalStr(body.author, 200);
  if ("sourceUrl" in body) patch.source_url = optionalStr(body.sourceUrl, 500);
  if ("isActive" in body) patch.is_active = boolOr(body.isActive, true);
  if ("status" in body) patch.status = oneOf(body.status, AI_SOURCE_STATUSES, "uploaded");

  if (Object.keys(patch).length === 1) return apiError("Aucune modification fournie.");

  try {
    const { data, error } = await result.actor.supabase
      .from("ai_knowledge_sources")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return apiError(error.message, 500);

    // Les chunks portent une copie dénormalisée de ces champs (filtres RLS).
    if ("is_active" in patch || "category_slug" in patch) {
      const writer = getWriterClient(result.actor.supabase);
      await writer
        .from("ai_knowledge_chunks")
        .update({
          ...("is_active" in patch ? { is_active: patch.is_active } : {}),
          ...("category_slug" in patch ? { category_slug: patch.category_slug } : {}),
        })
        .eq("source_id", id);
    }

    return apiOk({ source: data });
  } catch (error) {
    return apiServerError("sources.patch", error);
  }
}

/* --------------------------------------------------------------------- */
/* DELETE — suppression définitive (fichier + chunks)                     */
/* --------------------------------------------------------------------- */

export async function DELETE(_request: Request, context: Ctx) {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  const { id } = await context.params;
  if (!isUuid(id)) return apiError("Identifiant invalide.");

  const writer = getWriterClient(result.actor.supabase);

  try {
    const { data: source } = await result.actor.supabase
      .from("ai_knowledge_sources")
      .select("id, storage_bucket, storage_path")
      .eq("id", id)
      .maybeSingle();

    if (!source) return apiError("Document introuvable.", 404);

    if (source.storage_path) {
      const { error: storageError } = await writer.storage
        .from(source.storage_bucket || AI_STORAGE_BUCKET)
        .remove([source.storage_path]);
      if (storageError) {
        console.warn("[AI][sources.delete] fichier non supprimé", storageError.message);
      }
    }

    // Les chunks partent en cascade (FK on delete cascade).
    const { error } = await result.actor.supabase
      .from("ai_knowledge_sources")
      .delete()
      .eq("id", id);

    if (error) return apiError(error.message, 500);

    return apiOk({ deleted: id });
  } catch (error) {
    return apiServerError("sources.delete", error);
  }
}
