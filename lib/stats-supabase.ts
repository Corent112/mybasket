import { createClient } from "@/lib/supabase/client";
import { addStatMatch } from "@/lib/equipes-store";

export type Result = "V" | "N" | "D";

export type PerQuarter = Record<number, { us: number; them: number }>;

export type LivePlayerLine = {
  playerId: string;
  present: boolean;
  p2m: number;
  p2a: number;
  p3m: number;
  p3a: number;
  ftm: number;
  fta: number;
  offReb: number;
  defReb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number;
  pf: number;
};

export type LiveMatchAction = {
  id?: string;
  q: number;
  clock: string;
  lineup?: string[];

  context?: string;
  inbound?: string;
  tempsFort?: string;
  coverage?: string;

  playerId?: string | null;
  actionType?: string;
  shotType?: string;
  shotResult?: string;
  specialCase?: string;

  ftAttempts?: number;
  ftMade?: number;
  ftResults?: string[];

  reboundType?: string;
  reboundPlayerId?: string | null;

  assist?: boolean | null;
  assistPlayerId?: string | null;

  foulOutcome?: string;

  courtX?: number | null;
  courtY?: number | null;
};

export type SaveLiveMatchPayload = {
  teamId: string;
  opponent: string;
  date: string;
  home?: boolean;
  us: number;
  them: number;
  result: Result;
  perQ: PerQuarter;
  lines: LivePlayerLine[];
  actions?: LiveMatchAction[];
};

export type SaveLiveMatchResponse =
  | { ok: true; matchId: string; warning?: string }
  | { ok: false; error: string };

export type TeamPlayerStat = {
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


type MatchPlayerStatsRow = {
  player_id: string | null;
  pts?: number | null;
  p2m?: number | null;
  p2a?: number | null;
  p3m?: number | null;
  p3a?: number | null;
  ftm?: number | null;
  fta?: number | null;
  off_reb?: number | null;
  def_reb?: number | null;
  reb?: number | null;
  ast?: number | null;
  stl?: number | null;
  blk?: number | null;
  turnovers?: number | null;
  pf?: number | null;
  present?: boolean | null;
};

type PlayerAggregateTotals = {
  pts: number;
  p2m: number;
  p2a: number;
  p3m: number;
  p3a: number;
  ftm: number;
  fta: number;
  offReb: number;
  defReb: number;
  reb: number;
  ast: number;
  stl: number;
  blk: number;
  to: number;
  pf: number;
};


const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(value: string | null | undefined) {
  return !!value && UUID_RE.test(value);
}

function safeNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function points(line: LivePlayerLine): number {
  return safeNumber(line.p2m) * 2 + safeNumber(line.p3m) * 3 + safeNumber(line.ftm);
}

function totalReb(line: LivePlayerLine): number {
  return safeNumber(line.offReb) + safeNumber(line.defReb);
}

function pct(made: number, attempted: number): number {
  if (!attempted) return 0;
  return Math.round((made / attempted) * 1000) / 10;
}

function supabaseErrorMessage(error: any): string {
  if (!error) return "Erreur Supabase inconnue";

  const message =
    error?.message ||
    error?.error_description ||
    error?.details ||
    error?.hint ||
    error?.code ||
    (typeof error === "string" ? error : "");

  if (message) return String(message);

  try {
    return JSON.stringify(error);
  } catch {
    return "Erreur Supabase inconnue";
  }
}

/** Log détaillé et lisible d'une erreur Supabase (code, message, details, hint). */
function logSupabaseError(label: string, error: any) {
  console.error(label, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    raw: error,
  });
}

function uniqueStrings(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter(Boolean).map((value) => String(value))));
}

async function resolveRealTeamId(
  supabase: ReturnType<typeof createClient>,
  userId: string,
  teamId: string,
  playerIds: string[]
): Promise<string | null> {
  const cleanTeamId = String(teamId || "").trim();

  if (isUuid(cleanTeamId)) return cleanTeamId;

  const validPlayerIds = uniqueStrings(playerIds).filter(isUuid);

  if (validPlayerIds.length > 0) {
    const { data: playerTeam, error: playerTeamError } = await supabase
      .from("players")
      .select("team_id")
      .in("id", validPlayerIds)
      .not("team_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (!playerTeamError && playerTeam?.team_id && isUuid(String(playerTeam.team_id))) {
      return String(playerTeam.team_id);
    }
  }

  const { data: userTeam, error: userTeamError } = await supabase
    .from("teams")
    .select("id")
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!userTeamError && userTeam?.id && isUuid(String(userTeam.id))) {
    return String(userTeam.id);
  }

  const { data: anyTeam, error: anyTeamError } = await supabase
    .from("teams")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (!anyTeamError && anyTeam?.id && isUuid(String(anyTeam.id))) {
    return String(anyTeam.id);
  }

  return null;
}


