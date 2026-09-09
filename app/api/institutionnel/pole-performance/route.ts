import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin-server";

export const runtime="nodejs";
const n=(v:any)=>Number(v||0)||0;
async function rows(q:any){try{const r=await q;return r?.error?[]:(r?.data||[])}catch{return []}}
async function one(q:any){try{const r=await q;return r?.error?null:(r?.data||null)}catch{return null}}
async function allowed(db:any,userId:string,structureId:string){
 const member=await one(db.from("institutional_members").select("id").eq("structure_id",structureId).eq("user_id",userId).eq("status","active").maybeSingle());
 if(member)return true;
 const structure=await one(db.from("institutional_structures").select("created_by").eq("id",structureId).maybeSingle());
 return String(structure?.created_by||"")===userId;
}
function add(t:any,r:any){t.games++;t.minutes+=n(r.minutes??r.min);t.pts+=n(r.pts);t.reb+=n(r.reb)||n(r.off_reb)+n(r.def_reb);t.ast+=n(r.ast);t.stl+=n(r.stl);t.blk+=n(r.blk);t.turnovers+=n(r.turnovers??r.to);t.p2m+=n(r.p2m);t.p2a+=n(r.p2a);t.p3m+=n(r.p3m);t.p3a+=n(r.p3a);t.ftm+=n(r.ftm);t.fta+=n(r.fta)}
const blank=()=>({games:0,minutes:0,pts:0,reb:0,ast:0,stl:0,blk:0,turnovers:0,p2m:0,p2a:0,p3m:0,p3a:0,ftm:0,fta:0});

export async function GET(req:Request){
 const sb=await createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:"Non connecté."},{status:401});
 const u=new URL(req.url),structureId=u.searchParams.get("structureId")||"",playerId=u.searchParams.get("playerId")||"";
 if(!structureId||!playerId)return NextResponse.json({error:"Structure ou joueur manquant."},{status:400});
 const db=createAdminClient()||sb;if(!(await allowed(db,user.id,structureId)))return NextResponse.json({error:"Accès refusé."},{status:403});

 const [memberships,links,selections]=await Promise.all([
  rows(db.from("institutional_pole_player_memberships").select("pole_team_id,pole_player_id").eq("structure_id",structureId).eq("institutional_player_id",playerId).eq("active",true)),
  rows(db.from("institutional_pole_player_team_links").select("partner_team_id,partner_player_id").eq("structure_id",structureId).eq("institutional_player_id",playerId).eq("active",true)),
  rows(db.from("institutional_player_selection_links").select("*").eq("structure_id",structureId).eq("institutional_player_id",playerId).eq("active",true)),
 ]);
 const raw=[
  ...memberships.map((x:any)=>({context:"pole",teamId:String(x.pole_team_id),playerId:String(x.pole_player_id),selectionLevel:null})),
  ...links.map((x:any)=>({context:"club",teamId:String(x.partner_team_id),playerId:String(x.partner_player_id),selectionLevel:null})),
  ...selections.map((x:any)=>({context:"selection",teamId:String(x.team_id),playerId:String(x.roster_player_id),selectionLevel:x.selection_level,label:x.label||null})),
 ].filter((x:any)=>x.teamId&&x.playerId);
 const uniq=new Map(raw.map((x:any)=>[`${x.context}|${x.teamId}|${x.playerId}`,x]));const sources0=[...uniq.values()] as any[];
 const teamIds=[...new Set(sources0.map(x=>x.teamId))],playerIds=[...new Set(sources0.map(x=>x.playerId))];
 const teams=teamIds.length?await rows(db.from("teams").select("id,name,club_name").in("id",teamIds)):[];
 const tm=new Map<string, any>(teams.map((x:any)=>[String(x.id),x]));
 const sources=sources0.map(x=>({...x,teamName:x.label||tm.get(x.teamId)?.name||tm.get(x.teamId)?.club_name||(x.context==="pole"?"Équipe Pôle":x.context==="club"?"Club partenaire":"Sélection")}));
 const combo=new Map<string, any>(sources.map((x:any)=>[`${x.teamId}|${x.playerId}`,x]));
 const statRows=playerIds.length?await rows(db.from("match_player_stats").select("*").in("player_id",playerIds).limit(10000)):[];
 const validStats=statRows.filter((r:any)=>combo.has(`${String(r.team_id)}|${String(r.player_id)}`));
 const matchIds=[...new Set(validStats.map((r:any)=>String(r.match_id||"")).filter(Boolean))];
 const matches=matchIds.length?await rows(db.from("match_stats").select("id,match_date,opponent,project_status").in("id",matchIds)):[];
 const mm=new Map<string, any>(matches.map((m:any)=>[String(m.id),m]));
 const totals:any={all:blank(),club:blank(),pole:blank(),selection:blank()};const out:any[]=[];
 for(const r of validStats){
  const m=mm.get(String(r.match_id));if(m?.project_status==="draft")continue;
  const source:any=combo.get(`${String(r.team_id)}|${String(r.player_id)}`);if(!source)continue;
  add(totals[source.context],r);add(totals.all,r);
  out.push({id:String(r.match_id),date:String(m?.match_date||"").slice(0,10),opponent:String(m?.opponent||""),teamName:source.teamName,context:source.context,selectionLevel:source.selectionLevel,pts:n(r.pts),reb:n(r.reb)||n(r.off_reb)+n(r.def_reb),ast:n(r.ast),minutes:n(r.minutes??r.min)});
 }
 out.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 return NextResponse.json({totals,matches:out,sources});
}

export async function POST(req:Request){
 const sb=await createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:"Non connecté."},{status:401});
 const body=await req.json().catch(()=>({}));const structureId=String(body.structureId||""),playerId=String(body.playerId||""),teamId=String(body.teamId||""),rosterPlayerId=String(body.rosterPlayerId||"");
 if(!structureId||!playerId||!teamId||!rosterPlayerId)return NextResponse.json({error:"Informations incomplètes."},{status:400});
 const db=createAdminClient()||sb;if(!(await allowed(db,user.id,structureId)))return NextResponse.json({error:"Accès refusé."},{status:403});
 const level=["departmental","regional","national","other"].includes(String(body.selectionLevel))?String(body.selectionLevel):"other";
 const q=await db.from("institutional_player_selection_links").upsert({structure_id:structureId,institutional_player_id:playerId,team_id:teamId,roster_player_id:rosterPlayerId,selection_level:level,label:String(body.label||"").trim()||null,active:true,created_by:user.id},{onConflict:"structure_id,institutional_player_id,team_id,roster_player_id"}).select("id").single();
 if(q.error)return NextResponse.json({error:q.error.message},{status:400});
 return NextResponse.json({ok:true,id:q.data.id});
}
