import { boxOf, numeric, participation, ratio, sumKnown, type DataRow } from "@/lib/analytics/matches";
import { lnbFieldMap } from "@/lib/lnb-statistics-model";

export type ScoutingStats = Record<string, number | null>;
export function score(row: DataRow, side: "us" | "them") {
  const keys =
    side === "us"
      ? ["our_score", "us_score", "team_score", "score_for", "points_for"]
      : [
          "opponent_score",
          "them_score",
          "opponent_points",
          "score_against",
          "points_against",
        ];
  for (const key of keys) {
    const v = numeric(row[key]);
    if (v != null) return v;
  }
  return null;
}
function officialPlayer(row: DataRow) {
  return Object.fromEntries(
    Object.entries(lnbFieldMap).map(([key, field]) => [
      (
        { offReb: "off_reb", defReb: "def_reb", to: "turnovers" } as Record<
          string,
          string
        >
      )[key] || key,
      numeric(row[field]),
    ]),
  );
}

export const teamMetrics = [
  ["pointsFor", "Points marqués / match"],
  ["pointsAgainst", "Points encaissés / match"],
  ["p2pct", "2 PTS %"],
  ["p3pct", "3 PTS %"],
  ["p2m", "2 PTS réussis"], ["p2a", "2 PTS tentés"], ["p3m", "3 PTS réussis"],
  ["p3a", "3 PTS tentés"], ["ftm", "LF réussis"], ["fta", "LF tentés"],
  ["ftpct", "LF %"],
  ["off", "Rebonds offensifs"],
  ["def", "Rebonds défensifs"],
  ["ast", "Passes décisives"],
  ["to", "Ballons perdus"],
  ["reb", "Rebonds totaux"],
  ["stl", "Interceptions"],
  ["blk", "Contres"],
  ["pf", "Fautes"],
  ["fpf", "Fautes provoquées"],
] as const;

export function scoutingTeamStats(data: { matches: readonly DataRow[]; rows: readonly DataRow[] }, fixtures: readonly DataRow[], official?: DataRow | null) {
  const officialMatches = Array.isArray(official?.matches) ? official.matches as DataRow[] : [];
  const recordMatches = [fixtures, officialMatches, data.matches]
    .map(source => source.filter(match => score(match, "us") != null && score(match, "them") != null))
    .find(source => source.length) ?? [];
  const uniqueMatches = [...new Map(recordMatches.map((match, index) => [
    String(match.source_match_key || match.external_id || match.id || index), match,
  ])).values()];
  const ids = new Set(data.matches.map(match => String(match.id)));
  const codedRows = data.rows.filter(row => ids.has(String(row.match_id)) && row.present !== false);
  const codedGames = new Set(codedRows.map(row => row.match_id)).size;
  const officialRows = (official?.players || []).filter(
    (r: DataRow) => r.seasonTotals,
  );
  const sourceRows = officialRows.length
    ? officialRows.map((r: DataRow) => ({
        ...officialPlayer(r.seasonTotals),
        fpf: numeric(r.seasonTotals.s_fouls_on_average),
      }))
    : codedRows;
  const sourceBox = boxOf(sourceRows);
  const maxPlayerGames = Math.max(
    0,
    ...officialRows.map((r: DataRow) => numeric(r.s_games) || 0),
  );
  const teamGames = officialRows.length
    ? (numeric(official?.gamesPlayed) ?? (uniqueMatches.length >= maxPlayerGames ? uniqueMatches.length : 0))
    : codedGames;
  const autoStats: Record<string, number | null> = {
    reb: ratio(sumKnown(sourceRows, "reb"), teamGames),
    stl: ratio(sumKnown(sourceRows, "stl"), teamGames),
    blk: ratio(sumKnown(sourceRows, "blk"), teamGames),
    pf: ratio(sumKnown(sourceRows, "pf"), teamGames),
    fpf: ratio(sumKnown(sourceRows, "fpf"), teamGames),
    pointsFor: ratio(
      uniqueMatches.reduce((s, m) => s + score(m, "us")!, 0),
      uniqueMatches.length,
    ),
    pointsAgainst: ratio(
      uniqueMatches.reduce((s, m) => s + score(m, "them")!, 0),
      uniqueMatches.length,
    ),
    p2pct: ratio(sourceBox.p2m, sourceBox.p2a, 100),
    p3pct: ratio(sourceBox.p3m, sourceBox.p3a, 100),
    p2m: ratio(sourceBox.p2m, teamGames),
    p2a: ratio(sourceBox.p2a, teamGames),
    p3m: ratio(sourceBox.p3m, teamGames),
    p3a: ratio(sourceBox.p3a, teamGames),
    ftm: ratio(sourceBox.ftm, teamGames),
    fta: ratio(sourceBox.fta, teamGames),
    ftpct: ratio(sourceBox.ftm, sourceBox.fta, 100),
    off: ratio(sourceBox.off_reb, teamGames),
    def: ratio(sourceBox.def_reb, teamGames),
    ast: ratio(sourceBox.ast, teamGames),
    to: ratio(sourceBox.turnovers, teamGames),
  };
  return { uniqueMatches, officialRows, autoStats };
}

