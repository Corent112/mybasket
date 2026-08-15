import { resolveAdminActor } from "@/lib/ai/knowledge";
import {
  apiError,
  apiOk,
  apiServerError,
  boolOr,
  intInRange,
  isUuid,
  optionalStr,
  readJson,
  strArray,
} from "@/lib/ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: Ctx) {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  const { id } = await context.params;
  if (!isUuid(id)) return apiError("Identifiant invalide.");

  const body = await readJson(request);
  if (!body) return apiError("Corps de requête invalide.");

  const patch: Record<string, unknown> = {};
  if ("reason" in body) patch.reason = optionalStr(body.reason, 1000);
  if ("qualityScore" in body) patch.quality_score = intInRange(body.qualityScore, 1, 10, 8);
  if ("tags" in body) patch.tags = strArray(body.tags, 20, 60);
  if ("learningFocus" in body) patch.learning_focus = strArray(body.learningFocus, 20, 80);
  if ("isActive" in body) patch.is_active = boolOr(body.isActive, true);

  if (Object.keys(patch).length === 0) return apiError("Aucune modification fournie.");

  try {
    const { data, error } = await result.actor.supabase
      .from("ai_reference_content")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return apiError(error.message, 500);
    return apiOk({ reference: data });
  } catch (error) {
    return apiServerError("references.patch", error);
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  const { id } = await context.params;
  if (!isUuid(id)) return apiError("Identifiant invalide.");

  try {
    const { error } = await result.actor.supabase
      .from("ai_reference_content")
      .delete()
      .eq("id", id);

    if (error) return apiError(error.message, 500);
    return apiOk({ deleted: id });
  } catch (error) {
    return apiServerError("references.delete", error);
  }
}
