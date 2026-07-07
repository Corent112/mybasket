import { createClient } from "@/lib/supabase/client";
import { useCallback, useEffect, useMemo, useState } from "react";

/**
 * livestat-tags — SOURCE D'AFFICHAGE UNIQUE des temps forts.
 *
 * Règle absolue : on n'affiche JAMAIS `action.temps_fort` (la key) directement.
 * On résout toujours key -> label via `livestat_tags` (paramétré par équipe),
 * avec repli sur les constantes locales si l'équipe n'a rien en base.
 *
 * À utiliser dans TOUTES les pages stats :
 *   LiveStat, stats équipe, fiche équipe, fiche joueur, matrice, shot chart, playlists.
 *
 * Réglages propres à chaque team_id : label, emoji, color, shortcut_key,
 * shortcut_modifier, clip_mode, pre_roll, post_roll, sort_order, is_active.
 */

export type TagCategory = "offense" | "defense";
export type ClipMode = "auto" | "possession" | "manual" | "hybrid";

export interface LivestatTag {
  id?: string;                       // présent seulement pour les lignes venant de Supabase
  key: string;                       // clé STABLE (= id historique du temps fort) — jamais affichée
  label: string;                     // libellé affiché (renommable sans casser la key)
  category: TagCategory;
  emoji?: string | null;
  color?: string | null;
  shortcut_key?: string | null;
  shortcut_modifier?: string | null;
  clip_mode?: ClipMode;
  pre_roll?: number;
  post_roll?: number;
  is_active?: boolean;
  sort_order?: number;
}

/* =====================================================================
 * FALLBACK — miroir EXACT des constantes TEMPS de PriseStatsProPage.
 * Sert de source de vérité tant que livestat_tags est vide pour l'équipe,
 * et garantit qu'une key inconnue en base ne s'affiche jamais « brute ».
 * key = id historique (transition, pick-top, …) → ne change jamais.
 * ===================================================================== */
export const FALLBACK_TEMPS_FORTS: LivestatTag[] = [
  { key: "fast-break",      label: "Fast Break",        category: "offense", emoji: "🏃", color: "#2f6fd4", clip_mode: "possession", pre_roll: 6, post_roll: 4, is_active: true, sort_order: 1 },
  { key: "transition",      label: "Transition",        category: "offense", emoji: "⚡", color: "#2f6fd4", clip_mode: "possession", pre_roll: 6, post_roll: 4, is_active: true, sort_order: 2 },
  { key: "jeu-place",       label: "Jeu placé",         category: "offense", emoji: "📋", color: "#2f6fd4", clip_mode: "possession", pre_roll: 6, post_roll: 3, is_active: true, sort_order: 3 },
  { key: "pick-side",       label: "Pick Side",         category: "offense", emoji: "⛹", color: "#2f6fd4", clip_mode: "possession", pre_roll: 5, post_roll: 3, is_active: true, sort_order: 4 },
  { key: "pick-top",        label: "Pick Top",          category: "offense", emoji: "⛹", color: "#2f6fd4", clip_mode: "possession", pre_roll: 5, post_roll: 3, is_active: true, sort_order: 5 },
  { key: "hand-off",        label: "Hand Off",          category: "offense", emoji: "🤝", color: "#2f6fd4", clip_mode: "possession", pre_roll: 5, post_roll: 3, is_active: true, sort_order: 6 },
  { key: "1v1",             label: "1v1",               category: "offense", emoji: "🤼", color: "#2f6fd4", clip_mode: "possession", pre_roll: 5, post_roll: 3, is_active: true, sort_order: 7 },
  { key: "drive-kick",      label: "Drive & kick",      category: "offense", emoji: "🎯", color: "#2f6fd4", clip_mode: "possession", pre_roll: 5, post_roll: 3, is_active: true, sort_order: 8 },
  { key: "stagger",         label: "Stagger",           category: "offense", emoji: "🧱", color: "#2f6fd4", clip_mode: "possession", pre_roll: 5, post_roll: 3, is_active: true, sort_order: 9 },
  { key: "jeu-sans-ballon", label: "Jeu sans ballon",   category: "offense", emoji: "✂", color: "#2f6fd4", clip_mode: "possession", pre_roll: 5, post_roll: 3, is_active: true, sort_order: 10 },
  { key: "off-rebound",     label: "Offensive Rebound", category: "offense", emoji: "↺", color: "#2f6fd4", clip_mode: "auto",       pre_roll: 4, post_roll: 4, is_active: true, sort_order: 11 },
];

const FALLBACK_BY_KEY: Record<string, LivestatTag> = Object.fromEntries(
  FALLBACK_TEMPS_FORTS.map((t) => [t.key, t]),
);

const DEFAULT_COLOR = "#6B1A2C";

/* =====================================================================
 * Chargement depuis Supabase (par équipe)
 * ===================================================================== */
