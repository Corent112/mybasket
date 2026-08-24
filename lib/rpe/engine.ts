export type RpeSeverity = "normal" | "watch" | "alert";

export type RpeEvaluation = {
  severity: RpeSeverity;
  rpeValue: number;
  targetRpe: number | null;
  groupAverage: number | null;
  targetDelta: number | null;
  groupDelta: number | null;
};

function round1(value: number) {
  return Math.round(value * 10) / 10;
}

export function evaluateRpe(input: {
  rpeValue: number;
  targetRpe: number | null;
  groupAverage: number | null;
}): RpeEvaluation {
  const rpeValue = Number(input.rpeValue || 0);
  const targetRpe = input.targetRpe == null ? null : Number(input.targetRpe);
  const groupAverage = input.groupAverage == null ? null : Number(input.groupAverage);

  const targetDelta = targetRpe == null ? null : round1(rpeValue - targetRpe);
  const groupDelta = groupAverage == null ? null : round1(rpeValue - groupAverage);

  const targetHigh = targetDelta != null && targetDelta >= 2;
  const groupHigh = groupDelta != null && groupDelta >= 2;

  const severity: RpeSeverity =
    targetHigh && groupHigh ? "alert" : targetHigh || groupHigh ? "watch" : "normal";

  return {
    severity,
    rpeValue,
    targetRpe,
    groupAverage: groupAverage == null ? null : round1(groupAverage),
    targetDelta,
    groupDelta,
  };
}

export function averageOtherPlayers(
  responses: Array<{ player_id: string; rpe: number | null; created_at?: string | null }>,
  playerId: string,
) {
  const latest = new Map<string, { rpe: number; createdAt: number }>();

  for (const row of responses) {
    const id = String(row.player_id || "");
    const rpe = Number(row.rpe);
    if (!id || id === playerId || !Number.isFinite(rpe)) continue;
    const createdAt = row.created_at ? new Date(row.created_at).getTime() : 0;
    const current = latest.get(id);
    if (!current || createdAt >= current.createdAt) {
      latest.set(id, { rpe, createdAt });
    }
  }

  const values = Array.from(latest.values()).map((row) => row.rpe);
  if (!values.length) return null;
  return round1(values.reduce((sum, value) => sum + value, 0) / values.length);
}
