/**
 * MyBasket — configuration centrale du Knowledge Engine.
 *
 * Toutes les constantes IA vivent ici : aucun module ne doit redéfinir
 * un nom de modèle, une taille de chunk ou une limite de fichier.
 */

/* --------------------------------------------------------------------- */
/* Modèles                                                                */
/* --------------------------------------------------------------------- */

/** Modèle de génération utilisé par Coach IA et les futurs modules. */
export const AI_CHAT_MODEL = process.env.OPENAI_CHAT_MODEL || "gpt-5.6-terra";

/** Modèle rapide (titres de conversation, reformulations courtes). */
export const AI_FAST_MODEL = process.env.OPENAI_FAST_MODEL || "gpt-5.6-luna";

/** Modèle vision pour les imports photo. Configurable séparément pour maîtriser les coûts. */
export const AI_VISION_MODEL = process.env.OPENAI_VISION_MODEL || AI_FAST_MODEL;

/** Modèle d'embedding. Changer ce modèle impose une réindexation complète. */
export const AI_EMBEDDING_MODEL =
  process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small";

/** Dimension des embeddings — doit correspondre à `vector(1536)` en base. */
export const AI_EMBEDDING_DIMENSIONS = 1536;

/* --------------------------------------------------------------------- */
/* Indexation / RAG                                                       */
/* --------------------------------------------------------------------- */

/** Taille cible d'un chunk, en caractères (~250 tokens en français). */
export const AI_CHUNK_SIZE = 1400;

/** Recouvrement entre deux chunks consécutifs, en caractères. */
export const AI_CHUNK_OVERLAP = 200;

/** Nombre maximum de chunks générés pour un seul document. */
export const AI_MAX_CHUNKS_PER_SOURCE = 1500;

/** Nombre de textes envoyés par appel à l'API d'embeddings. */
export const AI_EMBEDDING_BATCH_SIZE = 64;

/** Passages injectés par défaut dans le contexte d'une génération. */
export const AI_DEFAULT_MATCH_COUNT = 8;

/** Similarité cosinus minimale pour retenir un passage. */
export const AI_MIN_SIMILARITY = 0.15;

/** Budget de caractères alloué aux extraits documentaires dans un prompt. */
export const AI_CONTEXT_CHAR_BUDGET = 12000;

/* --------------------------------------------------------------------- */
/* Documents                                                              */
/* --------------------------------------------------------------------- */

export const AI_STORAGE_BUCKET = "ai-knowledge";

/** 50 Mo — doit rester aligné avec `file_size_limit` du bucket. */
export const AI_MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * Types MIME acceptés à l'upload.
 * `indexable: false` = le fichier est stocké et référencé mais pas encore
 * découpé en chunks (images, vidéos, PPTX : modules à venir).
 */
export const AI_ALLOWED_MIME_TYPES: Record<
  string,
  { sourceType: AiSourceType; extensions: string[]; indexable: boolean }
> = {
  "application/pdf": { sourceType: "pdf", extensions: ["pdf"], indexable: true },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": {
    sourceType: "docx",
    extensions: ["docx"],
    indexable: true,
  },
  "application/msword": { sourceType: "docx", extensions: ["doc"], indexable: false },
  "text/plain": { sourceType: "txt", extensions: ["txt"], indexable: true },
  "text/markdown": { sourceType: "markdown", extensions: ["md", "markdown"], indexable: true },
  "text/csv": { sourceType: "csv", extensions: ["csv"], indexable: true },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": {
    sourceType: "pptx",
    extensions: ["pptx"],
    indexable: false,
  },
  "image/png": { sourceType: "image", extensions: ["png"], indexable: false },
  "image/jpeg": { sourceType: "image", extensions: ["jpg", "jpeg"], indexable: false },
  "image/webp": { sourceType: "image", extensions: ["webp"], indexable: false },
};

export type AiSourceType =
  | "pdf"
  | "docx"
  | "txt"
  | "markdown"
  | "csv"
  | "pptx"
  | "image"
  | "video"
  | "link"
  | "manual";

/* --------------------------------------------------------------------- */
/* Modules IA (valeurs de `ai_rules.modules`, `ai_corrections.module`)     */
/* --------------------------------------------------------------------- */

export const AI_MODULES = [
  { key: "coach-chat", label: "Coach IA" },
  { key: "exercise-generation", label: "Création d'exercice" },
  { key: "system-generation", label: "Création de système" },
  { key: "session-generation", label: "Création de séance" },
  { key: "drawing-analysis", label: "Analyse d'un dessin" },
  { key: "photo-analysis", label: "Analyse d'une photo" },
  { key: "session-scan", label: "Numérisation fiche séance" },
  { key: "video-exercise", label: "Analyse vidéo — exercice" },
  { key: "video-system", label: "Analyse vidéo — système" },
  { key: "livestats", label: "LiveStatsPro IA" },
  { key: "search", label: "Recherche intelligente" },
  { key: "recommendation", label: "Recommandations" },
  { key: "other", label: "Autre" },
] as const;

export type AiModule = (typeof AI_MODULES)[number]["key"];

export const AI_RULE_PRIORITIES = ["critical", "high", "normal", "low"] as const;
export type AiRulePriority = (typeof AI_RULE_PRIORITIES)[number];

export const AI_SCOPES = ["global", "club", "user"] as const;
export type AiScope = (typeof AI_SCOPES)[number];

export const AI_SOURCE_STATUSES = [
  "uploaded",
  "processing",
  "indexed",
  "failed",
  "archived",
] as const;
export type AiSourceStatus = (typeof AI_SOURCE_STATUSES)[number];

export const AI_INDEX_STATUSES = ["pending", "running", "done", "failed", "skipped"] as const;
export type AiIndexStatus = (typeof AI_INDEX_STATUSES)[number];

export const AI_CORRECTION_TYPES = [
  { key: "terminology", label: "Terminologie" },
  { key: "structure", label: "Structure" },
  { key: "tactics", label: "Tactique" },
  { key: "wording", label: "Formulation" },
  { key: "factual", label: "Erreur factuelle" },
  { key: "format", label: "Format" },
  { key: "other", label: "Autre" },
] as const;

export type AiCorrectionType = (typeof AI_CORRECTION_TYPES)[number]["key"];

/* --------------------------------------------------------------------- */
/* Divers                                                                 */
/* --------------------------------------------------------------------- */

/** Nombre de messages d'historique renvoyés au modèle. */
export const AI_HISTORY_LIMIT = 16;

/** Rate limit du chat : requêtes par fenêtre et durée de la fenêtre. */
export const AI_CHAT_RATE_LIMIT = 20;
export const AI_CHAT_RATE_WINDOW_MS = 60_000;

/** Rate limit de l'upload/indexation. */
export const AI_INDEX_RATE_LIMIT = 10;
export const AI_INDEX_RATE_WINDOW_MS = 60_000;

export function isOpenAiConfigured(): boolean {
  return Boolean(process.env.OPENAI_API_KEY);
}
