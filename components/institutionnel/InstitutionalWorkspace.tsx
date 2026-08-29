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
const META:Record<Tab,{icon:string;title:string;subtitle:string}>={
 Dashboard:{icon:"▦",title:"Dashboard",subtitle:"Pilote l’activité de ton Institution depuis un seul espace."},
 Joueurs:{icon:"♙",title:"Joueurs",subtitle:"Effectif, convocations, présences, détection et parcours longitudinal."},
 "Formation des cadres":{icon:"⌂",title:"Formation des cadres",subtitle:"Promotions, inscrits, présence, documents et évaluations."},
 Calendrier:{icon:"▣",title:"Calendrier",subtitle:"Planning de la saison et rendez-vous de la structure."},
 Documents:{icon:"▤",title:"Documents",subtitle:"Documents générés, modèles et dossiers de la structure."},
 Communication:{icon:"✉",title:"Communication",subtitle:"Contacts et communications vers tous les publics."},
 Ressources:{icon:"◇",title:"Ressources",subtitle:"Bibliothèque de modèles et ressources de l’Institution."},
 "Membres & droits":{icon:"♧",title:"Membres & droits",subtitle:"Équipe de la structure, rôles et autorisations."},
 Paramètres:{icon:"⚙",title:"Paramètres",subtitle:"Identité, logo, couleurs et formulaires de l’Institution."},
};
const typeLabel=(type:Structure["structure_type"])=>type==="committee"?"Comité":type==="league"?"Ligue régionale":type==="pole"?"Pôle":type==="federation"?"Fédération":"Institution";

