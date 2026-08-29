"use client";

import {useEffect,useMemo,useState} from "react";
import {createClient} from "@/lib/supabase/client";

type Player={id:string;first_name:string;last_name:string;birthdate:string|null;photo_url:string|null;club_name:string|null;category:string|null};
type EventType="detection"|"preselection"|"pole_test";
type EventStatus="draft"|"open"|"closed";
type CandidateStatus="invited"|"observed"|"preselected"|"pole_test"|"selected"|"not_selected"|"withdrawn";
type SelectionEvent={id:string;structure_id:string;season_id:string;name:string;event_type:EventType;event_date:string;location:string|null;notes:string|null;status:EventStatus};
type Candidate={id:string;event_id:string;player_id:string;status:CandidateStatus;score:number|null;staff_note:string|null};

const today=()=>new Date().toISOString().slice(0,10);
const fmt=(v:string|null|undefined)=>v?v.slice(0,10).split("-").reverse().join("/"):"—";
const typeLabel=(t:EventType)=>t==="detection"?"Détection régionale":t==="preselection"?"Présélection":"Test Pôle";
const statusLabel=(s:CandidateStatus)=>({invited:"Convoqué",observed:"Observé",preselected:"Présélectionné",pole_test:"Retenu test Pôle",selected:"Sélectionné",not_selected:"Non retenu",withdrawn:"Retiré"}[s]);

