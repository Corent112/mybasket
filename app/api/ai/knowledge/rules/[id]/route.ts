import { AI_MODULES, AI_RULE_PRIORITIES } from "@/lib/ai/config";
import { resolveAdminActor } from "@/lib/ai/knowledge";
import {
  apiError,
  apiOk,
  apiServerError,
  boolOr,
  intInRange,
  isUuid,
  oneOf,
  optionalStr,
  readJson,
  str,
  strArray,
} from "@/lib/ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

const MODULE_KEYS = AI_MODULES.map((m) => m.key) as string[];

export async function PATCH(request: Request, context: Ctx) {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  const { id } = await context.params;
  if (!isUuid(id)) return apiError("Identifiant invalide.");

  const body = await readJson(request);
  if (!body) return apiError("Corps de requête invalide.");

  const patch: Record<string, unknown> = { updated_by: result.actor.userId };

  if ("name" in body) {
    const name = str(body.name, 160);
    if (!name) return apiError("Le nom ne peut pas être vide.");
    patch.name = name;
  }
  if ("instruction" in body) {
    const instruction = str(body.instruction, 4000);
    if (!instruction) return apiError("L'instruction ne peut pas être vide.");
    patch.instruction = instruction;
  }
  if ("category" in body) patch.category_slug = optionalStr(body.category, 60);
  if ("modules" in body) {
    patch.modules = strArray(body.modules, 20, 60).filter((m) => MODULE_KEYS.includes(m));
  }
  if ("priority" in body) patch.priority = oneOf(body.priority, AI_RULE_PRIORITIES, "normal");
  if ("isActive" in body) patch.is_active = boolOr(body.isActive, true);
  if ("position" in body) patch.position = intInRange(body.position, 0, 9999, 100);
  if ("examplesGood" in body) patch.examples_good = strArray(body.examplesGood, 10, 500);
  if ("examplesBad" in body) patch.examples_bad = strArray(body.examplesBad, 10, 500);

  if (Object.keys(patch).length === 1) return apiError("Aucune modification fournie.");

  try {
    const { data, error } = await result.actor.supabase
      .from("ai_rules")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return apiError(error.message, 500);
    return apiOk({ rule: data });
  } catch (error) {
    return apiServerError("rules.patch", error);
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  const { id } = await context.params;
  if (!isUuid(id)) return apiError("Identifiant invalide.");

  try {
    const { error } = await result.actor.supabase.from("ai_rules").delete().eq("id", id);
    if (error) return apiError(error.message, 500);
    return apiOk({ deleted: id });
  } catch (error) {
    return apiServerError("rules.delete", error);
  }
}
