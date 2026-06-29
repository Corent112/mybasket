"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Team = { id: string; name: string };
type Mode = "total" | "average";

type Row = {
  player_id: string;
  pts: number | null;
  p2m: number | null;
  p2a: number | null;
  p3m: number | null;
  p3a: number | null;
  ftm: number | null;
  fta: number | null;
  off_reb: number | null;
  def_reb: number | null;
  reb: number | null;
  ast: number | null;
  stl: number | null;
  blk: number | null;
  turnovers: number | null;
  pf: number | null;
  present: boolean | null;
};

type PlayerStat = {
  playerId: string;
  name: string;
  games: number;
  p2m: number;
  p2a: number;
  p3m: number;
  p3a: number;
  ftm: number;
  fta: number;
  off: number;
  def: number;
  reb: number;
  ast: number;
  st: number;
  to: number;
  bs: number;
  pf: number;
  fpf: number;
  pts: number;
};

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const round1 = (v: number) => Math.round(v * 10) / 10;

const pct = (made: number, att: number) =>
  att ? `${Math.round((made / att) * 1000) / 10}%` : "0%";

const madeAtt = (m: number, a: number) => `${m}-${a}`;

const eff = (s: PlayerStat) => {
  const fgm = s.p2m + s.p3m;
  const fga = s.p2a + s.p3a;

  return (
    s.pts +
    s.reb +
    s.ast +
    s.st +
    s.bs +
    s.fpf -
    (fga - fgm) -
    (s.fta - s.ftm) -
    s.to -
    s.pf
  );
};