export default function LeagueSelectionPipeline({structureId,seasonId,players}:{structureId:string;seasonId:string;players:Player[]}){
 const sb=useMemo(()=>createClient(),[]);
 const[events,setEvents]=useState<SelectionEvent[]>([]),[candidates,setCandidates]=useState<Candidate[]>([]),[selectedEventId,setSelectedEventId]=useState("");
 const[checked,setChecked]=useState<string[]>([]),[busy,setBusy]=useState(""),[showCreate,setShowCreate]=useState(false),[message,setMessage]=useState("");
 const[form,setForm]=useState({name:"",event_type:"detection" as EventType,event_date:today(),location:"",notes:""});
 const toast=(x:string)=>{setMessage(x);setTimeout(()=>setMessage(""),2200)};

 async function reload(preferred?:string){
  if(!seasonId){setEvents([]);setCandidates([]);setSelectedEventId("");return}
  const ev=await sb.from("institutional_player_selection_events").select("id,structure_id,season_id,name,event_type,event_date,location,notes,status").eq("structure_id",structureId).eq("season_id",seasonId).order("event_date",{ascending:false});
  if(ev.error){console.error(ev.error);return}
  const list=(ev.data||[]) as SelectionEvent[];setEvents(list);
  const ids=list.map(x=>x.id);let cand:Candidate[]=[];
  if(ids.length){const q=await sb.from("institutional_player_selection_candidates").select("id,event_id,player_id,status,score,staff_note").in("event_id",ids);if(!q.error)cand=(q.data||[]) as Candidate[]}
  setCandidates(cand);const next=preferred||selectedEventId||list[0]?.id||"";setSelectedEventId(list.some(x=>x.id===next)?next:(list[0]?.id||""));setChecked([]);
 }
 useEffect(()=>{void reload()},[structureId,seasonId]);// eslint-disable-line react-hooks/exhaustive-deps

 const currentEvent=events.find(x=>x.id===selectedEventId)||null;
 const eventCandidates=candidates.filter(x=>x.event_id===selectedEventId);
 const candidateMap=new Map(eventCandidates.map(x=>[x.player_id,x]));
 const playerMap=new Map(players.map(x=>[x.id,x]));

 async function createEvent(){
  if(!form.name.trim())return alert("Donne un nom à la détection.");
  const{data:{user}}=await sb.auth.getUser();if(!user)return;
  setBusy("create");const q=await sb.from("institutional_player_selection_events").insert({structure_id:structureId,season_id:seasonId,name:form.name.trim(),event_type:form.event_type,event_date:form.event_date,location:form.location.trim()||null,notes:form.notes.trim()||null,status:"open",created_by:user.id}).select("id").single();setBusy("");
  if(q.error)return alert(q.error.message);setForm({name:"",event_type:"detection",event_date:today(),location:"",notes:""});setShowCreate(false);await reload(q.data.id);toast("Étape créée");
 }
 async function addPlayers(){
  if(!selectedEventId||!checked.length)return;
  const{data:{user}}=await sb.auth.getUser();if(!user)return;
  const missing=checked.filter(id=>!candidateMap.has(id));if(!missing.length){setChecked([]);return}
  setBusy("add");const q=await sb.from("institutional_player_selection_candidates").insert(missing.map(player_id=>({event_id:selectedEventId,player_id,status:"invited",created_by:user.id})));setBusy("");if(q.error)return alert(q.error.message);
  await sb.from("institutional_player_pathway_events").insert(missing.map(player_id=>({player_id,structure_id:structureId,event_type:currentEvent?.event_type||"detection",title:`${typeLabel(currentEvent?.event_type||"detection")} · ${currentEvent?.name||""}`,event_date:currentEvent?.event_date||today(),details:{selection_event_id:selectedEventId,status:"invited"},created_by:user.id})));
  await reload(selectedEventId);toast(`${missing.length} joueur(s) ajouté(s)`);
 }
 async function setStatus(playerIds:string[],status:CandidateStatus){
  if(!selectedEventId||!playerIds.length)return;
  const{data:{user}}=await sb.auth.getUser();if(!user)return;
  setBusy(`status-${status}`);const q=await sb.from("institutional_player_selection_candidates").update({status,updated_at:new Date().toISOString()}).eq("event_id",selectedEventId).in("player_id",playerIds);setBusy("");if(q.error)return alert(q.error.message);
  const pathwayType=status==="preselected"?"preselected":status==="pole_test"?"pole_test":status==="selected"?"selected":null;
  if(pathwayType){await sb.from("institutional_player_pathway_events").insert(playerIds.map(player_id=>({player_id,structure_id:structureId,event_type:pathwayType,title:status==="preselected"?"Présélection régionale":status==="pole_test"?"Retenu pour test Pôle":"Sélection régionale",event_date:today(),details:{selection_event_id:selectedEventId,selection_event_name:currentEvent?.name||null},created_by:user.id})))}
  await reload(selectedEventId);toast(`${playerIds.length} joueur(s) mis à jour`);
 }
 async function saveCandidate(c:Candidate,patch:Partial<Candidate>){const q=await sb.from("institutional_player_selection_candidates").update({...patch,updated_at:new Date().toISOString()}).eq("id",c.id);if(q.error)return alert(q.error.message);setCandidates(v=>v.map(x=>x.id===c.id?{...x,...patch}:x))}
 async function closeEvent(){if(!currentEvent)return;const next=currentEvent.status==="closed"?"open":"closed";const q=await sb.from("institutional_player_selection_events").update({status:next,updated_at:new Date().toISOString()}).eq("id",currentEvent.id);if(q.error)return alert(q.error.message);await reload(currentEvent.id);toast(next==="closed"?"Étape clôturée":"Étape rouverte")}
 function toggle(id:string){setChecked(v=>v.includes(id)?v.filter(x=>x!==id):[...v,id])}

 return <section className="pipeline">
  {message&&<div className="toast">{message}</div>}
  <div className="head"><div><p>PARCOURS RÉGIONAL</p><h3>Détections · Présélections · Tests Pôle</h3><span>Chaque décision alimente le parcours du joueur sans recréer sa fiche.</span></div><button onClick={()=>setShowCreate(v=>!v)}>{showCreate?"Fermer":"+ Nouvelle étape"}</button></div>
  {showCreate&&<div className="create"><div className="grid"><label>Nom<input value={form.name} onChange={e=>setForm({...form,name:e.target.value})} placeholder="Détection U15 secteur Est"/></label><label>Type<select value={form.event_type} onChange={e=>setForm({...form,event_type:e.target.value as EventType})}><option value="detection">Détection régionale</option><option value="preselection">Présélection</option><option value="pole_test">Test Pôle</option></select></label><label>Date<input type="date" value={form.event_date} onChange={e=>setForm({...form,event_date:e.target.value})}/></label><label>Lieu<input value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="CREPS / gymnase…"/></label></div><label>Notes<textarea value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="Objectifs, staff, consignes…"/></label><div className="right"><button disabled={busy==="create"} onClick={createEvent}>{busy==="create"?"Création…":"Créer l'étape"}</button></div></div>}
  <div className="layout"><aside>{events.map(e=><button key={e.id} className={selectedEventId===e.id?"event active":"event"} onClick={()=>{setSelectedEventId(e.id);setChecked([])}}><b>{e.name}</b><small>{typeLabel(e.event_type)} · {fmt(e.event_date)}</small><em>{e.status==="closed"?"Clôturée":"Ouverte"} · {candidates.filter(c=>c.event_id===e.id).length} joueur(s)</em></button>)}{!events.length&&<div className="empty">Aucune détection créée pour cette saison.</div>}</aside>
   <div className="content">{currentEvent?<><div className="eventHead"><div><h4>{currentEvent.name}</h4><span>{typeLabel(currentEvent.event_type)} · {fmt(currentEvent.event_date)}{currentEvent.location?` · ${currentEvent.location}`:""}</span></div><button className="ghost" onClick={closeEvent}>{currentEvent.status==="closed"?"Rouvrir":"Clôturer"}</button></div>
    <div className="addBox"><b>Ajouter des joueurs de l'effectif</b><div className="chips">{players.map(p=><label key={p.id} className={candidateMap.has(p.id)?"chip already":"chip"}><input type="checkbox" checked={checked.includes(p.id)} disabled={candidateMap.has(p.id)||currentEvent.status==="closed"} onChange={()=>toggle(p.id)}/><span>{p.first_name} {p.last_name}</span><small>{p.club_name||"Club non renseigné"}</small></label>)}</div><div className="right"><button disabled={!checked.length||busy==="add"||currentEvent.status==="closed"} onClick={addPlayers}>Ajouter {checked.length||""} joueur(s)</button></div></div>
    {eventCandidates.length>0&&<div className="tableWrap"><table><thead><tr><th>Joueur</th><th>Club</th><th>Statut</th><th>Note / score</th><th>Commentaire staff</th></tr></thead><tbody>{eventCandidates.map(c=>{const p=playerMap.get(c.player_id);if(!p)return null;return <tr key={c.id}><td><b>{p.first_name} {p.last_name}</b><small>{fmt(p.birthdate)}{p.category?` · ${p.category}`:""}</small></td><td>{p.club_name||"—"}</td><td><select value={c.status} disabled={currentEvent.status==="closed"} onChange={e=>setStatus([p.id],e.target.value as CandidateStatus)}><option value="invited">Convoqué</option><option value="observed">Observé</option><option value="preselected">Présélectionné</option><option value="pole_test">Retenu test Pôle</option><option value="selected">Sélectionné</option><option value="not_selected">Non retenu</option><option value="withdrawn">Retiré</option></select><span className={`status ${c.status}`}>{statusLabel(c.status)}</span></td><td><input type="number" min="0" max="100" value={c.score??""} disabled={currentEvent.status==="closed"} onChange={e=>saveCandidate(c,{score:e.target.value===""?null:Number(e.target.value)})} placeholder="/100"/></td><td><input value={c.staff_note||""} disabled={currentEvent.status==="closed"} onChange={e=>setCandidates(v=>v.map(x=>x.id===c.id?{...x,staff_note:e.target.value}:x))} onBlur={e=>saveCandidate(c,{staff_note:e.target.value.trim()||null})} placeholder="Observation rapide…"/></td></tr>})}</tbody></table></div>}
    {eventCandidates.length>0&&currentEvent.status!=="closed"&&<div className="bulk"><span>Actions rapides sur tous les joueurs visibles :</span><button className="ghost" onClick={()=>setStatus(eventCandidates.map(x=>x.player_id),"observed")}>Marquer observés</button><button onClick={()=>setStatus(eventCandidates.filter(x=>!['not_selected','withdrawn'].includes(x.status)).map(x=>x.player_id),"preselected")}>Passer en présélection</button><button onClick={()=>setStatus(eventCandidates.filter(x=>x.status==="preselected").map(x=>x.player_id),"pole_test")}>Retenir pour test Pôle</button></div>}
   </>:<div className="empty">Sélectionne ou crée une étape.</div>}</div>
  </div>
  <style jsx>{css}</style>
 </section>
}

