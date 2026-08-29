"use client";

import Link from "next/link";
import {useEffect,useMemo,useState} from "react";
import type {CSSProperties} from "react";
import {createClient} from "@/lib/supabase/client";
import TrainingManager from "@/components/formation/TrainingManager";
import InstitutionalPlayersHub from "@/components/institutionnel/InstitutionalPlayersHub";
import InstitutionalDashboardConnected from "@/components/institutionnel/InstitutionalDashboardConnected";
import InstitutionalCalendarHub from "@/components/institutionnel/InstitutionalCalendarHub";
import InstitutionalDocumentCenter from "@/components/institutionnel/InstitutionalDocumentCenter";
import InstitutionalCommunicationCenter from "@/components/institutionnel/InstitutionalCommunicationCenter";
import InstitutionalResources from "@/components/institutionnel/InstitutionalResources";
import InstitutionalMembers from "@/components/institutionnel/InstitutionalMembers";
import InstitutionalFormBuilder from "@/components/institutionnel/InstitutionalFormBuilder";
import InstitutionalBrandingSettings from "@/components/institutionnel/InstitutionalBrandingSettings";

type Structure={id:string;structure_type:"committee"|"league"|"federation"|"pole";name:string;short_name:string|null;season_label:string|null;city:string|null;email:string|null;logo_url?:string|null;document_primary_color?:string|null;document_secondary_color?:string|null};
const TABS=["Dashboard","Joueurs","Formation des cadres","Calendrier","Documents","Communication","Ressources","Membres & droits","Paramètres"] as const;
type Tab=(typeof TABS)[number];

