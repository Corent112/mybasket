"use client";

// components/club/ClubCommunicationSection.tsx
import { useEffect, useMemo, useState } from "react";
import {
  type ClubPlayer,
  type ClubTeam,
  createClubCommunication,
  createCommunicationGroup,
  listClubPlayers,
  listClubTeams,
} from "@/lib/club-core";

const TARGETS = [
  { label: "Joueurs", value: "players" },
  { label: "Parents", value: "parents" },
  { label: "Coachs", value: "coaches" },
  { label: "Impayés", value: "late_payments" },
  { label: "Licences manquantes", value: "missing_licenses" },
  { label: "Blessés / médical", value: "medical" },
];

export default function ClubCommunicationSection({ clubId }: { clubId: string }) {
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [teamId, setTeamId] = useState("");
  const [target, setTarget] = useState("players");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [groupName, setGroupName] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const [teamRows, playerRows] = await Promise.all([
        listClubTeams(clubId),
        listClubPlayers(clubId),
      ]);
      setTeams(teamRows);
      setPlayers(playerRows);
    } catch (e: any) {
      setError(e?.message || "Chargement impossible.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const recipients = useMemo(() => {
    return players.filter((player) => {
      const byTeam = !teamId || player.teamId === teamId;
      if (!byTeam) return false;
      if (target === "late_payments") return player.paymentStatus !== "paid";
      if (target === "missing_licenses") return player.licenseStatus !== "valid";
      if (target === "medical") return Boolean(player.medicalStatus);
      return true;
    });
  }, [players, teamId, target]);

  const filters = {
    target,
    teamId: teamId || null,
  };

  async function saveGroup() {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      await createCommunicationGroup({
        clubId,
        name: groupName || `${TARGETS.find((t) => t.value === target)?.label} ${teams.find((t) => t.id === teamId)?.name || "club"}`,
        description: "Groupe dynamique créé depuis MyBasket.",
        filters,
      });
      setMessage("Groupe créé.");
      setGroupName("");
    } catch (e: any) {
      setError(e?.message || "Groupe non créé.");
    } finally {
      setSaving(false);
    }
  }

  async function saveCommunication() {
    setSaving(true);
    setError("");
    setMessage("");

    try {
      await createClubCommunication({
        clubId,
        subject,
        body,
        filters,
      });
      setMessage("Communication enregistrée en brouillon.");
      setSubject("");
      setBody("");
    } catch (e: any) {
      setError(e?.message || "Communication non créée.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="com">
      <div className="top">
        <div>
          <p>COMMUNICATION</p>
          <h2>Groupes et messages ciblés</h2>
          <span>Filtre par équipe, parents, joueurs, impayés, licences ou médical.</span>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="layout">
        <aside className="filters">
          <h3>Ciblage</h3>
          <label>Équipe
            <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
              <option value="">Tout le club</option>
              {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
            </select>
          </label>

          <label>Condition
            <select value={target} onChange={(e) => setTarget(e.target.value)}>
              {TARGETS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>

          <div className="preview">
            <b>{recipients.length}</b>
            <span>personnes ciblées</span>
          </div>

          <input value={groupName} onChange={(e) => setGroupName(e.target.value)} placeholder="Nom du groupe..." />
          <button disabled={saving} onClick={saveGroup}>Créer groupe</button>
        </aside>

        <main className="composer">
          <h3>Nouveau message</h3>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Sujet" />
          <textarea value={body} onChange={(e) => setBody(e.target.value)} placeholder="Écris ton message..." />
          <div className="actions">
            <button disabled={saving || !subject} onClick={saveCommunication}>Enregistrer brouillon</button>
          </div>

          <div className="list">
            <div className="row head"><span>Destinataire</span><span>Équipe</span><span>Parent</span><span>Email</span></div>
            {recipients.slice(0, 30).map((player) => (
              <div className="row" key={player.id}>
                <span>{player.lastName} {player.firstName}</span>
                <span>{teams.find((team) => team.id === player.teamId)?.name || "—"}</span>
                <span>{player.parentName || "—"}</span>
                <span>{target === "parents" ? player.parentEmail || "—" : player.email || player.parentEmail || "—"}</span>
              </div>
            ))}
          </div>
        </main>
      </div>

      <style jsx>{`
        .com{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}.top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span{color:#6b7280;font-weight:700}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;font-weight:900}.alert.error{background:#fff0f0;color:#b91c1c}.alert.ok{background:#f0fff4;color:#15803d}
        .layout{display:grid;grid-template-columns:320px 1fr;gap:18px;padding:18px}.filters,.composer{border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}.filters{background:#fffdf8}
        h3{margin:0 0 14px;color:#6b1a2c}label{display:flex;flex-direction:column;gap:6px;margin-bottom:12px;color:#6b7280;font-weight:900;font-size:.78rem}
        input,select,textarea{border:1px solid #e5e7eb;border-radius:14px;padding:11px 12px;font:inherit}textarea{min-height:180px;resize:vertical}
        button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}.preview{border:1px solid #eadfd5;border-radius:20px;background:#fff8ee;padding:18px;text-align:center;margin:14px 0}.preview b{display:block;color:#6b1a2c;font-size:2rem}.preview span{font-weight:900;color:#6b7280}
        .actions{margin:12px 0 18px}.list{border:1px solid #eef2f7;border-radius:18px;overflow:hidden}.row{display:grid;grid-template-columns:1.2fr 1fr 1fr 1.3fr;border-bottom:1px solid #eef2f7}.row span{padding:12px;font-weight:800}.row.head{background:#f8fafc;color:#6b7280}
        @media(max-width:900px){.layout{grid-template-columns:1fr}.row{grid-template-columns:1fr}.row.head{display:none}}
      `}</style>
    </section>
  );
}
