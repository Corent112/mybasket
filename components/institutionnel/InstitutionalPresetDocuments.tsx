"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Structure = { id:string; name:string; short_name:string|null; city:string|null; email:string|null; season_label:string|null; logo_url:string|null; document_primary_color:string|null; document_secondary_color:string|null };
type SavedDoc = { id:string; title:string; document_type:string; content:any; created_at?:string };
type TemplateKey = "coach_registration" | "parental_authorization";

type Field = { key:string; label:string; type?:"text"|"date"|"email"|"tel"|"textarea"|"checkbox"|"select"; options?:string[]; span?:2; placeholder?:string };
type Section = { title:string; fields:Field[] };
type Template = { key:TemplateKey; title:string; description:string; sections:Section[] };

const templates:Template[] = [
  { key:"coach_registration", title:"Fiche d’inscription cadre", description:"Inscription à une formation, informations personnelles, structure, autorisations et signatures.", sections:[
    {title:"Informations personnelles",fields:[
      {key:"last_name",label:"Nom",placeholder:"Nom"},{key:"first_name",label:"Prénom(s)",placeholder:"Prénom(s)"},{key:"gender",label:"Genre",type:"select",options:["","Féminin","Masculin","Autre"]},{key:"license_number",label:"N° de licence"},
      {key:"birthdate",label:"Né(e) le",type:"date"},{key:"birthplace",label:"À"},{key:"birth_department",label:"N° de département"},{key:"address",label:"Adresse du domicile",span:2},
      {key:"postal_code",label:"Code postal"},{key:"city",label:"Ville"},{key:"phone",label:"Téléphone",type:"tel"},{key:"email",label:"E-mail",type:"email"},{key:"last_degree",label:"Dernier diplôme obtenu"},{key:"degree_year",label:"Année d’obtention"},
    ]},
    {title:"Formation suivie",fields:[
      {key:"training_name",label:"Intitulé de la formation",span:2},{key:"training_start",label:"Début",type:"date"},{key:"training_end",label:"Fin",type:"date"},{key:"training_location",label:"Lieu",span:2},
    ]},
    {title:"Structure",fields:[
      {key:"club_name",label:"Nom du club / structure"},{key:"affiliation_number",label:"N° d’affiliation"},{key:"president_last_name",label:"Nom du président"},{key:"president_first_name",label:"Prénom du président"},{key:"president_phone",label:"Téléphone",type:"tel"},{key:"president_email",label:"E-mail",type:"email"},
    ]},
    {title:"Autorisations",fields:[
      {key:"certify_information",label:"Je certifie exacts les renseignements portés sur ce document.",type:"checkbox",span:2},{key:"other_registration",label:"Je certifie ne pas être inscrit(e) dans une autre structure pour la même formation.",type:"checkbox",span:2},{key:"image_authorization",label:"J’autorise l’institution à utiliser ma photographie dans le cadre de ses activités.",type:"checkbox",span:2},
    ]},
    {title:"Signatures",fields:[
      {key:"signed_city",label:"Fait à"},{key:"signed_date",label:"Le",type:"date"},{key:"trainee_signature",label:"Signature du stagiaire",type:"textarea"},{key:"president_signature",label:"Signature du responsable / président",type:"textarea"},
    ]},
  ]},
  { key:"parental_authorization", title:"Autorisation parentale", description:"Autorisation de participation d’un mineur, droit à l’image et signature du responsable légal.", sections:[
    {title:"Responsable légal",fields:[
      {key:"guardian_last_name",label:"Nom"},{key:"guardian_first_name",label:"Prénom"},{key:"guardian_address",label:"Adresse",span:2},{key:"guardian_phone",label:"Téléphone",type:"tel"},{key:"guardian_email",label:"E-mail",type:"email"},{key:"relation",label:"Qualité",type:"select",options:["Père","Mère","Tuteur / tutrice","Autre"]},
    ]},
    {title:"Enfant",fields:[
      {key:"child_last_name",label:"Nom"},{key:"child_first_name",label:"Prénom"},{key:"child_birthdate",label:"Date de naissance",type:"date"},{key:"child_club",label:"Club / structure"},
    ]},
    {title:"Action autorisée",fields:[
      {key:"event_name",label:"Stage / rassemblement / action",span:2},{key:"event_start",label:"Début",type:"date"},{key:"event_end",label:"Fin",type:"date"},{key:"event_location",label:"Lieu",span:2},
    ]},
    {title:"Autorisations",fields:[
      {key:"participation_authorized",label:"J’autorise mon enfant à participer à l’action indiquée ci-dessus.",type:"checkbox",span:2},{key:"photo_authorized",label:"J’autorise les prises de vues photographiques et audiovisuelles dans le cadre des activités de l’institution.",type:"checkbox",span:2},{key:"diffusion_authorized",label:"J’autorise la diffusion non commerciale de ces images sur les supports de communication de l’institution.",type:"checkbox",span:2},{key:"parental_authority",label:"Je certifie disposer de l’autorité parentale sur cet enfant.",type:"checkbox",span:2},
    ]},
    {title:"Signature",fields:[
      {key:"signed_city",label:"Fait à"},{key:"signed_date",label:"Le",type:"date"},{key:"guardian_signature",label:"Signature du responsable légal",type:"textarea",span:2},
    ]},
  ]},
];

