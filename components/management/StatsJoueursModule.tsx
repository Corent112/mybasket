"use client";

import { useEffect, useMemo, useState } from "react";
import { loadPlayerMatchStats, completedPlayerMatchRows, summarizePlayerMatchRows, type PlayerMatchCategory } from "@/lib/player-match-stats";
import { createClient } from "@/lib/supabase/client";

const TEAMS_KEY = "mybasket_equipes";

type Player = {
  id: string;
  firstName?: string;
  lastName?: string;
  num?: string | number;
  numero?: string | number;
  photo?: string;
};

type Team = {
  id: string;
  name: string;
  players: Player[];
};

type PlayerStats = {
  playerId: string;
  games: number;
  pts: number;
  reb: number;
  fgm: number;
  fga: number;
  twoPm: number;
  twoPa: number;
  threePm: number;
  threePa: number;
  ftm: number;
  fta: number;
  off: number;
  def: number;
  ast: number;
  st: number;
  to: number;
  bs: number;
  pf: number;
  fpf: number;
};

const emptyStats = (playerId: string): PlayerStats => ({
  playerId,
  games: 0,
  pts: 0,
  reb: 0,
  fgm: 0,
  fga: 0,
  twoPm: 0,
  twoPa: 0,
  threePm: 0,
  threePa: 0,
  ftm: 0,
  fta: 0,
  off: 0,
  def: 0,
  ast: 0,
  st: 0,
  to: 0,
  bs: 0,
  pf: 0,
  fpf: 0,
});

