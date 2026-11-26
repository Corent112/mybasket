import { numeric, type DataRow } from "@/lib/analytics/matches";
import { highlightLabel, readHighlightIdentity } from "@/lib/livestat-labels";

export const highlightColors = ["#6b1a2c", "#d4a24c", "#28666e", "#6074a3", "#ab5d48", "#72905c", "#675087", "#866a58"];
export type ScoutingSide = "attaque" | "defense";

function points(action: DataRow, side: ScoutingSide) {
  const freeThrows = numeric(action.ft_made) ?? 0;
  const type = action.action_type;
  if (type === "faute-technique") return 0;
  const foul = side === "attaque" ? "faute-provoquee" : "faute-commise";
  if (type === foul) {
    const bonus = String(action.special_case || "").match(/([23])pts\+1lf$/)?.[1];
    return (bonus ? Number(bonus) : 0) + freeThrows;
  }
  if (type !== "tir") return 0;
  if (action.shot_type === "LF") return numeric(action.ft_made) ?? Number(action.shot_result === "made");
  if (action.shot_result !== "made") return 0;
  return (action.shot_type === "3PTS" ? 3 : action.shot_type === "2PTS" ? 2 : 0) + freeThrows;
}

export function scoutingHighlights(actions: readonly DataRow[], side: ScoutingSide, matchIds?: readonly string[]) {
  const selected = matchIds ? new Set(matchIds) : null;
  const possessions = new Map<string, Map<string, DataRow>>();
  for (const action of actions) {
    const match = String(action.match_id);
    if (action.context !== side || (selected && !selected.has(match))
      || ["marqueur", "faute-technique"].includes(action.action_type)) continue;
    const identity = action.client_action_id || action.id;
    if (!identity) continue;
    const start = numeric(action.possession_start);
    const key = JSON.stringify([match, action.possession_id
      ? ["shared", action.possession_id]
      : start != null ? ["video", action.quarter, start]
        : ["action", identity]]);
    const group = possessions.get(key) ?? new Map<string, DataRow>();
    group.set(String(identity), action);
    possessions.set(key, group);
  }

  const groups = new Map<string, { label: string; possessions: number; points: number }>();
  for (const group of possessions.values()) {
    const rows = [...group.values()].sort((a, b) =>
      (numeric(a.video_time) ?? Infinity) - (numeric(b.video_time) ?? Infinity)
        || String(a.created_at || "").localeCompare(String(b.created_at || "")));
    const tagged = rows.find(row => typeof row.temps_fort === "string" && row.temps_fort.trim());
    if (!tagged) continue;
    const label = highlightLabel(tagged.temps_fort);
    const key = (readHighlightIdentity(tagged.temps_fort)?.label || label).trim().toLocaleLowerCase("fr");
    const stats = groups.get(key) ?? { label, possessions: 0, points: 0 };
    const scoringRows = rows.some(row => row.coding_source === "collective")
      ? rows.filter(row => row.coding_source !== "individual") : rows;
    stats.possessions++;
    stats.points += scoringRows.reduce((sum, row) => sum + points(row, side), 0);
    groups.set(key, stats);
  }
  const total = Array.from(groups.values()).reduce((sum, row) => sum + row.possessions, 0);
  return Array.from(groups.values()).sort((a, b) => b.possessions - a.possessions || a.label.localeCompare(b.label, "fr"))
    .map(row => ({ ...row, share: row.possessions / total, ppp: row.points / row.possessions }));
}