const emptyValues = (t:Template) => Object.fromEntries(t.sections.flatMap(s=>s.fields).map(f=>[f.key, f.type==="checkbox"?false:""]));
const esc = (v:unknown) => String(v??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]!));
const hex=(v:string|null|undefined,fallback:string)=>/^#[0-9a-fA-F]{6}$/.test(String(v||""))?String(v).toUpperCase():fallback;
const primary=(s:Structure)=>hex(s.document_primary_color,"#6B1A2C");
const secondary=(s:Structure)=>hex(s.document_secondary_color,"#D4A24C");

export default function InstitutionalPresetDocuments({structureId}:{structureId:string}){
  const supabase=useMemo(()=>createClient(),[]);
  const[structure,setStructure]=useState<Structure|null>(null);
  const[saved,setSaved]=useState<SavedDoc[]>([]);
  const[active,setActive]=useState<Template|null>(null);
  const[docId,setDocId]=useState<string|null>(null);
  const[values,setValues]=useState<Record<string,any>>({});
  const[title,setTitle]=useState("");
  const[busy,setBusy]=useState(false);
  const[message,setMessage]=useState("");

  async function load(){
    const[a,b]=await Promise.all([
      supabase.from("institutional_structures").select("id,name,short_name,city,email,season_label,logo_url,document_primary_color,document_secondary_color").eq("id",structureId).single(),
      supabase.from("institutional_documents").select("id,title,document_type,content,created_at").eq("structure_id",structureId).eq("document_type","preset_form").order("created_at",{ascending:false})
    ]);
    if(a.data)setStructure(a.data as Structure);setSaved((b.data||[]) as SavedDoc[]);
  }
  useEffect(()=>{void load()},[structureId]); // eslint-disable-line

  function newDoc(t:Template){setActive(t);setDocId(null);setTitle(t.title);setValues(emptyValues(t));}
  function openSaved(d:SavedDoc){const t=templates.find(x=>x.key===d.content?.template_key);if(!t)return;setActive(t);setDocId(d.id);setTitle(d.title||t.title);setValues({...emptyValues(t),...(d.content?.values||{})});}
  function close(){setActive(null);setDocId(null);setValues({});setTitle("");}
  function setField(key:string,value:any){setValues(v=>({...v,[key]:value}));}
  async function save(){if(!active)return;setBusy(true);setMessage("");try{const{data:{user}}=await supabase.auth.getUser();if(!user)throw new Error("Session expirée");const payload={structure_id:structureId,title:title.trim()||active.title,document_type:"preset_form",content:{template_key:active.key,values,updated_at:new Date().toISOString()},created_by:user.id};let q;if(docId)q=await supabase.from("institutional_documents").update({title:payload.title,content:payload.content}).eq("id",docId).select("id").single();else q=await supabase.from("institutional_documents").insert(payload).select("id").single();if(q.error)throw q.error;setDocId(q.data.id);await load();setMessage("Document enregistré");}catch(e){alert(e instanceof Error?e.message:"Enregistrement impossible")}finally{setBusy(false)}}
  async function remove(d:SavedDoc){if(!confirm(`Supprimer « ${d.title} » ?`))return;await supabase.from("institutional_documents").delete().eq("id",d.id);await load()}

  function printDocument(){if(!active||!structure)return;const html=renderPrintable(active,structure,title,values);const w=window.open("","_blank");if(!w)return alert("Autorise les fenêtres pop-up pour imprimer.");w.document.open();w.document.write(html);w.document.close();setTimeout(()=>w.print(),250)}

  return <div className="pd-root">
    <section className="pd-templates"><div className="pd-heading"><div><b>Documents préconçus</b><span>Ouvre un modèle, remplis-le directement, enregistre-le et imprime-le.</span></div></div><div className="pd-template-grid">{templates.map(t=><article key={t.key}><div className="pd-icon">📄</div><div><h3>{t.title}</h3><p>{t.description}</p></div><button onClick={()=>newDoc(t)}>Ouvrir et remplir</button></article>)}</div></section>
    <section className="pd-saved"><div className="pd-heading"><div><b>Documents enregistrés</b><span>{saved.length} document(s)</span></div></div>{saved.length===0?<div className="pd-empty">Aucun document rempli pour le moment.</div>:<div className="pd-saved-list">{saved.map(d=><article key={d.id}><div><b>{d.title}</b><span>{templates.find(t=>t.key===d.content?.template_key)?.title||"Document"}</span></div><div><button onClick={()=>openSaved(d)}>Ouvrir / modifier</button><button className="danger" onClick={()=>void remove(d)}>Supprimer</button></div></article>)}</div>}</section>

    {active&&structure&&<div className="pd-modal" role="dialog" aria-modal="true"><div className="pd-dialog"><div className="pd-toolbar"><button className="ghost" onClick={close}>← Fermer</button><input value={title} onChange={e=>setTitle(e.target.value)} aria-label="Titre du document"/><div className="pd-actions"><button className="ghost" onClick={printDocument}>🖨 Imprimer / PDF</button><button onClick={()=>void save()} disabled={busy}>{busy?"Enregistrement…":"💾 Enregistrer"}</button></div></div>{message&&<div className="pd-success">✓ {message}</div>}<div className="pd-paper" style={{"--doc-primary":primary(structure),"--doc-secondary":secondary(structure)} as any}><header><div className="pd-brand">{structure.logo_url?<img src={structure.logo_url} alt={`Logo ${structure.name}`}/>:<span>MYBASKET</span>}</div><div className="pd-inst"><strong>{structure.name}</strong><span>{structure.season_label||""}{structure.city?` · ${structure.city}`:""}</span></div></header><h1>{active.title}</h1>{active.sections.map(sec=><section key={sec.title}><h2>{sec.title}</h2><div className="pd-fields">{sec.fields.map(f=><label key={f.key} className={f.span===2?"wide":""}>{f.type!=="checkbox"&&<span>{f.label}</span>}{f.type==="textarea"?<textarea value={values[f.key]||""} onChange={e=>setField(f.key,e.target.value)}/>:f.type==="select"?<select value={values[f.key]||""} onChange={e=>setField(f.key,e.target.value)}>{(f.options||[]).map(o=><option key={o} value={o}>{o||"—"}</option>)}</select>:f.type==="checkbox"?<span className="pd-check"><input type="checkbox" checked={!!values[f.key]} onChange={e=>setField(f.key,e.target.checked)}/><span>{f.label}</span></span>:<input type={f.type||"text"} placeholder={f.placeholder} value={values[f.key]||""} onChange={e=>setField(f.key,e.target.value)}/>}</label>)}</div></section>)}</div></div></div>}
    <style jsx>{`
      .pd-root{display:grid;gap:18px}.pd-heading{display:flex;justify-content:space-between;align-items:end;margin-bottom:10px}.pd-heading div{display:grid;gap:2px}.pd-heading b{font-size:1rem;color:#321015}.pd-heading span{font-size:.78rem;color:#81736c}.pd-template-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.pd-template-grid article{border:1px solid #eadfd9;border-radius:13px;background:#fff;padding:14px;display:grid;grid-template-columns:auto 1fr auto;gap:12px;align-items:center}.pd-icon{width:44px;height:44px;border-radius:10px;background:#f7eee9;display:grid;place-items:center;font-size:1.35rem}.pd-template-grid h3{margin:0 0 3px;font-size:.95rem}.pd-template-grid p{margin:0;color:#786a63;font-size:.76rem;line-height:1.35}.pd-root button{border:0;border-radius:9px;background:#6b1a2c;color:white;padding:9px 12px;font-weight:800;cursor:pointer}.pd-empty{padding:16px;border:1px dashed #dccbc3;border-radius:10px;color:#82736d;text-align:center}.pd-saved-list{display:grid;gap:7px}.pd-saved-list article{border:1px solid #eadfd9;border-radius:10px;padding:10px 12px;display:flex;justify-content:space-between;gap:10px;align-items:center}.pd-saved-list article>div:first-child{display:grid}.pd-saved-list span{font-size:.72rem;color:#8c7c75}.pd-saved-list article>div:last-child{display:flex;gap:6px}.pd-saved-list .danger{background:#fff;color:#9b2737;border:1px solid #dfbec5}.pd-modal{position:fixed;inset:0;background:rgba(26,14,16,.62);z-index:9999;overflow:auto;padding:22px}.pd-dialog{max-width:1050px;margin:0 auto}.pd-toolbar{position:sticky;top:0;z-index:2;background:#fff;border-radius:12px;padding:10px;display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;box-shadow:0 8px 30px rgba(0,0,0,.16)}.pd-toolbar input{border:1px solid #dbcac4;border-radius:8px;padding:9px 10px;font-weight:800;min-width:0}.pd-actions{display:flex;gap:7px}.pd-root .ghost{background:#fff;color:#6b1a2c;border:1px solid #d8bbc2}.pd-success{background:#e9f7ee;color:#22663c;border-radius:8px;padding:8px 12px;margin:8px 0;font-size:.8rem;font-weight:800}.pd-paper{position:relative;overflow:hidden;background:white;max-width:850px;margin:14px auto;padding:102px 34px 40px;box-shadow:0 14px 42px rgba(67,23,35,.18);min-height:0}.pd-paper:before{content:"";position:absolute;left:-8%;right:-8%;top:-85px;height:175px;background:var(--doc-primary,#6b1a2c);border-radius:0 0 48% 52%/0 0 32% 36%;transform:rotate(-1deg)}.pd-paper:after{content:"";position:absolute;left:-5%;right:-5%;top:88px;height:6px;background:var(--doc-secondary,#d4a24c);border-radius:50%}.pd-paper header{position:absolute;z-index:1;left:40px;right:40px;top:28px;display:flex;justify-content:space-between;gap:20px;color:#fff}.pd-brand{font-weight:1000;color:#fff;letter-spacing:.08em;display:flex;align-items:center;min-width:0}.pd-brand img{display:block;max-width:118px;max-height:48px;object-fit:contain;background:#fff;border-radius:6px;padding:3px}.pd-inst{display:grid;text-align:right}.pd-inst span{font-size:.72rem;color:#f3dfe3}.pd-paper h1{text-align:left;color:var(--doc-primary,#4d101d);font-size:1.55rem;margin:18px 0 28px}.pd-paper section{position:relative;margin:16px 0;padding-left:14px}.pd-paper section:before{content:"";position:absolute;left:0;top:0;width:4px;height:32px;border-radius:8px;background:var(--doc-secondary,#d4a24c)}.pd-paper h2{font-size:.88rem;text-transform:uppercase;letter-spacing:.05em;background:none;border:0;margin:0 0 8px;padding:0;color:var(--doc-primary,#6b1a2c)}.pd-fields{display:grid;grid-template-columns:1fr 1fr;padding:0;gap:7px 14px}.pd-fields label{display:grid;gap:4px;font-size:.74rem;font-weight:700;color:#5a4c46}.pd-fields label.wide{grid-column:1/-1}.pd-fields input,.pd-fields select,.pd-fields textarea{width:100%;border:0;border-bottom:1px solid #cdbfc3;padding:5px 2px;background:#fff;font:inherit;font-weight:500;box-sizing:border-box}.pd-fields textarea{border:1px solid #c8bbb5;min-height:48px;resize:vertical}.pd-check{display:flex;gap:9px;align-items:flex-start;font-weight:500;line-height:1.35}.pd-check input{width:18px;height:18px;flex:none}.pd-actions button:disabled{opacity:.55;cursor:default}@media(max-width:750px){.pd-template-grid{grid-template-columns:1fr}.pd-template-grid article{grid-template-columns:auto 1fr}.pd-template-grid article>button{grid-column:1/-1}.pd-modal{padding:8px}.pd-toolbar{grid-template-columns:1fr 1fr}.pd-toolbar input{grid-column:1/-1;grid-row:2}.pd-actions{justify-content:flex-end}.pd-paper{padding:22px 16px;min-height:0}.pd-fields{grid-template-columns:1fr}.pd-fields label.wide{grid-column:auto}.pd-saved-list article{align-items:flex-start;flex-direction:column}}
    `}</style>
  </div>
}

