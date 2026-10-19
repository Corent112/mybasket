async function pages(read:(start:number)=>PromiseLike<{data:any[]|null;error:any}>){const rows:any[]=[];for(let start=0;;start+=1000){const result=await read(start);if(result.error)throw result.error;rows.push(...(result.data||[]));if((result.data||[]).length<1000)return rows;}}
async function batches(ids:string[],read:(ids:string[],start:number)=>PromiseLike<{data:any[]|null;error:any}>){const rows:any[]=[];for(let start=0;start<ids.length;start+=100)rows.push(...await pages(page=>read(ids.slice(start,start+100),page)));return rows;}
export async function loadSelectionTrainingHistory(db:any,structureId:string,selectionId:string){
 const events=await pages(start=>db.from('institutional_events').select('id,title,event_date,start_time,end_time,location,event_type,description').eq('structure_id',structureId).eq('selection_id',selectionId).eq('archived',false).order('event_date',{ascending:false}).order('id').range(start,start+999));
 const [sessions,resources]=await Promise.all([
  pages(start=>db.from('institutional_player_attendance_sessions').select('id,event_id').eq('structure_id',structureId).eq('selection_id',selectionId).order('id').range(start,start+999)),
  batches(events.map(event=>event.id),(ids,start)=>db.from('institutional_event_resources').select('id,event_id,title,note,file_url').eq('structure_id',structureId).in('event_id',ids).order('id').range(start,start+999)),
 ]);
 const records=await batches(sessions.map(session=>session.id),(ids,start)=>db.from('institutional_player_attendance_records').select('session_id,status,player_id').eq('structure_id',structureId).in('session_id',ids).order('id').range(start,start+999));
 const bySession=new Map(sessions.map(session=>[session.id,session.event_id])),counts:Record<string,{total:number;present:number}>={};
 for(const record of records){const id=bySession.get(record.session_id);if(!id)continue;counts[id]??={total:0,present:0};counts[id].total++;if(record.status==='present')counts[id].present++;}
 const detections=await batches(events.map(event=>event.id),(ids,start)=>db.from('institutional_detection_events').select('id').eq('structure_id',structureId).eq('archived',false).in('id',ids).order('id').range(start,start+999));
 const detectionIds=new Set<string>(detections.map(row=>row.id).filter(Boolean));
 const parts=await batches([...detectionIds],(ids,start)=>db.from('institutional_detection_participants').select('event_id,player_id,status').in('event_id',ids).order('id').range(start,start+999));
 const playerIds=[...new Set<string>([...records,...parts].map(row=>row.player_id).filter(Boolean))];
 const players=await batches(playerIds,(ids,start)=>db.from('institutional_players').select('id,first_name,last_name,club_name,category,birthdate,profile_data').eq('structure_id',structureId).in('id',ids).order('id').range(start,start+999));
 const playerMap=new Map(players.map(player=>[player.id,player])),rosters:Record<string,Array<{playerId:string;firstName:string;lastName:string;club:string;status:string;retained:boolean}>>={};
 const add=(eventId:string,row:any)=>{const player=playerMap.get(row.player_id);if(!player)return;const status=player.profile_data?.detectionAttendance?.[eventId]||row.status,retained=(player.profile_data?.detectionDecisions?.[eventId]??row.status)==='selected';const list=rosters[eventId]??=[];if(!list.some(item=>item.playerId===row.player_id))list.push({playerId:row.player_id,firstName:player.first_name||'',lastName:player.last_name||'',club:player.club_name||'',status,retained});};
 for(const row of records){const eventId=bySession.get(row.session_id);if(eventId&&!detectionIds.has(eventId))add(eventId,row);}
 for(const row of parts)add(row.event_id,row);
 for(const eventId of detectionIds){const rows=parts.filter(row=>row.event_id===eventId);counts[eventId]={total:rows.length,present:rows.filter(row=>(playerMap.get(row.player_id)?.profile_data?.detectionAttendance?.[eventId]||row.status)==='present').length};}
 return{events:events.map(event=>({...event,isDetection:detectionIds.has(event.id)})),resources,counts,rosters};
}
