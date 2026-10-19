import { NextResponse } from 'next/server';
import { institutionalSportActor, canManageSport } from '@/lib/institutionnel/sport-access-server';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status});
const types:Record<string,string>={detection:'Détection',training:'Entraînement',camp:'Stage',selection:'Rassemblement',tournament:'Tournoi',pole_test:'Test',other:'Autre'};
export async function GET(req:Request){
 const structureId=new URL(req.url).searchParams.get('structureId')||'';
 if(!structureId)return json({error:'Institution manquante'},400);
 const ctx=await institutionalSportActor(structureId);if('error'in ctx)return ctx.error;
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
