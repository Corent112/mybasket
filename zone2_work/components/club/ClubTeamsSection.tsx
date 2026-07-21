"use client";

// components/club/ClubTeamsSection.tsx
import { useEffect, useMemo, useState } from "react";
import {
  type ClubCoach,
  type ClubPlayer,
  type ClubTeam,
  createClubPlayer,
  createClubTeam,
  listClubCoaches,
  listClubPlayers,
  listClubTeams,
  updateClubPlayer,
  updateClubTeam,
} from "@/lib/club-core";
import { deleteEntity } from "@/lib/club-crud-actions";

const CATEGORIES = ["U13", "U15", "U18", "U21", "Seniors"];
const GENDERS = ["Mixte", "M", "F"];
const LEVELS = ["Départemental", "Régional", "National", "Élite", "Loisirs", "3x3", "Entreprise", "Autre"];

type TeamForm = {
  id?: string;
  teamNumber: string;
  category: string;
  gender: string;
  level: string;
  season: string;
  coachId: string;
  assistantId: string;
  notes: string;
  status: string;
};

type PlayerForm = {
  id?: string;
  teamId: string;
  firstName: string;
  lastName: string;
  birthdate: string;
  category: string;
  gender: string;
  licenseNumber: string;
  licenseStatus: string;
  paymentStatus: string;
  medicalStatus: string;
  email: string;
  phone: string;
  parentName: string;
  parentEmail: string;
  parentPhone: string;
  notes: string;
  status: string;
};

function emptyTeam(): TeamForm {
  return {
    teamNumber: "1",
    category: "U15",
    gender: "Mixte",
    level: "Départemental",
    season: "2026-2027",
    coachId: "",
    assistantId: "",
    notes: "",
    status: "active",
  };
}

function teamToForm(team: ClubTeam): TeamForm {
  return {
    id: team.id,
    teamNumber: (team.name.match(/Équipe\s+(\d+)/i)?.[1] || String(team.teamNumber || 1)),
    category: team.category || "U15",
    gender: team.gender || "Mixte",
    level: team.level || "Départemental",
    season: team.season || "2026-2027",
    coachId: team.coachId || "",
    assistantId: team.assistantId || "",
    notes: team.notes || "",
    status: team.status || "active",
  };
}

function emptyPlayer(team?: ClubTeam | null): PlayerForm {
  return {
    teamId: team?.id || "",
    firstName: "",
    lastName: "",
    birthdate: "",
    category: team?.category || "U11",
    gender: team?.gender || "Mixte",
    licenseNumber: "",
    licenseStatus: "pending",
    paymentStatus: "pending",
    medicalStatus: "",
    email: "",
    phone: "",
    parentName: "",
    parentEmail: "",
    parentPhone: "",
    notes: "",
    status: "active",
  };
}

function playerToForm(player: ClubPlayer): PlayerForm {
  return {
    id: player.id,
    teamId: player.teamId || "",
    firstName: player.firstName,
    lastName: player.lastName,
    birthdate: player.birthdate || "",
    category: player.category || "U11",
    gender: player.gender || "Mixte",
    licenseNumber: player.licenseNumber || "",
    licenseStatus: player.licenseStatus || "pending",
    paymentStatus: player.paymentStatus || "pending",
    medicalStatus: player.medicalStatus || "",
    email: player.email || "",
    phone: player.phone || "",
    parentName: player.parentName || "",
    parentEmail: player.parentEmail || "",
    parentPhone: player.parentPhone || "",
    notes: player.notes || "",
    status: player.status || "active",
  };
}

function statusLabel(value: string) {
  if (["valid", "paid", "ok"].includes(value)) return "OK";
  if (value === "pending") return "En attente";
  if (value === "late") return "Retard";
  if (value === "missing") return "Manquant";
  if (value === "archived") return "Archivé";
  return value || "—";
}

