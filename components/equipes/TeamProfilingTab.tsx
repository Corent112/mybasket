"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Player = {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  position?: string | null;
  number?: string | number | null;
};

type Assessment = {
  player_id: string;
  updated_at?: string | null;
  basketball_profile?: string | null;
  character_profile?: string | null;
  current_level?: number | null;
  potential?: number | null;
  technique?: number | null;
  athleticism?: number | null;
  offense?: number | null;
  defense?: number | null;
  tactics?: number | null;
  mental?: number | null;
};

const C = { wine: "#6B1A2C", gold: "#D4A24C", ink: "#241b1d", line: "#eadfd9", bg: "#faf8f6" };

function playerName(p: Player) {
  return `${p.firstName ?? p.first_name ?? ""} ${p.lastName ?? p.last_name ?? ""}`.trim() || "Joueur";
}
function initials(p: Player) {
  return playerName(p).split(/\s+/).slice(0,2).map(x => x[0]?.toUpperCase()).join("");
}
function fmtDate(v?: string | null) {
  if (!v) return "—";
  return new Intl.DateTimeFormat("fr-FR", { day:"2-digit", month:"2-digit", year:"numeric" }).format(new Date(v));
}

export default function TeamProfilingTab({ teamId, players = [] }: { teamId: string; players?: Player[] }) {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Assessment[]>([]);
  const [query, setQuery] = useState("");
  const [position, setPosition] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("player_profile_assessments")
        .select("*")
        .eq("team_id", teamId);
      if (alive) {
        setRows((data ?? []) as Assessment[]);
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [supabase, teamId]);

  const byPlayer = useMemo(() => new Map(rows.map(r => [String(r.player_id), r])), [rows]);
  const profiled = players.filter(p => byPlayer.has(String(p.id))).length;
  const latest = rows.map(r => r.updated_at).filter(Boolean).sort().at(-1) ?? null;
  const avgLevel = rows.length
    ? rows.reduce((s,r) => s + Number(r.current_level ?? 0), 0) / rows.filter(r => r.current_level != null).length
    : null;

  const dimensions = ["technique","athleticism","offense","defense","tactics","mental"] as const;
  const dimensionAverages = dimensions.map(k => {
    const vals = rows.map(r => Number(r[k])).filter(Number.isFinite).filter(v => v > 0);
    return { key:k, value: vals.length ? vals.reduce((a,b)=>a+b,0)/vals.length : 0 };
  });
  const strengths = dimensionAverages.filter(x=>x.value>0).sort((a,b)=>b.value-a.value).slice(0,3);
  const priorities = dimensionAverages.filter(x=>x.value>0).sort((a,b)=>a.value-b.value).slice(0,3);
  const labels: Record<string,string> = { technique:"Technique", athleticism:"Moteur / Athléticité", offense:"Offensif", defense:"Défensif", tactics:"Tactique", mental:"Mental" };

  const positions = [...new Set(players.map(p => p.position).filter(Boolean) as string[])];
  const visible = players.filter(p => {
    const okQ = playerName(p).toLowerCase().includes(query.toLowerCase());
    const okP = position === "all" || p.position === position;
    return okQ && okP;
  });

  const openPlayer = (id: string) => {
    window.location.href = `/equipes/${teamId}/${id}?tab=Profilage`;
  };

  return (
    <section className="profileDash">
      <header className="hero">
        <div>
          <div className="eyebrow">DÉVELOPPEMENT COLLECTIF</div>
          <h2>Profilage équipe</h2>
          <p>Résumé automatique des profils individuels de vos joueurs.</p>
        </div>
      </header>

      <div className="kpis">
        <article><b>{profiled} / {players.length}</b><span>Joueurs profilés</span><i><em style={{width:`${players.length ? profiled/players.length*100 : 0}%`}} /></i></article>
        <article><b>{fmtDate(latest)}</b><span>Dernière mise à jour</span></article>
        <article><b>{avgLevel && Number.isFinite(avgLevel) ? `${avgLevel.toFixed(1)}/5` : "—"}</b><span>Niveau moyen équipe</span></article>
        <article className="attention"><b>{Math.max(0, players.length-profiled)}</b><span>Profils à compléter</span></article>
      </div>

      <div className="insights">
        <article>
          <h3>◇ Forces collectives</h3>
          {strengths.length ? strengths.map(x => <div className="insightRow" key={x.key}><span>{labels[x.key]}</span><strong>{x.value.toFixed(1)}/5</strong></div>) :
            <Empty title="Aucune donnée pour le moment" text="Les forces collectives apparaîtront ici lorsque plusieurs profils seront complétés." />}
        </article>
        <article>
          <h3>◎ Axes prioritaires</h3>
          {priorities.length ? priorities.map(x => <div className="insightRow" key={x.key}><span>{labels[x.key]}</span><strong>{x.value.toFixed(1)}/5</strong></div>) :
            <Empty title="Aucune donnée pour le moment" text="Les axes prioritaires de progression apparaîtront automatiquement." />}
        </article>
      </div>

      <article className="tableCard">
        <div className="tableHead">
          <div><h3>Résumé des joueurs</h3><p>Synthèse des profils individuels — mise à jour automatique</p></div>
          <div className="filters">
            <select value={position} onChange={e=>setPosition(e.target.value)}><option value="all">Tous les postes</option>{positions.map(p=><option key={p}>{p}</option>)}</select>
            <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Rechercher un joueur..." />
          </div>
        </div>
        <div className="tableWrap">
          <table>
            <thead><tr><th>Joueur</th><th>Poste</th><th>Profil basket</th><th>Caractère & mental</th><th>Niveau</th><th>Potentiel</th><th>Dernière MAJ</th><th>Statut</th></tr></thead>
            <tbody>
              {visible.map(p => {
                const a = byPlayer.get(String(p.id));
                return <tr key={p.id} onClick={()=>openPlayer(String(p.id))}>
                  <td><div className="person"><span>{initials(p)}</span><b>{playerName(p)}</b></div></td>
                  <td>{p.position || "—"}</td><td>{a?.basketball_profile || "—"}</td><td>{a?.character_profile || "—"}</td>
                  <td>{a?.current_level ? `${a.current_level}/5` : "—"}</td><td>{a?.potential ? `${a.potential}/5` : "—"}</td>
                  <td>{fmtDate(a?.updated_at)}</td>
                  <td><button className={a ? "done" : "todo"}>{a ? "✓ À jour" : "✎ À compléter"}</button></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
        {!loading && !players.length && <Empty title="Aucun joueur dans cette équipe" text="Ajoutez vos joueurs : ils apparaîtront automatiquement dans ce tableau." />}
      </article>

      <style jsx>{`
        .profileDash{display:grid;gap:16px;color:${C.ink}} .hero{display:flex;justify-content:space-between;align-items:end}
        .eyebrow{font-size:10px;font-weight:950;letter-spacing:1.4px;color:${C.gold}} h2{margin:4px 0 2px;font-size:26px;color:${C.wine}} p{margin:0;color:#75696c;font-size:13px}
        .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.kpis article,.insights article,.tableCard{background:white;border:1px solid ${C.line};border-radius:14px}
        .kpis article{padding:18px;min-height:92px;display:flex;flex-direction:column;gap:7px}.kpis b{font-size:22px;color:${C.wine}}.kpis span{font-size:12px}.kpis i{height:6px;background:#eee8e5;border-radius:99px;overflow:hidden}.kpis em{display:block;height:100%;background:${C.gold}}
        .insights{display:grid;grid-template-columns:1fr 1fr;gap:12px}.insights article{padding:18px;min-height:170px}.insights h3,.tableCard h3{margin:0 0 14px;text-transform:uppercase;font-size:13px;color:${C.wine}}
        .insightRow{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0e9e6}.insightRow strong{color:${C.wine}}
        .tableCard{overflow:hidden}.tableHead{padding:18px;display:flex;justify-content:space-between;gap:16px;align-items:center}.tableHead h3{margin-bottom:3px}.filters{display:flex;gap:8px}.filters select,.filters input{border:1px solid ${C.line};border-radius:9px;padding:9px 11px;background:white}
        .tableWrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:12px}th{background:${C.bg};text-align:left;text-transform:uppercase;font-size:9px;letter-spacing:.4px;color:#6d6063;padding:11px}td{padding:11px;border-top:1px solid #eee7e3}tbody tr{cursor:pointer}tbody tr:hover{background:#fffaf5}
        .person{display:flex;align-items:center;gap:9px}.person span{width:30px;height:30px;border:1px solid ${C.line};border-radius:50%;display:grid;place-items:center;font-size:10px}.todo,.done{border-radius:7px;padding:6px 9px;font-size:10px;font-weight:850}.todo{border:1px solid #f0cf99;background:#fff8ed;color:#9a5b00}.done{border:1px solid #bde0ca;background:#f1fbf5;color:#247648}
        @media(max-width:950px){.kpis{grid-template-columns:1fr 1fr}.insights{grid-template-columns:1fr}.tableHead{align-items:stretch;flex-direction:column}} @media(max-width:600px){.kpis{grid-template-columns:1fr}.filters{flex-direction:column}}
      `}</style>
    </section>
  );
}
function Empty({title,text}:{title:string;text:string}) {
  return <div className="empty"><b>{title}</b><p>{text}</p><style jsx>{`.empty{padding:24px 6px;color:#766a6d}.empty b{font-size:13px}.empty p{margin:7px 0 0;max-width:440px;line-height:1.5;font-size:12px}`}</style></div>
}
