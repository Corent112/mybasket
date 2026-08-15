import { resolveActor, resolveAdminActor } from "@/lib/ai/knowledge";
import { apiError, apiOk, apiServerError, intInRange, optionalStr, readJson, str } from "@/lib/ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await resolveActor();
  if (!result.ok) return apiError(result.error, result.status);

  try {
    const { data, error } = await result.actor.supabase
      .from("ai_knowledge_categories")
      .select("*")
      .order("position", { ascending: true });

    if (error) return apiError(error.message, 500);
    return apiOk({ categories: data || [] });
  } catch (error) {
    return apiServerError("categories.get", error);
  }
}

export async function POST(request: Request) {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  const body = await readJson(request);
  if (!body) return apiError("Corps de requête invalide.");

  const label = str(body.label, 120);
  if (!label) return apiError("Le libellé est obligatoire.");

  const slug =
    str(body.slug, 60)
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") ||
    label
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");

  if (!slug) return apiError("Impossible de générer un identifiant pour cette catégorie.");

  try {
    const { data, error } = await result.actor.supabase
      .from("ai_knowledge_categories")
      .insert({
        slug,
        label,
        description: optionalStr(body.description, 500),
        icon: optionalStr(body.icon, 8),
        position: intInRange(body.position, 0, 9999, 500),
      })
      .select("*")
      .single();

    if (error) {
      if (error.code === "23505") return apiError("Cette catégorie existe déjà.", 409);
      return apiError(error.message, 500);
    }

    return apiOk({ category: data }, 201);
  } catch (error) {
    return apiServerError("categories.post", error);
  }
}
