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
  intInRange,
  oneOf,
  optionalStr,
  readJson,
  str,
  strArray,
} from "@/lib/ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  const url = new URL(request.url);
  const search = str(url.searchParams.get("q"), 120);
  const category = str(url.searchParams.get("category"), 60);
  const page = intInRange(url.searchParams.get("page"), 1, 1000, 1);
  const perPage = intInRange(url.searchParams.get("perPage"), 1, 200, 50);

  try {
    let query = result.actor.supabase
      .from("ai_terms")
      .select(
        "id, term, definition, category_slug, synonyms, translations, examples, notes, source, schema_url, schema_ref_type, schema_ref_id, priority, is_active, scope, club_id, owner_id, created_at, updated_at",
        { count: "exact" }
      )
      .eq("scope", "global")
      .order("term", { ascending: true })
      .range((page - 1) * perPage, page * perPage - 1);

    if (search) query = query.or(`term.ilike.%${search}%,definition.ilike.%${search}%`);
    if (category) query = query.eq("category_slug", category);

    const { data, error, count } = await query;
    if (error) return apiError(error.message, 500);

    return apiOk({ terms: data || [], total: count ?? 0, page, perPage });
  } catch (error) {
    return apiServerError("terms.get", error);
  }
}

export async function POST(request: Request) {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  const body = await readJson(request);
  if (!body) return apiError("Corps de requête invalide.");

  const term = str(body.term, 160);
  const definition = str(body.definition, 4000);

  if (!term) return apiError("Le terme est obligatoire.");
  if (!definition) return apiError("La définition est obligatoire.");

  const synonyms = strArray(body.synonyms, 30, 120);
  const translations = strArray(body.translations, 20, 160);

  try {
    const embedding = toPgVector(
      await embedText(
        buildTermEmbeddingInput({ term, definition, synonyms, translations })
      ).catch(() => null)
    );

    const { data, error } = await result.actor.supabase
      .from("ai_terms")
      .insert({
        term,
        definition,
        category_slug: optionalStr(body.category, 60),
        synonyms,
        translations,
        examples: strArray(body.examples, 20, 500),
        notes: optionalStr(body.notes, 2000),
        source: optionalStr(body.source, 300),
        schema_url: optionalStr(body.schemaUrl, 800),
        schema_ref_type: body.schemaRefType
          ? oneOf(body.schemaRefType, ["exercise", "system", "play", "image"] as const, "image")
          : null,
        schema_ref_id: optionalStr(body.schemaRefId, 40),
        priority: oneOf(body.priority, AI_RULE_PRIORITIES, "normal"),
        is_active: boolOr(body.isActive, true),
        embedding,
        scope: "global",
        created_by: result.actor.userId,
        updated_by: result.actor.userId,
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") return apiError("Ce terme existe déjà dans le lexique.", 409);
      return apiError(error.message, 500);
    }

    return apiOk({ term: data, embedded: Boolean(embedding) }, 201);
  } catch (error) {
    return apiServerError("terms.post", error);
  }
}
