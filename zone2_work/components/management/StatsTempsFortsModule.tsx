"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Mode = "total" | "average";

type Team = {
  id: string;
  name: string;
};

type MatchRow = {
  id: string;
  team_id: string | null;
  opponent: string | null;
  match_date: string | null;
  us_score: number | null;
  them_score: number | null;
  result: string | null;
  home: boolean | null;
};

type ActionRow = {
  match_id: string | null;
  team_id: string | null;
  context: string | null;
  inbound: string | null;
  temps_fort: string | null;
  coverage: string | null;
  action_type: string | null;
  shot_type: string | null;
  shot_result: string | null;
  special_case: string | null;
  ft_attempts: number | null;
  ft_made: number | null;
  assist_player_id: string | null;
  rebound_type: string | null;
};

type HighlightStats = {
  key: string;
  label: string;
  poss: number;
  pts: number;
  p2m: number;
  p2a: number;
  p3m: number;
  p3a: number;
  ftm: number;
  fta: number;
  turnovers: number;
  foulsDrawn: number;
  assists: number;
};

const HIGHLIGHTS = [
  { key: "fast-break", label: "Fast Break" },
  { key: "transition", label: "Transition" },
  { key: "jeu-place", label: "Jeu placé" },
  { key: "pick-top", label: "Pick Top" },
  { key: "pick-side", label: "Pick Side" },
  { key: "hand-off", label: "Hand Off" },
  { key: "1v1", label: "1v1 / Isolation" },
  { key: "drive-kick", label: "Drive & Kick" },
  { key: "stagger", label: "Stagger" },
  { key: "jeu-sans-ballon", label: "Jeu sans ballon" },
  { key: "off-rebound", label: "Rebond offensif" },
  { key: "blob", label: "BLOB" },
  { key: "slob", label: "SLOB" },
];

const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const round1 = (value: number) => Math.round(value * 10) / 10;
const round2 = (value: number) => Math.round(value * 100) / 100;

const percent = (value: number, total: number) => {
  if (!total) return "0%";
  return `${round1((value / total) * 100)}%`;
};

function emptyHighlight(item: { key: string; label: string }): HighlightStats {
  return {
    key: item.key,
    label: item.label,
    poss: 0,
    pts: 0,
    p2m: 0,
    p2a: 0,
    p3m: 0,
    p3a: 0,
    ftm: 0,
    fta: 0,
    turnovers: 0,
    foulsDrawn: 0,
    assists: 0,
  };
}

function teamName(row: any, id: string) {
  return String(
    row?.name ||
      row?.nom ||
      row?.team_name ||
      row?.title ||
      `Équipe ${id.slice(0, 8)}`
  );
}

function isWin(match: MatchRow) {
  return n(match.us_score) > n(match.them_score);
}

function isLoss(match: MatchRow) {
  return n(match.us_score) < n(match.them_score);
}

function normalizeHighlightKey(action: ActionRow) {
  const inbound = String(action.inbound || "").toLowerCase();
  const tempsFort = String(action.temps_fort || "").toLowerCase();

  if (inbound === "blob") return "blob";
  if (inbound === "slob") return "slob";

  if (tempsFort === "fast_break" || tempsFort === "fast-break") return "fast-break";
  if (tempsFort === "transition" || tempsFort === "early_offense") return "transition";
  if (tempsFort === "pnp_top" || tempsFort === "pick_top" || tempsFort === "pick-top") return "pick-top";
  if (tempsFort === "pnp_side" || tempsFort === "pick_side" || tempsFort === "pick-side") return "pick-side";
  if (tempsFort === "handoff" || tempsFort === "hand_off" || tempsFort === "hand-off") return "hand-off";
  if (tempsFort === "isolation" || tempsFort === "iso" || tempsFort === "1v1") return "1v1";
  if (tempsFort === "drive_kick" || tempsFort === "drive-kick") return "drive-kick";
  if (tempsFort === "stagger") return "stagger";
  if (tempsFort === "jeu_sans_ballon" || tempsFort === "sans_ballon") return "jeu-sans-ballon";
  if (tempsFort === "rebond_off" || tempsFort === "off_rebound" || tempsFort === "off-rebound") return "off-rebound";
  if (tempsFort === "blob") return "blob";
  if (tempsFort === "slob") return "slob";

  return tempsFort || "jeu-place";
}

