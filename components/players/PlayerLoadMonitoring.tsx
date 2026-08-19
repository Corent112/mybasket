"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type LoadRow = {
  id: string;
  load_date: string;
  duration_minutes: number;
  actual_rpe: number | null;
  actual_load: number;
  planned_load: number;
  load_type: string;
  wellness_response_id?: string | null;
};

type TeamPlan = {
  id: string;
  plan_date: string;
  duration_minutes: number;
  planned_rpe: number;
  load_type: string;
};

type WellnessRow = {
  id: string;
  response_date: string;
  response_kind: string;
  duration_minutes: number | null;
  rpe: number | null;
  fatigue: number | null;
  soreness: number | null;
  sleep: number | null;
  stress: number | null;
  comment: string | null;
  computed_load?: number | null;
  created_at: string;
};

type PeriodMode = "week" | "month" | "year";

const BORDEAUX = "#6B1A2C";
const GOLD = "#D4A24C";
const TEXT = "#211A18";
const MUTED = "#7F716A";
const BORDER = "#E8DDD7";
const SOFT = "#FBF7F3";
const ALERT = "#B42318";
const WATCH = "#A56B0A";
const OK = "#3F7C4E";

function startOfWeek(date: Date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(12, 0, 0, 0);
  return d;
}

function endOfWeek(date: Date) {
  const d = startOfWeek(date);
  d.setDate(d.getDate() + 6);
  return d;
}

function startOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth(), 1, 12);
}

function endOfMonth(date: Date) {
  return new Date(date.getFullYear(), date.getMonth() + 1, 0, 12);
}

function startOfYear(date: Date) {
  return new Date(date.getFullYear(), 0, 1, 12);
}

function endOfYear(date: Date) {
  return new Date(date.getFullYear(), 11, 31, 12);
}

function addPeriod(date: Date, mode: PeriodMode, delta: number) {
  const d = new Date(date);
  if (mode === "week") d.setDate(d.getDate() + 7 * delta);
  if (mode === "month") d.setMonth(d.getMonth() + delta);
  if (mode === "year") d.setFullYear(d.getFullYear() + delta);
  return d;
}

function iso(date: Date) {
  return date.toISOString().slice(0, 10);
}

