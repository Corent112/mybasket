import { resolveActor } from "@/lib/ai/knowledge";
import {
  apiError,
  apiOk,
  apiServerError,
  boolOr,
  intInRange,
  readJson,
  str,
} from "@/lib/ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const result = await resolveActor();
  if (!result.ok) return apiError(result.error, result.status);

  const url = new URL(request.url);
  const includeArchived = boolOr(url.searchParams.get("archived"), false);
  const limit = intInRange(url.searchParams.get("limit"), 1, 100, 40);

  try {
    let query = result.actor.supabase
      .from("ai_conversations")
      .select("*")
      .eq("user_id", result.actor.userId)
      .order("last_message_at", { ascending: false })
      .limit(limit);

    if (!includeArchived) query = query.eq("is_archived", false);

    const { data, error } = await query;
    if (error) return apiError(error.message, 500);

    return apiOk({ conversations: data || [] });
  } catch (error) {
    return apiServerError("conversations.get", error);
  }
}

export async function POST(request: Request) {
  const result = await resolveActor();
  if (!result.ok) return apiError(result.error, result.status);

  const body = (await readJson(request)) || {};

  try {
    const { data, error } = await result.actor.supabase
      .from("ai_conversations")
      .insert({
        title: str(body.title, 160) || "Nouvelle conversation",
        module: str(body.module, 60) || "coach-chat",
        user_id: result.actor.userId,
        club_id: result.actor.clubIds[0] ?? null,
        scope: "user",
      })
      .select("*")
      .single();

    if (error) return apiError(error.message, 500);
    return apiOk({ conversation: data }, 201);
  } catch (error) {
    return apiServerError("conversations.post", error);
  }
}
