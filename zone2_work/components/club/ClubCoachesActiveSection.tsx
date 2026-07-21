"use client";

// components/club/ClubCoachesActiveSection.tsx
import { useEffect, useMemo, useState } from "react";
import {
  type ClubCoach,
  type ClubPlayer,
  type ClubTeam,
  listClubCoaches,
  listClubPlayers,
  listClubTeams,
  updateClubTeam,
} from "@/lib/club-core";
import ClubTeamsActiveSection from "@/components/club/ClubTeamsActiveSection";
import { deleteEntity } from "@/lib/club-crud-actions";

export default function ClubCoachesActiveSection({
  clubId,
  clubName,
}: {
  clubId: string;
  clubName?: string;
}) {
  const [coaches, setCoaches] = useState<ClubCoach[]>([]);
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [selectedCoachId, setSelectedCoachId] = useState("");
  const [openedTeamId, setOpenedTeamId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    setBusy(true);
    setError("");
    try {
      const [coachRows, teamRows, playerRows] = await Promise.all([
        listClubCoaches(clubId),
        listClubTeams(clubId),
        listClubPlayers(clubId),
      ]);
      setCoaches(coachRows);
      setTeams(teamRows);
      setPlayers(playerRows);
      if (!selectedCoachId && coachRows[0]) setSelectedCoachId(coachRows[0].id);
    } catch (e: any) {
      setError(e?.message || "Impossible de charger les coachs.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  const selectedCoach = coaches.find((coach) => coach.id === selectedCoachId) || coaches[0] || null;

  const coachTeams = useMemo(() => {
    if (!selectedCoach) return [];
    return teams.filter((team) => {
      return (
        team.coachId === selectedCoach.id ||
        team.assistantId === selectedCoach.id ||
        selectedCoach.teamIds.includes(team.id)
      );
    });
  }, [teams, selectedCoach]);

  async function assignTeam(teamId: string) {
    if (!selectedCoach) return;
    setBusy(true);
    setError("");
    try {
      await updateClubTeam(teamId, { coachId: selectedCoach.id });
      setMessage("Équipe affectée au coach.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Affectation impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function unassignTeam(team: ClubTeam) {
    if (!selectedCoach) return;
    if (!confirm(`Retirer ${team.name} de ${selectedCoach.name} ?`)) return;

    setBusy(true);
    setError("");
    try {
      const patch: Partial<ClubTeam> = {};
      if (team.coachId === selectedCoach.id) patch.coachId = null;
      if (team.assistantId === selectedCoach.id) patch.assistantId = null;
      await updateClubTeam(team.id, patch);
      setMessage("Équipe retirée.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Retrait impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function removeCoach(coach: ClubCoach) {
    if (!confirm(`Supprimer le coach ${coach.name} ?`)) return;
    setBusy(true);
    setError("");
    try {
      await deleteEntity({ clubId, entityType: "coach", id: coach.id });
      setMessage("Coach supprimé.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Suppression impossible.");
    } finally {
      setBusy(false);
    }
  }

  if (openedTeamId) {
    return (
      <section className="coachTeamOpen">
        <div className="returnBar">
          <button onClick={() => setOpenedTeamId("")}>← Retour coachs</button>
          <strong>Fiche équipe ouverte depuis un coach</strong>
        </div>
        <ClubTeamsActiveSection clubId={clubId} />
        <style jsx>{`
          .coachTeamOpen{display:grid;gap:14px}
          .returnBar{border:1px solid #eadfd5;border-radius:20px;background:#fff;padding:14px;display:flex;align-items:center;gap:12px}
          button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}
          strong{color:#6b1a2c}
        `}</style>
      </section>
    );
  }

  return (
    <section className="coachesActive">
      <header className="top">
        <div>
          <p>COACHS</p>
          <h2>Staff actif</h2>
          <span>Ouvre les équipes d’un coach, affecte ou retire une équipe, supprime si besoin.</span>
        </div>
        <button onClick={load}>Actualiser</button>
      </header>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="layout">
        <aside className="coachList">
          {coaches.map((coach) => (
            <button
              key={coach.id}
              className={selectedCoach?.id === coach.id ? "coachMini active" : "coachMini"}
              onClick={() => setSelectedCoachId(coach.id)}
            >
              <strong>{coach.name}</strong>
              <span>{coach.role} · {coach.email || "email manquant"}</span>
            </button>
          ))}
        </aside>

        <main className="main">
          {!selectedCoach ? (
            <div className="empty">Aucun coach pour le moment.</div>
          ) : (
            <>
              <section className="coachHero">
                <div className="avatar">{selectedCoach.name.slice(0, 2).toUpperCase()}</div>
                <div>
                  <p>{clubName || "Club"}</p>
                  <h3>{selectedCoach.name}</h3>
                  <span>{selectedCoach.email || "Email manquant"} · {selectedCoach.phone || "Téléphone manquant"}</span>
                </div>
                <button className="danger" onClick={() => removeCoach(selectedCoach)}>Supprimer</button>
              </section>

              <section className="kpis">
                <b>{coachTeams.length}<small>équipes</small></b>
                <b>{coachTeams.reduce((sum, team) => sum + players.filter((p) => p.teamId === team.id).length, 0)}<small>joueurs</small></b>
                <b>{coachTeams.reduce((sum, team) => sum + (team.sessionsCount || 0), 0)}<small>séances</small></b>
              </section>

              <section className="panel">
                <div className="panelHead">
                  <h4>Équipes du coach</h4>
                  <select onChange={(e) => e.target.value && assignTeam(e.target.value)} value="">
                    <option value="">+ Affecter une équipe</option>
                    {teams.filter((team) => !coachTeams.some((ct) => ct.id === team.id)).map((team) => (
                      <option key={team.id} value={team.id}>{team.name}</option>
                    ))}
                  </select>
                </div>

                <div className="teamCards">
                  {coachTeams.map((team) => (
                    <article className="teamCard" key={team.id}>
                      <div>
                        <strong>{team.name}</strong>
                        <span>{team.category} · {team.gender} · {players.filter((p) => p.teamId === team.id).length} joueurs</span>
                      </div>
                      <div className="actions">
                        <button onClick={() => setOpenedTeamId(team.id)}>Ouvrir fiche</button>
                        <button className="ghost" onClick={() => unassignTeam(team)}>Retirer</button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </>
          )}
        </main>
      </div>

      <style jsx>{`
        .coachesActive{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}.top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span{color:#6b7280;font-weight:700}
        button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}.ghost{background:#fffaf2;color:#6b1a2c}.danger{background:#fff0f0;color:#b91c1c;border-color:#f1d3cf}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;font-weight:900}.alert.error{background:#fff0f0;color:#b91c1c}.alert.ok{background:#f0fff4;color:#15803d}
        .layout{display:grid;grid-template-columns:310px 1fr;min-height:650px}.coachList{border-right:1px solid #eef2f7;background:#fffdf8;padding:16px;display:grid;gap:10px;align-content:start}.coachMini{text-align:left;background:#fff;color:#111827;border-radius:18px;display:grid;gap:4px}.coachMini.active{background:#6b1a2c;color:white}.coachMini span{font-size:.78rem;color:inherit;opacity:.78}
        .main{padding:18px;display:grid;gap:18px;align-content:start}.empty{border:1px dashed #eadfd5;border-radius:24px;padding:40px;text-align:center}.coachHero{display:grid;grid-template-columns:70px 1fr auto;gap:16px;align-items:center;border-radius:28px;background:linear-gradient(135deg,#6b1a2c,#35101a);color:white;padding:24px}.avatar{width:64px;height:64px;border-radius:22px;background:#d4a24c;color:#35101a;display:grid;place-items:center;font-weight:900}.coachHero p{margin:0;color:#d4a24c;font-weight:900}.coachHero h3{margin:4px 0;font-size:2rem;font-family:"Alfa Slab One",serif;font-weight:400}.coachHero span{color:#f8e8c8;font-weight:800}
        .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}.kpis b{border:1px solid #eadfd5;border-radius:18px;background:#fff8ee;padding:14px;text-align:center;color:#6b1a2c;font-size:1.3rem}.kpis small{display:block;color:#6b7280;font-size:.72rem}.panel{border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}.panelHead{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:14px}.panel h4{margin:0;color:#6b1a2c}select{border:1px solid #e5e7eb;border-radius:14px;padding:11px 12px;font:inherit}
        .teamCards{display:grid;gap:12px}.teamCard{display:flex;justify-content:space-between;gap:14px;align-items:center;border:1px solid #eef2f7;border-radius:18px;padding:14px}.teamCard strong{color:#6b1a2c}.teamCard span{display:block;color:#6b7280;font-weight:800}.actions{display:flex;gap:8px;flex-wrap:wrap}
        @media(max-width:1000px){.layout,.coachHero,.kpis{grid-template-columns:1fr}.coachList{border-right:0;border-bottom:1px solid #eef2f7}.teamCard{display:grid}}
      `}</style>
    </section>
  );
}