function fmtShort(date: Date) {
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function fmtPeriod(mode: PeriodMode, cursor: Date) {
  if (mode === "week") {
    return `${fmtShort(startOfWeek(cursor))} – ${fmtShort(endOfWeek(cursor))} ${cursor.getFullYear()}`;
  }
  if (mode === "month") {
    return cursor.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  }
  return String(cursor.getFullYear());
}

function dayLabel(value: string, mode: PeriodMode) {
  const d = new Date(`${value}T12:00:00`);
  if (mode === "year") {
    return d.toLocaleDateString("fr-FR", { month: "short" });
  }
  return d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function periodBounds(mode: PeriodMode, cursor: Date) {
  if (mode === "week") return { start: startOfWeek(cursor), end: endOfWeek(cursor) };
  if (mode === "month") return { start: startOfMonth(cursor), end: endOfMonth(cursor) };
  return { start: startOfYear(cursor), end: endOfYear(cursor) };
}

function avg(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function MetricCard({
  label,
  value,
  sub,
}: {
  label: string;
  value: string | number;
  sub: string;
}) {
  return (
    <div style={styles.metricCard}>
      <span style={styles.metricLabel}>{label}</span>
      <strong style={styles.metricValue}>{value}</strong>
      <small style={styles.metricSub}>{sub}</small>
    </div>
  );
}

function Chart({
  data,
  series,
  min = 0,
  max,
  height = 260,
}: {
  data: Array<Record<string, string | number | null>>;
  series: Array<{ key: string; label: string; stroke: string; dashed?: boolean }>;
  min?: number;
  max?: number;
  height?: number;
}) {
  const width = 920;
  const left = 46;
  const right = 18;
  const top = 18;
  const bottom = 36;
  const innerW = width - left - right;
  const innerH = height - top - bottom;

  const allValues = data.flatMap((row) =>
    series
      .map((s) => row[s.key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v)),
  );

  const maxValue = max ?? Math.max(10, Math.ceil((Math.max(...allValues, 0) || 10) * 1.15));
  const span = Math.max(1, maxValue - min);

  const x = (index: number) =>
    left + (data.length <= 1 ? innerW / 2 : (index / (data.length - 1)) * innerW);

  const y = (value: number) =>
    top + innerH - ((value - min) / span) * innerH;

  const grid = [0, 0.25, 0.5, 0.75, 1].map((r) => min + (maxValue - min) * r);

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        style={{ display: "block", minWidth: 590 }}
      >
        {grid.map((value) => (
          <g key={value}>
            <line
              x1={left}
              x2={width - right}
              y1={y(value)}
              y2={y(value)}
              stroke="#ECE5E0"
              strokeWidth="1"
            />
            <text
              x={left - 8}
              y={y(value) + 4}
              textAnchor="end"
              fontSize="10"
              fill="#8C7E77"
            >
              {Math.round(value)}
            </text>
          </g>
        ))}

        {series.map((s) => {
          const validPoints = data
            .map((row, index) => ({
              index,
              value: row[s.key],
            }))
            .filter(
              (p): p is { index: number; value: number } =>
                typeof p.value === "number" && Number.isFinite(p.value),
            );

          const polyline = validPoints
            .map((p) => `${x(p.index)},${y(p.value)}`)
            .join(" ");

          return (
            <g key={s.key}>
              {validPoints.length >= 2 && (
                <polyline
                  points={polyline}
                  fill="none"
                  stroke={s.stroke}
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray={s.dashed ? "7 5" : undefined}
                />
              )}

              {validPoints.map((p) => (
                <g key={`${s.key}-${p.index}`}>
                  <circle
                    cx={x(p.index)}
                    cy={y(p.value)}
                    r="6"
                    fill="#fff"
                    stroke={s.stroke}
                    strokeWidth="3"
                  />
                  <circle
                    cx={x(p.index)}
                    cy={y(p.value)}
                    r="2.2"
                    fill={s.stroke}
                  />
                </g>
              ))}
            </g>
          );
        })}

        {data.map((row, index) => {
          const label = String(row.label || "");
          const shouldShow =
            data.length <= 10 ||
            index === 0 ||
            index === data.length - 1 ||
            index % Math.ceil(data.length / 8) === 0;

          return shouldShow ? (
            <text
              key={`${label}-${index}`}
              x={x(index)}
              y={height - 10}
              textAnchor="middle"
              fontSize="10"
              fill="#8C7E77"
            >
              {label}
            </text>
          ) : null;
        })}
      </svg>

      <div style={styles.legend}>
        {series.map((s) => (
          <span key={s.key}>
            <i
              style={{
                display: "inline-block",
                width: 19,
                height: 3,
                marginRight: 6,
                verticalAlign: "middle",
                background: s.stroke,
              }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

export default function PlayerLoadMonitoring({
  playerId,
  teamId,
}: {
  playerId: string;
  teamId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [plans, setPlans] = useState<TeamPlan[]>([]);
  const [wellness, setWellness] = useState<WellnessRow[]>([]);
  const [mode, setMode] = useState<PeriodMode>("week");
  const [cursor, setCursor] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const bounds = useMemo(() => periodBounds(mode, cursor), [mode, cursor]);
  const startIso = iso(bounds.start);
  const endIso = iso(bounds.end);

  const toast = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2200);
  };

  async function reload() {
    setLoading(true);

    const [loadResult, wellnessResult, planResult] = await Promise.all([
      supabase
        .from("training_load_entries")
        .select(
          "id,load_date,duration_minutes,actual_rpe,actual_load,planned_load,load_type,wellness_response_id",
        )
        .eq("team_id", teamId)
        .eq("player_id", playerId)
        .order("load_date", { ascending: true })
        .limit(1200),

      supabase
        .from("player_wellness_responses")
        .select(
          "id,response_date,response_kind,duration_minutes,rpe,fatigue,soreness,sleep,stress,comment,computed_load,created_at",
        )
        .eq("team_id", teamId)
        .eq("player_id", playerId)
        .order("created_at", { ascending: true })
        .limit(1200),

      supabase
        .from("team_load_plans")
        .select("id,plan_date,duration_minutes,planned_rpe,load_type")
        .eq("team_id", teamId)
        .order("plan_date", { ascending: true })
        .limit(1200),
    ]);

    if (loadResult.error) console.error(loadResult.error);
    if (wellnessResult.error) console.error(wellnessResult.error);
    if (planResult.error) console.error(planResult.error);

    setLoads((loadResult.data ?? []) as LoadRow[]);
    setWellness((wellnessResult.data ?? []) as WellnessRow[]);
    setPlans((planResult.data ?? []) as TeamPlan[]);
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, [playerId, teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function deleteResponse(row: WellnessRow) {
    const wording =
      row.response_kind === "post_session" && row.rpe != null
        ? `Supprimer le RPE ${row.rpe}/10 et sa charge associée ?`
        : "Supprimer cette réponse de récupération ?";

    if (!window.confirm(wording)) return;

    setDeleting(row.id);
    const { data, error } = await supabase.rpc(
      "delete_player_wellness_response",
      { p_response_id: row.id },
    );
    setDeleting(null);

    if (error) return alert(error.message);

    const result = (data || {}) as { ok?: boolean; message?: string };
    if (result.ok === false) return alert(result.message || "Suppression impossible.");

    toast("RPE / réponse supprimé(e) ✓");
    await reload();
  }

  const periodLoads = useMemo(
    () => loads.filter((row) => row.load_date >= startIso && row.load_date <= endIso),
    [loads, startIso, endIso],
  );

  const periodWellness = useMemo(
    () =>
      wellness.filter(
        (row) => row.response_date >= startIso && row.response_date <= endIso,
      ),
    [wellness, startIso, endIso],
  );

  const periodPlans = useMemo(
    () => plans.filter((row) => row.plan_date >= startIso && row.plan_date <= endIso),
    [plans, startIso, endIso],
  );

  const chartRows = useMemo(() => {
    const planMap = new Map(periodPlans.map((p) => [p.plan_date, p]));
    const wellnessMap = new Map<string, WellnessRow>();
    const loadMap = new Map<string, number>();

    for (const row of periodWellness) wellnessMap.set(row.response_date, row);
    for (const row of periodLoads) {
      loadMap.set(
        row.load_date,
        (loadMap.get(row.load_date) || 0) + Number(row.actual_load || 0),
      );
    }

    const dates = Array.from(
      new Set([
        ...periodPlans.map((p) => p.plan_date),
        ...periodWellness.map((w) => w.response_date),
        ...periodLoads.map((l) => l.load_date),
      ]),
    ).sort();

    return dates.map((date) => {
      const plan = planMap.get(date);
      const w = wellnessMap.get(date);

      return {
        date,
        label: dayLabel(date, mode),
        plannedRpe: plan?.planned_rpe ?? null,
        actualRpe: w?.rpe ?? null,
        charge: loadMap.get(date) ?? null,
        fatigue: w?.fatigue ?? null,
        sleep: w?.sleep ?? null,
        soreness: w?.soreness ?? null,
        stress: w?.stress ?? null,
      };
    });
  }, [periodPlans, periodWellness, periodLoads, mode]);

  const summary = useMemo(() => {
    const rpes = periodWellness
      .map((r) => r.rpe)
      .filter((v): v is number => v != null)
      .map(Number);

    const planned = periodPlans.map((p) => Number(p.planned_rpe || 0));
    const totalCharge = periodLoads.reduce(
      (sum, row) => sum + Number(row.actual_load || 0),
      0,
    );

    return {
      charge: Math.round(totalCharge),
      entries: periodLoads.length,
      avgRpe: avg(rpes),
      avgPlanned: avg(planned),
      delta: planned.length && rpes.length ? avg(rpes) - avg(planned) : null,
    };
  }, [periodLoads, periodWellness, periodPlans]);

  const latest = periodWellness[periodWellness.length - 1] ?? null;
  const warnings: Array<{ level: "alert" | "watch"; label: string; detail: string }> = [];

  if (latest) {
    if (Number(latest.fatigue || 0) >= 9)
      warnings.push({ level: "alert", label: "Fatigue très élevée", detail: `${latest.fatigue}/10` });
    else if (Number(latest.fatigue || 0) >= 7)
      warnings.push({ level: "watch", label: "Fatigue élevée", detail: `${latest.fatigue}/10` });

    if (Number(latest.soreness || 0) >= 8)
      warnings.push({ level: "alert", label: "Douleurs élevées", detail: `${latest.soreness}/10` });
    else if (Number(latest.soreness || 0) >= 5)
      warnings.push({ level: "watch", label: "Douleurs à surveiller", detail: `${latest.soreness}/10` });

    if (latest.sleep != null && Number(latest.sleep) <= 3)
      warnings.push({ level: "alert", label: "Sommeil très faible", detail: `${latest.sleep}/10` });
    else if (latest.sleep != null && Number(latest.sleep) <= 5)
      warnings.push({ level: "watch", label: "Sommeil à surveiller", detail: `${latest.sleep}/10` });
  }

  const global =
    warnings.some((w) => w.level === "alert")
      ? "alert"
      : warnings.some((w) => w.level === "watch")
        ? "watch"
        : "normal";

  const status =
    global === "alert"
      ? { label: "🔴 Alerte de suivi", bg: "#FFF1F0", border: "#D96A62" }
      : global === "watch"
        ? { label: "🟠 Vigilance", bg: "#FFF8EC", border: "#D4A24C" }
        : { label: "🟢 Situation stable", bg: "#F0FAF3", border: "#78AF83" };

  if (loading) {
    return <div style={{ padding: 24, color: MUTED }}>Chargement du suivi…</div>;
  }

  return (
    <section style={{ display: "grid", gap: 12, minWidth: 0 }}>
      {message && <div style={styles.toast}>{message}</div>}

      <div style={styles.analysisHeader}>
        <div>
          <span style={styles.eyebrow}>SUIVI AUTOMATIQUE</span>
          <h2 style={{ margin: "4px 0 0", color: BORDEAUX, fontSize: 20 }}>
            Analyse charge & récupération
          </h2>
          <p style={{ margin: "4px 0 0", color: MUTED, fontSize: 11 }}>
            Comparaison entre le RPE prévu par le staff et le ressenti réel du joueur.
          </p>
        </div>
      </div>

      <div style={styles.periodBar}>
        <div style={{ display: "flex", gap: 6 }}>
          {([
            ["week", "Semaine"],
            ["month", "Mois"],
            ["year", "Année"],
          ] as const).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setMode(key);
                setCursor(new Date());
              }}
              style={{
                ...styles.periodBtn,
                ...(mode === key
                  ? { background: BORDEAUX, color: "#fff", borderColor: BORDEAUX }
                  : {}),
              }}
            >
              {label}
            </button>
          ))}
        </div>

        <div style={styles.periodNav}>
          <button
            type="button"
            onClick={() => setCursor((d) => addPeriod(d, mode, -1))}
            style={styles.arrowBtn}
          >
            ‹
          </button>
          <strong style={{ color: TEXT, fontSize: 12, minWidth: 150, textAlign: "center" }}>
            {fmtPeriod(mode, cursor)}
          </strong>
          <button
            type="button"
            onClick={() => setCursor((d) => addPeriod(d, mode, 1))}
            style={styles.arrowBtn}
          >
            ›
          </button>
        </div>

        <div style={{ textAlign: "right" }}>
          <span style={styles.smallUpper}>CHARGE TOTALE</span>
          <strong style={{ display: "block", color: TEXT, fontSize: 18 }}>
            {summary.charge.toLocaleString("fr-FR")}
          </strong>
          <small style={{ color: MUTED }}>{summary.entries} entrée(s)</small>
        </div>
      </div>

      <div style={styles.metricsGrid}>
        <MetricCard label="Charge période" value={summary.charge} sub="Cumul réel" />
        <MetricCard label="Charges enregistrées" value={summary.entries} sub="Sur la période" />
        <MetricCard
          label="RPE réel moyen"
          value={summary.avgRpe ? summary.avgRpe.toFixed(1) : "—"}
          sub="Ressenti moyen"
        />
        <MetricCard
          label="RPE prévu moyen"
          value={summary.avgPlanned ? summary.avgPlanned.toFixed(1) : "—"}
          sub={
            summary.delta == null
              ? "Pas encore comparé"
              : `Écart ${summary.delta > 0 ? "+" : ""}${summary.delta.toFixed(1)}`
          }
        />
      </div>

      <div style={styles.twoColumns}>
        <div style={styles.card}>
          <span style={styles.eyebrow}>RPE PRÉVU / RÉEL</span>
          <h3 style={styles.cardTitle}>Comparaison sur la période</h3>
          <p style={styles.cardSub}>
            Les points restent visibles même s'il n'y a qu'une seule réponse.
          </p>

          <Chart
            data={chartRows}
            min={0}
            max={10}
            series={[
              { key: "plannedRpe", label: "RPE prévu", stroke: GOLD, dashed: true },
              { key: "actualRpe", label: "RPE réel", stroke: BORDEAUX },
            ]}
          />
        </div>

        <div style={styles.card}>
          <span style={styles.eyebrow}>RPE DE LA PÉRIODE</span>
          <h3 style={styles.cardTitle}>Détail des réponses</h3>
          <p style={styles.cardSub}>
            Remplace la zone « séances de la période » par les RPE.
          </p>

          <div style={{ display: "grid", gap: 6, marginTop: 10 }}>
            {chartRows
              .slice()
              .reverse()
              .map((row) => (
                <div key={row.date} style={styles.rpeRow}>
                  <span style={{ color: MUTED, fontSize: 10 }}>
                    {new Date(`${row.date}T12:00:00`).toLocaleDateString("fr-FR")}
                  </span>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ ...styles.pill, color: "#8B650C" }}>
                      Prévu <b>{row.plannedRpe ?? "—"}</b>
                    </span>
                    <span style={{ ...styles.pill, color: BORDEAUX }}>
                      Réel <b>{row.actualRpe ?? "—"}</b>
                    </span>
                  </div>
                </div>
              ))}

            {!chartRows.length && (
              <div style={styles.empty}>Aucun RPE sur cette période.</div>
            )}
          </div>
        </div>
      </div>

      <div style={styles.twoColumns}>
        <div style={styles.card}>
          <span style={styles.eyebrow}>CHARGE</span>
          <h3 style={styles.cardTitle}>Évolution de la charge quotidienne</h3>
          <p style={styles.cardSub}>Durée × RPE</p>

          <Chart
            data={chartRows}
            series={[{ key: "charge", label: "Charge", stroke: BORDEAUX }]}
          />
        </div>

        <div style={styles.card}>
          <span style={styles.eyebrow}>RÉCUPÉRATION</span>
          <h3 style={styles.cardTitle}>Fatigue · sommeil · douleurs · stress</h3>
          <p style={styles.cardSub}>Échelle 1 à 10</p>

          <Chart
            data={chartRows}
            min={0}
            max={10}
            series={[
              { key: "fatigue", label: "Fatigue", stroke: "#D49423" },
              { key: "sleep", label: "Sommeil", stroke: "#3E7DB6" },
              { key: "soreness", label: "Douleurs", stroke: "#B43A32" },
              { key: "stress", label: "Stress", stroke: "#7B58A7" },
            ]}
          />
        </div>
      </div>

      {warnings.length > 0 && (
        <div style={styles.card}>
          <span style={styles.eyebrow}>ALERTES & VIGILANCE</span>
          <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
            {warnings.map((warning, index) => (
              <div
                key={`${warning.label}-${index}`}
                style={{
                  ...styles.warningRow,
                  background: warning.level === "alert" ? "#FFF2F1" : "#FFF8EC",
                  borderColor: warning.level === "alert" ? "#E2A19C" : "#E4C27E",
                }}
              >
                <strong style={{ color: warning.level === "alert" ? ALERT : WATCH }}>
                  {warning.level === "alert" ? "🔴" : "🟠"} {warning.label}
                </strong>
                <span style={{ color: MUTED }}>{warning.detail}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={styles.card}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
          <div>
            <span style={styles.eyebrow}>HISTORIQUE</span>
            <h3 style={styles.cardTitle}>Dernières réponses joueurs</h3>
          </div>
          <small style={{ color: MUTED }}>Tu peux supprimer un RPE erroné.</small>
        </div>

        <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
          {periodWellness
            .slice()
            .reverse()
            .map((row) => (
              <div key={row.id} style={styles.historyRow}>
                <div>
                  <strong style={{ display: "block", fontSize: 11, color: TEXT }}>
                    {new Date(row.created_at).toLocaleDateString("fr-FR")}
                  </strong>
                  <small style={{ color: MUTED }}>
                    {new Date(row.created_at).toLocaleTimeString("fr-FR", {
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </small>
                </div>

                <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                  {row.rpe != null && <span style={styles.pill}>RPE <b>{row.rpe}</b></span>}
                  {row.duration_minutes != null && (
                    <span style={styles.pill}>Durée <b>{row.duration_minutes}′</b></span>
                  )}
                  <span style={styles.pill}>Fatigue <b>{row.fatigue ?? "—"}</b></span>
                  <span style={styles.pill}>Sommeil <b>{row.sleep ?? "—"}</b></span>
                  <span style={styles.pill}>Douleurs <b>{row.soreness ?? "—"}</b></span>
                  <span style={styles.pill}>Stress <b>{row.stress ?? "—"}</b></span>
                  {row.computed_load != null && Number(row.computed_load) > 0 && (
                    <span style={{ ...styles.pill, background: "#FFF6E5" }}>
                      Charge <b>{Math.round(Number(row.computed_load))}</b>
                    </span>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => deleteResponse(row)}
                  disabled={deleting === row.id}
                  style={styles.deleteBtn}
                  title="Supprimer ce RPE / cette réponse"
                >
                  {deleting === row.id ? "…" : "🗑"}
                </button>
              </div>
            ))}

          {!periodWellness.length && (
            <div style={styles.empty}>Aucune réponse sur cette période.</div>
          )}
        </div>
      </div>

      <div
        style={{
          border: `1px solid ${status.border}`,
          background: status.bg,
          borderRadius: 14,
          padding: "10px 12px",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: 10,
        }}
      >
        <strong style={{ color: TEXT }}>{status.label}</strong>
        <small style={{ color: MUTED }}>
          Indicateurs de suivi uniquement, sans valeur de diagnostic médical.
        </small>
      </div>
    </section>
  );
}

const styles: Record<string, React.CSSProperties> = {
  toast: {
    position: "fixed",
    top: 16,
    left: "50%",
    transform: "translateX(-50%)",
    zIndex: 9999,
    background: "#241B18",
    color: "#fff",
    padding: "10px 17px",
    borderRadius: 999,
    fontWeight: 900,
  },
  analysisHeader: {
    padding: "2px 0 0",
  },
  eyebrow: {
    display: "block",
    fontSize: 9,
    fontWeight: 1000,
    letterSpacing: ".12em",
    color: GOLD,
    textTransform: "uppercase",
  },
  periodBar: {
    border: `1px solid ${BORDER}`,
    background: "#FFF9F2",
    borderRadius: 15,
    padding: "10px 12px",
    display: "grid",
    gridTemplateColumns: "1fr auto 1fr",
    alignItems: "center",
    gap: 10,
  },
  periodBtn: {
    border: `1px solid ${BORDER}`,
    background: "#fff",
    color: BORDEAUX,
    borderRadius: 9,
    padding: "7px 11px",
    fontSize: 10,
    fontWeight: 900,
    cursor: "pointer",
  },
  periodNav: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
  },
  arrowBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    border: `1px solid ${BORDER}`,
    background: "#fff",
    color: BORDEAUX,
    fontWeight: 1000,
    cursor: "pointer",
  },
  smallUpper: {
    display: "block",
    color: MUTED,
    fontSize: 8,
    fontWeight: 900,
    letterSpacing: ".08em",
  },
  metricsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))",
    gap: 8,
  },
  metricCard: {
    border: `1px solid ${BORDER}`,
    borderRadius: 14,
    background: "#fff",
    padding: "11px 12px",
  },
  metricLabel: {
    display: "block",
    color: MUTED,
    fontSize: 9,
    textTransform: "uppercase",
    fontWeight: 900,
    letterSpacing: ".07em",
  },
  metricValue: {
    display: "block",
    color: BORDEAUX,
    marginTop: 4,
    fontSize: 21,
  },
  metricSub: {
    display: "block",
    color: "#968881",
    marginTop: 3,
    fontSize: 9,
  },
  twoColumns: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1.4fr) minmax(270px,.8fr)",
    gap: 10,
  },
  card: {
    border: `1px solid ${BORDER}`,
    borderRadius: 16,
    background: "#fff",
    padding: "13px 14px",
    minWidth: 0,
  },
  cardTitle: {
    margin: "4px 0 0",
    color: TEXT,
    fontSize: 14,
  },
  cardSub: {
    margin: "3px 0 0",
    color: MUTED,
    fontSize: 10,
  },
  legend: {
    display: "flex",
    gap: 14,
    flexWrap: "wrap",
    marginTop: 3,
    color: MUTED,
    fontSize: 10,
  },
  rpeRow: {
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    padding: "8px 9px",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  pill: {
    display: "inline-flex",
    gap: 4,
    alignItems: "center",
    padding: "4px 7px",
    borderRadius: 999,
    background: SOFT,
    color: MUTED,
    fontSize: 9,
    whiteSpace: "nowrap",
  },
  warningRow: {
    border: "1px solid",
    borderRadius: 10,
    padding: "8px 10px",
    display: "flex",
    justifyContent: "space-between",
    gap: 10,
    fontSize: 10,
  },
  historyRow: {
    border: `1px solid ${BORDER}`,
    borderRadius: 10,
    padding: "8px 9px",
    display: "grid",
    gridTemplateColumns: "105px minmax(0,1fr) 34px",
    gap: 8,
    alignItems: "center",
  },
  deleteBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    border: "1px solid #E5C3C0",
    background: "#FFF7F6",
    color: ALERT,
    cursor: "pointer",
  },
  empty: {
    padding: 14,
    textAlign: "center",
    borderRadius: 10,
    background: SOFT,
    color: MUTED,
    fontSize: 10,
  },
};
