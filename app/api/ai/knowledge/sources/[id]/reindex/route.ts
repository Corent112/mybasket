import { AI_INDEX_RATE_LIMIT, AI_INDEX_RATE_WINDOW_MS } from "@/lib/ai/config";
import { getWriterClient, indexSource, resolveAdminActor } from "@/lib/ai/knowledge";
import { apiError, apiOk, apiServerError, enforceRateLimit, isUuid } from "@/lib/ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  const { id } = await context.params;
  if (!isUuid(id)) return apiError("Identifiant invalide.");

  const limited = enforceRateLimit(
    request,
    "ai-index",
    result.actor.userId,
    AI_INDEX_RATE_LIMIT,
    AI_INDEX_RATE_WINDOW_MS
  );
  if (limited) return limited;

  try {
    const writer = getWriterClient(result.actor.supabase);
    const indexation = await indexSource(result.actor.supabase, writer, id);

    const { data: source } = await result.actor.supabase
      .from("ai_knowledge_sources")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    return apiOk({ indexation, source });
  } catch (error) {
    return apiServerError("sources.reindex", error);
  }
}
