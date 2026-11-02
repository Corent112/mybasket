import {canManageSport} from "@/lib/institutionnel/sport-access-server";
import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin-server";

async function ctx(structureId:string){
 const sb=await createClient(); const {data:{user}}=await sb.auth.getUser(); if(!user)return null;
 const db=createAdminClient()||sb;
 const [m,s]=await Promise.all([
  db.from("institutional_members").select("id,role,permissions").eq("structure_id",structureId).eq("user_id",user.id).eq("status","active").maybeSingle(),
  db.from("institutional_structures").select("id,name,season_label,created_by").eq("id",structureId).maybeSingle()
 ]);
 if(!s.data||!(m.data&&canManageSport(m.data)))return null;
 return {sb,db,user,structure:s.data};
}
async function poleTeam(db:any,structureId:string){
 const a=await db.from("institutional_pole_teams").select("team_id").eq("structure_id",structureId).eq("team_kind","pole").eq("active",true).order("created_at",{ascending:true}).limit(1).maybeSingle();
 if(a.data?.team_id)return String(a.data.team_id);
 const b=await db.from("institutional_team_links").select("team_id").eq("structure_id",structureId).eq("kind","primary").order("created_at",{ascending:true}).limit(1).maybeSingle();
 return b.data?.team_id?String(b.data.team_id):"";
}
export async function POST(req:Request){
 const b=await req.json().catch(()=>({})); const structureId=String(b.structureId||""),playerId=String(b.playerId||""),partnerTeamId=String(b.partnerTeamId||"");
 if(!structureId||!playerId||!partnerTeamId)return NextResponse.json({error:"Informations incomplètes."},{status:400});
 const c=await ctx(structureId); if(!c)return NextResponse.json({error:"Accès Institution refusé."},{status:403});
 const pt=await poleTeam(c.db,structureId);
 const p=await c.db.from("players").select("id,team_id,metadata").eq("id",playerId).maybeSingle();
 if(!p.data||String(p.data.team_id)!==pt)return NextResponse.json({error:"Ce joueur n'appartient pas au Pôle."},{status:400});
 const link=await c.db.from("institutional_pole_teams").select("id").eq("structure_id",structureId).eq("team_kind","partner").eq("team_id",partnerTeamId).eq("active",true).maybeSingle();
 if(!link.data)return NextResponse.json({error:"Équipe partenaire non reliée au Pôle."},{status:400});
 const q=await c.db.from("institutional_pole_partner_assignments").upsert({
  structure_id:structureId,pole_player_id:playerId,partner_team_id:partnerTeamId,
  season_label:String(b.seasonLabel||c.structure.season_label||"2026-2027"),
  starts_on:b.startsOn||null,ends_on:b.endsOn||null,active:true,created_by:c.user.id,updated_at:new Date().toISOString()
 },{onConflict:"structure_id,pole_player_id,partner_team_id,season_label"}).select("id").single();
 if(q.error)return NextResponse.json({error:q.error.message},{status:400});
 const existingIds=Array.isArray(p.data.metadata?.additionalTeamIds)?p.data.metadata.additionalTeamIds:[];
 const playerWrite=await c.db.from("players").update({metadata:{...p.data.metadata,additionalTeamIds:[...new Set([...existingIds,partnerTeamId])]},updated_at:new Date().toISOString()}).eq("id",playerId).eq("team_id",pt);
 if(playerWrite.error){return NextResponse.json({error:"Le rattachement est enregistré, mais la liaison à l’effectif a échoué. Réessaie."},{status:400});}
 return NextResponse.json({ok:true,id:q.data.id});
}
export async function DELETE(req:Request){
 const b=await req.json().catch(()=>({})); const structureId=String(b.structureId||""),assignmentId=String(b.assignmentId||"");
 const c=await ctx(structureId); if(!c)return NextResponse.json({error:"Accès refusé."},{status:403});
 const assignment=await c.db.from("institutional_pole_partner_assignments").select("pole_player_id,partner_team_id").eq("id",assignmentId).eq("structure_id",structureId).maybeSingle();
 if(assignment.error||!assignment.data)return NextResponse.json({error:"Rattachement introuvable"},{status:404});
 const q=await c.db.from("institutional_pole_partner_assignments").update({active:false,updated_at:new Date().toISOString()}).eq("id",assignmentId).eq("structure_id",structureId);
 if(q.error)return NextResponse.json({error:q.error.message},{status:400});
 const assigned=assignment.data;
 const others=await c.db.from("institutional_pole_partner_assignments").select("id").eq("pole_player_id",assigned.pole_player_id).eq("partner_team_id",assigned.partner_team_id).eq("active",true).limit(1);
 if(others.error)return NextResponse.json({error:"Rattachement retiré, actualisation de l’effectif impossible. Réessaie."},{status:400});
 if(!others.data?.length){const p=await c.db.from("players").select("metadata").eq("id",assigned.pole_player_id).single();if(p.error)return NextResponse.json({error:p.error.message},{status:400});const write=await c.db.from("players").update({metadata:{...p.data.metadata,additionalTeamIds:(p.data.metadata?.additionalTeamIds||[]).filter((id:string)=>id!==assigned.partner_team_id)},updated_at:new Date().toISOString()}).eq("id",assigned.pole_player_id);if(write.error)return NextResponse.json({error:write.error.message},{status:400});}
 return NextResponse.json({ok:true});
}

