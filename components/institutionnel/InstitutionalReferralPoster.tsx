"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Props={structureId:string;referralUrl:string;onClose:()=>void};
type Structure=Record<string,any>;

const clean=(v:any)=>String(v??"").trim();
const pick=(s:Structure|null,...keys:string[])=>{
  for(const k of keys){const v=clean(s?.[k]);if(v)return v}
  return "";
};
const safeHex=(v:any,fallback:string)=>/^#[0-9a-fA-F]{6}$/.test(clean(v))?clean(v):fallback;

export default function InstitutionalReferralPoster({structureId,referralUrl,onClose}:Props){
  const sb=useMemo(()=>createClient(),[]);
  const [structure,setStructure]=useState<Structure|null>(null);
  const [loading,setLoading]=useState(true);

  useEffect(()=>{void(async()=>{
    setLoading(true);
    const q=await sb.from("institutional_structures").select("*").eq("id",structureId).maybeSingle();
    if(q.error) alert(q.error.message);
    setStructure((q.data||null) as Structure|null);
    setLoading(false);
  })()},[sb,structureId]);

  const name=pick(structure,"name","short_name")||"Votre institution";
  const logo=pick(structure,"logo_url");
  const primary=safeHex(structure?.document_primary_color,"#173B6D");
  const secondary=safeHex(structure?.document_secondary_color,"#D4A24C");
  const address=pick(structure,"address","postal_address","street_address","adresse");
  const postal=pick(structure,"postal_code","zip_code","code_postal");
  const city=pick(structure,"city","ville");
  const phone=pick(structure,"phone","phone_number","telephone","contact_phone");
  const email=pick(structure,"email","contact_email");
  const website=pick(structure,"website","website_url","site_url","web_url");
  const fullAddress=[address,[postal,city].filter(Boolean).join(" ")].filter(Boolean).join(" · ");
  const qr=`https://api.qrserver.com/v1/create-qr-code/?size=650x650&margin=10&data=${encodeURIComponent(referralUrl)}`;

  function printPoster(){
    const node=document.getElementById("institution-referral-poster");
    if(!node)return;
    const w=window.open("","_blank");
    if(!w)return alert("Autorise les fenêtres surgissantes pour imprimer l’affiche.");
    w.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>Affiche signalement - ${name.replace(/[<>]/g,"")}</title><style>@page{size:A4 portrait;margin:0}*{box-sizing:border-box}html,body{margin:0;background:#fff;font-family:Arial,Helvetica,sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}.poster{width:210mm;min-height:297mm;margin:0!important;box-shadow:none!important;border-radius:0!important}</style></head><body>${node.outerHTML}<script>window.onload=()=>setTimeout(()=>window.print(),250)<\/script></body></html>`);
    w.document.close();
  }

  return <div className="posterModal" role="dialog" aria-modal="true">
    <div className="posterShell">
      <div className="posterToolbar">
        <div><b>Aperçu de l’affiche</b><span>Personnalisée automatiquement avec l’identité et le QR code de cette entité.</span></div>
        <div><button onClick={printPoster}>Imprimer / PDF A4</button><button className="close" onClick={onClose}>×</button></div>
      </div>
      <div className="posterViewport">
        {loading?<div className="loading">Préparation de l’affiche…</div>:
        <article id="institution-referral-poster" className="poster" style={{"--p":primary,"--s":secondary} as React.CSSProperties}>
          <header className="posterHead">
            <div className="identity">{logo?<img src={logo} alt="" />:<div className="logoFallback">🏀</div>}<div><small>INSTITUTION</small><h1>{name}</h1></div></div>
            <div className="contacts">
              {fullAddress&&<span>● {fullAddress}</span>}
              {phone&&<span>☎ {phone}</span>}
              {email&&<span>✉ {email}</span>}
              {website&&<span>◎ {website.replace(/^https?:\/\//,"")}</span>}
            </div>
          </header>

          <section className="headline">
            <div className="ballMark">◯</div>
            <strong>SIGNALEZ-NOUS</strong>
            <b>UN JOUEUR</b>
            <span>À OBSERVER OU À DÉTECTER</span>
          </section>

          <section className="copy">
            <p><b>Bonjour,</b></p>
            <p>Dans le cadre de ses actions de <b>détection et de suivi des jeunes joueurs et joueuses</b>, <strong>{name}</strong> souhaite permettre à l’ensemble des acteurs du basketball de nous signaler facilement un profil qui mériterait d’être observé.</p>
            <p>Vous êtes <b>dirigeant, entraîneur, éducateur ou parent</b> et vous connaissez un joueur ou une joueuse que vous pensez intéressant(e) à observer ?</p>
          </section>

          <section className="qrArea">
            <div className="qrTitle"><span>▣</span><div><b>SCANNEZ LE QR CODE</b><small>POUR SIGNALER UN JOUEUR</small></div></div>
            <div className="qrCard"><img src={qr} alt="QR code de signalement de l’institution" /></div>
            <div className="steps">
              <span><i>1</i><b>Scannez</b><small>le QR code</small></span>
              <span><i>2</i><b>Renseignez</b><small>les informations utiles</small></span>
              <span><i>3</i><b>Envoyez</b><small>à l’équipe technique</small></span>
            </div>
          </section>

          <section className="thanks">
            <p>Les informations transmises permettront à notre équipe technique d’identifier le joueur ou la joueuse et, le cas échéant, de l’observer dans le cadre de nos actions de détection.</p>
            <b>Merci pour votre contribution à la détection et à l’accompagnement des jeunes talents de notre territoire.</b>
            <div>La Commission Technique<br/><strong>{name}</strong></div>
          </section>

          <footer><strong>Ensemble pour les talents de demain !</strong><span>{website||email||name}</span></footer>
        </article>}
      </div>
    </div>
    <style jsx>{`
      .posterModal{position:fixed;inset:0;z-index:9999;background:rgba(10,18,31,.72);display:grid;place-items:center;padding:22px}
      .posterShell{width:min(1120px,96vw);height:min(94vh,980px);background:#eef2f6;border-radius:18px;overflow:hidden;box-shadow:0 30px 90px rgba(0,0,0,.28);display:grid;grid-template-rows:auto 1fr}
      .posterToolbar{background:#fff;padding:13px 16px;display:flex;align-items:center;justify-content:space-between;gap:15px;border-bottom:1px solid #dde4ed}.posterToolbar>div:first-child{display:grid;gap:2px}.posterToolbar b{color:#17233b}.posterToolbar span{font-size:.72rem;color:#718096}.posterToolbar>div:last-child{display:flex;gap:8px}.posterToolbar button{border:0;border-radius:9px;background:#172b54;color:#fff;padding:9px 12px;font-weight:800;cursor:pointer}.posterToolbar .close{width:36px;background:#eef2f6;color:#53627a;font-size:20px;padding:6px}
      .posterViewport{overflow:auto;padding:24px;display:grid;justify-items:center}.loading{padding:40px;color:#607089}
      .poster{--p:#173B6D;--s:#D4A24C;width:210mm;min-height:297mm;background:#fff;color:#12294b;box-shadow:0 12px 45px rgba(24,39,75,.18);overflow:hidden;position:relative}
      .posterHead{height:38mm;padding:8mm 12mm 6mm;display:flex;align-items:center;justify-content:space-between;border-bottom:1.4mm solid var(--s);gap:10mm}.identity{display:flex;align-items:center;gap:5mm;min-width:0}.identity img,.logoFallback{width:23mm;height:23mm;object-fit:contain}.logoFallback{display:grid;place-items:center;font-size:14mm}.identity small{font-size:7pt;letter-spacing:1.5px;color:var(--s);font-weight:900}.identity h1{font-size:18pt;line-height:1.05;margin:1mm 0 0;color:var(--p);max-width:90mm}.contacts{display:grid;gap:1.6mm;font-size:7.6pt;color:var(--p);max-width:72mm}.contacts span{overflow-wrap:anywhere}
      .headline{height:55mm;background:var(--p);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;position:relative;overflow:hidden;text-align:center}.headline:before,.headline:after{content:"";position:absolute;width:70mm;height:70mm;border:1.2mm solid rgba(255,255,255,.08);border-radius:50%}.headline:before{right:-18mm;top:-28mm}.headline:after{left:-32mm;bottom:-52mm}.headline strong{font-size:30pt;line-height:.95;letter-spacing:.4px;z-index:1}.headline b{font-size:28pt;line-height:1;color:var(--s);z-index:1}.headline span{font-size:11pt;letter-spacing:2.2px;font-weight:900;margin-top:2mm;z-index:1}.ballMark{position:absolute;right:11mm;font-size:46mm;color:rgba(255,255,255,.05)}
      .copy{padding:8mm 22mm 2mm;font-size:10pt;line-height:1.45}.copy p{margin:0 0 3mm}.copy strong{color:var(--p)}
      .qrArea{display:grid;justify-items:center;padding:1mm 12mm 5mm}.qrTitle{background:var(--s);color:var(--p);border-radius:6mm 6mm 0 0;padding:3mm 7mm;width:90mm;display:flex;align-items:center;justify-content:center;gap:3mm}.qrTitle>span{font-size:18pt}.qrTitle div{display:grid}.qrTitle b{font-size:12pt}.qrTitle small{font-size:7.5pt;font-weight:900}.qrCard{width:66mm;height:66mm;padding:5mm;background:#fff;border-radius:0 0 6mm 6mm;box-shadow:0 3mm 9mm rgba(23,43,84,.12);display:grid;place-items:center}.qrCard img{width:56mm;height:56mm}.steps{display:grid;grid-template-columns:repeat(3,1fr);width:142mm;margin-top:5mm;gap:4mm}.steps span{background:#f6f8fb;border:1px solid #e6ebf1;border-radius:5mm;padding:3mm;display:grid;grid-template-columns:7mm 1fr;column-gap:2mm;align-items:center}.steps i{grid-row:1/3;width:7mm;height:7mm;border-radius:50%;background:var(--p);color:#fff;font-style:normal;display:grid;place-items:center;font-size:7pt;font-weight:900}.steps b{font-size:8pt}.steps small{font-size:6.5pt;color:#66758a}
      .thanks{padding:2mm 18mm 6mm;font-size:8.5pt;line-height:1.4}.thanks>p{margin:0 0 3mm}.thanks>b{color:var(--p);display:block}.thanks>div{text-align:right;margin-top:4mm;font-size:8pt}
      footer{height:22mm;background:var(--p);border-top:1.2mm solid var(--s);color:#fff;padding:5mm 14mm;display:flex;justify-content:space-between;align-items:center}footer strong{font-size:12pt;font-style:italic}footer span{font-size:7.5pt;opacity:.9}
      @media(max-width:800px){.posterModal{padding:0}.posterShell{width:100vw;height:100vh;border-radius:0}.posterViewport{padding:12px;justify-items:start}.poster{transform:scale(.68);transform-origin:top left;margin-right:-67mm;margin-bottom:-95mm}}
    `}</style>
  </div>
}
