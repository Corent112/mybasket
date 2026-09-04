import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

async function deleteByIds(admin: any, table: string, column: string, ids: string[]) {
  if (!ids.length) return;
  const { error } = await admin.from(table).delete().in(column, ids);
  if (error) throw new Error(`${table}: ${error.message}`);
}

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service admin indisponible" }, { status: 503 });

  const body = await req.json().catch(() => ({}));
  const cohortId = String(body.cohortId || "");
  if (!cohortId) return NextResponse.json({ error: "Formation manquante" }, { status: 400 });

  const { data: cohort, error: cohortError } = await admin.from("training_cohorts").select("id,institution_id,name").eq("id", cohortId).maybeSingle();
  if (cohortError || !cohort?.institution_id) return NextResponse.json({ error: cohortError?.message || "Formation introuvable" }, { status: 404 });

  const { data: member } = await admin.from("institutional_members").select("id").eq("structure_id", cohort.institution_id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!member) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  try {
    const [requirementsResult, sessionsResult, blocksResult] = await Promise.all([
      admin.from("training_document_requests").select("id").eq("cohort_id", cohortId),
      admin.from("training_attendance_sessions").select("id").eq("cohort_id", cohortId),
      admin.from("training_schedule_blocks").select("id").eq("cohort_id", cohortId),
    ]);
    if (requirementsResult.error) throw requirementsResult.error;
    if (sessionsResult.error) throw sessionsResult.error;
    if (blocksResult.error) throw blocksResult.error;

    const requirementIds = (requirementsResult.data || []).map((row: any) => row.id);
    const sessionIds = (sessionsResult.data || []).map((row: any) => row.id);
    const blockIds = (blocksResult.data || []).map((row: any) => row.id);

    if (blockIds.length) {
      const { data: assetRows, error: assetReadError } = await admin.from("training_schedule_assets").select("storage_path").in("block_id", blockIds);
      if (assetReadError) throw assetReadError;
      const storagePaths = (assetRows || []).map((row: any) => String(row.storage_path || "")).filter(Boolean);
      if (storagePaths.length) {
        const storageDelete = await admin.storage.from("training-assets").remove(storagePaths);
        if (storageDelete.error) throw new Error(`Pièces jointes du planning : ${storageDelete.error.message}`);
      }
    }

    await deleteByIds(admin, "training_document_submissions", "request_id", requirementIds);
    await deleteByIds(admin, "training_candidate_attendance", "session_id", sessionIds);
    await deleteByIds(admin, "training_schedule_assets", "block_id", blockIds);

    for (const table of [
      "training_candidate_payments",
      "training_candidate_evaluations",
      "training_document_requests",
      "training_attendance_sessions",
      "training_schedule_blocks",
      "pedagogical_scenarios",
      "training_candidates",
    ]) {
      const { error } = await admin.from(table).delete().eq("cohort_id", cohortId);
      if (error) throw new Error(`${table}: ${error.message}`);
    }

    const { data: deleted, error: deleteError } = await admin.from("training_cohorts").delete().eq("id", cohortId).select("id").maybeSingle();
    if (deleteError) throw deleteError;
    if (!deleted) throw new Error("La formation n'a pas été supprimée.");

    return NextResponse.json({ ok: true, deletedId: cohortId });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Suppression impossible" }, { status: 400 });
  }
}
