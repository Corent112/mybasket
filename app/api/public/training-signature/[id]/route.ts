import {NextResponse} from "next/server";
import {createHash,timingSafeEqual} from "node:crypto";
import {createAdminClient} from "@/lib/supabase/admin-server";
import {attendanceMetadata,saveAttendancePrevious,withAttendanceSignature} from "@/lib/institutionnel/training-attendance-signature";
import {normalizeAttendanceSignature,updateAttendanceRecord} from "@/lib/institutionnel/training-attendance-server";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 const db=createAdminClient();if(!db)return NextResponse.json({error:"Signature indisponible"},{status:503});
 const body=await request.json().catch(()=>null),{id}=await params;
 if(!body||typeof body.token!=="string"||! /^[a-f0-9]{64}$/.test(body.token)||! /^[a-f0-9-]{36}$/i.test(id))return NextResponse.json({error:"Lien invalide"},{status:400});
 const {data:record,error}=await db.from("training_candidate_attendance").select("id,session_id,candidate_id,status,notes").eq("id",id).maybeSingle();
 if(error)return NextResponse.json({error:"Lecture impossible"},{status:503});
 const link=attendanceMetadata(record?.notes).mybasketAttendancePhone;
 const actual=createHash("sha256").update(body.token).digest("hex");
 if(!record||typeof link?.hash!=="string"||! /^[a-f0-9]{64}$/.test(link.hash)||!timingSafeEqual(Buffer.from(actual,"hex"),Buffer.from(link.hash,"hex")))return NextResponse.json({error:"Lien annulé ou invalide"},{status:403});
 if(!Number.isFinite(Date.parse(link.expiresAt))||Date.parse(link.expiresAt)<=Date.now())return NextResponse.json({error:"Lien expiré. Demandez un nouveau QR code."},{status:410});
 if(link.usedAt){if(body.action==="inspect")return NextResponse.json({completed:true},{headers:{"Cache-Control":"no-store"}});return NextResponse.json({error:"Cette signature a déjà été enregistrée."},{status:409});}
 if(!["present","late"].includes(record.status))return NextResponse.json({error:"La présence a été modifiée. Demandez un nouveau QR code."},{status:409});
 const [{data:session},{data:candidate}]=await Promise.all([
 db.from("training_attendance_sessions").select("id,cohort_id,title,session_date,start_time,end_time").eq("id",record.session_id).maybeSingle(),
 db.from("training_candidates").select("id,cohort_id,first_name,last_name").eq("id",record.candidate_id).maybeSingle()]);
 if(!session||!candidate||session.cohort_id!==candidate.cohort_id)return NextResponse.json({error:"Présence introuvable"},{status:404});
 if(body.action==="inspect")return NextResponse.json({completed:false,name:`${candidate.first_name||""} ${candidate.last_name||""}`.trim(),session:`${session.title} · ${new Date(`${session.session_date}T12:00:00`).toLocaleDateString("fr-FR")} · ${session.start_time?.slice(0,5)||""}–${session.end_time?.slice(0,5)||""}`},{headers:{"Cache-Control":"no-store"}});
 if(body.action!=="sign")return NextResponse.json({error:"Action invalide"},{status:400});
 try{
  const signedAt=new Date().toISOString(),image=await normalizeAttendanceSignature(body.signature);
  let notes=withAttendanceSignature(saveAttendancePrevious(record.notes,record.status),{image,signedAt,recordedBy:link.issuedBy});
  const metadata=attendanceMetadata(notes);metadata.mybasketAttendancePhone={...link,usedAt:signedAt};notes=JSON.stringify(metadata);
  await updateAttendanceRecord(db,record,{notes,updated_by:link.issuedBy,updated_at:signedAt});
  return NextResponse.json({ok:true},{headers:{"Cache-Control":"no-store"}});
 }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Signature impossible"},{status:400});}
}
