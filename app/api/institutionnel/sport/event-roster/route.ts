import {NextResponse} from 'next/server';
import {createHash} from 'node:crypto';
import {institutionalSportActor,canManageSport} from '@/lib/institutionnel/sport-access-server';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status});
function recordId(session:string,player:string){const b=createHash('sha256').update(`mybasket-attendance:${session}:${player}`).digest();b[6]=(b[6]&15)|80;b[8]=(b[8]&63)|128;const h=b.subarray(0,16).toString('hex');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
export async function POST(req:Request){
 const body=await req.json().catch(()=>({})),structureId=String(body.structureId||''),eventId=String(body.eventId||'');
 if(!structureId||!eventId)return json({error:'Institution ou événement manquant'},400);
 const ctx=await institutionalSportActor(structureId);if('error'in ctx)return ctx.error;if(!canManageSport(ctx.member))return json({error:'Droits insuffisants'},403);
 const db=ctx.admin;
 const event=await db.from('institutional_events').select('id,selection_id,event_date,title,location,event_type').eq('id',eventId).eq('structure_id',structureId).eq('archived',false).maybeSingle();
 if(event.error||!event.data?.selection_id)return json({error:'Événement ou sélection liée introuvable'},404);
 const e=event.data;
 const selection=await db.from('institutional_selections').select('id,season_label').eq('id',e.selection_id).eq('structure_id',structureId).neq('status','archived').maybeSingle();
 if(selection.error||!selection.data?.season_label)return json({error:'Choisis une sélection avec une saison renseignée'},400);
 const members=await db.from('institutional_selection_players').select('player_id').eq('selection_id',selection.data.id).eq('status','active');
 if(members.error)return json({error:members.error.message},400);
 const memberIds=[...new Set<string>((members.data||[]).map((p:any)=>String(p.player_id)))];
 const requested=Array.isArray(body.playerIds)?new Set<string>(body.playerIds.map(String)):null;
 if(requested&&[...requested].some(id=>!memberIds.includes(id)))return json({error:'Joueur absent de cette sélection'},400);
 const ids=requested?memberIds.filter(id=>requested.has(id)):memberIds;
 let season=await db.from('institutional_player_tracking_seasons').select('id').eq('structure_id',structureId).eq('season_label',selection.data.season_label).eq('archived',false).maybeSingle();
 if(season.error)return json({error:season.error.message},400);
 if(!season.data){season=await db.from('institutional_player_tracking_seasons').insert({structure_id:structureId,season_label:selection.data.season_label,created_by:ctx.user.id}).select('id').single();if(season.error||!season.data)return json({error:season.error?.message||'Saison indisponible'},400);}
 let session=await db.from('institutional_player_attendance_sessions').select('id').eq('structure_id',structureId).eq('event_id',eventId).maybeSingle();
 if(session.error)return json({error:session.error.message},400);
 if(!session.data){session=await db.from('institutional_player_attendance_sessions').insert({id:eventId,structure_id:structureId,season_id:season.data.id,event_id:eventId,selection_id:selection.data.id,session_type:String(e.event_type||'Entraînement').toLowerCase(),session_date:e.event_date,title:e.title,location:e.location,created_by:ctx.user.id}).select('id').single();if(session.error){session=await db.from('institutional_player_attendance_sessions').select('id').eq('structure_id',structureId).eq('event_id',eventId).maybeSingle();}if(session.error||!session.data)return json({error:'Feuille de présence indisponible'},400);}
 const sessionId=session.data.id;
 const existing=await db.from('institutional_player_attendance_records').select('player_id').eq('structure_id',structureId).eq('session_id',sessionId);
 if(existing.error)return json({error:existing.error.message},400);
 const present=new Set((existing.data||[]).map((p:any)=>String(p.player_id))),missing=ids.filter(id=>!present.has(id));
 if(missing.length){const q=await db.from('institutional_player_attendance_records').upsert(missing.map(player_id=>({id:recordId(sessionId,player_id),structure_id:structureId,session_id:sessionId,season_id:season.data!.id,player_id,status:'absent',created_by:ctx.user.id})),{onConflict:'id',ignoreDuplicates:true});if(q.error)return json({error:q.error.message},400);}
 return json({ok:true,count:ids.length,added:missing.length});
}
