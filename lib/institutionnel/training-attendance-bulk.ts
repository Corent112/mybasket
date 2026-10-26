/** Use the existing authenticated attendance endpoint; preserve signatures and per-cell undo. */
export async function markSelectedTrainingPresent(input:{cohortId:string;sessionId:string;status?:'present'|'absent'|'excused';candidates:{id:string;alreadyPresent:boolean}[];onProgress?:(done:number,total:number)=>void},request:typeof fetch=fetch){
 if(!input.cohortId||!input.sessionId)throw Error('Choisis une demi-journée.');
 const status=input.status||'present';if(!['present','absent','excused'].includes(status))throw Error('Statut invalide.');
 const candidates=[...new Map(input.candidates.filter(c=>c.id).map(c=>[c.id,c])).values()],saved:string[]=[],failed:{id:string;error:string}[]=[];let completed=0;
 for(let start=0;start<candidates.length;start+=4){await Promise.all(candidates.slice(start,start+4).map(async candidate=>{
  try{if(!(status==='present'&&candidate.alreadyPresent)){const response=await request('/api/institutionnel/training/attendance',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({cohortId:input.cohortId,sessionId:input.sessionId,candidateId:candidate.id,status})}),data=await response.json();if(!response.ok)throw Error(data.error||'Enregistrement impossible.');}saved.push(candidate.id);}catch(e){failed.push({id:candidate.id,error:e instanceof Error?e.message:'Enregistrement impossible.'});}finally{completed++;input.onProgress?.(completed,candidates.length);}
 }));}
 return{saved,failed};
}
