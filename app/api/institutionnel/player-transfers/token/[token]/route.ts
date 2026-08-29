import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin-server";

async function readTransfer(token:string){
  const sb=await createClient();const db=createAdminClient()||sb;
  const{data:t,error}=await db.from("institutional_player_transfers").select("id,source_structure_id,target_structure_id,target_email,target_label,access_level,message,status,expires_at,token,created_by").eq("token",token).maybeSingle();
  if(error)throw error;if(!t)return{db,t:null,items:[],source:null};
  const[{data:items},{data:source}]=await Promise.all([
    db.from("institutional_player_transfer_items").select("player_id,institutional_players(id,first_name,last_name,birthdate,club_name,category)").eq("transfer_id",t.id),
    db.from("institutional_structures").select("id,name,short_name").eq("id",t.source_structure_id).maybeSingle(),
  ]);
  return{db,t,items:items||[],source};
}
export async function GET(_req:Request,{params}:{params:Promise<{token:string}>}){try{const{token}=await params;const{t,items,source}=await readTransfer(token);if(!t)return NextResponse.json({error:"Invitation introuvable"},{status:404});return NextResponse.json({transfer:{...t,source_structure:source},players:items.map((x:any)=>x.institutional_players).filter(Boolean)});}catch(e:any){return NextResponse.json({error:e.message},{status:400})}}
export async function POST(req:Request,{params}:{params:Promise<{token:string}>}){try{
  const sb=await createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:"Connectez-vous à MyBasket pour accepter les fiches."},{status:401});
  const{token}=await params;const{db,t,items}=await readTransfer(token);if(!t)return NextResponse.json({error:"Invitation introuvable"},{status:404});if(t.status!=="pending")return NextResponse.json({error:"Cette invitation n'est plus active."},{status:400});if(Date.parse(t.expires_at)<Date.now())return NextResponse.json({error:"Cette invitation a expiré."},{status:410});
  if(user.email && t.target_email && user.email.toLowerCase()!==String(t.target_email).toLowerCase())return NextResponse.json({error:`Cette invitation a été envoyée à ${t.target_email}. Connectez-vous avec cette adresse.`},{status:403});
  const body=await req.json().catch(()=>({}));const targetStructureId=String(body.structureId||"");if(t.target_structure_id&&targetStructureId!==t.target_structure_id)return NextResponse.json({error:"Cette invitation est destinée à une autre Institution."},{status:403});const{data:member}=await db.from("institutional_members").select("id").eq("structure_id",targetStructureId).eq("user_id",user.id).eq("status","active").maybeSingle();if(!member)return NextResponse.json({error:"Choisissez une institution à laquelle vous appartenez."},{status:403});
  const shares=items.map((x:any)=>({player_id:x.player_id,source_structure_id:t.source_structure_id,target_structure_id:targetStructureId,access_level:t.access_level,granted_by:t.created_by||null,revoked_at:null}));if(shares.length){const q=await db.from("institutional_player_shares").upsert(shares,{onConflict:"player_id,target_structure_id"});if(q.error)return NextResponse.json({error:q.error.message},{status:400})}
  const u=await db.from("institutional_player_transfers").update({target_structure_id:targetStructureId,status:"accepted",accepted_by:user.id,accepted_at:new Date().toISOString()}).eq("id",t.id);if(u.error)return NextResponse.json({error:u.error.message},{status:400});await db.from("institutional_player_pathway_events").insert(items.map((x:any)=>({player_id:x.player_id,structure_id:targetStructureId,source_structure_id:t.source_structure_id,event_type:"transfer_received",title:"Dossier reçu par l’Institution",event_date:new Date().toISOString().slice(0,10),details:{transfer_id:t.id},created_by:user.id})));return NextResponse.json({ok:true,count:shares.length});
 }catch(e:any){return NextResponse.json({error:e.message},{status:400})}}
