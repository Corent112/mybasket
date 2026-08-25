import { createHash,randomBytes } from "crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

export async function POST(req:Request){
  const sb=await createClient();const{data:{user}}=await sb.auth.getUser();
  if(!user)return NextResponse.json({error:"Non connecté"},{status:401});
  const b=await req.json().catch(()=>({}));const structureId=String(b.structureId||""),playerId=String(b.playerId||""),
    seasonId=b.seasonId?String(b.seasonId):null;
  const db=createAdminClient()||sb;
  const{data:m}=await db.from("institutional_members").select("id").eq("structure_id",structureId).eq("user_id",user.id).eq("status","active").maybeSingle();
  if(!m)return NextResponse.json({error:"Accès refusé"},{status:403});
  const token=randomBytes(32).toString("hex"),hash=createHash("sha256").update(token).digest("hex");
  const expiresAt=new Date(Date.now()+30*86400000).toISOString();
  const q=await db.from("institutional_parent_questionnaires").insert({
    structure_id:structureId,player_id:playerId,season_id:seasonId,token_hash:hash,
    status:"pending",expires_at:expiresAt,created_by:user.id
  });
  if(q.error)return NextResponse.json({error:q.error.message},{status:400});
  return NextResponse.json({ok:true,token,expiresAt});
}