function renderPrintable(t:Template,s:Structure,title:string,v:Record<string,any>){
 const p=primary(s),a=secondary(s);
 const fieldHtml=(f:Field)=>{const val=v[f.key];if(f.type==="checkbox")return `<div class="check ${f.span===2?"wide":""}"><span class="box">${val?"✓":""}</span><div>${esc(f.label)}</div></div>`;return `<div class="field ${f.span===2?"wide":""}"><label>${esc(f.label)}</label><div class="value">${f.type==="textarea"?esc(val).replace(/\n/g,"<br>"):esc(val)||"&nbsp;"}</div></div>`};
 const logo=s.logo_url?`<img class="logo" src="${esc(s.logo_url)}" alt="Logo">`:`<div class="brand">MYBASKET</div>`;
 return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>
 @page{size:A4;margin:0}*{box-sizing:border-box}html,body{width:210mm;min-height:297mm;margin:0}body{font-family:Arial,sans-serif;color:#2c2523;padding:30mm 13mm 14mm;position:relative;font-size:9px;-webkit-print-color-adjust:exact;print-color-adjust:exact;overflow-x:hidden}
 body:before{content:"";position:absolute;left:-10%;right:-10%;top:-28mm;height:53mm;background:${p};border-radius:0 0 48% 52%/0 0 32% 36%;transform:rotate(-1deg);z-index:-1}
 body:after{content:"";position:absolute;left:-5%;right:-5%;top:25mm;height:1.6mm;background:${a};border-radius:50%;z-index:-1}
 .head{position:absolute;top:7mm;left:13mm;right:13mm;height:15mm;display:flex;justify-content:space-between;align-items:flex-start;color:#fff;gap:7mm}.logo{max-width:30mm;max-height:13mm;object-fit:contain;background:#fff;border-radius:1.5mm;padding:1mm}.brand{font-weight:900;letter-spacing:.06em}.inst{text-align:right;min-width:0}.inst small{display:block;color:#f7eef1;margin-top:1mm}
 h1{color:${p};font-size:19px;line-height:1.05;letter-spacing:-.02em;margin:3mm 0 4mm}
 section{position:relative;margin:4mm 0;break-inside:avoid;padding-left:4mm}section:before{content:"";position:absolute;left:0;top:0;width:.8mm;height:7mm;border-radius:2mm;background:${a}}
 h2{font-size:9.5px;text-transform:uppercase;letter-spacing:.04em;color:${p};margin:0 0 1.8mm}
 .grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:1.6mm 5mm;min-width:0}
 .field{min-width:0;min-height:8.5mm;border-bottom:.25mm solid #d4c6ca;padding:1mm 0}.wide{grid-column:1/-1}.field label{font-size:6.2px;text-transform:uppercase;letter-spacing:.05em;color:#806f74;font-weight:bold;display:block;margin-bottom:.8mm}.value{min-height:3.8mm;font-size:9px;line-height:1.25;overflow-wrap:anywhere;word-break:break-word}
 .check{display:flex;gap:2mm;align-items:flex-start;background:#fbf7f8;border:.25mm solid #eee4e6;padding:1.5mm 2mm;border-radius:1.5mm;font-size:8.5px;line-height:1.25;min-width:0}.check .box{display:grid;place-items:center;width:4mm;height:4mm;flex:0 0 4mm;border:.35mm solid ${p};border-radius:.6mm;color:${p};font-size:10px;font-weight:900;background:#fff}
 .footer{position:absolute;left:13mm;right:13mm;bottom:5mm;border-top:.25mm solid #eadfe2;padding-top:1.5mm;font-size:6.5px;color:#8a777d;text-align:center}
 @media print{body{overflow:visible}}
 </style></head><body><div class="head"><div>${logo}</div><div class="inst"><b>${esc(s.name)}</b><small>${esc(s.season_label||"")}${s.city?` · ${esc(s.city)}`:""}</small></div></div><h1>${esc(t.title)}</h1>${t.sections.map(sec=>`<section><h2>${esc(sec.title)}</h2><div class="grid">${sec.fields.map(fieldHtml).join("")}</div></section>`).join("")}<div class="footer">${esc(s.name)} · Document institutionnel généré depuis MyBasket</div></body></html>`
}
