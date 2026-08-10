import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/admin/guard";

function value(v: unknown): string {
  if (v == null || v === "") return "—";
  if (Array.isArray(v)) return v.map(value).join(", ");
  if (typeof v === "object") return JSON.stringify(v, null, 2);
  return String(v);
}

export default async function AdminAnnonceDetail({ params }: { params: Promise<{id:string}> }) {
  const { id } = await params;
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("announcements").select("*").eq("id", id).maybeSingle();
  if (!data) notFound();
  const payload = data.payload_data && typeof data.payload_data === "object" ? data.payload_data : {};
  const fields = Object.entries({
    Titre:data.title, Catégorie:data.category, Statut:data.status, Auteur:data.author_name,
    Email:data.author_email, Téléphone:data.author_phone, Ville:data.city,
    Prix:data.price_cents != null ? `${(Number(data.price_cents)/100).toFixed(2)} €` : null,
    Description:data.description,
  });
  return <main style={{maxWidth:1100,margin:"30px auto",padding:"0 20px",fontFamily:"Arial,sans-serif"}}>
    <Link href="/admin/annonces" style={{color:"#6B1A2C",fontWeight:800}}>← Retour aux annonces</Link>
    <h1 style={{fontSize:34,marginBottom:22}}>Détail de l’annonce</h1>
    <div style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) 320px",gap:24}}>
      <section style={{background:"white",border:"1px solid #e7ddd5",borderRadius:16,padding:22}}>
        {data.image_url && <img src={data.image_url} alt="" style={{width:"100%",maxHeight:420,objectFit:"contain",background:"#f7f5f3",borderRadius:12,marginBottom:20}}/>}
        {fields.map(([k,v])=><div key={k} style={{display:"grid",gridTemplateColumns:"180px 1fr",gap:14,padding:"10px 0",borderBottom:"1px solid #eee"}}><strong>{k}</strong><span style={{whiteSpace:"pre-wrap"}}>{value(v)}</span></div>)}
      </section>
      <aside style={{background:"#151418",color:"white",borderRadius:16,padding:20,alignSelf:"start"}}><h2 style={{marginTop:0,color:"#D4A24C"}}>Toutes les informations</h2><pre style={{whiteSpace:"pre-wrap",wordBreak:"break-word",fontFamily:"inherit",fontSize:13,lineHeight:1.5}}>{value(payload)}</pre></aside>
    </div>
  </main>;
}