export function codedPlayerStats(data: { matches: readonly DataRow[]; rows: readonly DataRow[] }) {
  const matches = new Map(data.matches.map(match => [String(match.id), match]));
  const grouped = new Map<string, Map<string, DataRow>>();
  for (const row of data.rows) {
    const matchId = String(row.match_id);
    if (!matches.has(matchId) || !row.player_id || row.present === false) continue;
    const id = String(row.player_id);
    const rows = grouped.get(id) ?? new Map<string, DataRow>();
    rows.set(matchId, row);
    grouped.set(id, rows);
  }
  const stats = new Map<string, Record<string, number | null>>();
  for (const [id, playerRows] of grouped) {
    const rows = [...playerRows.values()];
    const played = participation(rows, matches)[id];
    const box = boxOf(rows);
    const avg = (key: string) => ratio(sumKnown(rows, key), played.games);
    const evaluation = rows.map(row => {
      const recorded = numeric(row.eval);
      if (recorded != null) return { value: recorded };
      const fields = ["pts", "reb", "ast", "stl", "blk", "p2a", "p2m", "p3a", "p3m", "fta", "ftm", "turnovers", "pf"];
      const values = fields.map(key => numeric(row[key]));
      if (!values.every((v): v is number => v != null)) return { value: null };
      const [pts, reb, ast, stl, blk, p2a, p2m, p3a, p3m, fta, ftm, turnovers, pf] = values;
      return { value: pts + reb + ast + stl + blk - Math.max(0, p2a - p2m)
        - Math.max(0, p3a - p3m) - Math.max(0, fta - ftm) - turnovers - pf };
    });
    stats.set(id, {
      MJ: played.games,
      "5D": played.startsKnown === played.games ? played.starts : null,
      MIN: ratio(played.seconds / 60, played.minutesKnown),
      PTS: avg("pts"), "2R": avg("p2m"), "2T": avg("p2a"), "2 %": ratio(box.p2m, box.p2a, 100),
      "3R": avg("p3m"), "3T": avg("p3a"), "3 %": ratio(box.p3m, box.p3a, 100),
      LFR: avg("ftm"), LFT: avg("fta"), "LF %": ratio(box.ftm, box.fta, 100),
      RO: avg("off_reb"), RD: avg("def_reb"), PD: avg("ast"), BP: avg("turnovers"),
      REB: avg("reb"), INT: avg("stl"), CTR: avg("blk"), F: avg("pf"), FP: avg("fpf"),
      "ÉVAL": ratio(sumKnown(evaluation, "value"), played.games), "+/−": avg("plus_minus"),
    });
  }
  return stats;
}

export function officialPlayerStats(published?: DataRow): ScoutingStats | null {
  return published && numeric(published.s_games) != null ? {
  MJ: numeric(published.s_games), "5D": numeric(published.s_games_started ?? published.seasonTotals?.s_games_started), MIN: numeric(published.s_minutes_average),
  PTS: numeric(published[lnbFieldMap.pts]),
  "2R": numeric(published[lnbFieldMap.p2m]), "2T": numeric(published[lnbFieldMap.p2a]), "2 %": numeric(published.s_two_pointers_percentage),
  "3R": numeric(published[lnbFieldMap.p3m]), "3T": numeric(published[lnbFieldMap.p3a]), "3 %": numeric(published.s_three_pointers_percentage),
  LFR: numeric(published[lnbFieldMap.ftm]), LFT: numeric(published[lnbFieldMap.fta]), "LF %": numeric(published.s_free_throws_percentage),
  RO: numeric(published[lnbFieldMap.offReb]), RD: numeric(published[lnbFieldMap.defReb]), PD: numeric(published[lnbFieldMap.ast]), BP: numeric(published[lnbFieldMap.to]),
  REB: numeric(published[lnbFieldMap.reb]), INT: numeric(published[lnbFieldMap.stl]), CTR: numeric(published[lnbFieldMap.blk]),
  F: numeric(published[lnbFieldMap.pf]), FP: numeric(published.s_fouls_on_average), "ÉVAL": numeric(published.s_efficiency_average), "+/−": numeric(published.s_plus_minus_points),
} : null;
}

export function formatScoutingStat(value: number) {
  return value.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}

export const compactPlayerMetrics = ["MIN", "PTS", "RO", "RD", "REB", "PD", "BP", "INT", "ÉVAL"] as const;

export function shotSplit(two: unknown, three: unknown) {
  const p2 = numeric(two), p3 = numeric(three);
  if (p2 == null || p3 == null || p2 < 0 || p3 < 0 || p2 + p3 === 0) return null;
  return { p2, p3, share2: p2 / (p2 + p3) };
}

export function scoutingTeamForm(matches: readonly DataRow[]) {
  const results = matches.flatMap(match => {
    const forPoints = score(match, "us"), against = score(match, "them");
    if (forPoints == null || against == null) return [];
    const location = match.home_away ?? match.homeAway;
    const venue = location === "home" ? "Domicile" : location === "away" ? "Extérieur"
      : typeof (match.home ?? match.is_home) === "boolean"
        ? (match.home ?? match.is_home) ? "Domicile" : "Extérieur" : "—";
    const outcome = forPoints > against ? "V" : forPoints < against ? "D" : "N";
    return [{
      id: String(match.source_match_key || match.id || ""),
      date: String(match.match_date ?? match.date ?? "").slice(0, 10),
      opponent: String(match.opponent || match.opponent_name || match.opponentName || "Adversaire non renseigné"),
      venue, outcome, forPoints, against,
    }];
  });
  const summaries = [
    ["Domicile", results.filter(match => match.venue === "Domicile")],
    ["Extérieur", results.filter(match => match.venue === "Extérieur")],
    ["Victoires", results.filter(match => match.outcome === "V")],
    ["Défaites", results.filter(match => match.outcome === "D")],
  ] as const;
  return {
    splits: summaries.map(([label, games]) => ({
      label, games: games.length,
      forPoints: ratio(games.reduce((sum, match) => sum + match.forPoints, 0), games.length),
      against: ratio(games.reduce((sum, match) => sum + match.against, 0), games.length),
    })),
    recent: results.filter(match => /^\d{4}-\d{2}-\d{2}$/.test(match.date))
      .sort((a, b) => b.date.localeCompare(a.date)).slice(0, 3),
  };
}
