import { AI_STORAGE_BUCKET } from "@/lib/ai/config";
import { getWriterClient, resolveAdminActor } from "@/lib/ai/knowledge";
import { apiError, apiOk, apiServerError, isUuid } from "@/lib/ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Renvoie une URL signée de courte durée. Le bucket `ai-knowledge` est privé :
 * aucun document n'est accessible par URL publique.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  const { id } = await context.params;
  if (!isUuid(id)) return apiError("Identifiant invalide.");

  try {
    const { data: source } = await result.actor.supabase
      .from("ai_knowledge_sources")
      .select("id, title, storage_bucket, storage_path, original_filename")
      .eq("id", id)
      .maybeSingle();

    if (!source) return apiError("Document introuvable.", 404);
    if (!source.storage_path) return apiError("Aucun fichier associé à ce document.", 404);

    const writer = getWriterClient(result.actor.supabase);

    const { data, error } = await writer.storage
      .from(source.storage_bucket || AI_STORAGE_BUCKET)
      .createSignedUrl(source.storage_path, 300, {
        download: source.original_filename || source.title,
      });

    if (error || !data?.signedUrl) {
      return apiError(error?.message || "Lien de téléchargement indisponible.", 500);
    }

    return apiOk({ url: data.signedUrl, expiresIn: 300 });
  } catch (error) {
    return apiServerError("sources.download", error);
  }
}
