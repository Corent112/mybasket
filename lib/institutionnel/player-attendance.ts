export type PlayerAttendanceStatus='present'|'absent'|'excused'|'pending';
export type PlayerAttendanceSession={id:string;event_id?:string|null;session_date:string;title:string;location:string|null;session_type?:string|null};
export type PlayerAttendanceRecord={id:string;session_id:string;season_id:string|null;player_id:string;status:PlayerAttendanceStatus};
const status=(value:unknown):PlayerAttendanceStatus=>['present','absent','excused'].includes(String(value))?value as PlayerAttendanceStatus:'pending';
async function pages(query:()=>any){const rows:any[]=[];for(let start=0;;start+=1000){const result=await query().order('id').range(start,start+999);if(result.error)throw Error(result.error.message);rows.push(...(result.data||[]));if((result.data||[]).length<1000)return rows;}}
/** Read the existing session and detection sources. A detection wins for the same event. No records are created. */
export async function loadPlayerAttendance(db:any,structureId:string,playerId:string){
 const [records,days,player]=await Promise.all([
  pages(()=>db.from('institutional_player_attendance_records').select('id,session_id,season_id,player_id,status').eq('structure_id',structureId).eq('player_id',playerId)),
  pages(()=>db.from('institutional_detection_events').select('id,title,event_date,location,event_type').eq('structure_id',structureId).eq('archived',false)),
  db.from('institutional_players').select('id,profile_data').eq('structure_id',structureId).eq('id',playerId).maybeSingle()
 ]);
 if(player.error||!player.data)throw Error(player.error?.message||'Fiche joueur indisponible.');
 const sessions:any[]=[],participants:any[]=[];
 const sessionIds=[...new Set<string>(records.map(r=>String(r.session_id)))];
 for(let start=0;start<sessionIds.length;start+=100){const ids=sessionIds.slice(start,start+100);sessions.push(...await pages(()=>db.from('institutional_player_attendance_sessions').select('id,event_id,session_date,title,location,session_type').eq('structure_id',structureId).in('id',ids)));}
 for(let start=0;start<days.length;start+=100){const ids=days.slice(start,start+100).map(d=>d.id);participants.push(...await pages(()=>db.from('institutional_detection_participants').select('id,event_id,player_id,status').eq('player_id',playerId).in('event_id',ids)));}
 return mergePlayerAttendance(records,sessions,days,participants,player.data.profile_data?.detectionAttendance||{},playerId);
}
export function mergePlayerAttendance(records:any[],sessions:any[],days:any[],participants:any[],overrides:Record<string,unknown>,playerId:string){
 const dayMap=new Map(days.map(day=>[day.id,day])),byEvent=new Map<string,{session:PlayerAttendanceSession;record:PlayerAttendanceRecord}>();
 for(const record of records){const session=sessions.find(s=>s.id===record.session_id);if(!session)continue;const key=session.event_id||session.id;byEvent.set(key,{session,record:{...record,status:status(record.status)}});}
 for(const participant of participants){const day=dayMap.get(participant.event_id);if(!day)continue;const id='detection:'+day.id;
  byEvent.set(day.id,{session:{id,event_id:day.id,session_date:day.event_date,title:day.title,location:day.location,session_type:day.event_type},record:{id:participant.id,session_id:id,season_id:null,player_id:playerId,status:status(overrides[day.id]??participant.status)}});
 }
 const values=[...byEvent.values()].sort((a,b)=>b.session.session_date.localeCompare(a.session.session_date));return{sessions:values.map(v=>v.session),records:values.map(v=>v.record)};
}
export function playerAttendanceSummary(records:PlayerAttendanceRecord[],sessions:PlayerAttendanceSession[],season:{id:string;season_label:string}|undefined,today:string){
 const seasonYear=Number(season?.season_label?.match(/^(\d{4})/)?.[1]);
 const validSessions=new Set(sessions.filter(s=>{const date=String(s.session_date||'').slice(0,10);return date&&date<=today&&(!seasonYear||(date>=seasonYear+'-07-01'&&date<(seasonYear+1)+'-07-01'));}).map(s=>s.id));
 const current=records.filter(r=>validSessions.has(r.session_id)&&(!season||!r.season_id||r.season_id===season.id));
 const present=current.filter(r=>r.status==='present').length,absent=current.filter(r=>r.status==='absent').length,excused=current.filter(r=>r.status==='excused').length,pending=current.filter(r=>r.status==='pending').length,total=present+absent+excused;
 return{present,absent,excused,pending,total,rate:total?Math.round(present/total*100):0};
}
