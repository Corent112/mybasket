import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin-server";

async function context(id:string,userId:string){
 const sb=await createClient();const db=createAdminClient()||sb;const{data:t}=await db.from("institutional_player_transfers").select("*").eq("id",id).maybeSingle();if(!t)return{db,t:null,member:null,items:[]};
 const{data:member}=t.target_structure_id?await db.from("institutional_members").select("id").eq("structure_id",t.target_structure_id).eq("user_id",userId).eq("status","active").maybeSingle():{data:null};
 const{data:items}=await db.from("institutional_player_transfer_items").select("player_id,institutional_players(id,first_name,last_name,club_name,category)").eq("transfer_id",id);return{db,t,member,items:items||[]};
}
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){try{
 const sb=await createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:"Non connecté"},{status:401});const{id}=await params;const{db,t,member,items}=await context(id,user.id);if(!t)return NextResponse.json({error:"Transmission introuvable"},{status:404});if(!member)return NextResponse.json({error:"Accès refusé"},{status:403});
 const b=await req.json().catch(()=>({}));const action=String(b.action||"");const seasonId=String(b.seasonId||"")||null;
 if(action==="decline"){
  if(t.status!=="pending")return NextResponse.json({error:"Cette transmission n'est plus en attente."},{status:400});
  const q=await db.from("institutional_player_transfers").update({status:"declined",declined_at:new Date().toISOString()}).eq("id",id);if(q.error)return NextResponse.json({error:q.error.message},{status:400});return NextResponse.json({ok:true});
 }
 if(action!=="accept"&&action!=="add_to_season")return NextResponse.json({error:"Action inconnue"},{status:400});
 if(action==="accept"&&t.status!=="pending")return NextResponse.json({error:"Cette transmission n'est plus en attente."},{status:400});
 if(action==="add_to_season"&&t.status!=="accepted")return NextResponse.json({error:"La transmission doit d'abord être acceptée."},{status:400});
 if(!seasonId)return NextResponse.json({error:"Crée ou sélectionne une saison avant d'ajouter les joueurs à l'effectif."},{status:400});
 const{data:season}=await db.from("institutional_player_tracking_seasons").select("id").eq("id",seasonId).eq("structure_id",t.target_structure_id).eq("archived",false).maybeSingle();if(!season)return NextResponse.json({error:"Saison invalide pour cette Institution."},{status:400});
 const playerRows=items.map((x:any)=>x.institutional_players).filter(Boolean);const playerIds=playerRows.map((p:any)=>p.id);
 if(action==="accept"){
  const shares=playerIds.map((playerId:string)=>({player_id:playerId,source_structure_id:t.source_structure_id,target_structure_id:t.target_structure_id,access_level:t.access_level,granted_by:t.created_by||null,revoked_at:null}));
  if(shares.length){const q=await db.from("institutional_player_shares").upsert(shares,{onConflict:"player_id,target_structure_id"});if(q.error)return NextResponse.json({error:q.error.message},{status:400})}
 }
 for(const p of playerRows){const{data:existing}=await db.from("institutional_player_season_entries").select("id").eq("structure_id",t.target_structure_id).eq("season_id",seasonId).eq("player_id",p.id).maybeSingle();if(!existing){const q=await db.from("institutional_player_season_entries").insert({structure_id:t.target_structure_id,season_id:seasonId,player_id:p.id,club_name:p.club_name||null,category:p.category||null,status:"followed",created_by:user.id});if(q.error)return NextResponse.json({error:q.error.message},{status:400})}}
 if(action==="accept"){
  const q=await db.from("institutional_player_transfers").update({status:"accepted",accepted_by:user.id,accepted_at:new Date().toISOString()}).eq("id",id);if(q.error)return NextResponse.json({error:q.error.message},{status:400});
  await db.from("institutional_player_pathway_events").insert(playerIds.map((playerId:string)=>({player_id:playerId,structure_id:t.target_structure_id,source_structure_id:t.source_structure_id,event_type:"transfer_received",title:"Dossier reçu et intégré à l'effectif",event_date:new Date().toISOString().slice(0,10),details:{transfer_id:id,season_id:seasonId},created_by:user.id})));
 }
 return NextResponse.json({ok:true,count:playerIds.length});
 }catch(e:any){return NextResponse.json({error:e?.message||"Erreur"},{status:400})}}
