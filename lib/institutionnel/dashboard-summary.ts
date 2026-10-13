type Player = {category?:string|null;sex?:string|null;archived?:boolean|null};
type Cohort = {id:string;program_id?:string;name:string;capacity?:number|null;fee_amount_cents?:number|null;training_programs?:{name?:string|null;code?:string|null}|null};
type Candidate = {id:string;cohort_id:string;administrative_status?:string|null;payment_exempt?:boolean|null;fee_override_cents?:number|null};
type Requirement = {id:string;cohort_id:string;is_required?:boolean|null};
type Submission = {candidate_id:string;request_id:string;status:string};
type Payment = {candidate_id:string;amount_cents?:number|null};
const normalized=(value:unknown)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
export function institutionalPlayerCounts(players:Player[]) {
 const counts={players:0,u13m:0,u13f:0,u14m:0,u14f:0};
 for(const player of players){
  if(player.archived)continue;counts.players++;
  const category=normalized(player.category),age=category.match(/U\s*-?\s*(12|13|14)(?!\d)/)?.[1],sex=normalized(player.sex);
  const female=['F','FILLE','FILLES','FEMALE','FEMININ','FEMININE','FEMME'].includes(sex)||(!sex&&/F$/.test(category));
  const male=['M','GARCON','GARCONS','MALE','MASCULIN','MASCULINE','HOMME'].includes(sex)||(!sex&&/M$/.test(category));
  if(!female&&!male)continue;
  if(age==='12'||age==='13')counts[female?'u13f':'u13m']++;
  if(age==='14')counts[female?'u14f':'u14m']++;
 }
 return counts;
}
export function institutionalTrainingSummaries(cohorts:Cohort[],candidates:Candidate[],requirements:Requirement[],submissions:Submission[],payments:Payment[]) {
 const validated=new Set(submissions.filter(s=>s.status==='validated').map(s=>`${s.candidate_id}:${s.request_id}`));
 const paid=new Map<string,number>();payments.forEach(p=>paid.set(p.candidate_id,(paid.get(p.candidate_id)||0)+(p.amount_cents||0)));
 return cohorts.map(cohort=>{
  const members=candidates.filter(c=>c.cohort_id===cohort.id),required=requirements.filter(r=>r.cohort_id===cohort.id&&r.is_required!==false);
  const summary={id:cohort.id,name:cohort.name,program:cohort.training_programs?.name||'',code:cohort.training_programs?.code||'',capacity:cohort.capacity??null,candidates:0,incomplete:0,complete:0,registered:0,inTraining:0,validated:0,withdrawn:0};
  members.forEach(candidate=>{
   const status=candidate.administrative_status;
   if(status==='withdrawn'){summary.withdrawn++;return;}summary.candidates++;
   const docsComplete=required.every(r=>validated.has(`${candidate.id}:${r.id}`));
   const expected=candidate.payment_exempt?0:candidate.fee_override_cents??cohort.fee_amount_cents??0;
   const paymentComplete=(paid.get(candidate.id)||0)>=expected;
   if(!docsComplete)summary.incomplete++;else summary.complete++;
   if(status==='validated')summary.validated++;
   else if(status==='in_training')summary.inTraining++;
   else if(docsComplete&&paymentComplete)summary.registered++;
  });
  return summary;
 });
}

export function institutionalTrainingProgramSummaries(programs:{id:string;name:string;code?:string|null}[],cohorts:Cohort[],candidates:Candidate[],requirements:Requirement[],submissions:Submission[],payments:Payment[]) {
 const summaries=institutionalTrainingSummaries(cohorts,candidates,requirements,submissions,payments);
 return programs.map(program=>{
  const cohortIds=new Set(cohorts.filter(c=>c.program_id===program.id).map(c=>c.id));
  const related=summaries.filter(s=>cohortIds.has(s.id));
  const sum=(key:'candidates'|'incomplete'|'complete'|'registered'|'inTraining'|'validated'|'withdrawn')=>related.reduce((n,s)=>n+s[key],0);
  return {id:program.id,name:program.name,code:program.code||'',program:`${related.length} promotion${related.length>1?'s':''}`,cohortId:related[0]?.id||null,capacity:related.length&&related.every(s=>s.capacity!==null)?related.reduce((n,s)=>n+(s.capacity||0),0):null,candidates:sum('candidates'),incomplete:sum('incomplete'),complete:sum('complete'),registered:sum('registered'),inTraining:sum('inTraining'),validated:sum('validated'),withdrawn:sum('withdrawn')};
 });
}
