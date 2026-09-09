"use client";

import {useEffect,useMemo,useState} from "react";
import TeamShootingGrids from "@/components/equipes/TeamShootingGrids";
import {createClient} from "@/lib/supabase/client";
import type {Player} from "@/types/player";

type Context="all"|"club"|"pole"|"selection";
type Props={
  structureId:string;
  player:{id:string;first_name:string;last_name:string;photo_url?:string|null};
};
type Totals={games:number;minutes:number;pts:number;reb:number;ast:number;stl:number;blk:number;turnovers:number;p2m:number;p2a:number;p3m:number;p3a:number;ftm:number;fta:number};
type MatchRow={id:string;date:string;opponent:string;teamName:string;context:"club"|"pole"|"selection";selectionLevel?:string|null;pts:number;reb:number;ast:number;minutes:number};
type Payload={totals:Record<Context,Totals>;matches:MatchRow[];sources:Array<{context:string;teamId:string;playerId:string;teamName:string;selectionLevel?:string|null}>};

const empty:Totals={games:0,minutes:0,pts:0,reb:0,ast:0,stl:0,blk:0,turnovers:0,p2m:0,p2a:0,p3m:0,p3a:0,ftm:0,fta:0};
const pct=(m:number,a:number)=>a?Math.round(m/a*1000)/10:0;
const one=(n:number)=>Number(n||0).toFixed(1);

