"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AI_MAX_FILE_SIZE } from "@/lib/ai/config";
import {createClient} from "@/lib/supabase/client";
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
  const [files, setFiles] = useState<File[]>([]);
  const [results, setResults] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [categorySlug, setCategorySlug] = useState("");
  const [provenance, setProvenance] = useState("");
  const [author, setAuthor] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!files.length) {
      notify("Sélectionne un fichier.", "error");
      return;
    }

    if (busy) return;
    setBusy(true); setResults([]);
    const remaining: File[] = [];
    for (const [index, file] of files.entries()) {
      const label = `${index + 1}/${files.length} · ${file.name} (${formatBytes(file.size)})`;
      setResults(old => [...old, `${label} — préparation…`]);
      let sent = false;
      try {
        let uploadFile = file;
        const compact = file.size > AI_MAX_FILE_SIZE && /\.pptx$/i.test(file.name);
        if (compact) {
          const { extractLargePowerPointText, MAX_LOCAL_POWERPOINT_BYTES } = await import("@/lib/ai/knowledge/powerpoint-text");
          if (file.size > MAX_LOCAL_POWERPOINT_BYTES) {
            throw new Error("Ce PowerPoint dépasse 300 Mo. Divise la présentation avant l’import.");
          }
          const text = extractLargePowerPointText(new Uint8Array(await file.arrayBuffer()));
          uploadFile = new File([text], file.name.replace(/\.pptx$/i, ".txt"), { type: "text/plain" });
        }
        const prepared = await api.post<{sourceId:string;path:string;token:string;bucket:string;mimeType:string}>(`${API.sources}/prepare`, {
          name: uploadFile.name, type: uploadFile.type, size: uploadFile.size,
          title: files.length === 1 && title ? title : file.name.replace(/\.[^.]+$/, ""),
          description, category: categorySlug, provenance: provenance || (compact ? file.name : ""), author,
        });
        setResults(old => [...old.slice(0, -1), `${label} — envoi…`]);
        const uploaded = await createClient().storage.from(prepared.bucket).uploadToSignedUrl(
          prepared.path, prepared.token, uploadFile, {contentType: prepared.mimeType},
        );
        if (uploaded.error) {
          await api.delete(`${API.sources}/${prepared.sourceId}`).catch(() => {});
          throw new Error("L’envoi a échoué. Tu peux réessayer ce fichier.");
        }
        sent = true;
        setResults(old => [...old.slice(0, -1), `${label} — analyse…`]);
        const data = await api.post<{indexation:{ok:boolean;chunkCount:number;warnings:string[];error?:string}}>(`${API.sources}/${prepared.sourceId}/reindex`);
        const outcome = data.indexation.ok ? data.indexation.chunkCount ? `✓ ${data.indexation.chunkCount} passages indexés` : "Stocké sans contenu indexé" : `Importé, indexation à reprendre : ${data.indexation.error || "consulter le document"}`;
        setResults(old => [...old.slice(0, -1), `${label} — ${outcome}${compact ? " · Texte des diapositives et notes uniquement" : ""}${data.indexation.warnings?.length ? " · "+data.indexation.warnings.join(" · ") : ""}`]);
      } catch (error) {
        if (!sent) remaining.push(file);
        const reason = error instanceof Error ? error.message : "Import impossible";
        setResults(old => [...old.slice(0, -1), `${label} — ${sent ? "Fichier enregistré. Relance l’indexation depuis la liste. " : ""}${reason}`]);
      }
    }
    setFiles(remaining); setBusy(false);
    notify(remaining.length ? `${remaining.length} fichier(s) à réessayer. Les autres sont conservés.` : "Import terminé. Consulte le résultat de chaque document.", remaining.length ? "error" : "success");
  };

  return (
    <Modal
      title="Importer des ressources"
      onClose={busy ? () => {} : onClose}
      footer={
        <>
          <button type="button" className={styles.btn} onClick={results.length ? onDone : onClose} disabled={busy}>
            {results.length ? "Terminer" : "Annuler"}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${styles.btnPrimary}`}
            onClick={submit}
            disabled={busy || !files.length}
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
        label="Documents"
        hint="PDF, DOCX, TXT, Markdown, CSV et images : 50 Mo par fichier. Pour un PowerPoint .pptx entre 50 et 300 Mo, seuls le texte des diapositives et les notes sont transmis."
      >
        <input
          ref={fileRef}
          type="file"
          multiple
          disabled={busy}
          className={styles.input}
          accept={ACCEPT}
          onChange={(e) => {
            const selected = Array.from(e.target.files || []);
            setFiles(selected); setResults([]);
            if (selected.length === 1) setTitle(selected[0].name.replace(/\.[^.]+$/, ""));
            else setTitle("");
          }}
        />
      </Field>

      {!!files.length && <p>{files.length} document(s) sélectionné(s)</p>}
      {!!results.length && <div role="status" style={{display:"grid",gap:8,fontSize:13}}>{results.map((line,i)=><p key={i}>{line}</p>)}</div>}
      <Field label="Titre (un document)">
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
