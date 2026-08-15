import { AI_CORRECTION_TYPES, AI_MODULES, AI_SCOPES } from "@/lib/ai/config";
import { resolveActor, saveAICorrection } from "@/lib/ai/knowledge";
import {
  apiError,
  apiOk,
  apiServerError,
  intInRange,
  oneOf,
  optionalStr,
  readJson,
  str,
} from "@/lib/ai/http";
import type { AiCorrectionType } from "@/lib/ai/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CORRECTION_TYPE_KEYS = AI_CORRECTION_TYPES.map((t) => t.key) as readonly AiCorrectionType[];
const MODULE_KEYS = AI_MODULES.map((m) => m.key) as string[];

/**
 * GET — réservé à l'administration (vue globale des corrections).
 * POST — ouvert à tout utilisateur authentifié : c'est le point d'entrée
 * appelé par n'importe quelle fonctionnalité IA quand l'utilisateur corrige
 * une proposition. La portée détermine qui pourra en bénéficier.
 */
export async function GET(request: Request) {
  const result = await resolveActor();
  if (!result.ok) return apiError(result.error, result.status);
  if (!result.actor.isAdmin) {
    return apiError("Accès réservé à l'administration MyBasket.", 403);
  }

  const url = new URL(request.url);
  const search = str(url.searchParams.get("q"), 120);
  const moduleFilter = str(url.searchParams.get("module"), 60);
  const status = str(url.searchParams.get("status"), 30);
  const page = intInRange(url.searchParams.get("page"), 1, 1000, 1);
  const perPage = intInRange(url.searchParams.get("perPage"), 1, 100, 30);

  try {
    let query = result.actor.supabase
      .from("ai_corrections")
      .select(
        "id, context, ai_output, user_correction, explanation, correction_type, module, related_type, related_id, status, scope, club_id, owner_id, created_by, created_at, updated_at",
        { count: "exact" }
      )
      .order("created_at", { ascending: false })
      .range((page - 1) * perPage, page * perPage - 1);

    if (search) {
      query = query.or(
        `context.ilike.%${search}%,ai_output.ilike.%${search}%,user_correction.ilike.%${search}%`
      );
    }
    if (moduleFilter) query = query.eq("module", moduleFilter);
    if (status) query = query.eq("status", status);

    const { data, error, count } = await query;
    if (error) return apiError(error.message, 500);

    return apiOk({ corrections: data || [], total: count ?? 0, page, perPage });
  } catch (error) {
    return apiServerError("corrections.get", error);
  }
}

export async function POST(request: Request) {
  const result = await resolveActor();
  if (!result.ok) return apiError(result.error, result.status);

  const body = await readJson(request);
  if (!body) return apiError("Corps de requête invalide.");

  const context = str(body.context, 4000);
  const aiOutput = str(body.aiOutput, 8000);
  const userCorrection = str(body.userCorrection, 8000);

  if (!context) return apiError("Le contexte est obligatoire.");
  if (!aiOutput) return apiError("La proposition de l'IA est obligatoire.");
  if (!userCorrection) return apiError("La correction est obligatoire.");

  const requestedScope = oneOf(body.scope, AI_SCOPES, "user");

  // Seul un admin peut créer une correction de portée GLOBAL.
  const scope =
    requestedScope === "global" && !result.actor.isAdmin ? "user" : requestedScope;

  if (scope === "club" && !result.actor.clubIds.includes(String(body.clubId ?? ""))) {
    return apiError("Tu n'es pas membre actif de ce club.", 403);
  }

  const moduleKey = str(body.module, 60);

  try {
    const saved = await saveAICorrection(result.actor.supabase, {
      context,
      aiOutput,
      userCorrection,
      explanation: optionalStr(body.explanation, 2000),
      correctionType: oneOf(body.correctionType, CORRECTION_TYPE_KEYS, "other"),
      module: MODULE_KEYS.includes(moduleKey) ? moduleKey : "other",
      relatedType: body.relatedType
        ? oneOf(
            body.relatedType,
            ["exercise", "system", "session", "match", "play", "document"] as const,
            "exercise"
          )
        : null,
      relatedId: optionalStr(body.relatedId, 40),
      scope,
      clubId: scope === "club" ? String(body.clubId) : null,
      ownerId: scope === "user" ? result.actor.userId : null,
      createdBy: result.actor.userId,
      status: scope === "global" ? "active" : "active",
    });

    if (!saved.ok) return apiError(saved.error, 500);
    return apiOk({ correction: saved.correction }, 201);
  } catch (error) {
    return apiServerError("corrections.post", error);
  }
}
