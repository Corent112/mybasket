import {NextResponse} from 'next/server';
import {createHash,timingSafeEqual} from 'node:crypto';
import {createAdminClient} from '@/lib/supabase/admin-server';
import {attendanceMetadata,readAttendanceSignature,saveAttendancePrevious,withAttendanceSignature} from '@/lib/institutionnel/training-attendance-signature';
import {normalizeAttendanceSignature,updateAttendanceRecord} from '@/lib/institutionnel/training-attendance-server';
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const db=createAdminClient();if(!db)return NextResponse.json({error:'Signature indisponible.'},{status:503});
 const body=await request.json().catch(()=>null),{id}=await params;if(!body||! /^[a-f0-9]{64}$/.test(String(body.token||''))||! /^[a-f0-9-]{36}$/i.test(id)||!['inspect','sign'].includes(body.action))return NextResponse.json({error:'Lien invalide.'},{status:400});
 const {data:anchor,error}=await db.from('training_candidate_attendance').select('id,session_id,notes').eq('id',id).maybeSingle();if(error)return NextResponse.json({error:'Lecture impossible.'},{status:503});const link=attendanceMetadata(anchor?.notes).mybasketAttendanceGroupPhone,hash=createHash('sha256').update(body.token).digest('hex');
 if(!anchor||! /^[a-f0-9]{64}$/.test(String(link?.hash||''))||!timingSafeEqual(Buffer.from(hash,'hex'),Buffer.from(link.hash,'hex')))return NextResponse.json({error:'QR code annulé ou invalide.'},{status:403});
 // Valid tokens remain active until explicitly revoked or replaced, including previously issued links.
 const {data:session}=await db.from('training_attendance_sessions').select('id,cohort_id,title,session_date,start_time,end_time').eq('id',anchor.session_id).maybeSingle();if(!session)return NextResponse.json({error:'Demi-journée introuvable.'},{status:404});
 const reply=(data:any)=>NextResponse.json(data,{headers:{'Cache-Control':'no-store'}});
 try{
  if(body.action==='inspect'){
   const records:any[]=[];for(let start=0;;start+=1000){const q=await db.from('training_candidate_attendance').select('candidate_id,status,notes').eq('session_id',session.id).in('status',['present','late']).order('id').range(start,start+999);if(q.error)throw Error('Liste indisponible.');records.push(...(q.data||[]));if((q.data||[]).length<1000)break;}
   const unsigned=new Set(records.filter(r=>!readAttendanceSignature(r.notes)).map(r=>r.candidate_id)),candidates:any[]=[];for(let start=0;;start+=1000){const q=await db.from('training_candidates').select('id,first_name,last_name').eq('cohort_id',session.cohort_id).order('id').range(start,start+999);if(q.error)throw Error('Liste indisponible.');candidates.push(...(q.data||[]).filter(c=>unsigned.has(c.id)).map(c=>({id:c.id,name:`${c.first_name||''} ${c.last_name||''}`.trim()})));if((q.data||[]).length<1000)break;}
   candidates.sort((a,b)=>a.name.localeCompare(b.name,'fr'));return reply({session:`${session.title} · ${new Date(`${session.session_date}T12:00:00`).toLocaleDateString('fr-FR')} · ${session.start_time?.slice(0,5)||''}–${session.end_time?.slice(0,5)||''}`,candidates});
  }
  const candidateId=String(body.candidateId||''),[{data:candidate},{data:record,error:recordError}]=await Promise.all([db.from('training_candidates').select('id').eq('id',candidateId).eq('cohort_id',session.cohort_id).maybeSingle(),db.from('training_candidate_attendance').select('id,notes,status,updated_at').eq('session_id',session.id).eq('candidate_id',candidateId).maybeSingle()]);
  if(recordError)throw Error('Lecture impossible.');if(!candidate||!record||!['present','late'].includes(record.status))return NextResponse.json({error:'Cette personne ne figure plus parmi les présents.'},{status:409});if(readAttendanceSignature(record.notes))return NextResponse.json({error:'Cette personne a déjà signé. Contactez le responsable en cas d’erreur.'},{status:409});
  const signedAt=new Date().toISOString(),image=await normalizeAttendanceSignature(body.signature),notes=withAttendanceSignature(saveAttendancePrevious(record.notes,record.status),{image,signedAt,recordedBy:link.issuedBy});await updateAttendanceRecord(db,record,{notes,updated_at:signedAt,updated_by:link.issuedBy});return reply({ok:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'Signature impossible.'},{status:400});}
}
