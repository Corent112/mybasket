// lib/equipes-store.ts
// Store équipes 100% Supabase.

import { createClient } from "@/lib/supabase/client";
import type {
  MatchPlayerLine,
  MatchRecord,
  Player,
  PlayerAggStats,
  Team,
  TeamMatch,
  UserProfile,
} from "../types/player";
import { emptyProfile } from "../types/player";

function uid(prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${prefix}_${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 7)}`;
}

function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function asText(value: unknown): string {
  return String(value ?? "").trim();
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function idsMatch(a: unknown, b: unknown): boolean {
  const aa = asText(a);
  const bb = asText(b);
  return !!aa && !!bb && aa === bb;
}

function isUuid(value: string | null | undefined): boolean {
  return (
    !!value &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
      value
    )
  );
}

function logSupabaseError(context: string, error: any, payload?: unknown): void {
  console.error("══════════════════════════════");
  console.error(context);
  console.error("Code    :", error?.code);
  console.error("Message :", error?.message);
  console.error("Details :", error?.details);
  console.error("Hint    :", error?.hint);
  if (payload !== undefined) console.error("Payload :", payload);
  console.error(error);
  console.error("══════════════════════════════");
}

async function getUserId(): Promise<string> {
  const supabase = createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Utilisateur non connecté");
  }

  return user.id;
}

function normalizeTeamRow(row: any): Team {
  const data =
    row?.metadata && typeof row.metadata === "object"
      ? row.metadata
      : row?.data && typeof row.data === "object"
        ? row.data
        : {};

  const players = Array.isArray(row?.players)
    ? row.players.map(normalizePlayerRow)
    : Array.isArray(data.players)
      ? data.players
      : [];

  const matchs = Array.isArray(row?.matches)
    ? row.matches.map(normalizeMatchRow)
    : Array.isArray(data.matchs)
      ? data.matchs
      : [];

  const statsHistory = Array.isArray(row?.stats_history)
    ? row.stats_history.map(normalizeStatMatchRow)
    : Array.isArray(data.statsHistory)
      ? data.statsHistory
      : [];

  return {
    ...data,
    id: row.id,
    supabaseTeamId: row.id,
    supabase_team_id: row.id,
    name: row.name ?? data.name ?? "",
    cat: row.category ?? data.cat ?? data.category ?? "",
    category: row.category ?? data.category ?? data.cat ?? "",
    coach: row.coach_name ?? row.coach ?? data.coach ?? data.coach_name ?? "",
    logo:
      row.club_logo_url ??
      row.logo_url ??
      data.logo ??
      data.logo_url ??
      data.club_logo_url ??
      null,
    banniere: row.banner_url ?? data.banniere ?? data.banner_url ?? null,
    players,
    matchs,
    statsHistory,
    teamStats:
      data.teamStats ?? {
        wins: 0,
        losses: 0,
        draws: 0,
        ptsFor: 0,
        ptsAgainst: 0,
      },
    kpi:
      data.kpi ?? {
        presenceMoyennePct: 0,
        matchsJoues: statsHistory.length,
        victoires: 0,
        defaites: 0,
        pointsMoyenne: 0,
        progressionPct: 0,
      },
  } as Team;
}

function normalizePlayerRow(row: any): Player {
  const data =
    row?.metadata && typeof row.metadata === "object"
      ? row.metadata
      : row?.data && typeof row.data === "object"
        ? row.data
        : {};

  return {
    ...data,
    id: row.id,
    supabasePlayerId: row.id,
    supabase_player_id: row.id,
    player_id: row.id,
    firstName: row.first_name ?? data.firstName ?? "",
    lastName: row.last_name ?? data.lastName ?? "",
    num: row.number ?? data.num ?? null,
    photo: row.photo_url ?? data.photo ?? null,
    postePrincipal: row.position ?? data.postePrincipal ?? "",
    posteSecondaire: row.secondary_position ?? data.posteSecondaire ?? "",
    statut: row.status ?? data.statut ?? "Disponible",
    presencePct: row.presence_pct ?? data.presencePct ?? 0,
    stats:
      data.stats ?? {
        pts: 0,
        reb: 0,
        ast: 0,
        stl: 0,
        blk: 0,
        to: 0,
        pctTir: 0,
        pct3pts: 0,
        pctLf: 0,
      },
    evolution: data.evolution ?? [],
  } as Player;
}

function normalizeMatchRow(row: any): TeamMatch {
  const data =
    row?.metadata && typeof row.metadata === "object"
      ? row.metadata
      : row?.data && typeof row.data === "object"
        ? row.data
        : {};

  return {
    ...data,
    id: row.id,
    kind: row.kind ?? data.kind ?? "Match",
    date: row.match_date ?? row.date ?? data.date ?? "",
    heure: row.start_time ? String(row.start_time).slice(0, 5) : data.heure ?? "",
    adversaire: row.opponent ?? data.adversaire ?? "",
    domicile: row.home ?? data.domicile ?? true,
  } as TeamMatch;
}

function normalizeStatMatchRow(row: any): MatchRecord {
  const data =
    row?.metadata && typeof row.metadata === "object"
      ? row.metadata
      : row?.data && typeof row.data === "object"
        ? row.data
        : {};

  return {
    ...data,
    id: row.id,
    date: row.match_date ?? row.date ?? data.date ?? "",
    opponent: row.opponent ?? row.opponent_name ?? data.opponent ?? "",
    scoreUs: row.score_us ?? row.us ?? data.scoreUs ?? 0,
    scoreThem: row.score_them ?? row.them ?? data.scoreThem ?? 0,
    source: row.source ?? data.source ?? "live",
    players: Array.isArray(row.lines)
      ? row.lines
      : Array.isArray(data.players)
        ? data.players
        : [],
  } as MatchRecord;
}

function teamPayload(team: Team, userId: string) {
  return {
    id: isUuid(team.id) ? team.id : undefined,
    user_id: userId,
    name: team.name ?? "",
    club_name: (team as any).clubName ?? (team as any).club_name ?? team.name ?? "",
    category: (team as any).category ?? (team as any).cat ?? "",
    coach_name: team.coach ?? (team as any).coach_name ?? "",
    club_logo_url: team.logo ?? (team as any).club_logo_url ?? null,
    banner_url: (team as any).banniere ?? (team as any).banner_url ?? null,
    wins: (team as any).teamStats?.wins ?? 0,
    losses: (team as any).teamStats?.losses ?? 0,
    draws: (team as any).teamStats?.draws ?? 0,
    pts_for: (team as any).teamStats?.ptsFor ?? 0,
    pts_against: (team as any).teamStats?.ptsAgainst ?? 0,
    metadata: {
      ...team,
      players: undefined,
      matchs: undefined,
      statsHistory: undefined,
    },
    updated_at: new Date().toISOString(),
  };
}

function playerPayload(teamId: string, player: Player, userId: string) {
  return {
    id: isUuid(player.id) ? player.id : undefined,
    user_id: userId,
    team_id: teamId,
    first_name: player.firstName ?? "",
    last_name: player.lastName ?? "",
    number: player.num ?? null,
    photo_url: player.photo ?? null,
    position: player.postePrincipal ?? "",
    secondary_position: player.posteSecondaire ?? "",
    status: player.statut ?? "Disponible",
    presence_pct: player.presencePct ?? 0,
    metadata: player,
    updated_at: new Date().toISOString(),
  };
}

function matchPayload(teamId: string, match: TeamMatch, userId: string) {
  return {
    id: isUuid(match.id) ? match.id : undefined,
    user_id: userId,
    team_id: teamId,
    kind: match.kind ?? "Match",
    match_date: match.date || null,
    start_time: match.heure || null,
    opponent: match.adversaire || null,
    home: match.domicile ?? true,
    data: match,
    updated_at: new Date().toISOString(),
  };
}

function statMatchPayload(teamId: string, record: MatchRecord, userId: string) {
  return {
    id: isUuid(record.id) ? record.id : undefined,
    user_id: userId,
    team_id: teamId,
    match_date: record.date || null,
    opponent: record.opponent || null,
    score_us: safeNumber(record.scoreUs),
    score_them: safeNumber(record.scoreThem),
    source: record.source || "live",
    lines: (record.players || []).map(normalizeMatchLine),
    data: {
      ...record,
      players: (record.players || []).map(normalizeMatchLine),
    },
    updated_at: new Date().toISOString(),
  };
}

function playerMatchesId(
  player: Player,
  id: string | number | null | undefined
): boolean {
  const wanted = asText(id);
  if (!wanted) return false;

  const p = player as Player & {
    supabasePlayerId?: string | null;
    supabase_player_id?: string | null;
    player_id?: string | null;
    dbId?: string | null;
    db_id?: string | null;
  };

  return [
    p.id,
    p.supabasePlayerId,
    p.supabase_player_id,
    p.player_id,
    p.dbId,
    p.db_id,
  ].some((value) => idsMatch(value, wanted));
}

function findPlayerByAnyId(
  team: Team,
  playerId: string | number
): Player | undefined {
  return (team.players || []).find((player: Player) =>
    playerMatchesId(player, playerId)
  );
}

/* -------------------------------------------------------------------------- */
/*                                  ÉQUIPES                                   */
/* -------------------------------------------------------------------------- */

export async function getTeams(): Promise<Team[]> {
  const supabase = createClient();
  const userId = await getUserId();

  const { data: teamsData, error: teamsError } = await supabase
    .from("teams")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });

  if (teamsError) {
    logSupabaseError("Erreur chargement teams", teamsError);
    throw teamsError;
  }

  const teams: Team[] = (teamsData ?? []).map(normalizeTeamRow);

  if (!teams.length) return [];

  const teamIds = teams
    .map((team: Team) => team.id)
    .filter((id): id is string => Boolean(id));

  const [
    { data: playersData, error: playersError },
    { data: matchesData, error: matchesError },
    { data: statsData, error: statsError },
  ] = await Promise.all([
    supabase
      .from("players")
      .select("*")
      .in("team_id", teamIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("team_matches")
      .select("*")
      .in("team_id", teamIds)
      .order("match_date", { ascending: true }),
    supabase
      .from("match_stats")
      .select("*")
      .in("team_id", teamIds)
      .order("match_date", { ascending: true }),
  ]);

  if (playersError) logSupabaseError("Erreur chargement players", playersError);
  if (matchesError) logSupabaseError("Erreur chargement team_matches", matchesError);
  if (statsError) logSupabaseError("Erreur chargement match_stats", statsError);

  const playersByTeam = new Map<string, Player[]>();
  const matchesByTeam = new Map<string, TeamMatch[]>();
  const statsByTeam = new Map<string, MatchRecord[]>();

  (playersData ?? []).forEach((row: any) => {
    const teamId = String(row.team_id);
    if (!playersByTeam.has(teamId)) playersByTeam.set(teamId, []);
    playersByTeam.get(teamId)?.push(normalizePlayerRow(row));
  });

  (matchesData ?? []).forEach((row: any) => {
    const teamId = String(row.team_id);
    if (!matchesByTeam.has(teamId)) matchesByTeam.set(teamId, []);
    matchesByTeam.get(teamId)?.push(normalizeMatchRow(row));
  });

  (statsData ?? []).forEach((row: any) => {
    const teamId = String(row.team_id);
    if (!statsByTeam.has(teamId)) statsByTeam.set(teamId, []);
    statsByTeam.get(teamId)?.push(normalizeStatMatchRow(row));
  });

  return teams.map((team: Team) => {
    const hydrated: Team = {
      ...team,
      players: playersByTeam.get(team.id) ?? [],
      matchs: matchesByTeam.get(team.id) ?? [],
      statsHistory: statsByTeam.get(team.id) ?? [],
    };

    refreshPlayersStatsFromHistory(hydrated);
    refreshTeamKpisFromHistory(hydrated);

    return hydrated;
  });
}

export async function getTeam(teamId: string): Promise<Team | undefined> {
  const teams = await getTeams();
  return teams.find((team: Team) => idsMatch(team.id, teamId));
}

export async function saveTeam(team: Team): Promise<Team> {
  const supabase = createClient();
  const userId = await getUserId();

  const payload = teamPayload(team, userId);

  const { data, error } = await supabase
    .from("teams")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    logSupabaseError("Erreur saveTeam", error, payload);
    throw error;
  }

  const savedTeam = normalizeTeamRow(data);
  const players = team.players ?? [];

  if (players.length) {
    await Promise.all(players.map((player: Player) => upsertPlayer(savedTeam.id, player)));
  }

  return {
    ...savedTeam,
    players,
  };
}

export async function deleteTeam(teamId: string): Promise<void> {
  const supabase = createClient();
  const userId = await getUserId();

  const { error } = await supabase
    .from("teams")
    .delete()
    .eq("id", teamId)
    .eq("user_id", userId);

  if (error) {
    logSupabaseError("Erreur deleteTeam", error);
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/*                                  JOUEURS                                   */
/* -------------------------------------------------------------------------- */

export async function getPlayer(
  teamId: string,
  playerId: string
): Promise<Player | undefined> {
  const team = await getTeam(teamId);
  if (!team) return undefined;
  return findPlayerByAnyId(team, playerId);
}

export async function upsertPlayer(
  teamId: string,
  player: Player
): Promise<Player> {
  const supabase = createClient();
  const userId = await getUserId();

  const payload = playerPayload(teamId, player, userId);

  const { data, error } = await supabase
    .from("players")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    logSupabaseError("Erreur upsertPlayer", error, payload);
    throw error;
  }

  return normalizePlayerRow(data);
}

export async function deletePlayer(
  teamId: string,
  playerId: string
): Promise<void> {
  const supabase = createClient();
  const userId = await getUserId();

  const { error } = await supabase
    .from("players")
    .delete()
    .eq("id", playerId)
    .eq("team_id", teamId)
    .eq("user_id", userId);

  if (error) {
    logSupabaseError("Erreur deletePlayer", error);
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/*                              MATCHS / CALENDRIER                           */
/* -------------------------------------------------------------------------- */

export async function addMatch(
  teamId: string,
  match: TeamMatch
): Promise<TeamMatch> {
  const supabase = createClient();
  const userId = await getUserId();

  const nextMatch: TeamMatch = {
    ...match,
    id: isUuid(match.id) ? match.id : uid("m"),
  };

  const payload = matchPayload(teamId, nextMatch, userId);

  const { data, error } = await supabase
    .from("team_matches")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    logSupabaseError("Erreur addMatch", error, payload);
    throw error;
  }

  const savedMatch = normalizeMatchRow(data);

  const eventType =
    savedMatch.kind === "Match"
      ? "game"
      : savedMatch.kind === "Entraînement"
        ? "training"
        : "other";

  const calendarPayload = {
    user_id: userId,
    title:
      savedMatch.kind === "Match"
        ? `Match${savedMatch.adversaire ? ` vs ${savedMatch.adversaire}` : ""}`
        : savedMatch.kind || "Évènement",
    description: savedMatch.adversaire
      ? `Adversaire : ${savedMatch.adversaire}`
      : null,
    event_date: savedMatch.date || null,
    start_time: savedMatch.heure || null,
    end_time: null,
    location: null,
    event_type: eventType,
    session_id: null,
    attachment_url: null,
  };

  const { error: calendarError } = await supabase
    .from("calendar_events")
    .insert(calendarPayload);

  if (calendarError) {
    logSupabaseError("Erreur création calendar_events", calendarError, calendarPayload);
  }

  return savedMatch;
}

export async function deleteMatch(
  teamId: string,
  matchId: string
): Promise<void> {
  const supabase = createClient();
  const userId = await getUserId();

  const { error } = await supabase
    .from("team_matches")
    .delete()
    .eq("id", matchId)
    .eq("team_id", teamId)
    .eq("user_id", userId);

  if (error) {
    logSupabaseError("Erreur deleteMatch", error);
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/*                                   PROFIL                                   */
/* -------------------------------------------------------------------------- */

export async function getProfile(): Promise<UserProfile> {
  const supabase = createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("profiles")
    .select("id, email, display_name, club, avatar_url, phone, birthdate")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    logSupabaseError("Erreur getProfile", error);
    throw error;
  }

  const displayName = String(data?.display_name ?? "").trim();
  const parts = displayName.split(" ").filter(Boolean);

  return {
    ...emptyProfile(),
    prenom: parts[0] ?? "",
    nom: parts.slice(1).join(" "),
    club: data?.club ?? "",
    clubLogo: null,
    photo: data?.avatar_url ?? null,
    dob: data?.birthdate ?? "",
    email: data?.email ?? "",
    telephone: data?.phone ?? "",
  };
}

export async function saveProfile(profile: UserProfile): Promise<void> {
  const supabase = createClient();
  const userId = await getUserId();

  const payload = {
    display_name: `${profile.prenom ?? ""} ${profile.nom ?? ""}`.trim(),
    club: profile.club ?? null,
    avatar_url: profile.photo ?? null,
    phone: profile.telephone ?? null,
    birthdate: profile.dob ?? null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("profiles")
    .update(payload)
    .eq("id", userId);

  if (error) {
    logSupabaseError("Erreur saveProfile", error, payload);
    throw error;
  }
}

/* -------------------------------------------------------------------------- */
/*                              STATS / AGRÉGATS                              */
/* -------------------------------------------------------------------------- */

export function computeTeamKpis(team: Team) {
  const joueurs = team.players?.length ?? 0;
  const history = team.statsHistory || [];

  const presenceMoy =
    team.kpi?.presenceMoyennePct ||
    (joueurs
      ? Math.round(
          (team.players || []).reduce(
            (s: number, p: Player) => s + (p.presencePct || 0),
            0
          ) / joueurs
        )
      : 0);

  const matchsJoues = history.length || team.kpi?.matchsJoues || 0;

  const victoires = history.length
    ? history.filter((m: MatchRecord) => (m.scoreUs || 0) > (m.scoreThem || 0))
        .length
    : team.kpi?.victoires ?? team.teamStats?.wins ?? 0;

  const defaites = history.length
    ? history.filter((m: MatchRecord) => (m.scoreUs || 0) < (m.scoreThem || 0))
        .length
    : team.kpi?.defaites ?? team.teamStats?.losses ?? 0;

  const pointsMoyenne = history.length
    ? Math.round(
        history.reduce(
          (sum: number, m: MatchRecord) => sum + (m.scoreUs || 0),
          0
        ) / history.length
      )
    : team.kpi?.pointsMoyenne ?? 0;

  let progressionPct = team.kpi?.progressionPct ?? 0;

  if (history.length >= 2) {
    const middle = Math.max(1, Math.floor(history.length / 2));
    const first = history.slice(0, middle);
    const last = history.slice(middle);

    const avgDiff = (rows: MatchRecord[]) =>
      rows.length
        ? rows.reduce(
            (sum: number, m: MatchRecord) =>
              sum + ((m.scoreUs || 0) - (m.scoreThem || 0)),
            0
          ) / rows.length
        : 0;

    progressionPct = Math.round(avgDiff(last) - avgDiff(first));
  }

  return {
    joueurs,
    presenceMoyennePct: presenceMoy,
    matchsJoues,
    victoires,
    defaites,
    pointsMoyenne,
    progressionPct,
  };
}

export function aggregatePlayerStats(
  team: Team,
  playerId: string | number
): PlayerAggStats {
  const player = findPlayerByAnyId(team, playerId);

  const playerIds = new Set(
    [
      playerId,
      player?.id,
      (player as any)?.supabasePlayerId,
      (player as any)?.supabase_player_id,
      (player as any)?.player_id,
    ]
      .filter(Boolean)
      .map(String)
  );

  const games = (team.statsHistory || [])
    .map((match: MatchRecord) =>
      (match.players || []).find((line: MatchPlayerLine) =>
        playerIds.has(String(line.playerId))
      )
    )
    .filter((line): line is MatchPlayerLine => !!line && line.played);

  const empty: PlayerAggStats = {
    gamesPlayed: 0,
    totalMinutes: 0,
    minutes: 0,
    points: 0,
    rebounds: 0,
    assists: 0,
    steals: 0,
    blocks: 0,
    ftMade: 0,
    ftAtt: 0,
    fg2Made: 0,
    fg2Att: 0,
    fg3Made: 0,
    fg3Att: 0,
  };

  if (!games.length) return empty;

  const getMin = (g: MatchPlayerLine) => safeNumber(g.minutes ?? g.min);

  const getReb = (g: MatchPlayerLine) =>
    g.reb !== undefined
      ? safeNumber(g.reb)
      : safeNumber(g.rebOff) + safeNumber(g.rebDef);

  const getPts = (g: MatchPlayerLine) =>
    g.pts !== undefined
      ? safeNumber(g.pts)
      : safeNumber(g.pts2made ?? g.fg2m) * 2 +
        safeNumber(g.pts3made ?? g.fg3m) * 3 +
        safeNumber(g.ftMade ?? g.ftm);

  const ftMade = (g: MatchPlayerLine) => safeNumber(g.ftMade ?? g.ftm);

  const ftAtt = (g: MatchPlayerLine) =>
    g.fta !== undefined
      ? safeNumber(g.fta)
      : safeNumber(g.ftMade ?? g.ftm) + safeNumber(g.ftMiss);

  const fg2Made = (g: MatchPlayerLine) => safeNumber(g.pts2made ?? g.fg2m);

  const fg2Att = (g: MatchPlayerLine) =>
    g.fg2a !== undefined
      ? safeNumber(g.fg2a)
      : safeNumber(g.pts2made ?? g.fg2m) + safeNumber(g.pts2miss);

  const fg3Made = (g: MatchPlayerLine) => safeNumber(g.pts3made ?? g.fg3m);

  const fg3Att = (g: MatchPlayerLine) =>
    g.fg3a !== undefined
      ? safeNumber(g.fg3a)
      : safeNumber(g.pts3made ?? g.fg3m) + safeNumber(g.pts3miss);

  const n = games.length;
  const sum = (fn: (g: MatchPlayerLine) => number) =>
    games.reduce((acc: number, g: MatchPlayerLine) => acc + fn(g), 0);
  const avg = (value: number) => round1(value / n);

  const totalMin = sum(getMin);

  return {
    gamesPlayed: n,
    totalMinutes: totalMin,
    minutes: avg(totalMin),
    points: avg(sum(getPts)),
    rebounds: avg(sum(getReb)),
    assists: avg(sum((g: MatchPlayerLine) => safeNumber(g.ast))),
    steals: avg(sum((g: MatchPlayerLine) => safeNumber(g.stl))),
    blocks: avg(sum((g: MatchPlayerLine) => safeNumber(g.blk))),
    ftMade: sum(ftMade),
    ftAtt: sum(ftAtt),
    fg2Made: sum(fg2Made),
    fg2Att: sum(fg2Att),
    fg3Made: sum(fg3Made),
    fg3Att: sum(fg3Att),
  };
}

function normalizeMatchLine(line: MatchPlayerLine): MatchPlayerLine {
  const fg2m = safeNumber(line.pts2made ?? line.fg2m);

  const fg2a =
    line.fg2a !== undefined
      ? safeNumber(line.fg2a)
      : fg2m + safeNumber(line.pts2miss);

  const fg3m = safeNumber(line.pts3made ?? line.fg3m);

  const fg3a =
    line.fg3a !== undefined
      ? safeNumber(line.fg3a)
      : fg3m + safeNumber(line.pts3miss);

  const ftm = safeNumber(line.ftMade ?? line.ftm);

  const fta =
    line.fta !== undefined
      ? safeNumber(line.fta)
      : ftm + safeNumber(line.ftMiss);

  const pts =
    line.pts !== undefined ? safeNumber(line.pts) : fg2m * 2 + fg3m * 3 + ftm;

  return {
    ...line,
    played: Boolean(line.played),
    minutes: safeNumber(line.minutes ?? line.min),
    pts,
    ast: safeNumber(line.ast),
    stl: safeNumber(line.stl),
    blk: safeNumber(line.blk),
    to: safeNumber(line.to),
    rebOff: safeNumber(line.rebOff),
    rebDef: safeNumber(line.rebDef),
    reb:
      line.reb !== undefined
        ? safeNumber(line.reb)
        : safeNumber(line.rebOff) + safeNumber(line.rebDef),
    ftMade: ftm,
    ftm,
    fta,
    pts2made: fg2m,
    pts2miss: Math.max(0, fg2a - fg2m),
    fg2m,
    fg2a,
    pts3made: fg3m,
    pts3miss: Math.max(0, fg3a - fg3m),
    fg3m,
    fg3a,
  };
}

function refreshPlayersStatsFromHistory(team: Team): void {
  team.players = (team.players || []).map((player: Player) => {
    const agg = aggregatePlayerStats(team, player.id);

    if (!agg.gamesPlayed) return player;

    const fgAtt = agg.fg2Att + agg.fg3Att;

    const pctTir = fgAtt
      ? round1(((agg.fg2Made + agg.fg3Made) / fgAtt) * 100)
      : player.stats?.pctTir ?? 0;

    const pct3pts = agg.fg3Att
      ? round1((agg.fg3Made / agg.fg3Att) * 100)
      : player.stats?.pct3pts ?? 0;

    const pctLf = agg.ftAtt
      ? round1((agg.ftMade / agg.ftAtt) * 100)
      : player.stats?.pctLf ?? 0;

    const evolution = (team.statsHistory || [])
      .map((match: MatchRecord, index: number) => {
        const line = (match.players || []).find((x: MatchPlayerLine) =>
          playerMatchesId(player, x.playerId)
        );

        if (!line || !line.played) return null;

        const l = normalizeMatchLine(line);

        return {
          label: `M${index + 1}`,
          points: safeNumber(l.pts),
          rebonds: safeNumber(l.reb),
          passes: safeNumber(l.ast),
        };
      })
      .filter(Boolean)
      .slice(-12) as Player["evolution"];

    return {
      ...player,
      stats: {
        ...player.stats,
        pts: agg.points,
        reb: agg.rebounds,
        ast: agg.assists,
        stl: agg.steals,
        blk: agg.blocks,
        pctTir,
        pct3pts,
        pctLf,
      },
      evolution,
      tempsDeJeu: {
        ...player.tempsDeJeu,
        matchsJoues: agg.gamesPlayed,
        tempsMoyenMatchMin: Math.round(agg.minutes),
      },
    };
  });
}

function refreshTeamKpisFromHistory(team: Team): void {
  const history = team.statsHistory || [];

  const wins = history.filter(
    (m: MatchRecord) => safeNumber(m.scoreUs) > safeNumber(m.scoreThem)
  ).length;

  const losses = history.filter(
    (m: MatchRecord) => safeNumber(m.scoreUs) < safeNumber(m.scoreThem)
  ).length;

  const draws = history.filter(
    (m: MatchRecord) =>
      safeNumber(m.scoreUs) === safeNumber(m.scoreThem) &&
      (safeNumber(m.scoreUs) > 0 || safeNumber(m.scoreThem) > 0)
  ).length;

  team.teamStats = {
    wins,
    losses,
    draws,
    ptsFor: history.reduce(
      (sum: number, m: MatchRecord) => sum + safeNumber(m.scoreUs),
      0
    ),
    ptsAgainst: history.reduce(
      (sum: number, m: MatchRecord) => sum + safeNumber(m.scoreThem),
      0
    ),
  };

  const k = computeTeamKpis(team);

  team.kpi = {
    presenceMoyennePct: k.presenceMoyennePct,
    matchsJoues: k.matchsJoues,
    victoires: k.victoires,
    defaites: k.defaites,
    pointsMoyenne: k.pointsMoyenne,
    progressionPct: k.progressionPct,
  };
}

export async function addStatMatch(
  teamId: string,
  record: MatchRecord
): Promise<MatchRecord> {
  const supabase = createClient();
  const userId = await getUserId();

  const nextRecord: MatchRecord = {
    ...record,
    id: isUuid(record.id) ? record.id : uid("sm"),
    source: record.source || "live",
    players: (record.players || []).map(normalizeMatchLine),
  };

  const payload = statMatchPayload(teamId, nextRecord, userId);

  const { data, error } = await supabase
    .from("match_stats")
    .upsert(payload, { onConflict: "id" })
    .select("*")
    .single();

  if (error) {
    logSupabaseError("Erreur addStatMatch", error, payload);

    throw new Error(
      `${error.code ?? ""} ${error.message ?? "Erreur addStatMatch"}`
    );
  }

  return normalizeStatMatchRow(data);
}

export async function deleteStatMatch(
  teamId: string,
  recordId: string
): Promise<void> {
  const supabase = createClient();
  const userId = await getUserId();

  const { error } = await supabase
    .from("match_stats")
    .delete()
    .eq("id", recordId)
    .eq("team_id", teamId)
    .eq("user_id", userId);

  if (error) {
    logSupabaseError("Erreur deleteStatMatch", error);
    throw error;
  }
}

export async function applyManagementPresence(
  teamId: string,
  presence: Record<string, Record<string, string>>
): Promise<void> {
  const team = await getTeam(teamId);

  if (!team) return;

  const knownPlayerIds = new Set(
    (team.players || [])
      .flatMap((player: Player) => [
        player.id,
        (player as any).supabasePlayerId,
        (player as any).supabase_player_id,
        (player as any).player_id,
      ])
      .filter(Boolean)
      .map(String)
  );

  const totals: Record<string, { total: number; present: number }> = {};

  const addStatus = (playerId: string, status: string) => {
    const s = String(status || "").toLowerCase();

    if (
      s === "not_called" ||
      s === "non_convoque" ||
      s === "non convoqué" ||
      s === "non-convoqué" ||
      s === "nc"
    ) {
      return;
    }

    if (!totals[playerId]) totals[playerId] = { total: 0, present: 0 };

    totals[playerId].total += 1;

    if (
      s === "present" ||
      s === "présent" ||
      s === "p" ||
      s === "late" ||
      s === "retard"
    ) {
      totals[playerId].present += 1;
    }
  };

  Object.entries(presence || {}).forEach(([outerKey, inner]) => {
    const outerIsPlayer = knownPlayerIds.has(String(outerKey));

    Object.entries(inner || {}).forEach(([innerKey, status]) => {
      const playerId = outerIsPlayer ? outerKey : innerKey;

      if (!knownPlayerIds.has(String(playerId))) return;

      addStatus(String(playerId), status);
    });
  });

  const updates = (team.players || []).map(async (player: Player) => {
    const ids = [
      player.id,
      (player as any).supabasePlayerId,
      (player as any).supabase_player_id,
      (player as any).player_id,
    ]
      .filter(Boolean)
      .map(String);

    const line = ids.map((id: string) => totals[id]).find(Boolean);

    if (!line || !line.total) return;

    const presencePct = Math.round((line.present / line.total) * 100);

    await upsertPlayer(teamId, {
      ...player,
      presencePct,
    });
  });

  await Promise.all(updates);
}

export async function resetTeamStats(teamId: string): Promise<void> {
  const supabase = createClient();
  const userId = await getUserId();

  const { error } = await supabase
    .from("match_stats")
    .delete()
    .eq("team_id", teamId)
    .eq("user_id", userId);

  if (error) {
    logSupabaseError("Erreur resetTeamStats", error);
    throw error;
  }
}

export async function resetDemo(): Promise<void> {
  throw new Error(
    "resetDemo supprimé : les données de démonstration localStorage ne sont plus utilisées."
  );
}

export { uid };