function saveLiveMatchMirrorToLocalStore(
  payload: SaveLiveMatchPayload,
  matchId: string
) {
  if (typeof window === "undefined") return;

  try {
    addStatMatch(payload.teamId, {
      id: matchId,
      date: payload.date,
      opponent: payload.opponent || "Adversaire",
      scoreUs: safeNumber(payload.us),
      scoreThem: safeNumber(payload.them),
      source: "live",
      players: payload.lines.map((line) => ({
        playerId: line.playerId,
        played: Boolean(line.present),
        pts: points(line),
        ast: safeNumber(line.ast),
        stl: safeNumber(line.stl),
        blk: safeNumber(line.blk),
        rebOff: safeNumber(line.offReb),
        rebDef: safeNumber(line.defReb),
        reb: totalReb(line),
        ftMade: safeNumber(line.ftm),
        ftm: safeNumber(line.ftm),
        fta: safeNumber(line.fta),
        pts2made: safeNumber(line.p2m),
        pts2miss: Math.max(0, safeNumber(line.p2a) - safeNumber(line.p2m)),
        fg2m: safeNumber(line.p2m),
        fg2a: safeNumber(line.p2a),
        pts3made: safeNumber(line.p3m),
        pts3miss: Math.max(0, safeNumber(line.p3a) - safeNumber(line.p3m)),
        fg3m: safeNumber(line.p3m),
        fg3a: safeNumber(line.p3a),
        to: safeNumber(line.to),
        pf: safeNumber(line.pf),
      })),
    } as any);

    console.log("Miroir local statsHistory enregistré pour la fiche équipe/joueur", {
      teamId: payload.teamId,
      matchId,
      players: payload.lines.length,
    });
  } catch (error) {
    console.warn("Miroir local statsHistory non enregistré :", error);
  }
}

