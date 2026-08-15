"use client";

import { useCallback, useEffect, useState } from "react";
import type { AiReferenceWithContent } from "@/lib/ai/knowledge/types";
import { API, api } from "../api";
import styles from "../page.module.css";
import { ConfirmDialog, type ConfirmState, EmptyState, Field, Modal, Notice } from "../ui";

type Props = {
  notify: (message: string, tone?: "info" | "success" | "error") => void;
  onChanged: () => void;
};

type Candidate = {
  id: string;
  title: string | null;
  categorie?: string | null;
  niveau?: string | null;
  famille?: string | null;
  review_status?: string | null;
};

const FOCUS_OPTIONS = [
  "structure",
  "rédaction",
  "niveau de détail",
  "variantes",
  "évolutions",
  "contrats",
  "organisation",
  "schémas",
  "positions de départ",
  "phases",
  "déclencheurs",
  "écrans",
  "coupes",
  "options",
  "continuités",
  "lectures",
];

export default function ReferencesTab({ notify, onChanged }: Props) {
  const [exercises, setExercises] = useState<AiReferenceWithContent[]>([]);
  const [systems, setSystems] = useState<AiReferenceWithContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [picker, setPicker] = useState<"exercise" | "system" | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get<{
        exercises: AiReferenceWithContent[];
        systems: AiReferenceWithContent[];
      }>(`${API.references}?limit=100`);
      setExercises(data.exercises);
      setSystems(data.systems);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Chargement impossible.", "error");
    } finally {
      setLoading(false);
    }
  }, [notify]);

  useEffect(() => {
    // Chargement initial depuis le serveur (système externe).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const askDelete = (ref: AiReferenceWithContent) => {
    setConfirm({
      title: "Retirer cette référence ?",
      message: `« ${ref.title || "Contenu"} » ne servira plus de modèle à l'IA. Le contenu d'origine n'est pas supprimé de la bibliothèque MyBasket.`,
      confirmLabel: "Retirer la référence",
      onConfirm: async () => {
        try {
          await api.delete(`${API.references}/${ref.id}`);
          notify("Référence retirée.", "success");
          await load();
          onChanged();
        } catch (error) {
          notify(error instanceof Error ? error.message : "Suppression impossible.", "error");
        }
      },
    });
  };

  const renderList = (
    items: AiReferenceWithContent[],
    label: string,
    type: "exercise" | "system"
  ) => (
    <section style={{ marginBottom: 22 }}>
      <div className={styles.filters}>
        <strong style={{ fontSize: 14, color: "#3d0b18" }}>
          {label} ({items.length})
        </strong>
        <div className={styles.spacer} />
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => setPicker(type)}
        >
          + Marquer un {type === "exercise" ? "exercice" : "système"} comme référence
        </button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          title={`Aucun ${type === "exercise" ? "exercice" : "système"} de référence`}
          message={`Sélectionne tes meilleurs ${type === "exercise" ? "exercices" : "systèmes"} existants : l'IA s'en servira comme modèle de structure et de rédaction.`}
        />
      ) : (
        <div className={styles.cardGrid}>
          {items.map((ref) => (
            <article
              key={ref.id}
              className={styles.card}
              style={{ opacity: ref.is_active ? 1 : 0.55 }}
            >
              <div className={styles.cardHead}>
                <h3 className={styles.cardTitle}>{ref.title || "Contenu introuvable"}</h3>
                <span className={`${styles.badge} ${styles.badgeGold}`}>
                  {ref.quality_score}/10
                </span>
              </div>

              {ref.missing ? (
                <p className={styles.exampleBad}>
                  Ce contenu n’existe plus dans la bibliothèque. Retire la référence.
                </p>
              ) : (
                <p className={styles.cardBody}>
                  {ref.reason || (ref.summary || "").slice(0, 220)}
                </p>
              )}

              <div className={styles.cardMeta}>
                {ref.learning_focus.map((focus) => (
                  <span key={focus} className={styles.badge}>
                    {focus}
                  </span>
                ))}
                {!ref.is_active ? (
                  <span className={`${styles.badge} ${styles.badgeWarn}`}>Inactive</span>
                ) : null}
              </div>

              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSm}`}
                  onClick={async () => {
                    try {
                      await api.patch(`${API.references}/${ref.id}`, {
                        isActive: !ref.is_active,
                      });
                      await load();
                      onChanged();
                    } catch (error) {
                      notify(
                        error instanceof Error ? error.message : "Modification impossible.",
                        "error"
                      );
                    }
                  }}
                >
                  {ref.is_active ? "Désactiver" : "Activer"}
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                  onClick={() => askDelete(ref)}
                >
                  Retirer
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );

  return (
    <div>
      <Notice tone="info">
        <span>⭐</span>
        <span>
          Aucune duplication : une référence est une simple relation vers un exercice ou un
          système déjà présent dans la bibliothèque MyBasket. Modifier le contenu d’origine
          met automatiquement à jour ce que l’IA apprend.
        </span>
      </Notice>

      {loading ? (
        <div className={styles.loading}>Chargement des références…</div>
      ) : (
        <>
          {renderList(exercises, "Exercices de référence", "exercise")}
          {renderList(systems, "Systèmes de référence", "system")}
        </>
      )}

      {picker ? (
        <PickerModal
          type={picker}
          notify={notify}
          onClose={() => setPicker(null)}
          onDone={async () => {
            setPicker(null);
            await load();
            onChanged();
          }}
        />
      ) : null}

      <ConfirmDialog state={confirm} onClose={() => setConfirm(null)} />
    </div>
  );
}

/* --------------------------------------------------------------------- */

function PickerModal({
  type,
  notify,
  onClose,
  onDone,
}: {
  type: "exercise" | "system";
  notify: Props["notify"];
  onClose: () => void;
  onDone: () => void;
}) {
  const [search, setSearch] = useState("");
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [already, setAlready] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [reason, setReason] = useState("");
  const [score, setScore] = useState("8");
  const [focus, setFocus] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // Indicateur de chargement pour une requête réseau déclenchée par l'effet.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);

    const timer = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ type, limit: "30" });
        if (search) params.set("q", search);

        const data = await api.get<{ candidates: Candidate[]; alreadyReferenced: string[] }>(
          `${API.referenceCandidates}?${params}`
        );
        if (!alive) return;
        setCandidates(data.candidates);
        setAlready(data.alreadyReferenced);
      } catch (error) {
        if (alive) {
          notify(error instanceof Error ? error.message : "Recherche impossible.", "error");
        }
      } finally {
        if (alive) setLoading(false);
      }
    }, search ? 300 : 0);

    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [search, type, notify]);

  const submit = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await api.post(API.references, {
        contentType: type,
        contentId: selected.id,
        reason,
        qualityScore: Number(score) || 8,
        learningFocus: focus,
      });
      notify("Référence ajoutée.", "success");
      onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Ajout impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={`Marquer un ${type === "exercise" ? "exercice" : "système"} comme référence IA`}
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button type="button" className={styles.btn} onClick={onClose} disabled={busy}>
            Annuler
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={submit}
            disabled={busy || !selected}
          >
            {busy ? "Ajout…" : "Ajouter la référence"}
          </button>
        </>
      }
    >
      <Field label="Rechercher dans la bibliothèque">
        <input
          className={styles.input}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Titre du contenu…"
        />
      </Field>

      {loading ? (
        <div className={styles.loading}>Recherche…</div>
      ) : candidates.length === 0 ? (
        <EmptyState title="Aucun résultat" message="Affine ta recherche." />
      ) : (
        <div className={styles.chips} style={{ marginBottom: 18 }}>
          {candidates.map((candidate) => {
            const disabled = already.includes(candidate.id);
            return (
              <button
                key={candidate.id}
                type="button"
                disabled={disabled}
                className={`${styles.chip} ${selected?.id === candidate.id ? styles.chipActive : ""}`}
                style={disabled ? { opacity: 0.4, cursor: "not-allowed" } : undefined}
                onClick={() => setSelected(candidate)}
              >
                {candidate.title || "Sans titre"}
                {disabled ? " ✓" : ""}
              </button>
            );
          })}
        </div>
      )}

      {selected ? (
        <>
          <Field
            label="Pourquoi ce contenu est-il une référence ?"
            hint="Cette explication est transmise à l'IA."
          >
            <textarea
              className={styles.textarea}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Structure exemplaire, consignes précises, variantes bien graduées."
            />
          </Field>

          <Field label="Ce que l'IA doit apprendre de ce contenu">
            <div className={styles.chips}>
              {FOCUS_OPTIONS.map((option) => (
                <button
                  key={option}
                  type="button"
                  className={`${styles.chip} ${focus.includes(option) ? styles.chipActive : ""}`}
                  onClick={() =>
                    setFocus((prev) =>
                      prev.includes(option)
                        ? prev.filter((f) => f !== option)
                        : [...prev, option]
                    )
                  }
                >
                  {option}
                </button>
              ))}
            </div>
          </Field>

          <Field label="Note de qualité (1 à 10)">
            <input
              className={styles.input}
              type="number"
              min={1}
              max={10}
              value={score}
              onChange={(e) => setScore(e.target.value)}
            />
          </Field>
        </>
      ) : null}
    </Modal>
  );
}
