import { resolveActor } from "@/lib/ai/knowledge";
import {
  apiError,
  apiOk,
  apiServerError,
  boolOr,
  intInRange,
  isUuid,
  readJson,
  str,
} from "@/lib/ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: Ctx) {
  const result = await resolveActor();
  if (!result.ok) return apiError(result.error, result.status);

  const { id } = await context.params;
  if (!isUuid(id)) return apiError("Identifiant invalide.");

  const limit = intInRange(new URL(request.url).searchParams.get("limit"), 1, 500, 200);

  try {
    const { data: conversation, error } = await result.actor.supabase
      .from("ai_conversations")
      .select("*")
      .eq("id", id)
      .eq("user_id", result.actor.userId)
      .maybeSingle();

    if (error) return apiError(error.message, 500);
    if (!conversation) return apiError("Conversation introuvable.", 404);

    const { data: messages, error: messageError } = await result.actor.supabase
      .from("ai_messages")
      .select("*")
      .eq("conversation_id", id)
      .neq("role", "system")
      .order("created_at", { ascending: true })
      .limit(limit);

    if (messageError) return apiError("Impossible de charger les messages.", 500);
    return apiOk({ conversation, messages: messages || [] });
  } catch (error) {
    return apiServerError("conversations.detail", error);
  }
}

export async function PATCH(request: Request, context: Ctx) {
  const result = await resolveActor();
  if (!result.ok) return apiError(result.error, result.status);

  const { id } = await context.params;
  if (!isUuid(id)) return apiError("Identifiant invalide.");

  const body = await readJson(request);
  if (!body) return apiError("Corps de requête invalide.");

  const patch: Record<string, unknown> = {};
  if ("title" in body) {
    const title = str(body.title, 160);
    if (!title) return apiError("Le titre ne peut pas être vide.");
    patch.title = title;
  }
  if ("isArchived" in body) patch.is_archived = boolOr(body.isArchived, false);

  if (Object.keys(patch).length === 0) return apiError("Aucune modification fournie.");

  try {
    const { data, error } = await result.actor.supabase
      .from("ai_conversations")
      .update(patch)
      .eq("id", id)
      .eq("user_id", result.actor.userId)
      .select("*")
      .single();

    if (error) return apiError(error.message, 500);
    return apiOk({ conversation: data });
  } catch (error) {
    return apiServerError("conversations.patch", error);
  }
}

export async function DELETE(_request: Request, context: Ctx) {
  const result = await resolveActor();
  if (!result.ok) return apiError(result.error, result.status);

  const { id } = await context.params;
  if (!isUuid(id)) return apiError("Identifiant invalide.");

  try {
    const { data, error } = await result.actor.supabase
      .from("ai_conversations")
      .delete()
      .eq("id", id)
      .eq("user_id", result.actor.userId)
      .select("id").maybeSingle();

    if (error) return apiError("Impossible de supprimer la conversation.", 500);
    if (!data) return apiError("Conversation introuvable.", 404);
    return apiOk({ deleted: id });
  } catch (error) {
    return apiServerError("conversations.delete", error);
  }
}
