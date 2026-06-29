"use client";

// components/club/ClubTeamsActiveSection.tsx
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

const CATEGORIES = ["U7", "U9", "U11", "U13", "U15", "U18", "U21", "Seniors", "Anciens", "Basket École", "Autre"];
const GENDERS = ["Mixte", "M", "F"];
const LEVELS = ["Départemental", "Régional", "National", "Loisirs", "3x3", "École de basket", "Autre"];

type TeamForm = {
  id?: string;
  name: string;
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

function emptyTeam(season = "2026-2027"): TeamForm {
  return {
    name: "",
    category: "U15",
    gender: "Mixte",
    level: "",
    season,
    coachId: "",
    assistantId: "",
    notes: "",
    status: "active",
  };
}

function emptyPlayer(team?: ClubTeam | null): PlayerForm {
  return {
    teamId: team?.id || "",
    firstName: "",
    lastName: "",
    category: team?.category || "",
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

function teamToForm(team: ClubTeam): TeamForm {
  return {
    id: team.id,
    name: team.name,
    category: team.category,
    gender: team.gender,
    level: team.level,
    season: team.season || "2026-2027",
    coachId: team.coachId || "",
    assistantId: team.assistantId || "",
    notes: team.notes || "",
    status: team.status || "active",
  };
}

function playerToForm(player: ClubPlayer): PlayerForm {
  return {
    id: player.id,
    teamId: player.teamId || "",
    firstName: player.firstName || "",
    lastName: player.lastName || "",
    category: player.category || "",
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
  if (value === "valid" || value === "paid" || value === "ok") return "OK";
  if (value === "pending") return "En attente";
  if (value === "late") return "Retard";
  if (value === "missing") return "Manquant";
  return value || "—";
}

export default function ClubTeamsActiveSection({ clubId }: { clubId: string }) {
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [coaches, setCoaches] = useState<ClubCoach[]>([]);
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [query, setQuery] = useState("");
  const [teamForm, setTeamForm] = useState<TeamForm | null>(null);
  const [playerForm, setPlayerForm] = useState<PlayerForm | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function load() {
    setBusy(true);
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
      if (!selectedTeamId && teamRows[0]) setSelectedTeamId(teamRows[0].id);
      if (selectedTeamId && !teamRows.some((team) => team.id === selectedTeamId)) {
        setSelectedTeamId(teamRows[0]?.id || "");
      }
    } catch (e: any) {
      setError(e?.message || "Impossible de charger les équipes.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const selectedTeam = teams.find((team) => team.id === selectedTeamId) || teams[0] || null;

  const filteredTeams = useMemo(() => {
    const q = query.trim().toLowerCase();
    return teams.filter((team) => {
      if (!q) return true;
      return `${team.name} ${team.category} ${team.gender} ${team.level}`.toLowerCase().includes(q);
    });
  }, [teams, query]);

  const teamPlayers = useMemo(() => {
    if (!selectedTeam) return [];
    return players.filter((player) => player.teamId === selectedTeam.id);
  }, [players, selectedTeam]);

  function coachName(id?: string | null) {
    if (!id) return "Non affecté";
    return coaches.find((coach) => coach.id === id)?.name || "Coach introuvable";
  }

  async function saveTeam() {
    if (!teamForm) return;
    if (!teamForm.name.trim()) {
      setError("Nom d'équipe obligatoire.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const payload: Partial<ClubTeam> = {
        name: teamForm.name,
        category: teamForm.category,
        gender: teamForm.gender,
        level: teamForm.level,
        season: teamForm.season,
        coachId: teamForm.coachId || null,
        assistantId: teamForm.assistantId || null,
        notes: teamForm.notes,
        status: teamForm.status,
      };

      const saved = teamForm.id
        ? await updateClubTeam(teamForm.id, payload)
        : await createClubTeam(clubId, payload);

      setTeamForm(null);
      setSelectedTeamId(saved.id);
      setMessage("Équipe enregistrée.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Équipe non enregistrée.");
    } finally {
      setBusy(false);
    }
  }

  async function savePlayer() {
    if (!playerForm) return;
    if (!playerForm.firstName.trim() || !playerForm.lastName.trim()) {
      setError("Nom et prénom du joueur obligatoires.");
      return;
    }

    setBusy(true);
    setError("");
    setMessage("");

    try {
      const payload: Partial<ClubPlayer> = {
        teamId: playerForm.teamId || null,
        firstName: playerForm.firstName,
        lastName: playerForm.lastName,
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

      setPlayerForm(null);
      setSelectedTeamId(saved.teamId || selectedTeamId);
      setMessage("Joueur enregistré.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Joueur non enregistré.");
    } finally {
      setBusy(false);
    }
  }

  async function removeTeam(team: ClubTeam) {
    if (!confirm(`Supprimer l'équipe "${team.name}" ? Les joueurs seront détachés de l'équipe.`)) return;
    setBusy(true);
    try {
      await deleteEntity({ clubId, entityType: "team", id: team.id });
      setMessage("Équipe supprimée.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Suppression impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function removePlayer(player: ClubPlayer) {
    if (!confirm(`Supprimer ${player.firstName} ${player.lastName} ?`)) return;
    setBusy(true);
    try {
      await deleteEntity({ clubId, entityType: "player", id: player.id });
      setMessage("Joueur supprimé.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Suppression impossible.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="teamsActive">
      <header className="top">
        <div>
          <p>ÉQUIPES</p>
          <h2>Gestion active des équipes</h2>
          <span>Ouvre une fiche équipe, modifie l’effectif, affecte un coach et supprime proprement.</span>
        </div>
        <button onClick={() => setTeamForm(emptyTeam())}>+ Équipe</button>
      </header>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="layout">
        <aside className="side">
          <div className="search">
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Rechercher équipe..." />
          </div>

          <div className="teamList">
            {filteredTeams.map((team) => (
              <button
                type="button"
                key={team.id}
                className={selectedTeam?.id === team.id ? "teamMini active" : "teamMini"}
                onClick={() => setSelectedTeamId(team.id)}
              >
                <strong>{team.name}</strong>
                <span>{team.category} · {team.gender} · {team.playersCount ?? players.filter((p) => p.teamId === team.id).length} joueurs</span>
              </button>
            ))}
          </div>
        </aside>

        <main className="main">
          {!selectedTeam ? (
            <div className="empty">
              <strong>Aucune équipe</strong>
              <button onClick={() => setTeamForm(emptyTeam())}>Créer la première équipe</button>
            </div>
          ) : (
            <>
              <section className="teamHero">
                <div>
                  <p>FICHE ÉQUIPE</p>
                  <h3>{selectedTeam.name}</h3>
                  <span>{selectedTeam.category} · {selectedTeam.gender} · {selectedTeam.level || "Niveau non renseigné"}</span>
                </div>

                <div className="heroActions">
                  <button className="ghost" onClick={() => setTeamForm(teamToForm(selectedTeam))}>Modifier</button>
                  <button className="danger" onClick={() => removeTeam(selectedTeam)}>Supprimer</button>
                </div>
              </section>

              <section className="kpis">
                <b>{teamPlayers.length}<small>joueurs</small></b>
                <b>{selectedTeam.licenseRate ?? 0}%<small>licences</small></b>
                <b>{selectedTeam.paymentRate ?? 0}%<small>paiements</small></b>
                <b>{selectedTeam.sessionsCount ?? 0}<small>séances</small></b>
                <b>{selectedTeam.matchesCount ?? 0}<small>matchs</small></b>
              </section>

              <section className="grid2">
                <article className="panel">
                  <h4>Staff</h4>
                  <div className="line"><span>Coach principal</span><b>{coachName(selectedTeam.coachId)}</b></div>
                  <div className="line"><span>Assistant</span><b>{coachName(selectedTeam.assistantId)}</b></div>
                  <div className="line"><span>Saison</span><b>{selectedTeam.season || "—"}</b></div>
                  <p>{selectedTeam.notes || "Aucune note."}</p>
                </article>

                <article className="panel">
                  <h4>Actions rapides</h4>
                  <div className="quick">
                    <button onClick={() => setPlayerForm(emptyPlayer(selectedTeam))}>+ Ajouter joueur</button>
                    <button className="ghost" onClick={() => setTeamForm(teamToForm(selectedTeam))}>Modifier fiche</button>
                  </div>
                </article>
              </section>

              <section className="panel">
                <div className="panelHead">
                  <h4>Effectif</h4>
                  <button onClick={() => setPlayerForm(emptyPlayer(selectedTeam))}>+ Joueur</button>
                </div>

                <div className="players">
                  {teamPlayers.map((player) => (
                    <article className="playerCard" key={player.id} onDoubleClick={() => setPlayerForm(playerToForm(player))}>
                      <div className="avatar">{player.firstName.slice(0, 1)}{player.lastName.slice(0, 1)}</div>
                      <div>
                        <strong>{player.lastName} {player.firstName}</strong>
                        <span>{player.category} · Licence {statusLabel(player.licenseStatus)} · Paiement {statusLabel(player.paymentStatus)}</span>
                      </div>
                      <div className="cardActions">
                        <button className="ghost" onClick={() => setPlayerForm(playerToForm(player))}>Modifier</button>
                        <button className="danger" onClick={() => removePlayer(player)}>Supprimer</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
        </main>
      </div>

      {teamForm && (
        <div className="modalLayer" onClick={() => setTeamForm(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h3>{teamForm.id ? "Modifier l'équipe" : "Créer une équipe"}</h3>

            <div className="formGrid">
              <label>Nom<input value={teamForm.name} onChange={(e) => setTeamForm({ ...teamForm, name: e.target.value })} /></label>
              <label>Catégorie<select value={teamForm.category} onChange={(e) => setTeamForm({ ...teamForm, category: e.target.value })}>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label>Sexe<select value={teamForm.gender} onChange={(e) => setTeamForm({ ...teamForm, gender: e.target.value })}>{GENDERS.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label>Niveau<select value={teamForm.level} onChange={(e) => setTeamForm({ ...teamForm, level: e.target.value })}><option value="">—</option>{LEVELS.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label>Saison<input value={teamForm.season} onChange={(e) => setTeamForm({ ...teamForm, season: e.target.value })} /></label>
              <label>Coach principal<select value={teamForm.coachId} onChange={(e) => setTeamForm({ ...teamForm, coachId: e.target.value })}><option value="">Non affecté</option>{coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label>Assistant<select value={teamForm.assistantId} onChange={(e) => setTeamForm({ ...teamForm, assistantId: e.target.value })}><option value="">Non affecté</option>{coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label>Statut<select value={teamForm.status} onChange={(e) => setTeamForm({ ...teamForm, status: e.target.value })}><option value="active">Active</option><option value="archived">Archivée</option></select></label>
              <label className="full">Notes<textarea value={teamForm.notes} onChange={(e) => setTeamForm({ ...teamForm, notes: e.target.value })} /></label>
            </div>

            <div className="modalActions">
              <button className="ghost" onClick={() => setTeamForm(null)}>Annuler</button>
              <button disabled={busy} onClick={saveTeam}>Enregistrer</button>
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
              <label>Équipe<select value={playerForm.teamId} onChange={(e) => setPlayerForm({ ...playerForm, teamId: e.target.value })}><option value="">Sans équipe</option>{teams.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
              <label>Catégorie<select value={playerForm.category} onChange={(e) => setPlayerForm({ ...playerForm, category: e.target.value })}>{CATEGORIES.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label>Sexe<select value={playerForm.gender} onChange={(e) => setPlayerForm({ ...playerForm, gender: e.target.value })}>{GENDERS.map((x) => <option key={x}>{x}</option>)}</select></label>
              <label>N° licence<input value={playerForm.licenseNumber} onChange={(e) => setPlayerForm({ ...playerForm, licenseNumber: e.target.value })} /></label>
              <label>Licence<select value={playerForm.licenseStatus} onChange={(e) => setPlayerForm({ ...playerForm, licenseStatus: e.target.value })}><option value="pending">En attente</option><option value="valid">Validée</option><option value="missing">Manquante</option></select></label>
              <label>Paiement<select value={playerForm.paymentStatus} onChange={(e) => setPlayerForm({ ...playerForm, paymentStatus: e.target.value })}><option value="pending">En attente</option><option value="paid">Payé</option><option value="late">Retard</option></select></label>
              <label>Email<input value={playerForm.email} onChange={(e) => setPlayerForm({ ...playerForm, email: e.target.value })} /></label>
              <label>Téléphone<input value={playerForm.phone} onChange={(e) => setPlayerForm({ ...playerForm, phone: e.target.value })} /></label>
              <label>Parent<input value={playerForm.parentName} onChange={(e) => setPlayerForm({ ...playerForm, parentName: e.target.value })} /></label>
              <label>Email parent<input value={playerForm.parentEmail} onChange={(e) => setPlayerForm({ ...playerForm, parentEmail: e.target.value })} /></label>
              <label className="full">Médical<input value={playerForm.medicalStatus} onChange={(e) => setPlayerForm({ ...playerForm, medicalStatus: e.target.value })} /></label>
              <label className="full">Notes<textarea value={playerForm.notes} onChange={(e) => setPlayerForm({ ...playerForm, notes: e.target.value })} /></label>
            </div>

            <div className="modalActions">
              <button className="ghost" onClick={() => setPlayerForm(null)}>Annuler</button>
              <button disabled={busy} onClick={savePlayer}>Enregistrer</button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .teamsActive{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}.top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span{color:#6b7280;font-weight:700}
        button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}.ghost{background:#fffaf2;color:#6b1a2c}.danger{background:#fff0f0;color:#b91c1c;border-color:#f1d3cf}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;font-weight:900}.alert.error{background:#fff0f0;color:#b91c1c}.alert.ok{background:#f0fff4;color:#15803d}
        .layout{display:grid;grid-template-columns:310px 1fr;min-height:720px}.side{border-right:1px solid #eef2f7;background:#fffdf8;padding:16px}.search input{width:100%;border:1px solid #eadfd5;border-radius:16px;padding:12px;font:inherit}.teamList{display:grid;gap:10px;margin-top:14px}.teamMini{text-align:left;background:#fff;color:#111827;border-radius:18px;display:grid;gap:4px}.teamMini.active{background:#6b1a2c;color:white}.teamMini span{font-size:.78rem;color:inherit;opacity:.78}
        .main{padding:18px;display:grid;gap:18px;align-content:start}.empty{border:1px dashed #eadfd5;border-radius:24px;padding:40px;text-align:center}.teamHero{display:flex;justify-content:space-between;gap:18px;border-radius:28px;background:linear-gradient(135deg,#6b1a2c,#35101a);color:white;padding:24px}.teamHero p{margin:0;color:#d4a24c;font-weight:900;letter-spacing:.12em}.teamHero h3{margin:6px 0;font-family:"Alfa Slab One",serif;font-size:2rem;font-weight:400}.teamHero span{font-weight:800;color:#f8e8c8}.heroActions{display:flex;gap:8px;align-items:flex-start}
        .kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:10px}.kpis b{border:1px solid #eadfd5;border-radius:18px;background:#fff8ee;padding:14px;text-align:center;color:#6b1a2c;font-size:1.3rem}.kpis small{display:block;color:#6b7280;font-size:.72rem}
        .grid2{display:grid;grid-template-columns:1fr 1fr;gap:18px}.panel{border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}.panel h4{margin:0 0 14px;color:#6b1a2c}.line{display:flex;justify-content:space-between;border-bottom:1px solid #eef2f7;padding:10px 0;gap:10px}.line span,.panel p{color:#6b7280;font-weight:800}.line b{color:#111827}.quick{display:flex;gap:10px;flex-wrap:wrap}.panelHead{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:12px}.panelHead h4{margin:0}
        .players{display:grid;gap:10px}.playerCard{display:grid;grid-template-columns:52px 1fr auto;gap:12px;align-items:center;border:1px solid #eef2f7;border-radius:18px;padding:12px}.avatar{width:46px;height:46px;border-radius:16px;background:#6b1a2c;color:white;display:grid;place-items:center;font-weight:900}.playerCard strong{color:#6b1a2c}.playerCard span{display:block;color:#6b7280;font-weight:800;font-size:.8rem}.cardActions{display:flex;gap:8px;flex-wrap:wrap}
        .modalLayer{position:fixed;inset:0;background:rgba(17,24,39,.55);z-index:1000;display:grid;place-items:center;padding:20px}.modal{width:min(760px,96vw);max-height:92vh;overflow:auto;background:#fff;border-radius:28px;padding:22px;box-shadow:0 30px 90px rgba(0,0,0,.22)}.modal.large{width:min(920px,96vw)}.modal h3{margin:0 0 16px;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.formGrid{display:grid;grid-template-columns:repeat(2,1fr);gap:12px}label{display:grid;gap:6px;color:#6b7280;font-weight:900;font-size:.78rem}.full{grid-column:1/-1}input,select,textarea{border:1px solid #e5e7eb;border-radius:14px;padding:11px 12px;font:inherit}textarea{min-height:100px;resize:vertical}.modalActions{display:flex;justify-content:flex-end;gap:10px;margin-top:16px}
        @media(max-width:1000px){.layout,.grid2,.kpis,.playerCard,.formGrid{grid-template-columns:1fr}.side{border-right:0;border-bottom:1px solid #eef2f7}.teamHero{display:grid}.heroActions{justify-content:flex-start}}
      `}</style>
    </section>
  );
}
