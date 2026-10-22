import {normalizeSiblingDetails,normalizeShoeSize} from '@/lib/institutionnel/player-family-details';
import {informationConsentReceipt} from '@/lib/institutionnel/information-consent';
import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
const h=(x:string)=>createHash("sha256").update(x).digest("hex");

export async function GET(_req:Request,{params}:{params:Promise<{token:string}>}){
  const{token}=await params;const db=createAdminClient();if(!db)return NextResponse.json({error:"Service indisponible"},{status:500});
  const q=await db.from("institutional_parent_questionnaires").select("*").eq("token_hash",h(token)).maybeSingle();
  if(!q.data||q.data.status==="revoked")return NextResponse.json({error:"Lien invalide"},{status:404});
  if(Date.parse(q.data.expires_at)<Date.now())return NextResponse.json({error:"Lien expiré"},{status:410});
  const[p,s]=await Promise.all([
    db.from("institutional_players").select("first_name,last_name").eq("id",q.data.player_id).single(),
    db.from("institutional_structures").select("name").eq("id",q.data.structure_id).single()
  ]);
  return NextResponse.json({ok:true,player:p.data,structure:s.data,status:q.data.status,response:q.data.response||{}});
}
export async function POST(req:Request,{params}:{params:Promise<{token:string}>}){
  const{token}=await params;const db=createAdminClient();if(!db)return NextResponse.json({error:"Service indisponible"},{status:500});
  const q=await db.from("institutional_parent_questionnaires").select("id,structure_id,player_id,status,expires_at").eq("token_hash",h(token)).maybeSingle();
  if(!q.data||q.data.status==="revoked")return NextResponse.json({error:"Lien invalide"},{status:404});
  if(Date.parse(q.data.expires_at)<Date.now())return NextResponse.json({error:"Lien expiré"},{status:410});
  const b=await req.json().catch(()=>({}));
  if(b.dataConsent!==true)return NextResponse.json({error:"Veuillez accepter la collecte et l’utilisation des informations avant de transmettre."},{status:400});
  const structure=await db.from("institutional_structures").select("name").eq("id",q.data.structure_id).maybeSingle();
  if(structure.error||!structure.data)return NextResponse.json({error:"Institution indisponible. Réessayez."},{status:503});
  let shoeSize:string|null,siblingDetails:ReturnType<typeof normalizeSiblingDetails>;
  try{shoeSize=normalizeShoeSize(b.shoe_size);siblingDetails=normalizeSiblingDetails(b.siblings_details??[]);}catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Informations invalides'},{status:400});}
  if(shoeSize!==null||siblingDetails.length){
    const current=await db.from('institutional_players').select('profile_data,updated_at').eq('id',q.data.player_id).eq('structure_id',q.data.structure_id).maybeSingle();
    if(current.error||!current.data)return NextResponse.json({error:'Fiche joueur indisponible.'},{status:503});
    const profile={...current.data.profile_data,...(shoeSize!==null?{shoeSize}:{}),...(siblingDetails.length?{siblingDetails}:{})};
    let update=db.from('institutional_players').update({profile_data:profile,updated_at:new Date().toISOString()}).eq('id',q.data.player_id).eq('structure_id',q.data.structure_id);
    update=current.data.updated_at?update.eq('updated_at',current.data.updated_at):update.is('updated_at',null);
    const saved=await update.select('id').maybeSingle();if(saved.error||!saved.data)return NextResponse.json({error:'La fiche a changé ou n’a pas pu être enregistrée. Réessayez.'},{status:409});
  }
  const response={
    shoe_size:shoeSize||"",siblings_details:siblingDetails,
    dataConsent:informationConsentReceipt(structure.data.name,q.data.structure_id),
    guardian1_name:String(b.guardian1_name||"").trim(),guardian1_relation:String(b.guardian1_relation||"").trim(),
    guardian1_email:String(b.guardian1_email||"").trim(),guardian1_phone:String(b.guardian1_phone||"").trim(),
    guardian1_height_cm:b.guardian1_height_cm?Number(b.guardian1_height_cm):null,
    guardian2_name:String(b.guardian2_name||"").trim(),guardian2_relation:String(b.guardian2_relation||"").trim(),
    guardian2_email:String(b.guardian2_email||"").trim(),guardian2_phone:String(b.guardian2_phone||"").trim(),
    guardian2_height_cm:b.guardian2_height_cm?Number(b.guardian2_height_cm):null,
    address:String(b.address||"").trim(),postal_code:String(b.postal_code||"").trim(),city:String(b.city||"").trim(),
    school_context:String(b.school_context||"").trim(),siblings_context:String(b.siblings_context||"").trim(),
    useful_context:String(b.useful_context||"").trim()
  };
  const save=await db.from("institutional_parent_questionnaires").update({
    response,status:"completed",submitted_at:new Date().toISOString(),updated_at:new Date().toISOString()
  }).eq("id",q.data.id);
  if(save.error)return NextResponse.json({error:save.error.message},{status:400});
  return NextResponse.json({ok:true});
}
