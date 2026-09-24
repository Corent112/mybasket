"use client";

import { useEffect, useState } from "react";
import AccountChrome from "@/components/equipes/AccountChrome";
import TeamShootingGrids from "@/components/equipes/TeamShootingGrids";

type Structure={id:string;name:string;short_name?:string|null};

export default function MyDocumentsPage(){
  const [tab,setTab]=useState<"papers"|"shooting">("shooting");
  const [structures,setStructures]=useState<Structure[]>([]);
  const [structureId,setStructureId]=useState("");
  const [loading,setLoading]=useState(true);

  useEffect(()=>{void (async()=>{
    try{
      const r=await fetch("/api/institutionnel/access",{cache:"no-store"});
      const j=await r.json();
      const rows=(j.structures||[]) as Structure[];
      setStructures(rows);
      if(rows[0]?.id)setStructureId(rows[0].id);
    }finally{setLoading(false)}
  })()},[]);

  return <AccountChrome active="Mes Documents">
    <div style={{display:"grid",gap:14}}>
      <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"end",flexWrap:"wrap"}}>
        <div><div style={{fontSize:11,fontWeight:900,letterSpacing:1.2,color:"#9b6a17"}}>MON COMPTE</div><h1 style={{margin:"4px 0",color:"#4d1420"}}>Mes documents</h1><p style={{margin:0,color:"#7f7169"}}>Retrouve tes papiers et construis ta bibliothèque personnelle de grilles de tir.</p></div>
        {structures.length>1&&<label style={{display:"grid",gap:5,fontSize:11,fontWeight:800,color:"#594b46"}}>Structure<select value={structureId} onChange={e=>setStructureId(e.target.value)} style={{padding:"9px 10px",border:"1px solid #ddd2ca",borderRadius:9,background:"#fff"}}>{structures.map(s=><option key={s.id} value={s.id}>{s.short_name||s.name}</option>)}</select></label>}
      </div>
      <div style={{display:"flex",gap:7,borderBottom:"1px solid #eadfd8",paddingBottom:8}}>
        <button onClick={()=>setTab("papers")} style={tabStyle(tab==="papers")}>📄 Mes papiers</button>
        <button onClick={()=>setTab("shooting")} style={tabStyle(tab==="shooting")}>🏀 Mes grilles de tir</button>
      </div>
      {tab==="papers"&&<section style={panel}><h2 style={{marginTop:0,color:"#4d1420"}}>Mes papiers</h2><p style={{color:"#7f7169"}}>Tes documents personnels restent regroupés ici.</p></section>}
      {tab==="shooting"&&<section style={panel}>
        <div style={{marginBottom:14}}><h2 style={{margin:"0 0 5px",color:"#4d1420"}}>Mes grilles de tir</h2><p style={{margin:0,color:"#7f7169"}}>Crée ici tes modèles, avec le même éditeur et le même schéma Plaquette que dans Mes équipes. L’attribution aux joueurs se fait ensuite depuis Institution.</p></div>
        {loading?<p>Chargement…</p>:structureId?<TeamShootingGrids teamId={structureId} scopeType="institution" scopeId={structureId} scopeLabel="Mes documents" players={[]} canEdit libraryOnly/>:<div style={{padding:18,border:"1px dashed #d8cbc2",borderRadius:10,color:"#7f7169"}}>Aucune structure institutionnelle accessible sur ce compte.</div>}
      </section>}
    </div>
  </AccountChrome>
}
const panel:React.CSSProperties={background:"#fff",border:"1px solid #eadfd8",borderRadius:14,padding:16};
function tabStyle(on:boolean):React.CSSProperties{return {border:"1px solid "+(on?"#6b1a2c":"#e4d8d0"),background:on?"#6b1a2c":"#fff",color:on?"#fff":"#594b46",borderRadius:9,padding:"9px 12px",fontWeight:850,cursor:"pointer"}}