export async function GET(req:Request){
 const sb=await createClient();const {data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:'Non connecté'},{status:401});
 const playerId=new URL(req.url).searchParams.get('playerId')||'';
 if(!playerId)return NextResponse.json({error:'Joueur obligatoire'},{status:400});
 const db=createAdminClient()||sb;
 const player=await db.from('players').select('id,team_id').eq('id',playerId).maybeSingle();
 if(player.error)return NextResponse.json({error:'Lecture du joueur impossible'},{status:503});
 if(!player.data)return NextResponse.json({isPoliste:false});
 const [links,primary]=await Promise.all([
  db.from('institutional_pole_teams').select('structure_id').eq('team_id',player.data.team_id).eq('team_kind','pole').eq('active',true),
  db.from('institutional_team_links').select('structure_id').eq('team_id',player.data.team_id).eq('kind','primary')
 ]);
 if(links.error||primary.error)return NextResponse.json({error:'Lecture du rattachement Pôle impossible'},{status:503});
 const structures=[...new Map([...(links.data||[]),...(primary.data||[])].map((link:any)=>[link.structure_id,link])).values()] as Array<{structure_id:string}>;
 for(const link of structures){
  const c=await ctx(link.structure_id);if(!c)continue;
  const [partners,assignments,selections]=await Promise.all([
   db.from('institutional_pole_teams').select('team_id').eq('structure_id',link.structure_id).eq('team_kind','partner').eq('active',true),
   db.from('institutional_pole_partner_assignments').select('id,partner_team_id,season_label').eq('structure_id',link.structure_id).eq('pole_player_id',playerId).eq('active',true),
   db.from('institutional_selections').select('id,name').eq('structure_id',link.structure_id).neq('status','archived')
  ]);
  if(partners.error||assignments.error||selections.error)return NextResponse.json({error:'Lecture des équipes partenaires impossible'},{status:503});
  const ids=(partners.data||[]).map((p:any)=>p.team_id);
  const teams=ids.length?await db.from('teams').select('id,name,category').in('id',ids):{data:[],error:null};
  if(teams.error)return NextResponse.json({error:'Lecture des équipes impossible'},{status:503});
  return NextResponse.json({isPoliste:true,structureId:link.structure_id,partners:teams.data||[],assignments:assignments.data||[],selections:selections.data||[]});
 }
 return NextResponse.json({isPoliste:false});
}
