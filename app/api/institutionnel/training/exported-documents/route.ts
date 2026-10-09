import {NextResponse} from "next/server";
import {createClient} from "@/lib/supabase/server";
import {createAdminClient} from "@/lib/supabase/admin-server";
import {archiveTrainingExport} from "@/lib/institutionnel/training-export-archive";
async function access(cohortId: string) {
  const sb = await createClient();
  const {data: {user}} = await sb.auth.getUser();
  if (!user) return {error: NextResponse.json({error: "Non connecté"}, {status: 401})};
  const db = createAdminClient() || sb;
  const [{data: cohort}, {data: instructor}, {data: profile}] = await Promise.all([
    db.from("training_cohorts").select("id,institution_id").eq("id", cohortId).maybeSingle(),
    db.from("training_instructors").select("id").eq("cohort_id", cohortId).eq("user_id", user.id).maybeSingle(),
    db.from("profiles").select("platform_role").eq("id", user.id).maybeSingle(),
  ]);
  if (!cohort) return {error: NextResponse.json({error: "Formation introuvable"}, {status: 404})};
  let allowed = !!instructor || ["ceo", "superadmin"].includes(String(profile?.platform_role || ""));
  if (!allowed && cohort.institution_id) {
    const {data: member} = await db.from("institutional_members").select("id").eq("structure_id", cohort.institution_id).eq("user_id", user.id).eq("status", "active").maybeSingle();
    allowed = !!member;
  }
  if (!allowed) return {error: NextResponse.json({error: "Accès refusé"}, {status: 403})};
  return {db, cohort, user};
}
export async function GET(request: Request) {
  const cohortId = new URL(request.url).searchParams.get("cohortId") || "";
  const result = await access(cohortId);
  if (result.error) return result.error;
  if (!result.cohort?.institution_id) return NextResponse.json({documents: []});
  const {data, error} = await result.db!.from("institutional_documents").select("id,title,file_url,created_at").eq("structure_id", result.cohort.institution_id).eq("content->>cohort_id", cohortId).eq("archived", false).order("created_at", {ascending: false});
  if (error) return NextResponse.json({error: error.message}, {status: 400});
  return NextResponse.json({documents: data || []});
}
export async function POST(request: Request) {
  const form = await request.formData();
  const cohortId = String(form.get("cohortId") || "");
  const result = await access(cohortId);
  if (result.error) return result.error;
  if (!result.cohort?.institution_id) return NextResponse.json({error: "Cette formation n’est pas rattachée à une institution"}, {status: 400});
  const file = form.get("file");
  if (!(file instanceof File) || file.size > 10 * 1024 * 1024 || !/\.(pdf|csv|xlsx|xls|docx|doc|pptx|ppt|png|jpg|jpeg)$/i.test(file.name)) return NextResponse.json({error: "Un document PDF, Office, CSV ou une image de 10 Mo maximum est requis"}, {status: 400});
  try {
    const fileUrl = await archiveTrainingExport(result.db!, {institutionId: result.cohort.institution_id, cohortId, userId: result.user!.id, filename: file.name, buffer: Buffer.from(await file.arrayBuffer()), contentType: file.name.toLowerCase().endsWith(".csv") ? "text/csv;charset=utf-8" : file.type || "application/octet-stream", kind: "formation_document"});
    return NextResponse.json({ok: true, fileUrl});
  } catch(e) {return NextResponse.json({error: e instanceof Error ? e.message : "Enregistrement impossible"}, {status: 400});}
}
