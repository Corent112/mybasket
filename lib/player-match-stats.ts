import type { SupabaseClient } from "@supabase/supabase-js";

// These tables and the (match_id, player_id) key are already used by LiveStats.
// Ordering by the real unique key keeps pagination stable without assuming an id column.
export async function loadPlayerMatchStats(supabase: SupabaseClient, teamId: string) {
  const rows: Record<string, any>[] = [];
  let offset = 0;
  let previous = "";
  while (true) {
    const result = await supabase.from("match_player_stats").select("*").eq("team_id", teamId)
      .order("match_id").order("player_id").range(offset, offset + 499);
    if (result.error) throw new Error(result.error.message);
    const page = result.data || [];
    if (!page.length) break;
    const last = page[page.length - 1];
    const key = `${last.match_id}:${last.player_id}`;
    if (key === previous) throw new Error("Le chargement des statistiques ne progresse plus.");
    previous = key; rows.push(...page); offset += page.length;
  }
  const ids = Array.from(new Set(rows.map(row => String(row.match_id || "")).filter(Boolean)));
  const matchesById = new Map<string, Record<string, any>>();
  for (let start = 0; start < ids.length; start += 500) {
    let matchOffset = 0;
    let previousMatchId = "";
    while (true) {
      const result = await supabase.from("match_stats").select("*").eq("team_id", teamId)
        .in("id", ids.slice(start, start + 500)).order("id").range(matchOffset, matchOffset + 499);
      if (result.error) throw new Error(result.error.message);
      const page = result.data || [];
      if (!page.length) break;
      const lastId = String(page[page.length - 1].id);
      if (lastId === previousMatchId) throw new Error("Le chargement des matchs ne progresse plus.");
      previousMatchId = lastId;
      for (const match of page) matchesById.set(String(match.id), match);
      matchOffset += page.length;
    }
  }
  const resolvedRows=rows.map(row=>{
    const state=matchesById.get(String(row.match_id))?.project_state;
    const actions=Array.isArray(state?.actions)?state.actions:[];
    const hasLineups=actions.some((action:any)=>Array.isArray(action.lineup)&&action.lineup.length>0);
    const plusMinus=row.plus_minus??(hasLineups?actions.reduce((sum:number,action:any)=>Array.isArray(action.lineup)&&action.lineup.includes(String(row.player_id))?sum+ptsOf(action)-themPtsOf(action):sum,0):null);
    row={...row,plus_minus:plusMinus};
    const saved=state?.minutesByPlayer;
    if(!saved||!Object.prototype.hasOwnProperty.call(saved,String(row.player_id)))return row;
    const raw=saved[String(row.player_id)];
    if(raw===null||raw===""||typeof raw==="boolean")return row;
    const seconds=Number(raw);
    if(!Number.isFinite(seconds)||seconds<0)return row;
    return {...row,minutes_seconds:seconds};
  });
  return { rows:resolvedRows, matchesById };
}

export type PlayerMatchCategory = "all" | "championship" | "cup" | "friendly";
export function playerMatchCategoryOf(match: Record<string, any> | undefined): Exclude<PlayerMatchCategory, "all"> | "unknown" {
  const raw = String(match?.match_category || match?.project_state?.matchType || "").trim().toLowerCase();
  if (["championship", "league", "championnat"].includes(raw)) return "championship";
  if (["cup", "coupe"].includes(raw)) return "cup";
  if (["friendly", "amical"].includes(raw)) return "friendly";
  return "unknown";
}

export function completedPlayerMatchRows(rows: Record<string, any>[], matchesById: Map<string, Record<string, any>>, category: PlayerMatchCategory = "all") {
  return rows.filter(row => {
    const match = matchesById.get(String(row.match_id || ""));
    return match && match.project_status !== "draft" && (category === "all" || playerMatchCategoryOf(match) === category);
  });
}

