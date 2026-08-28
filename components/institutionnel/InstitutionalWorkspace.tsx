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

type Structure={
 id:string;
 structure_type:"committee"|"league"|"federation"|"pole";
 name:string;
 short_name:string|null;
 season_label:string|null;
 city:string|null;
 email:string|null;
 logo_url?:string|null;
 document_primary_color?:string|null;
 document_secondary_color?:string|null
};

const TABS=[
 {key:"Dashboard",label:"Dashboard",icon:"📊"},
 {key:"Joueurs",label:"Joueurs",icon:"🏀"},
 {key:"Formation des cadres",label:"Formation des cadres",icon:"🎓"},
 {key:"Calendrier",label:"Calendrier",icon:"📅"},
 {key:"Documents",label:"Documents",icon:"📁"},
 {key:"Communication",label:"Communication",icon:"💬"},
 {key:"Ressources",label:"Ressources",icon:"📚"},
 {key:"Membres & droits",label:"Membres & droits",icon:"👥"},
 {key:"Paramètres",label:"Paramètres",icon:"⚙️"},
] as const;

type Tab=(typeof TABS)[number]["key"];

export default function InstitutionalWorkspace({structureId}:{structureId:string}){
 const sb=useMemo(()=>createClient(),[]);
 const[structure,setStructure]=useState<Structure|null>(null);
 const[tab,setTabState]=useState<Tab>("Dashboard");
 const[msg,setMsg]=useState("");
 const[mobileMenu,setMobileMenu]=useState(false);

 const go=(next:string)=>{
   if(!TABS.some(t=>t.key===next))return;
   const value=next as Tab;
   setTabState(value);
   setMobileMenu(false);
   if(typeof window!=="undefined"){
     const url=new URL(window.location.href);
     url.searchParams.set("tab",value);
     window.history.replaceState({},"",url.toString());
     window.scrollTo({top:0,behavior:"smooth"});
   }
 };

 async function reload(){
   const q=await sb.from("institutional_structures").select("*").eq("id",structureId).single();
   if(q.error){setMsg(q.error.message);return;}
   setStructure(q.data as Structure)
 }

 useEffect(()=>{void reload()},[structureId]); // eslint-disable-line react-hooks/exhaustive-deps
 useEffect(()=>{
   if(typeof window==="undefined")return;
   const requested=new URLSearchParams(window.location.search).get("tab");
   if(requested&&TABS.some(t=>t.key===requested))setTabState(requested as Tab)
 },[]);

 if(!structure)return <main className="loading">{msg||"Chargement…"}</main>;

 const primary=structure.document_primary_color||"#6B1A2C";
 const secondary=structure.document_secondary_color||"#D4A24C";
 const typeLabel={
   committee:"COMITÉ",
   league:"LIGUE",
   federation:"FÉDÉRATION",
   pole:"PÔLE"
 }[structure.structure_type];
 const current=TABS.find(t=>t.key===tab)||TABS[0];

 return (
  <div
    className="institutionApp"
    style={{"--inst-primary":primary,"--inst-secondary":secondary} as CSSProperties}
  >
    <aside className={mobileMenu?"sidebar open":"sidebar"}>
      <div className="brand">
        <div className="brandLogo">{structure.logo_url?<img src={structure.logo_url} alt=""/>:<span>🏀</span>}</div>
        <div className="brandTitle">MYBASKET</div>
        <div className="brandSub">INSTITUTION</div>
      </div>

      <div className="context">
        <small>{typeLabel}</small>
        <b>{structure.short_name||structure.name}</b>
      </div>

      <nav>
        {TABS.map(item=>
          <button
            key={item.key}
            className={tab===item.key?"active":""}
            onClick={()=>go(item.key)}
          >
            <i>{item.icon}</i>
            <span>{item.label}</span>
          </button>
        )}
      </nav>

      <div className="sideBottom">
        <div className="profileDot">MI</div>
        <div>
          <strong>{structure.short_name||structure.name}</strong>
          <span>{typeLabel}</span>
        </div>
      </div>
    </aside>

    <div className="workspace">
      <header className="topbar">
        <button className="menuBtn" onClick={()=>setMobileMenu(v=>!v)}>☰</button>
        <div className="topIdentity">
          <small>{typeLabel} · {structure.name.toUpperCase()}</small>
          <strong>{current.label}</strong>
        </div>
        <div className="topActions">
          <div className="season">{structure.season_label||"Saison non définie"}⌄</div>
          <button className="bell" aria-label="Notifications">♧</button>
          <div className="account">MI</div>
        </div>
      </header>

      <main className="page">
        <div className="pageTitle">
          <div>
            <p>{typeLabel}</p>
            <h1>{current.label}</h1>
            <span>
              {structure.name}
              {structure.city?` · ${structure.city}`:""}
            </span>
          </div>
          {tab!=="Dashboard"&&(
            <button className="backDashboard" onClick={()=>go("Dashboard")}>← Dashboard</button>
          )}
        </div>

        {tab==="Dashboard"&&<InstitutionalDashboardConnected structureId={structureId} go={go}/>}
        {tab==="Joueurs"&&
          <section className="surface">
            <InstitutionalPlayersHub structureId={structureId} structureType={structure.structure_type}/>
            <div className="related">
              <h3>Ressources liées au parcours joueur</h3>
              <InstitutionalResources structureId={structureId} compact categories={["Joueurs","PPF / Pôle","Sélection / Stage"]}/>
            </div>
          </section>
        }
        {tab==="Formation des cadres"&&
          <section className="surface">
            <div className="sectionHead">
              <div>
                <p>FORMATION DES CADRES</p>
                <h2>Formations, inscrits et dossiers</h2>
                <span>La promotion est la source unique : dossier, cotisation, présence, documents, évaluation et communications.</span>
              </div>
              <Link href="/formation/gestion">Vue plein écran →</Link>
            </div>
            <TrainingManager institutionId={structureId}/>
          </section>
        }
        {tab==="Calendrier"&&<InstitutionalCalendarHub structureId={structureId} onGoTraining={()=>go("Formation des cadres")} onGoPlayers={()=>go("Joueurs")}/>}
        {tab==="Documents"&&<InstitutionalDocumentCenter structureId={structureId} go={go}/>}
        {tab==="Communication"&&
          <section className="surface">
            <div className="sectionHead">
              <div>
                <p>COMMUNICATION</p>
                <h2>Tous les publics au même endroit</h2>
                <span>Annuaire, joueurs et candidats de formation sont récupérés automatiquement.</span>
              </div>
            </div>
            <InstitutionalCommunicationCenter structureId={structureId}/>
          </section>
        }
        {tab==="Ressources"&&
          <section className="surface">
            <div className="sectionHead">
              <div>
                <p>CENTRE DE RESSOURCES</p>
                <h2>Bibliothèque de modèles Institution</h2>
                <span>Les modèles sont réutilisables ; les documents nominatifs sont générés depuis le joueur ou la formation.</span>
              </div>
            </div>
            <InstitutionalResources structureId={structureId}/>
          </section>
        }
        {tab==="Membres & droits"&&
          <section className="surface">
            <div className="sectionHead">
              <div>
                <p>COLLABORATION</p>
                <h2>Membres & droits</h2>
                <span>Les droits de la structure commandent aussi les actions Joueurs et Formation des cadres.</span>
              </div>
            </div>
            <InstitutionalMembers structureId={structureId}/>
          </section>
        }
        {tab==="Paramètres"&&
          <section className="surface settings">
            <InstitutionalBrandingSettings structureId={structureId} onSaved={()=>void reload()}/>
            <div className="separator"/>
            <div className="sectionHead">
              <div>
                <p>FORMULAIRES</p>
                <h2>Formulaires de l’Institution</h2>
                <span>Crée ici les formulaires transversaux. Le signalement joueur public est géré depuis Joueurs → Détection & passations.</span>
              </div>
            </div>
            <InstitutionalFormBuilder structureId={structureId}/>
          </section>
        }
      </main>
    </div>

    {mobileMenu&&<button className="overlay" onClick={()=>setMobileMenu(false)} aria-label="Fermer le menu"/>}

    <style jsx>{`
      :global(body){background:#f8f5f1}
      .institutionApp{
        min-height:100vh;background:#f8f5f1;color:#2d2528;
        display:grid;grid-template-columns:278px minmax(0,1fr);
        font-family:Roboto,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif
      }
      .sidebar{
        background:#fff;color:#2b2426;min-height:100vh;position:sticky;top:0;height:100vh;
        display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;padding:28px 18px;
        z-index:50;overflow-y:auto;border-right:1px solid #eadfd8;box-shadow:8px 0 28px rgba(56,31,23,.035)
      }
      .brand{text-align:center;padding-bottom:20px;border-bottom:1px solid rgba(107,26,44,.10)}
      .brandLogo{width:58px;height:58px;margin:0 auto 5px;border-radius:50%;display:grid;place-items:center;overflow:hidden;background:transparent;color:var(--inst-primary);font-weight:1000}
      .brandLogo img{width:100%;height:100%;object-fit:contain;padding:3px}
      .brandLogo span{font-size:38px}
      .brandTitle{font-size:28px;font-weight:1000;color:var(--inst-primary);letter-spacing:-.03em;line-height:1}.brandSub{color:var(--inst-secondary);letter-spacing:5px;font-weight:900;font-size:12px;margin-top:6px}
      .context{padding:18px 10px 10px}
      .context small{display:block;color:#aa989e;font-size:.59rem;font-weight:1000;letter-spacing:.12em}
      .context b{display:block;color:#4d1420;font-size:.82rem;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      nav{display:flex;flex-direction:column;gap:6px;overflow:auto;padding:4px 4px 0 0}
      nav button{
        width:100%;min-width:0;border:0;background:transparent;color:#42393c;border-radius:12px;
        min-height:42px;padding:0 14px;display:flex;gap:12px;
        align-items:center;text-align:left;font-size:14px;font-weight:800;cursor:pointer;transition:.18s ease
      }
      nav button:hover{background:#fbf4f0;color:var(--inst-primary)}
      nav button i{font-style:normal;text-align:center;color:inherit;font-size:16px;width:18px;flex:0 0 18px}
      nav button.active{background:linear-gradient(135deg,#8b1232,var(--inst-primary));color:#fff;box-shadow:0 12px 24px rgba(107,26,44,.18)}
      nav button.active i{color:var(--inst-secondary)}
      .sideBottom{border-top:1px solid #eee5df;padding:16px 7px 0;display:flex;gap:10px;align-items:center}
      .profileDot,.account{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--inst-primary);color:#fff;font-weight:1000;flex:0 0 auto}
      .sideBottom strong,.sideBottom span{display:block}.sideBottom strong{font-size:.77rem;color:#4d1420}.sideBottom span{font-size:.68rem;color:#9c8b90;margin-top:3px}
      .workspace{min-width:0}
      .topbar{
        height:72px;background:#fff;border-bottom:1px solid #e7e0d9;display:flex;align-items:center;gap:16px;
        padding:0 27px;position:sticky;top:0;z-index:30
      }
      .menuBtn{border:0;background:transparent;font-size:1.28rem;cursor:pointer;color:#55484c}
      .topIdentity{min-width:0;flex:1}.topIdentity small{display:block;color:#a99098;font-size:.58rem;font-weight:1000;letter-spacing:.1em}
      .topIdentity strong{display:block;color:#4d1420;font-size:1.02rem;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .topActions{display:flex;align-items:center;gap:11px}
      .season{border:1px solid #e7e0d9;border-radius:9px;padding:9px 13px;font-size:.73rem;background:#fff;white-space:nowrap}
      .bell{border:0;background:transparent;font-size:1.08rem;color:var(--inst-primary)}
      .page{padding:25px 28px 50px;min-width:0;max-width:1600px;margin:0 auto;width:100%;color:#302328}
      .pageTitle{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:18px}
      .pageTitle p,.sectionHead p{margin:0;color:var(--inst-secondary);font-size:.64rem;font-weight:1000;letter-spacing:.11em}
      .pageTitle h1{margin:3px 0;color:#4d1420;font-size:1.75rem}.pageTitle span{font-size:.74rem;color:#8e7e83}
      .backDashboard{border:1px solid #e6d9d3;background:#fff;color:var(--inst-primary);border-radius:8px;padding:8px 10px;font-weight:900;cursor:pointer}
      .surface{background:#fff;border:1px solid #eadfd8;border-radius:14px;padding:16px;box-shadow:0 5px 20px rgba(57,34,25,.035)}
      .sectionHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;margin-bottom:12px}
      .sectionHead h2{margin:3px 0;color:#4d1420}.sectionHead span{font-size:.76rem;opacity:.82}
      .sectionHead a{background:var(--inst-primary);color:#fff;text-decoration:none;border-radius:8px;padding:8px 10px;font-weight:900}
      .related{margin-top:16px;padding-top:14px;border-top:1px solid #eee4df}.related h3{color:#4d1420}.separator{height:1px;background:#eadfd8;margin:20px 0}
      .overlay{display:none}.loading{padding:40px}
      @media(max-width:980px){
        .institutionApp{grid-template-columns:1fr}.sidebar{position:fixed;left:0;top:0;width:278px;transform:translateX(-105%);transition:.2s}
        .sidebar.open{transform:translateX(0)}.overlay{display:block;position:fixed;inset:0;background:rgba(0,0,0,.38);z-index:40;border:0}
        .topbar{padding:0 16px}.page{padding:20px 16px 36px}
      }
      @media(max-width:650px){.season{display:none}.topbar{height:62px}.page{padding:16px 10px 28px}.account{width:35px;height:35px}}
      @media print{.sidebar,.topbar,.backDashboard{display:none!important}.institutionApp{display:block}.page{padding:0}.surface{box-shadow:none}}
    `}</style>
  </div>
 )
}
