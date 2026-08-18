"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type LoadRow = {
  id: string;
  load_date: string;
  duration_minutes: number;
  actual_rpe: number | null;
  actual_load: number;
  planned_load: number;
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
  created_at: string;
};

type WarningLevel = "normal" | "watch" | "alert";
type Warning = { level: WarningLevel; label: string; detail: string };

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

export default function PlayerLoadMonitoring({
  playerId,
  teamId,
}: {
  playerId: string;
  teamId: string;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [loads, setLoads] = useState<LoadRow[]>([]);
  const [wellness, setWellness] = useState<WellnessRow[]>([]);
  const [range, setRange] =
    useState<(typeof RANGE_OPTIONS)[number]["key"]>("28");
  const [loading, setLoading] = useState(true);

  async function reload() {
    setLoading(true);

    const [
      { data: loadData, error: loadError },
      { data: wellnessData, error: wellnessError },
    ] = await Promise.all([
      supabase
        .from("training_load_entries")
        .select(
          "id,load_date,duration_minutes,actual_rpe,actual_load,planned_load,load_type",
        )
        .eq("team_id", teamId)
        .eq("player_id", playerId)
        .order("load_date", { ascending: true })
        .limit(800),

      supabase
        .from("player_wellness_responses")
        .select(
          "id,response_date,response_kind,duration_minutes,rpe,fatigue,soreness,sleep,stress,comment,created_at",
        )
        .eq("team_id", teamId)
        .eq("player_id", playerId)
        .order("created_at", { ascending: true })
        .limit(800),
    ]);

    if (loadError) console.error(loadError);
    if (wellnessError) console.error(wellnessError);

    setLoads((loadData ?? []) as LoadRow[]);
    setWellness((wellnessData ?? []) as WellnessRow[]);
    setLoading(false);
  }

  useEffect(() => {
    void reload();
  }, [playerId, teamId]); // eslint-disable-line react-hooks/exhaustive-deps

  const days =
    RANGE_OPTIONS.find((item) => item.key === range)?.days ?? 28;
  const since = isoDaysAgo(days);

  const chartData = useMemo(() => {
    const byDay = new Map<
      string,
      {
        date: string;
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

    return Array.from(byDay.values())
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((item) => ({ ...item, label: dayLabel(item.date) }));
  }, [loads, wellness, since]);

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
    let previous21 = 0;
    let previousDays = 0;

    for (const [date, value] of daily) {
      if (date >= recent7Start) current7 += value;

      if (date >= previousStart && date <= previousEnd) {
        previous21 += value;
        previousDays += 1;
      }
    }

    const previousWeeklyAverage = previousDays
      ? (previous21 / Math.max(previousDays, 1)) * 7
      : 0;

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

    const avgRpeRows = filteredLoads.filter(
      (row) => row.actual_rpe != null,
    );

    const avgRpe = avgRpeRows.length
      ? avgRpeRows.reduce(
          (sum, row) => sum + Number(row.actual_rpe || 0),
          0,
        ) / avgRpeRows.length
      : 0;

    return { total, sessions: filteredLoads.length, avgRpe };
  }, [loads, since]);

  if (loading) {
    return (
      <section className="monitor card">
        Chargement du suivi…
        <style jsx>{css}</style>
      </section>
    );
  }

  return (
    <section className="monitor">
      <div className={`status ${globalLevel}`}>
        <div>
          <p>CHARGE & RÉCUPÉRATION</p>
          <h2>
            {globalLevel === "alert"
              ? "🔴 Alerte de suivi"
              : globalLevel === "watch"
                ? "🟠 Vigilance"
                : "🟢 Situation stable"}
          </h2>
        </div>
        <span>
          Les alertes signalent des variations ou réponses à surveiller ;
          elles ne constituent pas un diagnostic.
        </span>
      </div>

      <div className="toolbar">
        {RANGE_OPTIONS.map((item) => (
          <button
            key={item.key}
            className={range === item.key ? "active" : ""}
            onClick={() => setRange(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="kpis">
        <Kpi
          label="Charge cumulée"
          value={Math.round(summary.total).toLocaleString("fr-FR")}
        />
        <Kpi label="Séances" value={summary.sessions} />
        <Kpi
          label="RPE moyen"
          value={summary.avgRpe ? summary.avgRpe.toFixed(1) : "—"}
        />
        <Kpi
          label="Charge 7 jours"
          value={Math.round(workloadStats.current7).toLocaleString("fr-FR")}
        />
      </div>

      {warnings.length > 0 && (
        <div className="warnings">
          {warnings.map((warning, index) => (
            <div
              key={`${warning.label}-${index}`}
              className={warning.level}
            >
              <strong>
                {warning.level === "alert" ? "🔴" : "🟠"} {warning.label}
              </strong>
              <span>{warning.detail}</span>
            </div>
          ))}
        </div>
      )}

      <div className="chart card">
        <div className="head">
          <div>
            <p>CHARGE</p>
            <h3>Évolution de la charge quotidienne</h3>
          </div>
          <span>Durée × RPE</span>
        </div>

        <div className="chartBox">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line
                type="monotone"
                dataKey="charge"
                name="Charge"
                strokeWidth={3}
                dot={{ r: 3 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="chart card">
        <div className="head">
          <div>
            <p>RÉCUPÉRATION</p>
            <h3>Fatigue · sommeil · douleurs · stress</h3>
          </div>
          <span>Échelle 1 à 10</span>
        </div>

        <div className="chartBox">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" />
              <YAxis domain={[0, 10]} />
              <Tooltip />
              <Legend />
              <ReferenceLine y={7} strokeDasharray="4 4" />
              <Line
                type="monotone"
                dataKey="fatigue"
                name="Fatigue"
                strokeWidth={2}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="sleep"
                name="Sommeil"
                strokeWidth={2}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="soreness"
                name="Douleurs"
                strokeWidth={2}
                connectNulls
              />
              <Line
                type="monotone"
                dataKey="stress"
                name="Stress"
                strokeWidth={2}
                connectNulls
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="card history">
        <div className="head">
          <div>
            <p>HISTORIQUE</p>
            <h3>Dernières réponses joueurs</h3>
          </div>
        </div>

        {wellness
          .slice()
          .reverse()
          .slice(0, 20)
          .map((row) => (
            <div className="historyRow" key={row.id}>
              <div>
                <strong>
                  {new Date(row.created_at).toLocaleString("fr-FR")}
                </strong>
                <span>
                  {row.response_kind === "post_session"
                    ? "Après séance"
                    : "Wellness"}
                </span>
              </div>

              <div className="metrics">
                <span>RPE <b>{row.rpe ?? "—"}</b></span>
                <span>Fatigue <b>{row.fatigue ?? "—"}</b></span>
                <span>Sommeil <b>{row.sleep ?? "—"}</b></span>
                <span>Douleurs <b>{row.soreness ?? "—"}</b></span>
              </div>

              {row.comment && <p>{row.comment}</p>}
            </div>
          ))}

        {!wellness.length && (
          <div className="empty">
            Aucune réponse joueur pour le moment.
          </div>
        )}
      </div>

      <style jsx>{css}</style>
    </section>
  );
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

const css = `
.monitor{display:grid;gap:12px}
.card{background:#fff;border:1px solid #eadfd8;border-radius:16px;padding:15px}
.status{display:flex;justify-content:space-between;gap:16px;align-items:center;border:1px solid;border-radius:16px;padding:15px}
.status p,.head p{margin:0;color:#d4a24c;font-weight:1000;letter-spacing:.11em;font-size:.68rem}
.status h2,.head h3{margin:4px 0}.status>span{max-width:520px;font-size:.75rem;color:#746761}
.status.normal{border-color:#69a877;background:#f3fff5}.status.watch{border-color:#d49a35;background:#fff8ec}.status.alert{border-color:#ce4e45;background:#fff1f0}
.toolbar{display:flex;gap:6px;flex-wrap:wrap}.toolbar button{border:1px solid #ddd1ca;background:#fff;border-radius:999px;padding:8px 11px;color:#6b1a2c;font-weight:900}
.toolbar .active{background:#6b1a2c;color:#fff}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}.kpi{background:#fff;border:1px solid #eadfd8;border-radius:14px;padding:12px}
.kpi span{display:block;color:#84766e;font-size:.7rem}.kpi strong{display:block;color:#6b1a2c;font-size:1.45rem;margin-top:4px}
.warnings{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.warnings>div{display:grid;gap:3px;border-radius:12px;padding:11px;border:1px solid}
.warnings .watch{background:#fff8ec;border-color:#e0ae56}.warnings .alert{background:#fff1f0;border-color:#d3645d}.warnings span{font-size:.74rem;color:#746761}
.head{display:flex;justify-content:space-between;align-items:flex-start}.head>span{color:#897a72;font-size:.72rem}
.chartBox{height:270px;margin-top:10px}
.history{display:grid;gap:6px}.historyRow{display:grid;grid-template-columns:180px 1fr;gap:10px;border-top:1px solid #eee4df;padding:9px 0}
.historyRow>div:first-child strong,.historyRow>div:first-child span{display:block}.historyRow>div:first-child span{font-size:.7rem;color:#8a7b73}
.metrics{display:flex;gap:6px;flex-wrap:wrap}.metrics span{background:#f7f3ef;border-radius:999px;padding:5px 8px;font-size:.7rem}
.historyRow p{grid-column:1/-1;margin:0;color:#786a63;font-size:.76rem}.empty{padding:12px;color:#8b7d75}
@media(max-width:850px){.kpis{grid-template-columns:1fr 1fr}.warnings{grid-template-columns:1fr}.status{align-items:flex-start;flex-direction:column}.historyRow{grid-template-columns:1fr}}
@media(max-width:520px){.kpis{grid-template-columns:1fr 1fr}.chartBox{height:230px}}
`;
