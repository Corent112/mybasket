import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Journal de consommation IA (`ai_usage`).
 *
 * Volontairement silencieux : un échec d'écriture du journal ne doit jamais
 * faire échouer une génération pour l'utilisateur.
 */
export type LogAIUsageInput = {
  userId?: string | null;
  clubId?: string | null;
  module: string;
  operation: "chat" | "embedding" | "indexation" | "generation" | "analysis" | "other";
  model?: string | null;
  promptTokens?: number | null;
  completionTokens?: number | null;
  latencyMs?: number | null;
  success?: boolean;
  error?: string | null;
  metadata?: Record<string, unknown>;
};

export async function logAIUsage(
  supabase: SupabaseClient,
  input: LogAIUsageInput
): Promise<void> {
  try {
    const prompt = input.promptTokens ?? 0;
    const completion = input.completionTokens ?? 0;

    await supabase.from("ai_usage").insert({
      user_id: input.userId ?? null,
      club_id: input.clubId ?? null,
      module: input.module,
      operation: input.operation,
      model: input.model ?? null,
      prompt_tokens: prompt,
      completion_tokens: completion,
      total_tokens: prompt + completion,
      latency_ms: input.latencyMs ?? null,
      success: input.success ?? true,
      error: input.error ?? null,
      metadata: input.metadata ?? {},
    });
  } catch (error) {
    console.warn("[AI][usage] écriture du journal impossible", error);
  }
}
