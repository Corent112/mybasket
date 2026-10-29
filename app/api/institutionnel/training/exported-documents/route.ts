import {NextResponse} from "next/server";
import {trainingDocumentAccess as access,trainingFileResponse} from "@/lib/institutionnel/training-document-access";
import {archiveTrainingExport} from "@/lib/institutionnel/training-export-archive";
export async function GET(request: Request) {
  const cohortId = new URL(request.url).searchParams.get("cohortId") || "";
  const result = await access(cohortId);
  if (result.error) return result.error;
  if (!result.cohort?.institution_id) return NextResponse.json({documents: []});
  const params=new URL(request.url).searchParams,id=params.get("id");
  if(id){
    const {data:doc,error}=await result.db!.from("institutional_documents").select("id,title,storage_path").eq("id",id).eq("structure_id",result.cohort.institution_id).eq("content->>cohort_id",cohortId).eq("archived",false).maybeSingle();
    if(error||!doc)return NextResponse.json({error:"Document introuvable"},{status:404});
    const file=await result.db!.storage.from("institutional-documents").download(doc.storage_path);
    if(file.error||!file.data)return NextResponse.json({error:"Fichier indisponible"},{status:404});
    return trainingFileResponse(file.data,doc.title,params.get("download")==="1");
  }
  const {data, error} = await result.db!.from("institutional_documents").select("id,title,file_url,created_at").eq("structure_id", result.cohort.institution_id).eq("content->>cohort_id", cohortId).eq("archived", false).order("created_at", {ascending: false});
  if (error) return NextResponse.json({error: error.message}, {status: 400});
  return NextResponse.json({documents: data || []});
}
export async function POST(request: Request) {
  const form = await request.formData();
  const cohortId = String(form.get("cohortId") || "");
  const result = await access(cohortId);
  if (result.error) return result.error;
  if (!result.cohort?.institution_id) return NextResponse.json({error: "Cette formation n’est pas rattachée à une institution"}, {status: 400});
  const file = form.get("file");
  if (!(file instanceof File) || file.size > 4 * 1024 * 1024 || !/\.(pdf|csv|xlsx|xls|docx|doc|pptx|ppt|png|jpg|jpeg)$/i.test(file.name)) return NextResponse.json({error: "Un document PDF, Office, CSV ou une image de 4 Mo maximum est requis"}, {status: 400});
  try {
    const fileUrl = await archiveTrainingExport(result.db!, {institutionId: result.cohort.institution_id, cohortId, userId: result.user!.id, filename: file.name, buffer: Buffer.from(await file.arrayBuffer()), contentType: file.name.toLowerCase().endsWith(".csv") ? "text/csv;charset=utf-8" : file.type || "application/octet-stream", kind: "formation_document"});
    return NextResponse.json({ok: true, fileUrl});
  } catch(e) {return NextResponse.json({error: e instanceof Error ? e.message : "Enregistrement impossible"}, {status: 400});}
}

export async function DELETE(request:Request){
 const body=await request.json().catch(()=>null),cohortId=String(body?.cohortId||""),id=String(body?.id||"");
 if(!cohortId||!id)return NextResponse.json({error:"Document manquant"},{status:400});
 const result=await access(cohortId);if(result.error)return result.error;
 if(!result.cohort?.institution_id)return NextResponse.json({error:"Formation introuvable"},{status:404});
 const {data,error}=await result.db!.from("institutional_documents").update({archived:true}).eq("id",id).eq("structure_id",result.cohort.institution_id).eq("content->>cohort_id",cohortId).eq("archived",false).select("id").maybeSingle();
 if(error)return NextResponse.json({error:error.message},{status:400});
 if(!data)return NextResponse.json({error:"Document introuvable"},{status:404});
 return NextResponse.json({ok:true});
}