function getPlayerName(player: any) {
  const num = player?.num ?? player?.numero ?? player?.number ?? "";
  const first = player?.first_name ?? player?.firstName ?? player?.prenom ?? "";
  const last = player?.last_name ?? player?.lastName ?? player?.nom ?? "";
  const full = player?.name ?? player?.full_name ?? player?.fullName ?? "";

  return `${num ? `#${num} ` : ""}${
    full || `${first} ${last}`.trim() || "Joueur"
  }`;
}

export default function StatsJoueursModule() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [rows, setRows] = useState<PlayerStat[]>([]);
  const [mode, setMode] = useState<Mode>("total");

  useEffect(() => {
    async function loadTeams() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data: matches } = await supabase
        .from("match_stats")
        .select("team_id")
        .eq("user_id", user.id);

      const teamIds = Array.from(
        new Set((matches ?? []).map((m: { team_id?: string | null }) => m.team_id).filter(Boolean))
      );

      if (teamIds.length === 0) {
        setTeams([]);
        setLoading(false);
        return;
      }

      const { data: teamsData } = await supabase
        .from("teams")
        .select("*")
        .in("id", teamIds);

      const options = teamIds.map((id) => {
        const team = teamsData?.find((t: any) => String(t.id) === String(id));

        return {
          id: String(id),
          name:
            team?.name ||
            team?.nom ||
            team?.team_name ||
            `Équipe ${String(id).slice(0, 8)}`,
        };
      });

      setTeams(options);
      setTeamId(options[0]?.id ?? "");
      setLoading(false);
    }

    loadTeams();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!teamId) return;

    async function loadStats() {
      setLoading(true);

      const { data, error } = await supabase
        .from("match_player_stats")
        .select(
          "player_id, pts, p2m, p2a, p3m, p3a, ftm, fta, off_reb, def_reb, reb, ast, stl, blk, turnovers, pf, present"
        )
        .eq("team_id", teamId);

      if (error) {
        console.error("Erreur stats joueurs:", error);
        setRows([]);
        setLoading(false);
        return;
      }

      const statRows = ((data ?? []) as Row[]).filter(
        (r) => r.present !== false
      );

      const playerIds = Array.from(
        new Set(statRows.map((r) => r.player_id).filter(Boolean))
      );

      const { data: playersData } =
        playerIds.length > 0
          ? await supabase.from("players").select("*").in("id", playerIds)
          : { data: [] as any[] };

      const names: Record<string, string> = {};

      (playersData ?? []).forEach((p: any) => {
        names[String(p.id)] = getPlayerName(p);
      });

      const map: Record<string, PlayerStat> = {};

      statRows.forEach((r) => {
        const id = String(r.player_id);

        if (!map[id]) {
          map[id] = {
            playerId: id,
            name: names[id] || `Joueur ${id.slice(0, 8)}`,
            games: 0,
            p2m: 0,
            p2a: 0,
            p3m: 0,
            p3a: 0,
            ftm: 0,
            fta: 0,
            off: 0,
            def: 0,
            reb: 0,
            ast: 0,
            st: 0,
            to: 0,
            bs: 0,
            pf: 0,
            fpf: 0,
            pts: 0,
          };
        }

        map[id].games += 1;
        map[id].p2m += n(r.p2m);
        map[id].p2a += n(r.p2a);
        map[id].p3m += n(r.p3m);
        map[id].p3a += n(r.p3a);
        map[id].ftm += n(r.ftm);
        map[id].fta += n(r.fta);
        map[id].off += n(r.off_reb);
        map[id].def += n(r.def_reb);
        map[id].reb += n(r.reb) || n(r.off_reb) + n(r.def_reb);
        map[id].ast += n(r.ast);
        map[id].st += n(r.stl);
        map[id].bs += n(r.blk);
        map[id].to += n(r.turnovers);
        map[id].pf += n(r.pf);
        map[id].pts += n(r.pts);
      });

      setRows(Object.values(map).sort((a, b) => b.pts - a.pts));
      setLoading(false);
    }

    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId]);

  const totals = useMemo(() => {
    return rows.reduce(
      (a, r) => {
        a.games += r.games;
        a.p2m += r.p2m;
        a.p2a += r.p2a;
        a.p3m += r.p3m;
        a.p3a += r.p3a;
        a.ftm += r.ftm;
        a.fta += r.fta;
        a.off += r.off;
        a.def += r.def;
        a.reb += r.reb;
        a.ast += r.ast;
        a.st += r.st;
        a.to += r.to;
        a.bs += r.bs;
        a.pf += r.pf;
        a.fpf += r.fpf;
        a.pts += r.pts;
        return a;
      },
      {
        playerId: "totals",
        name: "Totals",
        games: 0,
        p2m: 0,
        p2a: 0,
        p3m: 0,
        p3a: 0,
        ftm: 0,
        fta: 0,
        off: 0,
        def: 0,
        reb: 0,
        ast: 0,
        st: 0,
        to: 0,
        bs: 0,
        pf: 0,
        fpf: 0,
        pts: 0,
      }
    );
  }, [rows]);

  const teamGames = useMemo(() => {
    if (rows.length === 0) return 0;
    return Math.max(...rows.map((r) => r.games));
  }, [rows]);

  const display = (value: number, games: number) => {
    if (mode === "total") return value;
    if (!games) return 0;
    return round1(value / games);
  };

  const displayMadeAtt = (made: number, attempted: number, games: number) => {
    if (mode === "total") return madeAtt(made, attempted);
    if (!games) return "0-0";
    return madeAtt(round1(made / games), round1(attempted / games));
  };

  const renderRow = (r: PlayerStat, isTotal = false) => {
    const fgm = r.p2m + r.p3m;
    const fga = r.p2a + r.p3a;
    const divisor = isTotal ? teamGames : r.games;

    return (
      <tr key={r.playerId} className={isTotal ? "total" : ""}>
        <td className="player">{r.name}</td>
        <td>{displayMadeAtt(fgm, fga, divisor)}</td>
        <td>{displayMadeAtt(r.p2m, r.p2a, divisor)}</td>
        <td>{displayMadeAtt(r.p3m, r.p3a, divisor)}</td>
        <td>{displayMadeAtt(r.ftm, r.fta, divisor)}</td>
        <td>{display(r.off, divisor)}</td>
        <td>{display(r.def, divisor)}</td>
        <td>{display(r.reb, divisor)}</td>
        <td>{display(r.ast, divisor)}</td>
        <td>{display(r.st, divisor)}</td>
        <td>{display(r.to, divisor)}</td>
        <td>{display(r.bs, divisor)}</td>
        <td>{display(r.pf, divisor)}</td>
        <td>{display(r.fpf, divisor)}</td>
        <td>{display(eff(r), divisor)}</td>
        <td className="pts">{display(r.pts, divisor)}</td>
      </tr>
    );
  };

  const totalFgm = totals.p2m + totals.p3m;
  const totalFga = totals.p2a + totals.p3a;

  return (
    <div className="sj">
      <div className="sj-head">
        <div>
          <h3>Stats joueurs</h3>
          <p>
            {mode === "total"
              ? "Stats globales cumulées depuis les matchs enregistrés en live."
              : "Moyennes par match depuis les matchs enregistrés en live."}
          </p>
        </div>

        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          {teams.length === 0 && <option value="">Aucune équipe</option>}

          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="empty">Chargement...</div>}

      {!loading && rows.length === 0 && (
        <div className="empty">Aucune stat trouvée pour cette équipe.</div>
      )}

      {!loading && rows.length > 0 && (
        <>
          <div className="mode-switch">
            <button
              type="button"
              className={mode === "total" ? "on" : ""}
              onClick={() => setMode("total")}
            >
              Stats globales
            </button>

            <button
              type="button"
              className={mode === "average" ? "on" : ""}
              onClick={() => setMode("average")}
            >
              Moyenne / match
            </button>
          </div>

          <div className="table">
            <table>
              <thead>
                <tr>
                  <th>Player</th>
                  <th>FGM-A</th>
                  <th>2PM-A</th>
                  <th>3PM-A</th>
                  <th>FTM-A</th>
                  <th>OFF</th>
                  <th>DEF</th>
                  <th>TOT</th>
                  <th>AST</th>
                  <th>ST</th>
                  <th>TO</th>
                  <th>BS</th>
                  <th>PF</th>
                  <th>FPF</th>
                  <th>EFF</th>
                  <th>PTS</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((r) => renderRow(r))}
                {renderRow(totals, true)}

                <tr className="percent">
                  <td>Pourcentages</td>
                  <td>{pct(totalFgm, totalFga)}</td>
                  <td>{pct(totals.p2m, totals.p2a)}</td>
                  <td>{pct(totals.p3m, totals.p3a)}</td>
                  <td>{pct(totals.ftm, totals.fta)}</td>
                  <td colSpan={11}></td>
                </tr>
              </tbody>
            </table>
          </div>
        </>
      )}

      <style jsx>{`
        .sj {
          background: #fff;
          border-radius: 20px;
          padding: 1.4rem;
          border: 1px solid #efe6db;
        }

        .sj-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1.25rem;
          margin-bottom: 1.25rem;
        }

        h3 {
          margin: 0;
          color: #6b1a2c;
          font-size: 1.55rem;
          font-weight: 900;
        }

        p {
          margin: 0.35rem 0 0;
          color: #7c7470;
          line-height: 1.45;
        }

        select {
          border: 1px solid #eadccc;
          border-radius: 14px;
          padding: 0.85rem 1.05rem;
          font-weight: 900;
          color: #6b1a2c;
          background: #fff;
          min-width: 280px;
        }

        .empty {
          background: #fff8ef;
          border: 1px dashed #d4a24c;
          border-radius: 16px;
          padding: 1.15rem;
          color: #6b1a2c;
          font-weight: 900;
        }

        .mode-switch {
          display: inline-flex;
          gap: 0.4rem;
          background: #fff8ef;
          border: 1px solid #eadccc;
          border-radius: 999px;
          padding: 0.3rem;
          margin-bottom: 1.15rem;
        }

        .mode-switch button {
          border: 0;
          background: transparent;
          color: #6b1a2c;
          padding: 0.65rem 1.05rem;
          border-radius: 999px;
          cursor: pointer;
          font-weight: 900;
        }

        .mode-switch button.on {
          background: #6b1a2c;
          color: white;
        }

        .table {
          width: 100%;
          overflow-x: auto;
          border-radius: 16px;
          border: 1px solid #e7e0da;
          background: #fff;
        }

        table {
          width: 100%;
          min-width: 1360px;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 0.92rem;
        }

        th {
          background: linear-gradient(#696973, #3f3f48);
          color: white;
          padding: 1rem 0.9rem;
          text-align: center;
          font-weight: 900;
          white-space: nowrap;
        }

        th:first-child {
          text-align: left;
          min-width: 300px;
          padding-left: 1.15rem;
        }

        td {
          padding: 1rem 0.9rem;
          border-bottom: 1px solid #ece8e4;
          text-align: center;
          white-space: nowrap;
        }

        td:first-child {
          text-align: left;
          min-width: 300px;
          padding-left: 1.15rem;
        }

        tbody tr:nth-child(even) {
          background: #f8f8fa;
        }

        tbody tr:hover {
          background: #fff8ef;
        }

        .player {
          font-weight: 900;
          color: #333;
        }

        .pts {
          color: #d4a24c;
          font-weight: 900;
        }

        .total {
          font-weight: 900;
          background: #faf3e8 !important;
        }

        .percent {
          background: #fff8ef !important;
          color: #6b1a2c;
          font-weight: 900;
        }

        .percent td {
          border-bottom: 0;
        }

        @media (max-width: 900px) {
          .sj {
            padding: 1rem;
          }

          .sj-head {
            flex-direction: column;
          }

          select {
            width: 100%;
            min-width: 0;
          }

          .mode-switch {
            width: 100%;
          }

          .mode-switch button {
            flex: 1;
          }
        }
      `}</style>
    </div>
  );
}