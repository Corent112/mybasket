"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { average, SESSION_QUESTIONS } from "@/lib/development-profile";

type Period="week"|"month"|"season";
export default function TeamSelfEvaluationsTab({teamId}:{teamId:string}){
 const supabase=useMemo(()=>createClient(),[]);
 const [rows,setRows]=useState<any[]>([]),[sessions,setSessions]=useState<Record<string,any>>({}),[exerciseRows,setExerciseRows]=useState<any[]>([]);
 const [period,setPeriod]=useState<Period>("week"),[origin,setOrigin]=useState("");
 useEffect(()=>{setOrigin(window.location.origin);void load()},[teamId]);
 async function load(){
   const {data:r}=await supabase.from("practice_session_self_reviews").select("*").eq("team_id",teamId).order("review_date",{ascending:false});
   const all=r??[]; setRows(all);
   const ids=[...new Set(all.map((x:any)=>x.session_id).filter(Boolean))];
   if(ids.length){
     const [{data:s},{data:e}]=await Promise.all([
       supabase.from("practice_sessions").select("id,title,theme,session_date,start_time").in("id",ids),
       supabase.from("practice_exercise_reviews").select("*").in("session_id",ids)
     ]);
     setSessions(Object.fromEntries((s??[]).map((x:any)=>[x.id,x]))); setExerciseRows(e??[]);
   } else {setSessions({});setExerciseRows([])}
 }
 const now=new Date();
 const filtered=rows.filter(r=>{
   const d=new Date(String(r.review_date)+"T12:00:00");
   if(period==="week"){const start=new Date(now);start.setDate(now.getDate()-6);start.setHours(0,0,0,0);return d>=start}
   if(period==="month")return d.getFullYear()===now.getFullYear()&&d.getMonth()===now.getMonth();
   const seasonStartYear=now.getMonth()>=7?now.getFullYear():now.getFullYear()-1;
   const seasonStart=new Date(seasonStartYear,7,1);
   const seasonEnd=new Date(seasonStartYear+1,6,31,23,59,59,999);
   return d>=seasonStart && d<=seasonEnd;
 });
 const score=(r:any)=>average([r.objectives_rating,r.rhythm_rating,r.clarity_rating,r.adaptation_rating,r.relevance_rating]);
 const global=average(filtered.map(score));
 const axis=(key:string)=>average(filtered.map(r=>Number(r[key])));
 const publicUrl=origin?`${origin}/equipes/${teamId}/auto-evaluation`:`/equipes/${teamId}/auto-evaluation`;
 const qr=`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(publicUrl)}`;
 const latest=filtered[0];
 const latestExercises=latest?exerciseRows.filter(e=>e.session_id===latest.session_id):[];
 const strong=SESSION_QUESTIONS.map(q=>({name:q.short,v:axis(q.key)})).filter(x=>x.v>=4);
 const weak=SESSION_QUESTIONS.map(q=>({name:q.short,v:axis(q.key)})).filter(x=>x.v>0&&x.v<=2.9);

 return <section className="aeTab">
   <div className="quick">
     <div className="quickHead"><div><span>QUESTIONNAIRE COACH</span><h2>Auto-évaluation de fin de séance</h2><p>Un seul lien permanent. MyBasket l'associe à la séance concernée.</p></div><img src={qr} alt="QR code auto-évaluation"/></div>
     <code>{publicUrl}</code>
     <div className="actions"><button onClick={()=>navigator.clipboard.writeText(publicUrl)}>Copier</button><button onClick={()=>window.open(publicUrl,"_blank","noopener,noreferrer")}>Tester</button></div>
   </div>

   <div className="dashHead"><div><span>AUTO-ÉVALUATIONS</span><h2>Analyse des séances</h2></div><div className="periods"><button className={period==="week"?"on":""} onClick={()=>setPeriod("week")}>Semaine</button><button className={period==="month"?"on":""} onClick={()=>setPeriod("month")}>Mois</button><button className={period==="season"?"on":""} onClick={()=>setPeriod("season")}>Saison</button></div></div>

   <div className="kpis"><Kpi label="Séances évaluées" value={String(filtered.length)}/><Kpi label="Ressenti moyen" value={filtered.length?`${axis("relevance_rating").toFixed(1)}/5`:"—"}/><Kpi label="Moyenne globale" value={filtered.length?`${global.toFixed(1)}/5`:"—"}/><Kpi label="Exercices évalués" value={String(exerciseRows.filter(e=>filtered.some(r=>r.session_id===e.session_id)).length)}/></div>

   <div className="panel"><h3>Évolution des séances</h3>{filtered.length===0?<div className="empty"><b>Aucune donnée pour le moment.</b><br/>Les 5 indicateurs, la synthèse et le conseil pour la séance suivante apparaîtront ici dès que tu auras enregistré ta première auto-évaluation.</div>:<div className="chart">{[...filtered].reverse().slice(-8).map((r:any)=><div className="barRow" key={r.id}><span>{new Date(r.review_date+"T12:00:00").toLocaleDateString("fr-FR",{day:"2-digit",month:"2-digit"})}</span><div className="bar"><i style={{width:`${score(r)*20}%`}}/></div><b>{score(r).toFixed(1)}</b></div>)}</div>}
     <div className="axisGrid">{SESSION_QUESTIONS.map(q=><div key={q.key}><span>{q.short}</span><b>{filtered.length?axis(q.key).toFixed(1):"—"}/5</b></div>)}</div>
   </div>

   <div className="retain"><div><h3>Points forts</h3>{strong.length?strong.map(x=><p key={x.name}>{x.name} · {x.v.toFixed(1)}/5</p>):<p className="muted">Pas encore de tendance forte.</p>}</div><div><h3>À retravailler</h3>{weak.length?weak.map(x=><p key={x.name}>{x.name} · {x.v.toFixed(1)}/5</p>):<p className="muted">Pas de difficulté majeure identifiée.</p>}</div></div>

   <div className="panel report"><h3>Compte rendu</h3>{latest?<><div className="reportTop"><div><b>{sessions[latest.session_id]?.title||sessions[latest.session_id]?.theme||"Séance"}</b><span>{new Date(latest.review_date+"T12:00:00").toLocaleDateString("fr-FR")}</span></div><strong>{score(latest).toFixed(1)}/5</strong></div><h4>Synthèse</h4><p>{latest.generated_summary||"Bilan enregistré."}</p>{latest.takeaways&&<><h4>Remarques</h4><p>{latest.takeaways}</p></>}<h4>Conseils pour la séance suivante</h4><p>{latest.generated_advice||latest.next_time_changes||"—"}</p>{latestExercises.length>0&&<><h4>Exercices</h4><div className="exerciseList">{latestExercises.map(e=><span key={e.id}>{e.exercise_title} <b>{e.mastery_rating}/5</b></span>)}</div></>}<a href={`/seances/${latest.session_id}/bilan`}>Voir / modifier le compte rendu</a></>:<div className="empty">Le compte rendu apparaîtra ici après la première évaluation.</div>}</div>

   <div className="history"><h3>Comptes rendus de fin de séance</h3>{rows.length===0?<div className="empty">Aucune auto-évaluation enregistrée.</div>:rows.slice(0,12).map(r=><article key={r.id}><div><span>{new Date(r.review_date+"T12:00:00").toLocaleDateString("fr-FR")}</span><b>{sessions[r.session_id]?.title||sessions[r.session_id]?.theme||"Séance"}</b></div><strong>{score(r).toFixed(1)}/5</strong><p>{r.generated_summary||"Bilan enregistré."}</p><a href={`/seances/${r.session_id}/bilan`}>Ouvrir</a></article>)}</div>

   <style jsx>{`.aeTab{display:grid;gap:16px}.quick,.panel,.history,.retain>div{border:1px solid #eee2d6;border-radius:18px;background:#fff;padding:18px}.quick{background:#fffaf3}.quickHead{display:flex;justify-content:space-between;gap:18px}.quickHead span,.dashHead span{color:#d4a24c;font-weight:950;font-size:11px}.quick h2,.dashHead h2{color:#6b1a2c;margin:4px 0}.quick p{margin:0;color:#82746e}.quick img{width:96px;height:96px;border-radius:10px}.linkReady{display:inline-flex;margin-top:10px;padding:6px 9px;border-radius:999px;background:#f4eadb;color:#6b1a2c;font-size:11px;font-weight:950}.quick code{display:block;margin-top:12px;padding:10px;border-radius:10px;background:#fff;border:1px solid #eadccc;overflow:auto}.actions{display:flex;gap:8px;margin-top:10px}.actions button,.periods button{border:1px solid #dccbbd;background:#fff;color:#6b1a2c;border-radius:9px;padding:8px 12px;font-weight:900;cursor:pointer}.dashHead{display:flex;justify-content:space-between;align-items:end}.periods{display:flex;gap:6px}.periods button.on{background:#6b1a2c;color:#fff;border-color:#6b1a2c}.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.panel h3,.history h3,.retain h3{margin:0 0 14px;color:#6b1a2c}.chart{display:grid;gap:8px}.barRow{display:grid;grid-template-columns:48px 1fr 32px;align-items:center;gap:8px;font-size:12px}.bar{height:9px;background:#f1e8df;border-radius:99px;overflow:hidden}.bar i{display:block;height:100%;background:#6b1a2c;border-radius:99px}.axisGrid{display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-top:18px}.axisGrid div{padding:10px;background:#fff8ef;border-radius:12px}.axisGrid span{display:block;color:#857770;font-size:11px}.axisGrid b{color:#6b1a2c}.retain{display:grid;grid-template-columns:1fr 1fr;gap:12px}.retain p{margin:6px 0}.muted,.empty{color:#8d817b}.reportTop{display:flex;justify-content:space-between;align-items:center}.reportTop span{display:block;color:#8d817b;font-size:12px}.reportTop>strong{color:#6b1a2c;font-size:22px}.report h4{color:#d4a24c;margin:15px 0 5px}.report p{margin:0;line-height:1.55}.report a,.history a{color:#6b1a2c;font-weight:900;text-decoration:none}.exerciseList{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:14px}.exerciseList span{background:#fff8ef;padding:7px 9px;border-radius:9px}.history{display:grid;gap:9px}.history>h3{margin-bottom:4px}.history article{display:grid;grid-template-columns:minmax(180px,.8fr) auto 1.6fr auto;gap:12px;align-items:center;border-top:1px solid #f0e6db;padding-top:10px}.history article span{display:block;color:#d4a24c;font-size:11px;font-weight:900}.history article p{margin:0;color:#776b66}.history article>strong{color:#6b1a2c}.empty{padding:16px;border:1px dashed #eadccc;border-radius:12px}.kpi{border:1px solid #eee2d6;border-radius:14px;background:#fff;padding:14px}.kpi span{display:block;color:#8b7d76;font-size:11px}.kpi b{display:block;color:#6b1a2c;font-size:22px;margin-top:3px}@media(max-width:900px){.kpis{grid-template-columns:1fr 1fr}.axisGrid{grid-template-columns:1fr 1fr}.retain{grid-template-columns:1fr}.history article{grid-template-columns:1fr}.dashHead{align-items:flex-start;flex-direction:column;gap:10px}}`}</style>
 </section>
}
function Kpi({label,value}:{label:string;value:string}){return <div className="kpi"><span>{label}</span><b>{value}</b><style jsx>{`.kpi{border:1px solid #eee2d6;border-radius:14px;background:#fff;padding:14px}.kpi span{display:block;color:#8b7d76;font-size:11px}.kpi b{display:block;color:#6b1a2c;font-size:22px;margin-top:3px}`}</style></div>}
