"use client";

import { useEffect, useMemo, useState } from "react";
import type { Player } from "@/types/player";

type TeamPlan = {
  id: string;
  plan_date: string;
  duration_minutes: number;
  planned_rpe: number;
  load_type: string;
  note: string | null;
};

type Wellness = {
  id: string;
  player_id: string;
  response_date: string;
  rpe: number | null;
  duration_minutes: number | null;
  fatigue: number | null;
  soreness: number | null;
  sleep: number | null;
  stress: number | null;
  comment: string | null;
  created_at: string;
};

const BORDEAUX = "#6B1A2C";
const GOLD = "#D4A24C";
const BORDER = "#E8DDD7";
const TEXT = "#211B18";
const MUTED = "#796D67";
const DAYS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

function startOfWeek(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  d.setHours(12, 0, 0, 0);
  return d;
}

function iso(d: Date) {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, count: number) {
  const next = new Date(d);
  next.setDate(next.getDate() + count);
  return next;
}

function fmt(d: Date) {
  return d.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" });
}

function loadValue(duration: number | null | undefined, rpe: number | null | undefined) {
  return Math.round(Number(duration || 0) * Number(rpe || 0));
}

function levelFromDelta(delta: number | null) {
  if (delta == null) return "none";
  const a = Math.abs(delta);
  if (a >= 3) return "alert";
  if (a >= 2) return "watch";
  return "normal";
}

function LineChart({
  data,
}: {
  data: Array<{ label: string; planned: number | null; actual: number | null }>;
}) {
  const width = 760;
  const height = 250;
  const l = 42;
  const r = 18;
  const t = 18;
  const b = 34;
  const iw = width - l - r;
  const ih = height - t - b;
  const x = (i: number) => l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
  const y = (v: number) => t + ih - (v / 10) * ih;

  const points = (key: "planned" | "actual") =>
    data
      .map((d, i) => (d[key] == null ? null : `${x(i)},${y(Number(d[key]))}`))
      .filter(Boolean)
      .join(" ");

  return (
    <div style={{ width: "100%", overflowX: "auto" }}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height} style={{ minWidth: 560, display: "block" }}>
        {[0,2,4,6,8,10].map((v) => (
          <g key={v}>
            <line x1={l} y1={y(v)} x2={width-r} y2={y(v)} stroke="#ECE4DF" strokeWidth="1" />
            <text x={l-8} y={y(v)+4} textAnchor="end" fontSize="10" fill="#8B7D75">{v}</text>
          </g>
        ))}
        <polyline points={points("planned")} fill="none" stroke={GOLD} strokeWidth="3" strokeDasharray="7 5" strokeLinecap="round" strokeLinejoin="round" />
        <polyline points={points("actual")} fill="none" stroke={BORDEAUX} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        {data.map((d, i) => (
          <g key={d.label}>
            <text x={x(i)} y={height-9} textAnchor="middle" fontSize="10" fill="#8B7D75">{d.label}</text>
            {d.planned != null && <circle cx={x(i)} cy={y(d.planned)} r="4" fill={GOLD} />}
            {d.actual != null && <circle cx={x(i)} cy={y(d.actual)} r="4" fill={BORDEAUX} />}
          </g>
        ))}
      </svg>
      <div style={{ display: "flex", gap: 16, flexWrap: "wrap", fontSize: 11, color: MUTED }}>
        <span><i style={{display:"inline-block",width:20,height:3,background:GOLD,marginRight:6,verticalAlign:"middle"}} />RPE prévu</span>
        <span><i style={{display:"inline-block",width:20,height:3,background:BORDEAUX,marginRight:6,verticalAlign:"middle"}} />RPE réel moyen</span>
      </div>
    </div>
  );
}

