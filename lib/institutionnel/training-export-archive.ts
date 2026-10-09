import type {SupabaseClient} from "@supabase/supabase-js";
export async function archiveTrainingExport(db: SupabaseClient, {institutionId, cohortId, userId, filename, buffer, contentType, kind}: {institutionId: string; cohortId: string; userId: string; filename: string; buffer: Buffer; contentType: string; kind: string}) {
  const path = `${institutionId}/formations/${cohortId}/${crypto.randomUUID()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
  const storage = db.storage.from("institutional-documents");
  const uploaded = await storage.upload(path, buffer, {contentType, upsert: false});
  if (uploaded.error) throw new Error(`Enregistrement dans la formation impossible : ${uploaded.error.message}`);
  const fileUrl = storage.getPublicUrl(path).data.publicUrl;
  const saved = await db.from("institutional_documents").insert({structure_id: institutionId, title: filename, document_type: "resource", storage_path: path, file_url: fileUrl, content: {cohort_id: cohortId, export_type: kind, generated_at: new Date().toISOString()}, created_by: userId});
  if (saved.error) {await storage.remove([path]); throw new Error(`Classement dans la formation impossible : ${saved.error.message}`);}
  return fileUrl;
}