function safeParse<T>(raw: string | null, fallback: T): T {
  if (!raw) return fallback;

  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function readTeams(): Team[] {
  if (typeof window === "undefined") return [];

  const data = safeParse<any>(localStorage.getItem(TEAMS_KEY), []);
  const arr = Array.isArray(data) ? data : data?.teams || [];

  return arr.map((team: any, index: number) => ({
    id: String(team.id ?? `team_${index}`),
    name: team.name ?? team.nom ?? "Équipe",
    players: (team.players ?? team.joueurs ?? []).map(
      (player: any, pIndex: number) => ({
        id: String(player.id ?? `player_${index}_${pIndex}`),
        firstName: player.firstName ?? player.prenom ?? "",
        lastName: player.lastName ?? player.nom ?? "",
        num: player.num ?? player.numero ?? "",
        numero: player.numero ?? player.num ?? "",
        photo: player.photo ?? "",
      })
    ),
  }));
}


function normalizeTeamName(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

async function loadAccessibleTeams(): Promise<Team[]> {
  const localTeams = readTeams();

  try {
    const supabase = createClient();

    // Les RLS de `teams` définissent les équipes réellement accessibles :
    // propriétaire + collaborations autorisées.
    const { data: teamRows, error: teamError } = await supabase
      .from("teams")
      .select("*")
      .order("name", { ascending: true });

    if (teamError || !teamRows?.length) {
      if (teamError) console.warn("Stats joueurs — équipes Supabase :", teamError);
      return localTeams;
    }

    const teamIds = teamRows
      .map((row: any) => String(row.id || ""))
      .filter(Boolean);

    let playerRows: any[] = [];
    if (teamIds.length) {
      const { data, error } = await supabase
        .from("players")
        .select("*")
        .in("team_id", teamIds);

      if (!error && data) playerRows = data;
      else if (error) console.warn("Stats joueurs — joueurs Supabase :", error);
    }

    const playersByTeam = new Map<string, Player[]>();
    for (const row of playerRows) {
      const currentTeamId = String(row.team_id || "");
      if (!currentTeamId) continue;

      const list = playersByTeam.get(currentTeamId) || [];
      list.push({
        id: String(row.id || ""),
        firstName: String(
          row.first_name ?? row.firstName ?? row.prenom ?? ""
        ),
        lastName: String(
          row.last_name ?? row.lastName ?? row.nom ?? ""
        ),
        num:
          row.number_jersey ??
          row.jersey_number ??
          row.number ??
          row.numero ??
          row.num ??
          "",
        numero:
          row.number_jersey ??
          row.jersey_number ??
          row.number ??
          row.numero ??
          row.num ??
          "",
        photo: String(
          row.photo_url ?? row.avatar_url ?? row.photo ?? ""
        ),
      });
      playersByTeam.set(currentTeamId, list);
    }

    const supabaseTeams: Team[] = teamRows.map((row: any) => {
      const id = String(row.id || "");
      return {
        id,
        name: String(row.name ?? row.nom ?? row.club_name ?? "Équipe"),
        players: playersByTeam.get(id) || [],
      };
    });

    // Supabase devient la référence. On conserve seulement une éventuelle équipe
    // locale qui n'existe vraiment pas encore côté Supabase.
    const supabaseIds = new Set(supabaseTeams.map((team) => team.id));
    const supabaseNames = new Set(
      supabaseTeams.map((team) => normalizeTeamName(team.name))
    );

    const localOnly = localTeams.filter(
      (team) =>
        !supabaseIds.has(team.id) &&
        !supabaseNames.has(normalizeTeamName(team.name))
    );

    return [...supabaseTeams, ...localOnly];
  } catch (error) {
    console.warn("Stats joueurs — chargement équipes accessible impossible :", error);
    return localTeams;
  }
}

function formatMadeAttempt(made: number, attempt: number) {
  return `${made}-${attempt}`;
}

function percent(made: number, attempt: number) {
  if (!attempt) return "0%";
  return `${Math.round((made / attempt) * 100)}%`;
}

function efficiency(stat: PlayerStats) {
  const reb = stat.reb;
  const pts = stat.pts;

  return (
    pts +
    reb +
    stat.ast +
    stat.st +
    stat.bs +
    stat.fpf -
    (stat.fga - stat.fgm) -
    (stat.fta - stat.ftm) -
    stat.to -
    stat.pf
  );
}

export default function StatsJoueursModule() {
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [matchRows, setMatchRows] = useState<Record<string, any>[]>([]);
  const [matchesById, setMatchesById] = useState(new Map<string, Record<string, any>>());
  const [matchCategory, setMatchCategory] = useState<PlayerMatchCategory>("all");
  const [statsError, setStatsError] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(true);
  const [displayMode, setDisplayMode] = useState<"cumulative" | "average">("cumulative");

  useEffect(() => {
    let active = true;

    async function loadTeams() {
      setLoadingTeams(true);
      const loadedTeams = await loadAccessibleTeams();
      if (!active) return;

      setTeams(loadedTeams);
      setTeamId((current) => {
        if (current && loadedTeams.some((team) => team.id === current)) {
          return current;
        }
        return loadedTeams[0]?.id || "";
      });
      setLoadingTeams(false);
    }

    loadTeams();

    return () => {
      active = false;
    };
  }, []);

  const selectedTeam = useMemo(
    () => teams.find((team) => team.id === teamId) || null,
    [teams, teamId]
  );

  useEffect(() => {
    if (!selectedTeam) return;
    let active = true;
    setLoading(true); setStatsError(""); setMatchRows([]); setMatchesById(new Map());
    void loadPlayerMatchStats(createClient(), selectedTeam.id).then(result => {
      if (active) { setMatchRows(result.rows); setMatchesById(result.matchesById); }
    }).catch(error => {
      if (active) setStatsError(error instanceof Error ? error.message : "Statistiques indisponibles.");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [selectedTeam]);

  const filteredRows = useMemo(() => completedPlayerMatchRows(matchRows, matchesById, matchCategory), [matchRows, matchesById, matchCategory]);
  const stats = useMemo(() => summarizePlayerMatchRows(filteredRows), [filteredRows]);
  const matchCount = new Set(filteredRows.map(row => String(row.match_id))).size;
  const shown = (value: number, games: number) => displayMode === "average"
    ? games ? (value / games).toLocaleString("fr-FR", { maximumFractionDigits: 1 }) : "—"
    : String(value);
  const shownPair = (made: number, attempts: number, games: number) => `${shown(made, games)}-${shown(attempts, games)}`;

  const totals = useMemo(() => {
    const result = emptyStats("totals");

    Object.values(stats).forEach((stat) => {
      result.pts += stat.pts;
      result.reb += stat.reb;
      result.fgm += stat.fgm;
      result.fga += stat.fga;
      result.twoPm += stat.twoPm;
      result.twoPa += stat.twoPa;
      result.threePm += stat.threePm;
      result.threePa += stat.threePa;
      result.ftm += stat.ftm;
      result.fta += stat.fta;
      result.off += stat.off;
      result.def += stat.def;
      result.ast += stat.ast;
      result.st += stat.st;
      result.to += stat.to;
      result.bs += stat.bs;
      result.pf += stat.pf;
      result.fpf += stat.fpf;
    });

    return result;
  }, [stats]);

  return (
    <div className="sj">
      <div className="sj-head">
        <div>
          <h3>Stats joueurs</h3>
          <p>
            Sélectionne une équipe pour charger les joueurs. Les données sont
            alimentées par les matchs terminés. Chaque moyenne utilise les matchs joués par le joueur.
          </p>
        </div>

        <div className="sj-controls">
          <div className="mode-toggle" role="group" aria-label="Affichage des statistiques">
            <button
              type="button"
              className={displayMode === "cumulative" ? "active" : ""}
              onClick={() => setDisplayMode("cumulative")}
            >
              Cumulées
            </button>
            <button
              type="button"
              className={displayMode === "average" ? "active" : ""}
              onClick={() => setDisplayMode("average")}
            >
              Moyenne
            </button>
          </div>
        <select aria-label="Type de matchs des statistiques joueurs" value={matchCategory} onChange={event => setMatchCategory(event.target.value as PlayerMatchCategory)}>
          <option value="all">Tous les matchs</option><option value="championship">Championnat</option><option value="cup">Coupe</option><option value="friendly">Amical</option>
        </select>
        <select
          value={teamId}
          onChange={(e) => setTeamId(e.target.value)}
          disabled={loadingTeams}
        >
          {loadingTeams && <option value="">Chargement des équipes…</option>}
          {!loadingTeams && teams.length === 0 && (
            <option value="">Aucune équipe</option>
          )}
          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
        </div>
      </div>

      {loading && <div className="sj-empty">Chargement des stats...</div>}

      {!loadingTeams && !loading && !selectedTeam && (
        <div className="sj-empty">
          Aucune équipe trouvée. Crée d’abord une équipe dans “Mes Équipes”.
        </div>
      )}

      {statsError && <div className="sj-empty" role="alert">Statistiques indisponibles : {statsError}</div>}
      {!loading && selectedTeam && !statsError && (
        <div className="sj-table-wrap">
          <table className="sj-table">
            <thead>
              <tr>
                <th>Player</th>
                <th title="Nombre de matchs joués">MJ</th>
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
              {selectedTeam.players.map((player) => {
                const stat = stats[player.id] || emptyStats(player.id);
                const reb = stat.reb;
                const pts = stat.pts;

                return (
                  <tr key={player.id}>
                    <td className="player">
                      <span className="avatar">
                        {player.photo ? (
                          <img src={player.photo} alt="" />
                        ) : (
                          player.firstName?.[0] || "?"
                        )}
                      </span>

                      <strong>
                        {player.num || player.numero
                          ? `#${player.num || player.numero} `
                          : ""}
                        {player.firstName} {player.lastName}
                      </strong>
                    </td>

                    <td>{stat.games}</td>
                    <td>{shownPair(stat.fgm, stat.fga, stat.games)}</td>
                    <td>{shownPair(stat.twoPm, stat.twoPa, stat.games)}</td>
                    <td>{shownPair(stat.threePm, stat.threePa, stat.games)}</td>
                    <td>{shownPair(stat.ftm, stat.fta, stat.games)}</td>
                    <td>{shown(stat.off, stat.games)}</td>
                    <td>{shown(stat.def, stat.games)}</td>
                    <td>{shown(reb, stat.games)}</td>
                    <td>{shown(stat.ast, stat.games)}</td>
                    <td>{shown(stat.st, stat.games)}</td>
                    <td>{shown(stat.to, stat.games)}</td>
                    <td>{shown(stat.bs, stat.games)}</td>
                    <td>{shown(stat.pf, stat.games)}</td>
                    <td>{shown(stat.fpf, stat.games)}</td>
                    <td>{shown(efficiency(stat), stat.games)}</td>
                    <td className="pts">{shown(pts, stat.games)}</td>
                  </tr>
                );
              })}

              <tr className="totals">
                <td>{displayMode === "average" ? "Équipe / match" : "Totaux équipe"}</td>
                <td>{matchCount}</td>
                <td>{shownPair(totals.fgm, totals.fga, matchCount)}</td>
                <td>{shownPair(totals.twoPm, totals.twoPa, matchCount)}</td>
                <td>{shownPair(totals.threePm, totals.threePa, matchCount)}</td>
                <td>{shownPair(totals.ftm, totals.fta, matchCount)}</td>
                <td>{shown(totals.off, matchCount)}</td>
                <td>{shown(totals.def, matchCount)}</td>
                <td>{shown(totals.reb, matchCount)}</td>
                <td>{shown(totals.ast, matchCount)}</td>
                <td>{shown(totals.st, matchCount)}</td>
                <td>{shown(totals.to, matchCount)}</td>
                <td>{shown(totals.bs, matchCount)}</td>
                <td>{shown(totals.pf, matchCount)}</td>
                <td>{shown(totals.fpf, matchCount)}</td>
                <td>{shown(efficiency(totals), matchCount)}</td>
                <td className="pts">
                  {shown(totals.pts, matchCount)}
                </td>
              </tr>

              <tr className="percentages">
                <td>Pourcentages</td>
                <td>—</td>
                <td>{percent(totals.fgm, totals.fga)}</td>
                <td>{percent(totals.twoPm, totals.twoPa)}</td>
                <td>{percent(totals.threePm, totals.threePa)}</td>
                <td>{percent(totals.ftm, totals.fta)}</td>
                <td colSpan={11}></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        .sj {
          width: 100%;
          background: white;
          border: 1px solid #efe6db;
          border-radius: 18px;
          padding: 1.2rem;
          box-shadow: 0 12px 34px rgba(60, 30, 20, 0.06);
        }

        .sj-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
          margin-bottom: 1rem;
        }

        .sj-head h3 {
          margin: 0;
          color: #6b1a2c;
          font-size: 1.5rem;
          font-weight: 900;
        }

        .sj-head p {
          margin: 0.25rem 0 0;
          color: #7c7470;
          font-size: 0.9rem;
        }

        .sj-controls { display:flex; align-items:center; gap:.65rem; flex-wrap:wrap; justify-content:flex-end; }
        .mode-toggle { display:flex; padding:3px; border:1px solid #eadccc; border-radius:11px; background:#fff8ef; }
        .mode-toggle button { border:0; background:transparent; color:#6b1a2c; padding:.55rem .8rem; border-radius:8px; font-weight:900; cursor:pointer; }
        .mode-toggle button.active { background:#6b1a2c; color:white; box-shadow:0 3px 10px rgba(107,26,44,.18); }

        select {
          border: 1px solid #eadccc;
          border-radius: 10px;
          padding: 0.65rem 0.9rem;
          font-weight: 900;
          color: #6b1a2c;
          background: white;
          min-width: 220px;
        }

        .sj-empty {
          background: #fff8ef;
          border: 1px dashed #d4a24c;
          border-radius: 14px;
          padding: 1.2rem;
          color: #6b1a2c;
          font-weight: 900;
        }

        .sj-table-wrap {
          width: 100%;
          overflow-x: auto;
          border: 1px solid #e6e1dc;
          border-radius: 14px;
        }

        .sj-table {
          width: 100%;
          min-width: 1180px;
          border-collapse: collapse;
          font-size: 0.86rem;
        }

        th {
          background: linear-gradient(180deg, #6b1a2c, #49101d);
          color: white;
          padding: 0.75rem 0.65rem;
          text-align: center;
          white-space: nowrap;
          font-weight: 900;
        }

        th:first-child {
          text-align: left;
          min-width: 230px;
        }

        td {
          padding: 0.75rem 0.65rem;
          border-bottom: 1px solid #eee;
          text-align: center;
          white-space: nowrap;
        }

        td:first-child {
          text-align: left;
        }

        tbody tr:nth-child(even) {
          background: #fafafa;
        }

        .player {
          display: flex;
          align-items: center;
          gap: 0.6rem;
        }

        .avatar {
          width: 30px;
          height: 30px;
          border-radius: 50%;
          background: #6b1a2c;
          color: #d4a24c;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          font-weight: 900;
          overflow: hidden;
          flex: 0 0 auto;
        }

        .avatar img {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .pts {
          color: #d4a24c;
          font-weight: 900;
        }

        .totals {
          background: #f5efe6 !important;
          font-weight: 900;
        }

        .percentages {
          background: #fff8ef !important;
          color: #6b1a2c;
          font-weight: 900;
        }

        @media (max-width: 800px) {
          .sj-head {
            flex-direction: column;
          }

          select {
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}