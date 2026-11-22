import { diagramImageUrl, documentaryPassages, documentaryQuery, relaxedDocumentQuery } from "@/lib/ai/knowledge/document-answer";
import { searchKnowledge } from "@/lib/ai/knowledge/search";
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
    AI_CHAT_RATE_WINDOW_MS,
  );
  if (limited) return limited;

  const body = (await readJson<ChatBody>(request)) || {};
  const message = str(body.message, 8000);

  if (!message) return apiError("Le message est vide.");

  // The documentary assistant works without a model or embedding API.
  const client = process.env.MYBASKET_COACH_MODE === "generative" ? getOpenAI() : null;
  const model = client ? AI_CHAT_MODEL : "mybasket-documents";

  const moduleKey = str(body.module, 60) || "coach-chat";
  const writer = getWriterClient(actor.supabase);

  try {
    /* --- 1. Conversation ------------------------------------------ */
    let conversationId = isUuid(body.conversationId)
      ? body.conversationId!
      : null;

    if (conversationId) {
      const { data: existing } = await actor.supabase
        .from("ai_conversations")
        .select("id")
        .eq("id", conversationId)
        .eq("user_id", actor.userId)
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
        console.error("[AI][chat] conversation", createError);
        if (["PGRST205", "42P01"].includes(createError?.code || "")) {
          return Response.json(
            {
              error:
                "La base de connaissances IA doit être initialisée par l’administrateur.",
              code: "AI_SETUP_REQUIRED",
            },
            { status: 503 },
          );
        }
        return apiError(
          "La conversation n’a pas pu être créée. Réessaie dans un instant.",
          500,
        );
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

    const query = client ? message : documentaryQuery(message);
    const relaxedQuery = client ? null : relaxedDocumentQuery(query);
    const [context, relatedDocuments] = await Promise.all([buildAIContext(actor.supabase, {
      query,
      module: moduleKey,
      scope,
      includeDocuments: true,
      includeTerms: true,
      lexicalOnly: !client,
      includeCorrections: !!client,
      includeReferences: !!client && boolOr(body.includeReferences, false),
    }), relaxedQuery
      ? searchKnowledge(actor.supabase, { query: relaxedQuery, scope, limit: 40, lexicalOnly: true })
      : null]);

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
    const term = !client ? context.terms?.[0] : undefined;
    const passages = client ? [] : documentaryPassages([
      ...(context.chunks ?? []),
      ...(relatedDocuments?.chunks ?? []),
    ], query);
    // Follow up on variants found in the selected coverage, even when they are
    // explained in a different document. Keep the original coverage first.
    if (!client && /\b(?:protect|drop)\b/i.test(query) && passages.length) {
      const variants = ["short roll", "long roll"];
      const mentionsVariant = (value: string, variant: string) =>
        value.toLowerCase().replace(/[-–\s]+/g, " ").includes(variant);
      const mentioned = variants.filter((variant) =>
        passages.some(({ excerpt }) => mentionsVariant(excerpt.text, variant))
      );
      const extraPassages = await Promise.all(mentioned.map(async (variant) => {
        const documents = await searchKnowledge(actor.supabase, {
          query: `"${variant}"`, scope, limit: 20, lexicalOnly: true,
        });
        const eligible = documents.chunks.filter(({ content }) =>
          /\b(?:protect|drop)\b/i.test(content)
          || content.split("\n").some((line) => line.trim().toLowerCase().replace(/[-–\s]+/g, " ") === variant)
        );
        return documentaryPassages(eligible, variant).filter(({ excerpt }) =>
          mentionsVariant(excerpt.text, variant)
        );
      }));
      const fingerprints = passages.map(({ excerpt }) => excerpt.text.replace(/\s+/g, " ").trim());
      for (const candidate of extraPassages.flat()) {
        const normalized = candidate.excerpt.text.replace(/\s+/g, " ").trim();
        if (fingerprints.some((text) => text.includes(normalized) || normalized.includes(text))) continue;
        fingerprints.push(normalized);
        passages.push(candidate);
      }
    }
    const diagramUrl = diagramImageUrl(term?.schema_url);
    const citations: AiCitation[] = client
      ? context.citations.filter((citation) => citation.diagramUrl)
      : term && diagramUrl ? [{ kind: "term", id: term.id, label: term.term, diagramUrl }] : [];

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
          if (!client) {
            if (passages.length) {
              answer = passages.map(({ excerpt }) => excerpt.text).join("\n\n");
            } else if (term) {
              answer = `${term.term} — ${term.definition}`;
            } else {
              answer = "Je n’ai pas trouvé de définition ni de passage correspondant dans les ressources MyBasket. Essaie avec le nom précis du terme ou quelques mots-clés.";
            }
            push("delta", { text: answer });
          } else {
            const openaiStream = await client.responses.create({
              model,
              instructions: context.systemPrompt + "\nDonne une réponse détaillée. Réunis tous les éléments pertinents disponibles, en présentant directement toutes les options, leurs conditions, les consignes et les exemples. Quand le sujet est le protect ou le drop, détaille le short roll et le long roll si la documentation les décrit. N’affiche aucun nom de source, fichier, numéro de page ni citation. Évite les répétitions et signale les éléments que les sources ne permettent pas de préciser.",
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
                const usage = (
                  event as { response?: { usage?: Record<string, number> } }
                ).response?.usage;
                promptTokens = usage?.input_tokens ?? 0;
                completionTokens = usage?.output_tokens ?? 0;
              } else if (event.type === "error") {
                failure = String(
                  (event as { message?: string }).message || "Erreur du modèle.",
                );
              }
            }
          }
        } catch (error) {
          failure =
            error instanceof Error
              ? error.message
              : "Erreur pendant la génération.";
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
              model,
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
            model,
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
            push("error", {
              message:
                "L’assistant n’a pas pu terminer sa réponse. Réessaie dans un instant.",
            });
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
