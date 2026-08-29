import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin-server";
import {sendTransactionalEmail} from "@/lib/server-notifications";

function esc(v:string){return v.replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;")}
const NEXT_TARGET:Record<string,string>={committee:"league",league:"pole",pole:"federation"};

export async function GET(req:Request){
 const sb=await createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:"Non connecté"},{status:401});
 const url=new URL(req.url);const structureId=url.searchParams.get("structureId")||"";const seasonId=url.searchParams.get("seasonId")||"";
 if(!structureId)return NextResponse.json({error:"Structure obligatoire"},{status:400});
 const db=createAdminClient()||sb;const{data:member}=await db.from("institutional_members").select("id").eq("structure_id",structureId).eq("user_id",user.id).eq("status","active").maybeSingle();if(!member)return NextResponse.json({error:"Accès refusé"},{status:403});
 const{data:transfers,error}=await db.from("institutional_player_transfers").select("id,source_structure_id,target_structure_id,target_email,target_label,access_level,message,status,expires_at,created_at,accepted_at,declined_at").eq("target_structure_id",structureId).order("created_at",{ascending:false});if(error)return NextResponse.json({error:error.message},{status:400});
 const transferIds=(transfers||[]).map(t=>t.id),sourceIds=[...new Set((transfers||[]).map(t=>t.source_structure_id))];
 const[{data:items},{data:sources},{data:seasonEntries}]=await Promise.all([
  transferIds.length?db.from("institutional_player_transfer_items").select("transfer_id,player_id,institutional_players(id,first_name,last_name,birthdate,club_name,category,photo_url)").in("transfer_id",transferIds):Promise.resolve({data:[]}),
  sourceIds.length?db.from("institutional_structures").select("id,name,short_name,structure_type,logo_url").in("id",sourceIds):Promise.resolve({data:[]}),
  seasonId?db.from("institutional_player_season_entries").select("player_id").eq("structure_id",structureId).eq("season_id",seasonId):Promise.resolve({data:[]}),
 ] as any);
 const sourceMap=new Map((sources||[]).map((s:any)=>[s.id,s]));const inSeason=new Set((seasonEntries||[]).map((e:any)=>e.player_id));
 const itemMap=new Map<string,any[]>();for(const row of items||[]){const arr=itemMap.get((row as any).transfer_id)||[];const p=(row as any).institutional_players;if(p)arr.push({...p,in_current_season:inSeason.has(p.id)});itemMap.set((row as any).transfer_id,arr)}
 return NextResponse.json({transfers:(transfers||[]).map(t=>({...t,source_structure:sourceMap.get(t.source_structure_id)||null,players:itemMap.get(t.id)||[]}))});
}

