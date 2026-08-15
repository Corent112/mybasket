"use client";

import { useCallback, useEffect, useState } from "react";
import { AI_CORRECTION_TYPES, AI_MODULES } from "@/lib/ai/config";
import type { AiCorrection } from "@/lib/ai/knowledge/types";
import { API, api } from "../api";
import styles from "../page.module.css";
import {
  ConfirmDialog,
  type ConfirmState,
  EmptyState,
  Field,
  Modal,
  Notice,
  formatDate,
} from "../ui";

type Props = {
  notify: (message: string, tone?: "info" | "success" | "error") => void;
  onChanged: () => void;
};

const STATUS_CLASS: Record<string, string> = {
  active: styles.badgeSuccess,
  pending: styles.badgeWarn,
  rejected: styles.badgeDanger,
  archived: styles.badge,
};

const MODULE_LABEL = Object.fromEntries(AI_MODULES.map((m) => [m.key, m.label]));

export default function CorrectionsTab({ notify, onChanged }: Props) {
  const [corrections, setCorrections] = useState<AiCorrection[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [moduleFilter, setModuleFilter] = useState("");
  const [status, setStatus] = useState("");
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ perPage: "100" });
      if (search) params.set("q", search);
      if (moduleFilter) params.set("module", moduleFilter);
      if (status) params.set("status", status);

      const data = await api.get<{ corrections: AiCorrection[] }>(
        `${API.corrections}?${params}`
      );
      setCorrections(data.corrections);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Chargement impossible.", "error");
    } finally {
      setLoading(false);
    }
  }, [search, moduleFilter, status, notify]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const setStatusOf = async (correction: AiCorrection, next: string) => {
    try {
      await api.patch(`${API.corrections}/${correction.id}`, { status: next });
      await load();
      onChanged();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Modification impossible.", "error");
    }
  };

  const askDelete = (correction: AiCorrection) => {
    setConfirm({
      title: "Supprimer cette correction ?",
      message:
        "L'IA perdra la mémoire de cette correction et pourra reproduire l'erreur. Cette action est irréversible.",
      onConfirm: async () => {
        try {
          await api.delete(`${API.corrections}/${correction.id}`);
          notify("Correction supprimée.", "success");
          await load();
          onChanged();
        } catch (error) {
          notify(error instanceof Error ? error.message : "Suppression impossible.", "error");
        }
      },
    });
  };

  return (
    <div>
      <Notice tone="info">
        <span>🧠</span>
        <span>
          Pas de fine-tuning : chaque correction est vectorisée et retrouvée par similarité
          quand une situation comparable se présente. Elle est alors injectée dans le prompt
          comme formulation validée.
        </span>
      </Notice>

      <div className={styles.filters}>
        <input
          className={styles.search}
          placeholder="Rechercher dans les corrections…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.select}
          value={moduleFilter}
          onChange={(e) => setModuleFilter(e.target.value)}
        >
          <option value="">Tous les modules</option>
          {AI_MODULES.map((m) => (
            <option key={m.key} value={m.key}>
              {m.label}
            </option>
          ))}
        </select>
        <select
          className={styles.select}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Tous les statuts</option>
          <option value="active">Active</option>
          <option value="pending">En attente</option>
          <option value="rejected">Rejetée</option>
          <option value="archived">Archivée</option>
        </select>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => setCreating(true)}
        >
          + Enregistrer une correction
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Chargement des corrections…</div>
      ) : corrections.length === 0 ? (
        <EmptyState
          title="Aucune correction"
          message="Quand une IA MyBasket se trompe, enregistre ici la formulation correcte : elle sera réutilisée dans les situations similaires."
        />
      ) : (
        <div className={styles.cardGrid}>
          {corrections.map((correction) => (
            <article key={correction.id} className={styles.card}>
              <div className={styles.cardHead}>
                <h3 className={styles.cardTitle}>
                  {MODULE_LABEL[correction.module] || correction.module}
                </h3>
                <span className={`${styles.badge} ${STATUS_CLASS[correction.status] || ""}`}>
                  {correction.status}
                </span>
              </div>

              <p className={styles.cardBody} style={{ fontSize: 12, color: "#7f7478" }}>
                {correction.context}
              </p>

              <p className={styles.exampleBad}>❌ {correction.ai_output}</p>
              <p className={styles.exampleGood}>✅ {correction.user_correction}</p>

              {correction.explanation ? (
                <p className={styles.cardBody} style={{ marginTop: 8, fontSize: 12 }}>
                  {correction.explanation}
                </p>
              ) : null}

              <div className={styles.cardMeta}>
                <span className={styles.badge}>{correction.correction_type}</span>
                <span className={styles.badge}>{correction.scope}</span>
                <span className={styles.badge}>{formatDate(correction.created_at)}</span>
              </div>

              <div className={styles.cardActions}>
                {correction.status !== "active" ? (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSm}`}
                    onClick={() => setStatusOf(correction, "active")}
                  >
                    Activer
                  </button>
                ) : (
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSm}`}
                    onClick={() => setStatusOf(correction, "archived")}
                  >
                    Archiver
                  </button>
                )}
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                  onClick={() => askDelete(correction)}
                >
                  Supprimer
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {creating ? (
        <CorrectionModal
          notify={notify}
          onClose={() => setCreating(false)}
          onDone={async () => {
            setCreating(false);
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

function CorrectionModal({
  notify,
  onClose,
  onDone,
}: {
  notify: Props["notify"];
  onClose: () => void;
  onDone: () => void;
}) {
  const [context, setContext] = useState("");
  const [aiOutput, setAiOutput] = useState("");
  const [userCorrection, setUserCorrection] = useState("");
  const [explanation, setExplanation] = useState("");
  const [correctionType, setCorrectionType] = useState("terminology");
  const [moduleKey, setModuleKey] = useState("coach-chat");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!context.trim() || !aiOutput.trim() || !userCorrection.trim()) {
      notify("Contexte, proposition IA et correction sont obligatoires.", "error");
      return;
    }

    setBusy(true);
    try {
      await api.post(API.corrections, {
        context,
        aiOutput,
        userCorrection,
        explanation,
        correctionType,
        module: moduleKey,
        scope: "global",
      });
      notify("Correction enregistrée dans la mémoire de l'IA.", "success");
      onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Enregistrement impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Enregistrer une correction"
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
            disabled={busy}
          >
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </>
      }
    >
      <Field
        label="Contexte"
        hint="Ce qui était demandé à l'IA. Sert à retrouver la correction dans une situation similaire."
      >
        <textarea
          className={styles.textarea}
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="Description du déroulement d'un pick and roll face à un blitz."
        />
      </Field>

      <Field label="Ce que l'IA a produit">
        <textarea
          className={styles.textarea}
          value={aiOutput}
          onChange={(e) => setAiOutput(e.target.value)}
          placeholder="Le joueur 5 réalise un roll."
        />
      </Field>

      <Field label="La formulation correcte">
        <textarea
          className={styles.textarea}
          value={userCorrection}
          onChange={(e) => setUserCorrection(e.target.value)}
          placeholder="Le joueur 5 réalise un short roll."
        />
      </Field>

      <Field label="Explication (optionnel)">
        <textarea
          className={styles.textarea}
          value={explanation}
          onChange={(e) => setExplanation(e.target.value)}
          placeholder="Face à un blitz, le poseur d'écran ne plonge pas jusqu'au panier."
        />
      </Field>

      <div className={styles.fieldRow}>
        <Field label="Type de correction">
          <select
            className={styles.select}
            value={correctionType}
            onChange={(e) => setCorrectionType(e.target.value)}
          >
            {AI_CORRECTION_TYPES.map((t) => (
              <option key={t.key} value={t.key}>
                {t.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Module d'origine">
          <select
            className={styles.select}
            value={moduleKey}
            onChange={(e) => setModuleKey(e.target.value)}
          >
            {AI_MODULES.map((m) => (
              <option key={m.key} value={m.key}>
                {m.label}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
