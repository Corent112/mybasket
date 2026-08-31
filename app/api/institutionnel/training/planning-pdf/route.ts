import React from "react";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { TrainingPlanningPdf } from "@/lib/institutionnel/training-planning-pdf";

function clean(value: string) {
  return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 100) || "Formation";
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

  const { data: cohort, error: cohortError } = await admin.from("training_cohorts").select("id,name,institution_id,planning_title").eq("id", cohortId).maybeSingle();
  if (cohortError || !cohort?.institution_id) return NextResponse.json({ error: cohortError?.message || "Promotion introuvable" }, { status: 404 });
  const { data: member } = await admin.from("institutional_members").select("id").eq("structure_id", cohort.institution_id).eq("user_id", user.id).eq("status", "active").maybeSingle();
  if (!member) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const [{ data: structure }, { data: blocks, error: blocksError }] = await Promise.all([
    admin.from("institutional_structures").select("id,name,short_name,logo_url,email,city,document_primary_color,document_secondary_color").eq("id", cohort.institution_id).single(),
    admin.from("training_schedule_blocks").select("id,training_day,start_time,end_time,title,formation_name,instructor_name,room_name,description").eq("cohort_id", cohortId).order("training_day").order("start_time"),
  ]);
  if (!structure) return NextResponse.json({ error: "Institution introuvable" }, { status: 404 });
  if (blocksError) return NextResponse.json({ error: blocksError.message }, { status: 400 });

  const title = clean(String(body.title || cohort.planning_title || cohort.name || "Formation"));
  const buffer = await renderToBuffer(React.createElement(TrainingPlanningPdf, { structure, cohort, title, blocks: blocks || [] }) as React.ReactElement<any>);
  const filename = `Planning - ${title}.pdf`;
  const path = `${cohort.institution_id}/planning/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
  const upload = await admin.storage.from("institutional-documents").upload(path, buffer, { contentType: "application/pdf", upsert: false });
  if (upload.error) return NextResponse.json({ error: `PDF généré mais enregistrement impossible : ${upload.error.message}` }, { status: 400 });
  const fileUrl = admin.storage.from("institutional-documents").getPublicUrl(path).data.publicUrl;
  await admin.from("institutional_documents").insert({
    structure_id: cohort.institution_id,
    title: filename,
    document_type: "planning_pdf",
    storage_path: path,
    file_url: fileUrl,
    content: { cohort_id: cohortId, planning_title: title, generated_at: new Date().toISOString() },
    created_by: user.id,
  });

  return new Response(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${filename.replaceAll('"', '')}"`,
      "X-MyBasket-Document-Url": fileUrl,
      "Cache-Control": "no-store",
    },
  });
}
