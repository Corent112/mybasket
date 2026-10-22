import {createHash} from 'node:crypto';
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
  const institution=await db.from('institutional_structures').select('name,logo_url').eq('id',structureId).maybeSingle();
  if(institution.error||!institution.data)return json({error:institution.error?.message||'Institution indisponible'},400);
  let notes:any={};try{notes=typeof practice.notes==='string'?JSON.parse(practice.notes):practice.notes||{}}catch{}
  const snapshot=await db.from('practice_sessions').update({...(institution.data.logo_url?{club_logo_url:institution.data.logo_url}:{}),notes:JSON.stringify({...notes,institutionContext:{structureId,selectionId,eventId:sourceEventId},institutionName:institution.data.name,institutionLogoUrl:institution.data.logo_url||null})}).eq('id',sessionId).eq('user_id',ctx.user.id);
  if(snapshot.error)return json({error:snapshot.error.message},400);
  const exercises=await db.from('practice_session_exercises').select('title,duration_minutes').eq('session_id',sessionId).order('sort_order');if(exercises.error)return json({error:exercises.error.message},400);
  const note=[practice.theme,...(exercises.data||[]).map((exercise:any)=>`${exercise.title}${exercise.duration_minutes?` (${exercise.duration_minutes} min)`:''}`)].filter(Boolean).join(' · ');
  const hash=createHash('sha256').update(`${sourceEventId}:${sessionId}`).digest('hex');
  const resourceId=`${hash.slice(0,8)}-${hash.slice(8,12)}-5${hash.slice(13,16)}-8${hash.slice(17,20)}-${hash.slice(20,32)}`;
  const resource=await db.from('institutional_event_resources').upsert({id:resourceId,structure_id:structureId,event_id:sourceEventId,resource_type:'document',title:practice.title||'Fiche séance et exercices',file_url:`/seances/${sessionId}`,note:note||null,completed:false,created_by:ctx.user.id},{onConflict:'id'});if(resource.error)return json({error:resource.error.message},400);
  return json({ok:true,eventId:sourceEventId});
 }
 const institution=await db.from('institutional_structures').select('name,logo_url').eq('id',structureId).maybeSingle();if(institution.error||!institution.data)return json({error:institution.error?.message||'Institution indisponible'},400);
 let institutionNotes:any={};try{institutionNotes=typeof practice.notes==='string'?JSON.parse(practice.notes):practice.notes||{}}catch{}
 const institutionSnapshot=await db.from('practice_sessions').update({...(institution.data.logo_url?{club_logo_url:institution.data.logo_url}:{}),notes:JSON.stringify({...institutionNotes,institutionContext:{structureId,selectionId,eventId:sessionId},institutionName:institution.data.name,institutionLogoUrl:institution.data.logo_url||null})}).eq('id',sessionId).eq('user_id',ctx.user.id);if(institutionSnapshot.error)return json({error:institutionSnapshot.error.message},400);
 const [snapshot,members]=await Promise.all([db.from('practice_session_players').select('player_id').eq('session_id',sessionId).eq('selected',true),db.from('institutional_selection_players').select('player_id,team_player_id').eq('selection_id',selectionId).eq('status','active')]);
 if(snapshot.error||members.error)return json({error:'Effectif de la séance indisponible'},400);
 const chosen=new Set((snapshot.data||[]).map((row:any)=>String(row.player_id))),playerIds=(members.data||[]).filter((row:any)=>chosen.has(String(row.team_player_id))).map((row:any)=>String(row.player_id));
 const event=await db.from('institutional_events').upsert({id:sessionId,structure_id:structureId,selection_id:selectionId,title:practice.title||practice.theme||'Entraînement',event_type:'Entraînement',event_domain:'player',source_type:'selection',event_date:practice.session_date,start_time:practice.start_time||null,end_time:practice.end_time||null,location:practice.location||null,description:`Fiche séance : /seances/${sessionId}`,archived:false,created_by:ctx.user.id},{onConflict:'id'});if(event.error)return json({error:event.error.message},400);
 const roster=await prepareRoster(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify({structureId,eventId:sessionId,playerIds})}));if(!roster)return json({error:"Préparation de l’effectif indisponible"},500);if(!roster.ok)return roster;
 const resource=await db.from('institutional_event_resources').upsert({id:sessionId,structure_id:structureId,event_id:sessionId,resource_type:'document',title:'Fiche séance et exercices',file_url:`/seances/${sessionId}`,note:practice.theme||null,completed:false,created_by:ctx.user.id},{onConflict:'id'});if(resource.error)return json({error:resource.error.message},400);
 return json({ok:true,eventId:sessionId,players:playerIds.length});
}

export async function GET(req:Request){
 const params=new URL(req.url).searchParams,structureId=params.get('structureId')||'',eventId=params.get('eventId')||'';if(!structureId||!eventId)return json({error:'Institution ou journée manquante'},400);
 const ctx=await institutionalSportActor(structureId);if('error'in ctx)return ctx.error;
 const day=await ctx.admin.from('institutional_events').select('id').eq('id',eventId).eq('structure_id',structureId).eq('archived',false).maybeSingle();if(day.error||!day.data)return json({error:'Journée introuvable'},404);
 const resources=await ctx.admin.from('institutional_event_resources').select('id,title,note,file_url,resource_type').eq('structure_id',structureId).eq('event_id',eventId).order('created_at');if(resources.error)return json({error:resources.error.message},400);
 const exerciseMap:Record<string,unknown[]>={},rows:any[]=[];
 for(const row of resources.data||[]){const sessionId=row.file_url?.match(/^\/seances\/([^/?#]+)$/)?.[1];let pdfUrl=null;if(sessionId){const session=await ctx.admin.from('practice_sessions').select('pdf_url,user_id,notes').eq('id',sessionId).maybeSingle();if(session.error)return json({error:session.error.message},400);let context:any=null;try{context=(typeof session.data?.notes==='string'?JSON.parse(session.data.notes):session.data?.notes)?.institutionContext}catch{};if(session.data&&(session.data.user_id===ctx.user.id||(context?.structureId===structureId&&context?.eventId===eventId))){const exercises=await ctx.admin.from('practice_session_exercises').select('title,duration_minutes,situation_image_url').eq('session_id',sessionId).order('sort_order');if(exercises.error)return json({error:exercises.error.message},400);exerciseMap[row.id]=exercises.data||[];pdfUrl=session.data.pdf_url||null;}}rows.push({...row,pdf_url:pdfUrl});}
 return json({rows,exerciseMap});
}
