import {NextResponse} from 'next/server';
import {createClient} from '@/lib/supabase/server';
import {createAdminClient} from '@/lib/supabase/admin-server';
import {canManageInstitutionTraining} from './training-permissions';
export async function trainingDocumentAccess(cohortId:string){
 const sb=await createClient(),{data:{user}}=await sb.auth.getUser();
 if(!user)return {error:NextResponse.json({error:'Non connecté'},{status:401})};
 const db=createAdminClient()||sb;
 const [{data:cohort},{data:instructor},{data:profile}]=await Promise.all([
 db.from('training_cohorts').select('id,institution_id').eq('id',cohortId).maybeSingle(),
 db.from('training_instructors').select('id').eq('cohort_id',cohortId).eq('user_id',user.id).maybeSingle(),
 db.from('profiles').select('platform_role').eq('id',user.id).maybeSingle()]);
 if(!cohort)return {error:NextResponse.json({error:'Formation introuvable'},{status:404})};
 let allowed=!!instructor||['ceo','superadmin'].includes(String(profile?.platform_role||''));
 if(!allowed&&cohort.institution_id){const {data:member}=await db.from('institutional_members').select('role,permissions').eq('structure_id',cohort.institution_id).eq('user_id',user.id).eq('status','active').maybeSingle();allowed=canManageInstitutionTraining(member);}
 if(!allowed)return {error:NextResponse.json({error:'Accès formation requis'},{status:403})};
 return {db,cohort,user};
}
export function trainingFileResponse(blob:Blob,filename:string,download:boolean){
 const safe=filename.replace(/[\r\n"\\]/g,'-');
 const extension=filename.toLowerCase().split('.').pop();
 const inlineTypes:Record<string,string>={pdf:'application/pdf',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg'};
 return new Response(blob,{headers:{'Content-Type':inlineTypes[extension||'']||'application/octet-stream','Content-Disposition':`${download?'attachment':'inline'}; filename="${safe.replace(/[^\x20-\x7E]/g,'-')}"; filename*=UTF-8''${encodeURIComponent(safe)}`,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}
export function validTrainingFile(file:unknown):file is File{return file instanceof File&&file.size>0&&file.size<=4*1024*1024&&/\.(pdf|csv|xlsx|xls|docx|doc|pptx|ppt|png|jpg|jpeg)$/i.test(file.name);}
