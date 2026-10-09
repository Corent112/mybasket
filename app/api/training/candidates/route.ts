import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin-server";
import {withCandidateTutor} from "@/lib/institutionnel/training-candidate-import";

export async function POST(request:Request){
 const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Non connecté"},{status:401});
 const body=await request.json(),cohortId=String(body.cohortId||""),email=String(body.email||"").trim().toLowerCase();
 const firstName=String(body.firstName||"").trim(),lastName=String(body.lastName||"").trim(),clubName=String(body.clubName||"").trim(),phone=String(body.phone||"").trim(),birthdate=body.birthdate?String(body.birthdate):null;
 if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return NextResponse.json({error:"Adresse email invalide"},{status:400});
 if(!cohortId||!email)return NextResponse.json({error:"Formation ou email manquant"},{status:400});
 if(!firstName||!lastName)return NextResponse.json({error:"Nom et prénom obligatoires"},{status:400});
 const{data:instructor}=await supabase.from("training_instructors").select("id").eq("cohort_id",cohortId).eq("user_id",user.id).maybeSingle();
 const{data:profile}=await supabase.from("profiles").select("platform_role").eq("id",user.id).maybeSingle();
 if(!instructor&&![ "ceo","superadmin"].includes(String(profile?.platform_role||"")))return NextResponse.json({error:"Accès formateur requis"},{status:403});
 const tutorName=String(body.tutorName||""),tutorEmail=String(body.tutorEmail||"").trim().toLowerCase();
 if(tutorEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(tutorEmail))return NextResponse.json({error:"Mail du tuteur invalide"},{status:400});
 const admin=createAdminClient();if(!admin)return NextResponse.json({error:"Service role Supabase manquant"},{status:500});
 let uid="",page=1;while(!uid){const q=await admin.auth.admin.listUsers({page,perPage:200});if(q.error)return NextResponse.json({error:q.error.message},{status:500});const f=q.data.users.find(x=>x.email?.toLowerCase()===email);if(f){uid=f.id;break}if(q.data.users.length<200)break;page++}
 if(!uid){const q=await admin.auth.admin.createUser({email,email_confirm:false,user_metadata:{first_name:firstName,last_name:lastName}});if(q.error)return NextResponse.json({error:q.error.message},{status:400});uid=q.data.user?.id||""}
 if(!uid)return NextResponse.json({error:"Utilisateur introuvable"},{status:400});
 const profileWrite=await admin.from("profiles").upsert({id:uid,email,display_name:`${firstName} ${lastName}`.trim(),platform_role:"user",status:"active"},{onConflict:"id",ignoreDuplicates:true});
 if(profileWrite.error)return NextResponse.json({error:profileWrite.error.message},{status:400});
 const existing=await admin.from("training_candidates").select("id,notes").eq("cohort_id",cohortId).eq("user_id",uid).maybeSingle();
 if(existing.error)return NextResponse.json({error:existing.error.message},{status:400});

 const details={email,first_name:firstName,last_name:lastName,club_name:clubName||null,phone:phone||null,...(birthdate?{birthdate}:{}),...(tutorName||tutorEmail?{notes:withCandidateTutor(existing.data?.notes,tutorName,tutorEmail)}:{})};
 const q=existing.data
  ? await admin.from("training_candidates").update(details).eq("id",existing.data.id).eq("cohort_id",cohortId).select("id").single()
  : await admin.from("training_candidates").insert({cohort_id:cohortId,user_id:uid,status:"active",progression:0,...details}).select("id").single();
 if(q.error)return NextResponse.json({error:q.error.message},{status:400});
 return NextResponse.json({ok:true,candidateId:q.data.id,updated:!!existing.data});
}
