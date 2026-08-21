"use client";

import { useEffect, useMemo, useState } from "react";
import { getTeamPlayerStats } from "@/lib/stats-supabase";
import { createClient } from "@/lib/supabase/client";

const LIVE_STATS_KEY = "mybasket_live_stats";
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
  const reb = stat.off + stat.def;
  const pts = stat.twoPm * 2 + stat.threePm * 3 + stat.ftm;

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
  const [stats, setStats] = useState<Record<string, PlayerStats>>({});
  const [loading, setLoading] = useState(false);
  const [loadingTeams, setLoadingTeams] = useState(true);

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

    const loadStats = async () => {
      setLoading(true);

      const supabaseStats = await getTeamPlayerStats(selectedTeam.id);

      const saved = safeParse<Record<string, Record<string, PlayerStats>>>(
        localStorage.getItem(LIVE_STATS_KEY),
        {}
      );

      const localTeamStats = saved[selectedTeam.id] || {};
      const next: Record<string, PlayerStats> = {};

      selectedTeam.players.forEach((player) => {
        next[player.id] =
          supabaseStats[player.id] ||
          localTeamStats[player.id] ||
          emptyStats(player.id);
      });

      setStats(next);
      setLoading(false);
    };

    loadStats();
  }, [selectedTeam]);

  const totals = useMemo(() => {
    const result = emptyStats("totals");

    Object.values(stats).forEach((stat) => {
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
            alimentées par la prise de stats live.
          </p>
        </div>

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

      {loading && <div className="sj-empty">Chargement des stats...</div>}

      {!loadingTeams && !loading && !selectedTeam && (
        <div className="sj-empty">
          Aucune équipe trouvée. Crée d’abord une équipe dans “Mes Équipes”.
        </div>
      )}

      {!loading && selectedTeam && (
        <div className="sj-table-wrap">
          <table className="sj-table">
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
              {selectedTeam.players.map((player) => {
                const stat = stats[player.id] || emptyStats(player.id);
                const reb = stat.off + stat.def;
                const pts = stat.twoPm * 2 + stat.threePm * 3 + stat.ftm;

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

                    <td>{formatMadeAttempt(stat.fgm, stat.fga)}</td>
                    <td>{formatMadeAttempt(stat.twoPm, stat.twoPa)}</td>
                    <td>{formatMadeAttempt(stat.threePm, stat.threePa)}</td>
                    <td>{formatMadeAttempt(stat.ftm, stat.fta)}</td>
                    <td>{stat.off}</td>
                    <td>{stat.def}</td>
                    <td>{reb}</td>
                    <td>{stat.ast}</td>
                    <td>{stat.st}</td>
                    <td>{stat.to}</td>
                    <td>{stat.bs}</td>
                    <td>{stat.pf}</td>
                    <td>{stat.fpf}</td>
                    <td>{efficiency(stat)}</td>
                    <td className="pts">{pts}</td>
                  </tr>
                );
              })}

              <tr className="totals">
                <td>Totals</td>
                <td>{formatMadeAttempt(totals.fgm, totals.fga)}</td>
                <td>{formatMadeAttempt(totals.twoPm, totals.twoPa)}</td>
                <td>{formatMadeAttempt(totals.threePm, totals.threePa)}</td>
                <td>{formatMadeAttempt(totals.ftm, totals.fta)}</td>
                <td>{totals.off}</td>
                <td>{totals.def}</td>
                <td>{totals.off + totals.def}</td>
                <td>{totals.ast}</td>
                <td>{totals.st}</td>
                <td>{totals.to}</td>
                <td>{totals.bs}</td>
                <td>{totals.pf}</td>
                <td>{totals.fpf}</td>
                <td>{efficiency(totals)}</td>
                <td className="pts">
                  {totals.twoPm * 2 + totals.threePm * 3 + totals.ftm}
                </td>
              </tr>

              <tr className="percentages">
                <td>Pourcentages</td>
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