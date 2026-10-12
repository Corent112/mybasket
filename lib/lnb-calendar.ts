// Public calendar API used by lnb.fr. Tokens remain server-side.
type LnbTeam = { external_id: number; team_name: string; score_string?: string };
type LnbGame = { external_id: number; competition_abbrev: string; competition_name: string; match_date: string; match_time_utc?: string; match_status: string; display_round?: string; round_number?: number; teams: LnbTeam[]; is_next?: boolean };
const ABBREVIATIONS = new Set(["ESPA", "ESPB", "PROA", "PROB"]);
async function request(url: string, init?: RequestInit) {
  const response = await fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`LNB indisponible (${response.status}).`);
  return response.json();
}
export async function readLnbCalendar(sourceUrl: string) {
  const source = new URL(sourceUrl);
  if (!["lnb.fr", "www.lnb.fr"].includes(source.hostname) || source.protocol !== "https:" || !/^\/fr\/calendar(?:\/[a-z0-9-]+)?\/?$/i.test(source.pathname)) throw new Error("Lien calendrier LNB invalide.");
  const abbrev = source.searchParams.get("abbrev") || "";
  const year = Number(source.searchParams.get("yid"));
  const teamId = Number(source.searchParams.get("tid") || 0);
  if (!ABBREVIATIONS.has(abbrev) || !Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isSafeInteger(teamId) || teamId < 0) throw new Error("Choisissez un championnat et une saison LNB valides.");
  const credentials = await request("https://lnb.fr/api/token");
  if (typeof credentials.token !== "string" || !credentials.token) throw new Error("Accès calendrier LNB indisponible.");
  const games = new Map<number, LnbGame>();
  let anchor = 0;
  for (let page = 0; page < 20; page++) {
    const body: Record<string, string | number> = { year, competition_abbrev: abbrev, division_external_id: 0, team_external_id: teamId, round_number: 0, phase_id: 0, tournament_number: 0, direction: page ? "next" : "initial", limit: 100 };
    if (anchor) body.anchor_match_external_id = anchor;
    const result = await request("https://api-prod.lnb.fr/match/v3/getCalendar", { method: "POST", headers: { "Content-Type": "application/json", device_type: "web", language_code: "fr", Authorization: `Bearer ${credentials.token}` }, body: JSON.stringify(body) });
    if (result.status !== true || !Array.isArray(result.data)) throw new Error("Réponse calendrier LNB invalide.");
    const rows: LnbGame[] = result.data.flatMap((day: { data?: LnbGame[] }) => Array.isArray(day.data) ? day.data : []);
    for (const game of rows) if (game.competition_abbrev === abbrev && Array.isArray(game.teams) && game.teams.length === 2) games.set(game.external_id, game);
    const last = rows.at(-1);
    if (!last || !last.is_next) break;
    if (last.external_id === anchor) throw new Error("La pagination LNB ne progresse plus.");
    anchor = last.external_id;
    if (page === 19) throw new Error("Calendrier LNB incomplet : import annulé.");
  }
  const rows = Array.from(games.values());
  if (!teamId) {
    const teams = new Map<number, string>();
    rows.forEach(game => game.teams.forEach(team => teams.set(team.external_id, team.team_name)));
    return { mode: "choose-team", sourceUrl, teams: Array.from(teams, ([id, name]) => { const url = new URL(source); url.searchParams.set("tid", String(id)); return { name, url: url.toString() }; }).sort((a, b) => a.name.localeCompare(b.name, "fr")) };
  }
  const own = rows.flatMap(game => game.teams).find(team => Number(team.external_id) === teamId);
  if (!own) throw new Error("Équipe absente de ce championnat LNB pour cette saison.");
  const matches = rows.filter(game => game.teams.some(team => Number(team.external_id) === teamId)).map(game => {
    const home = Number(game.teams[0].external_id) === teamId;
    const us = game.teams[home ? 0 : 1], them = game.teams[home ? 1 : 0];
    const played = game.match_status === "COMPLETE";
    const parts = game.match_time_utc ? new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(game.match_time_utc)) : [];
    const part = (type: string) => parts.find(item => item.type === type)?.value || "";
    const score = (team: LnbTeam) => played && /^\d+$/.test(team.score_string || "") ? Number(team.score_string) : null;
    return { sourceKey: `lnb:${abbrev}:${year}:${game.external_id}`, round: game.display_round || (game.round_number ? `J${game.round_number}` : ""), date: parts.length ? `${part("year")}-${part("month")}-${part("day")}` : game.match_date, time: parts.length ? `${part("hour")}:${part("minute")}` : "", homeAway: home ? "home" : "away", opponent: them.team_name, ourScore: score(us), opponentScore: score(them) };
  }).sort((a, b) => `${a.date} ${a.time}`.localeCompare(`${b.date} ${b.time}`));
  return { mode: "team", team: own.team_name, competition: rows[0]?.competition_name || abbrev, pool: "", phase: "", sourceUrl: source.toString(), matches, classementText: "", ranking: null, updatedAt: new Date().toISOString(), transport: "lnb-api" };
}
