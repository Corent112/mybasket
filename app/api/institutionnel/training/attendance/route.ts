import {NextResponse} from "next/server";
import {createHash,randomBytes} from "node:crypto";
import QRCode from "qrcode";
import {normalizeAttendanceSignature,updateAttendanceRecord} from "@/lib/institutionnel/training-attendance-server";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin-server";
import {withAttendanceSignature,withoutAttendanceSignature,attendanceMetadata,saveAttendancePrevious} from "@/lib/institutionnel/training-attendance-signature";
export async function PATCH(request: Request) {
 const sb=await createClient();const {data:{user}}=await sb.auth.getUser();
 if(!user)return NextResponse.json({error:"Non connecté"},{status:401});
 const body=await request.json().catch(()=>null);
 if(!body)return NextResponse.json({error:"Données invalides"},{status:400});
 const action=String(body.action||"update");
 if(!["update","phone","revoke","undo"].includes(action))return NextResponse.json({error:"Action invalide"},{status:400});
 const cohortId=String(body.cohortId||""),sessionId=String(body.sessionId||""),candidateId=String(body.candidateId||""),status=String(body.status||"");
 if(!cohortId||!sessionId||!candidateId||(action==="update"&&!["present","absent","excused","unknown","late"].includes(status)))return NextResponse.json({error:"Présence invalide"},{status:400});
 const db=createAdminClient()||sb;
 const [{data:cohort},{data:instructor},{data:profile}]=await Promise.all([
 db.from("training_cohorts").select("id,institution_id").eq("id",cohortId).maybeSingle(),
 db.from("training_instructors").select("id").eq("cohort_id",cohortId).eq("user_id",user.id).maybeSingle(),
 db.from("profiles").select("platform_role").eq("id",user.id).maybeSingle()]);
 let allowed=!!cohort&&(!!instructor||["ceo","superadmin"].includes(String(profile?.platform_role||"")));
 if(!allowed&&cohort?.institution_id){const {data:member}=await db.from("institutional_members").select("id").eq("structure_id",cohort.institution_id).eq("user_id",user.id).eq("status","active").maybeSingle();allowed=!!member;}
 if(!allowed)return NextResponse.json({error:"Accès formation requis"},{status:403});
 const [{data:session},{data:candidate},existing]=await Promise.all([
 db.from("training_attendance_sessions").select("id").eq("id",sessionId).eq("cohort_id",cohortId).maybeSingle(),
 db.from("training_candidates").select("id").eq("id",candidateId).eq("cohort_id",cohortId).maybeSingle(),
 db.from("training_candidate_attendance").select("id,notes,status,updated_at").eq("session_id",sessionId).eq("candidate_id",candidateId).maybeSingle()]);
 if(!session||!candidate)return NextResponse.json({error:"Stagiaire ou demi-journée introuvable dans cette formation"},{status:404});
 if(existing.error)return NextResponse.json({error:existing.error.message},{status:400});
 try{
  const previous=existing.data;
  let notes=previous?.notes||"",nextStatus=status||previous?.status||"unknown";
  let phoneResult:any=null;
  if(action==="phone"){
   if(!previous||!["present","late"].includes(previous.status))return NextResponse.json({error:"Choisissez Présent avant de faire signer."},{status:400});
   if(!createAdminClient())return NextResponse.json({error:"Signature téléphone indisponible : configuration serveur requise."},{status:503});
   const token=randomBytes(32).toString("hex"),expiresAt=new Date(Date.now()+10*60*1000).toISOString();
   const metadata=attendanceMetadata(notes);
   metadata.mybasketAttendancePhone={hash:createHash("sha256").update(token).digest("hex"),expiresAt,issuedBy:user.id};
   notes=JSON.stringify(metadata);nextStatus=previous.status;
   const origin=new URL(request.url).origin,url=`${origin}/emargement/${previous.id}#${token}`;
   phoneResult={url,expiresAt,qr:await QRCode.toDataURL(url,{width:256,margin:2})};
  }else if(action==="revoke"){
   const metadata=attendanceMetadata(notes);delete metadata.mybasketAttendancePhone;notes=JSON.stringify(metadata);nextStatus=previous?.status||"unknown";
  }else if(action==="undo"){
   const metadata=attendanceMetadata(notes),saved=metadata.mybasketAttendancePrevious;
   if(!saved||!["unknown","present","absent","excused","late"].includes(saved.status))return NextResponse.json({error:"Aucune modification à annuler."},{status:400});
   nextStatus=saved.status;delete metadata.mybasketAttendancePrevious;delete metadata.mybasketAttendancePhone;
   if(saved.signature)metadata.mybasketAttendanceSignature=saved.signature;else delete metadata.mybasketAttendanceSignature;
   notes=JSON.stringify(metadata);
  }else{
   notes=saveAttendancePrevious(notes,previous?.status||"unknown");
   if(body.signature===null)notes=withoutAttendanceSignature(notes);
   else if(body.signature!==undefined){
    if(!["present","late"].includes(status))return NextResponse.json({error:"La signature nécessite une présence."},{status:400});
    notes=withAttendanceSignature(notes,{image:await normalizeAttendanceSignature(body.signature),signedAt:new Date().toISOString(),recordedBy:user.id});
   }
  }
  const payload={session_id:sessionId,candidate_id:candidateId,status:nextStatus,updated_by:user.id,updated_at:new Date().toISOString(),notes};
  if(previous)await updateAttendanceRecord(db,previous,payload);
  else{const result=await db.from("training_candidate_attendance").insert(payload).select("id").single();if(result.error)throw new Error(result.error.message);}
  return NextResponse.json({ok:true,...phoneResult},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Enregistrement impossible"},{status:400});}
}