function pointsOfAction(action: ActionRow) {
  const context = String(action.context || "");
  const actionType = String(action.action_type || "");
  const shotType = String(action.shot_type || "");
  const shotResult = String(action.shot_result || "");
  const specialCase = String(action.special_case || "");

  if (context !== "attaque") return 0;

  if (actionType === "tir") {
    if (shotType === "LF") return n(action.ft_made);

    let pts = 0;

    if (shotResult === "made") {
      if (shotType === "2PTS") pts += 2;
      if (shotType === "3PTS") pts += 3;
    }

    if (shotResult === "made" && specialCase !== "aucun") {
      pts += n(action.ft_made);
    }

    return pts;
  }

  if (actionType === "faute-provoquee") {
    return n(action.ft_made);
  }

  return 0;
}

function addAction(stats: HighlightStats, action: ActionRow) {
  const context = String(action.context || "");
  const actionType = String(action.action_type || "");
  const shotType = String(action.shot_type || "");
  const shotResult = String(action.shot_result || "");

  if (context !== "attaque") return;

  stats.poss += 1;
  stats.pts += pointsOfAction(action);

  if (actionType === "tir") {
    if (shotType === "2PTS") {
      stats.p2a += 1;
      if (shotResult === "made") stats.p2m += 1;
    }

    if (shotType === "3PTS") {
      stats.p3a += 1;
      if (shotResult === "made") stats.p3m += 1;
    }

    if (shotType === "LF") {
      stats.fta += n(action.ft_attempts);
      stats.ftm += n(action.ft_made);
    }

    if (shotType !== "LF" && shotResult === "made" && action.special_case !== "aucun") {
      stats.fta += n(action.ft_attempts);
      stats.ftm += n(action.ft_made);
    }
  }

  if (actionType === "faute-provoquee") {
    stats.foulsDrawn += 1;
    stats.fta += n(action.ft_attempts);
    stats.ftm += n(action.ft_made);
  }

  if (actionType === "perte") {
    stats.turnovers += 1;
  }

  if (action.assist_player_id) {
    stats.assists += 1;
  }
}

function buildHighlightStats(actions: ActionRow[]) {
  const byHighlight = HIGHLIGHTS.reduce((acc, item) => {
    acc[item.key] = emptyHighlight(item);
    return acc;
  }, {} as Record<string, HighlightStats>);

  actions.forEach((action) => {
    const key = normalizeHighlightKey(action);
    const item =
      HIGHLIGHTS.find((highlight) => highlight.key === key) ||
      HIGHLIGHTS.find((highlight) => highlight.key === "jeu-place")!;

    addAction(byHighlight[item.key], action);
  });

  return HIGHLIGHTS.map((item) => byHighlight[item.key]);
}

function aggregateTotal(rows: HighlightStats[]) {
  const total = emptyHighlight({ key: "total", label: "TOTAL" });

  rows.forEach((row) => {
    total.poss += row.poss;
    total.pts += row.pts;
    total.p2m += row.p2m;
    total.p2a += row.p2a;
    total.p3m += row.p3m;
    total.p3a += row.p3a;
    total.ftm += row.ftm;
    total.fta += row.fta;
    total.turnovers += row.turnovers;
    total.foulsDrawn += row.foulsDrawn;
    total.assists += row.assists;
  });

  return total;
}

function advanced(stats: HighlightStats) {
  const fgm = stats.p2m + stats.p3m;
  const fga = stats.p2a + stats.p3a;
  const ppp = stats.poss ? stats.pts / stats.poss : 0;
  const efg = fga ? ((fgm + 0.5 * stats.p3m) / fga) * 100 : 0;
  const ts =
    fga + 0.44 * stats.fta
      ? (stats.pts / (2 * (fga + 0.44 * stats.fta))) * 100
      : 0;
  const astPct = fgm ? (stats.assists / fgm) * 100 : 0;
  const tovPct = stats.poss ? (stats.turnovers / stats.poss) * 100 : 0;
  const ftRate = fga ? stats.fta / fga : 0;

  return {
    fgm,
    fga,
    ppp,
    efg,
    ts,
    astPct,
    tovPct,
    ftRate,
  };
}