export default function TeamWeeklyRpeComparison({
  teamId,
  players,
  canEdit,
}: {
  teamId: string;
  players: Player[];
  canEdit: boolean;
}) {
  const [weekStart, setWeekStart] = useState(startOfWeek());
  const [plans, setPlans] = useState<TeamPlan[]>([]);
  const [responses, setResponses] = useState<Wellness[]>([]);
  const [message, setMessage] = useState("");

  const dates = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const weekEnd = dates[6];

  const toast = (text: string) => {
    setMessage(text);
    window.setTimeout(() => setMessage(""), 2200);
  };

  async function reload() {
    const from = iso(weekStart);
    const to = iso(weekEnd);
    const response = await fetch(
      `/api/rpe/team?teamId=${encodeURIComponent(teamId)}&from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { cache: "no-store" },
    );
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      console.error(payload?.error || "Comparaison RPE indisponible.");
      return;
    }
    setPlans((payload.plans ?? []) as TeamPlan[]);
    setResponses((payload.responses ?? []) as Wellness[]);
  }
  useEffect(() => {
    void reload();
  }, [teamId, weekStart]); // eslint-disable-line react-hooks/exhaustive-deps

  async function savePlan(date: string, patch: Partial<TeamPlan>) {
    if (!canEdit) return;

    const current = plans.find((p) => p.plan_date === date);
    const duration = Number(patch.duration_minutes ?? current?.duration_minutes ?? 90);
    const rpe = Number(patch.planned_rpe ?? current?.planned_rpe ?? 6);
    const loadType = String(patch.load_type ?? current?.load_type ?? "basket");

    const response = await fetch("/api/rpe/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "save_plan",
        teamId,
        planDate: date,
        durationMinutes: duration,
        plannedRpe: rpe,
        loadType,
        note: current?.note ?? null,
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return alert(payload.error || "RPE théorique impossible à enregistrer.");

    await reload();
    toast("RPE théorique mis à jour ✓");
  }

  async function clearPlan(date: string) {
    if (!canEdit || !window.confirm("Supprimer le RPE théorique de cette journée ?")) return;
    const response = await fetch("/api/rpe/team", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear_plan", teamId, planDate: date }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return alert(payload.error || "Suppression impossible.");
    await reload();
  }

  const responseMap = useMemo(() => {
    const map = new Map<string, Wellness>();
    for (const row of responses) {
      const key = `${row.player_id}|${row.response_date}`;
      map.set(key, row); // last response of the day wins
    }
    return map;
  }, [responses]);

  const planMap = useMemo(() => new Map(plans.map((p) => [p.plan_date, p])), [plans]);

  const teamChart = useMemo(() => {
    return dates.map((date, index) => {
      const dateIso = iso(date);
      const plan = planMap.get(dateIso);
      const actuals = players
        .map((p) => responseMap.get(`${String(p.id)}|${dateIso}`)?.rpe)
        .filter((v): v is number => v != null)
        .map(Number);

      return {
        label: `${DAYS[index]} ${fmt(date)}`,
        planned: plan?.planned_rpe ?? null,
        actual: actuals.length ? Number((actuals.reduce((a,b)=>a+b,0)/actuals.length).toFixed(1)) : null,
      };
    });
  }, [dates, planMap, players, responseMap]);

  const weeklyRows = useMemo(() => {
    return players.map((player) => {
      let plannedLoad = 0;
      let actualLoad = 0;
      let responsesCount = 0;
      const cells = dates.map((date) => {
        const dateIso = iso(date);
        const plan = planMap.get(dateIso);
        const response = responseMap.get(`${String(player.id)}|${dateIso}`) ?? null;
        if (plan) plannedLoad += loadValue(plan.duration_minutes, plan.planned_rpe);
        if (response?.rpe != null) {
          actualLoad += loadValue(response.duration_minutes ?? plan?.duration_minutes ?? 0, response.rpe);
          responsesCount += 1;
        }
        const delta = plan?.planned_rpe != null && response?.rpe != null
          ? Number(response.rpe) - Number(plan.planned_rpe)
          : null;

        return { date: dateIso, plan, response, delta, level: levelFromDelta(delta) };
      });

      const pct =
        plannedLoad > 0 ? Math.round(((actualLoad - plannedLoad) / plannedLoad) * 100) : null;

      return { player, cells, plannedLoad, actualLoad, pct, responsesCount };
    });
  }, [players, dates, planMap, responseMap]);

  const teamSummary = useMemo(() => {
    const planned = dates.reduce((sum, d) => {
      const p = planMap.get(iso(d));
      return sum + (p ? loadValue(p.duration_minutes, p.planned_rpe) * players.length : 0);
    }, 0);

    const actual = weeklyRows.reduce((sum, row) => sum + row.actualLoad, 0);
    const responsesCount = responses.filter((r) => r.rpe != null).length;
    const expected = plans.length * players.length;

    const avgFatigue = responses.filter(r=>r.fatigue!=null).map(r=>Number(r.fatigue));
    const avgSleep = responses.filter(r=>r.sleep!=null).map(r=>Number(r.sleep));
    const avgSoreness = responses.filter(r=>r.soreness!=null).map(r=>Number(r.soreness));
    const avgStress = responses.filter(r=>r.stress!=null).map(r=>Number(r.stress));

    const mean = (arr:number[]) => arr.length ? arr.reduce((a,b)=>a+b,0)/arr.length : 0;

    return {
      planned,
      actual,
      pct: planned > 0 ? Math.round(((actual - planned) / planned) * 100) : null,
      responseRate: expected > 0 ? Math.round((responsesCount / expected) * 100) : 0,
      fatigue: mean(avgFatigue),
      sleep: mean(avgSleep),
      soreness: mean(avgSoreness),
      stress: mean(avgStress),
    };
  }, [dates, planMap, players.length, weeklyRows, responses, plans.length]);

  return (
    <section style={{ display: "grid", gap: 12 }}>
      {message && (
        <div style={{position:"fixed",top:16,left:"50%",transform:"translateX(-50%)",zIndex:9999,background:"#241B18",color:"#fff",padding:"10px 17px",borderRadius:999,fontWeight:900}}>
          {message}
        </div>
      )}

      <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}>
        <div>
          <div style={{fontSize:10,fontWeight:1000,letterSpacing:".12em",color:GOLD}}>SUIVI HEBDOMADAIRE</div>
          <h2 style={{margin:"4px 0",fontSize:19,color:TEXT}}>RPE prévu vs RPE réel</h2>
          <p style={{margin:0,color:MUTED,fontSize:11}}>Le tableau s'alimente automatiquement au fil des réponses des joueurs.</p>
        </div>

        <div style={{display:"flex",gap:6,alignItems:"center"}}>
          <button onClick={()=>setWeekStart(addDays(weekStart,-7))} style={navBtn}>←</button>
          <div style={{border:`1px solid ${BORDER}`,background:"#fff",borderRadius:10,padding:"8px 11px",fontSize:11,fontWeight:900,color:BORDEAUX}}>
            {fmt(weekStart)} → {fmt(weekEnd)}
          </div>
          <button onClick={()=>setWeekStart(addDays(weekStart,7))} style={navBtn}>→</button>
          <button onClick={()=>setWeekStart(startOfWeek())} style={navBtn}>Aujourd'hui</button>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(135px,1fr))",gap:8}}>
        <K label="Charge prévue équipe" value={teamSummary.planned.toLocaleString("fr-FR")} />
        <K label="Charge réelle équipe" value={teamSummary.actual.toLocaleString("fr-FR")} />
        <K label="Écart semaine" value={teamSummary.pct == null ? "—" : `${teamSummary.pct > 0 ? "+" : ""}${teamSummary.pct}%`} />
        <K label="Taux de réponse" value={`${teamSummary.responseRate}%`} />
        <K label="Fatigue moy." value={teamSummary.fatigue ? teamSummary.fatigue.toFixed(1) : "—"} />
        <K label="Sommeil moy." value={teamSummary.sleep ? teamSummary.sleep.toFixed(1) : "—"} />
        <K label="Douleurs moy." value={teamSummary.soreness ? teamSummary.soreness.toFixed(1) : "—"} />
        <K label="Stress moy." value={teamSummary.stress ? teamSummary.stress.toFixed(1) : "—"} />
      </div>

      <div style={{border:`1px solid ${BORDER}`,borderRadius:16,background:"#fff",padding:14}}>
        <div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"end",marginBottom:8}}>
          <div>
            <span style={{display:"block",color:GOLD,fontWeight:1000,fontSize:9,letterSpacing:".12em"}}>GRAPHIQUE ÉQUIPE</span>
            <strong style={{display:"block",marginTop:3,color:TEXT}}>RPE théorique et RPE réel moyen par jour</strong>
          </div>
          <small style={{color:MUTED}}>Échelle 1 à 10</small>
        </div>
        <LineChart data={teamChart} />
      </div>

      <div style={{border:`1px solid ${BORDER}`,borderRadius:16,background:"#fff",overflow:"hidden"}}>
        <div style={{padding:"12px 14px",borderBottom:`1px solid ${BORDER}`}}>
          <span style={{display:"block",color:GOLD,fontWeight:1000,fontSize:9,letterSpacing:".12em"}}>RPE THÉORIQUE</span>
          <strong style={{display:"block",marginTop:3,color:TEXT}}>Programme de la semaine</strong>
          <small style={{color:MUTED}}>Tu renseignes ici la durée et le RPE visé de l'équipe.</small>
        </div>

        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:760,fontSize:11}}>
            <thead>
              <tr>
                <th style={th}>Paramètre</th>
                {dates.map((d,i)=><th key={iso(d)} style={th}>{DAYS[i]}<br/><small>{fmt(d)}</small></th>)}
              </tr>
            </thead>
            <tbody>
              <tr>
                <td style={rowLabel}>Durée prévue</td>
                {dates.map((d)=>{
                  const dateIso=iso(d); const p=planMap.get(dateIso);
                  return <td key={dateIso} style={td}>
                    <input
                      type="number"
                      min={0}
                      max={300}
                      defaultValue={p?.duration_minutes ?? ""}
                      placeholder="—"
                      disabled={!canEdit}
                      onBlur={(e)=>{const value=Number(e.target.value); if(value>0) void savePlan(dateIso,{duration_minutes:value});}}
                      style={cellInput}
                    />
                    <small style={{color:MUTED}}>min</small>
                  </td>
                })}
              </tr>
              <tr>
                <td style={rowLabel}>RPE prévu</td>
                {dates.map((d)=>{
                  const dateIso=iso(d); const p=planMap.get(dateIso);
                  return <td key={dateIso} style={td}>
                    <input
                      type="number"
                      min={1}
                      max={10}
                      step=".5"
                      defaultValue={p?.planned_rpe ?? ""}
                      placeholder="—"
                      disabled={!canEdit}
                      onBlur={(e)=>{const value=Number(e.target.value); if(value>=1&&value<=10) void savePlan(dateIso,{planned_rpe:value});}}
                      style={{...cellInput,fontWeight:1000,color:BORDEAUX}}
                    />
                    {p && canEdit && <button onClick={()=>clearPlan(dateIso)} title="Supprimer le plan" style={{border:0,background:"transparent",color:"#A72E26",cursor:"pointer",fontSize:11}}>×</button>}
                  </td>
                })}
              </tr>
              <tr>
                <td style={rowLabel}>Charge prévue</td>
                {dates.map((d)=>{
                  const p=planMap.get(iso(d));
                  return <td key={iso(d)} style={{...td,fontWeight:900,color:BORDEAUX}}>{p ? loadValue(p.duration_minutes,p.planned_rpe) : "—"}</td>
                })}
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div style={{border:`1px solid ${BORDER}`,borderRadius:16,background:"#fff",overflow:"hidden"}}>
        <div style={{padding:"12px 14px",borderBottom:`1px solid ${BORDER}`}}>
          <span style={{display:"block",color:GOLD,fontWeight:1000,fontSize:9,letterSpacing:".12em"}}>TABLEAU ÉQUIPE</span>
          <strong style={{display:"block",marginTop:3,color:TEXT}}>Récapitulatif semaine</strong>
          <small style={{color:MUTED}}>Dans chaque cellule : RPE prévu / RPE réel. Survole pour voir toutes les réponses de récupération.</small>
        </div>

        <div style={{overflowX:"auto"}}>
          <table style={{width:"100%",borderCollapse:"collapse",minWidth:1180,fontSize:10}}>
            <thead>
              <tr>
                <th style={{...th,textAlign:"left",position:"sticky",left:0,background:"#F7F3F0",zIndex:2}}>Joueur</th>
                {dates.map((d,i)=><th key={iso(d)} style={th}>{DAYS[i]}<br/><small>{fmt(d)}</small></th>)}
                <th style={th}>Prévu sem.</th>
                <th style={th}>Réel sem.</th>
                <th style={th}>Écart</th>
                <th style={th}>Réponses</th>
              </tr>
            </thead>
            <tbody>
              {weeklyRows.map((row)=>(
                <tr key={String(row.player.id)}>
                  <td style={{...td,textAlign:"left",fontWeight:900,position:"sticky",left:0,background:"#fff",zIndex:1,minWidth:150}}>
                    {row.player.firstName} {row.player.lastName}
                  </td>
                  {row.cells.map((cell)=>{
                    const planned=cell.plan?.planned_rpe ?? null;
                    const actual=cell.response?.rpe ?? null;
                    const bg = cell.level==="alert" ? "#FFF0EF" : cell.level==="watch" ? "#FFF7E8" : "#fff";
                    const title = cell.response
                      ? `RPE prévu: ${planned ?? "—"} | RPE réel: ${actual ?? "—"} | Fatigue: ${cell.response.fatigue ?? "—"} | Sommeil: ${cell.response.sleep ?? "—"} | Douleurs: ${cell.response.soreness ?? "—"} | Stress: ${cell.response.stress ?? "—"}${cell.response.comment ? ` | ${cell.response.comment}` : ""}`
                      : `RPE prévu: ${planned ?? "—"} | Pas de réponse`;
                    return (
                      <td key={cell.date} title={title} style={{...td,background:bg,minWidth:86}}>
                        <div style={{fontWeight:1000,color:TEXT}}>
                          <span style={{color:GOLD}}>{planned ?? "—"}</span>
                          <span style={{color:"#9C8E87",margin:"0 4px"}}>/</span>
                          <span style={{color:BORDEAUX}}>{actual ?? "—"}</span>
                        </div>
                        {cell.delta != null && (
                          <small style={{display:"block",marginTop:2,color:cell.level==="alert"?"#B42318":cell.level==="watch"?"#A26808":"#467A50"}}>
                            {cell.delta>0?"+":""}{cell.delta}
                          </small>
                        )}
                        {cell.response && (
                          <small style={{display:"block",marginTop:2,color:MUTED}}>
                            F{cell.response.fatigue ?? "—"} S{cell.response.sleep ?? "—"}
                          </small>
                        )}
                      </td>
                    )
                  })}
                  <td style={{...td,fontWeight:900}}>{row.plannedLoad || "—"}</td>
                  <td style={{...td,fontWeight:900,color:BORDEAUX}}>{row.actualLoad || "—"}</td>
                  <td style={{...td,fontWeight:1000,color:row.pct!=null&&Math.abs(row.pct)>=25?"#B42318":row.pct!=null&&Math.abs(row.pct)>=15?"#A26808":"#467A50"}}>
                    {row.pct==null?"—":`${row.pct>0?"+":""}${row.pct}%`}
                  </td>
                  <td style={td}>{row.responsesCount}/{plans.length || 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

function K({label,value}:{label:string;value:string|number}) {
  return (
    <div style={{border:`1px solid ${BORDER}`,borderRadius:13,background:"#fff",padding:"10px 12px"}}>
      <span style={{display:"block",fontSize:9,fontWeight:900,textTransform:"uppercase",letterSpacing:".08em",color:MUTED}}>{label}</span>
      <strong style={{display:"block",marginTop:4,fontSize:20,color:BORDEAUX}}>{value}</strong>
    </div>
  );
}

const navBtn: React.CSSProperties = {border:`1px solid ${BORDER}`,background:"#fff",color:BORDEAUX,borderRadius:9,padding:"8px 10px",fontWeight:900,cursor:"pointer"};
const th: React.CSSProperties = {padding:"9px 7px",borderBottom:`1px solid ${BORDER}`,borderRight:`1px solid ${BORDER}`,background:"#F7F3F0",textAlign:"center",color:"#5B4E48",fontWeight:1000};
const td: React.CSSProperties = {padding:"8px 7px",borderBottom:`1px solid ${BORDER}`,borderRight:`1px solid ${BORDER}`,textAlign:"center",verticalAlign:"middle"};
const rowLabel: React.CSSProperties = {...td,textAlign:"left",fontWeight:900,color:"#5B4E48",background:"#FBF8F6"};
const cellInput: React.CSSProperties = {width:56,border:`1px solid ${BORDER}`,borderRadius:7,padding:"5px 6px",textAlign:"center",background:"#fff"};
