import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin-server';
import {canManageSport} from '@/lib/institutionnel/sport-access-server';
import {resolveCanonicalPoleRoster} from '@/lib/institutionnel/pole-roster-links';

async function resolvePlayer(db:any,playerId:string,teamId:string){
 const current=await resolveCanonicalPoleRoster(db,{rosterPlayerId:playerId});
 if(current)return current.sources.some(s=>s.teamId===teamId)?current:null;
 const linked=await db.from('institutional_pole_player_team_links').select('institutional_player_id,structure_id,season_id,pole_team_id,partner_team_id').or(`partner_player_id.eq.${playerId},pole_player_id.eq.${playerId}`).eq('active',true).limit(20);
 const valid=(linked.data||[]).find((l:any)=>l.pole_team_id===teamId||l.partner_team_id===teamId);if(valid)return valid;
 const membership=await db.from('institutional_pole_player_memberships').select('institutional_player_id,structure_id,season_id,pole_team_id').eq('pole_player_id',playerId).eq('pole_team_id',teamId).eq('active',true).maybeSingle();return membership.data||null;
}
async function allowed(db:any,userId:string,teamId:string,structureId:string,write=false){
 const [owner,staff,institution]=await Promise.all([
  db.from('teams').select('id').eq('id',teamId).eq('user_id',userId).maybeSingle(),
  db.from('team_members').select('permissions').eq('team_id',teamId).eq('user_id',userId).eq('status','active').maybeSingle(),
  db.from('institutional_members').select('role,permissions').eq('structure_id',structureId).eq('user_id',userId).eq('status','active').maybeSingle()
 ]);
 return !!owner.data||!!(staff.data&&staff.data.permissions?.view_team!==false&&(!write||staff.data.permissions?.players===true||staff.data.permissions?.sessions===true))||!!(institution.data&&(!write||canManageSport(institution.data)));
}
export async function GET(req:Request){try{
 const sb=await createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:'Non connecté'},{status:401});
 const u=new URL(req.url),playerId=u.searchParams.get('partnerPlayerId')||'',teamId=u.searchParams.get('teamId')||'';const db=createAdminClient()||sb;
 if(!playerId||!teamId)return NextResponse.json({error:'Joueur et équipe obligatoires'},{status:400});
 const resolved=await resolvePlayer(db,playerId,teamId);if(!resolved)return NextResponse.json({linked:false,reports:[]});
 if(!await allowed(db,user.id,teamId,resolved.structure_id))return NextResponse.json({error:'Accès refusé'},{status:403});
 const q=await db.from('institutional_pole_sports_reports').select('*').eq('structure_id',resolved.structure_id).eq('institutional_player_id',resolved.institutional_player_id).order('report_date',{ascending:false}).order('created_at',{ascending:false});
 if(q.error)throw Error(q.error.message);return NextResponse.json({linked:true,link:resolved,reports:q.data||[]});
}catch{return NextResponse.json({error:'Bilans indisponibles. Réessaie.'},{status:503})}}

export async function POST(req:Request){try{
 const sb=await createClient();const{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:'Non connecté'},{status:401});
 const b=await req.json().catch(()=>({})),db=createAdminClient()||sb,teamId=String(b.teamId||'');
 const resolved=b.partnerPlayerId?await resolvePlayer(db,String(b.partnerPlayerId),teamId):null;
 const institutionalPlayerId=resolved?.institutional_player_id||String(b.institutionalPlayerId||''),structureId=resolved?.structure_id||String(b.structureId||'');
 if(b.partnerPlayerId&&!resolved)return NextResponse.json({error:'Joueur non relié à cette équipe'},{status:403});
 if(!institutionalPlayerId||!structureId||!teamId)return NextResponse.json({error:'Joueur non relié au Pôle'},{status:400});
 if(!resolved){const m=await db.from('institutional_members').select('role,permissions').eq('structure_id',structureId).eq('user_id',user.id).eq('status','active').maybeSingle();const p=await db.from('institutional_players').select('id').eq('id',institutionalPlayerId).eq('structure_id',structureId).eq('archived',false).maybeSingle();if(!m.data||!canManageSport(m.data)||!p.data)return NextResponse.json({error:'Accès refusé'},{status:403});}
 if(!await allowed(db,user.id,teamId,structureId,true))return NextResponse.json({error:'Droits insuffisants'},{status:403});
 if(!['training','match'].includes(b.reportType)||!/^\d{4}-\d{2}-\d{2}$/.test(String(b.reportDate||'')))return NextResponse.json({error:'Type de bilan et date obligatoires'},{status:400});
 const minutes=b.minutesPlayed===''||b.minutesPlayed==null?null:Number(b.minutesPlayed);if(minutes!==null&&(!Number.isFinite(minutes)||minutes<0||minutes>1000))return NextResponse.json({error:'Minutes invalides'},{status:400});
 const link=await db.from('institutional_pole_teams').select('team_kind').eq('structure_id',structureId).eq('team_id',teamId).eq('active',true).maybeSingle();if(link.error||!link.data)return NextResponse.json({error:'Équipe non reliée à cette institution'},{status:403});
 const q=await db.from('institutional_pole_sports_reports').insert({structure_id:structureId,institutional_player_id:institutionalPlayerId,team_id:teamId,season_id:resolved?.season_id||b.seasonId||null,report_type:b.reportType,report_date:b.reportDate,opponent:b.opponent||null,event_title:b.eventTitle||null,minutes_played:minutes,starter:!!b.starter,attendance_status:b.attendanceStatus||null,involvement:b.involvement||null,behavior:b.behavior||null,intensity:b.intensity||null,physical_state:b.physicalState||null,role_text:b.roleText||null,positives:b.positives||null,improvement_areas:b.improvementAreas||null,coach_comment:b.coachComment||null,author_user_id:user.id,author_context:link.data.team_kind==='pole'?'pole':'club'}).select('*').single();
 if(q.error)throw Error(q.error.message);return NextResponse.json({ok:true,report:q.data});
}catch{return NextResponse.json({error:'Enregistrement du bilan impossible. Réessaie.'},{status:400})}}
