"use client";

// components/club/ClubDocumentsSection.tsx
import { useEffect, useMemo, useState } from "react";
import {
  type ClubDocument,
  type ClubTeam,
  listClubDocuments,
  listClubTeams,
  uploadClubDocument,
} from "@/lib/club-core";

const SECTIONS = ["Club", "Administration", "Équipes", "Joueurs", "Coachs", "Médical", "Arbitrage", "Autre"];
const CATEGORIES = ["Document", "PDF", "Licence", "Certificat", "Autorisation", "Facture", "Photo", "Vidéo", "Autre"];

function formatSize(size?: number | null) {
  if (!size) return "—";
  if (size < 1024) return `${size} o`;
  if (size < 1024 * 1024) return `${Math.round(size / 1024)} Ko`;
  return `${(size / (1024 * 1024)).toFixed(1)} Mo`;
}

export default function ClubDocumentsSection({ clubId }: { clubId: string }) {
  const [documents, setDocuments] = useState<ClubDocument[]>([]);
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [section, setSection] = useState("Club");
  const [category, setCategory] = useState("");
  const [teamId, setTeamId] = useState("");
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setError("");
    try {
      const [docRows, teamRows] = await Promise.all([
        listClubDocuments(clubId),
        listClubTeams(clubId),
      ]);
      setDocuments(docRows);
      setTeams(teamRows);
    } catch (e: any) {
      setError(e?.message || "Documents impossibles à charger.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((doc: any) => {
      const byQuery = !q || `${doc.title} ${doc.category}`.toLowerCase().includes(q);
      const byCategory = !category || doc.category === category;
      const byTeam = !teamId || doc.teamId === teamId;
      const bySection = !section || String((doc as any).section || "Club") === section || (section === "Équipes" && doc.teamId);
      return byQuery && byCategory && byTeam && bySection;
    });
  }, [documents, query, category, teamId, section]);

  async function upload(file: File) {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      const doc = await uploadClubDocument({
        clubId,
        file,
        title: file.name,
        category: category || "Document",
        teamId: teamId || null,
        section,
      });

      setDocuments((prev) => [doc, ...prev]);
      setMessage("Fichier ajouté.");
    } catch (e: any) {
      setError(e?.message || "Upload impossible.");
    } finally {
      setSaving(false);
      setDragging(false);
    }
  }

  async function uploadMany(files: FileList | File[]) {
    const list = Array.from(files);
    for (const file of list) {
      await upload(file);
    }
  }

  return (
    <section className="docs">
      <div className="top">
        <div>
          <p>DOCUMENTS</p>
          <h2>Drive du club</h2>
          <span>Administration, équipes, joueurs, médical, coachs et fichiers partagés.</span>
        </div>

        <label className="mainBtn">
          + Ajouter
          <input hidden type="file" multiple onChange={(e) => e.target.files && uploadMany(e.target.files)} />
        </label>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="body">
        <aside className="sidebar">
          <strong>Sections</strong>
          {SECTIONS.map((item) => (
            <button key={item} className={section === item ? "active" : ""} onClick={() => setSection(item)}>
              {item}
            </button>
          ))}
        </aside>

        <main className="main">
          <div className="filters">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher un document..." />
            <select value={category} onChange={(e) => setCategory(e.target.value)}>
              <option value="">Toutes catégories</option>
              {CATEGORIES.map((cat) => <option key={cat}>{cat}</option>)}
            </select>
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Toutes équipes</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </div>

          <div
            className={`dropzone ${dragging ? "dragging" : ""}`}
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
            <span>PDF, images, documents, feuilles de match, certificats, autorisations.</span>
          </div>

          <div className="docGrid">
            {filtered.map((doc) => (
              <a key={doc.id} className="docCard" href={doc.fileUrl || "#"} target="_blank">
                <div className="icon">{doc.mimeType?.includes("image") ? "🖼️" : doc.mimeType?.includes("pdf") ? "📄" : "📁"}</div>
                <strong>{doc.title}</strong>
                <span>{doc.category}</span>
                <small>{teams.find((team) => team.id === doc.teamId)?.name || "Club"} · {formatSize(doc.sizeBytes)}</small>
              </a>
            ))}
          </div>
        </main>
      </div>

      <style jsx>{`
        .docs{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}
        .top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span{color:#6b7280;font-weight:700}
        .mainBtn,button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer;text-decoration:none}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;font-weight:900}.alert.error{background:#fff0f0;color:#b91c1c}.alert.ok{background:#f0fff4;color:#15803d}
        .body{display:grid;grid-template-columns:240px 1fr;min-height:620px}.sidebar{padding:18px;border-right:1px solid #eef2f7;background:#fffdf8;display:grid;gap:8px;align-content:start}
        .sidebar strong{color:#6b1a2c;margin-bottom:8px}.sidebar button{background:#fff;color:#6b1a2c;text-align:left;border-radius:14px}.sidebar button.active{background:#6b1a2c;color:#fff}
        .main{padding:18px}.filters{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px}input,select{border:1px solid #e5e7eb;border-radius:14px;padding:11px 12px;font:inherit}
        .dropzone{border:2px dashed #eadfd5;border-radius:24px;background:#fffaf2;padding:28px;text-align:center;color:#6b7280;margin-bottom:18px}.dropzone.dragging{border-color:#6b1a2c;background:#fff4df}.dropzone b{display:block;color:#6b1a2c;font-size:1.1rem;margin-bottom:4px}
        .docGrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}.docCard{border:1px solid #eadfd5;border-radius:20px;padding:16px;text-decoration:none;color:#111827;background:#fff;min-height:150px}.docCard:hover{box-shadow:0 12px 30px rgba(0,0,0,.08);transform:translateY(-1px)}.icon{font-size:1.7rem}.docCard strong,.docCard span,.docCard small{display:block}.docCard strong{margin-top:8px;color:#6b1a2c}.docCard span{font-weight:900;color:#374151}.docCard small{color:#6b7280;font-weight:800;margin-top:6px}
        @media(max-width:900px){.body{grid-template-columns:1fr}.sidebar{border-right:0;border-bottom:1px solid #eef2f7}.filters{flex-direction:column}}
      `}</style>
    </section>
  );
}
