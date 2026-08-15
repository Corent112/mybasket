"use client";

import { useCallback, useEffect, useState } from "react";
import type { AiKnowledgeCategory, AiTerm } from "@/lib/ai/knowledge/types";
import { AI_RULE_PRIORITIES } from "@/lib/ai/config";
import { API, api } from "../api";
import styles from "../page.module.css";
import {
  ConfirmDialog,
  type ConfirmState,
  EmptyState,
  Field,
  Modal,
  Notice,
} from "../ui";

type Props = {
  categories: AiKnowledgeCategory[];
  notify: (message: string, tone?: "info" | "success" | "error") => void;
  onChanged: () => void;
};

type FormState = {
  term: string;
  definition: string;
  category: string;
  synonyms: string;
  translations: string;
  examples: string;
  notes: string;
  source: string;
  schemaUrl: string;
  priority: string;
  isActive: boolean;
};

const EMPTY_FORM: FormState = {
  term: "",
  definition: "",
  category: "tactique-offensive",
  synonyms: "",
  translations: "",
  examples: "",
  notes: "",
  source: "",
  schemaUrl: "",
  priority: "normal",
  isActive: true,
};

export default function TermsTab({ categories, notify, onChanged }: Props) {
  const [terms, setTerms] = useState<AiTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [editing, setEditing] = useState<AiTerm | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ perPage: "200" });
      if (search) params.set("q", search);
      if (category) params.set("category", category);

      const data = await api.get<{ terms: AiTerm[] }>(`${API.terms}?${params}`);
      setTerms(data.terms);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Chargement impossible.", "error");
    } finally {
      setLoading(false);
    }
  }, [search, category, notify]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const askDelete = (term: AiTerm) => {
    setConfirm({
      title: "Supprimer ce terme ?",
      message: `« ${term.term} » sera retiré du lexique MyBasket. Les IA ne pourront plus s'appuyer sur cette définition. Cette action est irréversible.`,
      onConfirm: async () => {
        try {
          await api.delete(`${API.terms}/${term.id}`);
          notify("Terme supprimé.", "success");
          await load();
          onChanged();
        } catch (error) {
          notify(error instanceof Error ? error.message : "Suppression impossible.", "error");
        }
      },
    });
  };

  const toggle = async (term: AiTerm) => {
    try {
      await api.patch(`${API.terms}/${term.id}`, { isActive: !term.is_active });
      await load();
      onChanged();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Modification impossible.", "error");
    }
  };

  return (
    <div>
      <Notice tone="info">
        <span>🔎</span>
        <span>
          Le lexique est réellement interrogé par les IA : chaque terme est vectorisé et
          récupéré automatiquement quand une question s’en approche, en plus de la
          correspondance exacte sur le terme et ses synonymes.
        </span>
      </Notice>

      <div className={styles.filters}>
        <input
          className={styles.search}
          placeholder="Rechercher un terme ou une définition…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.select}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">Toutes les catégories</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.icon} {c.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => setCreating(true)}
        >
          + Ajouter un terme
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Chargement du lexique…</div>
      ) : terms.length === 0 ? (
        <EmptyState
          title="Lexique vide"
          message="Ajoute les termes que l'IA doit comprendre exactement comme toi : Short Roll, Ghost Screen, Iverson Cut…"
        />
      ) : (
        <div className={styles.cardGrid}>
          {terms.map((term) => {
            const cat = categories.find((c) => c.slug === term.category_slug);
            return (
              <article
                key={term.id}
                className={styles.card}
                style={{ opacity: term.is_active ? 1 : 0.55 }}
              >
                <div className={styles.cardHead}>
                  <h3 className={styles.cardTitle}>{term.term}</h3>
                  {term.priority !== "normal" ? (
                    <span
                      className={`${styles.badge} ${
                        term.priority === "critical" ? styles.badgeCritical : styles.badgeGold
                      }`}
                    >
                      {term.priority}
                    </span>
                  ) : null}
                </div>

                <p className={styles.cardBody}>{term.definition}</p>

                {term.examples.length > 0 ? (
                  <p className={styles.exampleGood}>« {term.examples[0]} »</p>
                ) : null}

                <div className={styles.cardMeta}>
                  {cat ? (
                    <span className={styles.badge}>
                      {cat.icon} {cat.label}
                    </span>
                  ) : null}
                  {term.synonyms.length > 0 ? (
                    <span className={styles.badge}>
                      {term.synonyms.length} synonyme{term.synonyms.length > 1 ? "s" : ""}
                    </span>
                  ) : null}
                  {!term.is_active ? (
                    <span className={`${styles.badge} ${styles.badgeWarn}`}>Inactif</span>
                  ) : null}
                </div>

                <div className={styles.cardActions}>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSm}`}
                    onClick={() => setEditing(term)}
                  >
                    Modifier
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSm}`}
                    onClick={() => toggle(term)}
                  >
                    {term.is_active ? "Désactiver" : "Activer"}
                  </button>
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                    onClick={() => askDelete(term)}
                  >
                    Supprimer
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {creating || editing ? (
        <TermModal
          term={editing}
          categories={categories}
          notify={notify}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onDone={async () => {
            setCreating(false);
            setEditing(null);
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

function TermModal({
  term,
  categories,
  notify,
  onClose,
  onDone,
}: {
  term: AiTerm | null;
  categories: AiKnowledgeCategory[];
  notify: Props["notify"];
  onClose: () => void;
  onDone: () => void;
}) {
  const [form, setForm] = useState<FormState>(
    term
      ? {
          term: term.term,
          definition: term.definition,
          category: term.category_slug || "",
          synonyms: term.synonyms.join(", "),
          translations: term.translations.join(", "),
          examples: term.examples.join("\n"),
          notes: term.notes || "",
          source: term.source || "",
          schemaUrl: term.schema_url || "",
          priority: term.priority,
          isActive: term.is_active,
        }
      : EMPTY_FORM
  );
  const [busy, setBusy] = useState(false);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const submit = async () => {
    if (!form.term.trim() || !form.definition.trim()) {
      notify("Le terme et la définition sont obligatoires.", "error");
      return;
    }

    setBusy(true);
    const payload = {
      term: form.term,
      definition: form.definition,
      category: form.category || null,
      synonyms: form.synonyms,
      translations: form.translations,
      examples: form.examples.split("\n").filter((v) => v.trim()),
      notes: form.notes || null,
      source: form.source || null,
      schemaUrl: form.schemaUrl || null,
      priority: form.priority,
      isActive: form.isActive,
    };

    try {
      if (term) {
        await api.patch(`${API.terms}/${term.id}`, payload);
        notify("Terme mis à jour.", "success");
      } else {
        await api.post(API.terms, payload);
        notify("Terme ajouté au lexique.", "success");
      }
      onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Enregistrement impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title={term ? "Modifier le terme" : "Ajouter un terme au lexique"}
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
            {busy ? "Enregistrement…" : term ? "Enregistrer" : "Ajouter"}
          </button>
        </>
      }
    >
      <div className={styles.fieldRow}>
        <Field label="Terme">
          <input
            className={styles.input}
            value={form.term}
            onChange={(e) => set("term", e.target.value)}
            placeholder="Short Roll"
          />
        </Field>

        <Field label="Catégorie">
          <select
            className={styles.select}
            value={form.category}
            onChange={(e) => set("category", e.target.value)}
          >
            <option value="">— Aucune —</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.icon} {c.label}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field
        label="Définition"
        hint="Cette définition prime sur la compréhension générale du modèle. Sois précis."
      >
        <textarea
          className={styles.textarea}
          value={form.definition}
          onChange={(e) => set("definition", e.target.value)}
          placeholder="Variante du pick and roll dans laquelle le poseur d'écran s'arrête à mi-distance…"
        />
      </Field>

      <div className={styles.fieldRow}>
        <Field label="Synonymes" hint="Séparés par des virgules.">
          <input
            className={styles.input}
            value={form.synonyms}
            onChange={(e) => set("synonyms", e.target.value)}
            placeholder="Roll court, Short-roll"
          />
        </Field>

        <Field label="Traductions" hint="Séparées par des virgules.">
          <input
            className={styles.input}
            value={form.translations}
            onChange={(e) => set("translations", e.target.value)}
            placeholder="Écran et roule court"
          />
        </Field>
      </div>

      <Field label="Exemples" hint="Un exemple par ligne. Respecte la règle « le joueur 1 ».">
        <textarea
          className={styles.textarea}
          value={form.examples}
          onChange={(e) => set("examples", e.target.value)}
          placeholder="Face au blitz, le joueur 5 réalise un short roll et prend la balle à la ligne des lancers francs."
        />
      </Field>

      <Field label="Notes internes">
        <textarea
          className={styles.textarea}
          value={form.notes}
          onChange={(e) => set("notes", e.target.value)}
        />
      </Field>

      <div className={styles.fieldRow}>
        <Field label="Source">
          <input
            className={styles.input}
            value={form.source}
            onChange={(e) => set("source", e.target.value)}
            placeholder="Lexique MyBasket"
          />
        </Field>

        <Field label="Priorité">
          <select
            className={styles.select}
            value={form.priority}
            onChange={(e) => set("priority", e.target.value)}
          >
            {AI_RULE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Schéma associé (URL)" hint="Optionnel — image ou plaquette illustrant le terme.">
        <input
          className={styles.input}
          value={form.schemaUrl}
          onChange={(e) => set("schemaUrl", e.target.value)}
        />
      </Field>

      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={form.isActive}
          onChange={(e) => set("isActive", e.target.checked)}
        />
        Terme actif (consultable par les IA)
      </label>
    </Modal>
  );
}
