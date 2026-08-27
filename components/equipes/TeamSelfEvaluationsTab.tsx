"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Review = {
  id:string; session_id:string; created_at:string; session_date?:string|null; title?:string|null;
  overall_score?:number|null; objectives_score?:number|null; clarity_score?:number|null;
  adaptation_score?:number|null; rhythm_score?:number|null; relevance_score?:number|null;
  summary?:string|null; next_session_advice?:string|null;
};
type Session = { id:string; session_date?:string|null; title?:string|null; theme?:string|null };

const wine="#6B1A2C", gold="#D4A24C", line="#eadfd9";

function dateLabel(v?:string|null){if(!v)return "—";return new Intl.DateTimeFormat("fr-FR",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(v));}

export default function TeamSelfEvaluationsTab({teamId}:{teamId:string}) {
  const supabase=useMemo(()=>createClient(),[]);
  const [period,setPeriod]=useState<"week"|"month"|"season">("week");
  const [reviews,setReviews]=useState<Review[]>([]);
  const [sessions,setSessions]=useState<Session[]>([]);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{let alive=true;(async()=>{
    setLoading(true);
    const [{data:r},{data:s}] = await Promise.all([
      supabase.from("practice_session_self_reviews").select("*").eq("team_id",teamId).order("created_at",{ascending:false}),
      supabase.from("practice_sessions").select("id,session_date,title,theme").eq("team_id",teamId).order("session_date",{ascending:false}).limit(80),
    ]);
    if(alive){setReviews((r??[]) as Review[]);setSessions((s??[]) as Session[]);setLoading(false);}
  })();return()=>{alive=false}},[supabase,teamId]);

  const start=useMemo(()=>{const d=new Date(); if(period==="week")d.setDate(d.getDate()-7);else if(period==="month")d.setMonth(d.getMonth()-1);else d.setMonth(d.getMonth()-10); return d},[period]);
  const visible=reviews.filter(r=>new Date(r.created_at)>=start);
  const reviewedIds=new Set(reviews.map(r=>String(r.session_id)));
  const missing=sessions.filter(s=>!reviewedIds.has(String(s.id))).slice(0,5);
  const avg=(key:keyof Review)=>{const a=visible.map(r=>Number(r[key])).filter(v=>Number.isFinite(v)&&v>0);return a.length?a.reduce((x,y)=>x+y,0)/a.length:null};
  const overall=avg("overall_score");
  const metrics=[["Objectifs","objectives_score"],["Clarté","clarity_score"],["Adaptation","adaptation_score"],["Rythme","rhythm_score"],["Pertinence","relevance_score"]] as const;

  const open=(id:string)=>{window.location.href=`/seances/${id}/bilan`};
  const copyLink=async(id:string)=>{const url=`${window.location.origin}/seances/${id}/evaluation`;await navigator.clipboard.writeText(url);alert("Lien d’évaluation copié.");};

  return <section className="evalDash">
    <header><div><div className="eyebrow">RETOUR D’EXPÉRIENCE</div><h2>Auto-évaluations</h2><p>Analysez vos séances et retrouvez les comptes rendus de fin de séance.</p></div>
      <div className="period">{(["week","month","season"] as const).map(p=><button key={p} className={period===p?"active":""} onClick={()=>setPeriod(p)}>{p==="week"?"Semaine":p==="month"?"Mois":"Saison"}</button>)}</div>
    </header>

    <div className="kpis">
      <article><b>{visible.length}</b><span>Séances évaluées</span></article>
      <article><b>{overall?`${overall.toFixed(1)}/5`:"—"}</b><span>Note moyenne</span></article>
      <article><b>{missing.length}</b><span>CR à compléter</span></article>
      <article><b>{reviews.length}</b><span>CR enregistrés</span></article>
    </div>

    <div className="mainGrid">
      <article className="analysis"><h3>Évolution de la période</h3>
        {visible.length ? <div className="bars">{metrics.map(([label,key])=>{const v=avg(key);return <div key={key}><span>{label}</span><i><em style={{width:`${(v??0)*20}%`}} /></i><b>{v?v.toFixed(1):"—"}</b></div>})}</div>
        : <Empty title="Aucune auto-évaluation sur cette période" text="Le rapport se remplira automatiquement après les premiers comptes rendus." />}
      </article>
      <article><h3>À compléter</h3>
        {missing.length?missing.map(s=><div className="missing" key={s.id}><div><b>{s.title||s.theme||"Séance"}</b><span>{dateLabel(s.session_date)}</span></div><button onClick={()=>open(s.id)}>Compléter</button></div>)
        : <Empty title="Tout est à jour" text="Aucune séance récente n’attend de compte rendu." />}
      </article>
    </div>

    <article className="reports">
      <div className="reportsHead"><div><h3>Comptes rendus de fin de séance</h3><p>Historique relié automatiquement aux séances du calendrier.</p></div></div>
      {!loading && !reviews.length && <Empty title="Aucun compte rendu pour le moment" text="La structure est prête. Vos évaluations apparaîtront ici dès la première séance complétée." />}
      {reviews.map(r=><div className="report" key={r.id}>
        <div className="date"><b>{dateLabel(r.session_date||r.created_at)}</b><span>{r.title||"Séance"}</span></div>
        <div className="score"><b>{r.overall_score?`${Number(r.overall_score).toFixed(1)}/5`:"—"}</b><span>Évaluation</span></div>
        <div className="summary"><b>À retenir</b><span>{r.summary||r.next_session_advice||"Compte rendu enregistré."}</span></div>
        <div className="actions"><button onClick={()=>copyLink(r.session_id)}>🔗 Lien</button><button className="primary" onClick={()=>open(r.session_id)}>Voir le CR</button></div>
      </div>)}
    </article>

    <article className="linkInfo"><div><b>Questionnaire de fin de séance</b><p>Chaque séance dispose d’un lien partageable, sur la même logique que le RPE. Le questionnaire peut être ouvert sur téléphone et reste relié à la séance.</p></div><span>RPE → Évaluation → CR</span></article>

    <style jsx>{`
      .evalDash{display:grid;gap:16px;color:#241b1d}header{display:flex;justify-content:space-between;gap:16px;align-items:end}.eyebrow{font-size:10px;font-weight:950;letter-spacing:1.4px;color:${gold}}h2{margin:4px 0 2px;font-size:26px;color:${wine}}p{margin:0;color:#766a6d;font-size:13px}
      .period{display:flex;padding:3px;border:1px solid ${line};border-radius:10px;background:white}.period button{border:0;background:transparent;padding:8px 12px;border-radius:7px;font-weight:850;font-size:11px}.period .active{background:${wine};color:white}
      .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.kpis article,.mainGrid article,.reports,.linkInfo{background:white;border:1px solid ${line};border-radius:14px}.kpis article{padding:18px;display:flex;flex-direction:column;gap:6px}.kpis b{font-size:22px;color:${wine}}.kpis span{font-size:12px}
      .mainGrid{display:grid;grid-template-columns:1.35fr 1fr;gap:12px}.mainGrid article{padding:18px;min-height:210px}h3{margin:0 0 14px;text-transform:uppercase;color:${wine};font-size:13px}
      .bars{display:grid;gap:13px}.bars>div{display:grid;grid-template-columns:90px 1fr 35px;align-items:center;gap:10px;font-size:11px}.bars i{height:8px;background:#eee8e5;border-radius:99px;overflow:hidden}.bars em{display:block;height:100%;background:${gold};border-radius:99px}.bars b{text-align:right;color:${wine}}
      .missing{display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #eee7e3}.missing div{display:flex;flex-direction:column;gap:3px}.missing span{font-size:10px;color:#8b7e81}.missing button,.actions button{border:1px solid ${line};background:white;border-radius:8px;padding:7px 9px;font-size:10px;font-weight:850;cursor:pointer}
      .reports{overflow:hidden}.reportsHead{padding:18px;border-bottom:1px solid ${line}}.reportsHead h3{margin-bottom:3px}.report{display:grid;grid-template-columns:150px 90px 1fr auto;gap:18px;align-items:center;padding:14px 18px;border-bottom:1px solid #eee7e3}.date,.score,.summary{display:flex;flex-direction:column;gap:4px}.date span,.score span,.summary span{font-size:11px;color:#776b6e}.score b{font-size:18px;color:${wine}}.actions{display:flex;gap:7px}.actions .primary{background:${wine};color:white;border-color:${wine}}
      .linkInfo{padding:16px 18px;display:flex;justify-content:space-between;align-items:center;gap:20px}.linkInfo b{color:${wine}}.linkInfo p{margin-top:4px;max-width:700px}.linkInfo>span{white-space:nowrap;background:#fff7e8;color:#8a5700;border:1px solid #f0d19a;border-radius:999px;padding:7px 10px;font-size:10px;font-weight:900}
      @media(max-width:950px){.kpis{grid-template-columns:1fr 1fr}.mainGrid{grid-template-columns:1fr}.report{grid-template-columns:1fr 90px}.summary{grid-column:1/-1}.actions{grid-column:1/-1}}@media(max-width:600px){header{align-items:stretch;flex-direction:column}.kpis{grid-template-columns:1fr}.linkInfo{align-items:flex-start;flex-direction:column}}
    `}</style>
  </section>
}
function Empty({title,text}:{title:string;text:string}){return <div className="empty"><b>{title}</b><p>{text}</p><style jsx>{`.empty{padding:22px 4px;color:#766a6d}.empty b{font-size:13px}.empty p{margin:7px 0 0;line-height:1.5;font-size:12px}`}</style></div>}
