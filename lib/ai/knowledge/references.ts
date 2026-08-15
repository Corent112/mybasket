import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AiReferenceContent,
  AiReferenceWithContent,
  KnowledgeScopeContext,
} from "./types";

/**
 * Contenus de référence : exercices et systèmes existants marqués comme
 * modèles pour l'IA.
 *
 * IMPORTANT : aucune duplication. `ai_reference_content` ne stocke qu'une
 * relation (content_type, content_id) vers les tables `exercises` / `systems`
 * déjà présentes. Le contenu réel est lu à la volée.
 */

const EXERCISE_FIELDS =
  "id, title, objectif, organisation, deroulement, consignes, variantes, categorie, niveau, temps";

const SYSTEM_FIELDS =
  "id, title, objectif, organisation, deroulement, consignes, variantes, famille, categorie";

export type GetReferencesOptions = {
  scope?: Partial<KnowledgeScopeContext>;
  limit?: number;
  /** Filtre optionnel sur les axes d'apprentissage (learning_focus). */
  focus?: string[] | null;
  includeInactive?: boolean;
};

async function getReferences(
  supabase: SupabaseClient,
  contentType: AiReferenceContent["content_type"],
  options: GetReferencesOptions = {}
): Promise<AiReferenceWithContent[]> {
  const scopes = options.scope?.scopes ?? ["global"];
  const clubId = options.scope?.clubId ?? null;
  const userId = options.scope?.userId ?? null;

  let query = supabase
    .from("ai_reference_content")
    .select("*")
    .eq("content_type", contentType)
    .in("scope", scopes)
    .order("quality_score", { ascending: false })
    .limit(options.limit ?? 12);

  if (!options.includeInactive) query = query.eq("is_active", true);

  const { data, error } = await query;

  if (error) {
    console.error("[AI][references] lecture", error.message);
    return [];
  }

  const refs = ((data || []) as AiReferenceContent[]).filter((ref) => {
    if (ref.scope === "club" && ref.club_id !== clubId) return false;
    if (ref.scope === "user" && ref.owner_id !== userId) return false;
    if (options.focus?.length) {
      return ref.learning_focus.some((f) => options.focus!.includes(f));
    }
    return true;
  });

  if (refs.length === 0) return [];

  return hydrateReferences(supabase, refs, contentType);
}

async function hydrateReferences(
  supabase: SupabaseClient,
  refs: AiReferenceContent[],
  contentType: AiReferenceContent["content_type"]
): Promise<AiReferenceWithContent[]> {
  const table = contentType === "exercise" ? "exercises" : contentType === "system" ? "systems" : null;

  if (!table) {
    return refs.map((ref) => ({ ...ref, title: null, summary: null, missing: true }));
  }

  const ids = [...new Set(refs.map((r) => r.content_id))];

  // Les colonnes diffèrent entre `exercises` et `systems` (et le schéma réel
  // comporte des doublons FR/EN) : on sélectionne largement puis on projette
  // en TypeScript, ce qui évite de coupler ce module au schéma exact.
  const fields: string = contentType === "exercise" ? EXERCISE_FIELDS : SYSTEM_FIELDS;

  const { data, error } = await supabase.from(table).select(fields).in("id", ids);

  if (error) {
    console.error(`[AI][references] hydratation ${table}`, error.message);
    return refs.map((ref) => ({ ...ref, title: null, summary: null, missing: true }));
  }

  const byId = new Map<string, Record<string, unknown>>();
  for (const row of (data || []) as unknown as Array<Record<string, unknown>>) {
    byId.set(String(row.id), row);
  }

  return refs.map((ref) => {
    const row = byId.get(ref.content_id);
    if (!row) return { ...ref, title: null, summary: null, missing: true };

    return {
      ...ref,
      title: (row.title as string) ?? null,
      summary: buildSummary(row),
      missing: false,
    };
  });
}

function buildSummary(row: Record<string, unknown>): string {
  const pick = (key: string) => {
    const value = row[key];
    return typeof value === "string" && value.trim() ? value.trim() : null;
  };

  return [
    pick("objectif") && `Objectif : ${pick("objectif")}`,
    pick("organisation") && `Organisation : ${pick("organisation")}`,
    pick("deroulement") && `Déroulement : ${pick("deroulement")}`,
    pick("consignes") && `Consignes : ${pick("consignes")}`,
    pick("variantes") && `Variantes : ${pick("variantes")}`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function getReferenceExercises(
  supabase: SupabaseClient,
  options: GetReferencesOptions = {}
): Promise<AiReferenceWithContent[]> {
  return getReferences(supabase, "exercise", options);
}

export function getReferenceSystems(
  supabase: SupabaseClient,
  options: GetReferencesOptions = {}
): Promise<AiReferenceWithContent[]> {
  return getReferences(supabase, "system", options);
}

/** Rendu texte d'une référence pour le prompt (structure + rédaction). */
export function formatReference(ref: AiReferenceWithContent): string {
  if (ref.missing || !ref.title) return "";

  const header = `« ${ref.title} »${ref.reason ? ` — retenu parce que : ${ref.reason}` : ""}`;
  const focus = ref.learning_focus.length
    ? `\nÀ imiter : ${ref.learning_focus.join(", ")}.`
    : "";

  return `${header}${focus}\n${(ref.summary || "").slice(0, 1600)}`;
}