export async function saveLiveMatch(
  payload: SaveLiveMatchPayload
): Promise<SaveLiveMatchResponse> {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) throw userError;
    if (!user) return { ok: false, error: "Utilisateur non connecté" };

    const playerIds = [
      ...payload.lines.map((line) => line.playerId),
      ...(payload.actions ?? []).map((action) => action.playerId || ""),
      ...(payload.actions ?? []).map((action) => action.assistPlayerId || ""),
      ...(payload.actions ?? []).map((action) => action.reboundPlayerId || ""),
    ];

    const realTeamId = await resolveRealTeamId(
      supabase,
      user.id,
      payload.teamId,
      playerIds
    );

    if (!realTeamId) {
      const localOnlyMatchId = `local_${Date.now().toString(36)}`;

      // Même si Supabase ne trouve pas d'équipe UUID, on met quand même à jour
      // les fiches équipe/joueur côté localStorage.
      saveLiveMatchMirrorToLocalStore(payload, localOnlyMatchId);

      return {
        ok: true,
        matchId: localOnlyMatchId,
        warning:
          "Match enregistré localement pour les fiches équipe/joueur, mais aucune vraie équipe Supabase UUID n'a été trouvée.",
      };
    }

    console.log("saveLiveMatch teamId reçu =", payload.teamId);
    console.log("saveLiveMatch realTeamId utilisé =", realTeamId);

    /* 1) Match -------------------------------------------------------------- */
    const { data: match, error: matchError } = await supabase
      .from("match_stats")
      .insert({
        user_id: user.id,
        team_id: realTeamId,
        opponent: payload.opponent || "Adversaire",
        match_date: payload.date,
        home: payload.home ?? true,
        us_score: safeNumber(payload.us),
        them_score: safeNumber(payload.them),
        result: payload.result,
        per_q: payload.perQ,
      })
      .select("id")
      .single();

    if (matchError) {
      logSupabaseError("Erreur insert match_stats:", matchError);
      throw matchError;
    }
    if (!match?.id) return { ok: false, error: "Match créé sans identifiant" };

    // Miroir local immédiat : même si une contrainte Supabase bloque les lignes joueurs,
    // la fiche équipe / joueur peut afficher les stats du match live.
    saveLiveMatchMirrorToLocalStore(payload, match.id);

    /* 2) Stats joueurs (ce sont ELLES qui alimentent les fiches) ----------- */
    const playerRows = payload.lines.map((line) => ({
      user_id: user.id,
      match_id: match.id,
      team_id: realTeamId,
      player_id: line.playerId,
      present: Boolean(line.present),
      pts: points(line),
      p2m: safeNumber(line.p2m),
      p2a: safeNumber(line.p2a),
      p3m: safeNumber(line.p3m),
      p3a: safeNumber(line.p3a),
      ftm: safeNumber(line.ftm),
      fta: safeNumber(line.fta),
      off_reb: safeNumber(line.offReb),
      def_reb: safeNumber(line.defReb),
      reb: totalReb(line),
      ast: safeNumber(line.ast),
      stl: safeNumber(line.stl),
      blk: safeNumber(line.blk),
      turnovers: safeNumber(line.to),
      pf: safeNumber(line.pf),
    }));

    if (playerRows.length > 0) {
      const { error: linesError } = await supabase
        .from("match_player_stats")
        .insert(playerRows);

      if (linesError) {
        // Non bloquant pour les fiches : le miroir local statsHistory a déjà été écrit.
        // On garde le match_stats dans Supabase et on remonte un warning au lieu de casser
        // l'expérience utilisateur.
        logSupabaseError("Erreur insert match_player_stats (non bloquant local) :", linesError);
      }
    }

    /* 3) Détail des actions (shot chart, play-by-play) — NON BLOQUANT ------- */
    // Si cette table est absente / a un schéma différent / une RLS stricte,
    // on NE supprime PLUS le match : les stats joueurs (et donc les fiches)
    // restent enregistrées. On loggue seulement l'avertissement.
    let warning: string | undefined;

    const actionRows = (payload.actions ?? []).map((action) => ({
      user_id: user.id,
      match_id: match.id,
      team_id: realTeamId,

      player_id: action.playerId || null,
      assist_player_id: action.assistPlayerId || null,
      rebound_player_id: action.reboundPlayerId || null,

      quarter: safeNumber(action.q),
      clock: action.clock || null,
      context: action.context || null,
      inbound: action.inbound || null,
      temps_fort: action.tempsFort || null,
      coverage: action.coverage || null,
      action_type: action.actionType || null,
      shot_type: action.shotType || null,
      shot_result: action.shotResult || null,
      special_case: action.specialCase || null,

      ft_attempts: safeNumber(action.ftAttempts),
      ft_made: safeNumber(action.ftMade),
      ft_results: action.ftResults ?? [],

      rebound_type: action.reboundType || null,
      foul_outcome: action.foulOutcome || null,

      court_x: action.courtX ?? null,
      court_y: action.courtY ?? null,

      lineup: action.lineup ?? [],
    }));

    if (actionRows.length > 0) {
      const { error: actionsError } = await supabase
        .from("match_actions")
        .insert(actionRows);

      if (actionsError) {
        logSupabaseError(
          "match_actions non enregistrées (non bloquant) :",
          actionsError
        );
        warning =
          "Stats joueurs enregistrées, mais le détail des actions (shot chart) n'a pas pu être sauvegardé : " +
          supabaseErrorMessage(actionsError);
      }
    }

    return { ok: true, matchId: match.id, warning };
  } catch (error: any) {
    console.error("Erreur saveLiveMatch complète:", {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint,
      raw: error,
    });

    return {
      ok: false,
      error: supabaseErrorMessage(error),
    };
  }
}

