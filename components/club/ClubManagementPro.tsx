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
  { key:"intelligence", label:"Dashboard", icon:"📊" },
  { key:"equipes", label:"Équipes", icon:"🏀" },
  { key:"coachs", label:"Coachs", icon:"🧑‍🏫" },
  { key:"planning", label:"Créneaux", icon:"🗓️" },
  { key:"calendrier", label:"Calendrier", icon:"📅" },
  { key:"convocations", label:"Convocations", icon:"📣" },
  { key:"drive", label:"Documents", icon:"📁" },
  { key:"communication", label:"Communication", icon:"💬" },
  { key:"mailing", label:"Mailings", icon:"✉️" },
  { key:"cotisations", label:"Cotisations", icon:"💳" },
  { key:"relances", label:"Relances", icon:"🚨" },
  { key:"finance", label:"Finance", icon:"💰" },
  { key:"performance", label:"Performance", icon:"📈" },
  { key:"audit", label:"Exports", icon:"📤" },
  { key:"parametres", label:"Paramètres", icon:"⚙️" },
] as const;

type TabKey = typeof TABS[number]["key"];
const STORAGE_KEY = "mybasket_club_management_active_tab";

export default function ClubManagementPro({ clubId, clubName, logoUrl }: Props) {
  const [activeTab,setActiveTab] = useState<TabKey>("intelligence");
  const [mobileMenu,setMobileMenu] = useState(false);
  const [colors,setColors] = useState({ primary:"#6B1A2C", secondary:"#D4A24C" });
  const [season,setSeason] = useState("2026-2027");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY) as TabKey | null;
    if(saved && TABS.some((t)=>t.key===saved)) setActiveTab(saved);
    const supabase = createClient();
    void Promise.all([
      supabase.from("clubs").select("primary_color,secondary_color").eq("id",clubId).maybeSingle(),
      supabase.from("club_settings").select("season_label").eq("club_id",clubId).maybeSingle(),
    ]).then(([clubRes, settingsRes])=>{
      setColors({
        primary:clubRes.data?.primary_color || "#6B1A2C",
        secondary:clubRes.data?.secondary_color || "#D4A24C"
      });
      if(settingsRes.data?.season_label) setSeason(settingsRes.data.season_label);
    });
  },[clubId]);

  function changeTab(key:TabKey){
    setActiveTab(key);
    setMobileMenu(false);
    window.localStorage.setItem(STORAGE_KEY,key);
    window.scrollTo({top:0,behavior:"smooth"});
  }

  const current = useMemo(()=>TABS.find((t)=>t.key===activeTab)||TABS[0],[activeTab]);
  const name = clubName || "Mon club";

  return (
    <div
      className="clubApp"
      style={{
        ["--club-primary" as any]:colors.primary,
        ["--club-secondary" as any]:colors.secondary
      }}
    >
      <ClubSectionPolish />

      <aside className={mobileMenu?"sidebar open":"sidebar"}>
        <div className="brand">
          <div className="brandLogo">{logoUrl?<img src={logoUrl} alt=""/>:<span>🏀</span>}</div>
          <div className="brandTitle">MYBASKET</div>
          <div className="brandSub">CLUB</div>
        </div>

        <div className="context">
          <small>CLUB</small>
          <b>{name}</b>
        </div>

        <nav>
          {TABS.map((t)=>
            <button
              key={t.key}
              className={activeTab===t.key?"active":""}
              onClick={()=>changeTab(t.key)}
            >
              <i>{t.icon}</i>
              <span>{t.label}</span>
            </button>
          )}
        </nav>

        <div className="sideBottom">
          <div className="profileDot">MB</div>
          <div>
            <strong>{name}</strong>
            <span>Espace Club</span>
          </div>
        </div>
      </aside>

      <div className="workspace">
        <header className="topbar">
          <button className="menuBtn" onClick={()=>setMobileMenu(v=>!v)}>☰</button>
          <div className="topIdentity">
            <small>CLUB · {name.toUpperCase()}</small>
            <strong>{current.label}</strong>
          </div>
          <div className="topActions">
            <div className="season">Saison <b>{season}</b>⌄</div>
            <button className="bell" aria-label="Notifications">♧</button>
            <div className="account">MB</div>
          </div>
        </header>

        <main className="clubContent">
          {activeTab!=="intelligence" && (
            <div className="pageTitle">
              <div>
                <p>ESPACE CLUB</p>
                <h1>{current.label}</h1>
                <span>{name}</span>
              </div>
              <button className="backDashboard" onClick={()=>changeTab("intelligence")}>
                ← Dashboard
              </button>
            </div>
          )}

          {activeTab==="intelligence" && <ClubDashboardOverviewV2 clubId={clubId} clubName={name} logoUrl={logoUrl} onNavigate={(tab)=>changeTab(tab)} />}
          {activeTab==="equipes" && <ClubTeamsActiveSection clubId={clubId}/>}
          {activeTab==="coachs" && <ClubCoachesSection clubId={clubId} clubName={name}/>}
          {activeTab==="planning" && <CreneauxPlanner clubId={clubId}/>}
          {activeTab==="calendrier" && <ClubCalendarEngineSection clubId={clubId}/>}
          {activeTab==="convocations" && <ClubConvocationsSection clubId={clubId}/>}
          {activeTab==="drive" && <ClubDriveSection clubId={clubId}/>}
          {activeTab==="communication" && <ClubCommunicationProSection clubId={clubId} clubName={name}/>}
          {activeTab==="mailing" && <ClubMailingListsSection clubId={clubId}/>}
          {activeTab==="cotisations" && <ClubCotisationsSection clubId={clubId}/>}
          {activeTab==="relances" && <ClubRelancesSection clubId={clubId} clubName={name}/>}
          {activeTab==="finance" && <ClubFinanceProSection clubId={clubId}/>}
          {activeTab==="performance" && <ClubPerformanceProSection clubId={clubId}/>}
          {activeTab==="audit" && <ClubAuditExportsSection clubId={clubId}/>}
          {activeTab==="parametres" && <ClubSettingsProSection clubId={clubId}/>}
        </main>
      </div>

      {mobileMenu&&<button className="overlay" onClick={()=>setMobileMenu(false)} aria-label="Fermer le menu"/>}

      <style jsx>{`
        .clubApp{
          min-height:100vh;
          background:#f8f5f1;
          color:#201a1c;
          font-family:Roboto,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
          display:grid;
          grid-template-columns:278px minmax(0,1fr);
        }
        .sidebar{
          background:#fff;
          color:#2b2426;
          min-height:100vh;
          position:sticky;
          top:0;
          height:100vh;
          display:grid;
          grid-template-rows:auto auto minmax(0,1fr) auto;
          padding:28px 18px;
          z-index:50;
          overflow-y:auto;
          border-right:1px solid #eadfd8;
          box-shadow:8px 0 28px rgba(56,31,23,.035);
        }
        .brand{text-align:center;padding-bottom:20px;border-bottom:1px solid rgba(107,26,44,.10)}
        .brandLogo{width:58px;height:58px;margin:0 auto 5px;border-radius:50%;display:grid;place-items:center;overflow:hidden;background:transparent;color:var(--club-primary);font-weight:1000}
        .brandLogo img{width:100%;height:100%;object-fit:contain;padding:3px}
        .brandLogo span{font-size:38px}
        .brandTitle{font-size:28px;font-weight:1000;color:var(--club-primary);letter-spacing:-.03em;line-height:1}.brandSub{color:var(--club-secondary);letter-spacing:8px;font-weight:900;font-size:14px;margin-top:5px}
        .context{padding:18px 10px 10px}
        .context small{display:block;color:#aa989e;font-size:.59rem;font-weight:1000;letter-spacing:.12em}
        .context b{display:block;color:#4d1420;font-size:.82rem;margin-top:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        nav{display:flex;flex-direction:column;gap:6px;overflow:auto;padding:4px 4px 0 0}
        nav button{
          width:100%;min-width:0;border:0;background:transparent;color:#42393c;border-radius:12px;
          min-height:42px;padding:0 14px;display:flex;gap:12px;
          align-items:center;text-align:left;font-size:14px;font-weight:800;cursor:pointer;transition:.18s ease
        }
        nav button:hover{background:#fbf4f0;color:var(--club-primary)}
        nav button i{font-style:normal;text-align:center;color:inherit;font-size:16px;width:18px;flex:0 0 18px}
        nav button span{min-width:0;overflow:hidden;text-overflow:ellipsis}
        nav button.active{background:linear-gradient(135deg,#8b1232,var(--club-primary));color:#fff;box-shadow:0 12px 24px rgba(107,26,44,.18)}
        nav button.active i{color:var(--club-secondary)}
        .sideBottom{border-top:1px solid #eee5df;padding:16px 7px 0;display:flex;gap:10px;align-items:center}
        .profileDot,.account{
          width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:var(--club-primary);
          color:#fff;font-weight:1000;flex:0 0 auto
        }
        .sideBottom strong,.sideBottom span{display:block}
        .sideBottom strong{font-size:.77rem;color:#4d1420}
        .sideBottom span{font-size:.68rem;color:#9c8b90;margin-top:3px}
        .workspace{min-width:0}
        .topbar{
          height:72px;background:#fff;border-bottom:1px solid #e7e0d9;display:flex;align-items:center;gap:16px;
          padding:0 27px;position:sticky;top:0;z-index:30
        }
        .menuBtn{border:0;background:transparent;font-size:1.28rem;cursor:pointer;color:#55484c}
        .topIdentity{min-width:0;flex:1}
        .topIdentity small{display:block;color:#a99098;font-size:.58rem;font-weight:1000;letter-spacing:.1em}
        .topIdentity strong{display:block;color:#4d1420;font-size:1.02rem;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        .topActions{display:flex;align-items:center;gap:11px}
        .season{border:1px solid #e7e0d9;border-radius:9px;padding:9px 13px;font-size:.73rem;background:#fff;white-space:nowrap}
        .bell{border:0;background:transparent;font-size:1.08rem;color:var(--club-primary)}
        .clubContent{padding:25px 28px 40px;min-width:0;max-width:1600px;margin:0 auto;width:100%}
        .pageTitle{display:flex;justify-content:space-between;align-items:flex-end;gap:12px;margin-bottom:18px}
        .pageTitle p{margin:0;color:var(--club-secondary);font-size:.64rem;font-weight:1000;letter-spacing:.11em}
        .pageTitle h1{margin:3px 0;color:#4d1420;font-size:1.75rem}
        .pageTitle span{font-size:.74rem;color:#8e7e83}
        .backDashboard{border:1px solid #e6d9d3;background:#fff;color:var(--club-primary);border-radius:12px;padding:8px 10px;font-weight:900;cursor:pointer}
        .overlay{display:none}
        @media(max-width:980px){
          .clubApp{grid-template-columns:1fr}.sidebar{position:fixed;left:0;top:0;width:278px;transform:translateX(-105%);transition:.2s}
          .sidebar.open{transform:translateX(0)}.overlay{display:block;position:fixed;inset:0;background:rgba(0,0,0,.38);z-index:40;border:0}
          .topbar{padding:0 16px}.clubContent{padding:20px 16px 32px}
        }
        @media(max-width:650px){.season{display:none}.topbar{height:62px}.clubContent{padding:16px 10px 28px}.account{width:35px;height:35px}}
      `}</style>

      <style jsx global>{`
        .clubApp *{box-sizing:border-box}
        .clubApp input,.clubApp select,.clubApp textarea{max-width:100%;min-width:0;width:100%}
        .clubApp img{max-width:100%}
        .clubContent>section,.clubContent>div{min-width:0}
        .clubContent .teamsActive,.clubContent .coaches,.clubContent .engine,.clubContent .communication,
        .clubContent .mailing,.clubContent .settings,.clubContent .finance,.clubContent .convocations,
        .clubContent .cotisations,.clubContent .performance{
          border:1px solid #e7e0d9!important;border-radius:14px!important;background:#fff!important;
          box-shadow:0 5px 20px rgba(57,34,25,.035)!important;overflow:hidden!important;min-width:0!important
        }
        .clubContent .top{background:#fff!important;border-bottom:1px solid #ece6df!important;padding:18px 20px!important}
        .clubContent .top p{color:var(--club-secondary)!important}
        .clubContent .top h2{color:#4d1420!important;font-family:Roboto,system-ui,sans-serif!important;font-weight:950!important}
        .clubContent .layout,.clubContent .main,.clubContent .calendar,.clubContent .panel,
        .clubContent .templates,.clubContent .form,.clubContent .side{min-width:0!important}
        .clubContent table{width:100%!important;max-width:100%!important}
        .clubContent td,.clubContent th{overflow-wrap:anywhere}
        .clubContent .modal{max-width:min(760px,calc(100vw - 28px))!important}
        .clubContent .modalLayer{padding:14px!important}
        @media(max-width:900px){
          .clubContent .layout{grid-template-columns:1fr!important}.clubContent .side{border-right:0!important}
          .clubContent .grid2,.clubContent .grid3{grid-template-columns:1fr!important}
        }
      `}</style>
    </div>
  );
}
