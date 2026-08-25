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


export async function POST(request: Request){
  const supabase = await createClient();
  const {data:{user}} = await supabase.auth.getUser();
  if(!user) return NextResponse.json({error:"Session expirée."},{status:401});

  const admin = createAdminClient();
  const db = admin || supabase;

  const {data:profile} = await db.from("profiles").select("platform_role").eq("id",user.id).maybeSingle();
  const isAdmin = ["ceo","superadmin","admin"].includes(String(profile?.platform_role||""));

  const {data:subs}=await db.from("subscriptions").select("plan_id").eq("user_id",user.id).eq("status","active");
  const planIds=[...new Set((subs??[]).map(x=>String(x.plan_id||"")).filter(Boolean))];
  const allowed = new Set<StructureType>();
  if(isAdmin) TYPES.forEach(t=>allowed.add(t));

  if(planIds.length){
    const [{data:maps},{data:plans}] = await Promise.all([
      db.from("institutional_plan_access").select("plan_id,structure_type").in("plan_id",planIds),
      db.from("subscription_plans").select("id,name,slug,target").in("id",planIds),
    ]);
    (maps??[]).forEach((row:any)=>{if(TYPES.includes(row.structure_type))allowed.add(row.structure_type)});
    (plans??[]).forEach((p:any)=>{const inferred=inferType(`${p.target} ${p.slug} ${p.name}`);if(inferred)allowed.add(inferred)});
  }
  if(allowed.has("league")) allowed.add("pole");

  let body:any={};
  try { body = await request.json(); } catch { return NextResponse.json({error:"Données invalides."},{status:400}); }
  const structureType=String(body?.structure_type||"") as StructureType;
  const name=String(body?.name||"").trim();

  if(!TYPES.includes(structureType)) return NextResponse.json({error:"Type de structure invalide."},{status:400});
  if(!name) return NextResponse.json({error:"Le nom officiel est obligatoire."},{status:400});
  if(!isAdmin && !allowed.has(structureType)) return NextResponse.json({error:"Ton abonnement n'autorise pas ce type de structure."},{status:403});

  const created = await db.from("institutional_structures").insert({
    structure_type: structureType,
    name,
    short_name: String(body?.short_name||"").trim() || null,
    ffbb_code: String(body?.ffbb_code||"").trim() || null,
    city: String(body?.city||"").trim() || null,
    season_label: String(body?.season_label||"").trim() || null,
    email: String(body?.email||"").trim() || null,
    phone: String(body?.phone||"").trim() || null,
    created_by: user.id,
  }).select("id").single();

  if(created.error || !created.data?.id){
    return NextResponse.json({error:created.error?.message||"Création de la structure impossible."},{status:400});
  }

  const structureId=created.data.id as string;
  const member = await db.from("institutional_members").insert({
    structure_id: structureId,
    user_id: user.id,
    role: "owner",
    status: "active",
    permissions: { all: true },
  });

  if(member.error){
    // On évite une structure orpheline si l'attribution du propriétaire échoue.
    await db.from("institutional_structures").delete().eq("id",structureId);
    return NextResponse.json({error:`Création annulée : ${member.error.message}`},{status:400});
  }

  const starterDocuments = [
    ["player_followup", "Fiche de suivi joueur", "Formation joueur"],
    ["coach_evaluation", "Fiche d’évaluation cadre", "Formation cadres"],
    ["parental_authorization", "Autorisation parentale", "Stage / sélection"],
    ["stage_summary", "Fiche récapitulative stage / sélection", "Stage / sélection"],
  ].map(([template_key,title,category])=>({
    structure_id: structureId,
    title,
    document_type: "starter_template",
    content: {template_key,category,status:"ready_to_fill",prefilled:true},
    created_by: user.id,
  }));
  const seed = await db.from("institutional_documents").insert(starterDocuments);
  if(seed.error) console.warn("Documents institutionnels de départ :",seed.error.message);

  return NextResponse.json({ok:true,id:structureId});
}
