import {
  AI_EMBEDDING_BATCH_SIZE,
  AI_EMBEDDING_DIMENSIONS,
  AI_EMBEDDING_MODEL,
} from "@/lib/ai/config";
import { getOpenAI } from "@/lib/ai/openai";

/**
 * Génération d'embeddings — SERVEUR UNIQUEMENT.
 *
 * Toutes les fonctions renvoient `null` (et non une exception) lorsque
 * `OPENAI_API_KEY` est absente : le Knowledge Engine bascule alors en
 * recherche lexicale au lieu de casser l'application.
 */

/** Tronque un texte à la limite d'entrée du modèle (8192 tokens ≈ 30 000 car.). */
function truncate(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length > 28_000 ? clean.slice(0, 28_000) : clean;
}

export async function embedText(text: string): Promise<number[] | null> {
  const [vector] = (await embedTexts([text])) ?? [];
  return vector ?? null;
}

export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  const client = getOpenAI();
  if (!client) return null;

  const inputs = texts.map(truncate).filter((t) => t.length > 0);
  if (inputs.length === 0) return [];

  const out: number[][] = [];

  for (let i = 0; i < inputs.length; i += AI_EMBEDDING_BATCH_SIZE) {
    const batch = inputs.slice(i, i + AI_EMBEDDING_BATCH_SIZE);

    const response = await client.embeddings.create({
      model: AI_EMBEDDING_MODEL,
      input: batch,
      dimensions: AI_EMBEDDING_DIMENSIONS,
      encoding_format: "float",
    });

    // L'API peut renvoyer les résultats dans le désordre : on trie par index.
    const sorted = [...response.data].sort((a, b) => a.index - b.index);
    for (const item of sorted) out.push(item.embedding as number[]);
  }

  return out;
}

/**
 * pgvector accepte le format texte `[0.1,0.2,…]` via PostgREST.
 * Passer un tableau JS produirait une erreur de type côté Postgres.
 */
export function toPgVector(embedding: number[] | null | undefined): string | null {
  if (!embedding || embedding.length === 0) return null;
  return `[${embedding.join(",")}]`;
}

/**
 * Texte représentatif d'un terme de lexique : le terme seul produit un
 * embedding trop pauvre, on y ajoute synonymes et définition.
 */
export function buildTermEmbeddingInput(term: {
  term: string;
  definition: string;
  synonyms?: string[] | null;
  translations?: string[] | null;
}): string {
  return [
    term.term,
    (term.synonyms || []).join(", "),
    (term.translations || []).join(", "),
    term.definition,
  ]
    .filter(Boolean)
    .join(" — ");
}

export function buildCorrectionEmbeddingInput(correction: {
  context: string;
  ai_output: string;
  user_correction: string;
}): string {
  return [correction.context, correction.ai_output, correction.user_correction]
    .filter(Boolean)
    .join("\n");
}
