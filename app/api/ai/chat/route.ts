import {
  AI_CHAT_MODEL,
  AI_CHAT_RATE_LIMIT,
  AI_CHAT_RATE_WINDOW_MS,
  AI_HISTORY_LIMIT,
} from "@/lib/ai/config";
import {
  buildAIContext,
  buildScopeContext,
  getWriterClient,
  logAIUsage,
  resolveActor,
} from "@/lib/ai/knowledge";
import type { AiCitation } from "@/lib/ai/knowledge";
import { getOpenAI } from "@/lib/ai/openai";
import {
  apiError,
  boolOr,
  enforceRateLimit,
  isUuid,
  readJson,
  str,
} from "@/lib/ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

/**
 * Coach IA — chat branché sur le Knowledge Engine.
 *
 * Réponse en Server-Sent Events. Types d'événements émis :
 *   context  → { citations, degraded, notes, conversationId }
 *   delta    → { text }
 *   done     → { messageId, usage }
 *   error    → { message }
 *
 * La clé OpenAI ne quitte jamais le serveur.
 */

type ChatBody = {
  message?: string;
  conversationId?: string | null;
  module?: string;
  includeReferences?: boolean;
};

function sse(event: string, payload: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
}

export async function POST(request: Request) {
  const result = await resolveActor();
  if (!result.ok) return apiError(result.error, result.status);

  const { actor } = result;

  const limited = enforceRateLimit(
    request,
    "ai-chat",
    actor.userId,
    AI_CHAT_RATE_LIMIT,
    AI_CHAT_RATE_WINDOW_MS
  );
  if (limited) return limited;

  const body = (await readJson<ChatBody>(request)) || {};
  const message = str(body.message, 8000);

  if (!message) return apiError("Le message est vide.");

  const client = getOpenAI();
  if (!client) {
    return apiError(
      "Coach IA n'est pas configuré : la variable OPENAI_API_KEY est absente côté serveur.",
      503
    );
  }

  const moduleKey = str(body.module, 60) || "coach-chat";
  const writer = getWriterClient(actor.supabase);

  try {
    /* --- 1. Conversation ------------------------------------------ */
    let conversationId = isUuid(body.conversationId) ? body.conversationId! : null;

    if (conversationId) {
      const { data: existing } = await actor.supabase
        .from("ai_conversations")
        .select("id")
        .eq("id", conversationId)
        .maybeSingle();
      if (!existing) conversationId = null;
    }

    if (!conversationId) {
      const { data: created, error: createError } = await actor.supabase
        .from("ai_conversations")
        .insert({
          title: message.slice(0, 80),
          module: moduleKey,
          user_id: actor.userId,
          club_id: actor.clubIds[0] ?? null,
          scope: "user",
        })
        .select("id")
        .single();

      if (createError || !created) {
        return apiError(createError?.message || "Création de la conversation impossible.", 500);
      }
      conversationId = created.id;
    }

    /* --- 2. Historique -------------------------------------------- */
    const { data: history } = await actor.supabase
      .from("ai_messages")
      .select("role, content")
      .eq("conversation_id", conversationId)
      .in("role", ["user", "assistant"])
      .order("created_at", { ascending: false })
      .limit(AI_HISTORY_LIMIT);

    const previous = (history || []).reverse() as Array<{
      role: "user" | "assistant";
      content: string;
    }>;

    /* --- 3. Contexte Knowledge Engine ----------------------------- */
    const scope = buildScopeContext(actor);

    const context = await buildAIContext(actor.supabase, {
      query: message,
      module: moduleKey,
      scope,
      includeDocuments: true,
      includeTerms: true,
      includeCorrections: true,
      includeReferences: boolOr(body.includeReferences, false),
    });

    /* --- 4. Message utilisateur ----------------------------------- */
    await actor.supabase.from("ai_messages").insert({
      conversation_id: conversationId,
      role: "user",
      content: message,
    });

    /* --- 5. Streaming --------------------------------------------- */
    const started = Date.now();
    const encoder = new TextEncoder();
    const finalConversationId = conversationId;
    const citations: AiCitation[] = context.citations;

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const push = (event: string, payload: unknown) => {
          controller.enqueue(encoder.encode(sse(event, payload)));
        };

        let answer = "";
        let promptTokens = 0;
        let completionTokens = 0;
        let failure: string | null = null;

        push("context", {
          conversationId: finalConversationId,
          citations,
          degraded: context.degraded,
          notes: context.notes,
        });

        try {
          const openaiStream = await client.responses.create({
            model: AI_CHAT_MODEL,
            instructions: context.systemPrompt,
            input: [
              ...previous.map((m) => ({ role: m.role, content: m.content })),
              { role: "user" as const, content: message },
            ],
            stream: true,
          });

          for await (const event of openaiStream) {
            if (event.type === "response.output_text.delta") {
              const delta = (event as { delta?: string }).delta || "";
              if (delta) {
                answer += delta;
                push("delta", { text: delta });
              }
            } else if (event.type === "response.completed") {
              const usage = (event as { response?: { usage?: Record<string, number> } })
                .response?.usage;
              promptTokens = usage?.input_tokens ?? 0;
              completionTokens = usage?.output_tokens ?? 0;
            } else if (event.type === "error") {
              failure = String((event as { message?: string }).message || "Erreur du modèle.");
            }
          }
        } catch (error) {
          failure = error instanceof Error ? error.message : "Erreur pendant la génération.";
          console.error("[AI][chat] stream", error);
        }

        const latency = Date.now() - started;

        try {
          const { data: saved } = await actor.supabase
            .from("ai_messages")
            .insert({
              conversation_id: finalConversationId,
              role: "assistant",
              content: answer,
              citations,
              model: AI_CHAT_MODEL,
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              latency_ms: latency,
              error: failure,
            })
            .select("id")
            .single();

          await actor.supabase
            .from("ai_conversations")
            .update({
              last_message_at: new Date().toISOString(),
              message_count: previous.length + 2,
            })
            .eq("id", finalConversationId);

          await logAIUsage(writer, {
            userId: actor.userId,
            clubId: actor.clubIds[0] ?? null,
            module: moduleKey,
            operation: "chat",
            model: AI_CHAT_MODEL,
            promptTokens,
            completionTokens,
            latencyMs: latency,
            success: !failure,
            error: failure,
            metadata: {
              citations: citations.length,
              degraded: context.degraded,
            },
          });

          if (failure) {
            push("error", { message: failure });
          } else {
            push("done", {
              messageId: saved?.id ?? null,
              conversationId: finalConversationId,
              usage: { promptTokens, completionTokens, latency },
            });
          }
        } catch (error) {
          console.error("[AI][chat] persistance", error);
          push("error", { message: "La réponse n'a pas pu être enregistrée." });
        }

        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    console.error("[AI][chat]", error);
    return apiError("Coach IA est momentanément indisponible.", 500);
  }
}
