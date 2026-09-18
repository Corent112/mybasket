import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

export const runtime = "nodejs";

type Access = { allowed:boolean; isAdmin:boolean; structureIds:string[] };
const uniq=(xs:string[])=>Array.from(new Set(xs.filter(Boolean)));

async function getAccess(){
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  const db=createAdminClient()||supabase;
  if(!user)return {db,user:null,access:{allowed:false,isAdmin:false,structureIds:[]} as Access};
  const [profile,memberships]=await Promise.all([
    db.from("profiles").select("platform_role").eq("id",user.id).maybeSingle(),
    db.from("institutional_members").select("structure_id,status").eq("user_id",user.id).eq("status","active"),
  ]);
  const role=String(profile.data?.platform_role||"").toLowerCase();
  const isAdmin=["ceo","superadmin","admin"].includes(role);
  const structureIds=uniq((memberships.data||[]).map((x:any)=>String(x.structure_id||"")));
  return {db,user,access:{allowed:isAdmin||structureIds.length>0,isAdmin,structureIds} as Access};
}

export async function GET(req:Request){
  try{
    const {db,user,access}=await getAccess();
    if(!user)return NextResponse.json({error:"Non connecté.",allowed:false},{status:401});
    const url=new URL(req.url);
    if(url.searchParams.get("access")==="1")return NextResponse.json({allowed:access.allowed,isAdmin:access.isAdmin});
    if(!access.allowed)return NextResponse.json({error:"Accès réservé aux Institutions.",allowed:false},{status:403});

    // Source de vérité actuelle : équipes partenaires du module Institutionnel / Pôle.
    let poleQ=db.from("institutional_pole_teams")
      .select("id,structure_id,team_id,team_kind,season_label,active")
      .eq("team_kind","partner").eq("active",true);
    if(!access.isAdmin)poleQ=poleQ.in("structure_id",access.structureIds);
    const poleRes=await poleQ.order("season_label",{ascending:false});
    const poleLinks=poleRes.error?[]:(poleRes.data||[]);

    // Compatibilité avec les équipes partenaires créées par d'anciennes versions
    // d'Institutionnel : on récupère aussi les teams portant un marqueur partenaire
    // explicite dans metadata. On ne classe JAMAIS une équipe partenaire sur la
    // seule absence d'un coach principal.
    const metaRes=await db.from("teams")
      .select("id,name,club_name,category,coach_name,club_logo_url,logo_url,metadata,user_id");
    const allTeams=metaRes.error?[]:(metaRes.data||[]);
    const legacyPartnerTeams=allTeams.filter((t:any)=>{
      const m=t?.metadata&&typeof t.metadata==="object"?t.metadata:{};
      const kind=String(m.institutionalTeamKind??m.institution_team_kind??m.teamKind??m.team_kind??m.institutionKind??"").toLowerCase();
      const structureId=String(m.institutionalStructureId??m.institutionStructureId??m.structureId??m.structure_id??"");
      const explicit=m.isPartnerTeam===true||m.is_partner_team===true||m.partner===true||kind==="partner"||kind==="partenaire";
      const authorized=access.isAdmin||(!structureId?false:access.structureIds.includes(structureId));
      return explicit&&authorized;
    });

    const linkByTeam=new Map<string,any>();
    for(const l of poleLinks)linkByTeam.set(String((l as any).team_id),l);
    for(const t of legacyPartnerTeams){
      const id=String((t as any).id); if(linkByTeam.has(id))continue;
      const m=(t as any).metadata||{};
      linkByTeam.set(id,{id:`metadata-${id}`,team_id:id,structure_id:String(m.institutionalStructureId??m.institutionStructureId??m.structureId??m.structure_id??""),season_label:String(m.seasonLabel??m.season??""),active:true,team_kind:"partner"});
    }
    const links=[...linkByTeam.values()];
    const teamIds=uniq(links.map((x:any)=>String(x.team_id||"")));
    const structureIds=uniq(links.map((x:any)=>String(x.structure_id||"")));
    if(!teamIds.length)return NextResponse.json({allowed:true,teams:[]});

    const [teamsRes,structuresRes,playersRes,matchesRes]=await Promise.all([
      db.from("teams").select("id,name,club_name,category,coach_name,club_logo_url,logo_url,metadata").in("id",teamIds),
      structureIds.length?db.from("institutional_structures").select("id,name,structure_type,logo_url").in("id",structureIds):Promise.resolve({data:[],error:null}),
      db.from("players").select("id,team_id").in("team_id",teamIds),
      db.from("match_stats").select("id,team_id").in("team_id",teamIds),
    ]);
    const err=teamsRes.error||(structuresRes as any).error||playersRes.error||matchesRes.error;
    if(err)throw new Error(err.message);
    const teamMap=new Map<string,any>((teamsRes.data||[]).map((x:any)=>[String(x.id),x]));
    const structureMap=new Map<string,any>(((structuresRes as any).data||[]).map((x:any)=>[String(x.id),x]));
    const pc:Record<string,number>={},mc:Record<string,number>={};
    for(const p of playersRes.data||[]){const id=String((p as any).team_id||"");if(id)pc[id]=(pc[id]||0)+1}
    for(const m of matchesRes.data||[]){const id=String((m as any).team_id||"");if(id)mc[id]=(mc[id]||0)+1}
    const teams=links.map((l:any)=>{const t=teamMap.get(String(l.team_id))||{},s=structureMap.get(String(l.structure_id))||{};return{
      linkId:String(l.id),teamId:String(l.team_id),structureId:String(l.structure_id||""),institutionName:String(s.name||"Institution"),institutionType:String(s.structure_type||""),institutionLogo:s.logo_url||null,season:String(l.season_label||""),name:String(t.name||"Équipe partenaire"),clubName:String(t.club_name||""),category:String(t.category||""),coachName:String(t.coach_name||"Coach principal à inviter"),logo:t.club_logo_url||t.logo_url||null,playerCount:pc[String(l.team_id)]||0,matchCount:mc[String(l.team_id)]||0,
    }});
    const teamId=String(url.searchParams.get("teamId")||"");
    if(!teamId)return NextResponse.json({allowed:true,teams});
    const authorized=teams.find((x:any)=>x.teamId===teamId);
    if(!authorized)return NextResponse.json({error:"Équipe partenaire inaccessible."},{status:404});
    const [rosterRes,historyRes]=await Promise.all([
      db.from("players").select("id,first_name,last_name,number,photo_url,position_primary,position_secondary,height,status").eq("team_id",teamId).order("last_name"),
      db.from("match_stats").select("*").eq("team_id",teamId).order("created_at",{ascending:false}).limit(20),
    ]);
    if(rosterRes.error)throw new Error(rosterRes.error.message);if(historyRes.error)throw new Error(historyRes.error.message);
    const matches=(historyRes.data||[]).map((m:any)=>({id:String(m.id),date:String(m.match_date||m.date||m.created_at||"").slice(0,10),opponent:String(m.opponent||m.adversaire||""),result:String(m.result||m.match_result||""),scoreFor:m.score_for??m.points_for??null,scoreAgainst:m.score_against??m.points_against??null}));
    return NextResponse.json({allowed:true,team:authorized,players:rosterRes.data||[],matches,readOnly:true});
  }catch(error:any){return NextResponse.json({error:error?.message||"Chargement impossible."},{status:400})}
}
