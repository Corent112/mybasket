"use client";
import {useEffect,useMemo,useState} from "react";
import {createClient} from "@/lib/supabase/client";

type Props={structureId:string;go:(tab:string)=>void};
export default function InstitutionalDashboardConnected({structureId,go}:Props){
 const sb=useMemo(()=>createClient(),[]);const[k,setK]=useState({players:0,referrals:0,detections:0,cohorts:0,candidates:0,incomplete:0});
 useEffect(()=>{(async()=>{const [p,r,d,c]=await Promise.all([
 sb.from("institutional_players").select("id",{count:"exact",head:true}).eq("structure_id",structureId).eq("archived",false),
 sb.from("institutional_player_referrals").select("id",{count:"exact",head:true}).eq("structure_id",structureId).in("status",["new","reviewing"]),
 sb.from("institutional_detection_events").select("id",{count:"exact",head:true}).eq("structure_id",structureId).eq("archived",false),
 sb.from("training_cohorts").select("id,status").eq("institution_id",structureId)
 ]);const ids=(c.data||[]).map((x:any)=>x.id);let candidates=0,incomplete=0;if(ids.length){const q=await sb.from("training_candidates").select("id,administrative_status").in("cohort_id",ids).neq("administrative_status","withdrawn");candidates=q.data?.length||0;incomplete=(q.data||[]).filter((x:any)=>!["complete","registered","in_training","validated"].includes(x.administrative_status)).length;}setK({players:p.count||0,referrals:r.count||0,detections:d.count||0,cohorts:(c.data||[]).filter((x:any)=>x.status!=="archived").length,candidates,incomplete});})()},[structureId,sb]);
 const cards=[
  ["Joueurs suivis",k.players,"Joueurs"],["Signalements à traiter",k.referrals,"Joueurs"],["Détections / sélections",k.detections,"Joueurs"],
  ["Formations",k.cohorts,"Formation des cadres"],["Inscrits",k.candidates,"Formation des cadres"],["Dossiers à compléter",k.incomplete,"Formation des cadres"]
 ] as const;
 return <div className="dash"><div className="kpis">{cards.map(([l,v,t])=><button key={l} onClick={()=>go(t)}><span>{l}</span><b>{v}</b><small>Ouvrir →</small></button>)}</div><section><h3>Centre de pilotage</h3><p>Une donnée saisie dans une fiche joueur ou un dossier de formation alimente les vues opérationnelles. Utilise les raccourcis ci-dessous pour travailler sans ressaisie.</p><div className="quick"><button onClick={()=>go("Joueurs")}>🏀 Suivre les joueurs</button><button onClick={()=>go("Formation des cadres")}>🎓 Gérer les inscrits</button><button onClick={()=>go("Calendrier")}>📅 Voir tout le planning</button><button onClick={()=>go("Documents")}>📄 Générer / retrouver les documents</button><button onClick={()=>go("Communication")}>✉️ Contacter les publics</button></div></section><style jsx>{`.dash{display:grid;gap:12px}.kpis{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.kpis button{display:grid;text-align:left;background:#fff!important;color:#2d2023!important;border:1px solid #eadfd8!important;border-radius:14px!important;padding:14px!important}.kpis span{font-size:.72rem;color:#7f7169}.kpis b{font-size:1.55rem;color:#6b1a2c;margin:4px 0}.kpis small{color:#b37a20;font-weight:900}.dash section{background:#fff;border:1px solid #eadfd8;border-radius:14px;padding:15px}.dash h3{margin:0;color:#4d1420}.dash p{color:#7f7169}.quick{display:grid;grid-template-columns:repeat(5,1fr);gap:7px}.quick button{min-height:58px}@media(max-width:900px){.kpis{grid-template-columns:1fr 1fr}.quick{grid-template-columns:1fr 1fr}}@media(max-width:550px){.kpis,.quick{grid-template-columns:1fr}}`}</style></div>
}
