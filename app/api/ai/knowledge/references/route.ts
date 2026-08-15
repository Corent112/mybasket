import {
  getReferenceExercises,
  getReferenceSystems,
  globalScopeContext,
  resolveAdminActor,
} from "@/lib/ai/knowledge";
import {
  apiError,
  apiOk,
  apiServerError,
  intInRange,
  isUuid,
  oneOf,
  optionalStr,
  readJson,
  strArray,
} from "@/lib/ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES = ["exercise", "system", "session", "play"] as const;

export async function GET(request: Request) {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  const url = new URL(request.url);
  const scope = globalScopeContext(result.actor.userId);
  const limit = intInRange(url.searchParams.get("limit"), 1, 200, 50);

  try {
    const [exercises, systems] = await Promise.all([
      getReferenceExercises(result.actor.supabase, { scope, limit, includeInactive: true }),
      getReferenceSystems(result.actor.supabase, { scope, limit, includeInactive: true }),
    ]);

    return apiOk({ exercises, systems });
  } catch (error) {
    return apiServerError("references.get", error);
  }
}

export async function POST(request: Request) {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  const body = await readJson(request);
  if (!body) return apiError("Corps de requête invalide.");

  const contentType = oneOf(body.contentType, CONTENT_TYPES, "exercise");
  const contentId = String(body.contentId ?? "");

  if (!isUuid(contentId)) return apiError("Identifiant de contenu invalide.");

  const table = contentType === "exercise" ? "exercises" : contentType === "system" ? "systems" : null;

  try {
    // Vérifie que le contenu existe réellement : aucune référence orpheline.
    if (table) {
      const { data: exists } = await result.actor.supabase
        .from(table)
        .select("id")
        .eq("id", contentId)
        .maybeSingle();

      if (!exists) {
        return apiError(
          `Ce ${contentType === "exercise" ? "exercice" : "système"} n'existe pas dans la bibliothèque.`,
          404
        );
      }
    }

    const { data, error } = await result.actor.supabase
      .from("ai_reference_content")
      .insert({
        content_type: contentType,
        content_id: contentId,
        reason: optionalStr(body.reason, 1000),
        quality_score: intInRange(body.qualityScore, 1, 10, 8),
        tags: strArray(body.tags, 20, 60),
        learning_focus: strArray(body.learningFocus, 20, 80),
        is_active: true,
        scope: "global",
        created_by: result.actor.userId,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") {
        return apiError("Ce contenu est déjà marqué comme référence.", 409);
      }
      return apiError(error.message, 500);
    }

    return apiOk({ reference: data }, 201);
  } catch (error) {
    return apiServerError("references.post", error);
  }
}
