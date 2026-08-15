import { AI_CORRECTION_TYPES } from "@/lib/ai/config";
import { reembedCorrection, resolveActor } from "@/lib/ai/knowledge";
import {
  apiError,
  apiOk,
  apiServerError,
  isUuid,
  oneOf,
  optionalStr,
  readJson,
  str,
} from "@/lib/ai/http";
import type { AiCorrectionType } from "@/lib/ai/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const CORRECTION_TYPE_KEYS = AI_CORRECTION_TYPES.map((t) => t.key) as readonly AiCorrectionType[];
const STATUSES = ["pending", "active", "rejected", "archived"] as const;

export async function PATCH(request: Request, context: Ctx) {
  const result = await resolveActor();
  if (!result.ok) return apiError(result.error, result.status);

  const { id } = await context.params;
  if (!isUuid(id)) return apiError("Identifiant invalide.");

  const body = await readJson(request);
  if (!body) return apiError("Corps de requête invalide.");

  const patch: Record<string, unknown> = {};

  if ("context" in body) {
    const value = str(body.context, 4000);
    if (!value) return apiError("Le contexte ne peut pas être vide.");
    patch.context = value;
  }
  if ("aiOutput" in body) patch.ai_output = str(body.aiOutput, 8000);
  if ("userCorrection" in body) {
    const value = str(body.userCorrection, 8000);
    if (!value) return apiError("La correction ne peut pas être vide.");
    patch.user_correction = value;
  }
  if ("explanation" in body) patch.explanation = optionalStr(body.explanation, 2000);
  if ("correctionType" in body) {
    patch.correction_type = oneOf(body.correctionType, CORRECTION_TYPE_KEYS, "other");
  }
  if ("status" in body) {
    if (!result.actor.isAdmin) {
      return apiError("Seule l'administration peut changer le statut d'une correction.", 403);
    }
    patch.status = oneOf(body.status, STATUSES, "active");
    patch.reviewed_by = result.actor.userId;
    patch.reviewed_at = new Date().toISOString();
  }

  if (Object.keys(patch).length === 0) return apiError("Aucune modification fournie.");

  try {
    const { data, error } = await result.actor.supabase
      .from("ai_corrections")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return apiError(error.message, 500);

    // Le sens de la correction a changé : son embedding doit suivre.
    if ("context" in patch || "ai_output" in patch || "user_correction" in patch) {
      await reembedCorrection(result.actor.supabase, id);
    }

    return apiOk({ correction: data });
  } catch (error) {
    return apiServerError("corrections.patch", error);
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const result = await resolveActor();
  if (!result.ok) return apiError(result.error, result.status);

  const { id } = await context.params;
  if (!isUuid(id)) return apiError("Identifiant invalide.");

  try {
    const { error } = await result.actor.supabase.from("ai_corrections").delete().eq("id", id);
    if (error) return apiError(error.message, 500);
    return apiOk({ deleted: id });
  } catch (error) {
    return apiServerError("corrections.delete", error);
  }
}