export async function fetchTeamTags(teamId: string): Promise<LivestatTag[]> {
  if (!teamId) return [];

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("livestat_tags")
      .select("*")
      .eq("team_id", teamId)
      .order("sort_order", { ascending: true });

    if (error) {
      console.error("livestat_tags fetch:", error.message);
      return [];
    }

    return (data ?? []) as LivestatTag[];
  } catch (e) {
    console.error("livestat_tags fetch exception:", e);
    return [];
  }
}

/* =====================================================================
 * Résolveur — l'objet que consomment toutes les pages.
 *
 * `source`  : 'supabase' si l'équipe a des lignes, sinon 'fallback'.
 * `all` / `active` / `byCategory` : LA LISTE (respecte le paramétrage équipe :
 *             si l'équipe a configuré ses temps forts, on n'affiche QUE les siens ;
 *             sinon on affiche les constantes).
 * `label` / `emoji` / `color` : résolution d'UNE key quelconque (ex. rendu d'une
 *             action déjà codée). Dégrade toujours proprement :
 *             label DB → label constante → jamais la key brute.
 * ===================================================================== */
export interface TagResolver {
  source: "supabase" | "fallback";
  all: LivestatTag[];
  active: LivestatTag[];
  byCategory: (category: TagCategory) => LivestatTag[];
  byKey: (key: string) => LivestatTag | undefined;
  label: (key: string | null | undefined) => string;
  emoji: (key: string | null | undefined) => string;
  color: (key: string | null | undefined) => string;
  category: (key: string | null | undefined) => TagCategory | undefined;
  shortcut: (key: string | null | undefined) => string | null;
}

export function makeTagResolver(dbTags: LivestatTag[]): TagResolver {
  const hasDb = dbTags.length > 0;

  // Map de résolution key -> tag (DB écrase la constante, la constante comble les trous)
  const resolveMap = new Map<string, LivestatTag>();
  FALLBACK_TEMPS_FORTS.forEach((t) => resolveMap.set(t.key, t));
  dbTags.forEach((t) =>
    resolveMap.set(t.key, { ...FALLBACK_BY_KEY[t.key], ...t }),
  );

  // Liste affichée : réglage équipe prioritaire, sinon constantes
  const list = (hasDb ? dbTags : FALLBACK_TEMPS_FORTS)
    .slice()
    .sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));

  const get = (key: string | null | undefined) =>
    key ? resolveMap.get(key) : undefined;

  return {
    source: hasDb ? "supabase" : "fallback",
    all: list,
    active: list.filter((t) => t.is_active !== false),
    byCategory: (category) =>
      list.filter((t) => t.category === category && t.is_active !== false),
    byKey: get,
    label: (key) => get(key)?.label ?? (key ? String(key) : ""),
    emoji: (key) => get(key)?.emoji ?? "",
    color: (key) => get(key)?.color ?? DEFAULT_COLOR,
    category: (key) => get(key)?.category,
    shortcut: (key) => get(key)?.shortcut_key ?? null,
  };
}

/* =====================================================================
 * Hook React — à appeler dans chaque page stats avec le team_id courant.
 *   const tags = useLivestatTags(teamId);
 *   ...
 *   <span>{tags.label(action.temps_fort)}</span>   // jamais la key brute
 *   tags.active.map(t => ...)                        // grilles / filtres
 * ===================================================================== */
export function useLivestatTags(teamId: string | null | undefined) {
  const [dbTags, setDbTags] = useState<LivestatTag[]>([]);
  const [loading, setLoading] = useState(false);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    let alive = true;

    if (!teamId) {
      setDbTags([]);
      return;
    }

    setLoading(true);
    fetchTeamTags(teamId).then((rows) => {
      if (!alive) return;
      setDbTags(rows);
      setLoading(false);
    });

    return () => {
      alive = false;
    };
  }, [teamId, nonce]);

  const resolver = useMemo(() => makeTagResolver(dbTags), [dbTags]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { ...resolver, loading, reload };
}

/* =====================================================================
 * CRUD admin (paramétrage par équipe). Données seulement — l'UI viendra
 * en Phase 2. user_id est rempli par le défaut auth.uid() côté base.
 * ===================================================================== */
export async function upsertTeamTag(teamId: string, tag: LivestatTag) {
  const supabase = createClient();
  const { id, ...rest } = tag;
  return supabase
    .from("livestat_tags")
    .upsert({ team_id: teamId, ...rest }, { onConflict: "team_id,key" });
}

export async function updateTagFields(id: string, patch: Partial<LivestatTag>) {
  const supabase = createClient();
  return supabase.from("livestat_tags").update(patch).eq("id", id);
}

export async function setTagActive(id: string, isActive: boolean) {
  return updateTagFields(id, { is_active: isActive });
}

/** Recopie les constantes dans livestat_tags pour une équipe (équivalent du seed SQL). */
export async function seedTeamFromFallback(teamId: string) {
  const supabase = createClient();
  const rows = FALLBACK_TEMPS_FORTS.map((t) => ({ team_id: teamId, ...t }));
  return supabase
    .from("livestat_tags")
    .upsert(rows, { onConflict: "team_id,key" });
}
