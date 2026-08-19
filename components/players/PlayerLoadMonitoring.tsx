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

type TeamPlan = { id: string; plan_date: string; duration_minutes: number; planned_rpe: number; load_type: string; };

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

type WarningLevel = "normal" | "watch" | "alert";
type Warning = { level: WarningLevel; label: string; detail: string };

const BORDEAUX = "#6B1A2C";
const GOLD = "#D4A24C";
const TEXT = "#201A18";
const MUTED = "#786C66";
const BORDER = "#E8DDD7";
const SOFT = "#F8F4F1";

const RANGE_OPTIONS = [
  { key: "7", label: "7 jours", days: 7 },
  { key: "28", label: "28 jours", days: 28 },
  { key: "90", label: "3 mois", days: 90 },
  { key: "365", label: "Saison", days: 365 },
] as const;

function isoDaysAgo(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

function dayLabel(value: string) {
  return new Date(`${value}T12:00:00`).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
  });
}

function avg(values: number[]) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : 0;
}

function MiniLineChart({
  data,
  series,
  min = 0,
  max,
  height = 240,
}: {
  data: Array<Record<string, string | number | null>>;
  series: Array<{ key: string; label: string; stroke: string }>;
  min?: number;
  max?: number;
  height?: number;
}) {
  const width = 900;
  const left = 48;
  const right = 20;
  const top = 16;
  const bottom = 34;
  const innerW = width - left - right;
  const innerH = height - top - bottom;

  const allValues = data.flatMap((d) =>
    series
      .map((s) => d[s.key])
      .filter((v): v is number => typeof v === "number" && Number.isFinite(v)),
  );

  const dataMax = allValues.length ? Math.max(...allValues) : 10;
  const yMax = max ?? Math.max(10, Math.ceil(dataMax * 1.15));
  const yMin = min;
  const span = Math.max(1, yMax - yMin);

  const x = (i: number) =>
    left + (data.length <= 1 ? innerW / 2 : (i / (data.length - 1)) * innerW);
  const y = (v: number) => top + innerH - ((v - yMin) / span) * innerH;

  const gridValues = [0, 0.25, 0.5, 0.75, 1].map(
    (r) => yMin + (yMax - yMin) * r,
  );

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label="Graphique de suivi"
        style={{ display: "block", minWidth: 560 }}
      >
        {gridValues.map((v) => (
          <g key={v}>
            <line
              x1={left}
              y1={y(v)}
              x2={width - right}
              y2={y(v)}
              stroke="#ECE5E0"
              strokeWidth="1"
            />
            <text
              x={left - 8}
              y={y(v) + 4}
              textAnchor="end"
              fontSize="11"
              fill="#8A7D77"
            >
              {Math.round(v)}
            </text>
          </g>
        ))}

        {series.map((s) => {
          const points = data
            .map((d, i) => {
              const value = d[s.key];
              return typeof value === "number"
                ? `${x(i)},${y(value)}`
                : null;
            })
            .filter(Boolean)
            .join(" ");

          return points ? (
            <polyline
              key={s.key}
              points={points}
              fill="none"
              stroke={s.stroke}
              strokeWidth="3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          ) : null;
        })}

        {data.map((d, i) => {
          const label = String(d.label || "");
          const show =
            data.length <= 12 || i === 0 || i === data.length - 1 || i % 3 === 0;
          return show ? (
            <text
              key={`${label}-${i}`}
              x={x(i)}
              y={height - 9}
              textAnchor="middle"
              fontSize="10"
              fill="#8A7D77"
            >
              {label}
            </text>
          ) : null;
        })}
      </svg>

      <div
        style={{
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
          marginTop: 4,
          fontSize: 12,
          color: MUTED,
        }}
      >
        {series.map((s) => (
          <span key={s.key} style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
            <i
              style={{
                width: 18,
                height: 3,
                borderRadius: 999,
                background: s.stroke,
                display: "inline-block",
              }}
            />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}

function Kpi({
  label,
  value,
  help,
}: {
  label: string;
  value: string | number;
  help?: string;
}) {
  return (
    <div
      style={{
        border: `1px solid ${BORDER}`,
        background: "#fff",
        borderRadius: 14,
        padding: "12px 14px",
        minWidth: 0,
      }}
    >
      <span
        style={{
          display: "block",
          fontSize: 10,
          textTransform: "uppercase",
          fontWeight: 900,
          letterSpacing: ".08em",
          color: MUTED,
        }}
      >
        {label}
      </span>
      <strong
        style={{
          display: "block",
          marginTop: 4,
          fontSize: 24,
          lineHeight: 1.05,
          color: BORDEAUX,
        }}
      >
        {value}
      </strong>
      {help && (
        <small style={{ display: "block", marginTop: 4, color: "#9B8E87", fontSize: 10 }}>
          {help}
        </small>
      )}
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
  const [range, setRange] =
    useState<(typeof RANGE_OPTIONS)[number]["key"]>("28");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const toast = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2200);
  };

  async function reload() {
    setLoading(true);

    const [
      { data: loadData, error: loadError },
      { data: wellnessData, error: wellnessError },
      { data: planData, error: planError },
    ] = await Promise.all([
      supabase
        .from("training_load_entries")
        .select(
          "id,load_date,duration_minutes,actual_rpe,actual_load,planned_load,load_type,wellness_response_id",
        )
        .eq("team_id", teamId)
        .eq("player_id", playerId)
        .order("load_date", { ascending: true })
        .limit(1000),

      supabase
        .from("player_wellness_responses")
        .select(
          "id,response_date,response_kind,duration_minutes,rpe,fatigue,soreness,sleep,stress,comment,computed_load,created_at",
        )
        .eq("team_id", teamId)
        .eq("player_id", playerId)
        .order("created_at", { ascending: true })
        .limit(1000),

      supabase
        .from("team_load_plans")
        .select("id,plan_date,duration_minutes,planned_rpe,load_type")
        .eq("team_id", teamId)
        .order("plan_date", { ascending: true })
        .limit(1000),
    ]);

    if (loadError) console.error(loadError);
    if (wellnessError) console.error(wellnessError);
    if (planError) console.error(planError);

    setLoads((loadData ?? []) as LoadRow[]);
    setWellness((wellnessData ?? []) as WellnessRow[]);
    setPlans((planData ?? []) as TeamPlan[]);
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, [playerId, teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  async function deleteResponse(row: WellnessRow) {
    const wording =
      row.response_kind === "post_session" && row.rpe != null
        ? `Supprimer ce RPE (${row.rpe}/10) et la charge associée ?`
        : "Supprimer cette réponse de récupération ?";

    if (!window.confirm(wording)) return;

    setDeleting(row.id);

    const { data, error } = await supabase.rpc(
      "delete_player_wellness_response",
      { p_response_id: row.id },
    );

    setDeleting(null);

    if (error) {
      alert(error.message);
      return;
    }

    const result = (data || {}) as { ok?: boolean; message?: string };
    if (result.ok === false) {
      alert(result.message || "Suppression impossible.");
      return;
    }

    toast("RPE / réponse supprimé(e) ✓");
    await reload();
  }

  const days =
    RANGE_OPTIONS.find((item) => item.key === range)?.days ?? 28;
  const since = isoDaysAgo(days);

  const chartData = useMemo(() => {
    const byDay = new Map<
      string,
      {
        date: string;
        label: string;
        charge: number;
        rpe: number | null;
        fatigue: number | null;
        soreness: number | null;
        sleep: number | null;
        stress: number | null;
      }
    >();

    for (const row of loads) {
      if (row.load_date < since) continue;

      const current = byDay.get(row.load_date) ?? {
        date: row.load_date,
        label: dayLabel(row.load_date),
        charge: 0,
        rpe: null,
        fatigue: null,
        soreness: null,
        sleep: null,
        stress: null,
      };

      current.charge += Number(row.actual_load || 0);
      if (row.actual_rpe != null) current.rpe = Number(row.actual_rpe);
      byDay.set(row.load_date, current);
    }

    for (const row of wellness) {
      if (row.response_date < since) continue;

      const current = byDay.get(row.response_date) ?? {
        date: row.response_date,
        label: dayLabel(row.response_date),
        charge: 0,
        rpe: null,
        fatigue: null,
        soreness: null,
        sleep: null,
        stress: null,
      };

      if (row.rpe != null) current.rpe = Number(row.rpe);
      if (row.fatigue != null) current.fatigue = Number(row.fatigue);
      if (row.soreness != null) current.soreness = Number(row.soreness);
      if (row.sleep != null) current.sleep = Number(row.sleep);
      if (row.stress != null) current.stress = Number(row.stress);
      byDay.set(row.response_date, current);
    }

    return Array.from(byDay.values()).sort((a, b) =>
      a.date.localeCompare(b.date),
    );
  }, [loads, wellness, since]);


  const rpeComparisonData = useMemo(() => {
    const planMap = new Map(plans.map((p) => [p.plan_date, p]));
    const responseByDay = new Map<string, WellnessRow>();

    for (const row of wellness) {
      if (row.response_date >= since && row.rpe != null) {
        responseByDay.set(row.response_date, row);
      }
    }

    const allDates = Array.from(
      new Set([
        ...plans.filter((p) => p.plan_date >= since).map((p) => p.plan_date),
        ...wellness.filter((w) => w.response_date >= since && w.rpe != null).map((w) => w.response_date),
      ]),
    ).sort();

    return allDates.map((date) => ({
      label: dayLabel(date),
      planned: planMap.get(date)?.planned_rpe ?? null,
      actual: responseByDay.get(date)?.rpe ?? null,
    }));
  }, [plans, wellness, since]);

  const plannedSummary = useMemo(() => {
    const filtered = plans.filter((p) => p.plan_date >= since);
    const actuals = wellness.filter((w) => w.response_date >= since && w.rpe != null);
    const avgPlanned = filtered.length
      ? filtered.reduce((sum, p) => sum + Number(p.planned_rpe || 0), 0) / filtered.length
      : 0;
    const avgActual = actuals.length
      ? actuals.reduce((sum, w) => sum + Number(w.rpe || 0), 0) / actuals.length
      : 0;

    return {
      avgPlanned,
      avgActual,
      delta: avgPlanned && avgActual ? avgActual - avgPlanned : null,
    };
  }, [plans, wellness, since]);

  const latest = wellness[wellness.length - 1] ?? null;

  const workloadStats = useMemo(() => {
    const daily = new Map<string, number>();

    for (const row of loads) {
      daily.set(
        row.load_date,
        (daily.get(row.load_date) || 0) + Number(row.actual_load || 0),
      );
    }

    const recent7Start = isoDaysAgo(6);
    const previousStart = isoDaysAgo(27);
    const previousEnd = isoDaysAgo(7);

    let current7 = 0;
    const previousDaily: number[] = [];

    for (const [date, value] of daily) {
      if (date >= recent7Start) current7 += value;
      if (date >= previousStart && date <= previousEnd) previousDaily.push(value);
    }

    const previousWeeklyAverage = avg(previousDaily) * 7;
    const ratio =
      previousWeeklyAverage > 0 ? current7 / previousWeeklyAverage : null;

    return { current7, previousWeeklyAverage, ratio };
  }, [loads]);

  const warnings = useMemo<Warning[]>(() => {
    const out: Warning[] = [];

    if (latest) {
      if (Number(latest.soreness || 0) >= 8)
        out.push({
          level: "alert",
          label: "Douleurs élevées",
          detail: `${latest.soreness}/10 sur la dernière réponse.`,
        });
      else if (Number(latest.soreness || 0) >= 5)
        out.push({
          level: "watch",
          label: "Douleurs à surveiller",
          detail: `${latest.soreness}/10.`,
        });

      if (Number(latest.fatigue || 0) >= 9)
        out.push({
          level: "alert",
          label: "Fatigue très élevée",
          detail: `${latest.fatigue}/10.`,
        });
      else if (Number(latest.fatigue || 0) >= 7)
        out.push({
          level: "watch",
          label: "Fatigue élevée",
          detail: `${latest.fatigue}/10.`,
        });

      if (latest.sleep != null && Number(latest.sleep) <= 3)
        out.push({
          level: "alert",
          label: "Sommeil très faible",
          detail: `${latest.sleep}/10.`,
        });
      else if (latest.sleep != null && Number(latest.sleep) <= 5)
        out.push({
          level: "watch",
          label: "Sommeil à surveiller",
          detail: `${latest.sleep}/10.`,
        });

      if (Number(latest.stress || 0) >= 9)
        out.push({
          level: "alert",
          label: "Stress très élevé",
          detail: `${latest.stress}/10.`,
        });
      else if (Number(latest.stress || 0) >= 7)
        out.push({
          level: "watch",
          label: "Stress élevé",
          detail: `${latest.stress}/10.`,
        });

      if (Number(latest.rpe || 0) >= 9)
        out.push({
          level: "watch",
          label: "RPE très élevé",
          detail: `${latest.rpe}/10 sur la dernière séance.`,
        });
    }

    if (
      workloadStats.ratio != null &&
      workloadStats.previousWeeklyAverage >= 200
    ) {
      if (workloadStats.ratio >= 1.8)
        out.push({
          level: "alert",
          label: "Hausse de charge importante",
          detail: `Charge 7 jours ≈ ${Math.round(
            workloadStats.ratio * 100,
          )} % de la référence récente.`,
        });
      else if (workloadStats.ratio >= 1.4)
        out.push({
          level: "watch",
          label: "Hausse de charge",
          detail: `Charge 7 jours ≈ ${Math.round(
            workloadStats.ratio * 100,
          )} % de la référence récente.`,
        });
    }

    return out;
  }, [latest, workloadStats]);

  const globalLevel: WarningLevel = warnings.some(
    (warning) => warning.level === "alert",
  )
    ? "alert"
    : warnings.some((warning) => warning.level === "watch")
      ? "watch"
      : "normal";

  const summary = useMemo(() => {
    const filteredLoads = loads.filter((row) => row.load_date >= since);
    const total = filteredLoads.reduce(
      (sum, row) => sum + Number(row.actual_load || 0),
      0,
    );
    const rpes = filteredLoads
      .map((row) => row.actual_rpe)
      .filter((v): v is number => v != null)
      .map(Number);

    return {
      total,
      sessions: filteredLoads.length,
      avgRpe: avg(rpes),
    };
  }, [loads, since]);

  const statusStyle =
    globalLevel === "alert"
      ? { bg: "#FFF1F0", border: "#D85B52", title: "🔴 Alerte de suivi" }
      : globalLevel === "watch"
        ? { bg: "#FFF7EA", border: "#D7A14A", title: "🟠 Vigilance" }
        : { bg: "#EFFAF2", border: "#6EAF7C", title: "🟢 Situation stable" };

  if (loading) {
    return (
      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          padding: 24,
          background: "#fff",
          color: MUTED,
        }}
      >
        Chargement du suivi…
      </div>
    );
  }

  return (
    <section style={{ display: "grid", gap: 12, width: "100%", minWidth: 0 }}>
      {message && (
        <div
          style={{
            position: "fixed",
            top: 18,
            left: "50%",
            transform: "translateX(-50%)",
            zIndex: 9999,
            background: "#241B18",
            color: "#fff",
            borderRadius: 999,
            padding: "10px 18px",
            fontWeight: 900,
            boxShadow: "0 10px 30px rgba(0,0,0,.18)",
          }}
        >
          {message}
        </div>
      )}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 18,
          alignItems: "center",
          border: `1px solid ${statusStyle.border}`,
          background: statusStyle.bg,
          borderRadius: 16,
          padding: "14px 16px",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 10,
              fontWeight: 1000,
              letterSpacing: ".12em",
              color: GOLD,
            }}
          >
            CHARGE & RÉCUPÉRATION
          </div>
          <h2
            style={{
              margin: "4px 0 0",
              fontSize: 19,
              color: TEXT,
              lineHeight: 1.15,
            }}
          >
            {statusStyle.title}
          </h2>
        </div>
        <div
          style={{
            maxWidth: 470,
            textAlign: "right",
            color: MUTED,
            fontSize: 11,
            lineHeight: 1.4,
          }}
        >
          Les alertes signalent des variations à surveiller. Elles ne
          constituent pas un diagnostic médical.
        </div>
      </div>

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {RANGE_OPTIONS.map((item) => (
          <button
            type="button"
            key={item.key}
            onClick={() => setRange(item.key)}
            style={{
              border: `1px solid ${range === item.key ? BORDEAUX : BORDER}`,
              background: range === item.key ? BORDEAUX : "#fff",
              color: range === item.key ? "#fff" : BORDEAUX,
              borderRadius: 999,
              padding: "7px 11px",
              fontSize: 11,
              fontWeight: 900,
              cursor: "pointer",
            }}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(135px,1fr))",
          gap: 8,
        }}
      >
        <Kpi
          label="Charge cumulée"
          value={Math.round(summary.total).toLocaleString("fr-FR")}
          help="Sur la période"
        />
        <Kpi label="Séances" value={summary.sessions} help="Charges enregistrées" />
        <Kpi
          label="RPE moyen"
          value={summary.avgRpe ? summary.avgRpe.toFixed(1) : "—"}
          help="Ressenti moyen"
        />
        <Kpi
          label="Charge 7 jours"
          value={Math.round(workloadStats.current7).toLocaleString("fr-FR")}
          help="Cumul glissant"
        />
      </div>

      {warnings.length > 0 && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))",
            gap: 7,
          }}
        >
          {warnings.map((warning, index) => (
            <div
              key={`${warning.label}-${index}`}
              style={{
                border: `1px solid ${
                  warning.level === "alert" ? "#D8645B" : "#E1B25F"
                }`,
                background:
                  warning.level === "alert" ? "#FFF3F2" : "#FFF9EE",
                borderRadius: 12,
                padding: "10px 12px",
              }}
            >
              <strong
                style={{
                  display: "block",
                  color: warning.level === "alert" ? "#A92D25" : "#8B5B0D",
                  fontSize: 12,
                }}
              >
                {warning.level === "alert" ? "🔴" : "🟠"} {warning.label}
              </strong>
              <span style={{ display: "block", marginTop: 3, color: MUTED, fontSize: 11 }}>
                {warning.detail}
              </span>
            </div>
          ))}
        </div>
      )}

      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          background: "#fff",
          padding: "14px 14px 12px",
          minWidth: 0,
        }}
      >
        <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"end",marginBottom:6}}>
          <div>
            <span style={{display:"block",color:GOLD,fontWeight:1000,fontSize:9,letterSpacing:".12em"}}>
              RPE PRÉVU / RÉEL
            </span>
            <strong style={{display:"block",color:TEXT,marginTop:3}}>
              Comparaison du ressenti avec l'objectif du staff
            </strong>
          </div>
          <div style={{textAlign:"right",fontSize:10,color:MUTED}}>
            Prévu moy. <b>{plannedSummary.avgPlanned ? plannedSummary.avgPlanned.toFixed(1) : "—"}</b>
            {" · "}
            Réel moy. <b>{plannedSummary.avgActual ? plannedSummary.avgActual.toFixed(1) : "—"}</b>
            {plannedSummary.delta != null && (
              <> · Écart <b style={{color:Math.abs(plannedSummary.delta)>=2?"#B42318":BORDEAUX}}>{plannedSummary.delta>0?"+":""}{plannedSummary.delta.toFixed(1)}</b></>
            )}
          </div>
        </div>

        <MiniLineChart
          data={rpeComparisonData}
          min={0}
          max={10}
          series={[
            { key: "planned", label: "RPE prévu", stroke: GOLD },
            { key: "actual", label: "RPE réel", stroke: BORDEAUX },
          ]}
        />
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit,minmax(360px,1fr))",
          gap: 10,
        }}
      >
        <div
          style={{
            border: `1px solid ${BORDER}`,
            borderRadius: 16,
            background: "#fff",
            padding: "14px 14px 12px",
            minWidth: 0,
          }}
        >
          <div style={{ marginBottom: 6 }}>
            <span
              style={{
                display: "block",
                color: GOLD,
                fontWeight: 1000,
                fontSize: 9,
                letterSpacing: ".12em",
              }}
            >
              CHARGE
            </span>
            <strong style={{ display: "block", color: TEXT, marginTop: 3 }}>
              Évolution de la charge quotidienne
            </strong>
            <small style={{ color: MUTED }}>Durée × RPE</small>
          </div>
          <MiniLineChart
            data={chartData}
            series={[{ key: "charge", label: "Charge", stroke: BORDEAUX }]}
          />
        </div>

        <div
          style={{
            border: `1px solid ${BORDER}`,
            borderRadius: 16,
            background: "#fff",
            padding: "14px 14px 12px",
            minWidth: 0,
          }}
        >
          <div style={{ marginBottom: 6 }}>
            <span
              style={{
                display: "block",
                color: GOLD,
                fontWeight: 1000,
                fontSize: 9,
                letterSpacing: ".12em",
              }}
            >
              RÉCUPÉRATION
            </span>
            <strong style={{ display: "block", color: TEXT, marginTop: 3 }}>
              Fatigue · sommeil · douleurs · stress
            </strong>
            <small style={{ color: MUTED }}>Échelle 1 à 10</small>
          </div>
          <MiniLineChart
            data={chartData}
            min={0}
            max={10}
            series={[
              { key: "fatigue", label: "Fatigue", stroke: "#C9821C" },
              { key: "sleep", label: "Sommeil", stroke: "#4B7EBB" },
              { key: "soreness", label: "Douleurs", stroke: "#B7433B" },
              { key: "stress", label: "Stress", stroke: "#7B5AA6" },
            ]}
          />
        </div>
      </div>

      <div
        style={{
          border: `1px solid ${BORDER}`,
          borderRadius: 16,
          background: "#fff",
          padding: "14px",
          minWidth: 0,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "end",
            gap: 10,
            marginBottom: 8,
          }}
        >
          <div>
            <span
              style={{
                display: "block",
                color: GOLD,
                fontWeight: 1000,
                fontSize: 9,
                letterSpacing: ".12em",
              }}
            >
              HISTORIQUE
            </span>
            <strong style={{ display: "block", color: TEXT, marginTop: 3 }}>
              Dernières réponses joueurs
            </strong>
          </div>
          <small style={{ color: MUTED }}>Tu peux supprimer un RPE erroné.</small>
        </div>

        <div style={{ display: "grid", gap: 6 }}>
          {wellness
            .slice()
            .reverse()
            .slice(0, 30)
            .map((row) => {
              const alert =
                Number(row.soreness || 0) >= 8 ||
                Number(row.fatigue || 0) >= 9 ||
                (row.sleep != null && Number(row.sleep) <= 3);

              return (
                <div
                  key={row.id}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "150px minmax(0,1fr) auto",
                    gap: 10,
                    alignItems: "center",
                    border: `1px solid ${alert ? "#F0C0BC" : BORDER}`,
                    background: alert ? "#FFF7F6" : "#fff",
                    borderRadius: 11,
                    padding: "9px 10px",
                  }}
                >
                  <div>
                    <strong style={{ display: "block", color: TEXT, fontSize: 11 }}>
                      {new Date(row.created_at).toLocaleDateString("fr-FR")}
                    </strong>
                    <span style={{ display: "block", color: MUTED, fontSize: 10 }}>
                      {new Date(row.created_at).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}{" "}
                      ·{" "}
                      {row.response_kind === "post_session"
                        ? "Après séance"
                        : "Wellness"}
                    </span>
                  </div>

                  <div
                    style={{
                      display: "flex",
                      gap: 5,
                      flexWrap: "wrap",
                      minWidth: 0,
                    }}
                  >
                    {row.rpe != null && (
                      <span style={metricPill}>
                        RPE <b>{row.rpe}</b>
                      </span>
                    )}
                    {row.duration_minutes != null && (
                      <span style={metricPill}>
                        Durée <b>{row.duration_minutes}′</b>
                      </span>
                    )}
                    <span style={metricPill}>
                      Fatigue <b>{row.fatigue ?? "—"}</b>
                    </span>
                    <span style={metricPill}>
                      Sommeil <b>{row.sleep ?? "—"}</b>
                    </span>
                    <span style={metricPill}>
                      Douleurs <b>{row.soreness ?? "—"}</b>
                    </span>
                    <span style={metricPill}>
                      Stress <b>{row.stress ?? "—"}</b>
                    </span>
                    {row.computed_load != null && Number(row.computed_load) > 0 && (
                      <span style={{ ...metricPill, background: "#FFF7E8", color: "#7B561D" }}>
                        Charge <b>{Math.round(Number(row.computed_load))}</b>
                      </span>
                    )}
                    {row.comment && (
                      <span
                        style={{
                          flexBasis: "100%",
                          color: MUTED,
                          fontSize: 10,
                          marginTop: 2,
                        }}
                      >
                        💬 {row.comment}
                      </span>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => deleteResponse(row)}
                    disabled={deleting === row.id}
                    title="Supprimer ce RPE / cette réponse"
                    style={{
                      width: 34,
                      height: 34,
                      borderRadius: 10,
                      border: "1px solid #E7C3C0",
                      background: "#FFF7F6",
                      color: "#A92D25",
                      cursor: "pointer",
                      fontWeight: 900,
                    }}
                  >
                    {deleting === row.id ? "…" : "🗑"}
                  </button>
                </div>
              );
            })}

          {!wellness.length && (
            <div
              style={{
                padding: 18,
                background: SOFT,
                color: MUTED,
                textAlign: "center",
                borderRadius: 12,
                fontSize: 11,
              }}
            >
              Aucune réponse joueur pour le moment.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

const metricPill: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 4,
  padding: "5px 7px",
  borderRadius: 999,
  background: SOFT,
  color: MUTED,
  fontSize: 10,
  whiteSpace: "nowrap",
};
