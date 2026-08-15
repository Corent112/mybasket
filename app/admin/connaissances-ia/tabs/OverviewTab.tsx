"use client";

import type { KnowledgeOverview } from "@/lib/ai/knowledge/types";
import styles from "../page.module.css";
import { EmptyState, Notice, formatDateTime } from "../ui";

const KIND_ICON: Record<string, string> = {
  document: "📄",
  term: "📘",
  rule: "🧭",
  correction: "✏️",
  reference: "⭐",
};

const KIND_LABEL: Record<string, string> = {
  document: "Document",
  term: "Terme du lexique",
  rule: "Règle IA",
  correction: "Correction",
  reference: "Référence",
};

const INDEX_LABEL: Record<KnowledgeOverview["indexation"]["status"], string> = {
  idle: "À jour",
  running: "Indexation en cours",
  partial: "Indexation partielle",
  error: "Erreurs d'indexation",
};

export default function OverviewTab({
  overview,
  onGoTo,
}: {
  overview: KnowledgeOverview;
  onGoTo: (tab: string) => void;
}) {
  const indexedRatio =
    overview.documents > 0
      ? Math.round((overview.documentsIndexed / overview.documents) * 100)
      : 0;

  return (
    <div>
      {!overview.openAiConfigured ? (
        <Notice tone="error">
          <span>⚠️</span>
          <span>
            <strong>OPENAI_API_KEY absente.</strong> Le cerveau IA fonctionne en mode
            dégradé : les documents sont stockés et consultables en recherche lexicale,
            mais la recherche sémantique et Coach IA sont désactivés. Ajoute la clé dans{" "}
            <code>.env.local</code> puis relance une réindexation.
          </span>
        </Notice>
      ) : null}

      {overview.documentsFailed > 0 ? (
        <Notice tone="warn">
          <span>🔁</span>
          <span>
            {overview.documentsFailed} document(s) n’ont pas pu être indexés. Ouvre
            l’onglet Documents pour consulter l’erreur et relancer l’indexation.
          </span>
        </Notice>
      ) : null}

      <div className={styles.overviewGrid}>
        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h3 className={styles.cardTitle}>État de l’indexation</h3>
            <span
              className={`${styles.badge} ${
                overview.indexation.status === "idle"
                  ? styles.badgeSuccess
                  : overview.indexation.status === "error"
                    ? styles.badgeDanger
                    : styles.badgeWarn
              }`}
            >
              {INDEX_LABEL[overview.indexation.status]}
            </span>
          </div>

          <p className={styles.cardBody}>
            {overview.documentsIndexed} document(s) indexés sur {overview.documents} —{" "}
            {overview.chunks.toLocaleString("fr-FR")} passage(s) interrogeables par l’IA.
          </p>

          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${indexedRatio}%` }} />
          </div>

          <div className={styles.cardMeta}>
            <span className={styles.badge}>En attente : {overview.indexation.pending}</span>
            <span className={styles.badge}>En cours : {overview.indexation.running}</span>
            <span className={styles.badge}>Échecs : {overview.indexation.failed}</span>
            <span className={styles.badge}>
              Dernière indexation : {formatDateTime(overview.indexation.lastIndexedAt)}
            </span>
          </div>

          <div className={styles.cardActions}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSm}`}
              onClick={() => onGoTo("documents")}
            >
              Gérer les documents
            </button>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSm}`}
              onClick={() => onGoTo("coach")}
            >
              Tester Coach IA
            </button>
          </div>
        </section>

        <section className={styles.card}>
          <div className={styles.cardHead}>
            <h3 className={styles.cardTitle}>Dernières connaissances ajoutées</h3>
          </div>

          {overview.recent.length === 0 ? (
            <EmptyState
              title="Le cerveau est vide"
              message="Importe un premier document ou ajoute un terme au lexique pour démarrer."
            />
          ) : (
            <div className={styles.timeline}>
              {overview.recent.map((item) => (
                <div key={`${item.kind}-${item.id}`} className={styles.timelineItem}>
                  <div className={styles.timelineIcon}>{KIND_ICON[item.kind] || "•"}</div>
                  <div className={styles.timelineText}>
                    <strong>{item.label}</strong>
                    <small>
                      {KIND_LABEL[item.kind] || item.kind}
                      {item.detail ? ` · ${item.detail}` : ""}
                    </small>
                  </div>
                  <span className={styles.timelineDate}>{formatDateTime(item.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <section className={styles.card} style={{ marginTop: 16 }}>
        <div className={styles.cardHead}>
          <h3 className={styles.cardTitle}>Comment ce cerveau est utilisé</h3>
        </div>
        <p className={styles.cardBody}>
          Chaque fonctionnalité IA de MyBasket appelle le même moteur
          (<code>buildAIContext</code>) et reçoit, dans cet ordre de priorité :
          {"\n"}1. les {overview.rulesCritical} règle(s) critiques MyBasket — jamais
          écrasables ;{"\n"}2. les règles globales MyBasket ;{"\n"}3. les règles du club ;
          {"\n"}4. les préférences de l’entraîneur ;{"\n"}5. les passages pertinents des
          documents indexés ;{"\n"}6. les connaissances générales du modèle.
          {"\n\n"}Le lexique, les corrections apprises et les contenus de référence sont
          injectés au même titre, avec leur provenance, pour que chaque affirmation soit
          traçable.
        </p>
      </section>
    </div>
  );
}
