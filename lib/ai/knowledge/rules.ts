import type { SupabaseClient } from "@supabase/supabase-js";
import type { AiRulePriority } from "@/lib/ai/config";
import type { AiRule, KnowledgeScopeContext } from "./types";

/**
 * Règles métier IA.
 *
 * Hiérarchie (cf. §11 du cahier des charges) :
 *   1. règles CRITIQUES MyBasket (scope global, priority = critical)
 *   2. règles globales MyBasket
 *   3. règles du club
 *   4. préférences utilisateur (scope user)
 * Une règle `critical` de portée globale ne peut jamais être écrasée par une
 * règle de club ou une préférence utilisateur : le tri ci-dessous la place en
 * tête et `buildAIContext` l'annonce comme non négociable.
 */

const PRIORITY_WEIGHT: Record<AiRulePriority, number> = {
  critical: 0,
  high: 1,
  normal: 2,
  low: 3,
};

const SCOPE_WEIGHT: Record<string, number> = {
  global: 0,
  club: 1,
  user: 2,
};

export function sortRules(rules: AiRule[]): AiRule[] {
  return [...rules].sort((a, b) => {
    // Les règles critiques globales passent toujours en premier.
    const aCriticalGlobal = a.priority === "critical" && a.scope === "global" ? 0 : 1;
    const bCriticalGlobal = b.priority === "critical" && b.scope === "global" ? 0 : 1;
    if (aCriticalGlobal !== bCriticalGlobal) return aCriticalGlobal - bCriticalGlobal;

    const scopeDiff = (SCOPE_WEIGHT[a.scope] ?? 9) - (SCOPE_WEIGHT[b.scope] ?? 9);
    if (scopeDiff !== 0) return scopeDiff;

    const priorityDiff =
      (PRIORITY_WEIGHT[a.priority] ?? 9) - (PRIORITY_WEIGHT[b.priority] ?? 9);
    if (priorityDiff !== 0) return priorityDiff;

    if (a.position !== b.position) return a.position - b.position;
    return a.name.localeCompare(b.name, "fr");
  });
}

export type GetActiveAIRulesOptions = {
  /** Ne conserver que les règles applicables à ce module (+ les règles globales). */
  module?: string | null;
  scope?: Partial<KnowledgeScopeContext>;
  limit?: number;
};

/**
 * Retourne les règles actives applicables, déjà triées selon la hiérarchie.
 */
export async function getActiveAIRules(
  supabase: SupabaseClient,
  options: GetActiveAIRulesOptions = {}
): Promise<AiRule[]> {
  const scopes = options.scope?.scopes ?? ["global"];
  const clubId = options.scope?.clubId ?? null;
  const userId = options.scope?.userId ?? null;

  const query = supabase
    .from("ai_rules")
    .select("*")
    .eq("is_active", true)
    .in("scope", scopes)
    .limit(options.limit ?? 200);

  const { data, error } = await query;

  if (error) {
    console.error("[AI][rules] getActiveAIRules", error.message);
    return [];
  }

  const rules = ((data || []) as AiRule[]).filter((rule) => {
    if (rule.scope === "club" && rule.club_id !== clubId) return false;
    if (rule.scope === "user" && rule.owner_id !== userId) return false;
    if (!options.module) return true;
    // modules vide = règle universelle
    return rule.modules.length === 0 || rule.modules.includes(options.module);
  });

  return sortRules(rules);
}

/** Rendu texte d'une règle, prêt à être injecté dans un prompt système. */
export function formatRule(rule: AiRule, index: number): string {
  const lines = [`${index}. [${rule.priority.toUpperCase()}] ${rule.name} — ${rule.instruction}`];

  if (rule.examples_good.length > 0) {
    lines.push(`   ✅ À faire : ${rule.examples_good.map((e) => `« ${e} »`).join(" / ")}`);
  }
  if (rule.examples_bad.length > 0) {
    lines.push(`   ❌ À éviter : ${rule.examples_bad.map((e) => `« ${e} »`).join(" / ")}`);
  }

  return lines.join("\n");
}
