import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin-server";

async function ctx(structureId:string){
 const sb=await createClient(); const {data:{user}}=await sb.auth.getUser(); if(!user)return null;
 const db=createAdminClient()||sb;
 const [m,s]=await Promise.all([
  db.from("institutional_members").select("id").eq("structure_id",structureId).eq("user_id",user.id).eq("status","active").maybeSingle(),
  db.from("institutional_structures").select("id,name,season_label,created_by").eq("id",structureId).maybeSingle()
 ]);
 if(!s.data||(!m.data&&String(s.data.created_by||"")!==user.id))return null;
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
 const p=await c.db.from("players").select("id,team_id").eq("id",playerId).maybeSingle();
 if(!p.data||String(p.data.team_id)!==pt)return NextResponse.json({error:"Ce joueur n'appartient pas au Pôle."},{status:400});
 const link=await c.db.from("institutional_pole_teams").select("id").eq("structure_id",structureId).eq("team_kind","partner").eq("team_id",partnerTeamId).eq("active",true).maybeSingle();
 if(!link.data)return NextResponse.json({error:"Équipe partenaire non reliée au Pôle."},{status:400});
 const q=await c.db.from("institutional_pole_partner_assignments").upsert({
  structure_id:structureId,pole_player_id:playerId,partner_team_id:partnerTeamId,
  season_label:String(b.seasonLabel||c.structure.season_label||"2026-2027"),
  starts_on:b.startsOn||null,ends_on:b.endsOn||null,active:true,created_by:c.user.id,updated_at:new Date().toISOString()
 },{onConflict:"structure_id,pole_player_id,partner_team_id,season_label"}).select("id").single();
 if(q.error)return NextResponse.json({error:q.error.message},{status:400});
 return NextResponse.json({ok:true,id:q.data.id});
}
export async function DELETE(req:Request){
 const b=await req.json().catch(()=>({})); const structureId=String(b.structureId||""),assignmentId=String(b.assignmentId||"");
 const c=await ctx(structureId); if(!c)return NextResponse.json({error:"Accès refusé."},{status:403});
 const q=await c.db.from("institutional_pole_partner_assignments").update({active:false,updated_at:new Date().toISOString()}).eq("id",assignmentId).eq("structure_id",structureId);
 if(q.error)return NextResponse.json({error:q.error.message},{status:400});
 return NextResponse.json({ok:true});
}