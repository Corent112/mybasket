"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import CreneauxPlanner from "@/components/club/CreneauxPlanner";
import ClubTeamsActiveSection from "@/components/club/ClubTeamsActiveSection";
import ClubCoachesSection from "@/components/club/ClubCoachesSection";
import ClubCalendarEngineSection from "@/components/club/ClubCalendarEngineSection";
import ClubConvocationsSection from "@/components/club/ClubConvocationsSection";
import ClubCotisationsSection from "@/components/club/ClubCotisationsSection";
import ClubRelancesSection from "@/components/club/ClubRelancesSection";
import ClubDriveSection from "@/components/club/ClubDriveSection";
import ClubCommunicationProSection from "@/components/club/ClubCommunicationProSection";
import ClubMailingListsSection from "@/components/club/ClubMailingListsSection";
import ClubPerformanceProSection from "@/components/club/ClubPerformanceProSection";
import ClubSettingsProSection from "@/components/club/ClubSettingsProSection";
import ClubFinanceProSection from "@/components/club/ClubFinanceProSection";
import ClubAuditExportsSection from "@/components/club/ClubAuditExportsSection";
import ClubDashboardOverviewV2 from "@/components/club/ClubDashboardOverviewV2";
import ClubSectionPolish from "@/components/club/ClubSectionPolish";

type Props = { clubId:string; clubName?:string|null; logoUrl?:string|null };

const TABS = [
  { key:"intelligence", label:"Dashboard", icon:"⌂" }, { key:"equipes", label:"Équipes", icon:"◉" },
  { key:"coachs", label:"Coachs", icon:"♙" }, { key:"planning", label:"Créneaux", icon:"▣" },
  { key:"calendrier", label:"Calendrier", icon:"▦" }, { key:"convocations", label:"Convocations", icon:"♧" },
  { key:"drive", label:"Documents", icon:"▤" }, { key:"communication", label:"Communication", icon:"✉" },
  { key:"mailing", label:"Mailings", icon:"✉" }, { key:"cotisations", label:"Cotisations", icon:"▧" },
  { key:"relances", label:"Relances", icon:"!" }, { key:"finance", label:"Finance", icon:"▥" },
  { key:"performance", label:"Performance", icon:"↗" }, { key:"audit", label:"Exports", icon:"⇧" },
  { key:"parametres", label:"Paramètres", icon:"⚙" },
] as const;

type TabKey = typeof TABS[number]["key"];
const STORAGE_KEY = "mybasket_club_management_active_tab";

