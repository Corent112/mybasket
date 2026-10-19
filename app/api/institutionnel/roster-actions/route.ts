import {NextResponse} from 'next/server';
import {institutionalSportActor,canManageSport} from '@/lib/institutionnel/sport-access-server';
import {POST as attachPlayer} from '../sport/players/route';
export const maxDuration=60;
const json=(body:unknown,status=200)=>NextResponse.json(body,{status});
export async function POST(req:Request){
 const b=await req.json().catch(()=>({})),structureId=String(b.structureId||''),action=String(b.action||''),eventId=String(b.eventId||''),selectionId=String(b.selectionId||''),ids=[...new Set<string>((Array.isArray(b.playerIds)?b.playerIds:[]).map(String))];
 if(!structureId||!ids.length||!['add_to_selection','remove_from_detection','remove_from_selection','set_detection_attendance'].includes(action))return json({error:'Choisis des joueurs et une action.'},400);
 const ctx=await institutionalSportActor(structureId);if('error'in ctx)return ctx.error;if(!canManageSport(ctx.member))return json({error:'Droits insuffisants'},403);const db=ctx.admin;
 if(action!=='remove_from_selection'){
  if(!eventId)return json({error:'Entraînement ou détection manquant.'},400);
  const event=await db.from('institutional_detection_events').select('id').eq('id',eventId).eq('structure_id',structureId).eq('archived',false).maybeSingle();if(event.error)return json({error:event.error.message},400);
  const found=new Set<string>();
  if(event.data){for(let start=0;start<ids.length;start+=100){const rows=await db.from('institutional_detection_participants').select('player_id').eq('event_id',eventId).in('player_id',ids.slice(start,start+100));if(rows.error)return json({error:rows.error.message},400);for(const row of rows.data||[])found.add(String(row.player_id));}}
  else{
   if(action!=='add_to_selection')return json({error:'Journée de détection introuvable.'},404);
   const training=await db.from('institutional_events').select('id').eq('id',eventId).eq('structure_id',structureId).eq('archived',false).maybeSingle();if(training.error||!training.data)return json({error:'Entraînement introuvable dans cette institution.'},404);
   const session=await db.from('institutional_player_attendance_sessions').select('id').eq('structure_id',structureId).eq('event_id',eventId).maybeSingle();if(session.error||!session.data)return json({error:'Aucun groupe de joueurs associé à cet entraînement.'},404);
   for(let start=0;start<ids.length;start+=100){const rows=await db.from('institutional_player_attendance_records').select('player_id').eq('structure_id',structureId).eq('session_id',session.data.id).in('player_id',ids.slice(start,start+100));if(rows.error)return json({error:rows.error.message},400);for(const row of rows.data||[])found.add(String(row.player_id));}
  }
  if(ids.some(id=>!found.has(id)))return json({error:'La liste a changé. Recharge les participants avant de réessayer.'},409);
  if(action==='set_detection_attendance'){
   const status=String(b.status||'');if(!['present','absent','excused'].includes(status))return json({error:'Choisis Présent, Absent ou Excusé.'},400);
   const players:any[]=[];
   for(let start=0;start<ids.length;start+=100){const result=await db.from('institutional_players').select('id,profile_data,updated_at').eq('structure_id',structureId).in('id',ids.slice(start,start+100));if(result.error)return json({error:result.error.message},400);players.push(...(result.data||[]));}
   if(ids.some(id=>!players.some(player=>String(player.id)===id)))return json({error:'Une fiche est indisponible. Recharge les participants.'},409);
   const updatedPlayerIds:string[]=[];
   for(let start=0;start<players.length;start+=3){
    const results=await Promise.all(players.slice(start,start+3).map(async player=>{
     try{const profile=player.profile_data||{},profileData={...profile,detectionAttendance:{...profile.detectionAttendance,[eventId]:status}};
      let query=db.from('institutional_players').update({profile_data:profileData,updated_at:new Date().toISOString()}).eq('id',player.id).eq('structure_id',structureId);
      query=player.updated_at?query.eq('updated_at',player.updated_at):query.is('updated_at',null);
      const result=await query.select('id').maybeSingle();return !result.error&&!!result.data;
     }catch{return false;}
    }));
    results.forEach((ok,index)=>{if(ok)updatedPlayerIds.push(String(players[start+index].id));});
    if(results.some(ok=>!ok))break;
   }
   const pendingPlayerIds=ids.filter(id=>!updatedPlayerIds.includes(id));
   return json({ok:!pendingPlayerIds.length,updatedPlayerIds,pendingPlayerIds,...(pendingPlayerIds.length?{error:`${updatedPlayerIds.length} présence(s) enregistrée(s). Certaines fiches ont changé ou sont indisponibles. Les autres restent cochées : réessaie.`}:{})},pendingPlayerIds.length?409:200);
  }
  if(action==='remove_from_detection'){
   const removed:string[]=[];for(let start=0;start<ids.length;start+=100){const result=await db.from('institutional_detection_participants').delete().eq('event_id',eventId).in('player_id',ids.slice(start,start+100)).select('player_id');if(result.error)return json({error:result.error.message,removedPlayerIds:removed},400);removed.push(...(result.data||[]).map((row:any)=>String(row.player_id)));}return json({ok:true,removedPlayerIds:removed});
  }
 }
 if(!selectionId)return json({error:'Choisis une sélection de destination.'},400);
 const selection=await db.from('institutional_selections').select('id,team_id').eq('id',selectionId).eq('structure_id',structureId).neq('status','archived').maybeSingle();if(selection.error||!selection.data)return json({error:'Sélection introuvable dans cette institution.'},404);
 if(action==='remove_from_selection'){
  const found=new Set<string>();for(let start=0;start<ids.length;start+=100){const rows=await db.from('institutional_selection_players').select('player_id').eq('selection_id',selectionId).in('player_id',ids.slice(start,start+100));if(rows.error)return json({error:rows.error.message},400);for(const row of rows.data||[])found.add(String(row.player_id));}
  if(ids.some(id=>!found.has(id)))return json({error:'L’effectif a changé. Recharge la sélection.'},409);
  const removed:string[]=[];for(let start=0;start<ids.length;start+=100){const result=await db.from('institutional_selection_players').delete().eq('selection_id',selectionId).in('player_id',ids.slice(start,start+100)).select('player_id');if(result.error)return json({error:result.error.message,removedPlayerIds:removed},400);removed.push(...(result.data||[]).map((row:any)=>String(row.player_id)));}return json({ok:true,removedPlayerIds:removed});
 }
 const [members,team]=await Promise.all([db.from('institutional_selection_players').select('player_id').eq('selection_id',selectionId).eq('status','active'),db.from('teams').select('metadata').eq('id',selection.data.team_id).maybeSingle()]);if(members.error||team.error||!team.data)return json({error:'Effectif de destination indisponible.'},400);
 const existing=new Set<string>((members.data||[]).map((row:any)=>String(row.player_id))),missing=ids.filter(id=>!existing.has(id)),limit=Number(team.data.metadata?.institutionSelectionMaxPlayers)===10?10:12;
 if(missing.length&&existing.size+missing.length>limit)return json({error:`Cette sélection contient ${existing.size} joueurs sur ${limit}. Choisis au maximum ${Math.max(0,limit-existing.size)} nouveau(x) joueur(s).`,addedPlayerIds:[],alreadyExistingIds:ids.filter(id=>existing.has(id)),pendingPlayerIds:missing},409);
 const added:string[]=[],failures:string[]=[];
 for(let start=0;start<missing.length;start+=3){
  const batch=await Promise.all(missing.slice(start,start+3).map(async playerId=>{try{const response=await attachPlayer(new Request(req.url,{method:'POST',headers:req.headers,body:JSON.stringify({structureId,mode:'attach',selectionId,playerId})}));const body=await response?.json();return{playerId,ok:!!response?.ok,error:body?.error};}catch{return{playerId,ok:false,error:'Connexion interrompue'};}}));
  for(const item of batch)if(item.ok)added.push(item.playerId);else failures.push(item.error||'Ajout impossible');if(failures.length)break;
 }
 const pending=missing.filter(id=>!added.includes(id));
 return json({ok:!pending.length,addedPlayerIds:added,alreadyExistingIds:ids.filter(id=>existing.has(id)),pendingPlayerIds:pending,...(pending.length?{error:`${added.length} ajout(s) enregistré(s). ${failures[0]}. Les autres restent cochés pour réessayer.`}:{})},pending.length?409:200);
}
