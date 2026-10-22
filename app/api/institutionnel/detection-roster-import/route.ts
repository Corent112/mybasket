import {NextResponse} from 'next/server';
import {institutionalSportActor,canManageSport} from '@/lib/institutionnel/sport-access-server';
import {isEarlierPreparationDay,retainedDayPlayers} from '@/lib/institutionnel/retained-day-roster';
const json=(body:unknown,status=200)=>NextResponse.json(body,{status});
async function rows(make:()=>any){const result:any[]=[];for(let start=0;;start+=1000){const q=await make().order('id').range(start,start+999);if(q.error)throw Error(q.error.message);result.push(...(q.data||[]));if((q.data||[]).length<1000)return result;}}
async function prepare(db:any,structureId:string,eventId:string,sourceEventId:string){
 const day=await db.from('institutional_detection_events').select('id,title,event_date,start_time').eq('structure_id',structureId).eq('id',eventId).eq('archived',false).maybeSingle();
 if(day.error||!day.data)throw Error('Entraînement de destination introuvable.');
 const [days,links]=await Promise.all([
  rows(()=>db.from('institutional_detection_events').select('id,title,event_date,start_time').eq('structure_id',structureId).eq('archived',false)),
  rows(()=>db.from('institutional_events').select('id,selection_id').eq('structure_id',structureId).eq('archived',false))
 ]);
 const linkMap=new Map<string,any>(links.map(link=>[String(link.id),link])),familyCache=new Map<string,string>();
 async function family(selectionId:string|null|undefined):Promise<string>{
  if(!selectionId)return '';
  if(familyCache.has(selectionId))return familyCache.get(selectionId)!;
  const selection=await db.from('institutional_selections').select('id,team_id').eq('id',selectionId).eq('structure_id',structureId).maybeSingle();if(selection.error||!selection.data)throw Error('Sélection de cette journée introuvable.');
  const team=await db.from('teams').select('metadata').eq('id',selection.data.team_id).maybeSingle();if(team.error)throw Error(team.error.message);
  const meta=team.data?.metadata||{},root=meta.institutionRosterKind==='preselection'?String(meta.institutionPreparationTargetId||selectionId):selectionId;
  if(root!==selectionId){const parent=await db.from('institutional_selections').select('id').eq('id',root).eq('structure_id',structureId).maybeSingle();if(parent.error||!parent.data)throw Error('Sélection cible introuvable.');}
  familyCache.set(selectionId,root);return root;
 }
 const targetFamily=await family(linkMap.get(eventId)?.selection_id),sources:any[]=[];
 for(const candidate of days.filter(source=>isEarlierPreparationDay(source,day.data))){if(await family(linkMap.get(candidate.id)?.selection_id)===targetFamily)sources.push(candidate);}
 sources.sort((a,b)=>b.event_date.localeCompare(a.event_date)||String(b.start_time||'').localeCompare(String(a.start_time||''))||a.id.localeCompare(b.id));
 const source=sourceEventId?sources.find(source=>source.id===sourceEventId):sources[0];
 if(sourceEventId&&!source)throw Error('Choisis une journée précédente du même groupe de préparation.');
 if(!source)return{sourceDays:sources,sourceEventId:'',players:[],existingPlayerIds:[] as string[]};
 const participants=await rows(()=>db.from('institutional_detection_participants').select('id,player_id,status').eq('event_id',source.id)),players:any[]=[];
 const playerIds=[...new Set<string>(participants.map(part=>String(part.player_id)))];
 for(let start=0;start<playerIds.length;start+=100){const ids=playerIds.slice(start,start+100);players.push(...await rows(()=>db.from('institutional_players').select('id,first_name,last_name,club_name,category,archived,profile_data').eq('structure_id',structureId).eq('archived',false).in('id',ids)));}
 const retained=retainedDayPlayers(participants,players,source.id),current=await rows(()=>db.from('institutional_detection_participants').select('id,player_id').eq('event_id',eventId));
 return{sourceDays:sources,sourceEventId:source.id,players:retained.map(player=>({id:player.id,first_name:player.first_name,last_name:player.last_name,club_name:player.club_name,category:player.category})),existingPlayerIds:current.map(part=>String(part.player_id))};
}
export async function GET(req:Request){
 const params=new URL(req.url).searchParams,structureId=params.get('structureId')||'',eventId=params.get('eventId')||'';
 if(!structureId||!eventId)return json({error:'Choisis un entraînement.'},400);
 const ctx=await institutionalSportActor(structureId);if('error'in ctx)return ctx.error;
 try{return json(await prepare(ctx.admin,structureId,eventId,params.get('sourceEventId')||''));}catch(error){return json({error:error instanceof Error?error.message:'Chargement impossible.'},400);}
}
export async function POST(req:Request){
 const body=await req.json().catch(()=>({})),structureId=String(body.structureId||''),eventId=String(body.eventId||''),sourceEventId=String(body.sourceEventId||'');
 if(!structureId||!eventId||!sourceEventId)return json({error:'Choisis une journée précédente.'},400);
 const ctx=await institutionalSportActor(structureId);if('error'in ctx)return ctx.error;if(!canManageSport(ctx.member))return json({error:'Droits insuffisants.'},403);
 try{
  const preview=await prepare(ctx.admin,structureId,eventId,sourceEventId),existing=new Set(preview.existingPlayerIds),pending=preview.players.filter(player=>!existing.has(String(player.id))),addedPlayerIds:string[]=[];
  // Insert only invitations missing from the target. Existing statuses and decisions are never overwritten.
  for(let start=0;start<pending.length;start+=100){const result=await ctx.admin.from('institutional_detection_participants').upsert(pending.slice(start,start+100).map(player=>({event_id:eventId,player_id:player.id,status:'invited'})),{onConflict:'event_id,player_id',ignoreDuplicates:true}).select('player_id');if(result.error)return json({error:result.error.message,addedPlayerIds},400);addedPlayerIds.push(...(result.data||[]).map((row:any)=>String(row.player_id)));}
  return json({ok:true,addedPlayerIds,alreadyPresent:preview.players.length-pending.length,retainedCount:preview.players.length});
 }catch(error){return json({error:error instanceof Error?error.message:'Ajout impossible.'},400);}
}
