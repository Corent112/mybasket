"use client";
import { useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  BarChart,
  Bar,
} from "recharts";
import { createClient } from "@/lib/supabase/client";
import { loadMatchAnalysis } from "@/lib/analytics/load-matches";
import {
  boxOf,
  addBoxes,
  indicators,
  ratio,
  numeric,
  sumKnown,
  automaticInsights,
  opponentBoxOf,
  matchMinutes,
  fastBreakPoints,
  type DataRow,
} from "@/lib/analytics/matches";
import { playerMatchCategoryOf } from "@/lib/player-match-stats";
import ShotChart from "@/components/prise-stats-pro/ShotChart";
import { fetchTeamTags } from "@/lib/livestat-tags";
import PostMatchSummary from "./PostMatchSummary";
import styles from "./TeamMatchAnalysis.module.css";

const fmt = (n: number | null, decimals = 1) =>
  n == null
    ? "—"
    : n.toLocaleString("fr-FR", { maximumFractionDigits: decimals });
const defaultFactors = ["efg", "tov", "orb", "ftr", "jr"];
type AnalysisProps = { teamId: string; teamName?: string };
export default function TeamMatchAnalysis(props: AnalysisProps) {
  return <MatchAnalysis key={props.teamId} {...props} />;
}
function MatchAnalysis({ teamId, teamName = "Équipe" }: AnalysisProps) {
  const [data, setData] = useState<{
    matches: DataRow[];
    rows: DataRow[];
    actions: DataRow[];
  }>({ matches: [], rows: [], actions: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [category, setCategory] = useState("all");
  const [matchId, setMatchId] = useState("all");
  const [metric, setMetric] = useState("net");
  const [exporting, setExporting] = useState(false);
  const [factorKeys, setFactorKeys] = useState(defaultFactors);
  const [tags, setTags] = useState<ReadonlyMap<string, string>>(new Map());
  const [factorPreference, setFactorPreference] = useState<string | null>(null);
  function toggleFactor(key: string) {
    const next = factorKeys.includes(key)
      ? factorKeys.filter((factor) => factor !== key)
      : [...factorKeys, key];
    setFactorKeys(next);
    try { if (factorPreference) localStorage.setItem(factorPreference, JSON.stringify(next)); } catch {}
  }
  useEffect(() => {
    let live = true;
    const db = createClient();
    Promise.all([loadMatchAnalysis(db, teamId), fetchTeamTags(teamId), db.auth.getUser().catch(() => null)])
      .then(([result, teamTags, identity]) => {
        if (!live) return;
        setData(result);
        setTags(new Map(teamTags.map((tag) => [tag.key, tag.label])));
        const owner = identity?.data.user?.id;
        if (!owner) return;
        const preference = `mybasket:x-factors:${owner}:${teamId}`;
        setFactorPreference(preference);
        try {
          const saved: unknown = JSON.parse(localStorage.getItem(preference) ?? "null");
          if (Array.isArray(saved)) setFactorKeys(saved.filter((key) => typeof key === "string"));
        } catch {}
      })
      .catch((e) => {
        if (live) setError(e.message);
      })
      .finally(() => {
        if (live) setLoading(false);
      });
    return () => {
      live = false;
    };
  }, [teamId]);
  const selected = useMemo(
    () =>
      data.matches.filter(
        (m) =>
          (category === "all" || playerMatchCategoryOf(m) === category) &&
          (matchId === "all" || m.id === matchId),
      ),
    [data.matches, category, matchId],
  );
  const selectedIds = new Set(selected.map((m) => m.id));
  const rows = data.rows.filter((r) => selectedIds.has(r.match_id));
  const eligible = rows.filter((r) => r.present !== false);
  const populated = new Set(eligible.map((r) => r.match_id));
  const covered = selected.filter((m) => populated.has(m.id));
  const totals = {
    ...boxOf(rows),
    pts: sumKnown(covered, "us_score") ?? boxOf(rows).pts,
  };
  const opponentBoxes = new Map(selected.map((match) => [match.id, opponentBoxOf(match, data.actions)]));
  const opponents = addBoxes(covered.map((match) => opponentBoxes.get(match.id)!));
  const values = indicators(totals, opponents);
  const periods = [1, 2, 3, 4].map((q) => {
    const scores = selected
      .map((m) => m.per_q?.[q])
      .filter((p) => numeric(p?.us) != null && numeric(p?.them) != null);
    return {
      name: `Q${q}`,
      Écart: scores.length
        ? scores.reduce((s, p) => s + Number(p.us) - Number(p.them), 0) /
          scores.length
        : null,
      games: scores.length,
    };
  });
  const close = selected.filter(
    (m) =>
      numeric(m.us_score) != null &&
      numeric(m.them_score) != null &&
      Math.abs(Number(m.us_score) - Number(m.them_score)) <= 5,
  );
  const closeWins = close.filter(
    (m) => Number(m.us_score) > Number(m.them_score),
  ).length;
  const pace = ratio(
    values.possessions,
    covered.reduce((s, m) => s + matchMinutes(m), 0),
    40,
  );
  const scored = selected.filter(
    (m) => numeric(m.us_score) != null && numeric(m.them_score) != null,
  );
  const wins = scored.filter(
    (m) => Number(m.us_score) > Number(m.them_score),
  ).length;
  const evolution = selected.map((m) => {
    const b = boxOf(data.rows.filter((r) => r.match_id === m.id));
    const metrics = indicators(
      { ...b, pts: numeric(m.us_score) ?? b.pts },
      opponentBoxes.get(m.id),
    );
    return { name: m.opponent || m.match_date, ...metrics };
  });
  const shots = data.actions
    .filter(
      (a) =>
        selectedIds.has(a.match_id) &&
        a.context !== "defense" &&
        a.action_type === "tir" &&
        a.shot_type !== "LF",
    )
    .map((a) => ({
      shotZoneId: a.shot_zone_id,
      shotResult: a.shot_result,
      shotType: a.shot_type,
      courtX: a.court_x,
      courtY: a.court_y,
    }));
  const coverage = populated.size;
  const selectedActions = data.actions.filter((action) => selectedIds.has(action.match_id));
  const fastBreak = fastBreakPoints(selectedActions, tags);
  const defensiveCoverage = covered.filter((match) => opponentBoxes.get(match.id)?.p2a != null);
  const pairedOwn = boxOf(rows.filter((row) => defensiveCoverage.some((match) => match.id === row.match_id)));
  const pairedOpponents = addBoxes(defensiveCoverage.map((match) => opponentBoxes.get(match.id)!));
  const pairedDefense = indicators(pairedOpponents, pairedOwn);
  const factors = [
    ["efg", "Adresse effective · eFG %", values.efg, pairedDefense.efg, "%"],
    ["tov", "Ballons perdus · TOV %", values.tov, pairedDefense.tov, "%"],
    ["orb", "Rebond offensif · ORB %", indicators(pairedOwn, pairedOpponents).orb, pairedDefense.orb, "%"],
    ["ftr", "LF tentés / tir", values.ftr, pairedDefense.ftr, ""],
    ["jr", "Points marqués en jeu rapide · JR", fastBreak, fastBreakPoints(selectedActions, tags, "defense"), " pts"],
    ["ts", "Adresse globale · TS %", values.ts, pairedDefense.ts, "%"],
    ["ast", "Paniers assistés", values.assists, pairedDefense.assists, "%"],
    ["astTo", "Passes décisives / ballons perdus", values.astTo, pairedDefense.astTo, ""],
    ["pps", "Points par tir de champ", values.pointsPerShot, pairedDefense.pointsPerShot, ""],
    ["three", "Part des tirs à 3 points", values.threeRate, pairedDefense.threeRate, "%"],
  ] as const;
  const points = [
    {
      label: "2 PTS",
      value: totals.p2m == null ? null : totals.p2m * 2,
      color: "#6b1a2c",
    },
    {
      label: "3 PTS",
      value: totals.p3m == null ? null : totals.p3m * 3,
      color: "#d4a24c",
    },
    { label: "LF", value: totals.ftm, color: "#b9a8ad" },
  ];
  const pointsTotal = points.every((p) => p.value != null)
    ? points.reduce((s, p) => s + p.value!, 0)
    : null;
  async function pdf(mode: "average" | "matches") {
    setExporting(true);
    try {
      const { exportMatchAnalysisPdf } =
        await import("@/lib/analytics/export-match-pdf");
      await exportMatchAnalysisPdf({
        name: teamName,
        matches: selected,
        rows,
        actions: data.actions,
        mode,
      });
    } catch {
      setError("Export PDF indisponible. Réessaie.");
    } finally {
      setExporting(false);
    }
  }

  if (loading) return <p role="status">Chargement de l’analyse des matchs…</p>;
  if (error && !data.matches.length) return <p role="alert">{error}</p>;
  return (
    <section className={styles.root}>
      <header className={styles.header}>
        <div>
          <small>ÉQUIPE · APRÈS-MATCH</small>
          <h2>Analyse des matchs</h2>
          <p>
            {scored.length} matchs · {wins} V – {scored.length - wins} D
          </p>
        </div>
        <div className={styles.controls}>
          <select
            aria-label="Compétition"
            value={category}
            onChange={(e) => {
              setCategory(e.target.value);
              setMatchId("all");
            }}
          >
            <option value="all">Toutes les compétitions</option>
            <option value="championship">Championnat</option>
            <option value="cup">Coupe</option>
            <option value="friendly">Amical</option>
          </select>
          <select
            aria-label="Match à analyser"
            value={matchId}
            onChange={(e) => setMatchId(e.target.value)}
          >
            <option value="all">Moyennes · tous les matchs</option>
            {data.matches
              .filter(
                (m) =>
                  category === "all" || playerMatchCategoryOf(m) === category,
              )
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {String(m.match_date || "").slice(0, 10)} · {m.opponent}
                </option>
              ))}
          </select>
          <button
            disabled={exporting || !selected.length}
            onClick={() => void pdf("average")}
          >
            PDF moyennes
          </button>
          <button
            disabled={exporting || !selected.length}
            onClick={() => void pdf("matches")}
          >
            PDF par match
          </button>
        </div>
      </header>
      {error && <p role="alert">{error}</p>}
      {!selected.length ? (
        <p>Aucun match terminé dans cette sélection.</p>
      ) : (
        <>
          <p className={styles.note}>
            {coverage}/{selected.length} matchs avec statistiques joueurs. Les
            possessions sont estimées. Les indicateurs défensifs sont calculés
            lorsque les points des actions codées correspondent au score
            adverse.
          </p>
          <div className={styles.kpis}>
            {[
              ["Offensive rating", values.ortg, "Points / 100 possessions"],
              [
                "Defensive rating",
                values.drtg,
                "Points encaissés / 100 possessions",
              ],
              ["Net rating", values.net, "Écart des ratings"],
              ["Rythme estimé", pace, "Possessions sur 40 minutes"],
              ["True shooting", values.ts, "TS %"],
            ].map(([label, n, detail]) => (
              <article key={String(label)}>
                <strong>{fmt(n as number | null)}</strong>
                <b>{label}</b>
                <small>{detail}</small>
              </article>
            ))}
          </div>
          <article className={styles.card}>
            <h3>Statistiques match par match</h3>
            <div className={styles.scroll}>
              <table>
                <thead>
                  <tr>
                    {[
                      "Date",
                      "Adversaire",
                      "Score",
                      "2R/T",
                      "3R/T",
                      "LFR/T",
                      "RO",
                      "RD",
                      "PD",
                      "BP",
                      "eFG %",
                      "TS %",
                    ].map((x) => (
                      <th key={x}>{x}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {selected.map((m) => {
                    const b = boxOf(
                      data.rows.filter((r) => r.match_id === m.id),
                    );
                    const v = indicators(b);
                    return (
                      <tr key={m.id}>
                        <td>{String(m.match_date || "").slice(0, 10)}</td>
                        <td>
                          <button onClick={() => setMatchId(m.id)}>
                            {m.opponent}
                          </button>
                        </td>
                        <td>
                          {fmt(numeric(m.us_score), 0)}–
                          {fmt(numeric(m.them_score), 0)}
                        </td>
                        <td>
                          {fmt(b.p2m)}/{fmt(b.p2a)}
                        </td>
                        <td>
                          {fmt(b.p3m)}/{fmt(b.p3a)}
                        </td>
                        <td>
                          {fmt(b.ftm)}/{fmt(b.fta)}
                        </td>
                        {[
                          b.off_reb,
                          b.def_reb,
                          b.ast,
                          b.turnovers,
                          v.efg,
                          v.ts,
                        ].map((value, i) => (
                          <td key={i}>{fmt(value)}</td>
                        ))}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
          <div className={styles.grid}>
            <article className={styles.card}>
              <h3>Mes X Factors</h3>
              <details className={styles.factorSettings}>
                <summary>Choisir mes statistiques</summary>
                <fieldset>
                  <legend>Indicateurs affichés</legend>
                  {factors.map(([key, label]) => (
                    <label key={key}>
                      <input type="checkbox" checked={factorKeys.includes(key)} onChange={() => toggleFactor(key)} />
                      {label}
                    </label>
                  ))}
                </fieldset>
              </details>
              <p>Codage adverse vérifié sur {defensiveCoverage.length} / {selected.length} match(s). Le rebond offensif utilise ces mêmes matchs.</p>
              {factorKeys.includes("jr") && <p>JR totalise les points des actions codées « Jeu rapide », « JR », « Fast Break » ou « Contre-attaque ». Un tiret indique qu’aucune action n’a été identifiée sur la période.</p>}
              <table>
                <thead>
                  <tr>
                    <th>Indicateur</th>
                    <th>Attaque</th>
                    <th>Défense</th>
                  </tr>
                </thead>
                <tbody>
                  {factors.filter(([key]) => factorKeys.includes(key)).map(([key, label, value, opp, unit]) => (
                    <tr key={key}>
                      <td>{label}</td>
                      <td>
                        {fmt(value)}
                        {value != null ? unit : ""}
                        {unit === "%" && value != null && <meter min={0} max={100} value={value} />}
                      </td>
                      <td>
                        {fmt(opp)}
                        {opp != null ? unit : ""}
                        {unit === "%" && opp != null && <meter min={0} max={100} value={opp} />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </article>
            <article className={styles.card}>
              <h3>Profil de jeu</h3>
              <div className={styles.distribution}>
                {points.map((p) => (
                  <div
                    key={p.label}
                    style={{
                      background: p.color,
                      flex: p.value && pointsTotal ? p.value / pointsTotal : 1,
                    }}
                  >
                    {p.label} · {fmt(ratio(p.value, pointsTotal, 100), 0)} %
                  </div>
                ))}
              </div>
              <dl>
                {[
                  ["Tirs à 3 points", values.threeRate, "%"],
                  ["Paniers assistés", values.assists, "%"],
                  ["PD / BP", values.astTo, ""],
                  ["Points / tir de champ", values.pointsPerShot, ""],
                  ["Points en jeu rapide · JR", fastBreak, " pts"],
                  [
                    "Matchs serrés (≤ 5 pts)",
                    close.length ? closeWins : null,
                    close.length ? ` V / ${close.length} matchs` : "",
                  ],
                ].map(([l, v, u]) => (
                  <div key={String(l)}>
                    <dt>{l}</dt>
                    <dd>
                      {fmt(v as number | null)}
                      {v != null ? u : ""}
                    </dd>
                  </div>
                ))}
              </dl>
            </article>
            <article className={styles.card}>
              <h3>Évolution match par match</h3>
              <select
                value={metric}
                aria-label="Indicateur de la courbe"
                onChange={(e) => setMetric(e.target.value)}
              >
                {[
                  ["net", "Net rating"],
                  ["ortg", "Off. rating"],
                  ["drtg", "Déf. rating"],
                  ["possessions", "Rythme"],
                  ["ts", "TS %"],
                ].map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
              <div className={styles.chart}>
                <ResponsiveContainer>
                  <LineChart data={evolution}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis tick={{ fontSize: 10 }} />
                    <Tooltip />
                    <Line
                      dataKey={metric}
                      stroke="#6b1a2c"
                      strokeWidth={3}
                      connectNulls={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </article>
            <article className={styles.card}>
              <h3>Écart moyen par période</h3>
              <div className={styles.chart}>
                <ResponsiveContainer>
                  <BarChart data={periods}>
                    <XAxis dataKey="name" />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="Écart" fill="#6b1a2c" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className={styles.note}>
                Points marqués − encaissés. Seules les périodes renseignées sont
                incluses.
              </p>
            </article>
            <article className={styles.card}>
              <h3>Scores comparés</h3>
              <div className={styles.chart}>
                <ResponsiveContainer>
                  <BarChart
                    data={scored.map((m) => ({
                      name: m.opponent,
                      Marqués: Number(m.us_score),
                      Encaissés: Number(m.them_score),
                    }))}
                  >
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                    <YAxis />
                    <Tooltip />
                    <Bar dataKey="Marqués" fill="#6b1a2c" />
                    <Bar dataKey="Encaissés" fill="#d4a24c" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </article>
            <article className={styles.card}>
              <h3>Adresse par zone</h3>
              {shots.length ? (
                <ShotChart shots={shots} mode="analysis" />
              ) : (
                <p>Les matchs sélectionnés n’ont pas de tirs localisés.</p>
              )}
            </article>
            <article className={styles.card}>
              <h3>Résumé après-match</h3>
              {selected.length === 1 ? (
                <PostMatchSummary matchId={selected[0].id} />
              ) : (
                <ul>
                  {automaticInsights(totals, opponents).map((text) => (
                    <li key={text}>{text}</li>
                  ))}
                </ul>
              )}
            </article>
          </div>
        </>
      )}
    </section>
  );
}
