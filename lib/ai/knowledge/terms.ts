import type { SupabaseClient } from "@supabase/supabase-js";
import { embedText, toPgVector } from "./embeddings";
import type { AiTerm, KnowledgeScopeContext, TermMatch } from "./types";

/**
 * Lexique basket — récupération contextuelle.
 *
 * Deux stratégies combinées :
 *   1. correspondance LEXICALE exacte (terme ou synonyme présent dans la
 *      requête) : indispensable, un embedding rate parfois « Short Roll » ;
 *   2. correspondance SÉMANTIQUE via pgvector.
 * Les deux listes sont fusionnées, dédoublonnées, et les correspondances
 * exactes remontent en tête.
 */

export type GetRelevantTermsOptions = {
  query: string;
  limit?: number;
  minSimilarity?: number;
  scope?: Partial<KnowledgeScopeContext>;
};

function normalizeForMatch(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export async function getRelevantTerms(
  supabase: SupabaseClient,
  options: GetRelevantTermsOptions
): Promise<TermMatch[]> {
  const limit = options.limit ?? 6;
  const scopes = options.scope?.scopes ?? ["global"];
  const clubId = options.scope?.clubId ?? null;
  const userId = options.scope?.userId ?? null;
  const haystack = normalizeForMatch(options.query);

  const results = new Map<string, TermMatch>();

  /* --- 1. Correspondance lexicale ---------------------------------- */
  const { data: allTerms, error: lexicalError } = await supabase
    .from("ai_terms")
    .select(
      "id, term, definition, synonyms, examples, notes, source, priority, scope, club_id, owner_id"
    )
    .eq("is_active", true)
    .in("scope", scopes)
    .limit(2000);

  if (lexicalError) {
    console.error("[AI][terms] lecture lexique", lexicalError.message);
  }

  for (const raw of (allTerms || []) as Array<AiTerm>) {
    if (raw.scope === "club" && raw.club_id !== clubId) continue;
    if (raw.scope === "user" && raw.owner_id !== userId) continue;

    const candidates = [raw.term, ...(raw.synonyms || [])]
      .filter(Boolean)
      .map(normalizeForMatch)
      .filter((c) => c.length >= 3);

    const hit = candidates.some((candidate) => haystack.includes(candidate));
    if (!hit) continue;

    results.set(raw.id, {
      id: raw.id,
      term: raw.term,
      definition: raw.definition,
      synonyms: raw.synonyms || [],
      examples: raw.examples || [],
      notes: raw.notes,
      source: raw.source,
      priority: raw.priority,
      similarity: 1,
    });
  }

  /* --- 2. Correspondance sémantique -------------------------------- */
  if (results.size < limit) {
    const embedding = await embedText(options.query).catch(() => null);
    const vector = toPgVector(embedding);

    if (vector) {
      const { data, error } = await supabase.rpc("ai_match_terms", {
        p_query_embedding: vector,
        p_match_count: limit * 2,
        p_min_similarity: options.minSimilarity ?? 0.2,
        p_scopes: scopes,
        p_club_id: clubId,
        p_owner_id: userId,
      });

      if (error) {
        console.error("[AI][terms] ai_match_terms", error.message);
      } else {
        for (const row of (data || []) as TermMatch[]) {
          if (!results.has(row.id)) results.set(row.id, row);
        }
      }
    }
  }

  return [...results.values()]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit);
}

/** Rendu texte d'un terme pour le prompt. */
export function formatTerm(term: TermMatch): string {
  const lines = [`• ${term.term} : ${term.definition}`];
  if (term.synonyms?.length) lines.push(`  Synonymes : ${term.synonyms.join(", ")}`);
  if (term.examples?.length) lines.push(`  Exemple : ${term.examples[0]}`);
  if (term.notes) lines.push(`  Note : ${term.notes}`);
  return lines.join("\n");
}
