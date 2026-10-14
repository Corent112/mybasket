import {NextResponse} from 'next/server';
import {institutionalSportActor} from '@/lib/institutionnel/sport-access-server';
import {institutionalPlayerCounts,institutionalTrainingProgramSummaries} from '@/lib/institutionnel/dashboard-summary';
export async function GET(request:Request){
 const structureId=new URL(request.url).searchParams.get('structureId')||'';
 if(!structureId)return NextResponse.json({error:'Institution manquante'},{status:400});
 const actor=await institutionalSportActor(structureId);if('error' in actor)return actor.error;
 const db=actor.admin;const issues:string[]=[];
 async function all(make:()=>any){const rows:any[]=[];for(let start=0;;start+=1000){const q=await make().order('id').range(start,start+999);if(q.error)throw new Error(q.error.message);rows.push(...q.data);if(q.data.length<1000)return rows;}}
 async function grouped(table:string,columns:string,key:string,ids:string[]){const rows:any[]=[];for(let start=0;start<ids.length;start+=50)rows.push(...await all(()=>db.from(table).select(columns).in(key,ids.slice(start,start+50))));return rows;}
 try{
  const [players,cohorts,programs,referrals,detections,events,structure]=await Promise.all([
   all(()=>db.from('institutional_players').select('id,category,sex,archived,birthdate').eq('structure_id',structureId)),
   all(()=>db.from('training_cohorts').select('*,training_programs(name,code)').eq('institution_id',structureId)),
   all(()=>db.from('training_programs').select('id,name,code').eq('institution_id',structureId)),
   db.from('institutional_player_referrals').select('id',{count:'exact',head:true}).eq('structure_id',structureId).in('status',['new','reviewing']),
   db.from('institutional_detection_events').select('id',{count:'exact',head:true}).eq('structure_id',structureId).or('archived.is.null,archived.eq.false'),
   all(()=>db.from('institutional_events').select('id,title,event_date,location,archived').eq('structure_id',structureId).or('archived.is.null,archived.eq.false').gte('event_date',new Date().toISOString().slice(0,10))).catch(error=>{issues.push(`Calendrier : ${error.message}`);return [];}),
   db.from('institutional_structures').select('season_label').eq('id',structureId).single()
  ]);
  if(structure.error)throw new Error(structure.error.message);
  if(referrals.error)issues.push(`Signalements : ${referrals.error.message}`);
  if(detections.error)issues.push(`Détections : ${detections.error.message}`);
  const ids=cohorts.map(c=>c.id);
  const [candidates,requirements,payments]=await Promise.all([
   grouped('training_candidates','*','cohort_id',ids),
   grouped('training_document_requests','*','cohort_id',ids),
   grouped('training_candidate_payments','*','cohort_id',ids)
  ]);
  const submissions=await grouped('training_document_submissions','*','request_id',requirements.map(r=>r.id));
  const formations=institutionalTrainingProgramSummaries(programs,cohorts,candidates,requirements,submissions,payments);
  return NextResponse.json({k:{...institutionalPlayerCounts(players,structure.data?.season_label),referrals:referrals.error?null:referrals.count||0,detections:detections.error?null:detections.count||0,cohorts:formations.length,candidates:formations.reduce((n,f)=>n+f.candidates,0),incomplete:formations.reduce((n,f)=>n+f.incomplete,0)},formations,issues,warnings:events.filter(e=>!String(e.location||'').trim()).sort((a,b)=>a.event_date.localeCompare(b.event_date)).map(e=>({id:e.id,title:e.title,event_date:e.event_date,message:'Aucun lieu n’est renseigné'}))},{headers:{'Cache-Control':'no-store'}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:'Chargement du dashboard impossible'},{status:500});}
}