export default function InstitutionalPlayerPerformance({structureId,player}:Props){
 const sb=useMemo(()=>createClient(),[]);
 const [view,setView]=useState<"stats"|"shooting">("stats");
 const [context,setContext]=useState<Context>("all");
 const [data,setData]=useState<Payload|null>(null);
 const [loading,setLoading]=useState(false);
 const [showLink,setShowLink]=useState(false);
 const [teams,setTeams]=useState<Array<{id:string;name:string}>>([]);
 const [roster,setRoster]=useState<Array<{id:string;first_name:string;last_name:string}>>([]);
 const [link,setLink]=useState({teamId:"",playerId:"",selectionLevel:"regional",label:""});

 const gridPlayer=useMemo(()=>({
   id:player.id,
   firstName:player.first_name,
   lastName:player.last_name,
   photoUrl:player.photo_url||null,
 } as unknown as Player),[player]);

 async function load(){
   setLoading(true);
   const r=await fetch(`/api/institutionnel/player-performance?structureId=${encodeURIComponent(structureId)}&playerId=${encodeURIComponent(player.id)}`,{cache:"no-store"});
   const j=await r.json().catch(()=>null);
   setLoading(false);
   if(r.ok)setData(j); else alert(j?.error||"Lecture des statistiques impossible.");
 }
 useEffect(()=>{void load()},[structureId,player.id]); // eslint-disable-line

 async function openLink(){
   setShowLink(true);
   if(teams.length)return;
   const q=await sb.from("teams").select("id,name").order("name").limit(500);
   if(!q.error)setTeams((q.data||[]) as Array<{id:string;name:string}>);
 }
 async function chooseTeam(teamId:string){
   setLink(v=>({...v,teamId,playerId:""}));setRoster([]);
   if(!teamId)return;
   const q=await sb.from("players").select("id,first_name,last_name").eq("team_id",teamId).order("last_name");
   if(!q.error)setRoster((q.data||[]) as Array<{id:string;first_name:string;last_name:string}>);
 }
 async function saveSelectionLink(){
   if(!link.teamId||!link.playerId)return alert("Choisis l'équipe de sélection et le joueur correspondant.");
   const r=await fetch("/api/institutionnel/player-performance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({structureId,playerId:player.id,teamId:link.teamId,rosterPlayerId:link.playerId,selectionLevel:link.selectionLevel,label:link.label})});
   const j=await r.json().catch(()=>({}));
   if(!r.ok)return alert(j.error||"Liaison impossible.");
   setShowLink(false);await load();
 }
 const t=data?.totals?.[context]||empty;
 const rows=(data?.matches||[]).filter(m=>context==="all"||m.context===context);

 return <section className="ipp">
   <div className="ippHead"><div><p>PERFORMANCE</p><h3>Statistiques & grilles de tirs</h3><span>Une seule fiche joueur, avec les performances séparées selon son environnement.</span></div>
    <div className="mainTabs"><button className={view==="stats"?"on":""} onClick={()=>setView("stats")}>📊 Statistiques</button><button className={view==="shooting"?"on":""} onClick={()=>setView("shooting")}>🏀 Grilles de tirs</button></div>
   </div>

   {view==="stats"&&<>
    <div className="contextTabs">
      {([["all","Toutes"],["club","Stats club"],["pole","Stats Pôle"],["selection","Stats sélection"]] as const).map(([k,l])=><button key={k} className={context===k?"on":""} onClick={()=>setContext(k)}>{l}</button>)}
    </div>
    <div className="contextHelp">
      {context==="club"&&"Club : matchs du week-end de l'équipe partenaire."}
      {context==="pole"&&"Pôle : matchs de l'équipe Pôle, notamment les rencontres du mercredi."}
      {context==="selection"&&<span>Sélection : événements ponctuels départementaux, régionaux, nationaux ou autres. <button className="linkBtn" onClick={openLink}>+ Relier une équipe de sélection</button></span>}
      {context==="all"&&"Toutes les performances connues du joueur, sans mélanger leur origine dans le détail."}
    </div>
    {loading?<div className="empty">Chargement…</div>:<>
      <div className="kpis">
       <K label="Matchs" value={String(t.games)}/><K label="Points / match" value={t.games?one(t.pts/t.games):"—"}/><K label="Rebonds / match" value={t.games?one(t.reb/t.games):"—"}/><K label="Passes / match" value={t.games?one(t.ast/t.games):"—"}/><K label="Minutes / match" value={t.games?one(t.minutes/t.games):"—"}/><K label="2PTS" value={t.p2a?`${pct(t.p2m,t.p2a)}%`:"—"}/><K label="3PTS" value={t.p3a?`${pct(t.p3m,t.p3a)}%`:"—"}/><K label="LF" value={t.fta?`${pct(t.ftm,t.fta)}%`:"—"}/>
      </div>
      <div className="matchTable"><div className="tr th"><span>Date</span><span>Contexte</span><span>Équipe / adversaire</span><span>PTS</span><span>REB</span><span>PD</span><span>MIN</span></div>
       {rows.map(m=><div className="tr" key={`${m.context}-${m.id}`}><span>{m.date?new Date(`${m.date}T12:00:00`).toLocaleDateString("fr-FR"):"—"}</span><span><b className={`badge ${m.context}`}>{m.context==="club"?"Club":m.context==="pole"?"Pôle":`Sélection${m.selectionLevel?` · ${level(m.selectionLevel)}`:""}`}</b></span><span>{m.teamName}{m.opponent?` · vs ${m.opponent}`:""}</span><b>{m.pts}</b><span>{m.reb}</span><span>{m.ast}</span><span>{m.minutes||"—"}</span></div>)}
       {!rows.length&&<div className="empty">Aucun match relié dans ce contexte pour le moment.</div>}
      </div>
    </>}
   </>}

   {view==="shooting"&&<div className="shootingWrap">
     <p className="shootingIntro">Même outil que dans la fiche équipe : modèles, spots 2PTS/3PTS/LF, Plaquette, séances, saisie des résultats et historique.</p>
     <TeamShootingGrids teamId={structureId} scopeType="institution" scopeId={structureId} scopeLabel="Institution" players={[gridPlayer]} canEdit />
   </div>}

   {showLink&&<div className="modalBack" onMouseDown={e=>{if(e.currentTarget===e.target)setShowLink(false)}}><div className="modal">
    <div><p>SÉLECTION</p><h3>Relier les statistiques d'une sélection</h3><span>Le joueur reste unique. On relie simplement son identité MyBasket dans l'équipe utilisée pour coder les matchs de sélection.</span></div>
    <label>Équipe de sélection<select value={link.teamId} onChange={e=>chooseTeam(e.target.value)}><option value="">Choisir…</option>{teams.map(t=><option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
    <label>Joueur dans cette équipe<select value={link.playerId} onChange={e=>setLink(v=>({...v,playerId:e.target.value}))}><option value="">Choisir…</option>{roster.map(p=><option key={p.id} value={p.id}>{p.last_name} {p.first_name}</option>)}</select></label>
    <label>Niveau<select value={link.selectionLevel} onChange={e=>setLink(v=>({...v,selectionLevel:e.target.value}))}><option value="departmental">Départementale</option><option value="regional">Régionale</option><option value="national">Nationale</option><option value="other">Autre</option></select></label>
    <label>Libellé facultatif<input value={link.label} onChange={e=>setLink(v=>({...v,label:e.target.value}))} placeholder="Ex. Ligue Île-de-France U15"/></label>
    <div className="actions"><button className="ghost" onClick={()=>setShowLink(false)}>Annuler</button><button onClick={saveSelectionLink}>Enregistrer la liaison</button></div>
   </div></div>}
   <style jsx>{`.ipp{border-top:1px solid #eadfd8;margin-top:18px;padding-top:16px;display:grid;gap:12px}.ippHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.ipp p{margin:0;color:#d4a24c;font-size:.68rem;font-weight:1000;letter-spacing:.12em}.ipp h3{margin:3px 0;color:#6b1a2c}.ipp span{color:#7f7169}.mainTabs,.contextTabs,.actions{display:flex;gap:6px;flex-wrap:wrap}.mainTabs button,.contextTabs button{border:1px solid #ddcfc8;background:#fff;color:#6b1a2c;border-radius:999px;padding:8px 11px;font-weight:900}.mainTabs button.on,.contextTabs button.on{background:#6b1a2c;color:#fff}.contextHelp{background:#fbf7f3;border:1px solid #eadfd8;border-radius:10px;padding:9px 11px;font-size:.78rem;color:#675b56}.linkBtn{padding:5px 8px;margin-left:8px}.kpis{display:grid;grid-template-columns:repeat(8,minmax(85px,1fr));gap:7px}.kpi{border:1px solid #eadfd8;border-radius:11px;padding:9px;background:#fff;text-align:center}.kpi b{display:block;color:#6b1a2c;font-size:1.05rem}.kpi small{font-size:.62rem;color:#8b7d77;text-transform:uppercase;font-weight:900}.matchTable{border:1px solid #eadfd8;border-radius:12px;overflow:auto}.tr{display:grid;grid-template-columns:95px 150px minmax(220px,1fr) 55px 55px 55px 55px;gap:7px;padding:8px 10px;border-top:1px solid #f0e8e4;align-items:center;font-size:.76rem;min-width:760px}.tr.th{background:#faf7f5;border-top:0;color:#6b1a2c;font-weight:1000}.badge{display:inline-flex;padding:4px 7px;border-radius:999px;font-size:.66rem}.badge.club{background:#eef4ff;color:#315c9b}.badge.pole{background:#fff2d8;color:#8a5a00}.badge.selection{background:#f3eafa;color:#70438c}.empty{text-align:center;padding:20px;color:#8b7e78}.shootingIntro{color:#675b56!important;letter-spacing:0!important;font-size:.8rem!important}.modalBack{position:fixed;inset:0;background:rgba(25,15,18,.5);z-index:200;display:grid;place-items:center;padding:15px}.modal{width:min(620px,100%);background:#fff;border-radius:16px;padding:18px;display:grid;gap:10px}.modal label{display:grid;gap:5px;color:#6b1a2c;font-weight:900;font-size:.76rem}.modal input,.modal select{border:1px solid #ddd1ca;border-radius:9px;padding:9px}.modal .actions{justify-content:flex-end}.ghost{background:#fff!important;color:#6b1a2c!important;border:1px solid #d8c8c1!important}@media(max-width:1100px){.kpis{grid-template-columns:repeat(4,1fr)}}@media(max-width:720px){.ippHead{display:grid}.kpis{grid-template-columns:repeat(2,1fr)}}`}</style>
 </section>
}
function K({label,value}:{label:string;value:string}){return <div className="kpi"><b>{value}</b><small>{label}</small></div>}
function level(v:string){return v==="departmental"?"Départementale":v==="regional"?"Régionale":v==="national"?"Nationale":"Autre"}
