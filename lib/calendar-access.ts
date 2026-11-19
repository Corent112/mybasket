export type CalendarAccessRow = {
  user_id?: string;
  owner_id?: string;
  team_id?: string;
  event_type?: string;
  assigned_player_ids?: unknown;
};
export function playerCanSeeCalendarEvent(
  row: CalendarAccessRow,
  playerId: string,
) {
  const assigned = Array.isArray(row.assigned_player_ids)
    ? row.assigned_player_ids.map(String)
    : [];
  if (assigned.length) return assigned.includes(playerId);
  return ["game", "match", "training", "formation"].includes(
    row.event_type || "",
  );
}
export function linkedPlayerCanSeeCalendarEvent(
  row: CalendarAccessRow,
  userId: string,
  players: { id: string; team_id: string }[],
) {
  if (row.user_id === userId || row.owner_id === userId) return true;
  return players.some(
    (player) =>
      row.team_id === player.team_id &&
      playerCanSeeCalendarEvent(row, player.id),
  );
}

export function playerTeamIds(player: {
  team_id?: string | null;
  metadata?: Record<string, unknown> | null;
}) {
  return [
    ...new Set(
      [
        player.team_id,
        ...(Array.isArray(player.metadata?.additionalTeamIds)
          ? player.metadata!.additionalTeamIds
          : []),
      ].filter(
        (id): id is string =>
          typeof id === "string" && /^[\w-]{1,80}$/.test(id),
      ),
    ),
  ];
}

/** Secondary teams are links within the same owner, as enforced by linkPlayerToTeam(). */
export async function verifiedPlayerMemberships(
  db: import("@supabase/supabase-js").SupabaseClient,
  players: {
    id: string;
    team_id?: string | null;
    metadata?: Record<string, unknown> | null;
  }[],
) {
  const ids = [...new Set(players.flatMap(playerTeamIds))];
  if (!ids.length) return [] as { id: string; team_id: string }[];
  const { data: teams, error } = await db
    .from("teams")
    .select("id,user_id")
    .in("id", ids);
  if (error) throw new Error("Équipes liées indisponibles");
  const owners = new Map(
    (teams || []).map((team) => [String(team.id), String(team.user_id || "")]),
  );
  return players.flatMap((player) => {
    const owner = owners.get(String(player.team_id));
    return owner
      ? playerTeamIds(player)
          .filter((id) => owners.get(id) === owner)
          .map((team_id) => ({ id: player.id, team_id }))
      : [];
  });
}
