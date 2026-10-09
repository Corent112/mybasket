import {NextResponse} from "next/server";
import sharp from "sharp";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin-server";
import {withAttendanceSignature} from "@/lib/institutionnel/training-attendance-signature";
export async function PATCH(request: Request) {
 const sb=await createClient();const {data:{user}}=await sb.auth.getUser();
 if(!user)return NextResponse.json({error:"Non connecté"},{status:401});
 const body=await request.json().catch(()=>null);
 if(!body)return NextResponse.json({error:"Données invalides"},{status:400});
 const cohortId=String(body.cohortId||""),sessionId=String(body.sessionId||""),candidateId=String(body.candidateId||""),status=String(body.status||"");
 if(!cohortId||!sessionId||!candidateId||!["present","absent","excused","unknown","late"].includes(status))return NextResponse.json({error:"Présence invalide"},{status:400});
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
 db.from("training_candidate_attendance").select("id,notes").eq("session_id",sessionId).eq("candidate_id",candidateId).maybeSingle()]);
 if(!session||!candidate)return NextResponse.json({error:"Stagiaire ou demi-journée introuvable dans cette formation"},{status:404});
 if(existing.error)return NextResponse.json({error:existing.error.message},{status:400});
 let notes: string|undefined;
 if(body.signature!==undefined){
  if(status!=="present"||typeof body.signature!=="string"||body.signature.length>150000||!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(body.signature))return NextResponse.json({error:"Signature PNG invalide"},{status:400});
  try {
   const buffer=Buffer.from(body.signature.split(",")[1],"base64");
   if(!buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))throw new Error("Format PNG requis");
   const image=await sharp(buffer,{limitInputPixels:1000000}).resize(800,300,{fit:"inside",withoutEnlargement:true}).flatten({background:"white"}).png().toBuffer();
   notes=withAttendanceSignature(existing.data?.notes,{image:`data:image/png;base64,${image.toString("base64")}`,signedAt:new Date().toISOString(),recordedBy:user.id});
  }catch{return NextResponse.json({error:"Image de signature invalide"},{status:400});}
 }
 const payload={session_id:sessionId,candidate_id:candidateId,status,updated_by:user.id,updated_at:new Date().toISOString(),...(notes!==undefined?{notes}:{})};
 const result=existing.data?await db.from("training_candidate_attendance").update(payload).eq("id",existing.data.id).select("id").single():await db.from("training_candidate_attendance").insert(payload).select("id").single();
 if(result.error)return NextResponse.json({error:result.error.message},{status:400});
 return NextResponse.json({ok:true});
}
