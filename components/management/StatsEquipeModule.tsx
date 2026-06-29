"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "total" | "average";

type RowKind =
  | "match"
  | "average"
  | "total"
  | "home_win"
  | "home_loss"
  | "away_win"
  | "away_loss"
  | "home"
  | "away"
  | "win"
  | "loss";

type Team = {
  id: string;
  name: string;
};

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

type PlayerStatRow = {
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

type ActionRow = {
  match_id: string | null;
  context: string | null;
  action_type: string | null;
  shot_type: string | null;
  shot_result: string | null;
  ft_attempts: number | null;
  ft_made: number | null;
  rebound_type: string | null;
  foul_outcome: string | null;
  special_case: string | null;
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

  oppFga: number;
  oppFta: number;
  oppTo: number;
  oppOrb: number;
  oppDrb: number;
};

type TableRow = {
  key: string;
  kind: RowKind;
  label: string;
  match?: MatchRow;
  stats: TeamStats;
};

const SPLITS: Array<{ kind: RowKind; label: string }> = [
  { kind: "home_win", label: "Domicile/Victoire" },
  { kind: "home_loss", label: "Domicile/Défaite" },
  { kind: "away_win", label: "Extérieur/Victoire" },
  { kind: "away_loss", label: "Extérieur/Défaite" },
  { kind: "home", label: "Domicile" },
  { kind: "away", label: "Extérieur" },
  { kind: "win", label: "Victoire" },
  { kind: "loss", label: "Défaite" },
];

const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;

const pct = (made: number, attempted: number) =>
  attempted ? `${round1((made / attempted) * 100)}%` : "0%";

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

    oppFga: 0,
    oppFta: 0,
    oppTo: 0,
    oppOrb: 0,
    oppDrb: 0,
  };
}

function cloneStats(stats: TeamStats): TeamStats {
  return { ...stats };
}

function teamName(row: any, id: string) {
  return String(
    row?.name ||
      row?.nom ||
      row?.team_name ||
      row?.title ||
      `Équipe ${id.slice(0, 8)}`
  );
}

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;

  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  });
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

function resultLabel(match: MatchRow) {
  if (isWin(match)) return "V";
  if (isLoss(match)) return "D";
  return "N";
}

function homeAwayLabel(match: MatchRow) {
  return isHome(match) ? "D" : "E";
}

