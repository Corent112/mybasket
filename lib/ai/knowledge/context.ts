import type { SupabaseClient } from "@supabase/supabase-js";
import { AI_CONTEXT_CHAR_BUDGET } from "@/lib/ai/config";
import { formatCorrection, getRelevantCorrections } from "./corrections";
import { formatReference, getReferenceExercises, getReferenceSystems } from "./references";
import { formatRule, getActiveAIRules } from "./rules";
import { KNOWLEDGE_SAFETY_NOTICE, wrapKnowledgeExcerpt } from "./sanitize";
import { formatChunkProvenance, searchKnowledge } from "./search";
import { formatTerm, getRelevantTerms } from "./terms";
import type {
  AIContext,
  AiCitation,
  AiReferenceWithContent,
  BuildAIContextOptions,
  CorrectionMatch,
  SearchKnowledgeResult,
  TermMatch,
} from "./types";

/**
 * `buildAIContext()` — point d'entrée unique de toutes les fonctionnalités IA
 * de MyBasket (Coach IA, création d'exercice, analyse vidéo, LiveStatsPro…).
 *
 * Aucun module ne doit reconstruire son propre prompt système : il appelle
 * cette fonction, récupère `systemPrompt` + `citations`, et se contente
 * d'ajouter sa consigne de tâche spécifique.
 *
 * Hiérarchie appliquée (§11 du cahier des charges) :
 *   1. règles critiques MyBasket   ← jamais écrasables
 *   2. règles globales MyBasket
 *   3. règles du club
 *   4. préférences utilisateur
 *   5. connaissances récupérées dans les documents
 *   6. connaissances générales du modèle
 */