const stat = (value: unknown) => Number.isFinite(Number(value)) ? Number(value) : 0;
export function summarizePlayerMatchRows(rows: Record<string, any>[]) {
  const players: Record<string, { playerId: string; games: number; pts: number; fgm: number; fga: number; twoPm: number; twoPa: number; threePm: number; threePa: number; ftm: number; fta: number; off: number; def: number; reb: number; ast: number; st: number; to: number; bs: number; pf: number; fpf: number }> = {};
  const gamesByPlayer = new Map<string, Set<string>>();
  // One saved boxscore per (match_id, player_id); never sum repeated references.
  const unique = new Map(rows.map(row => [`${row.match_id}:${row.player_id}`, row]));
  for (const row of unique.values()) {
    if (row.present === false || !row.player_id || !row.match_id) continue;
    const id = String(row.player_id);
    const current = players[id] ||= { playerId:id, games:0, pts:0, fgm:0, fga:0, twoPm:0, twoPa:0, threePm:0, threePa:0, ftm:0, fta:0, off:0, def:0, reb:0, ast:0, st:0, to:0, bs:0, pf:0, fpf:0 };
    const games = gamesByPlayer.get(id) || new Set<string>(); games.add(String(row.match_id)); gamesByPlayer.set(id, games); current.games = games.size;
    current.twoPm += stat(row.p2m); current.twoPa += stat(row.p2a);
    current.threePm += stat(row.p3m); current.threePa += stat(row.p3a);
    current.fgm += stat(row.p2m) + stat(row.p3m); current.fga += stat(row.p2a) + stat(row.p3a);
    current.ftm += stat(row.ftm); current.fta += stat(row.fta);
    current.off += stat(row.off_reb); current.def += stat(row.def_reb);
    current.reb += row.reb == null ? stat(row.off_reb) + stat(row.def_reb) : stat(row.reb);
    current.pts += row.pts == null ? stat(row.p2m) * 2 + stat(row.p3m) * 3 + stat(row.ftm) : stat(row.pts);
    current.ast += stat(row.ast); current.st += stat(row.stl); current.to += stat(row.turnovers); current.bs += stat(row.blk); current.pf += stat(row.pf);
  }
  return players;
}

function ptsOf(a: any) {
  if (a.actionType === 'faute-technique' && a.foulOutcome === 'technical-for') return a.ftMade || 0;
  // Une antisportive provoquée donne sa réparation à notre équipe, quel que soit
  // le contexte depuis lequel elle a été saisie (attaque ou défense).
  if (a.actionType === 'faute-provoquee' && (a.specialCase === 'unsportsmanlike' || a.specialCase === 'unsportsmanlike-2pts+1lf' || a.specialCase === 'unsportsmanlike-3pts+1lf')) {
    let p = a.ftMade || 0;
    if (a.specialCase === 'unsportsmanlike-2pts+1lf') p += 2;
    else if (a.specialCase === 'unsportsmanlike-3pts+1lf') p += 3;
    return p;
  }
  if (a.context === 'defense') return 0;

  // Faute provoquée sur panier marqué :
  // 2+1 = 2 points déjà marqués + 1 LF éventuel
  // 3+1 = 3 points déjà marqués + 1 LF éventuel
  if (a.actionType === 'faute-provoquee') {
    if (a.specialCase === '2pts+1lf') return 2 + (a.ftMade || 0);
    if (a.specialCase === '3pts+1lf') return 3 + (a.ftMade || 0);
    if (a.specialCase === 'unsportsmanlike-2pts+1lf') return 2 + (a.ftMade || 0);
    if (a.specialCase === 'unsportsmanlike-3pts+1lf') return 3 + (a.ftMade || 0);
  }

  let p = 0;
  if (a.shotType === 'LF') p += a.ftMade || 0;
  else if (a.actionType === 'tir' && a.shotResult === 'made') { if (a.shotType === '2PTS') p = 2; else if (a.shotType === '3PTS') p = 3; }
  if (a.actionType === 'tir' && a.shotType !== 'LF' && a.shotResult === 'made' && a.specialCase !== 'aucun') p += a.ftMade || 0;
  return p;
}
function themPtsOf(a: any) {
  if (a.actionType === 'faute-technique' && a.foulOutcome === 'technical-against') return a.ftMade || 0;
  if (a.actionType === 'faute-commise' && (a.specialCase === 'unsportsmanlike-committed' || a.specialCase === 'unsportsmanlike-committed-2pts+1lf' || a.specialCase === 'unsportsmanlike-committed-3pts+1lf')) {
    let p = a.ftMade || 0;
    if (a.specialCase === 'unsportsmanlike-committed-2pts+1lf') p += 2;
    else if (a.specialCase === 'unsportsmanlike-committed-3pts+1lf') p += 3;
    return p;
  }
  if (a.context === 'defense' && a.actionType === 'tir' && a.shotResult === 'made')
    return a.shotType === '3PTS' ? 3 : a.shotType === 'LF' ? 1 : 2;
  if (a.context === 'defense' && a.actionType === 'faute-commise') {
    let p = a.ftMade || 0;
    if (a.specialCase === '2pts+1lf') p += 2; else if (a.specialCase === '3pts+1lf') p += 3;
    return p;
  }
  return 0;
}
