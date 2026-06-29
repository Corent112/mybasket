import React from "react";
import { NextResponse } from "next/server";
import { pdf } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import PracticeSessionPdf from "@/components/pdf/PracticeSessionPdf";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("practice_sessions")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
  }

  const { data: players } = await supabase
    .from("practice_session_players")
    .select("*")
    .eq("session_id", id)
    .eq("selected", true);

  const { data: exercises } = await supabase
    .from("practice_session_exercises")
    .select("*")
    .eq("session_id", id)
    .order("sort_order", { ascending: true });

  const { data: feedback } = await supabase
    .from("practice_session_feedback")
    .select("*")
    .eq("session_id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  const document = React.createElement(PracticeSessionPdf, {
    session,
    players: players ?? [],
    exercises: exercises ?? [],
    feedback: feedback ?? null,
  });

  const blob = await pdf(document as any).toBlob();

  const filePath = `${user.id}/seances/${id}/fiche-seance.pdf`;

  const { error: uploadError } = await supabase.storage
    .from("user-documents")
    .upload(filePath, blob, {
      contentType: "application/pdf",
      upsert: true,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: publicUrlData } = supabase.storage
    .from("user-documents")
    .getPublicUrl(filePath);

  const pdfUrl = publicUrlData.publicUrl;

  await supabase
    .from("practice_sessions")
    .update({
      pdf_url: pdfUrl,
      pdf_generated: true,
      pdf_generated_at: new Date().toISOString(),
    })
    .eq("id", id);

  await supabase
    .from("calendar_events")
    .update({
      attachment_url: pdfUrl,
    })
    .eq("session_id", id)
    .eq("user_id", user.id);

  return NextResponse.json({ pdfUrl });
}