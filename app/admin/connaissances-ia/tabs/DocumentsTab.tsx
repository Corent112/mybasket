"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { AiKnowledgeCategory, AiKnowledgeSource } from "@/lib/ai/knowledge/types";
import { API, api } from "../api";
import styles from "../page.module.css";
import {
  ConfirmDialog,
  type ConfirmState,
  EmptyState,
  Field,
  Modal,
  Notice,
  formatBytes,
  formatDate,
} from "../ui";

const STATUS_META: Record<string, { label: string; className: string }> = {
  uploaded: { label: "Importé", className: styles.badgeInfo },
  processing: { label: "Traitement", className: styles.badgeWarn },
  indexed: { label: "Indexé", className: styles.badgeSuccess },
  failed: { label: "Échec", className: styles.badgeDanger },
  archived: { label: "Archivé", className: styles.badge },
};

const ACCEPT =
  ".pdf,.docx,.txt,.md,.markdown,.csv,.pptx,.png,.jpg,.jpeg,.webp";

type Props = {
  categories: AiKnowledgeCategory[];
  notify: (message: string, tone?: "info" | "success" | "error") => void;
  onChanged: () => void;
};

export default function DocumentsTab({ categories, notify, onChanged }: Props) {
  const [sources, setSources] = useState<AiKnowledgeSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const [uploadOpen, setUploadOpen] = useState(false);
  const [editing, setEditing] = useState<AiKnowledgeSource | null>(null);
  const [confirm, setConfirm] = useState<ConfirmState>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ perPage: "100" });
      if (search) params.set("q", search);
      if (category) params.set("category", category);
      if (status) params.set("status", status);

      const data = await api.get<{ sources: AiKnowledgeSource[] }>(
        `${API.sources}?${params}`
      );
      setSources(data.sources);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Chargement impossible.", "error");
    } finally {
      setLoading(false);
    }
  }, [search, category, status, notify]);

  useEffect(() => {
    const timer = setTimeout(load, search ? 300 : 0);
    return () => clearTimeout(timer);
  }, [load, search]);

  const reindex = async (source: AiKnowledgeSource) => {
    setBusyId(source.id);
    try {
      const data = await api.post<{
        indexation: { ok: boolean; chunkCount: number; warnings: string[]; error?: string };
      }>(`${API.sources}/${source.id}/reindex`);

      if (data.indexation.ok) {
        notify(
          `« ${source.title} » réindexé — ${data.indexation.chunkCount} passage(s).`,
          "success"
        );
        data.indexation.warnings.forEach((w) => notify(w, "info"));
      } else {
        notify(data.indexation.error || "Réindexation en échec.", "error");
      }
      await load();
      onChanged();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Réindexation impossible.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const download = async (source: AiKnowledgeSource) => {
    try {
      const data = await api.get<{ url: string }>(`${API.sources}/${source.id}/download`);
      window.open(data.url, "_blank", "noopener,noreferrer");
    } catch (error) {
      notify(error instanceof Error ? error.message : "Lien indisponible.", "error");
    }
  };

  const patch = async (source: AiKnowledgeSource, body: Record<string, unknown>) => {
    setBusyId(source.id);
    try {
      await api.patch(`${API.sources}/${source.id}`, body);
      await load();
      onChanged();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Modification impossible.", "error");
    } finally {
      setBusyId(null);
    }
  };

  const askDelete = (source: AiKnowledgeSource) => {
    setConfirm({
      title: "Supprimer ce document ?",
      message: `« ${source.title} » sera définitivement supprimé, ainsi que son fichier et les ${source.chunk_count} passage(s) indexés. L'IA ne pourra plus s'appuyer dessus. Cette action est irréversible.`,
      onConfirm: async () => {
        try {
          await api.delete(`${API.sources}/${source.id}`);
          notify("Document supprimé.", "success");
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
      <div className={styles.filters}>
        <input
          className={styles.search}
          placeholder="Rechercher un document…"
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
        <select
          className={styles.select}
          value={status}
          onChange={(e) => setStatus(e.target.value)}
        >
          <option value="">Tous les statuts</option>
          {Object.entries(STATUS_META).map(([key, meta]) => (
            <option key={key} value={key}>
              {meta.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnPrimary}`}
          onClick={() => setUploadOpen(true)}
        >
          + Importer un document
        </button>
      </div>

      {loading ? (
        <div className={styles.loading}>Chargement des documents…</div>
      ) : sources.length === 0 ? (
        <EmptyState
          title="Aucun document"
          message="Importe tes cahiers d'entraînement, playbooks, documents fédéraux ou notes techniques : ils deviendront la mémoire documentaire de l'IA."
        />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Document</th>
                <th>Catégorie</th>
                <th>Statut</th>
                <th>Passages</th>
                <th>Ajouté le</th>
                <th style={{ textAlign: "right" }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {sources.map((source) => {
                const meta = STATUS_META[source.status] || STATUS_META.uploaded;
                const cat = categories.find((c) => c.slug === source.category_slug);
                const busy = busyId === source.id;

                return (
                  <tr key={source.id} style={{ opacity: source.is_active ? 1 : 0.55 }}>
                    <td>
                      <span className={styles.cellTitle}>{source.title}</span>
                      <span className={styles.cellSub}>
                        {source.source_type.toUpperCase()} · {formatBytes(source.file_size)}
                        {source.original_filename ? ` · ${source.original_filename}` : ""}
                      </span>
                      {source.index_error ? (
                        <span className={styles.cellSub} style={{ color: "#991b1b" }}>
                          ⚠ {source.index_error}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {cat ? (
                        <span className={styles.badge}>
                          {cat.icon} {cat.label}
                        </span>
                      ) : (
                        <span className={styles.cellSub}>—</span>
                      )}
                    </td>
                    <td>
                      <span className={`${styles.badge} ${meta.className}`}>{meta.label}</span>
                      {!source.is_active ? (
                        <span className={styles.cellSub}>désactivé</span>
                      ) : null}
                    </td>
                    <td>{source.chunk_count}</td>
                    <td>{formatDate(source.created_at)}</td>
                    <td>
                      <div className={styles.rowActions}>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnSm}`}
                          onClick={() => setEditing(source)}
                          disabled={busy}
                        >
                          Modifier
                        </button>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnSm}`}
                          onClick={() => download(source)}
                          disabled={busy || !source.storage_path}
                        >
                          Ouvrir
                        </button>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnSm}`}
                          onClick={() => reindex(source)}
                          disabled={busy}
                        >
                          {busy ? "…" : "Réindexer"}
                        </button>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnSm}`}
                          onClick={() => patch(source, { isActive: !source.is_active })}
                          disabled={busy}
                        >
                          {source.is_active ? "Désactiver" : "Activer"}
                        </button>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnSm}`}
                          onClick={() =>
                            patch(source, {
                              status: source.status === "archived" ? "indexed" : "archived",
                            })
                          }
                          disabled={busy}
                        >
                          {source.status === "archived" ? "Désarchiver" : "Archiver"}
                        </button>
                        <button
                          type="button"
                          className={`${styles.btn} ${styles.btnSm} ${styles.btnDanger}`}
                          onClick={() => askDelete(source)}
                          disabled={busy}
                        >
                          Supprimer
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {uploadOpen ? (
        <UploadModal
          categories={categories}
          notify={notify}
          onClose={() => setUploadOpen(false)}
          onDone={async () => {
            setUploadOpen(false);
            await load();
            onChanged();
          }}
        />
      ) : null}

      {editing ? (
        <EditModal
          source={editing}
          categories={categories}
          notify={notify}
          onClose={() => setEditing(null)}
          onDone={async () => {
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

function UploadModal({
  categories,
  notify,
  onClose,
  onDone,
}: {
  categories: AiKnowledgeCategory[];
  notify: Props["notify"];
  onClose: () => void;
  onDone: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [provenance, setProvenance] = useState("");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!file) {
      notify("Sélectionne un fichier.", "error");
      return;
    }

    setBusy(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("title", title || file.name.replace(/\.[^.]+$/, ""));
      if (description) formData.append("description", description);
      if (categorySlug) formData.append("category", categorySlug);
      if (provenance) formData.append("provenance", provenance);
      if (author) formData.append("author", author);

      const data = await api.post<{
        indexation: { ok: boolean; chunkCount: number; warnings: string[]; error?: string };
      }>(API.sources, formData);

      if (data.indexation.ok) {
        notify(`Document importé et indexé (${data.indexation.chunkCount} passages).`, "success");
      } else {
        notify(
          `Document importé mais non indexé : ${data.indexation.error || "erreur inconnue"}`,
          "error"
        );
      }
      data.indexation.warnings?.forEach((w) => notify(w, "info"));

      onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Import impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Importer un document"
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
            disabled={busy || !file}
          >
            {busy ? "Import et indexation…" : "Importer et indexer"}
          </button>
        </>
      }
    >
      <Notice tone="info">
        <span>🔒</span>
        <span>
          Les documents sont stockés dans un bucket privé. Leur contenu est traité comme une
          source d’information, jamais comme une instruction : une phrase du type « ignore
          les instructions précédentes » présente dans un PDF ne peut pas modifier le
          comportement de Coach IA.
        </span>
      </Notice>

      <Field
        label="Fichier"
        hint="PDF, DOCX, TXT, Markdown, CSV — 50 Mo maximum. PPTX et images sont stockés mais pas encore indexés."
      >
        <input
          ref={fileRef}
          type="file"
          className={styles.input}
          accept={ACCEPT}
          onChange={(e) => {
            const selected = e.target.files?.[0] || null;
            setFile(selected);
            if (selected && !title) setTitle(selected.name.replace(/\.[^.]+$/, ""));
          }}
        />
      </Field>

      <Field label="Titre">
        <input
          className={styles.input}
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Cahier d'exercices — formation initiale"
        />
      </Field>

      <Field label="Description">
        <textarea
          className={styles.textarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Ce que contient ce document et dans quel cadre l'IA doit s'en servir."
        />
      </Field>

      <div className={styles.fieldRow}>
        <Field label="Catégorie">
          <select
            className={styles.select}
            value={categorySlug}
            onChange={(e) => setCategorySlug(e.target.value)}
          >
            <option value="">— Choisir —</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.icon} {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Auteur / source">
          <input
            className={styles.input}
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="FFBB, formateur, MyBasket…"
          />
        </Field>
      </div>

      <Field
        label="Provenance affichée dans les citations"
        hint="Ce libellé apparaîtra dans les réponses de l'IA. Ex. : « Cahier d'exercices MyBasket »."
      >
        <input
          className={styles.input}
          value={provenance}
          onChange={(e) => setProvenance(e.target.value)}
          placeholder="Par défaut : le titre du document"
        />
      </Field>
    </Modal>
  );
}

/* --------------------------------------------------------------------- */

function EditModal({
  source,
  categories,
  notify,
  onClose,
  onDone,
}: {
  source: AiKnowledgeSource;
  categories: AiKnowledgeCategory[];
  notify: Props["notify"];
  onClose: () => void;
  onDone: () => void;
}) {
  const [title, setTitle] = useState(source.title);
  const [description, setDescription] = useState(source.description || "");
  const [categorySlug, setCategorySlug] = useState(source.category_slug || "");
  const [provenance, setProvenance] = useState(source.provenance || "");
  const [author, setAuthor] = useState(source.author || "");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await api.patch(`${API.sources}/${source.id}`, {
        title,
        description,
        category: categorySlug,
        provenance,
        author,
      });
      notify("Document mis à jour.", "success");
      onDone();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Modification impossible.", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      title="Modifier le document"
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
            disabled={busy || !title.trim()}
          >
            {busy ? "Enregistrement…" : "Enregistrer"}
          </button>
        </>
      }
    >
      <Field label="Titre">
        <input className={styles.input} value={title} onChange={(e) => setTitle(e.target.value)} />
      </Field>

      <Field label="Description">
        <textarea
          className={styles.textarea}
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />
      </Field>

      <div className={styles.fieldRow}>
        <Field label="Catégorie">
          <select
            className={styles.select}
            value={categorySlug}
            onChange={(e) => setCategorySlug(e.target.value)}
          >
            <option value="">— Aucune —</option>
            {categories.map((c) => (
              <option key={c.slug} value={c.slug}>
                {c.icon} {c.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Auteur / source">
          <input
            className={styles.input}
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
          />
        </Field>
      </div>

      <Field label="Provenance affichée dans les citations">
        <input
          className={styles.input}
          value={provenance}
          onChange={(e) => setProvenance(e.target.value)}
        />
      </Field>
    </Modal>
  );
}
