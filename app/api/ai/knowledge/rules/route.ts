import { AI_MODULES, AI_RULE_PRIORITIES } from "@/lib/ai/config";
import { resolveAdminActor } from "@/lib/ai/knowledge";
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

const MODULE_KEYS = AI_MODULES.map((m) => m.key) as string[];

export async function GET(request: Request) {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  const url = new URL(request.url);
  const search = str(url.searchParams.get("q"), 120);
  const priority = str(url.searchParams.get("priority"), 20);

  try {
    let query = result.actor.supabase
      .from("ai_rules")
      .select("*")
      .eq("scope", "global")
      .order("position", { ascending: true })
      .limit(500);

    if (search) query = query.or(`name.ilike.%${search}%,instruction.ilike.%${search}%`);
    if (priority) query = query.eq("priority", priority);

    const { data, error } = await query;
    if (error) return apiError(error.message, 500);

    return apiOk({ rules: data || [] });
  } catch (error) {
    return apiServerError("rules.get", error);
  }
}

export async function POST(request: Request) {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  const body = await readJson(request);
  if (!body) return apiError("Corps de requête invalide.");

  const name = str(body.name, 160);
  const instruction = str(body.instruction, 4000);

  if (!name) return apiError("Le nom de la règle est obligatoire.");
  if (!instruction) return apiError("L'instruction est obligatoire.");

  const modules = strArray(body.modules, 20, 60).filter((m) => MODULE_KEYS.includes(m));

  try {
    const { data, error } = await result.actor.supabase
      .from("ai_rules")
      .insert({
        name,
        instruction,
        category_slug: optionalStr(body.category, 60),
        modules,
        priority: oneOf(body.priority, AI_RULE_PRIORITIES, "normal"),
        is_active: boolOr(body.isActive, true),
        position: intInRange(body.position, 0, 9999, 100),
        examples_good: strArray(body.examplesGood, 10, 500),
        examples_bad: strArray(body.examplesBad, 10, 500),
        scope: "global",
        created_by: result.actor.userId,
        updated_by: result.actor.userId,
      })
      .select("*")
      .single();

    if (error) return apiError(error.message, 500);
    return apiOk({ rule: data }, 201);
  } catch (error) {
    return apiServerError("rules.post", error);
  }
}
