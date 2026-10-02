"use client";

import {useEffect,useState} from "react";

type PartnerTeam={
  linkId:string;teamId:string;structureId:string;institutionName:string;institutionType:string;
  institutionLogo?:string|null;season:string;name:string;clubName:string;category:string;
  coachName:string;logo?:string|null;playerCount:number;matchCount:number;
};
type Player={id:string;first_name:string;last_name:string;number?:string|number|null;photo_url?:string|null;position_primary?:string|null;height?:string|null;status?:string|null};
type Match={id:string;date:string;opponent:string;result:string;scoreFor?:number|null;scoreAgainst?:number|null};

export default function PartnerTeamsTab(){
 const[loading,setLoading]=useState(true);
 const[teams,setTeams]=useState<PartnerTeam[]>([]);
 const[selected,setSelected]=useState<PartnerTeam|null>(null);
 const[players,setPlayers]=useState<Player[]>([]);
 const[matches,setMatches]=useState<Match[]>([]);
 const[detailLoading,setDetailLoading]=useState(false);
 const[error,setError]=useState("");

 async function load(){
  setLoading(true);setError("");
  const r=await fetch("/api/account/partner-teams",{cache:"no-store"});
  const j=await r.json().catch(()=>({}));
  setLoading(false);
  if(!r.ok){setError(j.error||"Chargement impossible.");return}
  setTeams(j.teams||[]);
 }
 useEffect(()=>{void load()},[]);

 async function openTeam(team:PartnerTeam){
  setSelected(team);setPlayers([]);setMatches([]);setDetailLoading(true);
  const r=await fetch(`/api/account/partner-teams?teamId=${encodeURIComponent(team.teamId)}`,{cache:"no-store"});
  const j=await r.json().catch(()=>({}));
  setDetailLoading(false);
  if(!r.ok){setError(j.error||"Consultation impossible.");return}
  setPlayers(j.players||[]);setMatches(j.matches||[]);
 }

 if(loading)return <div className="ptEmpty">Chargement des équipes partenaires…<style jsx>{css}</style></div>;
 if(error)return <div className="ptEmpty">{error}<style jsx>{css}</style></div>;

 return <div className="pt">
  <div className="ptNotice"><span>👁</span><div><b>Consultation Institution</b><p>Ces équipes sont créées depuis Institution. L'Institution et le CEO les consultent ici sans modifier le travail du coach.</p></div></div>
  <div className="ptGrid">
   {teams.map(t=><article className="ptCard" key={t.linkId}>
    <div className="ptBand">
     <span className="ptLogo">{t.logo?<img src={t.logo} alt=""/>:"🏀"}</span>
     <div><small>{t.clubName||"CLUB PARTENAIRE"}</small><h3>{t.name}</h3><span>{t.category||"Catégorie non renseignée"}</span></div>
     <em>LECTURE SEULE</em>
    </div>
    <div className="ptBody">
     <div className="ptMeta"><span><b>{t.matchCount}</b><small>Matchs</small></span><span><b>{t.playerCount}/15</b><small>Joueurs</small></span><span><b>{t.season||"—"}</b><small>Saison</small></span></div>
     <div className="ptCoach"><small>Coach principal</small><b>{t.coachName}</b><span>{t.institutionName}</span></div>
     <button onClick={()=>openTeam(t)}>Consulter l'équipe →</button>
    </div>
   </article>)}
   {!teams.length&&<div className="ptEmpty">Aucune équipe partenaire liée à tes Institutions pour le moment.</div>}
  </div>

  {selected&&<div className="ptOverlay" onMouseDown={e=>{if(e.target===e.currentTarget)setSelected(null)}}>
   <section className="ptModal">
    <header><div><p>ÉQUIPE PARTENAIRE · LECTURE SEULE</p><h2>{selected.name}</h2><span>{selected.clubName||selected.institutionName} · {selected.category||"—"} · {selected.season||"—"}</span></div><button onClick={()=>setSelected(null)}>✕</button></header>
    {detailLoading?<div className="ptEmpty">Chargement…</div>:<>
     <div className="partnerTeamHero">
      <div className="partnerHeroLogo">{selected.logo?<img src={selected.logo} alt=""/>:"🏀"}</div>
      <div className="partnerHeroMain"><span className="partnerEyebrow">ÉQUIPE PARTENAIRE · LECTURE SEULE</span><h1>{selected.name}</h1><p>{selected.clubName||selected.institutionName} · {selected.category||"Catégorie —"} · {selected.season||"Saison —"}</p></div>
      <div className="partnerHeroStats"><span><b>{players.length}</b><small>Joueurs</small></span><span><b>{matches.length}</b><small>Matchs</small></span><span><b>{selected.coachName||"—"}</b><small>Coach</small></span></div>
     </div>
     <div className="partnerTabs"><span className="on">Présentation</span><span>Effectif</span><span>Matchs</span><em>👁 Consultation uniquement</em></div>
     <div className="partnerKpis">
      <span><small>Institution</small><b>{selected.institutionName}</b><i>{selected.institutionType||"Partenaire"}</i></span>
      <span><small>Coach principal</small><b>{selected.coachName||"—"}</b><i>Encadrement</i></span>
      <span><small>Effectif</small><b>{players.length} / 15</b><i>Joueurs</i></span>
      <span><small>Saison</small><b>{selected.season||"—"}</b><i>{selected.category||"Catégorie —"}</i></span>
     </div>
     <div className="partnerColumns">
      <section className="partnerPanel"><div className="partnerPanelHead"><div><small>EFFECTIF</small><h3>Les joueurs</h3></div><b>{players.length}</b></div>
       <div className="ptRoster">{players.map(p=><div key={p.id}><span className="avatar">{p.photo_url?<img src={p.photo_url} alt=""/>:(p.first_name?.[0]||"?")}</span><b>{p.first_name} {p.last_name}</b><small>{p.number?`#${p.number} · `:""}{p.position_primary||"Poste —"}{p.height?` · ${p.height}`:""}</small></div>)}{!players.length&&<p>Aucun joueur enregistré.</p>}</div>
      </section>
      <section className="partnerPanel"><div className="partnerPanelHead"><div><small>SAISON</small><h3>Derniers matchs</h3></div><b>{matches.length}</b></div>
       <div className="ptMatches">{matches.map(m=><div key={m.id}><span>{m.date?new Date(`${m.date}T12:00:00`).toLocaleDateString("fr-FR"):"—"}</span><b>{m.opponent||"Adversaire —"}</b><strong>{m.scoreFor!=null&&m.scoreAgainst!=null?`${m.scoreFor} - ${m.scoreAgainst}`:m.result||"—"}</strong></div>)}{!matches.length&&<p>Aucun match enregistré.</p>}</div>
      </section>
     </div>
    </>}
   </section>
  </div>}
  <style jsx>{css}</style>
 </div>
}

