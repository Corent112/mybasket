import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { buildPlayerNotebookSnapshot } from "@/lib/institutionnel/player-notebook-data";
import { PlayerNotebookPdf } from "@/lib/institutionnel/player-notebook-pdf";

export const runtime="nodejs";

function esc(x:unknown){return String(x??"").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")}

export async function POST(req:Request){
 const sb=await createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:"Non connecté"},{status:401});
 const b=await req.json().catch(()=>({}));const structureId=String(b.structureId||""),playerId=String(b.playerId||""),seasonId=b.seasonId?String(b.seasonId):null,to=String(b.to||"").trim();
 if(!to)return NextResponse.json({error:"Email du club manquant"},{status:400});
 const db=createAdminClient()||sb;const{data:m}=await db.from("institutional_members").select("id").eq("structure_id",structureId).eq("user_id",user.id).eq("status","active").maybeSingle();
 if(!m)return NextResponse.json({error:"Accès refusé"},{status:403});
 try{
   const snapshot=await buildPlayerNotebookSnapshot({structureId,playerId,seasonId});
   const document = React.createElement(
      PlayerNotebookPdf,
      { snapshot }
    ) as React.ReactElement<any>;

    const buffer = await renderToBuffer(document);
   const p:any=snapshot.player,st:any=snapshot.structure;
   const filename=`MyBasket_Cahier_${String(p.first_name||"joueur").replace(/\s+/g,"-")}_${String(p.last_name||"").replace(/\s+/g,"-")}.pdf`;
   const apiKey=process.env.RESEND_API_KEY,from=process.env.RESEND_FROM;
   if(!apiKey||!from)throw new Error("Configuration email Resend absente.");
   const subject=`Cahier de suivi · ${p.first_name} ${p.last_name}`;
   const html=`<div style="font-family:Arial,sans-serif;max-width:720px;margin:auto"><div style="background:#6B1A2C;color:#fff;padding:20px"><b>${esc(st.name)}</b></div><div style="padding:22px"><p>Bonjour,</p><p>Vous trouverez en pièce jointe le cahier de suivi actualisé de <b>${esc(p.first_name)} ${esc(p.last_name)}</b>.</p><p>Ce document reprend son parcours, son assiduité, son évolution et les observations basket partageables.</p><p>Bien cordialement,<br>${esc(st.name)}</p></div></div>`;
   const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${apiKey}`,"Content-Type":"application/json"},body:JSON.stringify({
     from,to:[to],subject,html,attachments:[{filename,content:Buffer.from(buffer).toString("base64")}]
   })});
   const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result?.message||"Resend a refusé l'envoi.");
   await db.from("institutional_player_notebook_exports").insert({
     structure_id:structureId,player_id:playerId,season_id:seasonId,recipient_email:to,export_type:"email_pdf",
     snapshot,sent_at:new Date().toISOString(),created_by:user.id
   });
   await db.from("institutional_communications").insert({
     structure_id:structureId,sender_user_id:user.id,subject,body:`Cahier joueur envoyé à ${to}`,recipient_emails:[to],status:"sent",provider_id:result?.id||null
   });
   return NextResponse.json({ok:true,providerId:result?.id||null});
 }catch(e:any){return NextResponse.json({error:e?.message||"Envoi impossible"},{status:400})}
}
