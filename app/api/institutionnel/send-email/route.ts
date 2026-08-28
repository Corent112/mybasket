import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { sendTransactionalEmail } from "@/lib/server-notifications";

function esc(value:string){return value.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
export async function POST(req:Request){
 const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"Non connecté"},{status:401});
 const body=await req.json().catch(()=>({}));const structureId=String(body.structureId||"");const to=Array.isArray(body.to)?body.to.map(String).filter(Boolean):[];const subject=String(body.subject||"").trim();const text=String(body.body||"").trim();
 if(!structureId||!to.length||!subject||!text)return NextResponse.json({error:"Destinataire, objet et message obligatoires."},{status:400});
 const admin=createAdminClient();const db=admin||supabase;const{data:member}=await db.from("institutional_members").select("id,permissions").eq("structure_id",structureId).eq("user_id",user.id).eq("status","active").maybeSingle();if(!member)return NextResponse.json({error:"Accès refusé"},{status:403});
 const result=await sendTransactionalEmail({to,subject,html:`<div style="font-family:Arial,sans-serif;max-width:760px;margin:auto"><div style="background:#6B1A2C;color:white;padding:18px 22px"><strong>MyBasket Institution</strong></div><div style="padding:22px;white-space:pre-wrap">${esc(text)}</div></div>`});
 await db.from("institutional_communications").insert({structure_id:structureId,sender_user_id:user.id,subject,body:text,recipient_emails:to,status:result.sent?"sent":"failed",provider_id:result.sent?result.providerId:null});
 return NextResponse.json({ok:result.sent,count:to.length});
}