function Kpi({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) {
  return (
    <div className="kpi">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function InsightCard({
  label,
  title,
  value,
  tone,
}: {
  label: string;
  title: string;
  value: string;
  tone: "good" | "bad" | "neutral";
}) {
  return (
    <article className={`insight-card ${tone}`}>
      <span>{label}</span>
      <strong>{title}</strong>
      <em>{value}</em>
    </article>
  );
}

export default function StatsTempsFortsModule() {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [mode, setMode] = useState<Mode>("total");

  useEffect(() => {
    async function loadTeamsAndMatches() {
      setLoading(true);

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("match_stats")
        .select("id, team_id, opponent, match_date, us_score, them_score, result, home")
        .eq("user_id", user.id)
        .order("match_date", { ascending: false });

      if (error) {
        console.error("Erreur chargement matchs stats jeu :", error);
        setLoading(false);
        return;
      }

      const rows = (data ?? []) as MatchRow[];
      setMatches(rows);

      const ids = Array.from(
        new Set(rows.map((match) => match.team_id).filter(Boolean).map(String))
      );

      if (ids.length === 0) {
        setTeams([]);
        setTeamId("");
        setActions([]);
        setLoading(false);
        return;
      }

      const { data: teamsData } = await supabase
        .from("teams")
        .select("*")
        .in("id", ids);

      const nextTeams = ids.map((id) => {
        const found = teamsData?.find((team: any) => String(team.id) === id);

        return {
          id,
          name: teamName(found, id),
        };
      });

      setTeams(nextTeams);
      setTeamId((prev) => prev || nextTeams[0]?.id || "");
      setLoading(false);
    }

    loadTeamsAndMatches();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!teamId) return;

    async function loadActions() {
      setLoading(true);

      const selectedMatches = matches.filter((match) => match.team_id === teamId);
      const matchIds = selectedMatches.map((match) => match.id);

      if (matchIds.length === 0) {
        setActions([]);
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("match_actions")
        .select(
          "match_id, team_id, context, inbound, temps_fort, coverage, action_type, shot_type, shot_result, special_case, ft_attempts, ft_made, assist_player_id, rebound_type"
        )
        .in("match_id", matchIds);

      if (error) {
        console.error("Erreur chargement actions stats jeu :", error);
        setActions([]);
        setLoading(false);
        return;
      }

      setActions((data ?? []) as ActionRow[]);
      setLoading(false);
    }

    loadActions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teamId, matches]);

  const selectedTeam = teams.find((team) => team.id === teamId);
  const selectedMatches = useMemo(
    () => matches.filter((match) => match.team_id === teamId),
    [matches, teamId]
  );

  const actionsByMatch = useMemo(() => {
    return actions.reduce((acc, action) => {
      const matchId = String(action.match_id || "");
      if (!matchId) return acc;

      if (!acc[matchId]) acc[matchId] = [];
      acc[matchId].push(action);
      return acc;
    }, {} as Record<string, ActionRow[]>);
  }, [actions]);

  const allRows = useMemo(() => {
    return buildHighlightStats(actions).filter(
      (row) =>
        row.poss ||
        row.pts ||
        row.p2a ||
        row.p3a ||
        row.fta ||
        row.turnovers ||
        row.foulsDrawn
    );
  }, [actions]);

  const total = useMemo(() => aggregateTotal(allRows), [allRows]);
  const totalAdv = advanced(total);

  const performanceRows = useMemo(() => {
    const globalPoss = total.poss;

    return allRows
      .map((row) => ({
        ...row,
        usage: globalPoss ? (row.poss / globalPoss) * 100 : 0,
        ...advanced(row),
      }))
      .sort((a, b) => b.ppp - a.ppp);
  }, [allRows, total.poss]);

  const winLossRows = useMemo(() => {
    const splitActions = (type: "win" | "loss") => {
      const splitMatches = selectedMatches.filter((match) =>
        type === "win" ? isWin(match) : isLoss(match)
      );

      return splitMatches.flatMap((match) => actionsByMatch[match.id] || []);
    };

    const winRows = buildHighlightStats(splitActions("win"));
    const lossRows = buildHighlightStats(splitActions("loss"));

    const winTotal = aggregateTotal(winRows);
    const lossTotal = aggregateTotal(lossRows);

    return HIGHLIGHTS.map((item) => {
      const win = winRows.find((row) => row.key === item.key) || emptyHighlight(item);
      const loss = lossRows.find((row) => row.key === item.key) || emptyHighlight(item);

      const winAdv = advanced(win);
      const lossAdv = advanced(loss);

      return {
        key: item.key,
        label: item.label,
        winPoss: win.poss,
        lossPoss: loss.poss,
        winPts: win.pts,
        lossPts: loss.pts,
        winPpp: winAdv.ppp,
        lossPpp: lossAdv.ppp,
        diff: winAdv.ppp - lossAdv.ppp,
        winUsage: winTotal.poss ? (win.poss / winTotal.poss) * 100 : 0,
        lossUsage: lossTotal.poss ? (loss.poss / lossTotal.poss) * 100 : 0,
      };
    })
      .filter((row) => row.winPoss + row.lossPoss > 0)
      .sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));
  }, [actionsByMatch, selectedMatches]);

  const insights = useMemo(() => {
    const mostEfficient = [...performanceRows].sort((a, b) => b.ppp - a.ppp)[0];
    const mostUsed = [...performanceRows].sort((a, b) => b.poss - a.poss)[0];
    const biggestDiff = [...winLossRows].sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff))[0];
    const mostTurnovers = [...performanceRows].sort((a, b) => b.tovPct - a.tovPct)[0];

    return {
      mostEfficient,
      mostUsed,
      biggestDiff,
      mostTurnovers,
    };
  }, [performanceRows, winLossRows]);

  const display = (value: number) => {
    if (mode === "average") {
      const games = selectedMatches.length || 1;
      return round1(value / games);
    }

    return round1(value);
  };

  return (
    <div className="tf">
      <div className="tf-head">
        <div>
          <h3>Stats jeu</h3>
          <p>
            Analyse par temps fort : performance globale, impact victoire/défaite et insights automatiques.
          </p>
        </div>

        <select value={teamId} onChange={(e) => setTeamId(e.target.value)}>
          {teams.length === 0 && <option value="">Aucune équipe</option>}

          {teams.map((team) => (
            <option key={team.id} value={team.id}>
              {team.name}
            </option>
          ))}
        </select>
      </div>

      {loading && <div className="tf-empty">Chargement...</div>}

      {!loading && !selectedTeam && (
        <div className="tf-empty">Aucune équipe avec match enregistré.</div>
      )}

      {!loading && selectedTeam && (
        <>
          <div className="mode-switch">
            <button
              type="button"
              className={mode === "total" ? "on" : ""}
              onClick={() => setMode("total")}
            >
              Stats globales
            </button>

            <button
              type="button"
              className={mode === "average" ? "on" : ""}
              onClick={() => setMode("average")}
            >
              Moyenne / match
            </button>
          </div>

          <div className="tf-kpis">
            <Kpi label="Possessions" value={display(total.poss)} />
            <Kpi label="Points" value={display(total.pts)} />
            <Kpi label="PPP" value={round2(totalAdv.ppp)} />
            <Kpi label="eFG%" value={`${round1(totalAdv.efg)}%`} />
            <Kpi label="TS%" value={`${round1(totalAdv.ts)}%`} />
            <Kpi label="BP" value={display(total.turnovers)} />
          </div>

          {performanceRows.length > 0 && (
            <div className="insights-grid">
              <InsightCard
                label="Temps fort le plus rentable"
                title={insights.mostEfficient?.label || "—"}
                value={insights.mostEfficient ? `${round2(insights.mostEfficient.ppp)} PPP` : "—"}
                tone="good"
              />

              <InsightCard
                label="Temps fort le plus utilisé"
                title={insights.mostUsed?.label || "—"}
                value={insights.mostUsed ? `${insights.mostUsed.poss} poss` : "—"}
                tone="neutral"
              />

              <InsightCard
                label="Plus gros écart V/D"
                title={insights.biggestDiff?.label || "—"}
                value={
                  insights.biggestDiff
                    ? `${insights.biggestDiff.diff >= 0 ? "+" : ""}${round2(insights.biggestDiff.diff)} PPP`
                    : "—"
                }
                tone={insights.biggestDiff && insights.biggestDiff.diff < 0 ? "bad" : "good"}
              />

              <InsightCard
                label="Plus gros TO%"
                title={insights.mostTurnovers?.label || "—"}
                value={insights.mostTurnovers ? `${round1(insights.mostTurnovers.tovPct)}%` : "—"}
                tone="bad"
              />
            </div>
          )}

          <div className="sub-block">
            <div className="sub-head">
              <h4>Tableau 1 — Performance par temps fort</h4>
              <p>Les temps forts sont en lignes, les indicateurs sont en colonnes.</p>
            </div>

            <div className="tf-table-wrap">
              <table className="tf-table">
                <thead>
                  <tr>
                    <th>Temps fort</th>
                    <th>Poss.</th>
                    <th>% Util.</th>
                    <th>PTS</th>
                    <th>PPP</th>
                    <th>2PM-A</th>
                    <th>2PT%</th>
                    <th>3PM-A</th>
                    <th>3PT%</th>
                    <th>FTM-A</th>
                    <th>LF%</th>
                    <th>BP</th>
                    <th>FP</th>
                    <th>eFG%</th>
                    <th>TS%</th>
                    <th>AST%</th>
                    <th>TO%</th>
                    <th>FTr</th>
                  </tr>
                </thead>

                <tbody>
                  {performanceRows.map((row) => (
                    <tr key={row.key}>
                      <td className="label">{row.label}</td>
                      <td>{display(row.poss)}</td>
                      <td>{round1(row.usage)}%</td>
                      <td className="pts">{display(row.pts)}</td>
                      <td className={row.ppp >= 1.1 ? "good" : row.ppp < 0.85 ? "bad" : ""}>
                        {round2(row.ppp)}
                      </td>
                      <td>{display(row.p2m)}-{display(row.p2a)}</td>
                      <td>{percent(row.p2m, row.p2a)}</td>
                      <td>{display(row.p3m)}-{display(row.p3a)}</td>
                      <td>{percent(row.p3m, row.p3a)}</td>
                      <td>{display(row.ftm)}-{display(row.fta)}</td>
                      <td>{percent(row.ftm, row.fta)}</td>
                      <td>{display(row.turnovers)}</td>
                      <td>{display(row.foulsDrawn)}</td>
                      <td>{round1(row.efg)}%</td>
                      <td>{round1(row.ts)}%</td>
                      <td>{round1(row.astPct)}%</td>
                      <td>{round1(row.tovPct)}%</td>
                      <td>{round2(row.ftRate)}</td>
                    </tr>
                  ))}

                  {performanceRows.length === 0 && (
                    <tr>
                      <td colSpan={18} className="empty-line">
                        Aucune action exploitable dans match_actions pour cette équipe.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="sub-block">
            <div className="sub-head">
              <h4>Tableau 2 — Impact victoire / défaite</h4>
              <p>Ce tableau montre quels temps forts changent vraiment selon le résultat.</p>
            </div>

            <div className="tf-table-wrap">
              <table className="tf-table winloss">
                <thead>
                  <tr>
                    <th>Temps fort</th>
                    <th>PPP Victoire</th>
                    <th>PPP Défaite</th>
                    <th>Diff PPP</th>
                    <th>Util. Victoire</th>
                    <th>Util. Défaite</th>
                    <th>Poss V</th>
                    <th>Poss D</th>
                    <th>PTS V</th>
                    <th>PTS D</th>
                  </tr>
                </thead>

                <tbody>
                  {winLossRows.map((row) => (
                    <tr key={row.key}>
                      <td className="label">{row.label}</td>
                      <td>{round2(row.winPpp)}</td>
                      <td>{round2(row.lossPpp)}</td>
                      <td className={row.diff >= 0 ? "good" : "bad"}>
                        {row.diff >= 0 ? "+" : ""}
                        {round2(row.diff)}
                      </td>
                      <td>{round1(row.winUsage)}%</td>
                      <td>{round1(row.lossUsage)}%</td>
                      <td>{row.winPoss}</td>
                      <td>{row.lossPoss}</td>
                      <td>{row.winPts}</td>
                      <td>{row.lossPts}</td>
                    </tr>
                  ))}

                  {winLossRows.length === 0 && (
                    <tr>
                      <td colSpan={10} className="empty-line">
                        Il faut au moins des actions associées aux matchs pour comparer victoire/défaite.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      <style jsx>{`
        .tf {
          width: 100%;
          background: white;
          border: 1px solid #efe6db;
          border-radius: 18px;
          padding: 1.2rem;
          box-shadow: 0 12px 34px rgba(60, 30, 20, 0.06);
        }

        .tf-head {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1.25rem;
          margin: -1.2rem -1.2rem 1.25rem;
          padding: 1.35rem 1.4rem;
          border-radius: 18px 18px 0 0;
          background: linear-gradient(135deg, #6b1a2c, #3d0d18);
        }

        .tf-head h3 {
          margin: 0;
          color: #ffffff;
          font-size: 1.55rem;
          font-weight: 900;
        }

        .tf-head p {
          margin: 0.25rem 0 0;
          color: rgba(255,255,255,.78);
          font-size: 0.92rem;
          line-height: 1.45;
        }

        select {
          border: 1px solid #eadccc;
          border-radius: 10px;
          padding: 0.65rem 0.9rem;
          font-weight: 900;
          color: #6b1a2c;
          background: white;
          min-width: 220px;
        }

        .tf-empty {
          background: #fff8ef;
          border: 1px dashed #d4a24c;
          border-radius: 14px;
          padding: 1.2rem;
          color: #6b1a2c;
          font-weight: 900;
        }

        .mode-switch {
          display: inline-flex;
          gap: 0.4rem;
          background: #fff8ef;
          border: 1px solid #eadccc;
          border-radius: 999px;
          padding: 0.3rem;
          margin-bottom: 1rem;
        }

        .mode-switch button {
          border: 0;
          background: transparent;
          color: #6b1a2c;
          padding: 0.65rem 1.05rem;
          border-radius: 999px;
          cursor: pointer;
          font-weight: 900;
        }

        .mode-switch button.on {
          background: #6b1a2c;
          color: white;
        }

        .tf-kpis {
          display: grid;
          grid-template-columns: repeat(6, minmax(0, 1fr));
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .kpi,
        .insight-card {
          border: 1px solid #efe6db;
          border-radius: 14px;
          padding: 0.9rem;
          background: #fff8ef;
        }

        .kpi span,
        .insight-card span {
          display: block;
          color: #7c7470;
          font-size: 0.75rem;
          font-weight: 900;
          text-transform: uppercase;
        }

        .kpi strong,
        .insight-card strong {
          display: block;
          color: #6b1a2c;
          font-size: 1.25rem;
          margin-top: 0.25rem;
          font-weight: 900;
        }

        .insight-card em {
          display: block;
          margin-top: 0.25rem;
          font-style: normal;
          font-weight: 900;
          color: #d4a24c;
        }

        .insight-card.good em {
          color: #177245;
        }

        .insight-card.bad em {
          color: #a82018;
        }

        .insights-grid {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 0.75rem;
          margin-bottom: 1rem;
        }

        .sub-block {
          border: 1px solid #efe6db;
          border-radius: 16px;
          overflow: hidden;
          margin-top: 1rem;
        }

        .sub-head {
          background: #fff8ef;
          border-bottom: 1px solid #efe6db;
          padding: 1rem;
        }

        .sub-head h4 {
          margin: 0;
          color: #6b1a2c;
          font-size: 1.05rem;
          font-weight: 900;
        }

        .sub-head p {
          margin: 0.25rem 0 0;
          color: #7c7470;
          font-size: 0.85rem;
          font-weight: 800;
        }

        .tf-table-wrap {
          width: 100%;
          overflow-x: auto;
        }

        .tf-table {
          width: 100%;
          min-width: 1550px;
          border-collapse: separate;
          border-spacing: 0;
          font-size: 0.82rem;
        }

        .tf-table.winloss {
          min-width: 980px;
        }

        th {
          background: linear-gradient(180deg, #6b1a2c, #49101d);
          color: white;
          padding: 0.78rem 0.65rem;
          text-align: center;
          white-space: nowrap;
          font-weight: 900;
        }

        th:first-child {
          text-align: left;
          min-width: 190px;
        }

        td {
          padding: 0.78rem 0.65rem;
          border-bottom: 1px solid #eee;
          text-align: center;
          white-space: nowrap;
          background: #fff;
          font-weight: 800;
        }

        td:first-child {
          text-align: left;
          min-width: 190px;
          max-width: 190px;
          overflow: hidden;
          text-overflow: ellipsis;
          background: #fafafa;
        }

        .label {
          color: #6b1a2c;
          font-weight: 900;
        }

        .pts {
          color: #d4a24c;
          font-weight: 900;
        }

        .good {
          color: #177245;
          font-weight: 900;
        }

        .bad {
          color: #a82018;
          font-weight: 900;
        }

        .empty-line {
          text-align: center !important;
          color: #6b1a2c;
          font-weight: 900;
          padding: 1.5rem;
        }

        @media (max-width: 1100px) {
          .tf-kpis {
            grid-template-columns: repeat(3, 1fr);
          }

          .insights-grid {
            grid-template-columns: repeat(2, 1fr);
          }
        }

        @media (max-width: 980px) {
          .tf-head {
            flex-direction: column;
          }

          select {
            width: 100%;
          }

          .mode-switch {
            width: 100%;
          }

          .mode-switch button {
            flex: 1;
          }
        }

        @media (max-width: 640px) {
          .tf-kpis,
          .insights-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
