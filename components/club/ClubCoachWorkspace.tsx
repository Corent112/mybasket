"use client";

// components/club/ClubCoachWorkspace.tsx
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
import { updateClubCoach } from "@/lib/club-coaches";
import ClubTeamsSection from "@/components/club/ClubTeamsSection";

export default function ClubCoachWorkspace({
  clubId,
  coachId,
  onBack,
}: {
  clubId: string;
  coachId: string;
  onBack: () => void;
}) {
  const [coaches, setCoaches] = useState<ClubCoach[]>([]);
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [openedTeamId, setOpenedTeamId] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
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
    } catch (e: any) {
      setError(e?.message || "Fiche coach impossible à charger.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, coachId]);

  const coach = coaches.find((item) => item.id === coachId) || null;

  const coachTeams = useMemo(() => {
    if (!coach) return [];

    return teams.filter((team) => {
      return (
        team.coachId === coach.id ||
        team.coachId === coach.userId ||
        team.assistantId === coach.id ||
        team.assistantId === coach.userId ||
        coach.teamIds.includes(team.id)
      );
    });
  }, [coach, teams]);

  const otherTeams = useMemo(() => {
    return teams.filter((team) => !coachTeams.some((item) => item.id === team.id));
  }, [teams, coachTeams]);

  async function assignTeam(teamId: string) {
    if (!coach || !teamId) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const current = coach.teamIds.includes(teamId) ? coach.teamIds : [...coach.teamIds, teamId];

      await Promise.all([
        updateClubCoach(coach.id, { teamIds: current }),
        updateClubTeam(teamId, { coachId: coach.userId || coach.id }),
      ]);

      setMessage("Équipe attribuée au coach.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Attribution impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function unassignTeam(team: ClubTeam) {
    if (!coach) return;
    if (!confirm(`Retirer ${team.name} de ${coach.name} ?`)) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await updateClubCoach(coach.id, {
        teamIds: coach.teamIds.filter((id) => id !== team.id),
      });

      const patch: Partial<ClubTeam> = {};
      if (team.coachId === coach.id || team.coachId === coach.userId) patch.coachId = null;
      if (team.assistantId === coach.id || team.assistantId === coach.userId) patch.assistantId = null;
      if (Object.keys(patch).length) await updateClubTeam(team.id, patch);

      setMessage("Équipe retirée.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Retrait impossible.");
    } finally {
      setSaving(false);
    }
  }

  if (openedTeamId) {
    return (
      <ClubTeamsSection
        clubId={clubId}
        initialTeamId={openedTeamId}
        onBack={() => setOpenedTeamId("")}
      />
    );
  }

  if (!coach) {
    return (
      <section className="workspace">
        <button onClick={onBack}>← Retour</button>
        {error ? <div className="alert error">{error}</div> : <div className="empty">Coach introuvable.</div>}
        <style jsx>{`
          .workspace{border:1px solid #eadfd5;border-radius:28px;background:#fff;padding:18px}
          button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}
          .alert,.empty{margin-top:14px;padding:12px;border-radius:14px;font-weight:900}
          .alert.error{background:#fff0f0;color:#b91c1c}
        `}</style>
      </section>
    );
  }

  return (
    <section className="workspace">
      <header className="top">
        <button className="ghost" onClick={onBack}>← Retour coachs</button>
        <div>
          <p>FICHE COACH</p>
          <h2>{coach.name}</h2>
          <span>{coach.role} · {coach.status}</span>
        </div>
      </header>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="hero">
        <div className="avatar">{coach.name.slice(0, 2).toUpperCase()}</div>
        <div>
          <strong>{coach.name}</strong>
          <span>{coach.email || "Email manquant"}</span>
          <span>{coach.phone || "Téléphone manquant"}</span>
        </div>
      </div>

      <div className="kpis">
        <b>{coachTeams.length}<small>équipes attribuées</small></b>
        <b>{coachTeams.reduce((sum, team) => sum + players.filter((p) => p.teamId === team.id).length, 0)}<small>joueurs suivis</small></b>
        <b>{coachTeams.reduce((sum, team) => sum + (team.sessionsCount || 0), 0)}<small>créneaux / séances</small></b>
      </div>

      <section className="panel">
        <div className="panelHead">
          <div>
            <h3>Équipes attribuées</h3>
            <p>Ces équipes apparaîtront aussi dans l’espace du coach rattaché.</p>
          </div>

          <select value="" disabled={saving} onChange={(e) => assignTeam(e.target.value)}>
            <option value="">+ Attribuer une équipe</option>
            {otherTeams.map((team) => (
              <option key={team.id} value={team.id}>{team.name}</option>
            ))}
          </select>
        </div>

        <div className="teams">
          {coachTeams.map((team) => (
            <article className="teamCard" key={team.id}>
              <div>
                <strong>{team.name}</strong>
                <span>{team.category} · {team.gender} · {players.filter((p) => p.teamId === team.id).length} joueurs</span>
              </div>

              <div className="actions">
                <button onClick={() => setOpenedTeamId(team.id)}>Ouvrir fiche équipe</button>
                <button className="danger" onClick={() => unassignTeam(team)}>Retirer</button>
              </div>
            </article>
          ))}

          {!coachTeams.length && <div className="empty">Aucune équipe attribuée à ce coach.</div>}
        </div>
      </section>

      <section className="panel muted">
        <h3>Disponibilités & documents coach</h3>
        <p>Bloc conservé pour plus tard : disponibilités, diplômes, trombinoscope, documents internes.</p>
      </section>

      <style jsx>{`
        .workspace{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{display:flex;gap:16px;align-items:center;padding:22px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}.top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span{color:#6b7280;font-weight:800}
        button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:10px 14px;font-weight:900;cursor:pointer}.ghost{background:#fffaf2;color:#6b1a2c}.danger{background:#fff0f0;color:#b91c1c;border-color:#f1d3cf}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;font-weight:900}.alert.error{background:#fff0f0;color:#b91c1c}.alert.ok{background:#f0fff4;color:#15803d}
        .hero{margin:18px;border-radius:28px;background:linear-gradient(135deg,#6b1a2c,#35101a);color:white;padding:24px;display:flex;gap:16px;align-items:center}.avatar{width:64px;height:64px;border-radius:22px;background:#d4a24c;color:#35101a;display:grid;place-items:center;font-weight:900}.hero strong{display:block;font-size:1.6rem}.hero span{display:block;color:#f8e8c8;font-weight:800}
        .kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin:0 18px 18px}.kpis b{border:1px solid #eadfd5;background:#fff8ee;border-radius:20px;padding:16px;text-align:center;color:#6b1a2c;font-size:1.35rem}.kpis small{display:block;color:#6b7280;font-size:.72rem}
        .panel{border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff;margin:18px}.panel.muted{background:#fffdf8}.panelHead{display:flex;justify-content:space-between;align-items:center;gap:14px;margin-bottom:14px}.panel h3{margin:0;color:#6b1a2c}.panel p{margin:4px 0 0;color:#6b7280;font-weight:800}select{border:1px solid #e5e7eb;border-radius:14px;padding:11px 12px;font:inherit}
        .teams{display:grid;gap:12px}.teamCard{display:flex;justify-content:space-between;gap:14px;align-items:center;border:1px solid #eef2f7;border-radius:18px;padding:14px}.teamCard strong{color:#6b1a2c}.teamCard span{display:block;color:#6b7280;font-weight:800}.actions{display:flex;gap:8px;flex-wrap:wrap}.empty{padding:18px;color:#6b7280;font-weight:800;border:1px dashed #eadfd5;border-radius:18px}
        @media(max-width:900px){.kpis{grid-template-columns:1fr}.top,.panelHead,.teamCard{display:grid}}
      `}</style>
    </section>
  );
}
