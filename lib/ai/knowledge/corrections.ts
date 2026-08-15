import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiCorrectionType, AiScope } from "@/lib/ai/config";
import {
  buildCorrectionEmbeddingInput,
  embedText,
  toPgVector,
} from "./embeddings";
import type { AiCorrection, CorrectionMatch, KnowledgeScopeContext } from "./types";

/**
 * Mémoire des corrections.
 *
 * PAS de fine-tuning : on enregistre la correction, on l'embedde, et on la
 * retrouve par similarité lorsqu'une situation comparable se présente. Elle
 * est alors injectée dans le prompt comme un exemple à suivre.
 */

export type SaveAICorrectionInput = {
  context: string;
  aiOutput: string;
  userCorrection: string;
  explanation?: string | null;
  correctionType?: AiCorrectionType;
  module: string;
  relatedType?: AiCorrection["related_type"];
  relatedId?: string | null;
  scope?: AiScope;
  clubId?: string | null;
  ownerId?: string | null;
  createdBy: string;
  status?: AiCorrection["status"];
  metadata?: Record<string, unknown>;
};

export async function saveAICorrection(
  supabase: SupabaseClient,
  input: SaveAICorrectionInput
): Promise<{ ok: true; correction: AiCorrection } | { ok: false; error: string }> {
  const scope: AiScope = input.scope ?? "global";

  if (scope === "club" && !input.clubId) {
    return { ok: false, error: "clubId requis pour une correction de portée club." };
  }
  if (scope === "user" && !input.ownerId) {
    return { ok: false, error: "ownerId requis pour une correction de portée utilisateur." };
  }

  let embedding: string | null = null;
  try {
    const vector = await embedText(
      buildCorrectionEmbeddingInput({
        context: input.context,
        ai_output: input.aiOutput,
        user_correction: input.userCorrection,
      })
    );
    embedding = toPgVector(vector);
  } catch (error) {
    // Une correction sans embedding reste utile (consultable, réindexable).
    console.error("[AI][corrections] embedding", error);
  }

  const { data, error } = await supabase
    .from("ai_corrections")
    .insert({
      context: input.context,
      ai_output: input.aiOutput,
      user_correction: input.userCorrection,
      explanation: input.explanation ?? null,
      correction_type: input.correctionType ?? "other",
      module: input.module,
      related_type: input.relatedType ?? null,
      related_id: input.relatedId ?? null,
      status: input.status ?? "active",
      embedding,
      scope,
      club_id: scope === "club" ? input.clubId : null,
      owner_id: scope === "user" ? input.ownerId : null,
      created_by: input.createdBy,
      metadata: input.metadata ?? {},
    })
    .select("*")
    .single();

  if (error) {
    console.error("[AI][corrections] insert", error.message);
    return { ok: false, error: error.message };
  }

  return { ok: true, correction: data as AiCorrection };
}

export type GetRelevantCorrectionsOptions = {
  query: string;
  module?: string | null;
  limit?: number;
  minSimilarity?: number;
  scope?: Partial<KnowledgeScopeContext>;
};

export async function getRelevantCorrections(
  supabase: SupabaseClient,
  options: GetRelevantCorrectionsOptions
): Promise<CorrectionMatch[]> {
  const embedding = await embedText(options.query).catch(() => null);
  const vector = toPgVector(embedding);
  if (!vector) return [];

  const { data, error } = await supabase.rpc("ai_match_corrections", {
    p_query_embedding: vector,
    p_match_count: options.limit ?? 5,
    p_min_similarity: options.minSimilarity ?? 0.25,
    p_module: options.module ?? null,
    p_scopes: options.scope?.scopes ?? ["global"],
    p_club_id: options.scope?.clubId ?? null,
    p_owner_id: options.scope?.userId ?? null,
  });

  if (error) {
    console.error("[AI][corrections] ai_match_corrections", error.message);
    return [];
  }

  return (data || []) as CorrectionMatch[];
}

/** Recalcule l'embedding d'une correction existante (après édition). */
export async function reembedCorrection(
  supabase: SupabaseClient,
  correctionId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("ai_corrections")
    .select("id, context, ai_output, user_correction")
    .eq("id", correctionId)
    .maybeSingle();

  if (error || !data) return false;

  const vector = await embedText(
    buildCorrectionEmbeddingInput(data as Pick<AiCorrection, "context" | "ai_output" | "user_correction">)
  ).catch(() => null);

  const embedding = toPgVector(vector);
  if (!embedding) return false;

  const { error: updateError } = await supabase
    .from("ai_corrections")
    .update({ embedding })
    .eq("id", correctionId);

  return !updateError;
}

export function formatCorrection(correction: CorrectionMatch): string {
  return [
    `Contexte : ${correction.context}`,
    `❌ Ce que l'IA avait produit : « ${correction.ai_output} »`,
    `✅ Formulation validée par MyBasket : « ${correction.user_correction} »`,
    correction.explanation ? `Raison : ${correction.explanation}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}
