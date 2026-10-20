import { NextResponse } from 'next/server';
import { institutionalSportActor, canManageSport } from '@/lib/institutionnel/sport-access-server';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status});
const types:Record<string,string>={detection:'Détection',training:'Entraînement',camp:'Stage',selection:'Rassemblement',tournament:'Tournoi',pole_test:'Test',other:'Autre'};
export async function GET(req:Request){
 const structureId=new URL(req.url).searchParams.get('structureId')||'';
 if(!structureId)return json({error:'Institution manquante'},400);
 const ctx=await institutionalSportActor(structureId);if('error'in ctx)return ctx.error;
 const eventId=new URL(req.url).searchParams.get('eventId');
 if(eventId){
  const day=await ctx.admin.from('institutional_detection_events').select('*').eq('id',eventId).eq('structure_id',structureId).eq('archived',false).maybeSingle();
  if(day.error||!day.data)return json({error:'Journée introuvable'},404);
  const calendar=await ctx.admin.from('institutional_events').select('*').eq('id',eventId).eq('structure_id',structureId).eq('archived',false).maybeSingle();
  if(calendar.error)return json({error:calendar.error.message},400);
  return json({event:day.data,calendar:calendar.data});
 }
 const links:any[]=[];
 for(let start=0;;start+=1000){const q=await ctx.admin.from('institutional_events').select('id,selection_id,event_type').eq('structure_id',structureId).eq('archived',false).order('id').range(start,start+999);if(q.error)return json({error:q.error.message},400);links.push(...(q.data||[]));if((q.data||[]).length<1000)break;}
 return json({links});
}
export async function POST(req:Request){
 const b=await req.json().catch(()=>({})),structureId=String(b.structureId||''),selectionId=String(b.selectionId||'');
 if(!structureId)return json({error:'Institution manquante'},400);
 const ctx=await institutionalSportActor(structureId);if('error'in ctx)return ctx.error;
 if(!canManageSport(ctx.member))return json({error:'Droits insuffisants'},403);
 const selection=selectionId?await ctx.admin.from('institutional_selections').select('id,name,category,gender,season_label').eq('id',selectionId).eq('structure_id',structureId).neq('status','archived').maybeSingle():{data:null,error:null};
 if(!b.eventId&&!selectionId)return json({error:'Choisis le groupe de préparation de la sélection cible avant de créer une journée.'},400);
 if(selectionId&&(selection.error||!selection.data))return json({error:'Sélection introuvable dans cette institution'},404);
 const members=selectionId?await ctx.admin.from('institutional_selection_players').select('player_id').eq('selection_id',selectionId).eq('status','active'):{data:[],error:null};
 if(members.error)return json({error:members.error.message},400);
 const rosterIds=[...new Set<string>((members.data||[]).map((member:any)=>String(member.player_id)))];
 const explicitIds=[...new Set<string>((Array.isArray(b.playerIds)?b.playerIds:[]).map(String))];
 if(explicitIds.length){
  const found=new Set<string>();for(let start=0;start<explicitIds.length;start+=100){const rows=await ctx.admin.from('institutional_players').select('id').eq('structure_id',structureId).eq('archived',false).in('id',explicitIds.slice(start,start+100));if(rows.error)return json({error:rows.error.message},400);for(const row of rows.data||[])found.add(String(row.id));}
  if(explicitIds.some(id=>!found.has(id)))return json({error:'Choisis uniquement des joueurs actifs de la base de cette institution.'},400);
 }
 let day:any;
 let calendarType=types[String(b.event_type||'')]||'Autre';
 if(b.eventId){const q=await ctx.admin.from('institutional_detection_events').select('*').eq('id',String(b.eventId)).eq('structure_id',structureId).eq('archived',false).maybeSingle();if(q.error||!q.data)return json({error:'Journée introuvable'},404);day=q.data;const prior=await ctx.admin.from('institutional_events').select('event_type').eq('id',day.id).eq('structure_id',structureId).maybeSingle();calendarType=prior.data?.event_type||types[day.event_type]||'Autre';}
 else{
  const title=String(b.title||'').trim(),date=String(b.event_date||''),type=String(b.event_type||'');
  if(!title||title.length>200||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!types[type])return json({error:'Titre, date ou type invalide'},400);
  const q=await ctx.admin.from('institutional_detection_events').insert({structure_id:structureId,title,event_date:date,event_type:type==='training'?'other':type,start_time:b.start_time||null,location:String(b.location||'').trim()||null,created_by:ctx.user.id}).select('*').single();
  if(q.error)return json({error:q.error.message},400);day=q.data;
 }
 // The existing calendar event shares the day's identity; selection_id is the existing relation.
 const calendar=await ctx.admin.from('institutional_events').upsert({id:day.id,structure_id:structureId,selection_id:selectionId||null,event_date:day.event_date,start_time:day.start_time||null,title:day.title,event_type:calendarType,location:day.location||null,event_domain:'player',source_type:'selection',archived:false,created_by:ctx.user.id},{onConflict:'id'}).select('id').maybeSingle();
 if(calendar.error||!calendar.data){
  if(!b.eventId)await ctx.admin.from('institutional_detection_events').delete().eq('id',day.id).eq('structure_id',structureId);
  return json({error:calendar.error?.message||'Rattachement au calendrier impossible'},400);
 }
 // Import only when creating the day or when explicitly requested. Never reset an existing attendance status.
 const participantsIds=[...new Set([...((!b.eventId||b.importRoster===true)?rosterIds:[]),...explicitIds])];
 if(participantsIds.length){
  const participants=await ctx.admin.from('institutional_detection_participants').upsert(participantsIds.map(player_id=>({event_id:day.id,player_id,status:'invited'})),{onConflict:'event_id,player_id',ignoreDuplicates:true});
  if(participants.error){
   if(!b.eventId){await ctx.admin.from('institutional_events').delete().eq('id',day.id).eq('structure_id',structureId);await ctx.admin.from('institutional_detection_events').delete().eq('id',day.id).eq('structure_id',structureId);}
   return json({error:participants.error.message},400);
  }
 }
 return json({ok:true,event:day,selection:selection.data,rosterCount:participantsIds.length});
}

