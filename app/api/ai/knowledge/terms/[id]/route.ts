import { AI_RULE_PRIORITIES } from "@/lib/ai/config";
import {
  buildTermEmbeddingInput,
  embedText,
  resolveAdminActor,
  toPgVector,
} from "@/lib/ai/knowledge";
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

  const patch: Record<string, unknown> = { updated_by: result.actor.userId };

  if ("term" in body) {
    const term = str(body.term, 160);
    if (!term) return apiError("Le terme ne peut pas être vide.");
    patch.term = term;
  }
  if ("definition" in body) {
    const definition = str(body.definition, 4000);
    if (!definition) return apiError("La définition ne peut pas être vide.");
    patch.definition = definition;
  }
  if ("category" in body) patch.category_slug = optionalStr(body.category, 60);
  if ("synonyms" in body) patch.synonyms = strArray(body.synonyms, 30, 120);
  if ("translations" in body) patch.translations = strArray(body.translations, 20, 160);
  if ("examples" in body) patch.examples = strArray(body.examples, 20, 500);
  if ("notes" in body) patch.notes = optionalStr(body.notes, 2000);
  if ("source" in body) patch.source = optionalStr(body.source, 300);
  if ("schemaUrl" in body) patch.schema_url = optionalStr(body.schemaUrl, 800);
  if ("priority" in body) patch.priority = oneOf(body.priority, AI_RULE_PRIORITIES, "normal");
  if ("isActive" in body) patch.is_active = boolOr(body.isActive, true);

  if (Object.keys(patch).length === 1) return apiError("Aucune modification fournie.");

  try {
    // Recalcul de l'embedding si le sens du terme a changé.
    const needsReembed = ["term", "definition", "synonyms", "translations"].some(
      (key) => key in patch
    );

    if (needsReembed) {
      const { data: current } = await result.actor.supabase
        .from("ai_terms")
        .select("term, definition, synonyms, translations")
        .eq("id", id)
        .maybeSingle();

      if (current) {
        const embedding = await embedText(
          buildTermEmbeddingInput({
            term: (patch.term as string) ?? current.term,
            definition: (patch.definition as string) ?? current.definition,
            synonyms: (patch.synonyms as string[]) ?? current.synonyms,
            translations: (patch.translations as string[]) ?? current.translations,
          })
        ).catch(() => null);

        const vector = toPgVector(embedding);
        if (vector) patch.embedding = vector;
      }
    }

    const { data, error } = await result.actor.supabase
      .from("ai_terms")
      .update(patch)
      .eq("id", id)
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") return apiError("Ce terme existe déjà dans le lexique.", 409);
      return apiError(error.message, 500);
    }

    return apiOk({ term: data });
  } catch (error) {
    return apiServerError("terms.patch", error);
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  const { id } = await context.params;
  if (!isUuid(id)) return apiError("Identifiant invalide.");

  try {
    const { error } = await result.actor.supabase.from("ai_terms").delete().eq("id", id);
    if (error) return apiError(error.message, 500);
    return apiOk({ deleted: id });
  } catch (error) {
    return apiServerError("terms.delete", error);
  }
}