export default function InstitutionalWorkspace({structureId}:{structureId:string}){
 const sb=useMemo(()=>createClient(),[]);const[structure,setStructure]=useState<Structure|null>(null);const[tab,setTabState]=useState<Tab>("Dashboard");const[msg,setMsg]=useState("");const[menuOpen,setMenuOpen]=useState(false);
 const go=(next:string)=>{if(!TABS.includes(next as Tab))return;const value=next as Tab;setTabState(value);setMenuOpen(false);if(typeof window!=="undefined"){const url=new URL(window.location.href);url.searchParams.set("tab",value);window.history.replaceState({},"",url.toString());window.scrollTo({top:0,behavior:"smooth"});}};
 async function reload(){const q=await sb.from("institutional_structures").select("*").eq("id",structureId).single();if(q.error){setMsg(q.error.message);return;}setStructure(q.data as Structure)}
 useEffect(()=>{void reload()},[structureId]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{if(typeof window==="undefined")return;const requested=new URLSearchParams(window.location.search).get("tab");if(requested&&TABS.includes(requested as Tab))setTabState(requested as Tab)},[]);
 if(!structure)return <main className="loadingPage">{msg||"Chargement…"}<style jsx>{`:global(.site-header),:global(.footer){display:none!important}`}</style></main>;
 const primary=structure.document_primary_color||"#6B1A2C",secondary=structure.document_secondary_color||"#D4A24C",meta=META[tab];
 return <main className="institutionShell" style={{"--inst-primary":primary,"--inst-secondary":secondary} as CSSProperties}>
   <aside className={menuOpen?"sidebar open":"sidebar"}>
    <div className="brand"><strong>MYBASKET</strong><span>INSTITUTION</span></div>
    <nav className="sideNav" aria-label="Navigation Institution">{TABS.map(t=><button key={t} className={tab===t?"on":""} onClick={()=>go(t)}><i>{META[t].icon}</i><span>{t}</span></button>)}</nav>
    <div className="sideIdentity"><button className="logoButton" onClick={()=>go("Paramètres")} title="Modifier le logo">{structure.logo_url?<img src={structure.logo_url} alt={structure.name}/>:<span>{(structure.short_name||structure.name).slice(0,2).toUpperCase()}</span>}</button><div><b>{structure.short_name||structure.name}</b><small>{typeLabel(structure.structure_type)}</small></div></div>
    <button className="backAccount" onClick={()=>{location.href="/mon-compte"}}>↪ Mon compte</button>
   </aside>
   {menuOpen&&<button className="overlay" aria-label="Fermer le menu" onClick={()=>setMenuOpen(false)}/>}
   <section className="workspace">
    <header className="topbar"><button className="burger" onClick={()=>setMenuOpen(v=>!v)} aria-label="Menu">☰</button><div className="seasonSelector"><small>Saison</small><b>{structure.season_label||"Non définie"}</b><span>⌄</span></div><div className="topRight"><button onClick={()=>go("Paramètres")} title="Paramètres">⚙</button><span className="userBubble">{(structure.short_name||structure.name).slice(0,2).toUpperCase()}</span></div></header>
    <div className="content">
     <div className="pageTitle"><p>ESPACE {typeLabel(structure.structure_type).toUpperCase()}</p><h1>{meta.title}</h1><span>{meta.subtitle}</span></div>
     {tab==="Dashboard"&&<InstitutionalDashboardConnected structureId={structureId} go={go}/>} 
     {tab==="Joueurs"&&<section className="surface"><InstitutionalPlayersHub structureId={structureId} structureType={structure.structure_type}/><div className="related"><h3>Ressources liées au parcours joueur</h3><InstitutionalResources structureId={structureId} compact categories={["Joueurs","PPF / Pôle","Sélection / Stage"]}/></div></section>}
     {tab==="Formation des cadres"&&<section className="surface"><div className="sectionHead"><div><p>FORMATION DES CADRES</p><h2>Formations, inscrits et dossiers</h2><span>La promotion est la source unique : dossier, cotisation, présence, documents, évaluation et communications.</span></div><Link href="/formation/gestion">Vue plein écran →</Link></div><TrainingManager institutionId={structureId}/></section>}
     {tab==="Calendrier"&&<InstitutionalCalendarHub structureId={structureId} onGoTraining={()=>go("Formation des cadres")} onGoPlayers={()=>go("Joueurs")}/>} 
     {tab==="Documents"&&<InstitutionalDocumentCenter structureId={structureId} go={go}/>} 
     {tab==="Communication"&&<section className="surface"><div className="sectionHead"><div><p>COMMUNICATION</p><h2>Tous les publics au même endroit</h2><span>Annuaire, joueurs et candidats de formation sont récupérés automatiquement.</span></div></div><InstitutionalCommunicationCenter structureId={structureId}/></section>}
     {tab==="Ressources"&&<section className="surface"><div className="sectionHead"><div><p>CENTRE DE RESSOURCES</p><h2>Bibliothèque de modèles Institution</h2><span>Les modèles sont réutilisables ; les documents nominatifs sont générés depuis le joueur ou la formation.</span></div></div><InstitutionalResources structureId={structureId}/></section>}
     {tab==="Membres & droits"&&<section className="surface"><div className="sectionHead"><div><p>COLLABORATION</p><h2>Membres & droits</h2><span>Les droits de la structure commandent aussi les actions Joueurs et Formation des cadres.</span></div></div><InstitutionalMembers structureId={structureId}/></section>}
     {tab==="Paramètres"&&<section className="surface settings"><InstitutionalBrandingSettings structureId={structureId} onSaved={()=>void reload()}/><div className="separator"/><div className="sectionHead"><div><p>FORMULAIRES</p><h2>Formulaires de l’Institution</h2><span>Crée ici les formulaires transversaux. Le signalement joueur public est géré depuis Joueurs → Détection & passations.</span></div></div><InstitutionalFormBuilder structureId={structureId}/></section>}
    </div>
   </section>
   <style jsx>{`
    :global(.site-header),:global(.footer){display:none!important}:global(.app-main){background:#faf8f6!important}.institutionShell{min-height:100vh;background:#faf8f6;color:#2c2023;display:grid;grid-template-columns:238px minmax(0,1fr)}
    .sidebar{position:sticky;top:0;height:100vh;background:#fff;border-right:1px solid #eadfd8;display:flex;flex-direction:column;z-index:50}.brand{height:92px;border-bottom:1px solid #eee5e0;display:grid;align-content:center;padding:0 28px}.brand strong{font-size:1.25rem;color:var(--inst-primary);letter-spacing:-.04em}.brand span{color:var(--inst-secondary);font-size:.67rem;font-weight:1000;letter-spacing:.28em;margin-top:3px}.sideNav{display:grid;gap:6px;padding:18px 14px;overflow:auto}.sideNav button{display:grid;grid-template-columns:28px 1fr;align-items:center;text-align:left;gap:7px;border:0;background:transparent;color:#3b3032;border-radius:7px;padding:10px 11px;font-weight:800;cursor:pointer}.sideNav button i{font-style:normal;color:#7d6e68;text-align:center}.sideNav button.on{background:var(--inst-primary);color:#fff}.sideNav button.on i{color:#fff}.sideIdentity{margin-top:auto;border-top:1px solid #eee5e0;padding:16px 14px 10px;display:flex;gap:10px;align-items:center}.logoButton{width:48px;height:48px;border-radius:12px;border:1px solid #eadfd8;background:#fff;padding:3px;display:grid;place-items:center;overflow:hidden;cursor:pointer}.logoButton img{width:100%;height:100%;object-fit:contain}.logoButton span{width:100%;height:100%;border-radius:9px;background:var(--inst-primary);color:#fff;display:grid;place-items:center;font-weight:1000}.sideIdentity div{display:grid;min-width:0}.sideIdentity b{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-size:.82rem}.sideIdentity small{color:#8b7d77;font-size:.68rem}.backAccount{margin:0 14px 16px;border:1px solid #eadfd8;background:#fff;color:var(--inst-primary);border-radius:8px;padding:10px;font-weight:900;cursor:pointer}.workspace{min-width:0}.topbar{height:72px;background:#fff;border-bottom:1px solid #eadfd8;display:flex;align-items:center;padding:0 28px;position:sticky;top:0;z-index:30}.burger{border:0;background:transparent;font-size:1.35rem;cursor:pointer;color:#403437}.seasonSelector{margin-left:auto;border:1px solid #eadfd8;border-radius:9px;padding:8px 12px;min-width:150px;display:grid;grid-template-columns:1fr auto;column-gap:12px;align-items:center}.seasonSelector small{grid-column:1/-1;color:#8d7e77;font-size:.58rem;text-transform:uppercase;font-weight:900}.seasonSelector b{font-size:.76rem}.seasonSelector span{color:var(--inst-primary)}.topRight{display:flex;align-items:center;gap:12px;margin-left:18px}.topRight button{width:36px;height:36px;border:1px solid #eadfd8;background:#fff;border-radius:50%;cursor:pointer}.userBubble{width:38px;height:38px;border-radius:50%;background:var(--inst-primary);color:#fff;display:grid;place-items:center;font-size:.72rem;font-weight:1000}.content{max-width:1380px;margin:0 auto;padding:30px 34px 70px}.pageTitle{margin-bottom:22px}.pageTitle p,.sectionHead p{margin:0;color:var(--inst-secondary);font-size:.66rem;font-weight:1000;letter-spacing:.13em}.pageTitle h1{margin:5px 0 4px;color:var(--inst-primary);font-size:2rem}.pageTitle span,.sectionHead span{color:#766a66;font-size:.8rem}.surface{background:#fff;border:1px solid #eadfd8;border-radius:12px;padding:16px}.sectionHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}.sectionHead h2{margin:3px 0;color:var(--inst-primary)}.sectionHead a{background:var(--inst-primary);color:#fff;text-decoration:none;border-radius:8px;padding:8px 10px;font-weight:900}.related{margin-top:16px;padding-top:14px;border-top:1px solid #eee4df}.related h3{color:var(--inst-primary)}.separator{height:1px;background:#eadfd8;margin:20px 0}.overlay{display:none}.loadingPage{padding:30px}
    @media(max-width:1000px){.institutionShell{grid-template-columns:1fr}.sidebar{position:fixed;left:-250px;top:0;width:238px;transition:left .2s ease;box-shadow:0 20px 50px rgba(0,0,0,.15)}.sidebar.open{left:0}.overlay{display:block;position:fixed;inset:0;border:0;background:rgba(20,12,14,.35);z-index:40}.content{padding:22px 16px 50px}.topbar{padding:0 16px}.pageTitle h1{font-size:1.65rem}}
    @media(max-width:600px){.seasonSelector{min-width:0}.seasonSelector small{display:none}.content{padding:18px 10px 40px}.surface{padding:10px}}
    @media print{.sidebar,.topbar{display:none!important}.institutionShell{display:block}.content{padding:0}.surface{border:0}}
   `}</style>
 </main>
}
