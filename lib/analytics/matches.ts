/** Missing measurements stay null. Percentages are ratios of sums, never means of percentages. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- Legacy database projections use different field names; measurements are checked by numeric().
export type DataRow = Record<string, any>;
export const numeric = (value: unknown): number | null =>
  value == null || value === "" || typeof value === "boolean"
    ? null
    : Number.isFinite(Number(value))
      ? Number(value)
      : null;
export function ratio(a: number | null, b: number | null, scale = 1) {
  return a == null || b == null || b <= 0 ? null : (a / b) * scale;
}
export function sumKnown(rows: DataRow[], key: string) {
  const values = rows.map((r) => numeric(r[key]));
  return !values.length || values.some((v) => v == null)
    ? null
    : values.reduce<number>((s, v) => s + v!, 0);
}
export type Box = {
  p2m: number | null;
  p2a: number | null;
  p3m: number | null;
  p3a: number | null;
  ftm: number | null;
  fta: number | null;
  off_reb: number | null;
  def_reb: number | null;
  ast: number | null;
  turnovers: number | null;
  pts: number | null;
};
const keys = [
  "p2m",
  "p2a",
  "p3m",
  "p3a",
  "ftm",
  "fta",
  "off_reb",
  "def_reb",
  "ast",
  "turnovers",
  "pts",
] as const;
export function boxOf(rows: DataRow[]): Box {
  return Object.fromEntries(
    keys.map((key) => [
      key,
      sumKnown(
        rows.filter((r) => r.present !== false),
        key,
      ),
    ]),
  ) as Box;
}
export function indicators(box: Box, opponent?: Box) {
  const fga = box.p2a == null || box.p3a == null ? null : box.p2a + box.p3a;
  const fgm = box.p2m == null || box.p3m == null ? null : box.p2m + box.p3m;
  const possessions =
    fga == null ||
    box.fta == null ||
    box.off_reb == null ||
    box.turnovers == null
      ? null
      : fga + 0.44 * box.fta - box.off_reb + box.turnovers;
  const oppFga =
    opponent?.p2a == null || opponent.p3a == null
      ? null
      : opponent.p2a + opponent.p3a;
  const oppPossessions =
    oppFga == null ||
    opponent?.fta == null ||
    opponent.off_reb == null ||
    opponent.turnovers == null
      ? null
      : oppFga + 0.44 * opponent.fta - opponent.off_reb + opponent.turnovers;
  const shared =
    possessions != null && oppPossessions != null
      ? (possessions + oppPossessions) / 2
      : possessions;
  const ortg = ratio(box.pts, shared, 100),
    drtg = ratio(opponent?.pts ?? null, shared, 100);
  return {
    fga,
    fgm,
    possessions: shared,
    ortg,
    drtg,
    net: ortg == null || drtg == null ? null : ortg - drtg,
    efg: ratio(
      fgm == null || box.p3m == null ? null : fgm + 0.5 * box.p3m,
      fga,
      100,
    ),
    ts: ratio(
      box.pts,
      fga == null || box.fta == null ? null : 2 * (fga + 0.44 * box.fta),
      100,
    ),
    tov: ratio(
      box.turnovers,
      fga == null || box.fta == null || box.turnovers == null
        ? null
        : fga + 0.44 * box.fta + box.turnovers,
      100,
    ),
    orb: ratio(
      box.off_reb,
      box.off_reb == null || opponent?.def_reb == null
        ? null
        : box.off_reb + opponent.def_reb,
      100,
    ),
    ftr: ratio(box.fta, fga),
    assists: ratio(box.ast, fgm, 100),
    astTo: ratio(box.ast, box.turnovers),
    pointsPerShot: ratio(box.pts, fga),
    threeRate: ratio(box.p3a, fga, 100),
  };
}
export function participation(rows: DataRow[], matches: Map<string, DataRow>) {
  const result: Record<
    string,
    {
      games: number;
      starts: number;
      startsKnown: number;
      seconds: number;
      minutesKnown: number;
    }
  > = {};
  for (const row of new Map(
    rows.map((r) => [`${r.match_id}:${r.player_id}`, r]),
  ).values()) {
    if (!row.player_id || row.present === false) continue;
    const id = String(row.player_id);
    const value = (result[id] ??= {
      games: 0,
      starts: 0,
      startsKnown: 0,
      seconds: 0,
      minutesKnown: 0,
    });
    value.games++;
    const match = matches.get(String(row.match_id));
    const starters = match?.project_state?.starters;
    if (
      Array.isArray(starters) &&
      starters.length === 5 &&
      new Set(starters.map(String)).size === 5
    ) {
      value.startsKnown++;
      if (starters.map(String).includes(id)) value.starts++;
    } else if (typeof row.starter === "boolean") {
      value.startsKnown++;
      if (row.starter) value.starts++;
    }
    const saved = match?.project_state?.minutesByPlayer?.[id];
    const seconds = numeric(saved ?? row.minutes_seconds);
    if (seconds != null && seconds >= 0) {
      value.seconds += seconds;
      value.minutesKnown++;
    }
  }
  return result;
}
export function addBoxes(boxes: Box[]): Box {
  return Object.fromEntries(
    keys.map((key) => [key, sumKnown(boxes, key)]),
  ) as Box;
}
export function automaticInsights(box: Box, opponent: Box) {
  const m = indicators(box, opponent);
  const observations: string[] = [];
  if (box.pts != null && opponent.pts != null)
    observations.push(
      `${box.pts > opponent.pts ? "Victoire" : box.pts < opponent.pts ? "Défaite" : "Égalité"} : ${box.pts}–${opponent.pts}.`,
    );
  if (m.efg != null)
    observations.push(
      `Adresse effective : ${m.efg.toFixed(1)} % (${box.p2m! + box.p3m!}/${m.fga} aux tirs, dont ${box.p3m} à 3 points).`,
    );
  if (m.tov != null)
    observations.push(
      `${box.turnovers} ballons perdus, soit ${m.tov.toFixed(1)} % des opportunités offensives estimées.`,
    );
  if (m.orb != null)
    observations.push(
      `${m.orb.toFixed(1)} % des rebonds disponibles captés en attaque.`,
    );
  if (m.astTo != null)
    observations.push(
      `Ratio passes décisives / ballons perdus : ${m.astTo.toFixed(2)}.`,
    );
  return observations;
}

/** Defensive action totals are usable only when their points reconcile with the saved score. */
export function opponentBoxOf(match: DataRow, actions: DataRow[]): Box {
  const empty = { ...boxOf([]), pts: numeric(match.them_score) };
  const rows = actions.filter((a) => String(a.match_id) === String(match.id));
  if (!rows.some((a) => a.context === "defense" && a.action_type === "tir"))
    return empty;
  const b: Box = {
    p2m: 0,
    p2a: 0,
    p3m: 0,
    p3a: 0,
    ftm: 0,
    fta: 0,
    off_reb: 0,
    def_reb: 0,
    ast: null,
    turnovers: 0,
    pts: 0,
  };
  let known = true;
  for (const action of rows) {
    const defensive = action.context === "defense";
    const special = String(action.special_case || "");
    const shot = defensive && action.action_type === "tir";
    const foul = defensive && action.action_type === "faute-commise";
    if (shot && action.shot_type === "2PTS") {
      b.p2a!++;
      if (action.shot_result === "made") b.p2m!++;
    }
    if (shot && action.shot_type === "3PTS") {
      b.p3a!++;
      if (action.shot_result === "made") b.p3m!++;
    }
    if (foul && /2pts\+1lf/.test(special)) {
      b.p2a!++;
      b.p2m!++;
    }
    if (foul && /3pts\+1lf/.test(special)) {
      b.p3a!++;
      b.p3m!++;
    }
    const technical =
      action.action_type === "faute-technique" &&
      action.foul_outcome === "technical-against";
    if (shot || foul || technical) {
      const attempts = numeric(action.ft_attempts),
        made = numeric(action.ft_made);
      if (
        action.shot_type === "LF" ||
        technical ||
        /lf/i.test(special) ||
        (attempts || 0) > 0
      ) {
        if (attempts == null || made == null || made > attempts) known = false;
        else {
          b.fta! += attempts;
          b.ftm! += made;
        }
      }
    }
    if (
      defensive &&
      ["interception", "perte-adverse"].includes(action.action_type)
    )
      b.turnovers!++;
    if (defensive && action.rebound_type === "off") b.off_reb!++;
    if (action.context === "attaque" && action.rebound_type === "def")
      b.def_reb!++;
  }
  b.pts = b.p2m! * 2 + b.p3m! * 3 + b.ftm!;
  return known && empty.pts != null && b.pts === empty.pts ? b : empty;
}
export function matchMinutes(match: DataRow) {
  const periods = Object.keys(match.per_q || {})
    .map(Number)
    .filter(Number.isFinite);
  return 40 + Math.max(0, (periods.length ? Math.max(...periods) : 4) - 4) * 5;
}
