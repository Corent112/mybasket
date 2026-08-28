import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin-server";
import {sendTransactionalEmail} from "@/lib/server-notifications";

function esc(v:string){return v.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
export async function POST(req:Request){
 const sb=await createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:"Non connecté"},{status:401});
 const b=await req.json().catch(()=>({}));const structureId=String(b.structureId||"");const playerIds=Array.isArray(b.playerIds)?[...new Set(b.playerIds.map(String).filter(Boolean))]:[];const targetEmail=String(b.target_email||"").trim().toLowerCase();const accessLevel=["viewer","editor","manager"].includes(String(b.access_level))?String(b.access_level):"editor";
 if(!structureId||!playerIds.length||!targetEmail)return NextResponse.json({error:"Structure, joueurs et email destinataire obligatoires."},{status:400});
 const db=createAdminClient()||sb;const{data:member}=await db.from("institutional_members").select("id").eq("structure_id",structureId).eq("user_id",user.id).eq("status","active").maybeSingle();if(!member)return NextResponse.json({error:"Accès refusé"},{status:403});
 const{data:structure}=await db.from("institutional_structures").select("name").eq("id",structureId).maybeSingle();
 const{data:players,error:pe}=await db.from("institutional_players").select("id,first_name,last_name").eq("structure_id",structureId).in("id",playerIds).eq("archived",false);if(pe||!players?.length)return NextResponse.json({error:pe?.message||"Aucun joueur valide"},{status:400});
 const ins=await db.from("institutional_player_transfers").insert({source_structure_id:structureId,target_email:targetEmail,target_label:String(b.target_label||"").trim()||null,access_level:accessLevel,message:String(b.message||"").trim()||null,created_by:user.id}).select("id,token,expires_at").single();if(ins.error)return NextResponse.json({error:ins.error.message},{status:400});
 const items=await db.from("institutional_player_transfer_items").insert(players.map(p=>({transfer_id:ins.data.id,player_id:p.id})));if(items.error){await db.from("institutional_player_transfers").delete().eq("id",ins.data.id);return NextResponse.json({error:items.error.message},{status:400})}
 const origin=new URL(req.url).origin;const url=`${origin}/institutionnel/transfert/${ins.data.token}`;const names=players.map(p=>`${p.first_name} ${p.last_name}`).join(", ");
 await sendTransactionalEmail({to:[targetEmail],subject:`MyBasket · ${structure?.name||"Une institution"} partage ${players.length} fiche(s) joueur`,html:`<div style="font-family:Arial,sans-serif;max-width:720px;margin:auto"><div style="background:#6B1A2C;color:white;padding:18px 22px"><b>MyBasket · Institution</b></div><div style="padding:22px"><h2>Des fiches joueurs vous sont proposées</h2><p><b>${esc(structure?.name||"Institution")}</b> souhaite partager avec vous : ${esc(names)}.</p>${b.message?`<p>${esc(String(b.message))}</p>`:""}<p><a href="${url}" style="display:inline-block;background:#6B1A2C;color:white;text-decoration:none;padding:11px 16px;border-radius:8px;font-weight:bold">Consulter et accepter les fiches</a></p><p style="font-size:12px;color:#777">Lien valable jusqu'au ${new Date(ins.data.expires_at).toLocaleDateString("fr-FR")}.</p></div></div>`});
 return NextResponse.json({ok:true,id:ins.data.id});
}