export async function POST(req:Request){
 const sb=await createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:"Non connecté"},{status:401});
 const b=await req.json().catch(()=>({}));const structureId=String(b.structureId||"");const playerIds=Array.isArray(b.playerIds)?[...new Set(b.playerIds.map(String).filter(Boolean))]:[];const targetEmail=String(b.target_email||"").trim().toLowerCase();const targetStructureId=String(b.target_structure_id||"").trim()||null;const accessLevel=["viewer","editor","manager"].includes(String(b.access_level))?String(b.access_level):"editor";
 if(!structureId||!playerIds.length||!targetEmail)return NextResponse.json({error:"Structure, joueurs et email destinataire obligatoires."},{status:400});
 const db=createAdminClient()||sb;const{data:member}=await db.from("institutional_members").select("id").eq("structure_id",structureId).eq("user_id",user.id).eq("status","active").maybeSingle();if(!member)return NextResponse.json({error:"Accès refusé"},{status:403});
 const{data:structure}=await db.from("institutional_structures").select("id,name,structure_type").eq("id",structureId).maybeSingle();if(!structure)return NextResponse.json({error:"Institution source introuvable"},{status:404});
 let target:any=null;if(targetStructureId){const q=await db.from("institutional_structures").select("id,name,structure_type,email").eq("id",targetStructureId).maybeSingle();target=q.data;if(!target)return NextResponse.json({error:"Institution destinataire introuvable"},{status:404});const expected=NEXT_TARGET[String(structure.structure_type)];if(expected&&target.structure_type!==expected)return NextResponse.json({error:`Le destinataire attendu après ${structure.structure_type} est de type ${expected}.`},{status:400})}
 const{data:players,error:pe}=await db.from("institutional_players").select("id,first_name,last_name").in("id",playerIds).eq("archived",false);if(pe||!players?.length)return NextResponse.json({error:pe?.message||"Aucun joueur valide"},{status:400});
 // Tous les joueurs doivent soit appartenir à la structure, soit déjà être partagés avec elle avec droit manager/editor.
 const ownIds=new Set((await db.from("institutional_players").select("id").eq("structure_id",structureId).in("id",playerIds)).data?.map((x:any)=>x.id)||[]);
 const sharedIds=new Set((await db.from("institutional_player_shares").select("player_id,access_level").eq("target_structure_id",structureId).is("revoked_at",null).in("player_id",playerIds)).data?.filter((x:any)=>["editor","manager"].includes(x.access_level)).map((x:any)=>x.player_id)||[]);
 const forbidden=playerIds.filter(id=>!ownIds.has(id)&&!sharedIds.has(id));if(forbidden.length)return NextResponse.json({error:"Une ou plusieurs fiches ne peuvent pas être retransmises par cette Institution."},{status:403});
 const ins=await db.from("institutional_player_transfers").insert({source_structure_id:structureId,target_structure_id:targetStructureId,target_email:targetEmail,target_label:String(b.target_label||target?.name||"").trim()||null,access_level:accessLevel,message:String(b.message||"").trim()||null,created_by:user.id}).select("id,token,expires_at").single();if(ins.error)return NextResponse.json({error:ins.error.message},{status:400});
 const items=await db.from("institutional_player_transfer_items").insert(players.map(p=>({transfer_id:ins.data.id,player_id:p.id})));if(items.error){await db.from("institutional_player_transfers").delete().eq("id",ins.data.id);return NextResponse.json({error:items.error.message},{status:400})}
 await db.from("institutional_player_pathway_events").insert(players.map(p=>({player_id:p.id,structure_id:structureId,target_structure_id:targetStructureId,event_type:"transfer_sent",title:`Transmission vers ${target?.name||String(b.target_label||"une Institution")}`,event_date:new Date().toISOString().slice(0,10),details:{transfer_id:ins.data.id},created_by:user.id})));
 const origin=new URL(req.url).origin;const url=`${origin}/institutionnel/transfert/${ins.data.token}`;const names=players.map(p=>`${p.first_name} ${p.last_name}`).join(", ");
 await sendTransactionalEmail({to:[targetEmail],subject:`MyBasket · ${structure.name||"Une institution"} partage ${players.length} fiche(s) joueur`,html:`<div style="font-family:Arial,sans-serif;max-width:720px;margin:auto"><div style="background:#6B1A2C;color:white;padding:18px 22px"><b>MyBasket · Institution</b></div><div style="padding:22px"><h2>Des fiches joueurs vous sont proposées</h2><p><b>${esc(structure.name||"Institution")}</b> souhaite partager avec vous : ${esc(names)}.</p>${b.message?`<p>${esc(String(b.message))}</p>`:""}<p><a href="${url}" style="display:inline-block;background:#6B1A2C;color:white;text-decoration:none;padding:11px 16px;border-radius:8px;font-weight:bold">Consulter les fiches</a></p><p style="font-size:12px;color:#777">Lien valable jusqu'au ${new Date(ins.data.expires_at).toLocaleDateString("fr-FR")}.</p></div></div>`});
 return NextResponse.json({ok:true,id:ins.data.id});
}
