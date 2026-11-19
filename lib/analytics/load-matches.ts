import type { SupabaseClient } from "@supabase/supabase-js";
import { loadPlayerMatchStats } from "@/lib/player-match-stats";
import type { DataRow } from "./matches";

/** Paginate every table; Supabase's default row limit must not truncate a season. */
export async function loadMatchAnalysis(db: SupabaseClient, teamId: string) {
  const matches: DataRow[] = [];
  let offset = 0;
  while (true) {
    const result = await db
      .from("match_stats")
      .select("*")
      .eq("team_id", teamId)
      .order("id")
      .range(offset, offset + 499);
    if (result.error) throw new Error(result.error.message);
    const page = result.data || [];
    if (!page.length) break;
    matches.push(...page);
    offset += page.length;
  }
  const completed = matches.filter(
    (m) => m.project_status == null || m.project_status === "completed",
  );
  const { rows } = await loadPlayerMatchStats(db, teamId);
  const actions: DataRow[] = [];
  for (let start = 0; start < completed.length; start += 100) {
    const ids = completed.slice(start, start + 100).map((m) => m.id);
    let pos = 0;
    while (true) {
      const result = await db
        .from("match_actions")
        .select("*")
        .in("match_id", ids)
        .order("id")
        .range(pos, pos + 499);
      if (result.error) throw new Error(result.error.message);
      const page = result.data || [];
      if (!page.length) break;
      actions.push(...page);
      pos += page.length;
    }
  }
  return {
    matches: completed.sort((a, b) =>
      String(a.match_date).localeCompare(String(b.match_date)),
    ),
    rows,
    actions,
  };
}

export async function loadOfficialTeamMatches(
  db: SupabaseClient,
  teamId: string,
) {
  const { data: connections, error: connectionError } = await db
    .from("ffbb_team_connections")
    .select("id,logical_competition_key,is_primary")
    .eq("team_id", teamId)
    .order("created_at");
  if (connectionError) throw new Error("Compétition liée indisponible");
  if (!connections?.length) return [] as DataRow[];
  const primary = connections.find((c) => c.is_primary) || connections[0];
  const ids = (
    primary.logical_competition_key
      ? connections.filter(
          (c) => c.logical_competition_key === primary.logical_competition_key,
        )
      : [primary]
  ).map((c) => c.id);
  const rows: DataRow[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await db
      .from("ffbb_synced_matches")
      .select("*")
      .eq("team_id", teamId)
      .in("connection_id", ids)
      .order("id")
      .range(offset, offset + 499);
    if (error) throw new Error("Résultats indisponibles");
    if (!data?.length) break;
    rows.push(...data);
    offset += data.length;
  }
  return rows;
}
