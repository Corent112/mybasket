"use client";

// components/club/ClubAuditExportsSection.tsx
import { useEffect, useMemo, useState } from "react";
import {
  buildCotisationsCsv,
  buildPlayersCsv,
  buildTeamsCsv,
  createClubAuditLog,
  getAuditExportWorkspace,
  type ClubAuditLog,
  type ExportBundle,
} from "@/lib/club-audit-exports";

const TABS = ["Journal", "Exports", "Sauvegarde"] as const;

function downloadText(filename: string, content: string, mime = "text/csv;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function ClubAuditExportsSection({ clubId }: { clubId: string }) {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Journal");
  const [logs, setLogs] = useState<ClubAuditLog[]>([]);
  const [bundle, setBundle] = useState<ExportBundle | null>(null);
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const data = await getAuditExportWorkspace(clubId);
      setLogs(data.logs);
      setBundle(data.bundle);
    } catch (e: any) {
      setError(e?.message || "Journal impossible à charger.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const filteredLogs = useMemo(() => {
    return logs.filter((log) => !filter || log.entityType === filter || log.action === filter);
  }, [logs, filter]);

  const entityTypes = useMemo(() => {
    return Array.from(new Set(logs.map((log) => log.entityType).filter(Boolean)));
  }, [logs]);

  async function createManualLog() {
    const title = prompt("Titre de l'action ?");
    if (!title) return;

    const description = prompt("Description ?") || "";

    try {
      await createClubAuditLog({
        clubId,
        action: "manual_note",
        entityType: "club",
        title,
        description,
      });
      setMessage("Note ajoutée au journal.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Note non créée.");
    }
  }

  function exportPlayers() {
    if (!bundle) return;
    downloadText("joueurs-club.csv", buildPlayersCsv(bundle.players, bundle.teams));
  }

  function exportTeams() {
    if (!bundle) return;
    downloadText("equipes-club.csv", buildTeamsCsv(bundle.teams, bundle.players));
  }

  function exportCotisations() {
    if (!bundle) return;
    downloadText("cotisations-club.csv", buildCotisationsCsv(bundle.cotisations, bundle.players));
  }

  function exportBackupJson() {
    if (!bundle) return;
    downloadText(
      "sauvegarde-club.json",
      JSON.stringify({ exportedAt: new Date().toISOString(), ...bundle }, null, 2),
      "application/json;charset=utf-8"
    );
  }

  return (
    <section className="audit">
      <div className="top">
        <div>
          <p>AUDIT & EXPORTS</p>
          <h2>Journal d’activité</h2>
          <span>Suivi des actions, exports CSV et sauvegarde JSON.</span>
        </div>
        <button onClick={createManualLog}>+ Note journal</button>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <nav>
        {TABS.map((item) => (
          <button key={item} className={tab === item ? "active" : ""} onClick={() => setTab(item)}>
            {item}
          </button>
        ))}
      </nav>

      {tab === "Journal" && (
        <div className="panel">
          <div className="tools">
            <select value={filter} onChange={(e) => setFilter(e.target.value)}>
              <option value="">Tout</option>
              {entityTypes.map((item) => <option key={item}>{item}</option>)}
              <option value="manual_note">Notes manuelles</option>
            </select>
            <a href={`/api/club/audit/export?clubId=${clubId}`} target="_blank">Exporter journal</a>
          </div>

          <div className="timeline">
            {filteredLogs.map((log) => (
              <article className="log" key={log.id}>
                <div className="dot" />
                <div>
                  <strong>{log.title || log.action}</strong>
                  <p>{log.description}</p>
                  <span>{log.action} · {log.entityType} · {new Date(log.createdAt).toLocaleString("fr-FR")}</span>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}

      {tab === "Exports" && (
        <div className="exports">
          <article className="exportCard">
            <strong>Joueurs</strong>
            <span>Effectif complet + statut licence/paiement</span>
            <button onClick={exportPlayers}>Télécharger CSV</button>
          </article>
          <article className="exportCard">
            <strong>Équipes</strong>
            <span>Liste équipes + nombre de joueurs</span>
            <button onClick={exportTeams}>Télécharger CSV</button>
          </article>
          <article className="exportCard">
            <strong>Cotisations</strong>
            <span>Montant, payé, restant, statut</span>
            <button onClick={exportCotisations}>Télécharger CSV</button>
          </article>
        </div>
      )}

      {tab === "Sauvegarde" && (
        <div className="panel backup">
          <h3>Sauvegarde JSON</h3>
          <p>Exporte une sauvegarde lisible de tes données club principales : joueurs, équipes, coachs, documents et cotisations.</p>
          <button onClick={exportBackupJson}>Télécharger sauvegarde</button>
        </div>
      )}

      <style jsx>{`
        .audit{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}
        .top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span{color:#6b7280;font-weight:700}
        button,a{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer;text-decoration:none}
        nav{display:flex;gap:8px;flex-wrap:wrap;padding:14px 18px;border-bottom:1px solid #eef2f7}nav button{background:#fffaf2;color:#6b1a2c}nav button.active{background:#6b1a2c;color:white}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;font-weight:900}.alert.error{background:#fff0f0;color:#b91c1c}.alert.ok{background:#f0fff4;color:#15803d}
        .panel{margin:18px;border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}.tools{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}select{border:1px solid #e5e7eb;border-radius:14px;padding:11px 12px;font:inherit}
        .timeline{display:grid;gap:12px}.log{display:grid;grid-template-columns:24px 1fr;gap:12px;border-bottom:1px solid #eef2f7;padding:12px}.dot{width:12px;height:12px;border-radius:999px;background:#6b1a2c;margin-top:4px}.log strong{color:#6b1a2c}.log p{margin:4px 0;color:#374151;font-weight:800}.log span{color:#6b7280;font-weight:900;font-size:.78rem}
        .exports{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:18px}.exportCard{border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff;display:grid;gap:12px}.exportCard strong{color:#6b1a2c;font-size:1.2rem}.exportCard span,.backup p{color:#374151;font-weight:800}.backup h3{margin:0 0 14px;color:#6b1a2c}
        @media(max-width:900px){.exports{grid-template-columns:1fr}.top{display:grid}}
      `}</style>
    </section>
  );
}
