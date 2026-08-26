"use client";

import { useEffect, useState } from "react";

export default function PolePerformanceOverview({structureId,season}:{structureId:string;season:string}){
  const[data,setData]=useState<any>(null);
  useEffect(()=>{let active=true;void fetch(`/api/institutionnel/pole-performance/dashboard?structureId=${encodeURIComponent(structureId)}&season=${encodeURIComponent(season)}`,{cache:"no-store"}).then(async r=>({ok:r.ok,j:await r.json()})).then(({ok,j})=>{if(active)setData(ok?j:null)});return()=>{active=false}},[structureId,season]);
  if(!data)return null;
  return <section className="overview"><div className="head"><div><p>TABLEAU DE BORD</p><h3>Suivi automatique · {season}</h3></div>{data.alerts?.total>0&&<span>⚠ {data.alerts.total} point(s) à traiter</span>}</div><div className="grid"><K l="Polistes" v={data.polists}/><K l="Équipes Pôle" v={data.poleTeams}/><K l="Équipes partenaires" v={data.partnerTeams}/><K l="Ont joué cette semaine" v={data.playedThisWeek}/><K l="Matchs cette semaine" v={data.matchesThisWeek}/><K l="Nouveaux bilans" v={data.newReports}/><K l="Nouveaux clips" v={data.newClips}/><K l="Bilans club à actualiser" v={data.alerts?.staleClubReports||0}/></div><style jsx>{`.overview{border:1px solid #eadfd8;border-radius:14px;padding:12px;background:#fff}.head{display:flex;justify-content:space-between;gap:10px;align-items:center}.head p{margin:0;color:#d4a24c;font-size:.67rem;font-weight:1000;letter-spacing:.12em}.head h3{margin:3px 0;color:#6b1a2c}.head>span{background:#fff0da;color:#8b5b13;border-radius:999px;padding:7px 10px;font-size:.73rem;font-weight:900}.grid{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-top:8px}@media(max-width:900px){.grid{grid-template-columns:1fr 1fr}}@media(max-width:520px){.grid{grid-template-columns:1fr}.head{display:grid}}`}</style></section>
}
function K({l,v}:{l:string;v:any}){return <div style={{border:"1px solid #e9ded8",borderRadius:9,padding:9}}><span style={{display:"block",fontSize:10,color:"#7d7069"}}>{l}</span><b style={{display:"block",fontSize:21,color:"#6b1a2c",marginTop:3}}>{v??0}</b></div>}
