import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_EMBEDDING_MODEL, AI_STORAGE_BUCKET, AI_MAX_FILE_SIZE } from "@/lib/ai/config";
import { buildChunks, estimateTokens } from "./chunking";
import { embedTexts, toPgVector } from "./embeddings";
import { extractDocumentText, isIndexableType, resolveSourceType } from "./extract";
import { sanitizeKnowledgeText } from "./sanitize";
import type { AiKnowledgeSource } from "./types";

/**
 * Pipeline d'indexation RAG.
 *
 *   Document → Extraction → Découpage → Embeddings → Chunks en base
 *
 * Choix technique : pgvector dans Supabase plutôt que le Vector Store OpenAI.
 * Raisons — le projet stocke déjà 100 % de ses données dans Supabase, la RLS
 * par scope (global/club/user) s'applique nativement aux chunks, il n'y a
 * aucune donnée à synchroniser entre deux systèmes, et les futurs modules
 * (photo→exercice, vidéo→système, LiveStatsPro) pourront joindre directement
 * les chunks aux tables `exercises` / `systems` existantes.
 *
 * Cette fonction est conçue pour être appelée depuis une route serveur. Elle
 * met à jour `ai_knowledge_sources.index_status` à chaque étape pour que le
 * dashboard reflète l'état réel.
 */

export type IndexResult = {
  ok: boolean;
  sourceId: string;
  chunkCount: number;
  tokenCount: number;
  strategy: "embedded" | "stored-only";
  warnings: string[];
  error?: string;
};

// Longer than the maximum duration of any route that indexes a source.
export const INDEX_LEASE_MS = 15 * 60_000;
export const MAX_AUTOMATIC_INDEX_ATTEMPTS = 3;

