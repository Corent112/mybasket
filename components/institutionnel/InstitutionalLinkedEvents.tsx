"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import InstitutionalResources from "@/components/institutionnel/InstitutionalResources";

type Scope = "training" | "player";
type EventRow = {
  id:string; title:string; event_date:string; start_time:string|null; end_time:string|null;
  location:string|null; event_type:string; event_domain:"training"|"player"; description:string|null; cohort_id:string|null;
};
type Resource = { id:string; event_id:string; title:string; resource_type:string; completed:boolean };

type Props = { structureId:string; scope:Scope; cohortId?:string|null };

const today=()=>new Date().toISOString().slice(0,10);
const fmt=(d:string)=>new Date(`${d}T12:00:00`).toLocaleDateString("fr-FR",{weekday:"short",day:"2-digit",month:"short",year:"numeric"});

export default function InstitutionalLinkedEvents({structureId,scope,cohortId}:Props){
  const sb=useMemo(()=>createClient(),[]);
  const [events,setEvents]=useState<EventRow[]>([]);
  const [resources,setResources]=useState<Resource[]>([]);
  const [selectedId,setSelectedId]=useState("");
  const [showCreate,setShowCreate]=useState(false);
  const [busy,setBusy]=useState(false);
  const [form,setForm]=useState({title:"",event_date:today(),start_time:"09:00",end_time:"17:00",location:"",event_type:scope==="training"?"formation":"stage",description:""});

  async function load(){
    let q=sb.from("institutional_events").select("id,title,event_date,start_time,end_time,location,event_type,event_domain,description,cohort_id").eq("structure_id",structureId).eq("archived",false).order("event_date");
    q=q.eq("event_domain",scope);
    const [e,r]=await Promise.all([q,sb.from("institutional_event_resources").select("id,event_id,title,resource_type,completed").eq("structure_id",structureId)]);
    setEvents((e.data||[]) as EventRow[]); setResources((r.data||[]) as Resource[]);
    const rows=(e.data||[]) as EventRow[];
    setSelectedId(v=>v&&rows.some(x=>x.id===v)?v:(rows[0]?.id||""));
  }
  useEffect(()=>{void load()},[structureId,scope,cohortId]); // eslint-disable-line react-hooks/exhaustive-deps

  const selected=events.find(e=>e.id===selectedId)||null;
  const selectedResources=resources.filter(r=>r.event_id===selectedId);
  const complete=selectedResources.filter(r=>r.completed).length;

  async function createEvent(){
    if(!form.title.trim())return alert("Donne un titre à l’événement.");
    const {data:{user}}=await sb.auth.getUser(); if(!user)return;
    setBusy(true);
    const q=await sb.from("institutional_events").insert({
      structure_id:structureId, title:form.title.trim(), event_date:form.event_date,
      start_time:form.start_time||null,end_time:form.end_time||null,location:form.location.trim()||null,
      event_type:scope==="training"?"formation":form.event_type, event_domain:scope, description:form.description.trim()||null,
      cohort_id:scope==="training"?(cohortId||null):null, created_by:user.id
    }).select("id").single();
    setBusy(false); if(q.error)return alert(q.error.message);
    setShowCreate(false); setForm({title:"",event_date:today(),start_time:"09:00",end_time:"17:00",location:"",event_type:scope==="training"?"formation":"stage",description:""});
    await load(); setSelectedId(String(q.data.id));
  }

  async function toggleResource(r:Resource){
    const q=await sb.from("institutional_event_resources").update({completed:!r.completed,updated_at:new Date().toISOString()}).eq("id",r.id);
    if(q.error)return alert(q.error.message); await load();
  }

  return <section className="linkedEvents">
    <header><div><p>{scope==="training"?"ÉVÉNEMENTS DE LA FORMATION":"ÉVÉNEMENTS FORMATION DU JOUEUR"}</p><h3>Préparer les événements</h3><span>Ce sont les mêmes événements que dans le Calendrier Institution. Toute modification est donc visible aux deux endroits.</span></div><button onClick={()=>setShowCreate(v=>!v)}>+ Nouvel événement</button></header>
    {showCreate&&<div className="create"><input value={form.title} onChange={e=>setForm({...form,title:e.target.value})} placeholder={scope==="training"?"Ex. Journée 2 - BFA":"Ex. Stage U13 - Toussaint"}/><input type="date" value={form.event_date} onChange={e=>setForm({...form,event_date:e.target.value})}/><input type="time" value={form.start_time} onChange={e=>setForm({...form,start_time:e.target.value})}/><input type="time" value={form.end_time} onChange={e=>setForm({...form,end_time:e.target.value})}/><input value={form.location} onChange={e=>setForm({...form,location:e.target.value})} placeholder="Lieu (facultatif)"/>{scope==="player"&&<select value={form.event_type} onChange={e=>setForm({...form,event_type:e.target.value})}><option value="stage">Stage</option><option value="selection">Sélection</option><option value="detection">Détection</option></select>}<textarea value={form.description} onChange={e=>setForm({...form,description:e.target.value})} placeholder="Objectif, consignes, informations utiles…"/><div><button className="ghost" onClick={()=>setShowCreate(false)}>Annuler</button><button disabled={busy} onClick={()=>void createEvent()}>{busy?"Création…":"Créer dans le calendrier"}</button></div></div>}
    <div className="layout"><aside>{events.map(e=>{const rs=resources.filter(r=>r.event_id===e.id);const done=rs.filter(r=>r.completed).length;return <button key={e.id} onClick={()=>setSelectedId(e.id)} className={selectedId===e.id?"event on":"event"}><time>{fmt(e.event_date)}</time><b>{e.title}</b><small>{e.start_time?.slice(0,5)||""}{e.end_time?` - ${e.end_time.slice(0,5)}`:""}</small>{!e.location?<strong>⚠ Lieu manquant</strong>:<span>{e.location}</span>}<em>{done}/{rs.length} préparés</em></button>})}{events.length===0&&<div className="empty">Aucun événement lié pour le moment.</div>}</aside>
      <main>{selected?<><div className="eventHead"><div><small>{selected.event_type.toUpperCase()}</small><h4>{selected.title}</h4><span>{fmt(selected.event_date)} · {selected.start_time?.slice(0,5)||"—"}{selected.end_time?` - ${selected.end_time.slice(0,5)}`:""}</span></div>{!selected.location&&<strong>⚠ Point d’attention : aucun lieu renseigné</strong>}</div>
        <div className="check"><h5>Préparation</h5>{selectedResources.map(r=><label key={r.id} className={r.completed?"done":""}><input type="checkbox" checked={r.completed} onChange={()=>void toggleResource(r)}/><span><b>{r.title}</b><small>{r.resource_type}</small></span></label>)}{selectedResources.length===0&&<p>Aucun élément de préparation. Crée les documents ci-dessous.</p>}<div className="score">{complete}/{selectedResources.length} éléments finalisés</div></div>
        <div className="documents"><div><p>NOTES & DOCUMENTS</p><h5>Créer depuis les modèles</h5><span>Tous les modèles sont préconçus mais leur contenu reste entièrement modifiable avant enregistrement ou impression.</span></div><InstitutionalResources structureId={structureId} compact eventId={selected.id} eventTitle={selected.title} categories={scope==="training"?["Formation","Communication","Événementiel"]:["Joueurs","Sélection / Stage","Communication","Événementiel"]}/></div>
      </>:<div className="empty big">Sélectionne un événement pour le préparer.</div>}</main>
    </div>
    <style jsx>{`.linkedEvents{display:grid;gap:12px;background:#fff;border:1px solid #eadfd8;border-radius:16px;padding:14px}.linkedEvents>header{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.linkedEvents header p,.documents>div>p{margin:0;color:#b37a20;font-size:.67rem;font-weight:1000;letter-spacing:.1em}.linkedEvents h3{margin:3px 0;color:#4d1420}.linkedEvents header span,.documents>div>span{font-size:.75rem;color:#7d6f73}.linkedEvents button{border:0;border-radius:9px;padding:9px 11px;background:#6b1a2c;color:#fff;font-weight:900;cursor:pointer}.create{display:grid;grid-template-columns:1.4fr 145px 100px 100px 1.2fr 130px;gap:7px;padding:12px;background:#faf6f3;border-radius:12px}.create textarea{grid-column:1/-1;min-height:70px}.create>div{grid-column:1/-1;display:flex;justify-content:flex-end;gap:7px}.create input,.create select,.create textarea{border:1px solid #ddd1ca;border-radius:8px;padding:8px;background:#fff}.ghost{background:#fff!important;color:#6b1a2c!important;border:1px solid #d7bcc3!important}.layout{display:grid;grid-template-columns:280px minmax(0,1fr);gap:12px}.layout>aside{display:grid;gap:7px;align-content:start}.event{display:grid!important;text-align:left;background:#fff!important;color:#49383d!important;border:1px solid #e6dad5!important}.event.on{border-color:#d4a24c!important;background:#fff9ed!important;box-shadow:0 0 0 2px #d4a24c22}.event time{font-size:.61rem;color:#9a796e;text-transform:capitalize}.event b{margin:2px 0}.event small,.event span{font-size:.66rem;color:#7e7074}.event strong{font-size:.65rem;color:#a32929;margin-top:3px}.event em{font-style:normal;font-size:.61rem;color:#6b1a2c;margin-top:5px}.layout>main{min-width:0;display:grid;gap:10px}.eventHead{display:flex;justify-content:space-between;gap:10px;padding:12px;border:1px solid #eadfd8;border-radius:12px}.eventHead small{color:#b37a20;font-weight:900}.eventHead h4{margin:3px 0;color:#4d1420}.eventHead span{font-size:.72rem;color:#796b70}.eventHead>strong{align-self:flex-start;background:#fdebec;color:#a1242f;border-radius:9px;padding:7px 9px;font-size:.68rem}.check{border:1px solid #eadfd8;border-radius:12px;padding:11px}.check h5,.documents h5{margin:0 0 8px;color:#4d1420;font-size:.9rem}.check label{display:flex;gap:8px;align-items:center;padding:7px;border-top:1px solid #f0e6e2}.check label.done{background:#f1f8f2}.check label span{display:grid}.check label small{color:#83757a}.check p,.score{font-size:.7rem;color:#82757a}.score{text-align:right;font-weight:900;color:#6b1a2c}.documents{border-top:1px solid #eadfd8;padding-top:12px;display:grid;gap:10px}.empty{padding:16px;text-align:center;color:#8a7a7e;border:1px dashed #ddd0ca;border-radius:10px}.empty.big{padding:45px}@media(max-width:900px){.layout{grid-template-columns:1fr}.layout>aside{grid-template-columns:repeat(2,minmax(0,1fr))}.create{grid-template-columns:1fr 1fr}}@media(max-width:650px){.linkedEvents>header,.eventHead{flex-direction:column}.layout>aside,.create{grid-template-columns:1fr}.create textarea,.create>div{grid-column:auto}}`}</style>
  </section>;
}
