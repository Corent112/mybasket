import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin-server";
export async function GET(){
 const sb=await createClient(); const {data:{user}}=await sb.auth.getUser(); if(!user)return NextResponse.json({teams:[]},{status:401});
 const db=createAdminClient()||sb;
 const m=await db.from("institutional_members").select("structure_id").eq("user_id",user.id).eq("status","active");
 if(m.error)return NextResponse.json({error:m.error.message},{status:400});
 const sids=[...new Set((m.data||[]).map((x:any)=>String(x.structure_id)).filter(Boolean))]; if(!sids.length)return NextResponse.json({teams:[]});
 const l=await db.from("institutional_pole_teams").select("id,structure_id,team_id,season_label").in("structure_id",sids).eq("team_kind","partner").eq("active",true);
 if(l.error)return NextResponse.json({error:l.error.message},{status:400});
 const tids=[...new Set((l.data||[]).map((x:any)=>String(x.team_id)).filter(Boolean))]; if(!tids.length)return NextResponse.json({teams:[]});
 const [t,a,st]=await Promise.all([
  db.from("teams").select("id,name,club_name,category,coach_name,club_logo_url,logo_url,season,metadata").in("id",tids),
  db.from("institutional_pole_partner_assignments").select("*").in("structure_id",sids).in("partner_team_id",tids).eq("active",true),
  db.from("institutional_structures").select("id,name,short_name").in("id",sids)
 ]);
 if(t.error||a.error)return NextResponse.json({error:t.error?.message||a.error?.message},{status:400});
 const pids=[...new Set((a.data||[]).map((x:any)=>String(x.pole_player_id)).filter(Boolean))];
 const p=pids.length?await db.from("players").select("id,first_name,last_name,photo_url,position_primary,number").in("id",pids):{data:[]};
 const tm=new Map((t.data||[]).map((x:any)=>[String(x.id),x])),pm=new Map((p.data||[]).map((x:any)=>[String(x.id),x])),sm=new Map((st.data||[]).map((x:any)=>[String(x.id),x]));
 return NextResponse.json({teams:(l.data||[]).map((x:any)=>({id:String(x.id),access:"consultation",structure:sm.get(String(x.structure_id))||null,team:tm.get(String(x.team_id))||null,assignments:(a.data||[]).filter((y:any)=>String(y.structure_id)===String(x.structure_id)&&String(y.partner_team_id)===String(x.team_id)).map((y:any)=>({...y,player:pm.get(String(y.pole_player_id))||null}))})).filter((x:any)=>x.team)});
}