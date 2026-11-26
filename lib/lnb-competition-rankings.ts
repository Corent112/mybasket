import { numeric, ratio, type DataRow } from "@/lib/analytics/matches";
import { officialPlayerStats, scoutingTeamStats, teamMetrics } from "@/lib/scouting-report-stats";

const playerMetrics = [
  ["PTS", "Points", "pts/match"],
  ["REB", "Rebonds", "reb/match"],
  ["RO", "Rebonds offensifs", "reb/match"],
  ["RD", "Rebonds défensifs", "reb/match"],
  ["PD", "Passes décisives", "pd/match"],
  ["INT", "Interceptions", "int/match"],
  ["CTR", "Contres", "ctr/match"],
  ["3R", "Paniers à 3 points réussis", "paniers/match"],
  ["ÉVAL", "Évaluation", "/match"],
] as const;

export type PlayerCompetitionRank = {
  id: number;
  name: string;
  metric: string;
  unit: string;
  rank: number;
  value: number;
};

export function lnbCompetitionRankings(teamId: number, standings: DataRow[], totals: DataRow[], averages: DataRow[]) {
  const teamRanks: Record<string, number> = {};
  const playerTopFive: PlayerCompetitionRank[] = [];
  const playedTeams = new Map(standings
    .filter(row => Number(row.team?.external_id) > 0 && Number(row.s_games) > 0)
    .map(row => [Number(row.team.external_id), row]));
  const games = numeric(playedTeams.get(teamId)?.s_games);
  if (playedTeams.size < 2 || !games) return { teamRanks, playerTopFive, playerRankingsAvailable: false };

  const teams = [...playedTeams].map(([id, row]) => {
    const official = {
      gamesPlayed: numeric(row.s_games),
      players: totals.filter(player => Number(player.team?.external_id) === id).map(seasonTotals => ({ seasonTotals })),
    };
    const { autoStats } = scoutingTeamStats({ matches: [], rows: [] }, [], official);
    return {
      id,
      stats: {
        ...autoStats,
        pointsFor: ratio(numeric(row.s_points), official.gamesPlayed),
        pointsAgainst: ratio(numeric(row.s_points_against), official.gamesPlayed),
      } as Record<string, number | null>,
    };
  });
  const target = teams.find(team => team.id === teamId)!;
  const lowerIsBetter = new Set(["pointsAgainst", "to", "pf"]);
  for (const [metric] of teamMetrics) {
    const value = target.stats[metric];
    if (value == null || teams.some(team => team.stats[metric] == null)) continue;
    teamRanks[metric] = 1 + teams.filter(team => lowerIsBetter.has(metric)
      ? team.stats[metric]! < value
      : team.stats[metric]! > value).length;
  }

  const byPlayer = new Map<number, Map<number, DataRow>>();
  const representedTeams = new Set<number>();
  for (const row of averages) {
    const id = Number(row.person?.external_id);
    const club = Number(row.team?.external_id);
    if (!Number.isSafeInteger(id) || id <= 0 || !playedTeams.has(club) || !(Number(row.s_games) > 0)) continue;
    const byTeam = byPlayer.get(id) ?? new Map();
    byTeam.set(club, row);
    byPlayer.set(id, byTeam);
    representedTeams.add(club);
  }
  if (representedTeams.size !== playedTeams.size) return { teamRanks, playerTopFive, playerRankingsAvailable: false };
  const players = [...byPlayer].map(([id, byTeam]) => {
    const stints = [...byTeam.values()].map(row => ({ games: Number(row.s_games), stats: officialPlayerStats(row) }));
    const games = stints.reduce((sum, stint) => sum + stint.games, 0);
    const person = byTeam.get(teamId)?.person;
    return { id, person, games, stints };
  });
  for (const [key, metric, unit] of playerMetrics) {
    const entries = players.flatMap(player => {
      if (player.stints.some(({ stats }) => stats?.[key] == null)) return [];
      const value = player.stints.length === 1 ? player.stints[0].stats![key]!
        : player.stints.reduce((sum, stint) => sum + stint.stats![key]! * stint.games, 0) / player.games;
      return [{ ...player, value }];
    }).sort((a, b) => b.value - a.value);
    let rank = 1;
    for (const [index, entry] of entries.entries()) {
      if (index > 0 && entry.value < entries[index - 1].value) rank = index + 1;
      if (rank > 5 || entry.value <= 0) break;
      if (!entry.person) continue;
      const name = [entry.person.first_name, entry.person.family_name].filter(Boolean).join(" ");
      if (name) playerTopFive.push({ id: entry.id, name, metric, unit, rank, value: entry.value });
    }
  }
  playerTopFive.sort((a, b) => a.rank - b.rank || a.name.localeCompare(b.name, "fr"));
  return { teamRanks, playerTopFive, playerRankingsAvailable: true };
}
