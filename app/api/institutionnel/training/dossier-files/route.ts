import {NextResponse} from 'next/server';
import {trainingDocumentAccess,trainingFileResponse,validTrainingFile} from '@/lib/institutionnel/training-document-access';
async function scope(cohortId:string,candidateId:string,requestId:string){
 const access=await trainingDocumentAccess(cohortId);if(access.error)return access;
 const db=access.db!;
 const [{data:candidate},{data:requirement}]=await Promise.all([
 db.from('training_candidates').select('id').eq('id',candidateId).eq('cohort_id',cohortId).maybeSingle(),
 db.from('training_document_requests').select('id,requirement_type').eq('id',requestId).eq('cohort_id',cohortId).maybeSingle()]);
 if(!candidate||!requirement||!['document',null].includes(requirement.requirement_type))return {error:NextResponse.json({error:'Pièce ou candidat introuvable dans cette formation'},{status:404})};
 return access;
}
export async function GET(request:Request){
 const p=new URL(request.url).searchParams,access=await scope(p.get('cohortId')||'',p.get('candidateId')||'',p.get('requestId')||'');if(access.error)return access.error;const db=access.db!;
 const {data:submission,error}=await db.from('training_document_submissions').select('id').eq('candidate_id',p.get('candidateId')!).eq('request_id',p.get('requestId')!).maybeSingle();
 if(error)return NextResponse.json({error:error.message},{status:400});if(!submission)return NextResponse.json({files:[]});
 const {data:files,error:err}=await db.from('training_document_versions').select('id,version_number,original_filename,storage_path').eq('submission_id',submission.id).order('version_number',{ascending:false});
 if(err)return NextResponse.json({error:err.message},{status:400});
 if(p.has('id')){const file=files?.find(f=>f.id===p.get('id'));if(!file)return NextResponse.json({error:'Fichier introuvable'},{status:404});const result=await db.storage.from('training-documents').download(file.storage_path);if(result.error||!result.data)return NextResponse.json({error:'Fichier indisponible'},{status:404});return trainingFileResponse(result.data,file.original_filename,p.get('download')==='1');}
 return NextResponse.json({files:(files||[]).map(({storage_path,...file})=>file)},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(request:Request){
 const form=await request.formData(),cohortId=String(form.get('cohortId')||''),candidateId=String(form.get('candidateId')||''),requestId=String(form.get('requestId')||''),file=form.get('file');
 const access=await scope(cohortId,candidateId,requestId);if(access.error)return access.error;if(!validTrainingFile(file))return NextResponse.json({error:'PDF, Office, CSV ou image requis (4 Mo maximum)'},{status:400});
 const db=access.db!,{data:old,error}=await db.from('training_document_submissions').select('id,current_version').eq('candidate_id',candidateId).eq('request_id',requestId).maybeSingle();
 if(error)return NextResponse.json({error:error.message},{status:400});
 let submissionId=old?.id,created=false,path='',versionId='';
 try{
 if(!submissionId){const q=await db.from('training_document_submissions').insert({candidate_id:candidateId,request_id:requestId,status:'missing',current_version:1}).select('id').single();if(q.error)throw Error(q.error.message);submissionId=q.data.id;created=true;}
 const latest=await db.from('training_document_versions').select('version_number').eq('submission_id',submissionId).order('version_number',{ascending:false}).limit(1);if(latest.error)throw Error(latest.error.message);
 const version=Math.max(old?.current_version||0,latest.data?.[0]?.version_number||0)+1;
 path=`${cohortId}/${candidateId}/${submissionId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,'-')}`;
 const storage=db.storage.from('training-documents'),up=await storage.upload(path,file,{contentType:file.type||'application/octet-stream',upsert:false});if(up.error)throw Error(up.error.message);
 const saved=await db.from('training_document_versions').insert({submission_id:submissionId,version_number:version,file_url:storage.getPublicUrl(path).data.publicUrl,storage_path:path,original_filename:file.name,uploaded_by:access.user!.id}).select('id').single();if(saved.error)throw Error(saved.error.message);versionId=saved.data.id;
 const updated=await db.from('training_document_submissions').update({status:'submitted',current_version:version,reviewer_comment:null,submitted_at:new Date().toISOString()}).eq('id',submissionId);if(updated.error)throw Error(updated.error.message);
 return NextResponse.json({ok:true});
 }catch(e){if(versionId)await db.from('training_document_versions').delete().eq('id',versionId);if(path)await db.storage.from('training-documents').remove([path]);if(created&&submissionId)await db.from('training_document_submissions').delete().eq('id',submissionId);return NextResponse.json({error:e instanceof Error?e.message:'Dépôt impossible'},{status:400});}
}
export async function DELETE(request:Request){
 const body=await request.json().catch(()=>null),access=await scope(String(body?.cohortId||''),String(body?.candidateId||''),String(body?.requestId||''));if(access.error)return access.error;const db=access.db!;
 const {data:submission,error}=await db.from('training_document_submissions').select('id').eq('candidate_id',String(body?.candidateId||'')).eq('request_id',String(body?.requestId||'')).maybeSingle();
 if(error||!submission)return NextResponse.json({error:'Dépôt introuvable'},{status:404});
 const {data:file}=await db.from('training_document_versions').select('id,storage_path').eq('submission_id',submission.id).eq('id',String(body?.id||'')).maybeSingle();if(!file)return NextResponse.json({error:'Fichier introuvable'},{status:404});
 const removed=await db.from('training_document_versions').delete().eq('id',file.id).eq('submission_id',submission.id);if(removed.error)return NextResponse.json({error:removed.error.message},{status:400});
 const remaining=await db.from('training_document_versions').select('version_number').eq('submission_id',submission.id).order('version_number',{ascending:false}).limit(1);
 if(remaining.error)return NextResponse.json({error:remaining.error.message},{status:400});
 const version=remaining.data?.[0]?.version_number||0,updated=await db.from('training_document_submissions').update({current_version:version||1,status:version?'submitted':'missing',reviewer_comment:null}).eq('id',submission.id);
 if(updated.error)return NextResponse.json({error:updated.error.message},{status:400});
 await db.storage.from('training-documents').remove([file.storage_path]);
 return NextResponse.json({ok:true});
}