// Edit only the day's details. Roster, decisions, resources and selection links are untouched.
export async function PATCH(req:Request){
 const b=await req.json().catch(()=>({})),structureId=String(b.structureId||''),eventId=String(b.eventId||'');
 if(!structureId||!eventId)return json({error:'Institution ou journée manquante'},400);
 const ctx=await institutionalSportActor(structureId);if('error'in ctx)return ctx.error;
 if(!canManageSport(ctx.member))return json({error:'Droits insuffisants'},403);
 const title=String(b.title||'').trim(),date=String(b.event_date||''),type=String(b.event_type||''),location=String(b.location||'').trim(),description=String(b.description||'').trim();
 const start=String(b.start_time||''),end=String(b.end_time||'');
 const validTime=(value:string)=>!value||/^([01]\d|2[0-3]):[0-5]\d$/.test(value);
 const dateValue=new Date(date+'T12:00:00Z');
 if(!title||title.length>200||!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(dateValue.getTime())||dateValue.toISOString().slice(0,10)!==date||!types[type]||!validTime(start)||!validTime(end)||(end&&(!start||end<=start))||location.length>500||description.length>10000)return json({error:'Vérifie le titre, la date et les horaires (fin après début).'},400);
 const day=await ctx.admin.from('institutional_detection_events').select('*').eq('id',eventId).eq('structure_id',structureId).eq('archived',false).maybeSingle();
 if(day.error||!day.data)return json({error:'Journée introuvable dans cette institution'},404);
 const calendar=await ctx.admin.from('institutional_events').select('*').eq('id',eventId).eq('structure_id',structureId).maybeSingle();
 if(calendar.error)return json({error:calendar.error.message},400);
 if(calendar.data?.archived)return json({error:'Cet événement est archivé.'},409);
 let selectionPatch:{}|{selection_id:string}={};
 if(Object.prototype.hasOwnProperty.call(b,'targetSelectionId')){
  const targetId=String(b.targetSelectionId||'');
  const selected=await ctx.admin.from('institutional_selections').select('id,team_id').eq('id',targetId).eq('structure_id',structureId).neq('status','archived').maybeSingle();
  if(selected.error||!selected.data)return json({error:'Choisis une sélection cible de cette institution.'},400);
  const selectedTeam=await ctx.admin.from('teams').select('metadata').eq('id',selected.data.team_id).maybeSingle();
  if(selectedTeam.error||!selectedTeam.data||selectedTeam.data.metadata?.institutionRosterKind==='preselection')return json({error:'La cible doit être une sélection finale.'},400);
  let sameTarget=calendar.data?.selection_id===targetId;
  if(calendar.data?.selection_id&&!sameTarget){
   const oldGroup=await ctx.admin.from('institutional_selections').select('team_id').eq('id',calendar.data.selection_id).eq('structure_id',structureId).maybeSingle();
   if(oldGroup.error)return json({error:'Rattachement actuel indisponible.'},400);
   if(oldGroup.data){const groupTeam=await ctx.admin.from('teams').select('metadata').eq('id',oldGroup.data.team_id).maybeSingle();if(groupTeam.error)return json({error:'Rattachement actuel indisponible.'},400);sameTarget=groupTeam.data?.metadata?.institutionPreparationTargetId===targetId;}
  }
  if(!sameTarget)selectionPatch={selection_id:targetId};
 }

 // Preserve multi-day/all-day calendar settings; they are managed in the calendar.
 if(calendar.data?.end_date&&calendar.data.end_date!==calendar.data.event_date&&date!==day.data.event_date)return json({error:'Modifie les dates de cet événement sur plusieurs jours depuis le calendrier.'},409);
 const fields={title,event_date:date,event_type:type==='training'?'other':type,start_time:start||null,location:location||null};
 const write=await ctx.admin.from('institutional_detection_events').update(fields).eq('id',eventId).eq('structure_id',structureId).eq('archived',false);
 if(write.error)return json({error:write.error.message},400);
 const calendarFields={...selectionPatch,title,event_date:date,event_type:types[type],start_time:calendar.data?.all_day?null:start||null,end_time:calendar.data?.all_day?null:end||null,location:location||null,description:description||null,...(calendar.data?.end_date===calendar.data?.event_date?{end_date:date}:{})};
 const calendarWrite=calendar.data?await ctx.admin.from('institutional_events').update(calendarFields).eq('id',eventId).eq('structure_id',structureId):await ctx.admin.from('institutional_events').insert({...calendarFields,id:eventId,structure_id:structureId,event_domain:'player',source_type:'selection',archived:false,created_by:ctx.user.id});
 if(calendarWrite.error){
  const old=day.data;
  const rollback=await ctx.admin.from('institutional_detection_events').update({title:old.title,event_date:old.event_date,event_type:old.event_type,start_time:old.start_time,location:old.location}).eq('id',eventId).eq('structure_id',structureId);
  return json({error:rollback.error?'Sauvegarde interrompue. Recharge pour vérifier les informations avant de réessayer.':'Enregistrement impossible. Les anciennes informations ont été conservées.'},500);
 }
 return json({ok:true,event:{...day.data,...fields}});
}
