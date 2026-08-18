import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

type StructureType = "committee" | "league" | "federation" | "pole";
const TYPES: StructureType[] = ["committee","league","federation","pole"];

function inferType(value: unknown): StructureType | null {
  const text = String(value ?? "").toLowerCase();
  if (text.includes("feder") || text.includes("fédé") || text.includes("ffbb")) return "federation";
  if (text.includes("ligue")) return "league";
  if (text.includes("comite") || text.includes("comité")) return "committee";
  if (text.includes("pole") || text.includes("pôle")) return "pole";
  return null;
}

export async function GET(){
  const supabase = await createClient();
  const {data:{user}} = await supabase.auth.getUser();
  if(!user) return NextResponse.json({allowed:false,allowedTypes:[],structures:[],canCreate:false},{status:401});

  const admin = createAdminClient();
  const db = admin || supabase;
  const {data:profile} = await db.from("profiles").select("platform_role").eq("id",user.id).maybeSingle();
  const isAdmin = ["ceo","superadmin","admin"].includes(String(profile?.platform_role||""));

  const {data:memberships} = await db.from("institutional_members").select("structure_id").eq("user_id",user.id).eq("status","active");
  const structureIds=(memberships??[]).map(x=>x.structure_id);
  let structures:any[]=[];
  if(structureIds.length){const q=await db.from("institutional_structures").select("id,structure_type,name,short_name,season_label,city").in("id",structureIds).eq("archived",false);structures=q.data??[];}

  const allowed = new Set<StructureType>();
  if(isAdmin) TYPES.forEach(t=>allowed.add(t));

  const {data:subs}=await db.from("subscriptions").select("plan_id").eq("user_id",user.id).eq("status","active");
  const planIds=[...new Set((subs??[]).map(x=>String(x.plan_id||"")).filter(Boolean))];
  if(planIds.length){
    const [{data:maps},{data:plans}] = await Promise.all([
      db.from("institutional_plan_access").select("plan_id,structure_type").in("plan_id",planIds),
      db.from("subscription_plans").select("id,name,slug,target").in("id",planIds),
    ]);
    (maps??[]).forEach((row:any)=>{if(TYPES.includes(row.structure_type))allowed.add(row.structure_type)});
    (plans??[]).forEach((p:any)=>{const inferred=inferType(`${p.target} ${p.slug} ${p.name}`);if(inferred)allowed.add(inferred)});
  }

  // Une Ligue peut gérer ses structures de performance depuis Institutionnel.
  if(allowed.has("league")) allowed.add("pole");

  const collaboratorAccess=structures.length>0;
  return NextResponse.json({allowed:isAdmin||allowed.size>0||collaboratorAccess,allowedTypes:[...allowed],structures,canCreate:isAdmin||allowed.size>0});
}
