import {NextResponse} from 'next/server';
import {createHash,randomBytes} from 'node:crypto';
import QRCode from 'qrcode';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin-server';
import {canManageInstitutionTraining} from '@/lib/institutionnel/training-permissions';
import {attendanceMetadata} from '@/lib/institutionnel/training-attendance-signature';
import {updateAttendanceRecord} from '@/lib/institutionnel/training-attendance-server';
export async function POST(request:Request){
 const sb=await createClient(),{data:{user}}=await sb.auth.getUser();if(!user)return NextResponse.json({error:'Non connecté'},{status:401});
 const db=createAdminClient();if(!db)return NextResponse.json({error:'Signature téléphone indisponible.'},{status:503});
 const body=await request.json().catch(()=>null),cohortId=String(body?.cohortId||''),sessionId=String(body?.sessionId||'');if(!cohortId||!sessionId||!['create','revoke'].includes(body?.action))return NextResponse.json({error:'Données invalides.'},{status:400});
 const [{data:cohort},{data:instructor},{data:profile}]=await Promise.all([db.from('training_cohorts').select('id,institution_id').eq('id',cohortId).maybeSingle(),db.from('training_instructors').select('id').eq('cohort_id',cohortId).eq('user_id',user.id).maybeSingle(),db.from('profiles').select('platform_role').eq('id',user.id).maybeSingle()]);
 let allowed=!!cohort&&(!!instructor||['ceo','superadmin'].includes(String(profile?.platform_role||'')));if(!allowed&&cohort?.institution_id){const {data:member}=await db.from('institutional_members').select('role,permissions').eq('structure_id',cohort.institution_id).eq('user_id',user.id).eq('status','active').maybeSingle();allowed=canManageInstitutionTraining(member);}if(!allowed)return NextResponse.json({error:'Accès formation requis.'},{status:403});
 const {data:session}=await db.from('training_attendance_sessions').select('id').eq('id',sessionId).eq('cohort_id',cohortId).maybeSingle();if(!session)return NextResponse.json({error:'Demi-journée introuvable.'},{status:404});
 try{
  let record:any;
  if(body.action==='revoke'){const result=await db.from('training_candidate_attendance').select('id,notes,status,updated_at').eq('id',String(body.recordId||'')).eq('session_id',sessionId).maybeSingle();if(result.error)throw Error(result.error.message);record=result.data;if(!record)return NextResponse.json({error:'Lien introuvable.'},{status:404});const metadata=attendanceMetadata(record.notes);if(metadata.mybasketAttendanceGroupPhone?.hash===String(body.hash||'')){delete metadata.mybasketAttendanceGroupPhone;await updateAttendanceRecord(db,record,{notes:JSON.stringify(metadata),updated_at:new Date().toISOString(),updated_by:user.id});}return NextResponse.json({ok:true});}
  // The marker lives in an existing attendance row. No player or session data is duplicated.
  const result=await db.from('training_candidate_attendance').select('id,notes,status,updated_at').eq('session_id',sessionId).in('status',['present','late']).order('id').limit(1);if(result.error)throw Error(result.error.message);record=result.data?.[0];if(!record)return NextResponse.json({error:'Marquez au moins une personne Présent avant de créer le QR code.'},{status:400});
  const token=randomBytes(32).toString('hex'),hash=createHash('sha256').update(token).digest('hex'),expiresAt=null,metadata=attendanceMetadata(record.notes);metadata.mybasketAttendanceGroupPhone={hash,expiresAt,issuedBy:user.id};await updateAttendanceRecord(db,record,{notes:JSON.stringify(metadata),updated_at:new Date().toISOString(),updated_by:user.id});
  const url=`${new URL(request.url).origin}/emargement-groupe/${record.id}#${token}`;return NextResponse.json({url,qr:await QRCode.toDataURL(url,{width:300,margin:2}),expiresAt,recordId:record.id,hash},{headers:{'Cache-Control':'no-store'}});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'QR code indisponible.'},{status:400});}
}
