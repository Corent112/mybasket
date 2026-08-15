"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import type { AiKnowledgeCategory, KnowledgeOverview } from "@/lib/ai/knowledge/types";
import { API, api } from "./api";
import styles from "./page.module.css";
import { Toast, useToast } from "./ui";
import OverviewTab from "./tabs/OverviewTab";
import DocumentsTab from "./tabs/DocumentsTab";
import TermsTab from "./tabs/TermsTab";
import RulesTab from "./tabs/RulesTab";
import ReferencesTab from "./tabs/ReferencesTab";
import CorrectionsTab from "./tabs/CorrectionsTab";
import CoachChatTab from "./tabs/CoachChatTab";

type TabKey =
  | "overview"
  | "documents"
  | "lexique"
  | "regles"
  | "references"
  | "corrections"
  | "coach";

const TABS: Array<{ key: TabKey; label: string; icon: string }> = [
  { key: "overview", label: "Vue d'ensemble", icon: "📊" },
  { key: "documents", label: "Documents", icon: "📄" },
  { key: "lexique", label: "Lexique", icon: "📘" },
  { key: "regles", label: "Règles", icon: "🧭" },
  { key: "references", label: "Références", icon: "⭐" },
  { key: "corrections", label: "Corrections", icon: "✏️" },
  { key: "coach", label: "Coach IA", icon: "🧠" },
];

export default function KnowledgeClient({
  initialOverview,
  initialCategories,
  adminName,
}: {
  initialOverview: KnowledgeOverview;
  initialCategories: AiKnowledgeCategory[];
  adminName: string;
}) {
  const [tab, setTab] = useState<TabKey>("overview");
  const [overview, setOverview] = useState(initialOverview);
  const [categories] = useState(initialCategories);
  const { toast, notify } = useToast();

  const refreshOverview = useCallback(async () => {
    try {
      const data = await api.get<{ overview: KnowledgeOverview }>(API.overview);
      setOverview(data.overview);
    } catch {
      // On garde l'état précédent : un échec de rafraîchissement ne doit pas
      // vider le tableau de bord sous les yeux de l'utilisateur.
    }
  }, []);

  // L'onglet actif est reflété dans l'URL pour pouvoir partager un lien direct.
  useEffect(() => {
    const hash = window.location.hash.replace("#", "");
    // Synchronisation avec une source externe (l'URL) au montage : ce cas est
    // précisément l'exception prévue par la règle react-hooks/set-state-in-effect.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (TABS.some((t) => t.key === hash)) setTab(hash as TabKey);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.history.replaceState(null, "", `#${tab}`);
  }, [tab]);

  const counts: Record<TabKey, number | null> = {
    overview: null,
    documents: overview.documents,
    lexique: overview.terms,
    regles: overview.rules,
    references: overview.referenceExercises + overview.referenceSystems,
    corrections: overview.corrections,
    coach: null,
  };

  const engineState =
    !overview.openAiConfigured
      ? { label: "Mode dégradé — clé OpenAI absente", dot: styles.dotError }
      : overview.indexation.status === "error"
        ? { label: "Erreurs d'indexation", dot: styles.dotWarn }
        : overview.indexation.status === "running"
          ? { label: "Indexation en cours", dot: styles.dotWarn }
          : { label: "Cerveau IA opérationnel", dot: styles.dot };

  const stats: Array<[string, string | number, string, string]> = [
    ["📄", overview.documents, "Documents", `${overview.chunks} passages indexés`],
    ["📘", overview.terms, "Termes du lexique", "consultables par toutes les IA"],
    ["🧭", overview.rules, "Règles métier", `dont ${overview.rulesCritical} critiques`],
    ["✏️", overview.corrections, "Corrections apprises", "mémoire contextuelle"],
    ["🏀", overview.referenceExercises, "Exercices de référence", "modèles de rédaction"],
    ["📋", overview.referenceSystems, "Systèmes de référence", "modèles de structure"],
    [
      "🔗",
      `${overview.documentsIndexed}/${overview.documents}`,
      "Indexation",
      overview.indexation.failed > 0 ? `${overview.indexation.failed} en échec` : "à jour",
    ],
    ["💬", overview.conversations, "Conversations Coach IA", "historique"],
  ];

  return (
    <main className={styles.page}>
      <div className={styles.container}>
        <Link href="/admin" className={styles.backLink}>
          ← Retour Dashboard CEO
        </Link>

        <header className={styles.header}>
          <div>
            <h1>🧠 Connaissances IA</h1>
            <p>
              Construisez et contrôlez le cerveau basket de MyBasket. Tout ce que vous
              ajoutez ici alimente Coach IA, la création d’exercices et de systèmes,
              l’analyse de photos et de vidéos, LiveStatsPro IA et la recherche
              intelligente — sans toucher une ligne de code.
            </p>
          </div>

          <div className={styles.headerAside}>
            <span className={styles.engineBadge}>
              <span className={engineState.dot} />
              {engineState.label}
            </span>
            <span className={styles.engineBadge}>👑 {adminName}</span>
          </div>
        </header>

        <section className={styles.stats}>
          {stats.map(([icon, value, label, hint]) => (
            <div key={label} className={styles.stat}>
              <div className={styles.statIcon}>{icon}</div>
              <div>
                <strong>{value}</strong>
                <span>{label}</span>
                <small>{hint}</small>
              </div>
            </div>
          ))}
        </section>

        <section className={styles.workspace}>
          <div className={styles.toolbar}>
            <nav className={styles.tabs} aria-label="Sections des connaissances IA">
              {TABS.map((item) => (
                <button
                  key={item.key}
                  type="button"
                  className={`${styles.tab} ${tab === item.key ? styles.activeTab : ""}`}
                  onClick={() => setTab(item.key)}
                >
                  <span>{item.icon}</span>
                  {item.label}
                  {counts[item.key] !== null ? (
                    <span className={styles.tabCount}>{counts[item.key]}</span>
                  ) : null}
                </button>
              ))}
            </nav>
          </div>

          <div className={styles.panel}>
            {tab === "overview" ? (
              <OverviewTab overview={overview} onGoTo={(next) => setTab(next as TabKey)} />
            ) : null}

            {tab === "documents" ? (
              <DocumentsTab
                categories={categories}
                notify={notify}
                onChanged={refreshOverview}
              />
            ) : null}

            {tab === "lexique" ? (
              <TermsTab categories={categories} notify={notify} onChanged={refreshOverview} />
            ) : null}

            {tab === "regles" ? (
              <RulesTab categories={categories} notify={notify} onChanged={refreshOverview} />
            ) : null}

            {tab === "references" ? (
              <ReferencesTab notify={notify} onChanged={refreshOverview} />
            ) : null}

            {tab === "corrections" ? (
              <CorrectionsTab notify={notify} onChanged={refreshOverview} />
            ) : null}

            {tab === "coach" ? (
              <CoachChatTab notify={notify} openAiConfigured={overview.openAiConfigured} />
            ) : null}
          </div>
        </section>
      </div>

      <Toast toast={toast} />
    </main>
  );
}
