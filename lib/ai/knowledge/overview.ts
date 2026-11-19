import type { SupabaseClient } from "@supabase/supabase-js";
import { isOpenAiConfigured } from "@/lib/ai/config";
import type { KnowledgeOverview } from "./types";

/** Compte les lignes d'une table avec un filtre optionnel, sans les charger. */
async function count(
  supabase: SupabaseClient,
  table: string,
  filters: Record<string, unknown> = {},
  unavailable?: Set<string>,
): Promise<number> {
  let query = supabase.from(table).select("id", { count: "exact", head: true });

  for (const [column, value] of Object.entries(filters)) {
    query = Array.isArray(value)
      ? query.in(column, value)
      : query.eq(column, value);
  }

  const { count: total, error } = await query;
  if (error) {
    unavailable?.add(table);
    console.error(`[AI][overview] count ${table}`, error.message);
    return 0;
  }
  return total ?? 0;
}

/**
 * État du cerveau IA MyBasket, portée GLOBAL (administration CEO).
 */
export async function getKnowledgeOverview(
  supabase: SupabaseClient,
): Promise<KnowledgeOverview> {
  const scope = { scope: "global" };
  const unavailable = new Set<string>();
  const total = (table: string, filters: Record<string, unknown> = {}) =>
    count(supabase, table, filters, unavailable);

  const [
    documents,
    documentsIndexed,
    documentsFailed,
    indexPending,
    indexRunning,
    chunks,
    terms,
    rules,
    rulesCritical,
    corrections,
    referenceExercises,
    referenceSystems,
    conversations,
  ] = await Promise.all([
    total("ai_knowledge_sources", scope),
    total("ai_knowledge_sources", { ...scope, status: "indexed" }),
    total("ai_knowledge_sources", { ...scope, status: "failed" }),
    total("ai_knowledge_sources", { ...scope, index_status: "pending" }),
    total("ai_knowledge_sources", { ...scope, index_status: "running" }),
    total("ai_knowledge_chunks", scope),
    total("ai_terms", { ...scope, is_active: true }),
    total("ai_rules", { ...scope, is_active: true }),
    total("ai_rules", { ...scope, is_active: true, priority: "critical" }),
    total("ai_corrections", { ...scope, status: "active" }),
    total("ai_reference_content", {
      ...scope,
      content_type: "exercise",
      is_active: true,
    }),
    total("ai_reference_content", {
      ...scope,
      content_type: "system",
      is_active: true,
    }),
    total("ai_conversations", {}),
    total("ai_messages", {}),
  ]);

  const { data: lastIndexed } = await supabase
    .from("ai_knowledge_sources")
    .select("indexed_at")
    .eq("scope", "global")
    .not("indexed_at", "is", null)
    .order("indexed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const recent = await getRecentKnowledge(supabase);

  const indexationStatus: KnowledgeOverview["indexation"]["status"] =
    unavailable.size > 0
      ? "error"
      : indexRunning > 0
        ? "running"
        : documentsFailed > 0
          ? "error"
          : indexPending > 0
            ? "partial"
            : "idle";

  return {
    documents,
    documentsIndexed,
    documentsPending: indexPending,
    documentsFailed,
    chunks,
    terms,
    rules,
    rulesCritical,
    corrections,
    referenceExercises,
    referenceSystems,
    conversations,
    indexation: {
      status: indexationStatus,
      pending: indexPending,
      running: indexRunning,
      failed: documentsFailed,
      lastIndexedAt: (lastIndexed?.indexed_at as string) ?? null,
    },
    recent,
    openAiConfigured: isOpenAiConfigured(),
    databaseReady: unavailable.size === 0,
    unavailableTables: [...unavailable],
  };
}

async function getRecentKnowledge(
  supabase: SupabaseClient,
): Promise<KnowledgeOverview["recent"]> {
  const [sources, terms, rules, corrections] = await Promise.all([
    supabase
      .from("ai_knowledge_sources")
      .select("id, title, source_type, created_at")
      .eq("scope", "global")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("ai_terms")
      .select("id, term, category_slug, created_at")
      .eq("scope", "global")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("ai_rules")
      .select("id, name, priority, created_at")
      .eq("scope", "global")
      .order("created_at", { ascending: false })
      .limit(5),
    supabase
      .from("ai_corrections")
      .select("id, user_correction, module, created_at")
      .order("created_at", { ascending: false })
      .limit(5),
  ]);

  const items: KnowledgeOverview["recent"] = [];

  for (const row of sources.data || []) {
    items.push({
      id: row.id,
      kind: "document",
      label: row.title,
      detail: row.source_type,
      createdAt: row.created_at,
    });
  }
  for (const row of terms.data || []) {
    items.push({
      id: row.id,
      kind: "term",
      label: row.term,
      detail: row.category_slug,
      createdAt: row.created_at,
    });
  }
  for (const row of rules.data || []) {
    items.push({
      id: row.id,
      kind: "rule",
      label: row.name,
      detail: row.priority,
      createdAt: row.created_at,
    });
  }
  for (const row of corrections.data || []) {
    items.push({
      id: row.id,
      kind: "correction",
      label: String(row.user_correction || "").slice(0, 90),
      detail: row.module,
      createdAt: row.created_at,
    });
  }

  return items
    .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
    .slice(0, 12);
}
