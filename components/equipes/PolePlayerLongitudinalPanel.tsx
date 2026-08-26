"use client";

import Link from "next/link";
import PolePlayerFollowupPanel from "@/components/equipes/PolePlayerFollowupPanel";
import { useEffect, useMemo, useState } from "react";

type Filter = "all" | "pole" | "club";

function f1(value: unknown) {
  const n = Number(value || 0);
  return n.toLocaleString("fr-FR", { maximumFractionDigits: 1 });
}
function dateFr(value?: string | null) {
  if (!value) return "—";
  const [y,m,d] = value.slice(0,10).split("-");
  return y && m && d ? `${d}/${m}/${y}` : value;
}

export default function PolePlayerLongitudinalPanel({ teamId, playerId }: { teamId: string; playerId: string }) {
  const [data,setData]=useState<any>(null);
  const [loading,setLoading]=useState(true);
  const [filter,setFilter]=useState<Filter>("all");

  async function load(){
    setLoading(true);
    const r=await fetch(`/api/institutionnel/pole-performance/player-overview?teamId=${encodeURIComponent(teamId)}&playerId=${encodeURIComponent(playerId)}`,{cache:"no-store"});
    const j=await r.json(); setLoading(false);
    if(!r.ok){setData({error:j.error||"Chargement impossible"});return}
    setData(j);
  }
  useEffect(()=>{void load()},[teamId,playerId]); // eslint-disable-line

  const allowedSources=useMemo(()=>{
    if(!data?.sources)return [];
    return data.sources.filter((s:any)=>filter==="all"||s.kind===filter);
  },[data,filter]);
  const allowedKeys=useMemo(()=>new Set(allowedSources.map((s:any)=>`${s.teamId}|${s.playerId}`)),[allowedSources]);

  if(loading)return <div className="poleEmpty">Consolidation Pôle + club…</div>;
  if(data?.error)return <div className="poleEmpty">{data.error}</div>;
  if(!data?.linked)return <div className="poleEmpty">Ce joueur n’est pas encore relié au suivi Pôle / Performance.</div>;

  const bySource=(data.stats?.bySource||[]).filter((x:any)=>allowedKeys.has(`${x.source.teamId}|${x.source.playerId}`));
  const loadRows=(data.loads||[]).filter((x:any)=>allowedKeys.has(`${x.source.teamId}|${x.source.playerId}`));
  const presence=(data.presence||[]).filter((x:any)=>allowedKeys.has(`${x.source.teamId}|${x.source.playerId}`));
  const timeline=(data.timeline||[]).filter((x:any)=>filter==="all"||(filter==="pole"?x.source==="Pôle":x.source==="Club"));
  const clips=(data.clips||[]).filter((x:any)=>{
    const source=(data.sources||[]).find((s:any)=>String(s.teamId)===String(x.teamId));
    return !source||filter==="all"||source.kind===filter;
  });
  const global=data.stats?.global||{};
  const totalLoad=loadRows.reduce((s:number,x:any)=>s+Number(x.current7||0),0);
  const weightedPresence=presence.reduce((a:any,x:any)=>({ok:a.ok+(Number(x.present||0)+Number(x.late||0)),total:a.total+Number(x.total||0)}),{ok:0,total:0});
  const presenceRate=weightedPresence.total?Math.round(weightedPresence.ok/weightedPresence.total*100):null;

  return <div className="longitudinal">
    <header className="head"><div><p>PÔLE / PERFORMANCE</p><h2>Suivi longitudinal automatique</h2><span>Une seule lecture du joueur à partir de ses données Pôle + club partenaire.</span></div><button onClick={load}>↻ Actualiser</button></header>

    <div className="filters"><button className={filter==="all"?"on":""} onClick={()=>setFilter("all")}>Tout</button><button className={filter==="pole"?"on":""} onClick={()=>setFilter("pole")}>🏛 Pôle</button><button className={filter==="club"?"on":""} onClick={()=>setFilter("club")}>🏀 Club</button></div>

    <div className="sources">{allowedSources.map((s:any)=><div key={`${s.teamId}-${s.playerId}`}><b>{s.kind==="pole"?"🏛":"🏀"} {s.teamName}</b><span>{s.seasonLabel||"Saison —"}{s.category?` · ${s.category}`:""}</span></div>)}</div>

    {(data.alerts||[]).length>0&&<section className="alerts"><h3>À surveiller</h3><div>{(data.alerts||[]).map((a:any,i:number)=><span className={a.level} key={i}><b>{a.source}</b> · {a.label}</span>)}</div></section>}

    <div className="kpis"><K label="Matchs" value={global.games||0}/><K label="Points / match" value={f1(global.avgPts)}/><K label="Minutes / match" value={f1(global.avgMinutes)}/><K label="Charge 7 jours" value={Math.round(totalLoad)}/><K label="Présence" value={presenceRate==null?"—":`${presenceRate}%`}/><K label="Clips liés" value={clips.length}/></div>

    <section className="box"><div className="sectionTitle"><div><p>STATISTIQUES</p><h3>Pôle + club, sans ressaisie</h3></div></div><div className="statsGrid">{bySource.map((x:any)=><article key={`${x.source.teamId}-${x.source.playerId}`}><b>{x.source.kind==="pole"?"🏛":"🏀"} {x.source.teamName}</b><span>{x.totals.games} match(s)</span><div><strong>{f1(x.totals.avgPts)}</strong><small>PTS</small><strong>{f1(x.totals.avgReb)}</strong><small>REB</small><strong>{f1(x.totals.avgAst)}</strong><small>PD</small><strong>{f1(x.totals.avgMinutes)}</strong><small>MIN</small></div></article>)}</div></section>

    <section className="box"><div className="sectionTitle"><div><p>DÉVELOPPEMENT PHYSIQUE</p><h3>Courbe de croissance multi-saisons</h3></div><span>{data.growth?.length?`${data.growth.length} mesure(s)`:"Aucune mesure"}</span></div><GrowthChart points={data.growth||[]}/></section>

    <div className="two"><section className="box"><div className="sectionTitle"><div><p>CHARGE / RPE</p><h3>Charge croisée</h3></div></div>{loadRows.length?loadRows.map((x:any)=><div className="loadRow" key={`${x.source.teamId}-${x.source.playerId}`}><div><b>{x.source.kind==="pole"?"🏛":"🏀"} {x.source.teamName}</b><span>7 j : {Math.round(x.current7)} · semaine précédente : {Math.round(x.previous7)}</span></div><div><strong>{x.latestRpe==null?"—":`${f1(x.latestRpe)}/10`}</strong><small>RPE</small><strong>{x.latestFatigue==null?"—":`${f1(x.latestFatigue)}/10`}</strong><small>FATIGUE</small></div></div>):<div className="miniEmpty">Aucune charge disponible.</div>}</section>
    <section className="box"><div className="sectionTitle"><div><p>PRÉSENCE</p><h3>Pôle + club</h3></div></div>{presence.length?presence.map((x:any)=><div className="presenceRow" key={`${x.source.teamId}-${x.source.playerId}`}><div><b>{x.source.kind==="pole"?"🏛":"🏀"} {x.source.teamName}</b><span>{x.present} présent · {x.late} retard · {x.absent} absent</span></div><strong>{x.rate==null?"—":`${x.rate}%`}</strong></div>):<div className="miniEmpty">Aucune présence enregistrée.</div>}</section></div>

    <section className="box"><div className="sectionTitle"><div><p>VIDÉO</p><h3>Clips du joueur dans ses deux équipes</h3></div><span>{clips.length} clip(s)</span></div><div className="clipGrid">{clips.slice(0,12).map((c:any)=>{const source=(data.sources||[]).find((s:any)=>String(s.teamId)===String(c.teamId));return <Link key={c.id} href={`/equipes/${c.teamId}/${source?.playerId||c.playerId}`}><b>{source?.kind==="pole"?"🏛":"🏀"} {source?.teamName||"Équipe"}</b><span>{c.title}</span><small>{c.tempsFort?`${c.tempsFort} · `:""}{c.result||"Action vidéo"}</small></Link>})}{!clips.length&&<div className="miniEmpty">Les clips apparaîtront ici dès que LiveStats les associe au joueur.</div>}</div></section>

    <PolePlayerFollowupPanel structureId={data.structureId||data.structure?.id||null} institutionalPlayerId={data.institutionalPlayerId||data.player?.institutionalPlayerId||null} />

    <section className="box"><div className="sectionTitle"><div><p>TIMELINE</p><h3>Historique de formation</h3></div></div><div className="timeline">{timeline.slice(0,40).map((e:any,i:number)=><article key={`${e.type}-${e.date}-${i}`}><time>{dateFr(e.date)}</time><span className={`dot ${e.source==="Pôle"?"poleDot":"clubDot"}`}/><div><b>{e.source} · {e.title}</b>{e.detail&&<p>{e.detail}</p>}</div></article>)}{!timeline.length&&<div className="miniEmpty">Aucun événement longitudinal pour le moment.</div>}</div></section>

    <style jsx>{`.longitudinal{display:grid;gap:12px}.head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.head p,.sectionTitle p{margin:0;color:#d4a24c;font-size:.68rem;font-weight:1000;letter-spacing:.12em}.head h2{margin:4px 0;color:#6b1a2c}.head span,.sectionTitle span{color:#7b6e68;font-size:.78rem}.head button,.filters button{border:1px solid #dccfc8;background:#fff;color:#6b1a2c;border-radius:999px;padding:8px 11px;font-weight:900;cursor:pointer}.filters{display:flex;gap:5px}.filters .on{background:#6b1a2c;color:#fff;border-color:#6b1a2c}.sources{display:flex;gap:6px;flex-wrap:wrap}.sources>div{border:1px solid #e6dad4;border-radius:999px;padding:7px 10px}.sources b,.sources span{display:block}.sources span{font-size:.67rem;color:#7c6f68}.alerts{border:1px solid #ead7ce;border-radius:12px;padding:10px;background:#fffaf7}.alerts h3{color:#6b1a2c;margin:0 0 7px}.alerts div{display:flex;gap:5px;flex-wrap:wrap}.alerts span{border-radius:999px;padding:6px 9px;font-size:.73rem;background:#eee7e3}.alerts .high{background:#fdebed;color:#9d2337}.alerts .watch{background:#fff0da;color:#8b5b13}.alerts .info{background:#eef3f7;color:#405b70}.kpis{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}.box{border:1px solid #eadfd8;border-radius:13px;padding:11px;background:#fff}.sectionTitle{display:flex;justify-content:space-between;align-items:flex-start;gap:10px}.sectionTitle h3{margin:3px 0 8px;color:#6b1a2c}.statsGrid{display:grid;grid-template-columns:1fr 1fr;gap:7px}.statsGrid article{border:1px solid #e9ded8;border-radius:10px;padding:9px}.statsGrid article>b,.statsGrid article>span{display:block}.statsGrid article>span{font-size:.7rem;color:#7b6e67}.statsGrid article>div{display:grid;grid-template-columns:repeat(4,1fr);gap:3px;margin-top:8px;text-align:center}.statsGrid strong{color:#6b1a2c;font-size:1.1rem}.statsGrid small{grid-row:2;font-size:.58rem;color:#8a7c75}.two{display:grid;grid-template-columns:1fr 1fr;gap:10px}.loadRow,.presenceRow{display:flex;justify-content:space-between;gap:8px;align-items:center;padding:8px 0;border-top:1px solid #eee4df}.loadRow:first-of-type,.presenceRow:first-of-type{border-top:0}.loadRow b,.loadRow span,.presenceRow b,.presenceRow span{display:block}.loadRow span,.presenceRow span{font-size:.7rem;color:#7c6f68}.loadRow>div:last-child{display:grid;grid-template-columns:1fr 1fr;gap:2px 10px;text-align:center}.loadRow strong,.presenceRow>strong{color:#6b1a2c}.loadRow small{font-size:.58rem;color:#8b7d76}.clipGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.clipGrid a{border:1px solid #e7dcd6;border-radius:9px;padding:8px;color:#281e20;text-decoration:none}.clipGrid b,.clipGrid span,.clipGrid small{display:block}.clipGrid span{margin-top:4px}.clipGrid small{color:#7e716a;margin-top:2px}.timeline article{display:grid;grid-template-columns:80px 12px 1fr;gap:8px;align-items:flex-start;position:relative;padding:7px 0}.timeline time{font-size:.69rem;color:#81736d;text-align:right}.dot{width:9px;height:9px;border-radius:50%;margin-top:3px}.poleDot{background:#6b1a2c}.clubDot{background:#d4a24c}.timeline b{color:#372b2e}.timeline p{margin:3px 0 0;color:#746760;font-size:.76rem}.miniEmpty,.poleEmpty{border:1px dashed #d8cbc4;border-radius:9px;padding:12px;color:#81736c;text-align:center}@media(max-width:1050px){.kpis{grid-template-columns:repeat(3,1fr)}.clipGrid{grid-template-columns:1fr 1fr}}@media(max-width:760px){.two,.statsGrid{grid-template-columns:1fr}.kpis{grid-template-columns:1fr 1fr}.clipGrid{grid-template-columns:1fr}.head{display:grid}}`}</style>
  </div>
}

