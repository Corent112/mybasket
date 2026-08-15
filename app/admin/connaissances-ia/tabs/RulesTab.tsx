"use client";

import { useCallback, useEffect, useState } from "react";
import { AI_MODULES, AI_RULE_PRIORITIES } from "@/lib/ai/config";
import type { AiKnowledgeCategory, AiRule } from "@/lib/ai/knowledge/types";
import { API, api } from "../api";
import styles from "../page.module.css";
import { ConfirmDialog, type ConfirmState, EmptyState, Field, Modal, Notice } from "../ui";

type Props = {
  categories: AiKnowledgeCategory[];
  notify: (message: string, tone?: "info" | "success" | "error") => void;
  onChanged: () => void;
};

const PRIORITY_CLASS: Record<string, string> = {
  critical: styles.badgeCritical,
  high: styles.badgeWarn,
  normal: styles.badge,
  low: styles.badgeInfo,
};

export default function RulesTab({ categories, notify, onChanged }: Props) {
  const [rules, setRules] = useState<AiRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [priority, setPriority] = useState("");
  const [editing, setEditing] = useState<AiRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [confirm, setConfirm] = useState<ConfirmState>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search) params.set("q", search);
      if (priority) params.set("priority", priority);

      const data = await api.get<{ rules: AiRule[] }>(`${API.rules}?${params}`);
      setRules(data.rules);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Chargement impossible.", "error");
    } finally {
      setLoading(false);
    }
  }, [search, priority, notify]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const toggle = async (rule: AiRule) => {
    try {
      await api.patch(`${API.rules}/${rule.id}`, { isActive: !rule.is_active });
      await load();
      onChanged();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Modification impossible.", "error");
    }
  };

  const askDelete = (rule: AiRule) => {
    setConfirm({
      title: "Supprimer cette règle ?",
      message:
        rule.priority === "critical"
          ? `« ${rule.name} » est une règle CRITIQUE. La supprimer retirera une contrainte fondamentale de rédaction appliquée à toutes les générations IA de MyBasket. Cette action est irréversible.`
          : `« ${rule.name} » ne sera plus injectée dans les prompts IA. Cette action est irréversible.`,
      onConfirm: async () => {
        try {
          await api.delete(`${API.rules}/${rule.id}`);
          notify("Règle supprimée.", "success");
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
        <span>🧭</span>
        <span>
          Les règles sont réellement injectées dans chaque génération IA. Les règles{" "}
          <strong>critiques</strong> priment sur les règles de club et sur les préférences
          utilisateur : un entraîneur ne peut jamais les contourner.
        </span>
      </Notice>

      <div className={styles.filters}>
        <input
          className={styles.search}
          placeholder="Rechercher une règle…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className={styles.select}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
        >
          <option value="">Toutes les priorités</option>
          {AI_RULE_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {p}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => setCreating(true)}
        >
          + Ajouter une règle
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Chargement des règles…</div>
      ) : rules.length === 0 ? (
        <EmptyState
          title="Aucune règle"
          message="Ajoute les contraintes que toutes les IA MyBasket doivent respecter."
        />
      ) : (
        <div className={styles.cardGrid}>
          {rules.map((rule) => (
            <article
              key={rule.id}
              className={styles.card}
              style={{ opacity: rule.is_active ? 1 : 0.55 }}
            >
              <div className={styles.cardHead}>
                <h3 className={styles.cardTitle}>{rule.name}</h3>
                <span className={`${styles.badge} ${PRIORITY_CLASS[rule.priority] || ""}`}>
                  {rule.priority}
                </span>
              </div>

              <p className={styles.cardBody}>{rule.instruction}</p>

              {rule.examples_good.length > 0 ? (
                <p className={styles.exampleGood}>✅ {rule.examples_good[0]}</p>
              ) : null}
              {rule.examples_bad.length > 0 ? (
                <p className={styles.exampleBad}>❌ {rule.examples_bad[0]}</p>
              ) : null}

              <div className={styles.cardMeta}>
                <span className={styles.badge}>
                  {rule.modules.length === 0
                    ? "Tous les modules"
                    : `${rule.modules.length} module(s)`}
                </span>
                {!rule.is_active ? (
                  <span className={`${styles.badge} ${styles.badgeWarn}`}>Inactive</span>
                ) : null}
              </div>

              <div className={styles.cardActions}>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSm}`}
                  onClick={() => setEditing(rule)}
                >
                  Modifier
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSm}`}
                  onClick={() => toggle(rule)}
                >
                  {rule.is_active ? "Désactiver" : "Activer"}
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                  onClick={() => askDelete(rule)}
                >
                  Supprimer
                </button>
              </div>
            </article>
          ))}
        </div>
      )}

      {creating || editing ? (
        <RuleModal
          rule={editing}
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

function RuleModal({
  rule,
  categories,
  notify,
  onClose,
  onDone,
}: {
  rule: AiRule | null;
  categories: AiKnowledgeCategory[];
  notify: Props["notify"];
  onClose: () => void;
  onDone: () => void;
}) {
  const [name, setName] = useState(rule?.name || "");
  const [instruction, setInstruction] = useState(rule?.instruction || "");
  const [category, setCategory] = useState(rule?.category_slug || "regles-mybasket");
  const [priority, setPriority] = useState<string>(rule?.priority || "normal");
  const [position, setPosition] = useState(String(rule?.position ?? 100));
  const [modules, setModules] = useState<string[]>(rule?.modules || []);
  const [good, setGood] = useState((rule?.examples_good || []).join("\n"));
  const [bad, setBad] = useState((rule?.examples_bad || []).join("\n"));
  const [isActive, setIsActive] = useState(rule?.is_active ?? true);
  const [busy, setBusy] = useState(false);

  const toggleModule = (key: string) => {
    setModules((prev) =>
      prev.includes(key) ? prev.filter((m) => m !== key) : [...prev, key]
    );
  };

  const submit = async () => {
    if (!name.trim() || !instruction.trim()) {
      notify("Le nom et l'instruction sont obligatoires.", "error");
      return;
    }

    setBusy(true);
    const payload = {
      name,
      instruction,
      category: category || null,
      priority,
      position: Number(position) || 100,
      modules,
      examplesGood: good.split("\n").filter((v) => v.trim()),
      examplesBad: bad.split("\n").filter((v) => v.trim()),
      isActive,
    };

    try {
      if (rule) {
        await api.patch(`${API.rules}/${rule.id}`, payload);
        notify("Règle mise à jour.", "success");
      } else {
        await api.post(API.rules, payload);
        notify("Règle ajoutée.", "success");
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
      title={rule ? "Modifier la règle" : "Ajouter une règle IA"}
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
            {busy ? "Enregistrement…" : rule ? "Enregistrer" : "Ajouter"}
          </button>
        </>
      }
    >
      <Field label="Nom de la règle">
        <input
          className={styles.input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Désignation des joueurs"
        />
      </Field>

      <Field
        label="Instruction"
        hint="Rédige-la comme une consigne adressée à l'IA, à la deuxième personne."
      >
        <textarea
          className={styles.textarea}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="Désigne toujours les joueurs sous la forme « le joueur 1 », « le joueur 2 »…"
        />
      </Field>

      <div className={styles.fieldRow}>
        <Field
          label="Priorité"
          hint="« critical » = jamais contournable par un club ou un utilisateur."
        >
          <select
            className={styles.select}
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
          >
            {AI_RULE_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Ordre d'affichage" hint="Plus le nombre est petit, plus la règle est haute.">
          <input
            className={styles.input}
            type="number"
            value={position}
            onChange={(e) => setPosition(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Catégorie">
        <select
          className={styles.select}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">— Aucune —</option>
          {categories.map((c) => (
            <option key={c.slug} value={c.slug}>
              {c.icon} {c.label}
            </option>
          ))}
        </select>
      </Field>

      <Field
        label="Modules concernés"
        hint="Aucun module sélectionné = la règle s'applique à toutes les fonctionnalités IA."
      >
        <div className={styles.chips}>
          {AI_MODULES.map((m) => (
            <button
              key={m.key}
              type="button"
              className={`${styles.chip} ${modules.includes(m.key) ? styles.chipActive : ""}`}
              onClick={() => toggleModule(m.key)}
            >
              {m.label}
            </button>
          ))}
        </div>
      </Field>

      <Field label="Exemples corrects" hint="Un par ligne.">
        <textarea
          className={styles.textarea}
          value={good}
          onChange={(e) => setGood(e.target.value)}
          placeholder="Le joueur 1 passe au joueur 2 puis coupe vers le panier."
        />
      </Field>

      <Field label="Exemples à éviter" hint="Un par ligne.">
        <textarea
          className={styles.textarea}
          value={bad}
          onChange={(e) => setBad(e.target.value)}
          placeholder="1 passe à 2 puis coupe."
        />
      </Field>

      <label className={styles.checkRow}>
        <input
          type="checkbox"
          checked={isActive}
          onChange={(e) => setIsActive(e.target.checked)}
        />
        Règle active (injectée dans les prompts)
      </label>
    </Modal>
  );
}
