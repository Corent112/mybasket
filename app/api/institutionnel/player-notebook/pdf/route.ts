import React from "react";
import { renderToBuffer } from "@react-pdf/renderer";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { buildPlayerNotebookSnapshot } from "@/lib/institutionnel/player-notebook-data";
import { PlayerNotebookPdf } from "@/lib/institutionnel/player-notebook-pdf";

export const runtime="nodejs";

export async function POST(req:Request){
 const sb=await createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:"Non connecté"},{status:401});
 const b=await req.json().catch(()=>({}));const structureId=String(b.structureId||""),playerId=String(b.playerId||""),seasonId=b.seasonId?String(b.seasonId):null;
 const db=createAdminClient()||sb;const{data:m}=await db.from("institutional_members").select("id").eq("structure_id",structureId).eq("user_id",user.id).eq("status","active").maybeSingle();
 if(!m)return NextResponse.json({error:"Accès refusé"},{status:403});
 try{
   const snapshot=await buildPlayerNotebookSnapshot({structureId,playerId,seasonId});
   const document = React.createElement(
     PlayerNotebookPdf,
     { snapshot }
   ) as React.ReactElement<any>;

   const buffer = await renderToBuffer(document);
   await db.from("institutional_player_notebook_exports").insert({
     structure_id:structureId,player_id:playerId,season_id:seasonId,export_type:"pdf",snapshot,created_by:user.id
   });
   const p:any=snapshot.player;const filename=`MyBasket_Cahier_${String(p.first_name||"joueur").replace(/\s+/g,"-")}_${String(p.last_name||"").replace(/\s+/g,"-")}.pdf`;
   return new Response(new Uint8Array(buffer),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="${filename}"`,"Cache-Control":"no-store"}});
 }catch(e:any){return NextResponse.json({error:e?.message||"Génération impossible"},{status:400})}
}
