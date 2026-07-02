"use client";

// components/club/ClubDriveSection.tsx
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { ClubCoach, ClubPlayer, ClubTeam } from "@/lib/club-core";
import {
  createDriveFolder,
  getDriveWorkspace,
  moveDocumentToFolder,
  renameDocument,
  uploadDriveDocument,
  type ClubDocumentFolder,
  type DriveDocument,
} from "@/lib/club-drive";

const SECTIONS = [
  "Club",
  "Administration",
  "Équipes",
  "Joueurs",
  "Coachs",
  "Médical",
  "Arbitrage",
  "Photos",
  "Vidéos",
  "Autre",
];

function sizeLabel(size?: number | null) {
  if (!size) return "—";
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
  return `${(size / 1024 / 1024).toFixed(1)} Mo`;
}

function getStoragePath(doc: DriveDocument) {
  const raw = doc as any;

  return (
    raw.storagePath ||
    raw.storage_path ||
    raw.filePath ||
    raw.file_path ||
    raw.path ||
    raw.object_path ||
    ""
  );
}

export default function ClubDriveSection({ clubId }: { clubId: string }) {
  const supabase = createClient();

  const [folders, setFolders] = useState<ClubDocumentFolder[]>([]);
  const [documents, setDocuments] = useState<DriveDocument[]>([]);
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [coaches, setCoaches] = useState<ClubCoach[]>([]);
  const [section, setSection] = useState("Club");
  const [folderId, setFolderId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setError("");

    try {
      const data = await getDriveWorkspace(clubId);
      setFolders(data.folders);
      setDocuments(data.documents);
      setTeams(data.teams);
      setPlayers(data.players);
      setCoaches(data.coaches);
    } catch (e: any) {
      setError(e?.message || "Drive impossible à charger.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const currentFolders = useMemo(() => {
    return folders.filter(
      (folder) => folder.section === section && (folder.parentId || null) === folderId,
    );
  }, [folders, section, folderId]);

  const currentDocuments = useMemo(() => {
    const q = query.trim().toLowerCase();

    return documents.filter((doc) => {
      const byFolder = (doc.folderId || null) === folderId;
      const bySection = !folderId
        ? String((doc as any).section || doc.category || "Club") === section || section === "Club"
        : true;
      const byQuery =
        !q ||
        `${doc.title} ${doc.category} ${doc.description || ""}`.toLowerCase().includes(q);

      return byFolder && bySection && byQuery;
    });
  }, [documents, folderId, section, query]);

  const activeFolder = folders.find((folder) => folder.id === folderId) || null;

  async function createFolder() {
    const name = prompt("Nom du dossier ?");
    if (!name) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const folder = await createDriveFolder({
        clubId,
        name,
        section,
        parentId: folderId,
        visibility: "staff",
      });

      setFolders((prev) => [...prev, folder]);
      setMessage("Dossier créé.");
    } catch (e: any) {
      setError(e?.message || "Dossier non créé.");
    } finally {
      setSaving(false);
    }
  }

  async function upload(file: File) {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const doc = await uploadDriveDocument({
        clubId,
        file,
        folderId,
        section,
        category: file.type.includes("image")
          ? "Image"
          : file.type.includes("pdf")
            ? "PDF"
            : "Document",
        visibility: "staff",
      });

      setDocuments((prev) => [doc, ...prev]);
      setMessage("Document ajouté.");
    } catch (e: any) {
      setError(e?.message || "Upload impossible.");
    } finally {
      setSaving(false);
      setDragging(false);
    }
  }

  async function uploadMany(files: FileList | File[]) {
    for (const file of Array.from(files)) await upload(file);
  }

  async function rename(doc: DriveDocument) {
    const title = prompt("Nouveau nom du document ?", doc.title);
    if (!title) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await renameDocument({ documentId: doc.id, title });
      setDocuments((prev) =>
        prev.map((item) => (item.id === doc.id ? { ...item, title } : item)),
      );
      setMessage("Document renommé.");
    } catch (e: any) {
      setError(e?.message || "Impossible de renommer le document.");
    } finally {
      setSaving(false);
    }
  }

  async function move(doc: DriveDocument) {
    const folderName = prompt("Nom exact du dossier de destination ? (vide = racine)") || "";
    const target = folderName.trim()
      ? folders.find(
          (folder) => folder.name.toLowerCase() === folderName.trim().toLowerCase(),
        )
      : null;

    if (folderName.trim() && !target) {
      setError("Dossier introuvable.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await moveDocumentToFolder({ documentId: doc.id, folderId: target?.id || null });
      setDocuments((prev) =>
        prev.map((item) =>
          item.id === doc.id ? { ...item, folderId: target?.id || null } : item,
        ),
      );
      setMessage("Document déplacé.");
    } catch (e: any) {
      setError(e?.message || "Impossible de déplacer le document.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(doc: DriveDocument) {
    const ok = confirm(`Supprimer définitivement "${doc.title}" ?`);
    if (!ok) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const storagePath = getStoragePath(doc);

      if (storagePath) {
        await supabase.storage.from("club-documents").remove([storagePath]);
      }

      const { error: deleteError } = await supabase
        .from("club_documents")
        .delete()
        .eq("id", doc.id);

      if (deleteError) throw deleteError;

      setDocuments((prev) => prev.filter((item) => item.id !== doc.id));
      setMessage("Document supprimé.");
    } catch (e: any) {
      setError(e?.message || "Impossible de supprimer le document.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="drive">
      <div className="top">
        <div>
          <p>DOCUMENTS</p>
          <h2>Drive du club</h2>
          <span>Dossiers, upload, rattachement équipe/joueur/coach et recherche.</span>
        </div>

        <div className="topActions">
          <button onClick={createFolder} disabled={saving} type="button">
            + Dossier
          </button>
          <label>
            + Fichier
            <input
              hidden
              type="file"
              multiple
              onChange={(e) => e.target.files && uploadMany(e.target.files)}
            />
          </label>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="layout">
        <aside className="sidebar">
          <strong>Sections</strong>

          {SECTIONS.map((item) => (
            <button
              key={item}
              className={section === item ? "active" : ""}
              onClick={() => {
                setSection(item);
                setFolderId(null);
              }}
              type="button"
            >
              {item}
            </button>
          ))}

          <div className="meta">
            <span>{teams.length} équipes</span>
            <span>{players.length} joueurs</span>
            <span>{coaches.length} coachs</span>
          </div>
        </aside>

        <main className="main">
          <div className="toolbar">
            <button
              className="ghost"
              onClick={() => setFolderId(activeFolder?.parentId || null)}
              disabled={!folderId}
              type="button"
            >
              ← Retour
            </button>
            <strong>{activeFolder?.name || section}</strong>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Rechercher..."
            />
          </div>

          <div
            className={`drop ${dragging ? "dragging" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              uploadMany(e.dataTransfer.files);
            }}
          >
            <b>{saving ? "Upload en cours..." : "Glisse tes fichiers ici"}</b>
            <span>PDF, images, feuilles de match, certificats, documents administratifs.</span>
          </div>

          <div className="grid">
            {currentFolders.map((folder) => (
              <button
                key={folder.id}
                className="folder"
                onClick={() => setFolderId(folder.id)}
                type="button"
              >
                <span>📁</span>
                <strong>{folder.name}</strong>
                <small>{folder.visibility}</small>
              </button>
            ))}

            {currentDocuments.map((doc) => (
              <article className="doc" key={doc.id}>
                <a href={doc.fileUrl || "#"} target="_blank" rel="noreferrer">
                  <span>
                    {doc.mimeType?.includes("image")
                      ? "🖼️"
                      : doc.mimeType?.includes("pdf")
                        ? "📄"
                        : "📎"}
                  </span>
                  <strong>{doc.title}</strong>
                  <small>
                    {doc.category} · {sizeLabel(doc.sizeBytes)}
                  </small>
                </a>

                <div className="actions">
                  <button onClick={() => rename(doc)} disabled={saving} type="button">
                    ✏️ Renommer
                  </button>
                  <button onClick={() => move(doc)} disabled={saving} type="button">
                    📂 Déplacer
                  </button>
                  <button
                    className="delete"
                    onClick={() => remove(doc)}
                    disabled={saving}
                    type="button"
                  >
                    🗑️ Supprimer
                  </button>
                </div>
              </article>
            ))}
          </div>
        </main>
      </div>

      <style jsx>{`
        .drive {
          border: 1px solid #eadfd5;
          border-radius: 28px;
          background: #fff;
          overflow: hidden;
          box-shadow: 0 22px 70px rgba(0, 0, 0, 0.06);
          font-family: Roboto, system-ui, sans-serif;
        }
        .top {
          display: flex;
          justify-content: space-between;
          gap: 20px;
          align-items: center;
          padding: 24px;
          background: linear-gradient(135deg, #fff, #fff5e8);
          border-bottom: 1px solid #eadfd5;
        }
        .top p {
          margin: 0 0 6px;
          color: #d4a24c;
          font-size: 0.72rem;
          font-weight: 900;
          letter-spacing: 0.12em;
        }
        .top h2 {
          margin: 0;
          color: #6b1a2c;
          font-family: "Alfa Slab One", serif;
          font-weight: 400;
        }
        .top span {
          color: #6b7280;
          font-weight: 700;
        }
        button,
        .topActions label {
          border: 1px solid #eadfd5;
          background: #6b1a2c;
          color: white;
          border-radius: 999px;
          padding: 10px 14px;
          font-weight: 900;
          cursor: pointer;
          text-decoration: none;
        }
        button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }
        .topActions {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }
        .ghost {
          background: #fffaf2;
          color: #6b1a2c;
        }
        .alert {
          margin: 16px;
          padding: 12px 14px;
          border-radius: 14px;
          font-weight: 900;
        }
        .alert.error {
          background: #fff0f0;
          color: #b91c1c;
        }
        .alert.ok {
          background: #f0fff4;
          color: #15803d;
        }
        .layout {
          display: grid;
          grid-template-columns: 240px 1fr;
          min-height: 650px;
        }
        .sidebar {
          padding: 18px;
          border-right: 1px solid #eef2f7;
          background: #fffdf8;
          display: grid;
          gap: 8px;
          align-content: start;
        }
        .sidebar strong {
          color: #6b1a2c;
        }
        .sidebar button {
          background: #fff;
          color: #6b1a2c;
          text-align: left;
          border-radius: 14px;
        }
        .sidebar button.active {
          background: #6b1a2c;
          color: white;
        }
        .meta {
          display: grid;
          gap: 6px;
          margin-top: 14px;
          color: #6b7280;
          font-weight: 900;
          font-size: 0.78rem;
        }
        .main {
          padding: 18px;
        }
        .toolbar {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
        }
        .toolbar strong {
          color: #6b1a2c;
        }
        .toolbar input {
          margin-left: auto;
          min-width: 260px;
        }
        input {
          border: 1px solid #e5e7eb;
          border-radius: 14px;
          padding: 11px 12px;
          font: inherit;
        }
        .drop {
          border: 2px dashed #eadfd5;
          border-radius: 24px;
          background: #fffaf2;
          padding: 24px;
          text-align: center;
          margin-bottom: 18px;
        }
        .drop.dragging {
          border-color: #6b1a2c;
          background: #fff4df;
        }
        .drop b {
          display: block;
          color: #6b1a2c;
        }
        .drop span {
          color: #6b7280;
          font-weight: 800;
        }
        .grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
          gap: 14px;
        }
        .folder,
        .doc {
          border: 1px solid #eadfd5;
          border-radius: 20px;
          background: #fff;
          padding: 16px;
          text-align: left;
          color: #111827;
        }
        .folder {
          display: grid;
          gap: 6px;
        }
        .folder span,
        .doc a span {
          font-size: 1.7rem;
        }
        .folder strong,
        .doc strong {
          color: #6b1a2c;
        }
        .folder small,
        .doc small {
          color: #6b7280;
          font-weight: 800;
        }
        .doc a {
          text-decoration: none;
          color: inherit;
          display: grid;
          gap: 6px;
        }
        .actions {
          display: flex;
          gap: 6px;
          flex-wrap: wrap;
          margin-top: 12px;
          padding-top: 12px;
          border-top: 1px solid #eadfd5;
        }
        .actions button {
          background: #fffaf2;
          color: #6b1a2c;
          font-size: 0.75rem;
          padding: 7px 9px;
        }
        .actions .delete {
          background: #fff5f5;
          color: #dc2626;
          border-color: #fecaca;
        }
        .actions .delete:hover:not(:disabled) {
          background: #dc2626;
          color: white;
          border-color: #dc2626;
        }
        @media (max-width: 900px) {
          .layout {
            grid-template-columns: 1fr;
          }
          .sidebar {
            border-right: 0;
            border-bottom: 1px solid #eef2f7;
          }
          .toolbar {
            flex-direction: column;
            align-items: stretch;
          }
          .toolbar input {
            margin-left: 0;
            min-width: 0;
          }
        }
      `}</style>
    </section>
  );
}