function K({label,value}:{label:string;value:any}){return <div style={{border:"1px solid #e6dad4",borderRadius:10,padding:9,background:"#fff"}}><span style={{display:"block",fontSize:10,color:"#7c6f68"}}>{label}</span><b style={{display:"block",fontSize:20,color:"#6b1a2c",marginTop:4}}>{value}</b></div>}

function GrowthChart({points}:{points:any[]}){
  const p=points.filter(x=>Number(x.height)>0);
  if(p.length<2)return <div className="miniEmpty">Deux mesures de taille minimum pour afficher la courbe.<style jsx>{`.miniEmpty{border:1px dashed #d8cbc4;border-radius:9px;padding:18px;color:#81736c;text-align:center}`}</style></div>;
  const W=760,H=220,P=34,vals=p.map(x=>Number(x.height)),min=Math.min(...vals)-2,max=Math.max(...vals)+2;
  const coords=p.map((x,i)=>({x:P+i*(W-2*P)/(p.length-1),y:P+(max-Number(x.height))*(H-2*P)/(max-min),item:x}));
  return <div className="chart"><svg viewBox={`0 0 ${W} ${H}`}><polyline points={coords.map(c=>`${c.x},${c.y}`).join(" ")} fill="none" stroke="#6b1a2c" strokeWidth="4"/>{coords.map((c,i)=><g key={i}><circle cx={c.x} cy={c.y} r="5" fill="#d4a24c"/><text x={c.x} y={c.y-11} textAnchor="middle" fontSize="12" fill="#6b1a2c">{c.item.height} cm</text><text x={c.x} y={H-8} textAnchor="middle" fontSize="10" fill="#746b6d">{dateFr(c.item.date).slice(0,5)}</text></g>)}</svg><style jsx>{`.chart{width:100%;overflow:auto}.chart svg{width:100%;min-width:600px;height:auto}`}</style></div>
}
