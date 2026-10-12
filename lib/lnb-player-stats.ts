// Fields and requests verified against the public API used by lnb.fr.
const divisions: Record<string, number> = { PROA: 1, PROB: 2, ESPA: 3, ESPB: 4 };
const cache = new Map<string, { expires: number; value: any }>();
async function request(path: string, token: string, body?: Record<string, unknown>) {
  const response = await fetch(`https://api-prod.lnb.fr/${path}`, {
    method: body ? "POST" : "GET", cache: "no-store", redirect: "error",
    headers: { Authorization: `Bearer ${token}`, device_type: "web", language_code: "fr", "Content-Type": "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`Statistiques LNB indisponibles (${response.status}).`);
  const result = await response.json();
  if (result.status !== true) throw new Error("Réponse statistiques LNB invalide.");
  return result.data;
}
export function normalizeLnbName(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");
}
export function resolveLnbPlayer(person: any, players: any[], links: Record<string, string | null>) {
  const externalId = String(person.external_id);
  if (Object.prototype.hasOwnProperty.call(links, externalId)) return players.find(p => p.id === links[externalId])?.id || null;
  const name = normalizeLnbName(`${person.first_name} ${person.family_name}`);
  const matches = players.filter(p => normalizeLnbName(`${p.first_name || p.metadata?.firstName || ""} ${p.last_name || p.metadata?.lastName || ""}`) === name);
  return matches.length === 1 ? matches[0].id : null;
}
export async function readLnbPlayerStats(sourceUrl: string, personId?: number, refresh = false) {
  const source = new URL(sourceUrl);
  const abbrev = source.searchParams.get("abbrev") || "";
  const year = Number(source.searchParams.get("yid"));
  const teamId = Number(source.searchParams.get("tid"));
  if (source.protocol !== "https:" || !["lnb.fr", "www.lnb.fr"].includes(source.hostname) || !divisions[abbrev] || !Number.isInteger(year) || year < 2000 || year > 2100 || !Number.isSafeInteger(teamId) || teamId <= 0) throw new Error("Connecte d’abord le club et la saison LNB de cette équipe.");
  const key = `${abbrev}:${year}:${teamId}:${personId || "all"}`;
  const previous = cache.get(key);
  if (!refresh && previous && previous.expires > Date.now()) return previous.value;
  const credentials = await fetch("https://lnb.fr/api/token", { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(15000) });
  if (!credentials.ok) throw new Error("Accès LNB indisponible.");
  const { token } = await credentials.json();
  if (typeof token !== "string" || !token) throw new Error("Accès LNB indisponible.");
  const competitions = await request(`competition/getDivisionCompetitionByYear?year=${year}&division_external_id=${divisions[abbrev]}`, token);
  const competition = competitions.find((item: any) => Number(item.year) === year && (item.competition_abbrev === abbrev || normalizeLnbName(item.competition_name || "") === ({ ESPA: "espoirselite", ESPB: "espoirselite2", PROA: "betclicelite", PROB: "elite2" } as Record<string, string>)[abbrev]));
  if (!competition) throw new Error("Championnat LNB introuvable pour cette saison.");
  const [rows, roster] = await Promise.all([
    request("altrstats/getPersonCriterion", token, { competitionExternalId: competition.external_id, year, format: "average", criterion: "sPoints" }),
    request(`teams/getRoster?team_external_id=${teamId}&year=${year}`, token),
  ]);
  if (!Array.isArray(rows)) throw new Error("Liste des statistiques LNB invalide.");
  const players = rows.filter((row: any) => Number(row.team?.external_id) === teamId).map((row: any) => {
    const identity = Array.isArray(roster) ? roster.find((p: any) => p.person?.external_id === row.person?.external_id) : null;
    return { ...row, person: { ...identity?.person, ...row.person }, player_role: identity?.player_role };
  });
  if (Array.isArray(roster)) for (const player of roster) {
    if (Number.isSafeInteger(player.person?.external_id) && !players.some((p: any) => p.person.external_id === player.person.external_id)) players.push({ person: player.person, player_role: player.player_role, team: { external_id: teamId, team_name: players[0]?.team?.team_name || "" } });
  }
  let detail = null;
  if (personId) {
    if (!players.some((row: any) => Number(row.person?.external_id) === personId)) throw new Error("Ce joueur n’a pas de statistiques dans cette équipe et cette saison.");
    const published = players.find((row: any) => Number(row.person?.external_id) === personId)?.s_games != null;
    if (!published) {
      return { sourceUrl, year, competition: competition.competition_name, players, detail: { general_game_log: [] }, updatedAt: new Date().toISOString() };
    }
    detail = await request("person/getPersonSeasonAll", token, { competition_external_id: competition.external_id, team_external_id: teamId, person_external_id: personId, format: "average" });
    if (detail?.general?.competition?.competition_abbrev !== abbrev || !Array.isArray(detail.general_game_log)) throw new Error("Détail LNB incompatible avec le championnat choisi.");
  }
  const value = { sourceUrl, year, competition: competition.competition_name, players, detail, updatedAt: new Date().toISOString() };
  if (cache.size > 100) cache.clear();
  cache.set(key, { value, expires: Date.now() + 300000 });
  return value;
}
