"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Player = { id:string; first_name:string; last_name:string; email?:string|null; tutor1_email?:string|null; tutor2_email?:string|null; profile_data?:Record<string,any>|null };
type SelectionPlayer = { id:string; player_id:string; player?:Player|null };
type Selection = { id:string; name:string; category:string|null; season_label:string|null; players?:SelectionPlayer[] };
type Category = { id:string; name:string; color:string; description:string|null; event_types:string[] };
type EventRow = { id:string; event_date:string; start_time:string|null; end_time:string|null; title:string; event_type:string; location:string|null; category_id:string|null; selection_id:string|null };
type Session = { id:string; event_id:string|null; session_date:string; title:string; location:string|null };
type RecordRow = { id:string; session_id:string; player_id:string; status:"present"|"absent"|"excused" };

const EVENT_TYPES = ["Entraînement","Stage","Match","Détection","Rassemblement","Test","Réunion","Formation des cadres","Formation joueurs","Plateau MiniBasket","Autre"];
const today=()=>new Date().toISOString().slice(0,10);

export default function InstitutionalSelectionOperations({structureId,selection}:{structureId:string;selection:Selection}){
 const sb=useMemo(()=>createClient(),[]);
 const[tab,setTab]=useState<"events"|"attendance"|"mail">("events");
 const[categories,setCategories]=useState<Category[]>([]),[events,setEvents]=useState<EventRow[]>([]),[sessions,setSessions]=useState<Session[]>([]),[records,setRecords]=useState<RecordRow[]>([]);
 const[busy,setBusy]=useState(""),[message,setMessage]=useState("");
 const[form,setForm]=useState({event_date:today(),start_time:"18:00",end_time:"20:00",title:"Entraînement",event_type:"Entraînement",location:"",category_id:""});
 const[selectedPlayers,setSelectedPlayers]=useState<string[]>([]);
 const[mail,setMail]=useState({subject:`Convocation - ${selection.name}`,body:"Bonjour,\n\nVous êtes convoqué(e) au prochain rassemblement de la sélection.\n\nSportivement,"});
 const[mailPlayers,setMailPlayers]=useState<string[]>([]);

 const players=useMemo(()=>selection.players?.map(x=>x.player).filter(Boolean) as Player[]||[],[selection.players]);
 useEffect(()=>{setSelectedPlayers(players.map(p=>p.id));setMailPlayers(players.map(p=>p.id));},[selection.id,players.length]);
 useEffect(()=>{void load()},[structureId,selection.id]); // eslint-disable-line react-hooks/exhaustive-deps

 async function load(){
  const[a,b,c,d]=await Promise.all([
   sb.from("institutional_calendar_categories").select("id,name,color,description,event_types").eq("structure_id",structureId).eq("archived",false).order("name"),
   sb.from("institutional_events").select("id,event_date,start_time,end_time,title,event_type,location,category_id,selection_id").eq("structure_id",structureId).eq("selection_id",selection.id).eq("archived",false).order("event_date",{ascending:false}),
   sb.from("institutional_player_attendance_sessions").select("id,event_id,session_date,title,location").eq("structure_id",structureId).eq("selection_id",selection.id).order("session_date",{ascending:false}),
   sb.from("institutional_player_attendance_records").select("id,session_id,player_id,status").eq("structure_id",structureId),
  ]);
  if(!a.error)setCategories(((a.data||[]) as any[]).map(x=>({...x,event_types:Array.isArray(x.event_types)?x.event_types:[]})) as Category[]);
  if(!b.error)setEvents((b.data||[]) as EventRow[]);
  if(!c.error)setSessions((c.data||[]) as Session[]);
  if(!d.error)setRecords((d.data||[]) as RecordRow[]);
 }
 function flash(v:string){setMessage(v);setTimeout(()=>setMessage(""),2200)}
 function toggle(list:string[],id:string,setter:(x:string[])=>void){setter(list.includes(id)?list.filter(x=>x!==id):[...list,id])}

 async function ensureSeasonId(userId:string){
  const label=selection.season_label||`${new Date().getFullYear()}-${new Date().getFullYear()+1}`;
  const existing=await sb.from("institutional_player_tracking_seasons").select("id").eq("structure_id",structureId).eq("season_label",label).eq("archived",false).maybeSingle();
  if(existing.error)throw new Error(existing.error.message);
  if(existing.data?.id)return String(existing.data.id);
  const created=await sb.from("institutional_player_tracking_seasons").insert({structure_id:structureId,season_label:label,created_by:userId}).select("id").single();
  if(created.error)throw new Error(created.error.message);
  return String(created.data.id);
 }

 async function createEvent(){
  if(!form.title.trim())return alert("Titre obligatoire.");
  if(!selectedPlayers.length)return alert("Sélectionne au moins un joueur convoqué.");
  const{data:{user}}=await sb.auth.getUser();if(!user)return;
  setBusy("event");
  let seasonId="";try{seasonId=await ensureSeasonId(user.id)}catch(error:any){setBusy("");return alert(error?.message||"Saison impossible à préparer.")}
  const e=await sb.from("institutional_events").insert({structure_id:structureId,event_date:form.event_date,start_time:form.start_time||null,end_time:form.end_time||null,title:form.title.trim(),event_type:form.event_type,location:form.location.trim()||null,event_domain:"player",source_type:"selection",category_id:form.category_id||null,selection_id:selection.id,created_by:user.id}).select("id").single();
  if(e.error){setBusy("");return alert(e.error.message)}
  const s=await sb.from("institutional_player_attendance_sessions").insert({structure_id:structureId,season_id:seasonId,event_id:e.data.id,selection_id:selection.id,session_type:form.event_type.toLowerCase(),session_date:form.event_date,title:form.title.trim(),location:form.location.trim()||null,created_by:user.id}).select("id").single();
  if(s.error){setBusy("");return alert(s.error.message)}
  const r=await sb.from("institutional_player_attendance_records").insert(selectedPlayers.map(player_id=>({structure_id:structureId,session_id:s.data.id,season_id:seasonId,player_id,status:"absent",created_by:user.id})));
  if(r.error){setBusy("");return alert(r.error.message)}
  setBusy("");flash("Événement créé, ajouté au calendrier et convocations préparées.");await load();
 }
 async function setPresence(sessionId:string,playerId:string,status:RecordRow["status"]){
  const row=records.find(r=>r.session_id===sessionId&&r.player_id===playerId);if(!row)return;
  const q=await sb.from("institutional_player_attendance_records").update({status,updated_at:new Date().toISOString()}).eq("id",row.id);
  if(q.error)return alert(q.error.message);setRecords(v=>v.map(x=>x.id===row.id?{...x,status}:x));
 }
 function playerEmails(p:Player){
  const profile=p.profile_data||{};return [p.email,profile.guardian1Email,p.tutor1_email,profile.guardian2Email,p.tutor2_email].map(x=>String(x||"").trim().toLowerCase()).filter((x,i,a)=>x.includes("@")&&a.indexOf(x)===i);
 }
 async function sendMail(){
  const targets=players.filter(p=>mailPlayers.includes(p.id));const to=[...new Set(targets.flatMap(playerEmails))];
  if(!to.length)return alert("Aucune adresse email disponible pour les joueurs sélectionnés.");
  if(!mail.subject.trim()||!mail.body.trim())return alert("Objet et corps du mail obligatoires.");
  setBusy("mail");const response=await fetch("/api/institutionnel/send-email",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({structureId,to,subject:mail.subject,body:mail.body,selectionId:selection.id})});const json=await response.json().catch(()=>({}));setBusy("");
  if(!response.ok)return alert(json.error||"Envoi impossible.");flash(`Message envoyé à ${to.length} adresse(s).`);
 }

 const latestSessions=sessions.slice(0,12);
 return <section className="ops">
  <div className="opsHead"><div><small>SUIVI DE LA SÉLECTION</small><h4>Événements, présences & convocations</h4><p>Tout événement créé ici alimente automatiquement Mon calendrier et le suivi individuel des joueurs.</p></div></div>
  {message&&<div className="notice">✓ {message}</div>}
  <div className="tabs"><button className={tab==="events"?"on":""} onClick={()=>setTab("events")}>Calendrier de la sélection</button><button className={tab==="attendance"?"on":""} onClick={()=>setTab("attendance")}>Présences</button><button className={tab==="mail"?"on":""} onClick={()=>setTab("mail")}>Convocations & messages</button></div>
  {tab==="events"&&<div className="eventLayout"><div className="create"><h5>Créer un événement</h5><div className="grid"><label>Date<input type="date" value={form.event_date} onChange={e=>setForm(v=>({...v,event_date:e.target.value}))}/></label><label>Début<input type="time" value={form.start_time} onChange={e=>setForm(v=>({...v,start_time:e.target.value}))}/></label><label>Fin<input type="time" value={form.end_time} onChange={e=>setForm(v=>({...v,end_time:e.target.value}))}/></label><label>Type<select value={form.event_type} onChange={e=>setForm(v=>({...v,event_type:e.target.value,title:v.title==="Entraînement"?e.target.value:v.title}))}>{EVENT_TYPES.map(x=><option key={x}>{x}</option>)}</select></label><label className="wide">Titre<input value={form.title} onChange={e=>setForm(v=>({...v,title:e.target.value}))}/></label><label>Catégorie calendrier<select value={form.category_id} onChange={e=>setForm(v=>({...v,category_id:e.target.value}))}><option value="">Sans catégorie</option>{categories.map(c=><option value={c.id} key={c.id}>{c.name}</option>)}</select></label><label className="wide">Lieu<input value={form.location} onChange={e=>setForm(v=>({...v,location:e.target.value}))}/></label></div><div className="convoked"><div><b>Joueurs convoqués</b><button onClick={()=>setSelectedPlayers(players.map(p=>p.id))}>Tout</button><button onClick={()=>setSelectedPlayers([])}>Aucun</button></div><div className="players">{players.map(p=><label key={p.id}><input type="checkbox" checked={selectedPlayers.includes(p.id)} onChange={()=>toggle(selectedPlayers,p.id,setSelectedPlayers)}/><span>{p.first_name} {p.last_name}</span></label>)}</div></div><button className="primary" disabled={busy==="event"} onClick={createEvent}>{busy==="event"?"Création…":"Créer l’événement + feuille de présence"}</button></div><div className="upcoming"><h5>Événements de la sélection</h5>{events.map(e=>{const cat=categories.find(c=>c.id===e.category_id);return <article key={e.id} style={{borderLeftColor:cat?.color||"#6B1A2C"}}><div><b>{e.title}</b><span>{new Date(`${e.event_date}T12:00:00`).toLocaleDateString("fr-FR")} · {e.start_time?.slice(0,5)||"—"} · {e.location||"Lieu à définir"}</span></div><small>{cat?.name||e.event_type}</small></article>})}{!events.length&&<div className="empty">Aucun événement lié à cette sélection.</div>}</div></div>}
  {tab==="attendance"&&<div className="attendance">{latestSessions.map(s=><article className="session" key={s.id}><header><div><b>{s.title}</b><span>{new Date(`${s.session_date}T12:00:00`).toLocaleDateString("fr-FR")} · {s.location||"Lieu à définir"}</span></div><strong>{records.filter(r=>r.session_id===s.id&&r.status==="present").length}/{records.filter(r=>r.session_id===s.id).length} présents</strong></header><div className="attGrid">{players.filter(p=>records.some(r=>r.session_id===s.id&&r.player_id===p.id)).map(p=>{const row=records.find(r=>r.session_id===s.id&&r.player_id===p.id);return <div key={p.id}><span>{p.first_name} {p.last_name}</span><div>{(["present","excused","absent"] as const).map(st=><button key={st} className={row?.status===st?`active ${st}`:""} onClick={()=>setPresence(s.id,p.id,st)}>{st==="present"?"Présent":st==="excused"?"Excusé":"Absent"}</button>)}</div></div>})}</div></article>)}{!latestSessions.length&&<div className="empty">Crée un premier événement pour commencer le suivi des présences.</div>}</div>}
  {tab==="mail"&&<div className="mail"><div className="mailForm"><label>Objet<input value={mail.subject} onChange={e=>setMail(v=>({...v,subject:e.target.value}))}/></label><label>Corps du mail<textarea rows={10} value={mail.body} onChange={e=>setMail(v=>({...v,body:e.target.value}))}/></label><button className="primary" disabled={busy==="mail"} onClick={sendMail}>{busy==="mail"?"Envoi…":`Envoyer aux personnes cochées`}</button></div><div className="recipients"><div className="recipientHead"><b>Destinataires</b><div><button onClick={()=>setMailPlayers(players.map(p=>p.id))}>Tout cocher</button><button onClick={()=>setMailPlayers([])}>Tout décocher</button></div></div>{players.map(p=><label key={p.id}><input type="checkbox" checked={mailPlayers.includes(p.id)} onChange={()=>toggle(mailPlayers,p.id,setMailPlayers)}/><span><b>{p.first_name} {p.last_name}</b><small>{playerEmails(p).join(" · ")||"Aucun email joueur/tuteur"}</small></span></label>)}</div></div>}
  <style jsx>{`.ops{margin-top:18px;border-top:1px solid #eadfd8;padding-top:18px;display:grid;gap:12px}.opsHead small{color:#b17a21;font-weight:1000;letter-spacing:.12em}.opsHead h4{margin:4px 0;color:#4d1420;font-size:1.1rem}.opsHead p{margin:0;color:#7d6e66}.notice{padding:9px 12px;background:#eef8f1;border:1px solid #c8e1ce;color:#27623a;border-radius:10px;font-weight:900}.tabs{display:flex;gap:6px;overflow:auto}.tabs button{border:1px solid #dfd3ce;background:#fff;color:#6b1a2c;border-radius:999px;padding:8px 12px;font-weight:900;white-space:nowrap}.tabs button.on{background:#6b1a2c;color:#fff;border-color:#6b1a2c}.eventLayout,.mail{display:grid;grid-template-columns:1.1fr .9fr;gap:12px}.create,.upcoming,.mailForm,.recipients,.session{background:#fff;border:1px solid #eadfd8;border-radius:14px;padding:14px}.create h5,.upcoming h5{margin:0 0 10px;color:#4d1420;font-size:1rem}.grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px}.grid label,.mailForm label{display:grid;gap:5px;color:#6b1a2c;font-size:.72rem;font-weight:900}.grid .wide{grid-column:span 2}.grid input,.grid select,.mailForm input,.mailForm textarea{border:1px solid #ddcfc8;border-radius:9px;padding:9px;font:inherit;min-width:0}.convoked{margin:12px 0;padding:10px;border-radius:11px;background:#faf7f5;border:1px solid #eee3de}.convoked>div:first-child,.recipientHead{display:flex;justify-content:space-between;gap:8px;align-items:center}.convoked button,.recipientHead button{border:0;background:transparent;color:#6b1a2c;font-weight:900}.players{display:grid;grid-template-columns:repeat(2,1fr);gap:6px;margin-top:8px}.players label,.recipients>label{display:flex;align-items:center;gap:7px;border:1px solid #e9dfda;border-radius:9px;padding:8px;background:#fff}.primary{border:0;border-radius:10px;background:#6b1a2c;color:#fff;font-weight:900;padding:10px 13px}.upcoming{display:grid;align-content:start;gap:7px}.upcoming article{border:1px solid #eadfd8;border-left:5px solid #6b1a2c;border-radius:10px;padding:10px;display:flex;justify-content:space-between;gap:10px}.upcoming article b,.upcoming article span{display:block}.upcoming article span{color:#7c6f69;font-size:.72rem;margin-top:2px}.upcoming article small{color:#6b1a2c;font-weight:900}.attendance{display:grid;gap:9px}.session header{display:flex;justify-content:space-between;gap:12px}.session header b,.session header span{display:block}.session header span{font-size:.72rem;color:#80716b}.session header strong{color:#6b1a2c}.attGrid{display:grid;gap:6px;margin-top:10px}.attGrid>div{display:flex;justify-content:space-between;gap:10px;align-items:center;border-top:1px solid #f0e7e3;padding-top:7px}.attGrid button{border:1px solid #ded2cc;background:#fff;color:#695c57;border-radius:8px;padding:6px 8px;font-weight:850}.attGrid button.active.present{background:#e6f5e9;color:#1e6531;border-color:#b8debf}.attGrid button.active.excused{background:#fff4d9;color:#855d08;border-color:#efd18b}.attGrid button.active.absent{background:#fdebec;color:#9f2731;border-color:#efc2c6}.mailForm{display:grid;gap:10px}.recipients{display:grid;align-content:start;gap:7px}.recipients label span{display:grid}.recipients small{color:#8b7d77;font-size:.67rem}.empty{padding:22px;text-align:center;border:1px dashed #ddcfc8;border-radius:11px;color:#8b7d77}@media(max-width:950px){.eventLayout,.mail{grid-template-columns:1fr}.grid{grid-template-columns:1fr 1fr}}@media(max-width:600px){.grid,.players{grid-template-columns:1fr}.grid .wide{grid-column:auto}.attGrid>div,.session header{align-items:flex-start;flex-direction:column}}`}</style>
 </section>
}