export default function InstitutionalWorkspace({structureId}:{structureId:string}){
 const sb=useMemo(()=>createClient(),[]);const[structure,setStructure]=useState<Structure|null>(null);const[tab,setTabState]=useState<Tab>("Dashboard");const[msg,setMsg]=useState("");const[logoBusy,setLogoBusy]=useState(false);
 const go=(next:string)=>{if(!TABS.includes(next as Tab))return;const value=next as Tab;setTabState(value);if(typeof window!=="undefined"){const url=new URL(window.location.href);url.searchParams.set("tab",value);window.history.replaceState({},"",url.toString());window.scrollTo({top:0,behavior:"smooth"});}};
 async function reload(){const q=await sb.from("institutional_structures").select("*").eq("id",structureId).single();if(q.error){setMsg(q.error.message);return;}setStructure(q.data as Structure)}
 async function uploadStructureLogo(file:File){if(!file)return;setLogoBusy(true);const path=`${structureId}/structure/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;const up=await sb.storage.from("institutional-assets").upload(path,file,{upsert:false});if(up.error){setLogoBusy(false);return alert(up.error.message)}const{data}=sb.storage.from("institutional-assets").getPublicUrl(path);const q=await sb.from("institutional_structures").update({logo_url:data.publicUrl}).eq("id",structureId);setLogoBusy(false);if(q.error)return alert(q.error.message);await reload()}
 useEffect(()=>{void reload()},[structureId]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(typeof window==="undefined")return;const requested=new URLSearchParams(window.location.search).get("tab");if(requested&&TABS.includes(requested as Tab))setTabState(requested as Tab)},[]);
 if(!structure)return <main className="page">{msg||"Chargement…"}</main>;
 const primary=structure.document_primary_color||"#6B1A2C",secondary=structure.document_secondary_color||"#D4A24C";
 return <main className="page" style={{"--inst-primary":primary,"--inst-secondary":secondary} as CSSProperties}>
  <section className="hero"><div className="identity"><label className="heroLogo" title="Modifier le logo de l’Institution">{structure.logo_url?<img src={structure.logo_url} alt={`Logo ${structure.name}`}/>:<span>{structure.short_name?.slice(0,3).toUpperCase()||"LOGO"}</span>}<input hidden type="file" accept="image/*" disabled={logoBusy} onChange={e=>e.target.files?.[0]&&void uploadStructureLogo(e.target.files[0])}/></label><div><b className="kindBadge">{structure.structure_type==="committee"?"COMITÉ":structure.structure_type==="league"?"LIGUE RÉGIONALE":structure.structure_type==="federation"?"FÉDÉRATION":"PÔLE"}</b><h1>{structure.name}</h1><span>{structure.season_label||"Saison non définie"}{structure.city?` · ${structure.city}`:""} · cliquez sur le logo pour le modifier</span></div></div><div className="heroActions"><button onClick={()=>go("Joueurs")}>🏀 Joueurs</button><button onClick={()=>go("Formation des cadres")}>🎓 Formations</button></div></section>
  <nav className="tabs" aria-label="Navigation Institution">{TABS.map(t=><button key={t} className={tab===t?"on":""} onClick={()=>go(t)}>{t}</button>)}</nav>

  {tab==="Dashboard"&&<InstitutionalDashboardConnected structureId={structureId} go={go}/>} 
  {tab==="Joueurs"&&<section className="surface"><InstitutionalPlayersHub structureId={structureId} structureType={structure.structure_type}/><div className="related"><h3>Ressources liées au parcours joueur</h3><InstitutionalResources structureId={structureId} compact categories={["Joueurs","PPF / Pôle","Sélection / Stage"]}/></div></section>}
  {tab==="Formation des cadres"&&<section className="surface"><div className="sectionHead"><div><p>FORMATION DES CADRES</p><h2>Formations, inscrits et dossiers</h2><span>La promotion est la source unique : dossier, cotisation, présence, documents, évaluation et communications.</span></div><Link href="/formation/gestion">Vue plein écran →</Link></div><TrainingManager institutionId={structureId}/></section>}
  {tab==="Calendrier"&&<InstitutionalCalendarHub structureId={structureId} onGoTraining={()=>go("Formation des cadres")} onGoPlayers={()=>go("Joueurs")}/>} 
  {tab==="Documents"&&<InstitutionalDocumentCenter structureId={structureId} go={go}/>} 
  {tab==="Communication"&&<section className="surface"><div className="sectionHead"><div><p>COMMUNICATION</p><h2>Tous les publics au même endroit</h2><span>Annuaire, joueurs et candidats de formation sont récupérés automatiquement.</span></div></div><InstitutionalCommunicationCenter structureId={structureId}/></section>}
  {tab==="Ressources"&&<section className="surface"><div className="sectionHead"><div><p>CENTRE DE RESSOURCES</p><h2>Bibliothèque de modèles Institution</h2><span>Les modèles sont réutilisables ; les documents nominatifs sont générés depuis le joueur ou la formation.</span></div></div><InstitutionalResources structureId={structureId}/></section>}
  {tab==="Membres & droits"&&<section className="surface"><div className="sectionHead"><div><p>COLLABORATION</p><h2>Membres & droits</h2><span>Les droits de la structure commandent aussi les actions Joueurs et Formation des cadres.</span></div></div><InstitutionalMembers structureId={structureId}/></section>}
  {tab==="Paramètres"&&<section className="surface settings"><InstitutionalBrandingSettings structureId={structureId} onSaved={()=>void reload()}/><div className="separator"/><div className="sectionHead"><div><p>FORMULAIRES</p><h2>Formulaires de l’Institution</h2><span>Crée ici les formulaires transversaux. Le signalement joueur public est géré depuis Joueurs → Détection & passations.</span></div></div><InstitutionalFormBuilder structureId={structureId}/></section>}

  <style jsx>{`
   :global(body){background:#f6f2ee}.page{max-width:1480px;margin:auto;padding:22px 16px 60px;color:#302328}.hero{display:flex;justify-content:space-between;gap:14px;align-items:center;background:linear-gradient(135deg,var(--inst-primary),#301017);color:#fff;border-radius:22px;padding:18px 20px}.identity{display:flex;gap:16px;align-items:center}.heroLogo{width:86px;height:86px;border-radius:18px;background:#fff;display:grid;place-items:center;padding:6px;overflow:hidden;cursor:pointer;flex:0 0 auto}.heroLogo img{width:100%;height:100%;object-fit:contain}.heroLogo span{color:var(--inst-primary);font-size:.72rem;font-weight:1000}.kindBadge{display:inline-flex;background:rgba(255,255,255,.14);border:1px solid rgba(255,255,255,.25);border-radius:999px;padding:5px 9px;font-size:.76rem;letter-spacing:.08em}.hero p,.sectionHead p{margin:0;color:var(--inst-secondary);font-size:.67rem;font-weight:1000;letter-spacing:.11em}.hero h1{margin:3px 0}.hero span,.sectionHead span{font-size:.76rem;opacity:.82}.heroActions{display:flex;gap:6px}.heroActions button,.surface button{border:0;border-radius:8px;padding:8px 10px;font-weight:900;background:var(--inst-primary);color:#fff;cursor:pointer}.heroActions button{background:#fff;color:var(--inst-primary)}.tabs{display:flex;gap:5px;overflow:auto;padding:9px 0}.tabs button{white-space:nowrap;border:1px solid #ded2cc;background:#fff;color:var(--inst-primary);border-radius:999px;padding:8px 11px;font-weight:900;cursor:pointer}.tabs .on{background:var(--inst-primary);color:#fff;border-color:var(--inst-primary)}.surface{background:#fff;border:1px solid #eadfd8;border-radius:15px;padding:14px}.sectionHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.sectionHead h2{margin:3px 0;color:#4d1420}.sectionHead a{background:var(--inst-primary);color:#fff;text-decoration:none;border-radius:8px;padding:8px 10px;font-weight:900}.related{margin-top:16px;padding-top:14px;border-top:1px solid #eee4df}.related h3{color:#4d1420}.separator{height:1px;background:#eadfd8;margin:20px 0}@media(max-width:760px){.hero,.sectionHead{align-items:flex-start;flex-direction:column}.heroActions{width:100%;flex-wrap:wrap}.heroLogo{width:64px;height:64px;border-radius:14px}.page{padding:12px 10px 40px}}@media print{.tabs,.heroActions{display:none!important}.page{padding:0}.hero,.surface{box-shadow:none;border:1px solid #ccc}.hero{background:#fff;color:#000}}
  `}</style>
 </main>
}
