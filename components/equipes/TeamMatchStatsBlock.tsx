"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "total" | "average";

type SplitKey =
  | "total"
  | "home_win"
  | "home_loss"
  | "away_win"
  | "away_loss"
  | "home"
  | "away"
  | "win"
  | "loss";

type MatchRow = {
  id: string;
  team_id: string | null;
  opponent: string | null;
  match_date: string | null;
  us_score: number | null;
  them_score: number | null;
  result: string | null;
  home: boolean | null;
};

type StatRow = {
  match_id: string | null;
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

type TeamStats = {
  games: number;
  wins: number;
  losses: number;
  draws: number;
  pointsFor: number;
  pointsAgainst: number;
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
  pts: number;
};

type SplitRow = {
  key: SplitKey;
  label: string;
  stats: TeamStats;
};

const SPLITS: Array<{ key: SplitKey; label: string }> = [
  { key: "total", label: "TOTAL" },
  { key: "home_win", label: "Domicile/Victoire" },
  { key: "home_loss", label: "Domicile/Défaite" },
  { key: "away_win", label: "Extérieur/Victoire" },
  { key: "away_loss", label: "Extérieur/Défaite" },
  { key: "home", label: "Domicile" },
  { key: "away", label: "Extérieur" },
  { key: "win", label: "Victoire" },
  { key: "loss", label: "Défaite" },
];

const n = (v: unknown) => {
  const x = Number(v);
  return Number.isFinite(x) ? x : 0;
};

const round1 = (v: number) => Math.round(v * 10) / 10;

const pct = (m: number, a: number) => (a ? `${round1((m / a) * 100)}%` : "0%");

function emptyStats(): TeamStats {
  return {
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    pointsFor: 0,
    pointsAgainst: 0,
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
    pts: 0,
  };
}

function isHome(match: MatchRow) {
  return match.home !== false;
}

function isWin(match: MatchRow) {
  return n(match.us_score) > n(match.them_score);
}

function isLoss(match: MatchRow) {
  return n(match.us_score) < n(match.them_score);
}

function matchPassesSplit(match: MatchRow, split: SplitKey) {
  const home = isHome(match);

  if (split === "total") return true;
  if (split === "home") return home;
  if (split === "away") return !home;
  if (split === "win") return isWin(match);
  if (split === "loss") return isLoss(match);
  if (split === "home_win") return home && isWin(match);
  if (split === "home_loss") return home && isLoss(match);
  if (split === "away_win") return !home && isWin(match);
  if (split === "away_loss") return !home && isLoss(match);

  return true;
}

function addMatch(stats: TeamStats, match: MatchRow) {
  const us = n(match.us_score);
  const them = n(match.them_score);

  stats.games += 1;
  stats.pointsFor += us;
  stats.pointsAgainst += them;

  if (us > them) stats.wins += 1;
  else if (us < them) stats.losses += 1;
  else stats.draws += 1;
}

function addStat(stats: TeamStats, row: StatRow) {
  stats.p2m += n(row.p2m);
  stats.p2a += n(row.p2a);
  stats.p3m += n(row.p3m);
  stats.p3a += n(row.p3a);
  stats.ftm += n(row.ftm);
  stats.fta += n(row.fta);
  stats.off += n(row.off_reb);
  stats.def += n(row.def_reb);
  stats.reb += n(row.reb) || n(row.off_reb) + n(row.def_reb);
  stats.ast += n(row.ast);
  stats.st += n(row.stl);
  stats.bs += n(row.blk);
  stats.to += n(row.turnovers);
  stats.pf += n(row.pf);
  stats.pts += n(row.pts);
}

function advanced(stats: TeamStats) {
  const fgm = stats.p2m + stats.p3m;
  const fga = stats.p2a + stats.p3a;
  const poss = fga + 0.44 * stats.fta + stats.to - stats.off;
  const eff =
    stats.pts +
    stats.reb +
    stats.ast +
    stats.st +
    stats.bs -
    (fga - fgm) -
    (stats.fta - stats.ftm) -
    stats.to -
    stats.pf;

  const efg = fga ? ((fgm + 0.5 * stats.p3m) / fga) * 100 : 0;
  const ts = fga + 0.44 * stats.fta ? (stats.pointsFor / (2 * (fga + 0.44 * stats.fta))) * 100 : 0;
  const astPct = fgm ? (stats.ast / fgm) * 100 : 0;
  const tovPct = poss ? (stats.to / poss) * 100 : 0;
  const shot2Rep = fga ? (stats.p2a / fga) * 100 : 0;
  const shot3Rep = fga ? (stats.p3a / fga) * 100 : 0;

  return { fgm, fga, poss, eff, efg, ts, astPct, tovPct, shot2Rep, shot3Rep };
}

export default function TeamMatchStatsBlock({ teamId }: { teamId: string }) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<Mode>("average");
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [statsRows, setStatsRows] = useState<StatRow[]>([]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);

      const { data: matchData, error: matchError } = await supabase
        .from("match_stats")
        .select("id, team_id, opponent, match_date, us_score, them_score, result, home")
        .eq("team_id", teamId)
        .order("match_date", { ascending: false });

      if (!active) return;

      if (matchError) {
        console.error("Erreur stats équipe fiche :", matchError);
        setMatches([]);
        setStatsRows([]);
        setLoading(false);
        return;
      }

      const matchRows = (matchData ?? []) as MatchRow[];
      setMatches(matchRows);

      const matchIds = matchRows.map((m) => m.id);

      if (matchIds.length === 0) {
        setStatsRows([]);
        setLoading(false);
        return;
      }

      const { data: playerData, error: playerError } = await supabase
        .from("match_player_stats")
        .select(
          "match_id, pts, p2m, p2a, p3m, p3a, ftm, fta, off_reb, def_reb, reb, ast, stl, blk, turnovers, pf, present"
        )
        .in("match_id", matchIds);

      if (!active) return;

      if (playerError) {
        console.error("Erreur lignes stats équipe fiche :", playerError);
        setStatsRows([]);
      } else {
        setStatsRows(((playerData ?? []) as StatRow[]).filter((r) => r.present !== false));
      }

      setLoading(false);
    }

    load();

    return () => {
      active = false;
    };
  }, [supabase, teamId]);

  const splitRows = useMemo<SplitRow[]>(() => {
    const rowsByMatch = statsRows.reduce((acc, row) => {
      const id = String(row.match_id || "");
      if (!id) return acc;
      if (!acc[id]) acc[id] = [];
      acc[id].push(row);
      return acc;
    }, {} as Record<string, StatRow[]>);

    return SPLITS.map((split) => {
      const sourceMatches = matches.filter((match) => matchPassesSplit(match, split.key));
      const stats = emptyStats();

      sourceMatches.forEach((match) => {
        addMatch(stats, match);
        (rowsByMatch[match.id] || []).forEach((row) => addStat(stats, row));
      });

      return {
        key: split.key,
        label: split.label,
        stats,
      };
    });
  }, [matches, statsRows]);

  const total = splitRows.find((row) => row.key === "total")?.stats || emptyStats();
  const totalAdv = advanced(total);

  const value = (x: number, games: number) => {
    if (mode === "total") return round1(x);
    return games ? round1(x / games) : 0;
  };

  return (
    <section className="tl-card team-match-stats">
      <div className="block-head">
        <div>
          <p className="eyebrow">Matchs</p>
          <h2>Stats équipe</h2>
          <p className="muted">Synthèse liée aux matchs enregistrés en live.</p>
        </div>

        <div className="mode-switch">
          <button type="button" className={mode === "total" ? "on" : ""} onClick={() => setMode("total")}>
            Total
          </button>
          <button type="button" className={mode === "average" ? "on" : ""} onClick={() => setMode("average")}>
            Moyenne
          </button>
        </div>
      </div>

      {loading && <div className="empty">Chargement des stats...</div>}

      {!loading && matches.length === 0 && (
        <div className="empty">Aucun match enregistré pour cette équipe.</div>
      )}

      {!loading && matches.length > 0 && (
        <>
          <div className="quick-kpis">
            <Kpi label="Matchs" value={total.games} />
            <Kpi label="Victoires" value={total.wins} />
            <Kpi label="Défaites" value={total.losses} />
            <Kpi label="Pts marqués" value={value(total.pointsFor, total.games)} />
            <Kpi label="Pts encaissés" value={value(total.pointsAgainst, total.games)} />
            <Kpi label="Diff." value={value(total.pointsFor - total.pointsAgainst, total.games)} />
          </div>

          <div className="stats-table">
            <table>
              <thead>
                <tr>
                  <th>Filtre</th>
                  <th>MJ</th>
                  <th>PTS M</th>
                  <th>PTS E</th>
                  <th>FG</th>
                  <th>%</th>
                  <th>2PTS</th>
                  <th>%</th>
                  <th>3PTS</th>
                  <th>%</th>
                  <th>LF</th>
                  <th>%</th>
                  <th>RO</th>
                  <th>RD</th>
                  <th>REB</th>
                  <th>PD</th>
                  <th>INT</th>
                  <th>BP</th>
                  <th>CTRE</th>
                  <th>FP</th>
                  <th>Eval</th>
                  <th>Poss</th>
                  <th>eFG%</th>
                  <th>TS%</th>
                  <th>%PD</th>
                  <th>%BP</th>
                  <th>2PTS Rep</th>
                  <th>3PTS Rep</th>
                </tr>
              </thead>

              <tbody>
                {splitRows.map((row) => {
                  const s = row.stats;
                  const a = advanced(s);
                  const games = s.games;

                  return (
                    <tr key={row.key} className={`row-${row.key}`}>
                      <td className="label">{row.label}</td>
                      <td>{s.games}</td>
                      <td>{value(s.pointsFor, games)}</td>
                      <td>{value(s.pointsAgainst, games)}</td>
                      <td>{value(a.fgm, games)}-{value(a.fga, games)}</td>
                      <td>{pct(a.fgm, a.fga)}</td>
                      <td>{value(s.p2m, games)}-{value(s.p2a, games)}</td>
                      <td>{pct(s.p2m, s.p2a)}</td>
                      <td>{value(s.p3m, games)}-{value(s.p3a, games)}</td>
                      <td>{pct(s.p3m, s.p3a)}</td>
                      <td>{value(s.ftm, games)}-{value(s.fta, games)}</td>
                      <td>{pct(s.ftm, s.fta)}</td>
                      <td>{value(s.off, games)}</td>
                      <td>{value(s.def, games)}</td>
                      <td>{value(s.reb, games)}</td>
                      <td>{value(s.ast, games)}</td>
                      <td>{value(s.st, games)}</td>
                      <td>{value(s.to, games)}</td>
                      <td>{value(s.bs, games)}</td>
                      <td>{value(s.pf, games)}</td>
                      <td>{value(a.eff, games)}</td>
                      <td>{value(a.poss, games)}</td>
                      <td>{round1(a.efg)}%</td>
                      <td>{round1(a.ts)}%</td>
                      <td>{round1(a.astPct)}%</td>
                      <td>{round1(a.tovPct)}%</td>
                      <td>{round1(a.shot2Rep)}%</td>
                      <td>{round1(a.shot3Rep)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <style jsx>{`
        .team-match-stats {
          margin-top: 1.2rem;
        }

        .block-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .eyebrow {
          margin: 0;
          color: #d4a24c;
          font-size: 0.78rem;
          font-weight: 900;
          text-transform: uppercase;
          letter-spacing: 0.06em;
        }

        h2 {
          margin: 0.2rem 0 0;
          color: #6b1a2c;
          font-size: 1.45rem;
          font-weight: 900;
        }

        .muted {
          margin: 0.25rem 0 0;
          color: #9a8a82;
          font-size: 0.92rem;
        }

        .mode-switch {
          display: inline-flex;
          gap: 0.25rem;
          border-radius: 999px;
          background: #fff8ef;
          border: 1px solid #eadccc;
          padding: 0.25rem;
        }

        .mode-switch button {
          border: 0;
          background: transparent;
          border-radius: 999px;
          color: #6b1a2c;
          padding: 0.55rem 0.9rem;
          font-weight: 900;
          cursor: pointer;
        }

        .mode-switch button.on {
          background: #6b1a2c;
          color: #fff;
        }

        .empty {
          background: #fff8ef;
          border: 1px dashed #d4a24c;
          border-radius: 14px;
          padding: 1rem;
          color: #6b1a2c;
          font-weight: 900;
        }

        .quick-kpis {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .kpi {
          border: 1px solid #efe6db;
          border-radius: 14px;
          background: #fffdf9;
          padding: 0.85rem;
        }

        .kpi span {
          display: block;
          color: #9a8a82;
          font-size: 0.72rem;
          font-weight: 900;
          text-transform: uppercase;
        }

        .kpi strong {
          display: block;
          margin-top: 0.25rem;
          color: #6b1a2c;
          font-size: 1.35rem;
          font-weight: 900;
        }

        .stats-table {
          width: 100%;
          overflow-x: auto;
          border: 1px solid #efe6db;
          border-radius: 16px;
        }

        table {
          width: max-content;
          min-width: 100%;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 0.78rem;
        }

        th {
          background: linear-gradient(#6b1a2c, #49101d);
          color: white;
          padding: 0.65rem 0.55rem;
          text-align: center;
          white-space: nowrap;
          font-weight: 900;
        }

        th:first-child,
        td:first-child {
          position: sticky;
          left: 0;
          z-index: 2;
          min-width: 155px;
          text-align: left;
        }

        th:first-child {
          background: #6b1a2c;
        }

        td:first-child {
          background: #f8f8f8;
        }

        td {
          border-bottom: 1px solid #eee;
          border-right: 1px solid #eee;
          padding: 0.62rem 0.55rem;
          text-align: center;
          white-space: nowrap;
          background: white;
          font-weight: 800;
        }

        .label {
          color: #6b1a2c;
          font-weight: 900;
        }

        .row-total td {
          background: #fff7ec;
          font-weight: 900;
        }

        .row-home_win td:first-child,
        .row-away_win td:first-child,
        .row-win td:first-child {
          background: #eef9f1;
          color: #2f6b41;
        }

        .row-home_loss td:first-child,
        .row-away_loss td:first-child,
        .row-loss td:first-child {
          background: #fdf1ef;
          color: #8f3c34;
        }

        .row-home td:first-child {
          background: #fff8ea;
          color: #8a6a1f;
        }

        .row-away td:first-child {
          background: #f1f6ff;
          color: #355c96;
        }

        @media (max-width: 900px) {
          .block-head {
            flex-direction: column;
          }

          .quick-kpis {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
      `}</style>
    </section>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
