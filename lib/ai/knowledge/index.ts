/**
 * MyBasket Knowledge Engine — point d'entrée unique.
 *
 * Toutes les fonctionnalités IA de MyBasket (Coach IA, création d'exercice,
 * création de système, analyse de dessin, analyse de photo, numérisation de
 * fiche séance, analyse vidéo, LiveStatsPro IA, recherche intelligente,
 * recommandations…) doivent consommer CE module, jamais réimplémenter leur
 * propre logique de contexte ou de prompt.
 *
 * Usage type dans une future route :
 *
 *   import { resolveActor, buildScopeContext, buildAIContext } from "@/lib/ai/knowledge";
 *
 *   const result = await resolveActor();
 *   if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
 *
 *   const scope = buildScopeContext(result.actor);
 *   const context = await buildAIContext(result.actor.supabase, {
 *     query: "défense du pick and roll",
 *     module: "exercise-generation",
 *     scope,
 *     includeReferences: true,
 *   });
 *
 *   // context.systemPrompt → à passer au modèle
 *   // context.citations    → à afficher à l'utilisateur
 */

export * from "./types";

export {
  AI_ADMIN_ROLES,
  buildScopeContext,
  getWriterClient,
  globalScopeContext,
  resolveActor,
  resolveAdminActor,
  type ActorResult,
  type AiActor,
} from "./actor";

export { buildAIContext } from "./context";

export { getActiveAIRules, formatRule, sortRules } from "./rules";
export { getRelevantTerms, formatTerm } from "./terms";
export { searchKnowledge, formatChunkProvenance } from "./search";
export { getReferenceExercises, getReferenceSystems, formatReference } from "./references";
export {
  saveAICorrection,
  getRelevantCorrections,
  reembedCorrection,
  formatCorrection,
  type SaveAICorrectionInput,
} from "./corrections";

export { getKnowledgeOverview } from "./overview";
export { indexSource, reindexSources, type IndexResult } from "./indexer";
export { logAIUsage, type LogAIUsageInput } from "./usage";

export {
  embedText,
  embedTexts,
  toPgVector,
  buildTermEmbeddingInput,
  buildCorrectionEmbeddingInput,
} from "./embeddings";

export { buildChunks, splitText, estimateTokens } from "./chunking";
export {
  extractDocumentText,
  isIndexableType,
  resolveSourceType,
  type ExtractionResult,
} from "./extract";
export {
  sanitizeKnowledgeText,
  wrapKnowledgeExcerpt,
  KNOWLEDGE_SAFETY_NOTICE,
} from "./sanitize";