export async function indexSource(
  supabase: SupabaseClient,
  writer: SupabaseClient,
  sourceId: string,
  options?: { scheduledVersion: string },
): Promise<IndexResult> {
  const warnings: string[] = [];

  const { data, error } = await supabase
    .from("ai_knowledge_sources")
    .select("*")
    .eq("id", sourceId)
    .maybeSingle();

  if (error || !data) {
    return {
      ok: false,
      sourceId,
      chunkCount: 0,
      tokenCount: 0,
      strategy: "stored-only",
      warnings,
      error: error?.message || "Document introuvable.",
    };
  }

  const source = data as AiKnowledgeSource;
  const automatic = options !== undefined;
  const attempts = Number(source.metadata?.automatic_index_attempts ?? 0) || 0;
  const unavailable =
    !source.is_active ||
    source.status === "archived" ||
    (source.index_status === "running" &&
      Date.now() - Date.parse(source.updated_at) < INDEX_LEASE_MS) ||
    (automatic &&
      (source.updated_at !== options.scheduledVersion ||
        !["pending", "failed", "running"].includes(source.index_status) ||
        attempts >= MAX_AUTOMATIC_INDEX_ATTEMPTS));

  // Compare the version when claiming the source so manual and daily jobs
  // cannot replace the same passages at the same time.
  const claim = unavailable ? null : await writer
    .from("ai_knowledge_sources")
    .update({
      status: "processing",
      index_status: "running",
      index_error: null,
      metadata: {
        ...source.metadata,
        automatic_index_attempts: automatic ? attempts + 1 : 0,
        automatic_index_exhausted: automatic && attempts + 1 >= MAX_AUTOMATIC_INDEX_ATTEMPTS,
      },
    })
    .eq("id", sourceId)
    .eq("updated_at", source.updated_at)
    .eq("is_active", true)
    .neq("status", "archived")
    .select("id")
    .maybeSingle();

  if (!claim?.data || claim.error) {
    return {
      ok: false, sourceId, chunkCount: 0, tokenCount: 0, strategy: "stored-only", warnings,
      error: claim?.error ? "Impossible de démarrer l’indexation." : "Le document est déjà en cours de traitement ou a changé.",
    };
  }

  try {
    /* --- 1. Récupération du fichier ------------------------------- */
    if (!source.storage_path) {
      throw new Error("Aucun fichier associé à ce document.");
    }

    const { data: file, error: downloadError } = await writer.storage
      .from(source.storage_bucket || AI_STORAGE_BUCKET)
      .download(source.storage_path);

    if (downloadError || !file) {
      throw new Error(downloadError?.message || "Téléchargement du fichier impossible.");
    }

    if(file.size>AI_MAX_FILE_SIZE)throw new Error("Le document dépasse 50 Mo.");

    /* --- 2. Extraction -------------------------------------------- */
    const sourceType = resolveSourceType(source.mime_type, source.original_filename);

    if (!isIndexableType(sourceType)) {
      await writer
        .from("ai_knowledge_sources")
        .update({
          status: "indexed",
          index_status: "skipped",
          index_error: null,
          indexed_at: new Date().toISOString(),
          chunk_count: 0,
        })
        .eq("id", sourceId);

      return {
        ok: true,
        sourceId,
        chunkCount: 0,
        tokenCount: 0,
        strategy: "stored-only",
        warnings: [
          "Ce type de fichier est stocké et référencé, mais son contenu n'est pas encore extrait automatiquement.",
        ],
      };
    }

    const allowPaidIndexing = process.env.MYBASKET_COACH_MODE === "generative";
    const extraction = await extractDocumentText(await file.arrayBuffer(), sourceType, { allowVision: allowPaidIndexing });
    if (extraction.warning) warnings.push(extraction.warning);

    if (extraction.pages.length === 0) {
      throw new Error(
        extraction.warning ||
          "Aucun texte exploitable n'a pu être extrait de ce document."
      );
    }

    /* --- 3. Découpage --------------------------------------------- */
    const rawChunks = buildChunks(extraction.pages);
    if (rawChunks.length === 0) {
      throw new Error("Le document ne contient pas assez de texte pour être indexé.");
    }

    // Neutralisation des tentatives d'injection AVANT stockage.
    let suspiciousCount = 0;
    const chunks = rawChunks.map((chunk) => {
      const sanitized = sanitizeKnowledgeText(chunk.content);
      if (sanitized.suspicious) suspiciousCount++;
      return { ...chunk, content: sanitized.text, suspicious: sanitized.suspicious };
    });

    if (suspiciousCount > 0) {
      warnings.push(
        `${suspiciousCount} passage(s) contiennent des formulations ressemblant à des instructions. ` +
          "Ils sont indexés comme données inertes et ne peuvent pas modifier le comportement de l'IA."
      );
    }

    /* --- 4. Embeddings -------------------------------------------- */
    let vectors: number[][] | null = null;
    try {
      if (allowPaidIndexing) vectors = await embedTexts(chunks.map((c) => c.content));
    } catch (embedError) {
      console.error("[AI][indexer] embeddings", embedError);
      warnings.push(
        "Les embeddings n'ont pas pu être générés : le document reste consultable en recherche lexicale. Relance une réindexation plus tard."
      );
    }

    if (!vectors && warnings.every((warning) => !warning.includes("embeddings"))) {
      warnings.push(
        "Document consultable par mots-clés."
      );
    }

    /* --- 5. Écriture des chunks ----------------------------------- */
    const { error: deleteError } = await writer.from("ai_knowledge_chunks").delete().eq("source_id", sourceId);
    if (deleteError) throw new Error("Impossible de remplacer les passages précédents.");

    const rows = chunks.map((chunk, i) => ({
      source_id: sourceId,
      chunk_index: chunk.index,
      content: chunk.content,
      token_count: chunk.tokenCount,
      page_from: chunk.pageFrom,
      page_to: chunk.pageTo,
      heading: chunk.heading,
      embedding: vectors ? toPgVector(vectors[i]) : null,
      embedding_model: AI_EMBEDDING_MODEL,
      scope: source.scope,
      club_id: source.club_id,
      owner_id: source.owner_id,
      category_slug: source.category_slug,
      is_active: true,
      metadata: chunk.suspicious ? { suspicious: true } : {},
    }));

    // Insertion par lots : PostgREST plafonne la taille des requêtes.
    const BATCH = 100;
    for (let i = 0; i < rows.length; i += BATCH) {
      const { error: insertError } = await writer
        .from("ai_knowledge_chunks")
        .insert(rows.slice(i, i + BATCH));
      if (insertError) throw new Error(`Écriture des passages : ${insertError.message}`);
    }

    const tokenCount = chunks.reduce((sum, c) => sum + c.tokenCount, 0);

    const { error: finishError } = await writer
      .from("ai_knowledge_sources")
      .update({
        status: "indexed",
        index_status: "done",
        index_error: null,
        indexed_at: new Date().toISOString(),
        chunk_count: chunks.length,
        token_count: tokenCount,
      })
      .eq("id", sourceId);
    if (finishError) throw new Error("Impossible d’enregistrer la fin de l’indexation.");

    return {
      ok: true,
      sourceId,
      chunkCount: chunks.length,
      tokenCount,
      strategy: vectors ? "embedded" : "stored-only",
      warnings,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur d'indexation inconnue.";
    console.error("[AI][indexer]", sourceId, message);

    await writer
      .from("ai_knowledge_sources")
      .update({ status: "failed", index_status: "failed", index_error: message.slice(0, 800) })
      .eq("id", sourceId);

    return {
      ok: false,
      sourceId,
      chunkCount: 0,
      tokenCount: 0,
      strategy: "stored-only",
      warnings,
      error: message,
    };
  }
}

/** Réindexe plusieurs documents en série (évite de saturer l'API OpenAI). */
export async function reindexSources(
  supabase: SupabaseClient,
  writer: SupabaseClient,
  sourceIds: string[]
): Promise<IndexResult[]> {
  const results: IndexResult[] = [];
  for (const id of sourceIds) {
    results.push(await indexSource(supabase, writer, id));
  }
  return results;
}

export { estimateTokens };