const css=`
.pt{display:grid;gap:16px}.ptNotice{display:flex;gap:12px;padding:14px 16px;border:1px solid #eadfd8;background:#fbf7f3;border-radius:14px}.ptNotice>span{font-size:22px}.ptNotice b{color:#6b1a2c}.ptNotice p{margin:3px 0 0;color:#746862;font-size:12px}.ptGrid{display:grid;gap:12px}.ptCard{display:grid;grid-template-columns:310px 1fr;border:1px solid #eadfd8;border-radius:14px;overflow:hidden;background:#fff}.ptBand{min-height:130px;background:linear-gradient(135deg,#3b0e19,#6b1a2c);color:#fff;display:flex;align-items:center;gap:13px;padding:18px;position:relative}.ptBand h3{margin:2px 0;font-size:23px}.ptBand small,.ptBand span{opacity:.8;font-size:10px}.ptBand em{position:absolute;right:10px;top:10px;background:#fff;color:#6b1a2c;border-radius:999px;padding:5px 8px;font-size:9px;font-style:normal;font-weight:900}.ptLogo{width:54px;height:54px;border-radius:50%;background:#fff;display:grid;place-items:center;color:#6b1a2c;font-size:24px;overflow:hidden}.ptLogo img,.avatar img{width:100%;height:100%;object-fit:cover}.ptBody{display:grid;grid-template-columns:1fr 180px auto;gap:16px;align-items:center;padding:14px}.ptMeta{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.ptMeta span{display:grid;border-right:1px solid #eee;padding-right:8px}.ptMeta b{color:#2b2320}.ptMeta small,.ptCoach small{font-size:9px;text-transform:uppercase;color:#887b74}.ptCoach{display:grid;gap:2px}.ptCoach b{font-size:12px}.ptCoach span{font-size:10px;color:#8a7c76}.ptBody button{border:0;background:#6b1a2c;color:#fff;border-radius:8px;padding:10px 12px;font-weight:900}.ptEmpty{padding:28px;border:1px dashed #dccdc6;border-radius:13px;text-align:center;color:#7c6f69}.ptOverlay{position:fixed;inset:0;background:rgba(22,13,16,.55);z-index:300;display:grid;place-items:center;padding:18px}.ptModal{width:min(1180px,100%);max-height:92vh;overflow:auto;background:#f8f6f3;border-radius:22px;padding:20px}.ptModal header{display:flex;justify-content:space-between;gap:15px;border-bottom:1px solid #eee;padding-bottom:12px}.ptModal header p{margin:0;color:#d4a24c;font-size:10px;font-weight:1000;letter-spacing:.12em}.ptModal header h2{margin:4px 0;color:#6b1a2c}.ptModal header span{color:#7f726c;font-size:12px}.ptModal header button{border:1px solid #ddd;background:#fff;border-radius:50%;width:34px;height:34px}.ptInfo{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:15px 0}.ptInfo span{display:grid;background:#faf7f5;border-radius:10px;padding:10px}.ptInfo small{font-size:9px;text-transform:uppercase;color:#8a7c75}.ptRoster{display:grid;grid-template-columns:repeat(2,1fr);gap:7px}.ptRoster>div{display:grid;grid-template-columns:38px 1fr;grid-template-rows:auto auto;column-gap:9px;align-items:center;border:1px solid #eee;border-radius:10px;padding:8px}.avatar{grid-row:1/3;width:36px;height:36px;border-radius:50%;overflow:hidden;background:#f2ebe7;display:grid;place-items:center}.ptRoster small{font-size:10px;color:#82756f}.ptMatches{border:1px solid #eee;border-radius:10px;overflow:hidden}.ptMatches>div{display:grid;grid-template-columns:110px 1fr 100px;gap:10px;padding:9px 10px;border-top:1px solid #eee}.ptMatches>div:first-child{border-top:0}.partnerTeamHero{display:grid;grid-template-columns:90px minmax(0,1fr) auto;gap:18px;align-items:center;margin:16px 0 0;padding:22px;border-radius:20px;background:linear-gradient(135deg,#3b0e19 0%,#6b1a2c 64%,#8d2740 100%);color:#fff;box-shadow:0 16px 34px rgba(72,25,36,.16)}.partnerHeroLogo{width:76px;height:76px;border-radius:18px;background:#fff;display:grid;place-items:center;overflow:hidden;color:#6b1a2c;font-size:34px}.partnerHeroLogo img{width:100%;height:100%;object-fit:contain;padding:7px;box-sizing:border-box}.partnerEyebrow{font-size:9px;font-weight:1000;letter-spacing:.14em;color:#f1cf8c}.partnerHeroMain h1{font-size:29px;line-height:1;margin:5px 0 7px}.partnerHeroMain p{margin:0;font-size:12px;opacity:.78}.partnerHeroStats{display:flex;gap:9px}.partnerHeroStats span{min-width:88px;padding:12px;border:1px solid rgba(255,255,255,.18);background:rgba(255,255,255,.08);border-radius:13px;display:grid;gap:2px}.partnerHeroStats b{font-size:16px}.partnerHeroStats small{font-size:8px;text-transform:uppercase;opacity:.72}.partnerTabs{display:flex;align-items:center;gap:5px;padding:12px 4px 5px;border-bottom:1px solid #e7ded9}.partnerTabs span{padding:9px 14px;border-radius:10px;font-size:11px;font-weight:900;color:#746761}.partnerTabs span.on{background:#6b1a2c;color:#fff}.partnerTabs em{margin-left:auto;font-size:10px;color:#8b7d76;font-style:normal;font-weight:800}.partnerKpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0}.partnerKpis>span{display:grid;gap:3px;padding:14px 15px;border:1px solid #e8dfda;border-radius:14px;background:#fff}.partnerKpis small,.partnerPanelHead small{font-size:8px;font-weight:1000;letter-spacing:.1em;color:#a18f85}.partnerKpis b{font-size:15px;color:#332725}.partnerKpis i{font-size:9px;color:#94857e;font-style:normal}.partnerColumns{display:grid;grid-template-columns:1.1fr .9fr;gap:12px}.partnerPanel{background:#fff;border:1px solid #e8dfda;border-radius:16px;padding:15px;min-width:0}.partnerPanelHead{display:flex;align-items:flex-end;justify-content:space-between;margin-bottom:10px}.partnerPanelHead h3{margin:2px 0 0;color:#6b1a2c;font-size:17px}.partnerPanelHead>b{width:32px;height:32px;border-radius:10px;background:#f7ecef;color:#6b1a2c;display:grid;place-items:center;font-size:12px}.ptMatches strong{color:#6b1a2c;text-align:right}
@media(max-width:900px){.ptCard{grid-template-columns:1fr}.ptBody{grid-template-columns:1fr}.ptRoster{grid-template-columns:1fr}.ptInfo{grid-template-columns:1fr}.partnerTeamHero{grid-template-columns:64px 1fr}.partnerHeroLogo{width:58px;height:58px}.partnerHeroStats{grid-column:1/-1}.partnerKpis{grid-template-columns:repeat(2,1fr)}.partnerColumns{grid-template-columns:1fr}.partnerTabs span:not(.on){display:none}}`;
