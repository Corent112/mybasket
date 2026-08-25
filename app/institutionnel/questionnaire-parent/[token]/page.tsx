"use client";
import { useEffect,useState } from "react";
const EMPTY={guardian1_name:"",guardian1_relation:"Mère",guardian1_email:"",guardian1_phone:"",guardian1_height_cm:"",
guardian2_name:"",guardian2_relation:"Père",guardian2_email:"",guardian2_phone:"",guardian2_height_cm:"",
address:"",postal_code:"",city:"",school_context:"",siblings_context:"",useful_context:""};

export default function Page({params}:{params:Promise<{token:string}>}){
 const[token,setToken]=useState("");const[meta,setMeta]=useState<any>(null),[form,setForm]=useState<any>(EMPTY),[msg,setMsg]=useState("Chargement…"),[done,setDone]=useState(false);
 useEffect(()=>{void params.then(async x=>{setToken(x.token);const r=await fetch(`/api/institutionnel/parent-questionnaire/${x.token}`);const j=await r.json();
 if(!r.ok)return setMsg(j.error||"Lien indisponible");setMeta(j);setForm({...EMPTY,...j.response});setMsg("")})},[params]);
 async function send(e:React.FormEvent){e.preventDefault();const r=await fetch(`/api/institutionnel/parent-questionnaire/${token}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(form)});
 const j=await r.json();if(!r.ok)return setMsg(j.error||"Erreur");setDone(true)}
 if(msg)return <main className="shell"><div className="card">{msg}</div><style jsx>{css}</style></main>;
 if(done)return <main className="shell"><div className="card"><h1>Merci</h1><p>Les informations ont bien été transmises.</p></div><style jsx>{css}</style></main>;
 const F=({k,l,type="text"}:{k:string,l:string,type?:string})=><label>{l}<input type={type} value={form[k]||""} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>;
 const T=({k,l}:{k:string,l:string})=><label className="wide">{l}<textarea rows={3} value={form[k]||""} onChange={e=>setForm({...form,[k]:e.target.value})}/></label>;
 return <main className="shell"><form className="card" onSubmit={send}><p className="eyebrow">{meta?.structure?.name||"MYBASKET"}</p><h1>Informations famille</h1>
 <p className="intro">{meta?.player?.first_name} {meta?.player?.last_name}</p>
 <h2>Responsable 1</h2><div className="grid"><F k="guardian1_name" l="Nom et prénom"/><F k="guardian1_relation" l="Lien avec le joueur"/><F k="guardian1_email" l="Email" type="email"/><F k="guardian1_phone" l="Téléphone"/><F k="guardian1_height_cm" l="Taille (cm)"/></div>
 <h2>Responsable 2</h2><div className="grid"><F k="guardian2_name" l="Nom et prénom"/><F k="guardian2_relation" l="Lien avec le joueur"/><F k="guardian2_email" l="Email" type="email"/><F k="guardian2_phone" l="Téléphone"/><F k="guardian2_height_cm" l="Taille (cm)"/></div>
 <h2>Contexte</h2><div className="grid"><F k="address" l="Adresse"/><F k="postal_code" l="Code postal"/><F k="city" l="Ville"/><T k="school_context" l="Contexte scolaire utile"/><T k="siblings_context" l="Fratrie / contexte familial utile"/><T k="useful_context" l="Autre information utile à l'accompagnement"/></div>
 <p className="privacy">Ces informations sont destinées au suivi du joueur par la structure qui vous a transmis ce lien.</p><button>Enregistrer et transmettre</button></form><style jsx>{css}</style></main>
}
const css=`.shell{min-height:100vh;background:#f7f3f0;padding:24px 14px}.card{max-width:850px;margin:auto;background:white;border:1px solid #eadfd8;border-radius:18px;padding:20px}.eyebrow{color:#d4a24c;font-size:.7rem;font-weight:1000;letter-spacing:.12em}.intro{color:#756761}h1,h2{color:#6b1a2c}h2{font-size:1rem;border-top:1px solid #eee4df;padding-top:14px;margin-top:18px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:9px}label{display:grid;gap:4px;font-size:.78rem;font-weight:800;color:#675a54}.wide{grid-column:1/-1}input,textarea{border:1px solid #ddd1ca;border-radius:8px;padding:10px;font:inherit}.privacy{font-size:.75rem;color:#80716a}button{border:0;border-radius:9px;padding:11px 14px;background:#6b1a2c;color:#fff;font-weight:900}@media(max-width:650px){.grid{grid-template-columns:1fr}.wide{grid-column:auto}}`;
