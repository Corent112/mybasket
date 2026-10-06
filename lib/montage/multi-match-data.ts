import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeSync, resolveActionClipBounds, resolveSyncedVideoTime } from "../video-sync";
import type { VideoSyncState } from "../video-sync";

export type MontageMatch = {
  id: string; team_id?: string; opponent: string | null; match_date: string | null;
  video_url: string | null; youtube_url: string | null;
  project_state?: Record<string, unknown> | null;
  [key: string]: unknown;
};
export type MontageAction = {
  id: string; client_action_id: string | null; team_id: string | null;
  match_id: string | null; player_id: string | null; quarter: number | null;
  clock: string | null; context: string | null; temps_fort: string | null;
  action_type: string | null; shot_type: string | null; shot_result: string | null;
  video_time: number | null; clip_start: number | null; clip_end: number | null;
  edited_clip_start?: number | null; edited_clip_end?: number | null;
  clip_title?: string | null;
  resolved_clip_start?: number | null; resolved_clip_end?: number | null;
  resolved_video_time?: number | null;
};
export type MontagePlayer = {
  id: string; name: string | null; first_name?: string | null;
  last_name?: string | null; jersey_number?: number | null;
};

type PageResult = { data: unknown[] | null; error: { message: string } | null };
// Cursor on the immutable unique id includes actions with NULL video_time.
// Continue until an empty page, even if the server caps results below 1000.
export async function loadByIdCursor<T extends { id: string }>(
  fetchPage: (after: string | null) => PromiseLike<PageResult>,
): Promise<T[]> {
  const rows: T[] = [];
  let after: string | null = null;
  for (;;) {
    const { data, error } = await fetchPage(after);
    if (error) throw new Error(error.message);
    if (!data?.length) return rows;
    const page = data as T[];
    const next = String(page[page.length - 1].id);
    if (!next || next === after) throw new Error("Le curseur de la bibliothèque ne progresse plus.");
    rows.push(...page);
    after = next;
  }
}

export function matchMontageSync(match?: MontageMatch): VideoSyncState {
  const state = match?.project_state ?? {};
  const nested = state.videoSync;
  const base = normalizeSync({ ...state, ...(nested && typeof nested === "object" ? nested : {}) });
  // Same priority as loadProjectState: available SQL columns override state.
  if (match?.video_sync_mode != null) {
    return normalizeSync({
      ...base,
      mode: match.video_sync_mode,
      offset: match.video_sync_offset ?? base.offset,
      rate: match.video_sync_rate ?? base.rate,
      anchorActionId: match.video_sync_anchor_action_id ?? base.anchorActionId,
      anchorSourceTime: match.video_sync_anchor_source_time ?? base.anchorSourceTime,
      anchorMediaTime: match.video_sync_anchor_media_time ?? base.anchorMediaTime,
    } as Partial<VideoSyncState>);
  }
  return base;
}

const finiteTime = (value: number | null | undefined): number | null =>
  value != null && Number.isFinite(value) ? value : null;

export function synchronizeMontageAction(action: MontageAction, match?: MontageMatch): MontageAction {
  const sync = matchMontageSync(match);
  const bounds = resolveActionClipBounds({
    q: action.quarter, clipStart: finiteTime(action.clip_start),
    clipEnd: finiteTime(action.clip_end), videoTime: finiteTime(action.video_time),
  }, sync);
  // Existing edited_* fields have priority as media trims (LocalClipPlayer).
  // Leave SQL raw values intact; only these derived fields are for playback.
  return {
    ...action,
    resolved_clip_start: finiteTime(action.edited_clip_start) ?? bounds.start,
    resolved_clip_end: finiteTime(action.edited_clip_end) ?? bounds.end,
    resolved_video_time: resolveSyncedVideoTime(finiteTime(action.video_time), sync, action.quarter),
  };
}

export function hasMontageBounds(action: MontageAction): boolean {
  const start = action.resolved_clip_start;
  const end = action.resolved_clip_end;
  return start != null && end != null && Number.isFinite(start) && Number.isFinite(end) && start >= 0 && end > start;
}

export async function loadMontageLibrary(supabase: SupabaseClient, teamId: string) {
  if (!teamId) return { matches: [] as MontageMatch[], actions: [] as MontageAction[], players: [] as MontagePlayer[] };
  const page = <T extends { id: string }>(table: string, columns = "*") => loadByIdCursor<T>((after) => {
    let query = supabase.from(table).select(columns).eq("team_id", teamId).order("id").limit(1000);
    if (after) query = query.gt("id", after);
    return query;
  });
  const [matches, actions, players] = await Promise.all([
    page<MontageMatch>("match_stats"), page<MontageAction>("match_actions"),
    page<MontagePlayer>("players", "id,name,first_name,last_name,jersey_number"),
  ]);
  const matchMap = new Map(matches.map(match => [String(match.id), match]));
  return {
    matches: matches.sort((a, b) => String(b.match_date ?? "").localeCompare(String(a.match_date ?? ""))),
    actions: actions.map(action => synchronizeMontageAction(action, matchMap.get(String(action.match_id)))),
    players,
  };
}