const css=`.pipeline{background:#fff;border:1px solid #eadfd8;border-radius:16px;padding:15px;display:grid;gap:12px}.head,.eventHead{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.head p{margin:0;color:#d4a24c;font-size:.68rem;font-weight:1000;letter-spacing:.12em}.head h3{margin:3px 0;color:#6b1a2c}.head span,.eventHead span{color:#7f7169;font-size:.8rem}button{border:0;border-radius:9px;padding:9px 11px;background:#6b1a2c;color:#fff;font-weight:900;cursor:pointer}button:disabled{opacity:.45;cursor:not-allowed}.ghost{background:#fff;color:#6b1a2c;border:1px solid #d8c8c1}.create,.addBox{background:#fbf8f6;border:1px solid #eadfd8;border-radius:12px;padding:12px;display:grid;gap:9px}.grid{display:grid;grid-template-columns:2fr 1fr 1fr 1.5fr;gap:8px}label{display:grid;gap:4px;font-size:.74rem;font-weight:900;color:#4d1420}input,select,textarea{border:1px solid #ddd1ca;border-radius:9px;padding:8px;font:inherit;background:#fff;min-width:0}textarea{min-height:70px}.right{display:flex;justify-content:flex-end}.layout{display:grid;grid-template-columns:260px minmax(0,1fr);gap:10px}aside{display:grid;align-content:start;gap:7px}.event{display:grid;text-align:left;background:#fff;color:#3b3032;border:1px solid #e9dfda}.event small,.event em{font-size:.67rem;color:#81736e;font-style:normal}.event.active{background:#6b1a2c;color:#fff;border-color:#6b1a2c}.event.active small,.event.active em{color:#f1dfd3}.content{min-width:0;border:1px solid #eee4df;border-radius:12px;padding:12px;display:grid;gap:10px}.eventHead h4{margin:0 0 3px;color:#6b1a2c;font-size:1rem}.chips{display:flex;gap:6px;flex-wrap:wrap}.chip{display:grid;grid-template-columns:18px auto;column-gap:5px;border:1px solid #e3d8d2;background:#fff;border-radius:9px;padding:6px 8px;cursor:pointer}.chip input{grid-row:1/3;width:15px;height:15px}.chip span{font-size:.75rem;font-weight:900}.chip small{font-size:.63rem;color:#81736e}.chip.already{opacity:.5;background:#f0ecea}.tableWrap{overflow:auto}.tableWrap table{width:100%;border-collapse:collapse;min-width:820px}.tableWrap th{background:#faf7f5;color:#6b1a2c;text-align:left;font-size:.7rem;padding:8px;border-bottom:1px solid #e8ddd7}.tableWrap td{padding:8px;border-bottom:1px solid #f0e8e4;font-size:.78rem;vertical-align:top}.tableWrap td:first-child{display:grid}.tableWrap td small{color:#81736e;font-size:.65rem}.tableWrap input,.tableWrap select{width:100%}.status{display:inline-flex;margin-top:4px;border-radius:999px;padding:3px 6px;background:#f2eeeb;font-size:.62rem;font-weight:900;color:#675b56}.status.preselected,.status.pole_test,.status.selected{background:#eef7ef;color:#28743a}.status.not_selected,.status.withdrawn{background:#fff0f0;color:#9b3030}.bulk{display:flex;gap:6px;flex-wrap:wrap;align-items:center;padding-top:4px}.bulk span{font-size:.72rem;color:#81736e}.empty{text-align:center;color:#8b7e78;padding:22px}.toast{position:fixed;top:15px;left:50%;transform:translateX(-50%);background:#231b1d;color:#fff;padding:9px 14px;border-radius:999px;z-index:160}@media(max-width:950px){.layout{grid-template-columns:1fr}.grid{grid-template-columns:1fr 1fr}aside{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:600px){.grid,aside{grid-template-columns:1fr}.head,.eventHead{flex-direction:column}}`;
