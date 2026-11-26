import { diagramImageUrl, documentaryPassages, documentaryQuery, documentaryTopics, learnedDocumentQuery, relaxedDocumentQuery } from "@/lib/ai/knowledge/document-answer";
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
import { createAdminClient } from "@/lib/supabase/admin-server";
import { getOpenAI } from "@/lib/ai/openai";
import { asksForWebResearch, researchBasketballWeb, researchCachePolicy, WEB_RESEARCH_MODEL } from "@/lib/ai/basketball-web-research";
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

    const lastQuestion = previous.filter((entry) => entry.role === "user").at(-1)?.content;
    const followUp = /^(?:et\b|aussi\b|pourquoi\s*[?!.]*$|comment\s*[?!.]*$|(?:peux-tu\s+)?(?:précise|détaille|développe|donne un exemple)\b)/iu.test(message);
    const searchQuestion = followUp && lastQuestion ? `${message} ${lastQuestion.slice(0, 500)}` : message;
    const query = client ? searchQuestion : documentaryQuery(searchQuestion);
    const relaxedQuery = client ? null : relaxedDocumentQuery(query);
    let [context, relatedDocuments] = await Promise.all([buildAIContext(actor.supabase, {
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

    let evidenceQuery = query;
    const hasEvidence = client
      ? !!(context.chunks?.length || context.terms?.length)
      : !!(context.terms?.length || documentaryPassages([
          ...(context.chunks ?? []), ...(relatedDocuments?.chunks ?? []),
        ], query).length);

    if (!hasEvidence) {
      const { data: exchanges, error } = await actor.supabase
        .from("ai_messages")
        .select("conversation_id, role, content, error, ai_conversations!inner(user_id, module, is_archived)")
        .eq("ai_conversations.user_id", actor.userId)
        .eq("ai_conversations.module", moduleKey)
        .eq("ai_conversations.is_archived", false)
        .in("role", ["user", "assistant"])
        .order("created_at", { ascending: false })
        .limit(80);
      if (error) console.warn("[AI][chat] mémoire privée", error.code);

      const learned = learnedDocumentQuery(query, exchanges ?? []);
      if (learned) {
        if (client) {
          const recovered = await buildAIContext(actor.supabase, {
            query: learned,
            module: moduleKey,
            scope,
            includeDocuments: true,
            includeTerms: true,
            includeCorrections: true,
            includeReferences: boolOr(body.includeReferences, false),
          });
          if (recovered.chunks?.length || recovered.terms?.length) context = recovered;
        } else {
          const expanded = relaxedDocumentQuery(learned);
          if (expanded) {
            const recovered = await searchKnowledge(actor.supabase, {
              query: expanded, scope, limit: 40, lexicalOnly: true,
            });
            if (documentaryPassages(recovered.chunks, learned).length) {
              relatedDocuments = recovered;
              evidenceQuery = learned;
            }
          }
        }
      }
    }

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
    const candidateChunks = client ? [] : [
      ...(context.chunks ?? []),
      ...(relatedDocuments?.chunks ?? []),
    ];
    const sharedWriter = candidateChunks.length ? createAdminClient() : null;
    const sharedUsage = new Map<string, number>();
    if (sharedWriter) {
      const { data, error } = await sharedWriter.from("ai_shared_passage_usage")
        .select("chunk_id, response_count")
        .in("chunk_id", [...new Set(candidateChunks.map((chunk) => chunk.id))]);
      if (error) console.warn("[AI][chat] compteurs des passages", error.code);
      for (const row of data ?? []) sharedUsage.set(row.chunk_id, row.response_count);
    }
    const passages = documentaryPassages(candidateChunks, evidenceQuery, sharedUsage);
    if (!client && passages.length) {
      const topics = documentaryTopics(passages.map(({ excerpt }) => excerpt.text), evidenceQuery);
      const extraPassages = await Promise.all(topics.map(async (topic) => {
        const documents = await searchKnowledge(actor.supabase, {
          query: `"${topic}"`, scope, limit: 20, lexicalOnly: true,
        });
        return documentaryPassages(documents.chunks, topic).filter(({ excerpt }) =>
          excerpt.text.toLowerCase().replace(/[-–\s]+/g, " ").includes(topic)
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
    let citations: AiCitation[] = client
      ? context.citations.filter((citation) => citation.diagramUrl)
      : term && diagramUrl ? [{ kind: "term", id: term.id, label: term.term, diagramUrl }] : [];

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const push = (event: string, payload: unknown) => {
          controller.enqueue(encoder.encode(sse(event, payload)));
        };

        let answer = "";
        let answerModel = model;
        let usedResearchCache = false;
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
          const evidenceAvailable = client ? !!(context.chunks?.length || context.terms?.length) : !!(passages.length || term);
          const explicitWeb = asksForWebResearch(message);
          const researchClient = explicitWeb || !evidenceAvailable ? getOpenAI() : null;
          if (researchClient) {
            try {
              const { queryKey, refresh, cutoff } = researchCachePolicy(searchQuestion);
              const cached = refresh ? null : await actor.supabase.from("ai_basketball_web_research")
                .select("answer,citations").eq("user_id", actor.userId).eq("query_key", queryKey)
                .gte("researched_at", cutoff).maybeSingle();
              if (cached?.data) {
                answer = cached.data.answer;
                citations = cached.data.citations;
                answerModel = WEB_RESEARCH_MODEL;
                usedResearchCache = true;
              } else {
                const web = await researchBasketballWeb(researchClient, searchQuestion);
                promptTokens = web.promptTokens;
                completionTokens = web.completionTokens;
                if (web.complete && web.answer && web.citations.length && web.searched) {
                  answer = web.answer;
                  citations = web.citations;
                  answerModel = WEB_RESEARCH_MODEL;
                  const { error } = await actor.supabase.from("ai_basketball_web_research").upsert({
                    user_id: actor.userId, query_key: queryKey, question: searchQuestion, answer,
                    citations, researched_at: new Date().toISOString(),
                  });
                  if (error) console.warn("[AI][chat] sauvegarde recherche web", error.code);
                }
              }
            } catch (error) {
              console.warn("[AI][chat] recherche web indisponible", error instanceof Error ? error.name : "Erreur");
            }
          }
          if (answer) {
            push("context", { conversationId: finalConversationId, citations, degraded: false, notes: [] });
            push("delta", { text: answer });
          } else if (!client) {
            if (passages.length) {
              answer = passages.map(({ excerpt }) => excerpt.text).join("\n\n");
            } else if (term) {
              answer = `${term.term} — ${term.definition}`;
            } else {
              answer = "Je n’ai pas trouvé de définition ni de passage correspondant dans les ressources MyBasket. Précise le terme, la compétition ou le contexte basket de ta question.";
            }
            push("delta", { text: answer });
          } else {
            const openaiStream = await client.responses.create({
              model,
              instructions: context.systemPrompt + "\nRéponds exclusivement aux questions liées au basketball. Demande le contexte basket s’il manque. Donne une réponse détaillée. Réunis tous les éléments pertinents disponibles, en présentant directement toutes les options, leurs conditions, les consignes et les exemples. N’affiche aucun nom de source, fichier, numéro de page ni citation. Évite les répétitions et signale les éléments que les sources ne permettent pas de préciser.",
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
                promptTokens += usage?.input_tokens ?? 0;
                completionTokens += usage?.output_tokens ?? 0;
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
              model: answerModel,
              prompt_tokens: promptTokens,
              completion_tokens: completionTokens,
              latency_ms: latency,
              error: failure,
            })
            .select("id")
            .single();

          if (saved?.id && !failure && answerModel === model && passages.length && sharedWriter) {
            const { error } = await sharedWriter.rpc("ai_record_shared_passages", {
              p_chunk_ids: [...new Set(passages.map(({ chunk }) => chunk.id))],
            });
            if (error) console.warn("[AI][chat] mise à jour des passages", error.code);
          }

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
            model: answerModel,
            promptTokens,
            completionTokens,
            latencyMs: latency,
            success: !failure,
            error: failure,
            metadata: {
              citations: citations.length,
              web_cache_hit: usedResearchCache,
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