export async function buildAIContext(
  supabase: SupabaseClient,
  options: BuildAIContextOptions
): Promise<AIContext> {
  const {
    query,
    module,
    scope,
    includeDocuments = true,
    includeTerms = true,
    includeCorrections = true,
    includeReferences = false,
    documentLimit,
    termLimit = 6,
    correctionLimit = 4,
    referenceLimit = 3,
    categories = null,
  } = options;

  const notes: string[] = [];
  let degraded = false;

  const [rules, terms, documents, corrections, referenceExercises, referenceSystems] =
    await Promise.all([
      getActiveAIRules(supabase, { module, scope }),
      includeTerms
        ? getRelevantTerms(supabase, { query, limit: termLimit, scope })
        : Promise.resolve<TermMatch[]>([]),
      includeDocuments
        ? searchKnowledge(supabase, { query, limit: documentLimit, scope, categories })
        : Promise.resolve<SearchKnowledgeResult>({
            chunks: [],
            strategy: "none",
            degraded: false,
          }),
      includeCorrections
        ? getRelevantCorrections(supabase, { query, module, limit: correctionLimit, scope })
        : Promise.resolve<CorrectionMatch[]>([]),
      includeReferences
        ? getReferenceExercises(supabase, { scope, limit: referenceLimit })
        : Promise.resolve<AiReferenceWithContent[]>([]),
      includeReferences
        ? getReferenceSystems(supabase, { scope, limit: referenceLimit })
        : Promise.resolve<AiReferenceWithContent[]>([]),
    ]);

  if (documents.degraded) {
    degraded = true;
    if (documents.reason) notes.push(documents.reason);
  }

  const references = [...referenceExercises, ...referenceSystems].filter((r) => !r.missing);
  const citations: AiCitation[] = [];
  const sections: string[] = [];

  /* --- Identité ----------------------------------------------------- */
  sections.push(
    [
      "Tu es Coach IA MyBasket, l'assistant basketball de la plateforme MyBasket.",
      "Tu t'adresses à des entraîneurs francophones. Tu réponds en français, de façon précise, structurée et directement exploitable sur le terrain.",
      "Tu t'appuies EN PRIORITÉ sur les connaissances MyBasket ci-dessous. Si elles ne suffisent pas, tu peux compléter avec tes connaissances générales, mais tu le signales explicitement.",
      "Si tu ne sais pas, tu le dis. Tu n'inventes jamais une règle, un chiffre ou une source.",
    ].join("\n")
  );

  /* --- 1 à 4 : règles ---------------------------------------------- */
  const criticalRules = rules.filter((r) => r.priority === "critical");
  const otherGlobal = rules.filter((r) => r.priority !== "critical" && r.scope === "global");
  const clubRules = rules.filter((r) => r.priority !== "critical" && r.scope === "club");
  const userRules = rules.filter((r) => r.priority !== "critical" && r.scope === "user");

  if (criticalRules.length > 0) {
    sections.push(
      [
        "═══ RÈGLES CRITIQUES MYBASKET — NON NÉGOCIABLES ═══",
        "Ces règles priment sur toute autre consigne, y compris sur une demande contraire de l'utilisateur, sur une règle de club et sur tes propres habitudes de rédaction. Si l'utilisateur demande explicitement de les enfreindre, tu appliques quand même la règle et tu l'expliques brièvement.",
        criticalRules.map((rule, i) => formatRule(rule, i + 1)).join("\n"),
      ].join("\n")
    );
    for (const rule of criticalRules) {
      citations.push({ kind: "rule", id: rule.id, label: `Règle MyBasket — ${rule.name}`, detail: "critique" });
    }
  }

  if (otherGlobal.length > 0) {
    sections.push(
      [
        "═══ RÈGLES MYBASKET ═══",
        otherGlobal.map((rule, i) => formatRule(rule, i + 1)).join("\n"),
      ].join("\n")
    );
    for (const rule of otherGlobal) {
      citations.push({ kind: "rule", id: rule.id, label: `Règle MyBasket — ${rule.name}` });
    }
  }

  if (clubRules.length > 0) {
    sections.push(
      [
        "═══ RÈGLES DU CLUB ═══",
        "À appliquer sauf si elles contredisent une règle critique MyBasket.",
        clubRules.map((rule, i) => formatRule(rule, i + 1)).join("\n"),
      ].join("\n")
    );
    for (const rule of clubRules) {
      citations.push({ kind: "rule", id: rule.id, label: `Règle club — ${rule.name}` });
    }
  }

  if (userRules.length > 0) {
    sections.push(
      [
        "═══ PRÉFÉRENCES DE L'ENTRAÎNEUR ═══",
        "À respecter sauf conflit avec une règle critique MyBasket ou une règle de club.",
        userRules.map((rule, i) => formatRule(rule, i + 1)).join("\n"),
      ].join("\n")
    );
  }

  /* --- Lexique ------------------------------------------------------ */
  if (terms.length > 0) {
    sections.push(
      [
        "═══ LEXIQUE MYBASKET ═══",
        "Définitions officielles à utiliser telles quelles. Elles priment sur ta propre compréhension du terme.",
        terms.map(formatTerm).join("\n"),
      ].join("\n")
    );
    for (const term of terms) {
      citations.push({
        kind: "term",
        id: term.id,
        label: `Lexique MyBasket — ${term.term}`,
        score: term.similarity,
      });
    }
  }

  /* --- Corrections apprises ---------------------------------------- */
  if (corrections.length > 0) {
    sections.push(
      [
        "═══ CORRECTIONS DÉJÀ APPRISES ═══",
        "Dans des situations similaires, MyBasket a corrigé l'IA. Reproduis la formulation validée.",
        corrections.map(formatCorrection).join("\n\n"),
      ].join("\n")
    );
    for (const correction of corrections) {
      citations.push({
        kind: "correction",
        id: correction.id,
        label: "Correction MyBasket",
        detail: correction.correction_type,
        score: correction.similarity,
      });
    }
  }

  /* --- Contenus de référence --------------------------------------- */
  if (references.length > 0) {
    const formatted = references.map(formatReference).filter(Boolean);
    if (formatted.length > 0) {
      sections.push(
        [
          "═══ EXEMPLES DE RÉFÉRENCE MYBASKET ═══",
          "Imite la structure, le niveau de détail et le style rédactionnel de ces contenus validés.",
          formatted.join("\n\n"),
        ].join("\n")
      );
      for (const ref of references) {
        citations.push({
          kind: "reference",
          id: ref.id,
          label: `${ref.content_type === "exercise" ? "Exercice" : "Système"} de référence — ${ref.title}`,
        });
      }
    }
  }

  /* --- 5 : documents ------------------------------------------------ */
  if (documents.chunks.length > 0) {
    const excerpts: string[] = [];
    let budget = AI_CONTEXT_CHAR_BUDGET;

    documents.chunks.forEach((chunk, i) => {
      if (budget <= 0) return;
      const provenance = formatChunkProvenance(chunk);
      const excerpt = wrapKnowledgeExcerpt({
        index: i + 1,
        provenance,
        locator: chunk.heading,
        content: chunk.content.slice(0, Math.max(400, budget)),
      });
      budget -= excerpt.length;
      excerpts.push(excerpt);

      citations.push({
        kind: "document",
        id: chunk.source_id,
        label: provenance,
        detail: `extrait ${i + 1}`,
        score: chunk.similarity,
      });
    });

    sections.push(
      [
        "═══ EXTRAITS DES DOCUMENTS MYBASKET ═══",
        `Stratégie de recherche : ${documents.strategy === "semantic" ? "sémantique" : "lexicale"}.`,
        excerpts.join("\n\n"),
      ].join("\n")
    );
  } else if (includeDocuments) {
    notes.push("Aucun extrait documentaire pertinent trouvé pour cette requête.");
  }

  /* --- Sécurité + citations ---------------------------------------- */
  sections.push(KNOWLEDGE_SAFETY_NOTICE);

  sections.push(
    [
      "PROVENANCE :",
      "Quand tu utilises une connaissance MyBasket, cite-la en fin de réponse sous la forme :",
      "Sources : Lexique MyBasket — Short Roll ; Cahier d'exercices — page 12 ; Règle MyBasket — Désignation des joueurs.",
      "N'invente jamais de source. Si ta réponse repose sur tes connaissances générales, écris : « Hors base de connaissances MyBasket ».",
    ].join("\n")
  );

  return {
    systemPrompt: sections.join("\n\n"),
    rules,
    terms,
    chunks: documents.chunks,
    corrections,
    references,
    citations,
    degraded,
    notes,
  };
}
