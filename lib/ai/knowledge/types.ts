import type {
  AiCorrectionType,
  AiIndexStatus,
  AiModule,
  AiRulePriority,
  AiScope,
  AiSourceStatus,
  AiSourceType,
} from "@/lib/ai/config";

/* --------------------------------------------------------------------- */
/* Portée                                                                 */
/* --------------------------------------------------------------------- */

/**
 * Portée effective d'une requête au Knowledge Engine.
 * `scopes` est ordonné : global → club → user (du plus prioritaire au moins).
 */
export type KnowledgeScopeContext = {
  scopes: AiScope[];
  clubId: string | null;
  userId: string | null;
};

/* --------------------------------------------------------------------- */
/* Entités                                                                */
/* --------------------------------------------------------------------- */

export type AiKnowledgeCategory = {
  id: string;
  slug: string;
  label: string;
  description: string | null;
  icon: string | null;
  position: number;
  is_active: boolean;
  is_system: boolean;
};

export type AiKnowledgeSource = {
  id: string;
  title: string;
  description: string | null;
  source_type: AiSourceType;
  category_slug: string | null;
  storage_bucket: string;
  storage_path: string | null;
  original_filename: string | null;
  mime_type: string | null;
  file_size: number | null;
  checksum: string | null;
  provenance: string | null;
  source_url: string | null;
  author: string | null;
  published_at: string | null;
  status: AiSourceStatus;
  index_status: AiIndexStatus;
  index_error: string | null;
  indexed_at: string | null;
  chunk_count: number;
  token_count: number;
  is_active: boolean;
  scope: AiScope;
  club_id: string | null;
  owner_id: string | null;
  created_by: string | null;
  updated_by: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AiTerm = {
  id: string;
  term: string;
  definition: string;
  category_slug: string | null;
  synonyms: string[];
  translations: string[];
  examples: string[];
  notes: string | null;
  source: string | null;
  schema_url: string | null;
  schema_ref_type: "exercise" | "system" | "play" | "image" | null;
  schema_ref_id: string | null;
  priority: AiRulePriority;
  is_active: boolean;
  scope: AiScope;
  club_id: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AiRule = {
  id: string;
  name: string;
  instruction: string;
  category_slug: string | null;
  modules: string[];
  priority: AiRulePriority;
  is_active: boolean;
  position: number;
  examples_good: string[];
  examples_bad: string[];
  scope: AiScope;
  club_id: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
};

export type AiReferenceContent = {
  id: string;
  content_type: "exercise" | "system" | "session" | "play";
  content_id: string;
  reason: string | null;
  quality_score: number;
  tags: string[];
  learning_focus: string[];
  is_active: boolean;
  scope: AiScope;
  club_id: string | null;
  owner_id: string | null;
  created_at: string;
  updated_at: string;
};

/** Référence enrichie avec le contenu réel lu dans `exercises` / `systems`. */
export type AiReferenceWithContent = AiReferenceContent & {
  title: string | null;
  summary: string | null;
  missing: boolean;
};

export type AiCorrection = {
  id: string;
  context: string;
  ai_output: string;
  user_correction: string;
  explanation: string | null;
  correction_type: AiCorrectionType;
  module: string;
  related_type: "exercise" | "system" | "session" | "match" | "play" | "document" | null;
  related_id: string | null;
  status: "pending" | "active" | "rejected" | "archived";
  scope: AiScope;
  club_id: string | null;
  owner_id: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AiConversation = {
  id: string;
  title: string;
  module: string;
  user_id: string;
  club_id: string | null;
  scope: AiScope;
  is_archived: boolean;
  last_message_at: string;
  message_count: number;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
};

export type AiCitation = {
  kind: "document" | "term" | "rule" | "reference" | "correction";
  id: string;
  label: string;
  detail?: string | null;
  score?: number | null;
};

export type AiMessage = {
  id: string;
  conversation_id: string;
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  citations: AiCitation[];
  attachments: unknown[];
  model: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  latency_ms: number | null;
  error: string | null;
  created_at: string;
};

/* --------------------------------------------------------------------- */
/* Recherche                                                              */
/* --------------------------------------------------------------------- */

export type KnowledgeChunkMatch = {
  id: string;
  source_id: string;
  content: string;
  similarity: number;
  chunk_index: number;
  page_from: number | null;
  page_to: number | null;
  heading: string | null;
  category_slug: string | null;
  source_title: string;
  provenance: string;
};

export type TermMatch = Pick<
  AiTerm,
  "id" | "term" | "definition" | "synonyms" | "examples" | "notes" | "source" | "priority"
> & { similarity: number };

export type CorrectionMatch = Pick<
  AiCorrection,
  "id" | "context" | "ai_output" | "user_correction" | "explanation" | "correction_type" | "module"
> & { similarity: number };

export type SearchKnowledgeOptions = {
  query: string;
  limit?: number;
  minSimilarity?: number;
  categories?: string[] | null;
  scope?: Partial<KnowledgeScopeContext>;
  /** Force la recherche lexicale (utile si l'embedding est indisponible). */
  lexicalOnly?: boolean;
};

export type SearchKnowledgeResult = {
  chunks: KnowledgeChunkMatch[];
  strategy: "semantic" | "lexical" | "none";
  degraded: boolean;
  reason?: string;
};

/* --------------------------------------------------------------------- */
/* Contexte assemblé                                                      */
/* --------------------------------------------------------------------- */

export type BuildAIContextOptions = {
  /** Requête / intention utilisateur, utilisée pour la récupération. */
  query: string;
  module: AiModule | string;
  scope?: Partial<KnowledgeScopeContext>;
  includeDocuments?: boolean;
  includeTerms?: boolean;
  includeCorrections?: boolean;
  includeReferences?: boolean;
  documentLimit?: number;
  termLimit?: number;
  correctionLimit?: number;
  referenceLimit?: number;
  categories?: string[] | null;
};

export type AIContext = {
  /** Bloc système prêt à être envoyé au modèle, hiérarchie déjà appliquée. */
  systemPrompt: string;
  rules: AiRule[];
  terms: TermMatch[];
  chunks: KnowledgeChunkMatch[];
  corrections: CorrectionMatch[];
  references: AiReferenceWithContent[];
  citations: AiCitation[];
  degraded: boolean;
  notes: string[];
};

/* --------------------------------------------------------------------- */
/* Vue d'ensemble                                                         */
/* --------------------------------------------------------------------- */

export type KnowledgeOverview = {
  documents: number;
  documentsIndexed: number;
  documentsPending: number;
  documentsFailed: number;
  chunks: number;
  terms: number;
  rules: number;
  rulesCritical: number;
  corrections: number;
  referenceExercises: number;
  referenceSystems: number;
  conversations: number;
  indexation: {
    status: "idle" | "running" | "partial" | "error";
    pending: number;
    running: number;
    failed: number;
    lastIndexedAt: string | null;
  };
  recent: Array<{
    id: string;
    kind: "document" | "term" | "rule" | "correction" | "reference";
    label: string;
    detail: string | null;
    createdAt: string;
  }>;
  openAiConfigured: boolean;
};
