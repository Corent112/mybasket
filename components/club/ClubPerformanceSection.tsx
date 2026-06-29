"use client";

// components/club/ClubPerformanceSection.tsx
import { useEffect, useMemo, useState } from "react";
import { type ClubTeam, listClubTeams, loadClubPerformance } from "@/lib/club-core";

export default function ClubPerformanceSection({ clubId }: { clubId: string }) {
  const [teams, setTeams] = useState<ClubTeam[]>([]);
  const [rows, setRows] = useState<any[]>([]);
  const [teamId, setTeamId] = useState("");
  const [error, setError] = useState("");

  async function load() {
    setError("");
    try {
      const [teamRows, perfRows] = await Promise.all([
        listClubTeams(clubId),
        loadClubPerformance(clubId, teamId || undefined),
      ]);
      setTeams(teamRows);
      setRows(perfRows);
    } catch (e: any) {
      setError(e?.message || "Performance impossible à charger.");
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clubId, teamId]);

  const totals = useMemo(() => {
    return rows.reduce(
      (acc, row) => {
        acc.points += Number(row.points || 0);
        acc.rebounds += Number(row.rebounds || 0);
        acc.assists += Number(row.assists || 0);
        acc.steals += Number(row.steals || 0);
        acc.blocks += Number(row.blocks || 0);
        acc.turnovers += Number(row.turnovers || 0);
        return acc;
      },
      { points: 0, rebounds: 0, assists: 0, steals: 0, blocks: 0, turnovers: 0 }
    );
  }, [rows]);

  const leaders = [...rows].sort((a, b) => Number(b.points || 0) - Number(a.points || 0)).slice(0, 5);

  return (
    <section className="perf">
      <div className="top">
        <div>
          <p>PERFORMANCE</p>
          <h2>Dashboard statistiques club</h2>
          <span>Toutes les stats de toutes les équipes arrivent ici.</span>
        </div>
        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          <option value="">Tout le club</option>
          {teams.map((team) => <option key={team.id} value={team.id}>{team.name}</option>)}
        </select>
      </div>

      {error && <div className="alert">{error}</div>}

      <div className="kpis">
        <b>{rows.length}<small>joueurs</small></b>
        <b>{totals.points}<small>points</small></b>
        <b>{totals.rebounds}<small>rebonds</small></b>
        <b>{totals.assists}<small>passes</small></b>
        <b>{totals.steals}<small>interceptions</small></b>
        <b>{totals.turnovers}<small>pertes</small></b>
      </div>

      <div className="layout">
        <div className="panel">
          <h3>Leaders club</h3>
          {leaders.map((row, index) => (
            <div className="leader" key={row.player_id}>
              <span>#{index + 1}</span>
              <strong>{row.last_name} {row.first_name}</strong>
              <b>{row.points} pts</b>
            </div>
          ))}
        </div>

        <div className="panel">
          <h3>Toutes les stats</h3>
          <div className="table">
            <div className="row head"><span>Joueur</span><span>Équipe</span><span>PTS</span><span>REB</span><span>AST</span><span>STL</span><span>TO</span></div>
            {rows.map((row) => (
              <div className="row" key={row.player_id}>
                <span>{row.last_name} {row.first_name}</span>
                <span>{teams.find((team) => team.id === row.team_id)?.name || "—"}</span>
                <span>{row.points}</span>
                <span>{row.rebounds}</span>
                <span>{row.assists}</span>
                <span>{row.steals}</span>
                <span>{row.turnovers}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <style jsx>{`
        .perf{border:1px solid #eadfd5;border-radius:28px;background:#fff;overflow:hidden;box-shadow:0 22px 70px rgba(0,0,0,.06);font-family:Roboto,system-ui,sans-serif}
        .top{display:flex;justify-content:space-between;gap:20px;align-items:center;padding:24px;background:linear-gradient(135deg,#fff,#fff5e8);border-bottom:1px solid #eadfd5}.top p{margin:0 0 6px;color:#d4a24c;font-size:.72rem;font-weight:900;letter-spacing:.12em}.top h2{margin:0;color:#6b1a2c;font-family:"Alfa Slab One",serif;font-weight:400}.top span{color:#6b7280;font-weight:700}
        select{border:1px solid #e5e7eb;border-radius:14px;padding:11px 12px;font:inherit}.alert{margin:16px;padding:12px 14px;border-radius:14px;background:#fff0f0;color:#b91c1c;font-weight:900}
        .kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:12px;padding:18px}.kpis b{border:1px solid #eadfd5;background:#fff8ee;border-radius:20px;padding:18px;text-align:center;color:#6b1a2c;font-size:1.4rem}.kpis small{display:block;color:#6b7280;font-size:.7rem}
        .layout{display:grid;grid-template-columns:320px 1fr;gap:18px;padding:0 18px 18px}.panel{border:1px solid #eadfd5;border-radius:24px;padding:18px;background:#fff}.panel h3{margin:0 0 14px;color:#6b1a2c}
        .leader{display:grid;grid-template-columns:44px 1fr auto;gap:10px;align-items:center;padding:12px;border-bottom:1px solid #eef2f7}.leader span{color:#d4a24c;font-weight:900}.leader strong{color:#111827}.leader b{color:#6b1a2c}
        .table{border:1px solid #eef2f7;border-radius:18px;overflow:hidden}.row{display:grid;grid-template-columns:1.4fr 1fr .6fr .6fr .6fr .6fr .6fr;border-bottom:1px solid #eef2f7}.row span{padding:12px;font-weight:800}.row.head{background:#f8fafc;color:#6b7280}
        @media(max-width:1050px){.kpis,.layout{grid-template-columns:1fr}.row{grid-template-columns:1fr}.row.head{display:none}}
      `}</style>
    </section>
  );
}