export default function ClubTeamsSection({
  clubId,
  initialTeamId,
  onBack,
}: {
  clubId: string;
  initialTeamId?: string;
  onBack?: () => void;
}) {
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [coaches, setCoaches] = useState<ClubCoach[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState<string>(initialTeamId || "");
  const [teamForm, setTeamForm] = useState<TeamForm | null>(null);
  const [playerForm, setPlayerForm] = useState<PlayerForm | null>(null);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setError("");

    try {
      const [teamRows, playerRows, coachRows] = await Promise.all([
        listClubTeams(clubId),
        listClubPlayers(clubId),
        listClubCoaches(clubId),
      ]);

      setTeams(teamRows);
      setPlayers(playerRows);
      setCoaches(coachRows);

      if (initialTeamId && teamRows.some((team) => team.id === initialTeamId)) {
        setSelectedTeamId(initialTeamId);
      } else if (!selectedTeamId && teamRows[0]) {
        setSelectedTeamId(teamRows[0].id);
      } else if (selectedTeamId && !teamRows.some((team) => team.id === selectedTeamId)) {
        setSelectedTeamId(teamRows[0]?.id || "");
      }
    } catch (e: any) {
      setError(e?.message || "Chargement impossible.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, initialTeamId]);

  const filteredTeams = useMemo(() => {
    const q = query.trim().toLowerCase();

    return teams.filter((team) => {
      const byQuery = !q || `${team.name} ${team.category} ${team.level}`.toLowerCase().includes(q);
      const byCategory = !category || team.category === category;
      return byQuery && byCategory;
    });
  }, [teams, query, category]);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || null;
  const selectedPlayers = players.filter((player) => player.teamId === selectedTeamId);

  function teamCoach(team: ClubTeam) {
    return coaches.find((coach) => coach.userId === team.coachId || coach.id === team.coachId) || null;
  }

  async function saveTeam() {
    if (!teamForm) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const payload: Partial<ClubTeam> = {
        name: `${teamForm.category} Équipe ${teamForm.teamNumber || "1"}`,
        teamNumber: Number(teamForm.teamNumber || "1"),
        category: teamForm.category,
        gender: teamForm.gender,
        level: teamForm.level,
        season: teamForm.season,
        status: teamForm.status,
        coachId: teamForm.coachId || null,
        assistantId: teamForm.assistantId || null,
        notes: teamForm.notes,
      };

      const saved = teamForm.id
        ? await updateClubTeam(teamForm.id, payload)
        : await createClubTeam(clubId, payload);

      setSelectedTeamId(saved.id);
      setTeamForm(null);
      setMessage("Équipe enregistrée.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Équipe non enregistrée.");
    } finally {
      setSaving(false);
    }
  }

  async function removeTeam(team: ClubTeam) {
    if (!confirm(`Supprimer l’équipe "${team.name}" ? Les joueurs seront détachés mais pas supprimés.`)) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await deleteEntity({ clubId, entityType: "team", id: team.id });
      setMessage("Équipe supprimée.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Suppression impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function savePlayer() {
    if (!playerForm) return;

    if (!playerForm.firstName.trim() || !playerForm.lastName.trim()) {
      setError("Nom et prénom du joueur obligatoires.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const payload: Partial<ClubPlayer> = {
        teamId: playerForm.teamId || null,
        firstName: playerForm.firstName,
        lastName: playerForm.lastName,
        birthdate: playerForm.birthdate || null,
        category: playerForm.category,
        gender: playerForm.gender,
        licenseNumber: playerForm.licenseNumber || null,
        licenseStatus: playerForm.licenseStatus,
        paymentStatus: playerForm.paymentStatus,
        medicalStatus: playerForm.medicalStatus || null,
        email: playerForm.email || null,
        phone: playerForm.phone || null,
        parentName: playerForm.parentName || null,
        parentEmail: playerForm.parentEmail || null,
        parentPhone: playerForm.parentPhone || null,
        notes: playerForm.notes,
        status: playerForm.status,
      };

      const saved = playerForm.id
        ? await updateClubPlayer(playerForm.id, payload)
        : await createClubPlayer(clubId, payload);

      setSelectedTeamId(saved.teamId || selectedTeamId);
      setPlayerForm(null);
      setMessage("Joueur enregistré.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Joueur non enregistré.");
    } finally {
      setSaving(false);
    }
  }

  async function removePlayer(player: ClubPlayer) {
    if (!confirm(`Supprimer ${player.firstName} ${player.lastName} ?`)) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await deleteEntity({ clubId, entityType: "player", id: player.id });
      setMessage("Joueur supprimé.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Suppression impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="clubTeams">
      <div className="teamsTop">
        <div>
          <p>MES ÉQUIPES</p>
          <h2>Gestion sportive par équipe</h2>
          <span>Ouvre une équipe, modifie son staff, gère son effectif et ses informations.</span>
        </div>

        <div className="topActions">
          {onBack && <button className="ghost" onClick={onBack}>← Retour</button>}
          <button onClick={() => setTeamForm(emptyTeam())}>+ Équipe</button>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="tools">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher une équipe..." />
        <select value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">Toutes catégories</option>
          {CATEGORIES.map((cat) => <option key={cat} value={cat}>{cat}</option>)}
        </select>
      </div>

      <div className="layout">
        <div className="teamList">
          {filteredTeams.map((team) => {
            const coach = teamCoach(team);
            const count = team.playersCount ?? players.filter((p) => p.teamId === team.id).length;

            return (
              <button
                key={team.id}
                className={`teamCard ${selectedTeamId === team.id ? "active" : ""}`}
                onClick={() => setSelectedTeamId(team.id)}
                onDoubleClick={() => setTeamForm(teamToForm(team))}
              >
                <div className="teamCardHead">
                  <strong>{team.name}</strong>
                  <span>{team.category} · {team.gender} · {team.level || "Niveau à définir"}</span>
                </div>

                <div className="miniKpis">
                  <b>{count}<small>joueurs</small></b>
                  <b>{team.licenseRate ?? 0}%<small>licences</small></b>
                  <b>{team.paymentRate ?? 0}%<small>cotisations</small></b>
                </div>

                <small>Coach : {coach?.name || "Non affilié"}</small>
              </button>
            );
          })}

          {!filteredTeams.length && (
            <div className="emptySmall">Aucune équipe. Clique sur + Équipe.</div>
          )}
        </div>

        <div className="teamDetail">
          {selectedTeam ? (
            <div className="teamMiniPage">
              <div className="miniHeader">
                <div>
                  <p>FICHE ÉQUIPE</p>
                  <h3>{selectedTeam.name}</h3>
                  <span>{selectedTeam.category} · {selectedTeam.gender} · {selectedTeam.season}</span>
                </div>

                <div className="topActions">
                  <button className="ghost" onClick={() => setTeamForm(teamToForm(selectedTeam))}>Modifier</button>
                  <button className="danger" onClick={() => removeTeam(selectedTeam)}>Supprimer</button>
                </div>
              </div>

              <div className="bigKpis">
                <b>{selectedPlayers.length}<small>Effectif</small></b>
                <b>{selectedTeam.licenseRate ?? 0}%<small>Licences</small></b>
                <b>{selectedTeam.paymentRate ?? 0}%<small>Cotisations</small></b>
                <b>{selectedTeam.attendanceRate ?? 0}%<small>Présence</small></b>
              </div>

              <div className="infoGrid">
                <article>
                  <span>Coach principal</span>
                  <strong>{teamCoach(selectedTeam)?.name || "Non affilié"}</strong>
                </article>
                <article>
                  <span>Niveau</span>
                  <strong>{selectedTeam.level || "—"}</strong>
                </article>
                <article>
                  <span>Notes</span>
                  <strong>{selectedTeam.notes || "Aucune note"}</strong>
                </article>
              </div>

              <div className="subTabs">
                <button className="active">Effectif</button>
                <button>Stats</button>
                <button>Calendrier</button>
                <button>Documents</button>
                <button>GamePlan</button>
              </div>

              <div className="rosterTop">
                <h4>Effectif</h4>
                <button onClick={() => setPlayerForm(emptyPlayer(selectedTeam))}>+ Joueur</button>
              </div>

              <div className="roster">
                <div className="row head">
                  <span>Joueur</span><span>Licence</span><span>Paiement</span><span>Médical</span><span>Actions</span>
                </div>

                {selectedPlayers.map((player) => (
                  <div className="row" key={player.id}>
                    <span>{player.lastName} {player.firstName}</span>
                    <span>{statusLabel(player.licenseStatus)}</span>
                    <span>{statusLabel(player.paymentStatus)}</span>
                    <span>{player.medicalStatus || "—"}</span>
                    <span className="rowActions">
                      <button className="ghost small" onClick={() => setPlayerForm(playerToForm(player))}>Modifier</button>
                      <button className="danger small" onClick={() => removePlayer(player)}>Supprimer</button>
                    </span>
                  </div>
                ))}

                {!selectedPlayers.length && <div className="empty">Aucun joueur dans cette équipe.</div>}
              </div>
            </div>
          ) : (
            <div className="empty">Sélectionne une équipe ou crée la première.</div>
          )}
        </div>
      </div>

      {teamForm && (
        <div className="modalLayer" onClick={() => setTeamForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{teamForm.id ? "Modifier l’équipe" : "Créer une équipe"}</h3>

            <div className="formGrid">
              <label>Catégorie<select value={teamForm.category} onChange={(e) => setTeamForm({ ...teamForm, category: e.target.value })}>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label>Équipe<select value={teamForm.teamNumber} onChange={(e) => setTeamForm({ ...teamForm, teamNumber: e.target.value })}>{["1","2","3","4","5"].map((x) => <option key={x} value={x}>Équipe {x}</option>)}</select></label>
              <label>Genre<select value={teamForm.gender} onChange={(e) => setTeamForm({ ...teamForm, gender: e.target.value })}>{GENDERS.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label>Niveau<select value={teamForm.level} onChange={(e) => setTeamForm({ ...teamForm, level: e.target.value })}>{LEVELS.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label>Saison<input value={teamForm.season} onChange={(e) => setTeamForm({ ...teamForm, season: e.target.value })} /></label>
              <label>Coach principal
                <select value={teamForm.coachId} onChange={(e) => setTeamForm({ ...teamForm, coachId: e.target.value })}>
                  <option value="">Non affilié</option>
                  {coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}
                </select>
              </label>
              <label>Assistant
                <select value={teamForm.assistantId} onChange={(e) => setTeamForm({ ...teamForm, assistantId: e.target.value })}>
                  <option value="">Non affilié</option>
                  {coaches.map((coach) => <option key={coach.id} value={coach.id}>{coach.name}</option>)}
                </select>
              </label>
              <label>Statut
                <select value={teamForm.status} onChange={(e) => setTeamForm({ ...teamForm, status: e.target.value })}>
                  <option value="active">Active</option>
                  <option value="archived">Archivée</option>
                </select>
              </label>
              <label className="full">Notes<textarea value={teamForm.notes} onChange={(e) => setTeamForm({ ...teamForm, notes: e.target.value })} /></label>
            </div>

            <div className="modalActions">
              <button className="ghost" onClick={() => setTeamForm(null)}>Annuler</button>
              <button disabled={saving} onClick={saveTeam}>{saving ? "Enregistrement..." : "Enregistrer"}</button>
            </div>
          </div>
        </div>
      )}

      {playerForm && (
        <div className="modalLayer" onClick={() => setPlayerForm(null)}>
          <div className="modal large" onClick={(e) => e.stopPropagation()}>
            <h3>{playerForm.id ? "Modifier le joueur" : "Ajouter un joueur"}</h3>

            <div className="formGrid">
              <label>Prénom<input value={playerForm.firstName} onChange={(e) => setPlayerForm({ ...playerForm, firstName: e.target.value })} /></label>
              <label>Nom<input value={playerForm.lastName} onChange={(e) => setPlayerForm({ ...playerForm, lastName: e.target.value })} /></label>
              <label>Date naissance<input type="date" value={playerForm.birthdate} onChange={(e) => setPlayerForm({ ...playerForm, birthdate: e.target.value })} /></label>
              <label>Équipe
                <select value={playerForm.teamId} onChange={(e) => setPlayerForm({ ...playerForm, teamId: e.target.value })}>
                  <option value="">Sans équipe</option>
                  {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </label>
              <label>Catégorie<select value={playerForm.category} onChange={(e) => setPlayerForm({ ...playerForm, category: e.target.value })}>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label>Genre<select value={playerForm.gender} onChange={(e) => setPlayerForm({ ...playerForm, gender: e.target.value })}>{GENDERS.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label>N° licence<input value={playerForm.licenseNumber} onChange={(e) => setPlayerForm({ ...playerForm, licenseNumber: e.target.value })} /></label>
              <label>Licence<select value={playerForm.licenseStatus} onChange={(e) => setPlayerForm({ ...playerForm, licenseStatus: e.target.value })}><option value="pending">En attente</option><option value="valid">Validée</option><option value="missing">Manquante</option></select></label>
              <label>Paiement<select value={playerForm.paymentStatus} onChange={(e) => setPlayerForm({ ...playerForm, paymentStatus: e.target.value })}><option value="pending">En attente</option><option value="paid">Payé</option><option value="late">Retard</option></select></label>
              <label>Email joueur<input value={playerForm.email} onChange={(e) => setPlayerForm({ ...playerForm, email: e.target.value })} /></label>
              <label>Téléphone joueur<input value={playerForm.phone} onChange={(e) => setPlayerForm({ ...playerForm, phone: e.target.value })} /></label>
              <label>Parent<input value={playerForm.parentName} onChange={(e) => setPlayerForm({ ...playerForm, parentName: e.target.value })} /></label>
              <label>Email parent<input value={playerForm.parentEmail} onChange={(e) => setPlayerForm({ ...playerForm, parentEmail: e.target.value })} /></label>
              <label>Téléphone parent<input value={playerForm.parentPhone} onChange={(e) => setPlayerForm({ ...playerForm, parentPhone: e.target.value })} /></label>
              <label>Médical<input value={playerForm.medicalStatus} onChange={(e) => setPlayerForm({ ...playerForm, medicalStatus: e.target.value })} /></label>
              <label className="full">Notes<textarea value={playerForm.notes} onChange={(e) => setPlayerForm({ ...playerForm, notes: e.target.value })} /></label>
            </div>

            <div className="modalActions">
              <button className="ghost" onClick={() => setPlayerForm(null)}>Annuler</button>
              <button disabled={saving} onClick={savePlayer}>{saving ? "Enregistrement..." : "Enregistrer"}</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .clubTeams{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .teamsTop{display:flex;justify-content:space-between;align-items:center;gap:20px;padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}
        .teamsTop p,.miniHeader p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}
        .teamsTop h2,.miniHeader h3{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}
        .teamsTop span,.miniHeader span{color:#6b7280;font-weight:700}
        button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}
        button.ghost{background:#fffaf2;color:#6b1a2c}.danger{background:#fff0f0;color:#b91c1c;border-color:#f1d3cf}.small{padding:7px 9px;font-size:.75rem}.topActions,.rowActions{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;font-weight:900}.alert.error{background:#fff0f0;color:#b91c1c}.alert.ok{background:#f0fff4;color:#15803d}
        .tools{display:flex;gap:10px;padding:14px 18px;border-bottom:1px solid #eef2f7;background:#fcfcfd}.tools input,.tools select,input,select,textarea{border:1px solid #e5e7eb;border-radius:14px;padding:11px 12px;font:inherit}textarea{min-height:90px;resize:vertical}
        .layout{display:grid;grid-template-columns:360px 1fr;min-height:620px}.teamList{border-right:1px solid #eef2f7;padding:16px;display:grid;gap:12px;align-content:start;background:#fffdf8}
        .teamCard{display:block;width:100%;text-align:left;background:#fff;color:#111827;border-radius:20px;padding:16px}.teamCard.active{border-color:#6b1a2c;box-shadow:0 0 0 3px rgba(107,26,44,.12)}
        .teamCard strong{display:block;color:#6b1a2c;font-size:1.05rem}.teamCard span,.teamCard small{color:#6b7280;font-weight:800}.miniKpis,.bigKpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin:14px 0}.bigKpis{grid-template-columns:repeat(4,1fr)}
        .miniKpis b,.bigKpis b{background:#fff8ee;border:1px solid #eadfd5;border-radius:16px;padding:10px;text-align:center;color:#6b1a2c}.miniKpis small,.bigKpis small{display:block;color:#6b7280;font-size:.68rem}
        .teamDetail{padding:18px;display:grid;gap:18px}.teamMiniPage{border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}
        .miniHeader{display:flex;justify-content:space-between;gap:14px;align-items:center}.infoGrid{display:grid;grid-template-columns:1fr 1fr 1.4fr;gap:10px}.infoGrid article{border:1px solid #eef2f7;border-radius:18px;padding:12px}.infoGrid span{display:block;color:#6b7280;font-weight:900;font-size:.75rem}.infoGrid strong{color:#111827}
        .subTabs{display:flex;gap:8px;flex-wrap:wrap;margin:16px 0}.subTabs button{background:#fffaf2;color:#6b1a2c}.subTabs button.active{background:#6b1a2c;color:white}.rosterTop{display:flex;justify-content:space-between;align-items:center;gap:10px;margin:12px 0}.rosterTop h4{margin:0;color:#6b1a2c}
        .roster{border:1px solid #eef2f7;border-radius:18px;overflow:hidden}.row{display:grid;grid-template-columns:1.5fr 1fr 1fr 1fr 1.2fr;border-bottom:1px solid #eef2f7}.row span{padding:12px;font-weight:800}.row.head{background:#f8fafc;color:#6b7280}.empty,.emptySmall{padding:18px;color:#6b7280;font-weight:800}.emptySmall{border:1px dashed #eadfd5;border-radius:18px}
        .modalLayer{position:fixed;inset:0;background:rgba(17,24,39,.55);z-index:1000;display:grid;place-items:center;padding:20px}.modal{width:min(820px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:28px;padding:22px;box-shadow:0 30px 90px rgba(0,0,0,.22)}.modal.large{width:min(980px,96vw)}.modal h3{margin:0 0 16px;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.formGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}.formGrid label{display:flex;flex-direction:column;gap:6px;font-size:.78rem;font-weight:900;color:#6b7280}.formGrid .full{grid-column:1/-1}.modalActions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}
        @media(max-width:980px){.layout{grid-template-columns:1fr}.teamList{border-right:0;border-bottom:1px solid #eef2f7}.formGrid,.bigKpis,.infoGrid{grid-template-columns:1fr}.row{grid-template-columns:1fr}.row.head{display:none}.miniHeader{display:grid}}
      `}</style>
    </section>
  );
}
