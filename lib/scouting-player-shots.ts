import type { DataRow } from "./analytics/matches";
import { SHOT_ZONES } from "./shot-chart-zones";

export const SCOUTING_SHOT_COURT = "/shot-chart-clean.png";

export type ScoutingZoneCount = { zone: (typeof SHOT_ZONES)[number]; made: number; attempts: number };

export function scoutingShotsByPlayer(actions: readonly DataRow[]) {
  const players = new Map<string, Map<string, ScoutingZoneCount>>();
  const zones = new Map(SHOT_ZONES.map(zone => [zone.id, zone]));
  for (const action of actions) {
    if (action.context === "defense" || action.action_type !== "tir" || !action.player_id) continue;
    if (action.shot_type !== "2PTS" && action.shot_type !== "3PTS") continue;
    if (action.shot_result !== "made" && action.shot_result !== "missed") continue;
    const zone = zones.get(String(action.shot_zone_id ?? action.zone ?? ""));
    if (!zone) continue;
    const id = String(action.player_id);
    const byZone = players.get(id) ?? new Map<string, ScoutingZoneCount>();
    const count = byZone.get(zone.id) ?? { zone, made: 0, attempts: 0 };
    count.attempts++;
    if (action.shot_result === "made") count.made++;
    byZone.set(zone.id, count);
    players.set(id, byZone);
  }
  return players;
}

export function scoutingPlayerShotZones(players: ReturnType<typeof scoutingShotsByPlayer>, player: { id: string; supabasePlayerId?: string | null }) {
  const ids = new Set([player.id, player.supabasePlayerId]);
  return SHOT_ZONES.flatMap(zone => {
    let made = 0, attempts = 0;
    for (const id of ids) {
      const count = id ? players.get(id)?.get(zone.id) : undefined;
      made += count?.made ?? 0;
      attempts += count?.attempts ?? 0;
    }
    return attempts ? [{ zone, made, attempts }] : [];
  });
}
