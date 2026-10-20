import {NextResponse} from 'next/server';
import {institutionalSportActor,canManageSport} from '@/lib/institutionnel/sport-access-server';
import {POST as prepareRoster} from '../sport/event-roster/route';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status});
export async function POST(req:Request){
 const b=await req.json().catch(()=>({})),structureId=String(b.structureId||''),selectionId=String(b.selectionId||''),sessionId=String(b.sessionId||'');if(!structureId||!selectionId||!sessionId)return json({error:'Institution, sélection ou séance manquante'},400);
 const ctx=await institutionalSportActor(structureId);if('error'in ctx)return ctx.error;if(!canManageSport(ctx.member))return json({error:'Droits insuffisants'},403);
 const db=ctx.admin;
 const [session,selection]=await Promise.all([db.from('practice_sessions').select('*').eq('id',sessionId).eq('user_id',ctx.user.id).maybeSingle(),db.from('institutional_selections').select('id,team_id,name').eq('id',selectionId).eq('structure_id',structureId).neq('status','archived').maybeSingle()]);
 if(session.error||!session.data||selection.error||!selection.data)return json({error:'Séance ou sélection introuvable'},404);
 const practice=session.data;if(practice.team_id!==selection.data.team_id)return json({error:'La séance ne correspond pas à l’équipe de cette sélection'},400);
 const sourceEventId=String(b.eventId||'');
 if(sourceEventId){
  const day=await db.from('institutional_events').select('id,selection_id').eq('id',sourceEventId).eq('structure_id',structureId).eq('archived',false).maybeSingle();
  if(day.error||!day.data||!day.data.selection_id)return json({error:'Journée de préparation introuvable'},404);
  if(day.data.selection_id!==selectionId){
   const group=await db.from('institutional_selections').select('team_id').eq('id',day.data.selection_id).eq('structure_id',structureId).neq('status','archived').maybeSingle();
   if(group.error||!group.data)return json({error:'Groupe de préparation introuvable'},404);
   const team=await db.from('teams').select('metadata').eq('id',group.data.team_id).maybeSingle();
   if(team.error||team.data?.metadata?.institutionRosterKind!=='preselection'||team.data.metadata.institutionPreparationTargetId!==selectionId)return json({error:'Cette journée ne prépare pas la sélection choisie'},400);
  }
  const exercises=await db.from('practice_session_exercises').select('title,duration_minutes').eq('session_id',sessionId).order('sort_order');if(exercises.error)return json({error:exercises.error.message},400);
  const note=[practice.theme,...(exercises.data||[]).map((exercise:any)=>`${exercise.title}${exercise.duration_minutes?` (${exercise.duration_minutes} min)`:''}`)].filter(Boolean).join(' · ');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(`${sourceEventId}:${sessionId}`)))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const resourceId=`${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
  const resource=await db.from('institutional_event_resources').upsert({id:resourceId,structure_id:structureId,event_id:sourceEventId,resource_type:'document',title:practice.title||'Fiche séance et exercices',file_url:`/seances/${sessionId}`,note:note||null,completed:false,created_by:ctx.user.id},{onConflict:'id'});if(resource.error)return json({error:resource.error.message},400);
  return json({ok:true,eventId:sourceEventId});
 }
 const [snapshot,members]=await Promise.all([db.from('practice_session_players').select('player_id').eq('session_id',sessionId).eq('selected',true),db.from('institutional_selection_players').select('player_id,team_player_id').eq('selection_id',selectionId).eq('status','active')]);
 if(snapshot.error||members.error)return json({error:'Effectif de la séance indisponible'},400);
 const chosen=new Set((snapshot.data||[]).map((row:any)=>String(row.player_id))),playerIds=(members.data||[]).filter((row:any)=>chosen.has(String(row.team_player_id))).map((row:any)=>String(row.player_id));
 const event=await db.from('institutional_events').upsert({id:sessionId,structure_id:structureId,selection_id:selectionId,title:practice.title||practice.theme||'Entraînement',event_type:'Entraînement',event_domain:'player',source_type:'selection',event_date:practice.session_date,start_time:practice.start_time||null,end_time:practice.end_time||null,location:practice.location||null,description:`Fiche séance : /seances/${sessionId}`,archived:false,created_by:ctx.user.id},{onConflict:'id'});if(event.error)return json({error:event.error.message},400);
 const roster=await prepareRoster(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify({structureId,eventId:sessionId,playerIds})}));if(!roster)return json({error:"Préparation de l’effectif indisponible"},500);if(!roster.ok)return roster;
 const resource=await db.from('institutional_event_resources').upsert({id:sessionId,structure_id:structureId,event_id:sessionId,resource_type:'document',title:'Fiche séance et exercices',file_url:`/seances/${sessionId}`,note:practice.theme||null,completed:false,created_by:ctx.user.id},{onConflict:'id'});if(resource.error)return json({error:resource.error.message},400);
 return json({ok:true,eventId:sessionId,players:playerIds.length});
}
