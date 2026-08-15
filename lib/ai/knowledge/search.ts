import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_DEFAULT_MATCH_COUNT, AI_MIN_SIMILARITY } from "@/lib/ai/config";
import { embedText, toPgVector } from "./embeddings";
import type {
  KnowledgeChunkMatch,
  SearchKnowledgeOptions,
  SearchKnowledgeResult,
} from "./types";

/**
 * Recherche dans les documents indexés (RAG).
 *
 * Stratégie sémantique (pgvector) avec repli lexical automatique :
 *   - pas de clé OpenAI → lexical ;
 *   - embedding en erreur → lexical ;
 *   - 0 résultat sémantique → lexical.
 * Le résultat indique toujours la stratégie réellement utilisée, pour que
 * l'interface puisse le signaler honnêtement.
 */
export async function searchKnowledge(
  supabase: SupabaseClient,
  options: SearchKnowledgeOptions
): Promise<SearchKnowledgeResult> {
  const query = options.query?.trim();
  if (!query) return { chunks: [], strategy: "none", degraded: false };

  const limit = options.limit ?? AI_DEFAULT_MATCH_COUNT;
  const scopes = options.scope?.scopes ?? ["global"];
  const clubId = options.scope?.clubId ?? null;
  const userId = options.scope?.userId ?? null;

  if (!options.lexicalOnly) {
    let embedding: number[] | null = null;
    let embedError: string | undefined;

    try {
      embedding = await embedText(query);
    } catch (error) {
      embedError = error instanceof Error ? error.message : "embedding indisponible";
      console.error("[AI][search] embedding", embedError);
    }

    const vector = toPgVector(embedding);

    if (vector) {
      const { data, error } = await supabase.rpc("ai_match_chunks", {
        p_query_embedding: vector,
        p_match_count: limit,
        p_min_similarity: options.minSimilarity ?? AI_MIN_SIMILARITY,
        p_scopes: scopes,
        p_club_id: clubId,
        p_owner_id: userId,
        p_categories: options.categories ?? null,
      });

      if (error) {
        console.error("[AI][search] ai_match_chunks", error.message);
      } else if ((data || []).length > 0) {
        return {
          chunks: data as KnowledgeChunkMatch[],
          strategy: "semantic",
          degraded: false,
        };
      }
    }

    const lexical = await lexicalSearch(supabase, query, limit, scopes, clubId, userId);
    return {
      chunks: lexical,
      strategy: lexical.length > 0 ? "lexical" : "none",
      degraded: true,
      reason: vector
        ? "Aucun passage sémantiquement proche — repli sur la recherche lexicale."
        : embedError ||
          "Recherche sémantique indisponible (OPENAI_API_KEY absente ou embedding en échec).",
    };
  }

  const lexical = await lexicalSearch(supabase, query, limit, scopes, clubId, userId);
  return {
    chunks: lexical,
    strategy: lexical.length > 0 ? "lexical" : "none",
    degraded: false,
  };
}

async function lexicalSearch(
  supabase: SupabaseClient,
  query: string,
  limit: number,
  scopes: string[],
  clubId: string | null,
  userId: string | null
): Promise<KnowledgeChunkMatch[]> {
  const { data, error } = await supabase.rpc("ai_search_chunks_text", {
    p_query: query,
    p_match_count: limit,
    p_scopes: scopes,
    p_club_id: clubId,
    p_owner_id: userId,
  });

  if (error) {
    console.error("[AI][search] ai_search_chunks_text", error.message);
    return [];
  }

  return (data || []) as KnowledgeChunkMatch[];
}

/** Libellé de provenance affichable : « Cahier d'exercices — page 12 ». */
export function formatChunkProvenance(chunk: KnowledgeChunkMatch): string {
  const parts = [chunk.provenance || chunk.source_title];

  if (chunk.page_from) {
    parts.push(
      chunk.page_to && chunk.page_to !== chunk.page_from
        ? `pages ${chunk.page_from}-${chunk.page_to}`
        : `page ${chunk.page_from}`
    );
  } else if (chunk.heading) {
    parts.push(chunk.heading);
  }

  return parts.filter(Boolean).join(" — ");
}
