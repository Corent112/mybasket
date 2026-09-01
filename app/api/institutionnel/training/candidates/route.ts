import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin-server";
import {getSiteUrl} from "@/lib/site-url";

export async function POST(request:Request){
 const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();
 if(!user)return NextResponse.json({error:"Non connecté"},{status:401});
 const body=await request.json(),cohortId=String(body.cohortId||""),email=String(body.email||"").trim().toLowerCase();
 const firstName=String(body.firstName||"").trim(),lastName=String(body.lastName||"").trim(),clubName=String(body.clubName||"").trim(),phone=String(body.phone||"").trim(),birthdate=body.birthdate?String(body.birthdate):null;
 if(!cohortId||!email)return NextResponse.json({error:"Formation ou email manquant"},{status:400});
 if(!firstName||!lastName)return NextResponse.json({error:"Nom et prénom obligatoires"},{status:400});
 const{data:instructor}=await supabase.from("training_instructors").select("id").eq("cohort_id",cohortId).eq("user_id",user.id).maybeSingle();
 const{data:profile}=await supabase.from("profiles").select("platform_role").eq("id",user.id).maybeSingle();
 let institutionMember=false;
 if(!instructor&&!["ceo","superadmin"].includes(String(profile?.platform_role||""))){
  const{data:cohort}=await supabase.from("training_cohorts").select("institution_id").eq("id",cohortId).maybeSingle();
  if(cohort?.institution_id){const{data:member}=await supabase.from("institutional_members").select("id").eq("structure_id",cohort.institution_id).eq("user_id",user.id).eq("status","active").maybeSingle();institutionMember=!!member}
 }
 if(!instructor&&!institutionMember&&!["ceo","superadmin"].includes(String(profile?.platform_role||"")))return NextResponse.json({error:"Accès formation requis"},{status:403});
 const admin=createAdminClient();if(!admin)return NextResponse.json({error:"Service role Supabase manquant"},{status:500});
 let uid="",page=1;while(!uid){const q=await admin.auth.admin.listUsers({page,perPage:200});if(q.error)return NextResponse.json({error:q.error.message},{status:500});const f=q.data.users.find(x=>x.email?.toLowerCase()===email);if(f){uid=f.id;break}if(q.data.users.length<200)break;page++}
 if(!uid){const site=getSiteUrl(request);const q=await admin.auth.admin.inviteUserByEmail(email,{redirectTo:`${site}/auth/callback?next=${encodeURIComponent("/formation/mes-formations")}`});if(q.error)return NextResponse.json({error:q.error.message},{status:400});uid=q.data.user?.id||""}
 if(!uid)return NextResponse.json({error:"Utilisateur introuvable"},{status:400});
 await admin.from("profiles").upsert({id:uid,email,display_name:`${firstName} ${lastName}`.trim(),platform_role:"user",status:"active"},{onConflict:"id"});
 const q=await admin.from("training_candidates").upsert({
  cohort_id:cohortId,
  user_id:uid,
  status:"active",
  progression:0,
  email,
  first_name:firstName,
  last_name:lastName,
  club_name:clubName||null,
  phone:phone||null,
  birthdate,
 },{onConflict:"cohort_id,user_id"}).select("id").single();
 if(q.error)return NextResponse.json({error:q.error.message},{status:400});
 return NextResponse.json({ok:true,candidateId:q.data.id});
}