export default function ClubManagementPro({ clubId, clubName, logoUrl }: Props) {
  const [activeTab,setActiveTab] = useState<TabKey>("intelligence");
  const [mobileMenu,setMobileMenu] = useState(false);
  const [colors,setColors] = useState({ primary:"#111111", secondary:"#D4A24C" });
  const [season,setSeason] = useState("2026-2027");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as TabKey | null;
    if(saved && TABS.some((t)=>t.key===saved)) setActiveTab(saved);
    const supabase = createClient();
    void Promise.all([
      supabase.from("clubs").select("primary_color,secondary_color").eq("id",clubId).maybeSingle(),
      supabase.from("club_settings").select("season_label").eq("club_id",clubId).maybeSingle(),
    ]).then(([clubRes, settingsRes])=>{
      setColors({ primary:clubRes.data?.primary_color || "#111111", secondary:clubRes.data?.secondary_color || "#D4A24C" });
      if(settingsRes.data?.season_label) setSeason(settingsRes.data.season_label);
    });
  },[clubId]);

  function changeTab(key:TabKey){ setActiveTab(key); setMobileMenu(false); window.localStorage.setItem(STORAGE_KEY,key); window.scrollTo({top:0,behavior:"smooth"}); }
  const current = useMemo(()=>TABS.find((t)=>t.key===activeTab)||TABS[0],[activeTab]);
  const name = clubName || "Mon club";

  return (
    <div className="clubApp" style={{["--club-primary" as any]:colors.primary,["--club-secondary" as any]:colors.secondary}}>
      <ClubSectionPolish />
      <aside className={mobileMenu?"sidebar open":"sidebar"}>
        <div className="brand"><div className="brandLogo">{logoUrl?<img src={logoUrl} alt=""/>:<span>{name.slice(0,2).toUpperCase()}</span>}</div><strong>{name}</strong></div>
        <nav>{TABS.map((t)=><button key={t.key} className={activeTab===t.key?"active":""} onClick={()=>changeTab(t.key)}><i>{t.icon}</i><span>{t.label}</span></button>)}</nav>
        <div className="sideBottom"><div className="profileDot">MB</div><div><strong>MyBasket Club</strong><span>{name}</span></div></div>
      </aside>

      <div className="workspace">
        <header className="topbar"><button className="menuBtn" onClick={()=>setMobileMenu(v=>!v)}>☰</button><div className="topIdentity"><div className="miniLogo">{logoUrl?<img src={logoUrl} alt=""/>:"MB"}</div><strong>{name}</strong><span>• ESPACE CLUB</span></div><div className="topActions"><div className="season">▣ <b>Saison {season}</b></div><button className="bell">♧</button><div className="account">MB</div></div></header>
        <main className="clubContent">
          {activeTab!=="intelligence" && <div className="pageTitle"><div><button className="backDashboard" onClick={()=>changeTab("intelligence")}>← Dashboard</button><h1>{current.label}</h1></div><span>{name}</span></div>}
          {activeTab==="intelligence" && <ClubDashboardOverviewV2 clubId={clubId} clubName={name} logoUrl={logoUrl} onNavigate={(tab)=>changeTab(tab)} />}
          {activeTab==="equipes" && <ClubTeamsActiveSection clubId={clubId}/>} {activeTab==="coachs" && <ClubCoachesSection clubId={clubId} clubName={name}/>} {activeTab==="planning" && <CreneauxPlanner clubId={clubId}/>} {activeTab==="calendrier" && <ClubCalendarEngineSection clubId={clubId}/>} {activeTab==="convocations" && <ClubConvocationsSection clubId={clubId}/>} {activeTab==="drive" && <ClubDriveSection clubId={clubId}/>} {activeTab==="communication" && <ClubCommunicationProSection clubId={clubId} clubName={name}/>} {activeTab==="mailing" && <ClubMailingListsSection clubId={clubId}/>} {activeTab==="cotisations" && <ClubCotisationsSection clubId={clubId}/>} {activeTab==="relances" && <ClubRelancesSection clubId={clubId} clubName={name}/>} {activeTab==="finance" && <ClubFinanceProSection clubId={clubId}/>} {activeTab==="performance" && <ClubPerformanceProSection clubId={clubId}/>} {activeTab==="audit" && <ClubAuditExportsSection clubId={clubId}/>} {activeTab==="parametres" && <ClubSettingsProSection clubId={clubId}/>} 
        </main>
      </div>
      {mobileMenu&&<button className="overlay" onClick={()=>setMobileMenu(false)}/>} 

      <style jsx>{`
        .clubApp{min-height:100vh;background:#f7f5f2;color:#151515;font-family:Roboto,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;display:grid;grid-template-columns:250px minmax(0,1fr)}.sidebar{background:#090909;color:#fff;min-height:100vh;position:sticky;top:0;height:100vh;display:grid;grid-template-rows:auto minmax(0,1fr) auto;padding:22px 12px;z-index:50;overflow-y:auto}.brand{display:flex;gap:12px;align-items:center;padding:0 10px 22px}.brandLogo{width:58px;height:58px;border-radius:50%;border:2px solid var(--club-secondary);display:grid;place-items:center;overflow:hidden;color:var(--club-secondary);font-weight:1000;flex:0 0 auto}.brandLogo img{width:100%;height:100%;object-fit:contain;padding:3px}.brand strong{font-size:1.02rem;line-height:1.05;text-transform:uppercase;overflow-wrap:anywhere}nav{display:grid;align-content:start;gap:4px}nav button{width:100%;min-width:0;border:0;background:transparent;color:#f5f5f5;border-radius:8px;padding:11px 12px;display:grid;grid-template-columns:25px minmax(0,1fr);gap:9px;align-items:center;text-align:left;font-weight:850;cursor:pointer}nav button i{font-style:normal;text-align:center}nav button span{min-width:0;overflow:hidden;text-overflow:ellipsis}nav button.active{background:linear-gradient(135deg,var(--club-secondary),color-mix(in srgb,var(--club-secondary) 75%,#9f6400));color:#fff}.sideBottom{border-top:1px solid #313131;padding:18px 8px 0;display:flex;gap:10px;align-items:center}.profileDot,.account{width:42px;height:42px;border-radius:50%;border:1px solid var(--club-secondary);display:grid;place-items:center;color:var(--club-secondary);font-weight:1000;flex:0 0 auto}.sideBottom strong,.sideBottom span{display:block}.sideBottom span{font-size:.72rem;color:#bbb;margin-top:3px}.workspace{min-width:0}.topbar{height:72px;background:#fff;border-bottom:1px solid #e7e0d9;display:flex;align-items:center;gap:18px;padding:0 28px;position:sticky;top:0;z-index:30}.menuBtn{border:0;background:transparent;font-size:1.3rem;cursor:pointer}.topIdentity{display:flex;align-items:center;gap:10px;min-width:0;flex:1}.miniLogo{width:34px;height:34px;border-radius:50%;background:var(--club-primary);color:var(--club-secondary);display:grid;place-items:center;overflow:hidden;font-weight:1000}.miniLogo img{width:100%;height:100%;object-fit:contain}.topIdentity strong{font-size:1.02rem;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.topIdentity span{color:var(--club-secondary);font-size:.73rem;font-weight:1000;white-space:nowrap}.topActions{display:flex;align-items:center;gap:12px}.season{border:1px solid #e7e0d9;border-radius:10px;padding:10px 14px;font-size:.78rem;background:#fff;white-space:nowrap}.bell{border:0;background:transparent;font-size:1.1rem}.account{background:#111}.clubContent{padding:25px 28px 40px;min-width:0;max-width:1600px;margin:0 auto;width:100%}.pageTitle{display:flex;justify-content:space-between;align-items:end;gap:12px;margin-bottom:16px}.pageTitle h1{margin:4px 0 0;font-size:1.65rem}.pageTitle>span{color:#777;font-size:.78rem}.backDashboard{border:0;background:transparent;color:var(--club-secondary);font-weight:900;padding:0;cursor:pointer}.overlay{display:none}@media(max-width:980px){.clubApp{grid-template-columns:1fr}.sidebar{position:fixed;left:0;top:0;width:260px;transform:translateX(-105%);transition:.2s}.sidebar.open{transform:translateX(0)}.overlay{display:block;position:fixed;inset:0;background:rgba(0,0,0,.38);z-index:40;border:0}.topbar{padding:0 16px}.clubContent{padding:20px 16px 32px}}@media(max-width:650px){.topIdentity span,.season{display:none}.topbar{height:62px}.clubContent{padding:16px 10px 28px}.account{width:36px;height:36px}}
      `}</style>
      <style jsx global>{`
        .clubApp *{box-sizing:border-box}.clubApp input,.clubApp select,.clubApp textarea{max-width:100%;min-width:0;width:100%}.clubApp img{max-width:100%}.clubContent>section,.clubContent>div{min-width:0}.clubContent .teamsActive,.clubContent .coaches,.clubContent .engine,.clubContent .communication,.clubContent .mailing,.clubContent .settings,.clubContent .finance,.clubContent .convocations,.clubContent .cotisations,.clubContent .performance{border:1px solid #e7e0d9!important;border-radius:16px!important;background:#fff!important;box-shadow:0 6px 24px rgba(0,0,0,.035)!important;overflow:hidden!important;min-width:0!important}.clubContent .top{background:#fff!important;border-bottom:1px solid #ece6df!important;padding:18px 20px!important}.clubContent .top p{color:var(--club-secondary)!important}.clubContent .top h2{color:#171717!important;font-family:Roboto,system-ui,sans-serif!important;font-weight:950!important}.clubContent .layout,.clubContent .main,.clubContent .calendar,.clubContent .panel,.clubContent .templates,.clubContent .form,.clubContent .side{min-width:0!important}.clubContent table{width:100%!important;max-width:100%!important}.clubContent td,.clubContent th{overflow-wrap:anywhere}.clubContent .modal{max-width:min(760px,calc(100vw - 28px))!important}.clubContent .modalLayer{padding:14px!important}@media(max-width:900px){.clubContent .layout{grid-template-columns:1fr!important}.clubContent .side{border-right:0!important}.clubContent .grid2,.clubContent .grid3{grid-template-columns:1fr!important}}
      `}</style>
    </div>
  );
}
