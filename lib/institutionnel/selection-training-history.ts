async function pages(read:(start:number)=>PromiseLike<{data:any[]|null;error:any}>){const rows:any[]=[];for(let start=0;;start+=1000){const result=await read(start);if(result.error)throw result.error;rows.push(...(result.data||[]));if((result.data||[]).length<1000)return rows;}}
async function batches(ids:string[],read:(ids:string[],start:number)=>PromiseLike<{data:any[]|null;error:any}>){const rows:any[]=[];for(let start=0;start<ids.length;start+=100)rows.push(...await pages(page=>read(ids.slice(start,start+100),page)));return rows;}
export async function loadSelectionTrainingHistory(db:any,structureId:string,selectionId:string){
 const events=await pages(start=>db.from('institutional_events').select('id,title,event_date,start_time,end_time,location,event_type,description').eq('structure_id',structureId).eq('selection_id',selectionId).eq('archived',false).order('event_date',{ascending:false}).order('id').range(start,start+999));
 const [sessions,resources]=await Promise.all([
  pages(start=>db.from('institutional_player_attendance_sessions').select('id,event_id').eq('structure_id',structureId).eq('selection_id',selectionId).order('id').range(start,start+999)),
  batches(events.map(event=>event.id),(ids,start)=>db.from('institutional_event_resources').select('id,event_id,title,note,file_url').eq('structure_id',structureId).in('event_id',ids).order('id').range(start,start+999)),
 ]);
 const records=await batches(sessions.map(session=>session.id),(ids,start)=>db.from('institutional_player_attendance_records').select('session_id,status').eq('structure_id',structureId).in('session_id',ids).order('id').range(start,start+999));
 const bySession=new Map(sessions.map(session=>[session.id,session.event_id])),counts:Record<string,{total:number;present:number}>={};
 for(const record of records){const id=bySession.get(record.session_id);if(!id)continue;counts[id]??={total:0,present:0};counts[id].total++;if(record.status==='present')counts[id].present++;}
 return{events,resources,counts};
}
