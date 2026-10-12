// Read-only presentation model. Official season totals never become fake matches.
const numeric = (value: unknown): number | null => value == null || value === "" || !Number.isFinite(Number(value)) ? null : Number(value);
export const lnbValue = numeric;
export function lnbIdentity(row: any) {
  const person = row?.person || {}, role = row?.player_role || {};
  return { dob: typeof person.dob === "string" ? person.dob.slice(0, 10) : "", age: numeric(person.age), taille: person.height == null ? "" : String(person.height), photo: person.photo?.md || person.photo?.sm || null, num: /^\d+$/.test(role.shirt_number || "") ? Number(role.shirt_number) : null, postePrincipal: role.playing_position || "", nationality: person.nationality || "" };
}
export function fillLnbIdentity(player: any, row: any) {
  if (!row) return player;
  const identity = lnbIdentity(row);
  return { ...identity, ...player, dob: player.dob || identity.dob, age: player.age ?? identity.age, taille: player.taille || identity.taille, photo: player.photo || identity.photo, num: player.num ?? identity.num, postePrincipal: player.postePrincipal || identity.postePrincipal, nationality: player.nationality || identity.nationality };
}
export const lnbFieldMap: Record<string, string> = { pts: "s_points_average", p2m: "s_two_pointers_made_average", p2a: "s_two_pointers_attempted_average", p3m: "s_three_pointers_made_average", p3a: "s_three_pointers_attempted_average", ftm: "s_free_throws_made_average", fta: "s_free_throws_attempted_average", offReb: "s_rebounds_offensive_average", defReb: "s_rebounds_defensive_average", reb: "s_rebounds_total_average", ast: "s_assists_average", stl: "s_steals_average", blk: "s_blocks_average", to: "s_turnovers_average", pf: "s_fouls_total_average" };
export function lnbSeasonTotals(row: any) {
  if (!row?.seasonTotals) return null;
  return Object.fromEntries(Object.entries(lnbFieldMap).map(([key, source]) => [key, numeric(row.seasonTotals[source]) ?? 0]));
}
export function combineLnbSeasons(local: any, seasons: any[]) {
  const eligible = seasons.filter(row => row?.seasonTotals && numeric(row.s_games) != null);
  if (!eligible.length) return local;
  const totals = { ...local.totals };
  let games = local.games, minutes = local.totalMinutes;
  let evaluation = local.matches.reduce((sum:number,m:any) => sum + (m.present ? m.eval : 0), 0);
  let plusMinus = local.matches.reduce((sum:number,m:any) => sum + (m.present ? m.plusMinus || 0 : 0), 0);
  let plusMinusKnown = local.matches.filter((m:any) => m.present).every((m:any) => m.plusMinus != null);
  for (const row of eligible) {
    const officialTotals = lnbSeasonTotals(row)!;
    for (const key of Object.keys(officialTotals)) totals[key] = (totals[key] || 0) + officialTotals[key];
    games += numeric(row.s_games) || 0;
    minutes += numeric(row.seasonTotals.s_minutes_average) || 0;
    evaluation += numeric(row.seasonTotals.s_efficiency_average) || 0;
    plusMinus += numeric(row.seasonTotals.s_plus_minus_points) || 0;
    plusMinusKnown = plusMinusKnown && row.seasonTotals.s_plus_minus_points != null;
  }
  const avg = (key: string) => games ? Math.round(totals[key] / games * 100) / 100 : 0;
  const pct = (made: number, attempted: number) => attempted ? Math.round(made / attempted * 10000) / 100 : 0;
  return { ...local, hasData: true, games, evaluationAverage:games ? Math.round(evaluation/games*100)/100 : 0, plusMinusAverage:plusMinusKnown && games ? Math.round(plusMinus/games*100)/100 : null, totalMinutes: minutes, averageMinutes: games ? Math.round(minutes / games * 100) / 100 : 0, totals, averages: { pts: avg("pts"), reb: avg("reb"), ast: avg("ast"), stl: avg("stl"), blk: avg("blk"), to: avg("to"), pf: avg("pf"), pctTir: pct(totals.p2m + totals.p3m, totals.p2a + totals.p3a), pct3pts: pct(totals.p3m, totals.p3a), pctLf: pct(totals.ftm, totals.fta) }, sourceLabel: local.games ? "LNB + matchs MyBasket hors compétition officielle" : "LNB", officialGames: eligible.reduce((sum, row) => sum + row.s_games, 0) };
}
export function isCoveredLnbMatch(match: any, season: any) {
  const category = String(match?.match_category || match?.project_state?.matchType || "").toLowerCase();
  const date = String(match?.match_date || "").slice(0, 10);
  if (["friendly", "amical", "cup", "coupe"].includes(category)) return false;
  const opponent = (v: unknown) => String(v || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/^espoirs?\s+/, "").replace(/[^a-z0-9]/g, "");
  if ((season.matches || []).some((g:any) => g.match_date === date && opponent(g.opponent) === opponent(match?.opponent))) return true;
  return ["championship", "league", "championnat"].includes(category) && date >= `${season.year}-07-01` && date < `${season.year + 1}-07-01`;
}
