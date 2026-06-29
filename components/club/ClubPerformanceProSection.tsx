"use client";

// components/club/ClubPerformanceProSection.tsx
import { useEffect, useMemo, useState } from "react";
import {
  createClubMatch,
  deleteClubMatch,
  getPerformanceWorkspace,
  listPlayerTotals,
  savePlayerGameStat,
  type ClubMatch,
  type PlayerTotal,
} from "@/lib/club-performance-links";
import type { ClubPlayer, ClubTeam } from "@/lib/club-core";

function today() {
  return new Date().toISOString().slice(0, 10);
}

function pct(made: number, attempted: number) {
  if (!attempted) return "—";
  return `${Math.round((made / attempted) * 100)}%`;
}

type StatDraft = {
  playerId: string;
  pts: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  turnovers: number;
  p2m: number;
  p2a: number;
  p3m: number;
  p3a: number;
  ftm: number;
  fta: number;
};

export default function ClubPerformanceProSection({ clubId }: { clubId: string }) {
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [players, setPlayers] = useState<ClubPlayer[]>([]);
  const [matches, setMatches] = useState<ClubMatch[]>([]);
  const [totals, setTotals] = useState<PlayerTotal[]>([]);
  const [teamId, setTeamId] = useState("");
  const [matchId, setMatchId] = useState("");
  const [opponent, setOpponent] = useState("");
  const [matchDate, setMatchDate] = useState(today());
  const [location, setLocation] = useState("");
  const [drafts, setDrafts] = useState<Record<string, StatDraft>>({});
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    setError("");

    try {
      const data = await getPerformanceWorkspace(clubId);
      setTeams(data.teams);
      setPlayers(data.players);
      setMatches(data.matches);
      setTotals(data.totals);

      if (!teamId && data.teams[0]) setTeamId(data.teams[0].id);
      if (!matchId && data.matches[0]) setMatchId(data.matches[0].id);
    } catch (e: any) {
      setError(e?.message || "Performance impossible à charger.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId]);

  useEffect(() => {
    async function refreshTotals() {
      try {
        const rows = await listPlayerTotals(clubId, teamId || undefined);
        setTotals(rows);
      } catch {
        // best effort
      }
    }
    refreshTotals();
  }, [clubId, teamId]);

  const teamPlayers = useMemo(() => {
    return players.filter((player) => !teamId || player.teamId === teamId);
  }, [players, teamId]);

  const teamMatches = useMemo(() => {
    return matches.filter((match) => !teamId || match.teamId === teamId);
  }, [matches, teamId]);

  const leaders = useMemo(() => {
    return {
      pts: [...totals].sort((a, b) => b.ppg - a.ppg).slice(0, 3),
      reb: [...totals].sort((a, b) => b.rpg - a.rpg).slice(0, 3),
      ast: [...totals].sort((a, b) => b.apg - a.apg).slice(0, 3),
    };
  }, [totals]);

  function draftFor(player: ClubPlayer): StatDraft {
    return drafts[player.id] || {
      playerId: player.id,
      pts: 0,
      reb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      turnovers: 0,
      p2m: 0,
      p2a: 0,
      p3m: 0,
      p3a: 0,
      ftm: 0,
      fta: 0,
    };
  }

  function patchDraft(playerId: string, patch: Partial<StatDraft>) {
    setDrafts((prev) => ({
      ...prev,
      [playerId]: { ...(prev[playerId] || draftFor(players.find((p) => p.id === playerId)!)), ...patch },
    }));
  }

  async function createMatch() {
    if (!teamId || !opponent.trim()) {
      setError("Équipe et adversaire obligatoires.");
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    try {
      const match = await createClubMatch({
        clubId,
        teamId,
        opponent,
        matchDate,
        location,
      });
      setMatches((prev) => [match, ...prev]);
      setMatchId(match.id);
      setOpponent("");
      setLocation("");
      setMessage("Match créé.");
    } catch (e: any) {
      setError(e?.message || "Match non créé.");
    } finally {
      setSaving(false);
    }
  }

  async function removeMatch(match: ClubMatch) {
    if (!confirm(`Supprimer le match contre ${match.opponent} et ses stats ?`)) return;

    setSaving(true);
    setError("");
    setMessage("");

    try {
      await deleteClubMatch(clubId, match.id);
      setMessage("Match supprimé.");
      await load();
    } catch (e: any) {
      setError(e?.message || "Suppression impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function saveDraft(player: ClubPlayer) {
    if (!teamId || !matchId) {
      setError("Sélectionne une équipe et un match.");
      return;
    }

    const draft = draftFor(player);

    try {
      await savePlayerGameStat({
        clubId,
        teamId,
        matchId,
        playerId: player.id,
        pts: draft.pts,
        reb: draft.reb,
        ast: draft.ast,
        stl: draft.stl,
        blk: draft.blk,
        turnovers: draft.turnovers,
        p2m: draft.p2m,
        p2a: draft.p2a,
        p3m: draft.p3m,
        p3a: draft.p3a,
        ftm: draft.ftm,
        fta: draft.fta,
      });
      setMessage(`Stats enregistrées pour ${player.lastName} ${player.firstName}.`);
      const rows = await listPlayerTotals(clubId, teamId || undefined);
      setTotals(rows);
    } catch (e: any) {
      setError(e?.message || "Stats non enregistrées.");
    }
  }

  return (
    <section className="performance">
      <div className="top">
        <div>
          <p>PERFORMANCE</p>
          <h2>Stats club connectées</h2>
          <span>Les stats renseignées par les coachs alimentent équipes, joueurs et dashboard président.</span>
        </div>
      </div>

      {error && <div className="alert error">{error}</div>}
      {message && <div className="alert ok">{message}</div>}

      <div className="toolbar">
        <label>Équipe
          <select value={teamId} onChange={(e) => { setTeamId(e.target.value); setMatchId(""); }}>
            <option value="">Toutes</option>
            {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
        </label>

        <label>Match
          <select value={matchId} onChange={(e) => setMatchId(e.target.value)}>
            <option value="">Sélectionner</option>
            {teamMatches.map((match) => (
              <option key={match.id} value={match.id}>{match.matchDate} · {match.opponent}</option>
            ))}
          </select>
        </label>
      </div>

      <div className="layout">
        <aside className="panel">
          <h3>Nouveau match</h3>
          <label>Adversaire<input value={opponent} onChange={(e) => setOpponent(e.target.value)} placeholder="Versailles" /></label>
          <label>Date<input type="date" value={matchDate} onChange={(e) => setMatchDate(e.target.value)} /></label>
          <label>Lieu<input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Domicile / Extérieur" /></label>
          <button disabled={saving} onClick={createMatch}>Créer match</button>

          <h3 className="spaced">Matchs</h3>
          <div className="matches">
            {teamMatches.map((match) => (
              <article key={match.id} className={matchId === match.id ? "match active" : "match"}>
                <button className="open" onClick={() => setMatchId(match.id)}>
                  <strong>{match.opponent}</strong>
                  <span>{match.matchDate}</span>
                </button>
                <button className="danger" onClick={() => removeMatch(match)}>Suppr.</button>
              </article>
            ))}
          </div>
        </aside>

        <main className="main">
          <div className="leaders">
            <article><h4>Points</h4>{leaders.pts.map((p) => <span key={p.playerId}>{p.lastName} {p.firstName} · {p.ppg}</span>)}</article>
            <article><h4>Rebonds</h4>{leaders.reb.map((p) => <span key={p.playerId}>{p.lastName} {p.firstName} · {p.rpg}</span>)}</article>
            <article><h4>Passes</h4>{leaders.ast.map((p) => <span key={p.playerId}>{p.lastName} {p.firstName} · {p.apg}</span>)}</article>
          </div>

          <section className="panel">
            <h3>Saisie rapide stats joueur</h3>
            <div className="statsTable">
              <div className="row head">
                <span>Joueur</span><span>PTS</span><span>REB</span><span>AST</span><span>INT</span><span>BP</span><span>Tirs</span><span></span>
              </div>
              {teamPlayers.map((player) => {
                const draft = draftFor(player);

                return (
                  <div className="row" key={player.id}>
                    <span>{player.lastName} {player.firstName}</span>
                    <span><input value={draft.pts} onChange={(e) => patchDraft(player.id, { pts: Number(e.target.value || 0) })} /></span>
                    <span><input value={draft.reb} onChange={(e) => patchDraft(player.id, { reb: Number(e.target.value || 0) })} /></span>
                    <span><input value={draft.ast} onChange={(e) => patchDraft(player.id, { ast: Number(e.target.value || 0) })} /></span>
                    <span><input value={draft.stl} onChange={(e) => patchDraft(player.id, { stl: Number(e.target.value || 0) })} /></span>
                    <span><input value={draft.turnovers} onChange={(e) => patchDraft(player.id, { turnovers: Number(e.target.value || 0) })} /></span>
                    <span className="shots">
                      <input value={draft.p2m} onChange={(e) => patchDraft(player.id, { p2m: Number(e.target.value || 0) })} />/
                      <input value={draft.p2a} onChange={(e) => patchDraft(player.id, { p2a: Number(e.target.value || 0) })} />
                      <small>{pct(draft.p2m, draft.p2a)}</small>
                    </span>
                    <span><button onClick={() => saveDraft(player)}>Save</button></span>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="panel">
            <h3>Totaux saison</h3>
            <div className="totals">
              <div className="total head"><span>Joueur</span><span>MJ</span><span>PTS</span><span>PPG</span><span>REB</span><span>AST</span><span>3PT</span></div>
              {totals.map((row) => (
                <div className="total" key={row.playerId}>
                  <span>{row.lastName} {row.firstName}</span>
                  <span>{row.games}</span>
                  <span>{row.pts}</span>
                  <span>{row.ppg}</span>
                  <span>{row.reb}</span>
                  <span>{row.ast}</span>
                  <span>{pct(row.p3m, row.p3a)}</span>
                </div>
              ))}
            </div>
          </section>
        </main>
      </div>

      <style jsx>{`
        .performance{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}.top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span{color:#6b7280;font-weight:700}
        .alert{margin:16px;padding:12px 14px;border-radius:14px;font-weight:900}.alert.error{background:#fff0f0;color:#b91c1c}.alert.ok{background:#f0fff4;color:#15803d}
        .toolbar{display:flex;gap:12px;padding:14px 18px;border-bottom:1px solid #eef2f7}.layout{display:grid;grid-template-columns:300px 1fr;gap:18px;padding:18px}.main{display:grid;gap:18px}.panel{border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}.panel h3{margin:0 0 14px;color:#6b1a2c}.spaced{margin-top:24px!important}
        label{display:grid;gap:6px;margin-bottom:12px;color:#6b7280;font-weight:900;font-size:.78rem}input,select{border:1px solid #e5e7eb;border-radius:14px;padding:10px 11px;font:inherit}button{border:1px solid #eadfd5;background:#6b1a2c;color:white;border-radius:999px;padding:9px 12px;font-weight:900;cursor:pointer}.danger{background:#fff0f0;color:#b91c1c;border-color:#f1d3cf}
        .matches{display:grid;gap:8px}.match{display:flex;justify-content:space-between;gap:8px;align-items:center;border:1px solid #eadfd5;border-radius:16px;padding:8px}.match.active{box-shadow:0 0 0 3px rgba(107,26,44,.12)}.open{background:transparent;color:#111;border:0;border-radius:0;text-align:left;padding:0}.open strong{display:block;color:#6b1a2c}.open span{color:#6b7280;font-size:.78rem}
        .leaders{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.leaders article{border:1px solid #eadfd5;border-radius:22px;background:#fff8ee;padding:16px}.leaders h4{margin:0 0 10px;color:#6b1a2c}.leaders span{display:block;color:#6b7280;font-weight:900;margin:5px 0}
        .statsTable,.totals{border:1px solid #eef2f7;border-radius:18px;overflow:auto}.row{display:grid;grid-template-columns:1.4fr .45fr .45fr .45fr .45fr .45fr 1fr .6fr;min-width:980px;border-bottom:1px solid #eef2f7}.total{display:grid;grid-template-columns:1.4fr .45fr .45fr .45fr .45fr .45fr .7fr;min-width:760px;border-bottom:1px solid #eef2f7}.row span,.total span{padding:10px;font-weight:800}.head{background:#f8fafc;color:#6b7280}.row input{width:58px;padding:7px}.shots{display:flex;gap:4px;align-items:center}.shots small{color:#6b7280}
        @media(max-width:1000px){.layout,.toolbar,.leaders{grid-template-columns:1fr;display:grid}}
      `}</style>
    </section>
  );
}
