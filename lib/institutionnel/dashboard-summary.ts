import {playerAgeCategory} from "./player-category";
type Player = {birthdate?:string|null;category?:string|null;sex?:string|null;archived?:boolean|null};
type Cohort = {id:string;program_id?:string;name:string;capacity?:number|null;fee_amount_cents?:number|null;training_programs?:{name?:string|null;code?:string|null}|null};
type Candidate = {id:string;cohort_id:string;administrative_status?:string|null;payment_exempt?:boolean|null;fee_override_cents?:number|null};
type Requirement = {id:string;cohort_id:string;is_required?:boolean|null};
type Submission = {candidate_id:string;request_id:string;status:string};
type Payment = {candidate_id:string;amount_cents?:number|null};
const normalized=(value:unknown)=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toUpperCase();
// Basketball categories use the age reached in the calendar year ending the season.
// Birthdate determines age; the manually entered category is a fallback only.
export function institutionalSeasonEndYear(label?:string|null):number|null {
 const value=String(label||'').trim();
 const full=value.match(/^(20\d{2})\s*[-/–—]\s*(20\d{2}|\d{2})$/);
 if(full){const first=Number(full[1]),last=full[2].length===2?Math.floor(first/100)*100+Number(full[2]):Number(full[2]);return last===first+1?last:null;}
 return /^20\d{2}$/.test(value)?Number(value):null;
}
function institutionalAgeCategory(player:Player,seasonYear:number|null):number|null {
 const inferred=seasonYear===null?null:playerAgeCategory(player.birthdate,`${seasonYear-1}-${seasonYear}`);
 if(inferred)return Number(inferred.slice(1));
 const category=normalized(player.category);
 if(category){const explicit=category.match(/(?:^|\b)U\s*-?\s*(\d{1,2})(?!\d)/);return explicit?Number(explicit[1]):null;}
 if(seasonYear===null)return null;
 const birthdate=String(player.birthdate||'').slice(0,10);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(birthdate))return null;
 const [year,month,day]=birthdate.split('-').map(Number),date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()!==month-1||date.getUTCDate()!==day)return null;
 const age=seasonYear-year;
 return age>=0&&age<=120?age:null;
}
export function institutionalPlayerCounts(players:Player[],seasonLabel?:string|null) {
 const seasonYear=institutionalSeasonEndYear(seasonLabel);
 const counts={players:0,u13m:0,u13f:0,u14m:0,u14f:0};
 for(const player of players){
  if(player.archived)continue;counts.players++;
  const category=normalized(player.category),age=institutionalAgeCategory(player,seasonYear),sex=normalized(player.sex);
  const female=['F','FILLE','FILLES','FEMALE','FEMININ','FEMININE','FEMME','GIRL','GIRLS'].includes(sex)||(!sex&&/F$/.test(category));
  const male=['M','GARCON','GARCONS','MALE','MASCULIN','MASCULINE','HOMME','BOY','BOYS'].includes(sex)||(!sex&&/M$/.test(category));
  if(!female&&!male)continue;
  if(age===12||age===13)counts[female?'u13f':'u13m']++;
  if(age===14)counts[female?'u14f':'u14m']++;
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
