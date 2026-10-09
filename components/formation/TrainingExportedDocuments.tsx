"use client";
import {useEffect, useState} from "react";
export default function TrainingExportedDocuments({cohortId}: {cohortId: string}) {
  const [documents, setDocuments] = useState<{id: string; title: string; file_url: string; created_at: string}[]>([]);
  const [error, setError] = useState("");
  const [revision,setRevision]=useState(0);
  const [uploading,setUploading]=useState(false);
  async function upload(file:File){setUploading(true);setError("");try{const form=new FormData();form.set("cohortId",cohortId);form.set("file",file);const response=await fetch("/api/institutionnel/training/exported-documents",{method:"POST",body:form});const json=await response.json();if(!response.ok)throw new Error(json.error||"Ajout impossible");setRevision(value=>value+1);}catch(e){setError(e instanceof Error?e.message:"Ajout impossible");}finally{setUploading(false);}}
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let active = true;
    setDocuments([]); setError(""); setLoading(true);
    void fetch(`/api/institutionnel/training/exported-documents?cohortId=${encodeURIComponent(cohortId)}`).then(async response => {
      const json = await response.json();
      if (!response.ok) throw new Error(json.error || "Chargement impossible");
      if(active) setDocuments(json.documents || []);
    }).catch(e => {if(active) setError(e.message);}).finally(() => {if(active) setLoading(false);});
    return () => {active = false;};
  }, [cohortId,revision]);
  return <section className="exports"><h3>Documents de la formation</h3><p>Vos supports de formation et les exports : planning, participants et feuilles d’émargement.</p><label>{uploading?"Enregistrement…":"+ Ajouter un document"}<input disabled={uploading} type="file" accept=".pdf,.csv,.xlsx,.xls,.docx,.doc,.pptx,.ppt,.png,.jpg,.jpeg" onChange={event=>{const file=event.target.files?.[0];if(file)void upload(file);event.target.value="";}}/></label>{loading ? <p>Chargement…</p> : error ? <p role="alert">{error}</p> : !documents.length ? <p>Aucun document enregistré pour cette formation.</p> : <div>{documents.map(doc => <article key={doc.id}><div><strong>{doc.title}</strong><small>{new Date(doc.created_at).toLocaleString("fr-FR")}</small></div><a href={doc.file_url} target="_blank" rel="noreferrer">Ouvrir / télécharger</a></article>)}</div>}<style jsx>{`.exports{padding:20px;background:white;border:1px solid #eadfd8;border-radius:16px}label{display:inline-block;background:#6b1a2c;color:white;border-radius:8px;padding:9px;font-size:12px;cursor:pointer}label input{display:none}h3{color:#6b1a2c;margin-top:0}p,small{color:#7c6f68;font-size:12px}article{display:flex;gap:12px;justify-content:space-between;align-items:center;flex-wrap:wrap;padding:14px;border-bottom:1px solid #eadfd8}strong,small{display:block}small{margin-top:5px}a{color:#6b1a2c;font-weight:bold;font-size:12px}`}</style></section>;
}
