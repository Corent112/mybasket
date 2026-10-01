import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { sendWellnessDailyDigest } from "@/lib/rpe/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parisParts(date = new Date()) {
  const parts = new Intl.DateTimeFormat("fr-CA", { timeZone:"Europe/Paris", year:"numeric", month:"2-digit", day:"2-digit", hour:"2-digit", hourCycle:"h23" }).formatToParts(date);
  const get=(type:string)=>parts.find((part)=>part.type===type)?.value||"";
  return { date:`${get("year")}-${get("month")}-${get("day")}`, hour:Number(get("hour")) };
}

export async function GET(request: NextRequest) {
  const secret=process.env.CRON_SECRET;
  if(secret && request.headers.get("authorization")!==`Bearer ${secret}`) return NextResponse.json({error:"Non autorisé."},{status:401});
  const paris=parisParts();
  if(paris.hour!==10 && paris.hour!==11) return NextResponse.json({ok:true,skipped:true,reason:"outside_wellness_digest_window",paris});
  const admin=createAdminClient(); if(!admin) return NextResponse.json({error:"Serveur indisponible."},{status:500});
  const {data:rows,error}=await admin.from("player_wellness_responses").select("team_id").eq("response_kind","wellness").eq("response_date",paris.date);
  if(error) return NextResponse.json({error:error.message},{status:500});
  const teamIds=[...new Set((rows||[]).map((r:any)=>String(r.team_id||"")).filter(Boolean))];
  if(!teamIds.length) return NextResponse.json({ok:true,teams:0,sent:0});
  const {data:teams,error:teamError}=await admin.from("teams").select("id,name").in("id",teamIds);
  if(teamError) return NextResponse.json({error:teamError.message},{status:500});
  let sent=0,skipped=0; const failures:any[]=[];
  for(const team of teams||[]){try{const result=await sendWellnessDailyDigest({teamId:String(team.id),teamName:String(team.name||"Équipe"),responseDate:paris.date});sent+=result.sent;skipped+=result.skipped;}catch(error){failures.push({teamId:String(team.id),error:error instanceof Error?error.message:"Erreur inconnue"});}}
  return NextResponse.json({ok:failures.length===0,date:paris.date,teams:teams?.length||0,sent,skipped,failures});
}