function matchPassesSplit(match: MatchRow, kind: RowKind) {
  const home = isHome(match);

  if (kind === "total" || kind === "average") return true;
  if (kind === "home") return home;
  if (kind === "away") return !home;
  if (kind === "win") return isWin(match);
  if (kind === "loss") return isLoss(match);
  if (kind === "home_win") return home && isWin(match);
  if (kind === "home_loss") return home && isLoss(match);
  if (kind === "away_win") return !home && isWin(match);
  if (kind === "away_loss") return !home && isLoss(match);

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

function addPlayerRow(stats: TeamStats, row: PlayerStatRow) {
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

function addOpponentFromAction(stats: TeamStats, action: ActionRow) {
  const context = String(action.context || "");
  const actionType = String(action.action_type || "");
  const shotType = String(action.shot_type || "");
  const reboundType = String(action.rebound_type || "");

  if (context === "defense" && actionType === "tir") {
    if (shotType === "2PTS" || shotType === "3PTS") {
      stats.oppFga += 1;
    }

    if (shotType === "LF") {
      stats.oppFta += n(action.ft_attempts);
    }
  }

  if (context === "defense" && actionType === "faute-commise") {
    stats.oppFta += n(action.ft_attempts);
  }

  if (
    context === "defense" &&
    (actionType === "interception" || actionType === "perte-adverse")
  ) {
    stats.oppTo += 1;
  }

  if (context === "defense" && reboundType === "off") {
    stats.oppOrb += 1;
  }

  if (context === "attaque" && reboundType === "def") {
    stats.oppDrb += 1;
  }
}

function getAdvanced(stats: TeamStats) {
  const fgm = stats.p2m + stats.p3m;
  const fga = stats.p2a + stats.p3a;

  const poss = fga + 0.44 * stats.fta + stats.to - stats.off;
  const oppPoss = stats.oppFga + 0.44 * stats.oppFta + stats.oppTo - stats.oppOrb;

  const pace = stats.games ? (40 * ((poss + oppPoss) / 2)) / (40 * stats.games) : 0;

  const offRtg = poss ? (100 * stats.pointsFor) / poss : 0;
  const defRtg = oppPoss ? (100 * stats.pointsAgainst) / oppPoss : 0;
  const netRtg = offRtg - defRtg;

  const efg = fga ? ((fgm + 0.5 * stats.p3m) / fga) * 100 : 0;
  const ts = fga + 0.44 * stats.fta ? (stats.pointsFor / (2 * (fga + 0.44 * stats.fta))) * 100 : 0;

  const orbPct = stats.off + stats.oppDrb ? (stats.off / (stats.off + stats.oppDrb)) * 100 : 0;
  const drbPct = stats.def + stats.oppOrb ? (stats.def / (stats.def + stats.oppOrb)) * 100 : 0;

  const astPct = fgm ? (stats.ast / fgm) * 100 : 0;
  const astRatio = poss ? (100 * stats.ast) / poss : 0;

  const tovPct = poss ? (100 * stats.to) / poss : 0;
  const tovRatio = tovPct;

  const ftRate = fga ? stats.fta / fga : 0;

  const shot2Rep = fga ? (stats.p2a / fga) * 100 : 0;
  const shot3Rep = fga ? (stats.p3a / fga) * 100 : 0;

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

  return {
    fgm,
    fga,
    poss,
    oppPoss,
    pace,
    offRtg,
    defRtg,
    netRtg,
    efg,
    ts,
    orbPct,
    drbPct,
    astPct,
    astRatio,
    tovPct,
    tovRatio,
    ftRate,
    shot2Rep,
    shot3Rep,
    eff,
  };
}

export default function StatsEquipeModule() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [playerRows, setPlayerRows] = useState<PlayerStatRow[]>([]);
  const [actionRows, setActionRows] = useState<ActionRow[]>([]);
  const [mode, setMode] = useState<Mode>("total");

  useEffect(() => {
    async function loadTeamsAndMatches() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("match_stats")
        .select("id, team_id, opponent, match_date, us_score, them_score, result, home")
        .eq("user_id", user.id)
        .order("match_date", { ascending: false });

      if (error) {
        console.error("Erreur chargement matchs stats équipe :", error);
        setMatches([]);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as MatchRow[];
      setMatches(rows);

      const ids = Array.from(
        new Set(rows.map((m) => m.team_id).filter(Boolean).map(String))
      );

      if (ids.length === 0) {
        setTeams([]);
        setTeamId("");
        setPlayerRows([]);
        setActionRows([]);
        setLoading(false);
        return;
      }

      const { data: teamsData } = await supabase
        .from("teams")
        .select("*")
        .in("id", ids);

      const nextTeams = ids.map((id) => {
        const found = teamsData?.find((t: any) => String(t.id) === id);
        return { id, name: teamName(found, id) };
      });

      setTeams(nextTeams);
      setTeamId((prev) => prev || nextTeams[0]?.id || "");
      setLoading(false);
    }

    loadTeamsAndMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!teamId) return;

    async function loadDetails() {
      setLoading(true);

      const selectedMatches = matches.filter((m) => m.team_id === teamId);
      const matchIds = selectedMatches.map((m) => m.id);

      if (matchIds.length === 0) {
        setPlayerRows([]);
        setActionRows([]);
        setLoading(false);
        return;
      }

      const { data: playerData, error: playerError } = await supabase
        .from("match_player_stats")
        .select(
          "match_id, pts, p2m, p2a, p3m, p3a, ftm, fta, off_reb, def_reb, reb, ast, stl, blk, turnovers, pf, present"
        )
        .in("match_id", matchIds);

      if (playerError) {
        console.error("Erreur chargement stats joueurs équipe :", playerError);
        setPlayerRows([]);
      } else {
        setPlayerRows(
          ((playerData ?? []) as PlayerStatRow[]).filter(
            (row) => row.present !== false
          )
        );
      }

      const { data: actionData, error: actionError } = await supabase
        .from("match_actions")
        .select(
          "match_id, context, action_type, shot_type, shot_result, ft_attempts, ft_made, rebound_type, foul_outcome, special_case"
        )
        .in("match_id", matchIds);

      if (actionError) {
        console.warn("Actions non disponibles pour stats adverses :", actionError);
        setActionRows([]);
      } else {
        setActionRows((actionData ?? []) as ActionRow[]);
      }

      setLoading(false);
    }

    loadDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, matches]);

  const selectedTeam = teams.find((team) => team.id === teamId);

  const rows = useMemo<TableRow[]>(() => {
    if (!teamId) return [];

    const selectedMatches = matches.filter((match) => match.team_id === teamId);

    const playerRowsByMatch = playerRows.reduce((acc, row) => {
      const matchId = String(row.match_id || "");
      if (!matchId) return acc;

      if (!acc[matchId]) acc[matchId] = [];
      acc[matchId].push(row);
      return acc;
    }, {} as Record<string, PlayerStatRow[]>);

    const actionRowsByMatch = actionRows.reduce((acc, row) => {
      const matchId = String(row.match_id || "");
      if (!matchId) return acc;

      if (!acc[matchId]) acc[matchId] = [];
      acc[matchId].push(row);
      return acc;
    }, {} as Record<string, ActionRow[]>);

    const buildForMatches = (sourceMatches: MatchRow[]) => {
      const stats = emptyStats();

      sourceMatches.forEach((match) => {
        addMatch(stats, match);

        (playerRowsByMatch[match.id] || []).forEach((row) => {
          addPlayerRow(stats, row);
        });

        (actionRowsByMatch[match.id] || []).forEach((row) => {
          addOpponentFromAction(stats, row);
        });
      });

      return stats;
    };

    const matchRows: TableRow[] = selectedMatches.map((match) => ({
      key: match.id,
      kind: "match",
      label: `${formatDate(match.match_date)} · ${match.opponent || "Adversaire"}`,
      match,
      stats: buildForMatches([match]),
    }));

    const total = buildForMatches(selectedMatches);

    const average: TableRow = {
      key: "average",
      kind: "average",
      label: "MOY/MATCH",
      stats: cloneStats(total),
    };

    const totalRow: TableRow = {
      key: "total",
      kind: "total",
      label: "TOTAL",
      stats: total,
    };

    const splitRows: TableRow[] = SPLITS.map((split) => {
      const splitMatches = selectedMatches.filter((match) =>
        matchPassesSplit(match, split.kind)
      );

      return {
        key: split.kind,
        kind: split.kind,
        label: split.label,
        stats: buildForMatches(splitMatches),
      };
    });

    return [...matchRows, average, totalRow, ...splitRows];
  }, [actionRows, matches, playerRows, teamId]);

  const totalStats =
    rows.find((row) => row.kind === "total")?.stats || emptyStats();

  const winPct = totalStats.games
    ? round1((totalStats.wins / totalStats.games) * 100)
    : 0;

  const display = (value: number, games: number, forceAverage = false) => {
    if (forceAverage || mode === "average") {
      if (!games) return 0;
      return round1(value / games);
    }

    return round1(value);
  };

  const displayRate = (value: number) => round1(value);

  const rowUsesAverage = (row: TableRow) =>
    row.kind === "average" || mode === "average";

  return (
    <div className="se">
      <div className="se-head">
        <div>
          <h3>Stats équipe</h3>
          <p>
            Match par match, synthèse, splits et colonnes avancées en fin de tableau.
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

      {!loading && !selectedTeam && (
        <div className="empty">Aucune équipe avec match enregistré.</div>
      )}

      {!loading && selectedTeam && (
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

          <div className="record-grid">
            <Kpi label="Matchs" value={totalStats.games} />
            <Kpi label="Victoires" value={totalStats.wins} tone="green" />
            <Kpi label="Défaites" value={totalStats.losses} tone="red" />
            <Kpi label="Nuls" value={totalStats.draws} />
            <Kpi label="% Victoires" value={`${winPct}%`} />
            <Kpi label="Différence" value={totalStats.pointsFor - totalStats.pointsAgainst} />
          </div>

          <div className="table">
            <table>
              <thead>
                <tr>
                  <th rowSpan={2}>Matchs</th>
                  <th colSpan={4}>Résultat</th>
                  <th colSpan={4}>Total</th>
                  <th colSpan={3}>2 points</th>
                  <th colSpan={3}>3 points</th>
                  <th colSpan={3}>L-F</th>
                  <th colSpan={3}>Rebonds</th>
                  <th rowSpan={2}>PD</th>
                  <th rowSpan={2}>INT</th>
                  <th rowSpan={2}>BP</th>
                  <th rowSpan={2}>CTRE</th>
                  <th rowSpan={2}>FP</th>
                  <th rowSpan={2}>Eval</th>
                  <th rowSpan={2}>PTS</th>
                  <th colSpan={17}>Analytics</th>
                </tr>

                <tr>
                  <th>D/E</th>
                  <th>V/D</th>
                  <th>Pts M</th>
                  <th>Pts E</th>
                  <th>TR</th>
                  <th>TT</th>
                  <th>%</th>
                  <th>RT</th>
                  <th>TT</th>
                  <th>TR</th>
                  <th>%</th>
                  <th>TT</th>
                  <th>TR</th>
                  <th>%</th>
                  <th>TT</th>
                  <th>TR</th>
                  <th>%</th>
                  <th>RO</th>
                  <th>RD</th>
                  <th>TT</th>
                  <th>Poss</th>
                  <th>Poss adv</th>
                  <th>Pace</th>
                  <th>OffRtg</th>
                  <th>DefRtg</th>
                  <th>NetRtg</th>
                  <th>eFG%</th>
                  <th>TS%</th>
                  <th>%RO</th>
                  <th>%RD</th>
                  <th>%PD</th>
                  <th>AST Ratio</th>
                  <th>%BP</th>
                  <th>TO Ratio</th>
                  <th>FTr</th>
                  <th>2PTS Rep</th>
                  <th>3PTS Rep</th>
                </tr>
              </thead>

              <tbody>
                {rows.map((row) => {
                  const s = row.stats;
                  const a = getAdvanced(s);
                  const useAverage = rowUsesAverage(row);

                  const de =
                    row.match
                      ? homeAwayLabel(row.match)
                      : row.kind === "home" ||
                          row.kind === "home_win" ||
                          row.kind === "home_loss"
                        ? "D"
                        : row.kind === "away" ||
                            row.kind === "away_win" ||
                            row.kind === "away_loss"
                          ? "E"
                          : "—";

                  const vd =
                    row.match
                      ? resultLabel(row.match)
                      : row.kind === "win" ||
                          row.kind === "home_win" ||
                          row.kind === "away_win"
                        ? "V"
                        : row.kind === "loss" ||
                            row.kind === "home_loss" ||
                            row.kind === "away_loss"
                          ? "D"
                          : "—";

                  return (
                    <tr
                      key={row.key}
                      className={
                        row.kind === "total"
                          ? "total-row"
                          : row.kind === "average"
                            ? "average-row"
                            : row.kind === "match"
                              ? "match-row"
                              : `split-row split-${row.kind}`
                      }
                    >
                      <td className="team-name">{row.label}</td>
                      <td>{de}</td>
                      <td>{vd}</td>
                      <td>{display(s.pointsFor, s.games, useAverage)}</td>
                      <td>{display(s.pointsAgainst, s.games, useAverage)}</td>
                      <td>{display(a.fgm, s.games, useAverage)}</td>
                      <td>{display(a.fga, s.games, useAverage)}</td>
                      <td>{pct(a.fgm, a.fga)}</td>
                      <td>{display(s.reb, s.games, useAverage)}</td>
                      <td>{display(s.p2a, s.games, useAverage)}</td>
                      <td>{display(s.p2m, s.games, useAverage)}</td>
                      <td>{pct(s.p2m, s.p2a)}</td>
                      <td>{display(s.p3a, s.games, useAverage)}</td>
                      <td>{display(s.p3m, s.games, useAverage)}</td>
                      <td>{pct(s.p3m, s.p3a)}</td>
                      <td>{display(s.fta, s.games, useAverage)}</td>
                      <td>{display(s.ftm, s.games, useAverage)}</td>
                      <td>{pct(s.ftm, s.fta)}</td>
                      <td>{display(s.off, s.games, useAverage)}</td>
                      <td>{display(s.def, s.games, useAverage)}</td>
                      <td>{display(s.reb, s.games, useAverage)}</td>
                      <td>{display(s.ast, s.games, useAverage)}</td>
                      <td>{display(s.st, s.games, useAverage)}</td>
                      <td>{display(s.to, s.games, useAverage)}</td>
                      <td>{display(s.bs, s.games, useAverage)}</td>
                      <td>{display(s.pf, s.games, useAverage)}</td>
                      <td>{display(a.eff, s.games, useAverage)}</td>
                      <td className="pts">
                        {display(s.pts || s.pointsFor, s.games, useAverage)}
                      </td>
                      <td>{display(a.poss, s.games, useAverage)}</td>
                      <td>{display(a.oppPoss, s.games, useAverage)}</td>
                      <td>{displayRate(a.pace)}</td>
                      <td>{round2(a.offRtg)}</td>
                      <td>{round2(a.defRtg)}</td>
                      <td>{round2(a.netRtg)}</td>
                      <td>{displayRate(a.efg)}%</td>
                      <td>{displayRate(a.ts)}%</td>
                      <td>{displayRate(a.orbPct)}%</td>
                      <td>{displayRate(a.drbPct)}%</td>
                      <td>{displayRate(a.astPct)}%</td>
                      <td>{round2(a.astRatio)}</td>
                      <td>{displayRate(a.tovPct)}%</td>
                      <td>{round2(a.tovRatio)}</td>
                      <td>{round2(a.ftRate)}</td>
                      <td>{displayRate(a.shot2Rep)}%</td>
                      <td>{displayRate(a.shot3Rep)}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

      <style jsx>{`
        .se {
          background: #fff;
          border-radius: 20px;
          padding: 1.4rem;
          border: 1px solid #efe6db;
        }

        .se-head {
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

        .record-grid {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 0.8rem;
          margin-bottom: 1.15rem;
        }

        .kpi {
          border: 1px solid #eee2d6;
          border-radius: 16px;
          padding: 1rem;
          background: #fffdf9;
        }

        .kpi span {
          display: block;
          color: #7c7470;
          font-size: 0.75rem;
          font-weight: 900;
          text-transform: uppercase;
        }

        .kpi strong {
          display: block;
          margin-top: 0.35rem;
          color: #6b1a2c;
          font-size: 1.45rem;
          font-weight: 900;
        }

        .kpi.green strong {
          color: #168653;
        }

        .kpi.red strong {
          color: #c5283d;
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
          min-width: 3060px;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 0.79rem;
        }

        th {
          background: linear-gradient(#ff402d, #d72718);
          color: #111;
          padding: 0.62rem 0.42rem;
          text-align: center;
          font-weight: 900;
          white-space: nowrap;
          border-right: 1px solid rgba(0, 0, 0, 0.35);
          border-bottom: 1px solid rgba(0, 0, 0, 0.35);
        }

        thead tr:nth-child(2) th {
          background: #f6d5d5;
          color: #111;
        }

        th:first-child {
          text-align: center;
          min-width: 135px;
        }

        td {
          padding: 0.62rem 0.42rem;
          border-right: 1px solid #d7d7d7;
          border-bottom: 1px solid #d7d7d7;
          text-align: center;
          white-space: nowrap;
          background: #fff;
        }

        td:first-child {
          text-align: left;
          min-width: 135px;
          max-width: 135px;
          font-weight: 900;
          background: #efefef;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        tbody td:nth-child(2),
        tbody td:nth-child(3) {
          width: 44px;
          min-width: 44px;
          max-width: 44px;
          padding-left: 0.25rem;
          padding-right: 0.25rem;
        }

        thead tr:nth-child(2) th:nth-child(1),
        thead tr:nth-child(2) th:nth-child(2) {
          width: 44px;
          min-width: 44px;
          max-width: 44px;
          padding-left: 0.25rem;
          padding-right: 0.25rem;
        }

        thead tr:first-child th:nth-child(2) {
          width: 88px;
          min-width: 88px;
          max-width: 88px;
        }

        .match-row td:first-child {
          font-weight: 800;
        }

        .average-row td {
          background: #fff7ec;
          font-weight: 800;
        }

        .total-row td {
          background: #f7f7f7;
          font-weight: 900;
        }

        .split-row td:first-child {
          background: #f8f8f8;
        }

        .split-home_win td,
        .split-away_win td,
        .split-win td {
          background: #fbfefc;
        }

        .split-home_loss td,
        .split-away_loss td,
        .split-loss td {
          background: #fffdfd;
        }

        .split-home td {
          background: #fffefb;
        }

        .split-away td {
          background: #fcfdff;
        }

        .split-home_win td:first-child,
        .split-away_win td:first-child,
        .split-win td:first-child {
          background: #eef9f1;
          color: #2f6b41;
        }

        .split-home_loss td:first-child,
        .split-away_loss td:first-child,
        .split-loss td:first-child {
          background: #fdf1ef;
          color: #8f3c34;
        }

        .split-home td:first-child {
          background: #fff8ea;
          color: #8a6a1f;
        }

        .split-away td:first-child {
          background: #f1f6ff;
          color: #355c96;
        }

        .match-row td:first-child {
          max-width: 135px;
        }

        .team-name {
          color: #111;
        }

        .pts {
          color: #111;
          font-weight: 900;
        }

        @media (max-width: 1100px) {
          .record-grid {
            grid-template-columns: repeat(3, 1fr);
          }
        }

        @media (max-width: 900px) {
          .se {
            padding: 1rem;
          }

          .se-head {
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

          .record-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }
      `}</style>
    </div>
  );
}

function Kpi({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone?: "green" | "red";
}) {
  return (
    <div className={`kpi ${tone || ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