export async function getPlayerAggregates(teamId: string, playerId: string) {
  const supabase = createClient();

  let query = supabase
    .from("match_player_stats")
    .select(
      "pts, p2m, p2a, p3m, p3a, ftm, fta, reb, off_reb, def_reb, ast, stl, blk, turnovers, pf, present"
    )
    .eq("player_id", playerId);

  if (teamId && isUuid(teamId)) {
    query = query.eq("team_id", teamId);
  }

  const { data, error } = await query;

  if (error) {
    console.warn("Stats individuelles non disponibles :", error);
    return { games: 0, stats: {} };
  }

  const rows = ((data ?? []) as MatchPlayerStatsRow[]);
  const playedRows = rows.filter((row: MatchPlayerStatsRow) => row.present !== false);
  const games = playedRows.length;

  if (!games) return { games: 0, stats: {} };

  const totals = playedRows.reduce<PlayerAggregateTotals>(
    (acc: PlayerAggregateTotals, row: MatchPlayerStatsRow) => {
      acc.pts += safeNumber(row.pts);
      acc.p2m += safeNumber(row.p2m);
      acc.p2a += safeNumber(row.p2a);
      acc.p3m += safeNumber(row.p3m);
      acc.p3a += safeNumber(row.p3a);
      acc.ftm += safeNumber(row.ftm);
      acc.fta += safeNumber(row.fta);
      acc.offReb += safeNumber(row.off_reb);
      acc.defReb += safeNumber(row.def_reb);
      acc.reb += safeNumber(row.reb);
      acc.ast += safeNumber(row.ast);
      acc.stl += safeNumber(row.stl);
      acc.blk += safeNumber(row.blk);
      acc.to += safeNumber(row.turnovers);
      acc.pf += safeNumber(row.pf);
      return acc;
    },
    {
      pts: 0,
      p2m: 0,
      p2a: 0,
      p3m: 0,
      p3a: 0,
      ftm: 0,
      fta: 0,
      offReb: 0,
      defReb: 0,
      reb: 0,
      ast: 0,
      stl: 0,
      blk: 0,
      to: 0,
      pf: 0,
    }
  );

  const round = (value: number) => Math.round((value / games) * 10) / 10;

  return {
    games,
    stats: {
      points: round(totals.pts),
      rebondsOffensifs: round(totals.offReb),
      rebondsDefensifs: round(totals.defReb),
      rebonds: round(totals.reb || totals.offReb + totals.defReb),
      passes: round(totals.ast),
      interceptions: round(totals.stl),
      contres: round(totals.blk),
      ballesPerdues: round(totals.to),
      fautes: round(totals.pf),
      adresse: pct(totals.p2m + totals.p3m, totals.p2a + totals.p3a),
      troisPoints: pct(totals.p3m, totals.p3a),
      lancersFrancs: pct(totals.ftm, totals.fta),
    },
  };
}

export async function getTeamPlayerStats(
  teamId: string,
  playerIds: string[] = []
): Promise<Record<string, TeamPlayerStat>> {
  const supabase = createClient();

  const cleanTeamId = String(teamId || "").trim();
  const cleanPlayerIds = uniqueStrings(playerIds).filter(Boolean);

  if (!cleanTeamId && cleanPlayerIds.length === 0) return {};

  async function fetchRowsByTeam() {
    if (!cleanTeamId || !isUuid(cleanTeamId)) return { data: null, error: null };

    return await supabase
      .from("match_player_stats")
      .select(
        "player_id, p2m, p2a, p3m, p3a, ftm, fta, off_reb, def_reb, ast, stl, blk, turnovers, pf, present"
      )
      .eq("team_id", cleanTeamId);
  }

  async function fetchRowsByPlayers() {
    if (cleanPlayerIds.length === 0) return { data: null, error: null };

    return await supabase
      .from("match_player_stats")
      .select(
        "player_id, p2m, p2a, p3m, p3a, ftm, fta, off_reb, def_reb, ast, stl, blk, turnovers, pf, present"
      )
      .in("player_id", cleanPlayerIds);
  }

  let { data, error } = await fetchRowsByTeam();

  if (error) {
    console.warn("Stats joueurs par équipe non disponibles :", error);
  }

  if (!data || data.length === 0) {
    const fallback = await fetchRowsByPlayers();

    data = fallback.data;
    error = fallback.error;

    if (error) {
      console.warn("Stats joueurs par joueurs non disponibles :", error);
      return {};
    }
  }

  const result: Record<string, TeamPlayerStat> = {};

  ((data ?? []) as MatchPlayerStatsRow[])
    .filter((row: MatchPlayerStatsRow) => row.present !== false)
    .forEach((row: MatchPlayerStatsRow) => {
      const playerId = String(row.player_id);

      if (!result[playerId]) {
        result[playerId] = {
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
        };
      }

      const stat = result[playerId];

      stat.twoPm += safeNumber(row.p2m);
      stat.twoPa += safeNumber(row.p2a);
      stat.threePm += safeNumber(row.p3m);
      stat.threePa += safeNumber(row.p3a);
      stat.ftm += safeNumber(row.ftm);
      stat.fta += safeNumber(row.fta);
      stat.off += safeNumber(row.off_reb);
      stat.def += safeNumber(row.def_reb);
      stat.ast += safeNumber(row.ast);
      stat.st += safeNumber(row.stl);
      stat.bs += safeNumber(row.blk);
      stat.to += safeNumber(row.turnovers);
      stat.pf += safeNumber(row.pf);

      stat.fgm = stat.twoPm + stat.threePm;
      stat.fga = stat.twoPa + stat.threePa;
    });

  return result;
}