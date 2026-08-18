import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin-server";

async function mail(to:string,subject:string,html:string){
 const key=process.env.RESEND_API_KEY;if(!key)return false;
 const from=process.env.MYBASKET_EMAIL_FROM||"MyBasket <notifications@mybasket.fr>";
 const r=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${key}`,"Content-Type":"application/json"},body:JSON.stringify({from,to:[to],subject,html})});
 return r.ok;
}
export async function POST(request:Request){
 const supabase=await createClient();const{data:{user}}=await supabase.auth.getUser();if(!user)return NextResponse.json({error:"Non connecté"},{status:401});
 const body=await request.json(),admin=createAdminClient();
 if(body.mode==="activity_email"){
  if(!admin)return NextResponse.json({ok:true});
  const {data:a}=await admin.from("activity_log").select("*").eq("id",String(body.activityId||"")).maybeSingle();if(!a?.team_id)return NextResponse.json({ok:true});
  const [{data:t},{data:m}]=await Promise.all([admin.from("teams").select("user_id,name").eq("id",a.team_id).maybeSingle(),admin.from("team_members").select("user_id").eq("team_id",a.team_id).eq("status","active")]);
  const ids=[...new Set([t?.user_id,...(m||[]).map(x=>x.user_id)].filter(Boolean))];
  for(const uid of ids){if(uid===user.id)continue;const{data:p}=await admin.from("notification_preferences").select("email,in_app").eq("user_id",uid).eq("team_id",a.team_id).eq("event_key",a.action_key).maybeSingle();if(p?.in_app!==false)await admin.from("user_notifications").insert({user_id:uid,activity_id:a.id,title:a.title,body:a.description,href:a.href,email_status:p?.email===false?"skipped":"pending"});if(p?.email!==false){const{data:pr}=await admin.from("profiles").select("email").eq("id",uid).maybeSingle();if(pr?.email){const ok=await mail(pr.email,`MyBasket · ${t?.name||"Équipe"} · ${a.title}`,`<h2>${a.title}</h2><p>${a.description||""}</p>`);await admin.from("user_notifications").update({email_status:ok?"sent":"failed"}).eq("activity_id",a.id).eq("user_id",uid)}}}
  return NextResponse.json({ok:true});
 }
 const cohortId=String(body.cohortId||""),messageType=String(body.messageType||"message"),subject=String(body.subject||"").trim(),text=String(body.body||"").trim();
 if(!cohortId||!text)return NextResponse.json({error:"Message incomplet"},{status:400});
 const{data:i}=await supabase.from("training_instructors").select("id").eq("cohort_id",cohortId).eq("user_id",user.id).maybeSingle();const{data:p}=await supabase.from("profiles").select("platform_role").eq("id",user.id).maybeSingle();
 if(!i&&!["ceo","superadmin"].includes(String(p?.platform_role||"")))return NextResponse.json({error:"Accès formateur requis"},{status:403});
 const q=await supabase.from("training_messages").insert({cohort_id:cohortId,sender_id:user.id,recipient_user_id:null,message_type:messageType,subject:subject||null,body:text});if(q.error)return NextResponse.json({error:q.error.message},{status:400});
 if(admin){const{data:c}=await admin.from("training_candidates").select("user_id").eq("cohort_id",cohortId).eq("status","active");for(const x of c||[]){const{data:pr}=await admin.from("profiles").select("email").eq("id",x.user_id).maybeSingle();if(pr?.email)await mail(pr.email,subject||"Formation MyBasket",`<h2>${subject||"Formation MyBasket"}</h2><p>${text}</p>`)}}
 return NextResponse.json({ok:true});
}
