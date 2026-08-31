import React from "react";
import { Buffer } from "node:buffer";
import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { InstitutionNotePdf } from "@/lib/institutionnel/institution-note-pdf";
import { sendTransactionalEmail } from "@/lib/server-notifications";

function esc(value: string) { return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;"); }
function clean(value: string) { return value.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim().slice(0, 100) || "Note"; }

export async function POST(req: Request) {
  const sb = await createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Service admin indisponible" }, { status: 503 });
  const body = await req.json().catch(() => ({}));
  const structureId = String(body.structureId || "");
  const note = body.note || {};
  const to = Array.isArray(body.to) ? body.to.map(String).filter(Boolean) : [];
  const shouldSend = body.send === true;
  if (!structureId || !String(note.title || "").trim() || !String(note.body || "").trim()) return NextResponse.json({ error: "Titre et contenu obligatoires" }, { status: 400 });
  if (shouldSend && !to.length) return NextResponse.json({ error: "Sélectionne au moins un destinataire" }, { status: 400 });

  const [{ data: member }, { data: structure }] = await Promise.all([
    admin.from("institutional_members").select("id").eq("structure_id", structureId).eq("user_id", user.id).eq("status", "active").maybeSingle(),
    admin.from("institutional_structures").select("id,name,short_name,logo_url,email,city,document_primary_color,document_secondary_color").eq("id", structureId).maybeSingle(),
  ]);
  if (!member || !structure) return NextResponse.json({ error: "Accès refusé" }, { status: 403 });

  const title = clean(String(note.title));
  const buffer = await renderToBuffer(React.createElement(InstitutionNotePdf, { structure, note: { ...note, title } }) as React.ReactElement<any>);
  const filename = `${title}.pdf`;
  const path = `${structureId}/notes/${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "-")}`;
  const upload = await admin.storage.from("institutional-documents").upload(path, buffer, { contentType: "application/pdf", upsert: false });
  if (upload.error) return NextResponse.json({ error: upload.error.message }, { status: 400 });
  const fileUrl = admin.storage.from("institutional-documents").getPublicUrl(path).data.publicUrl;
  const doc = await admin.from("institutional_documents").insert({
    structure_id: structureId,
    title: filename,
    document_type: "communication_note_pdf",
    storage_path: path,
    file_url: fileUrl,
    content: { ...note, title, recipient_emails: to, generated_at: new Date().toISOString() },
    created_by: user.id,
  }).select("id").single();
  if (doc.error) return NextResponse.json({ error: doc.error.message }, { status: 400 });

  let sent = false;
  if (shouldSend) {
    const mail = await sendTransactionalEmail({
      to,
      subject: String(body.subject || title),
      html: `<div style="font-family:Arial,sans-serif;max-width:760px;margin:auto"><div style="background:${esc(structure.document_primary_color || '#6B1A2C')};color:white;padding:18px 22px"><strong>${esc(structure.name)}</strong></div><div style="padding:22px"><p>Bonjour,</p><p>Veuillez trouver en pièce jointe la note <strong>${esc(title)}</strong>.</p><p>Sportivement,<br>${esc(structure.name)}</p></div></div>`,
      attachments: [{ filename, content: Buffer.from(buffer).toString("base64") }],
    });
    sent = mail.sent;
    await admin.from("institutional_communications").insert({ structure_id: structureId, sender_user_id: user.id, subject: String(body.subject || title), body: String(note.body), recipient_emails: to, status: sent ? "sent" : "failed", provider_id: sent ? mail.providerId : null });
  }

  return NextResponse.json({ ok: true, sent, documentId: doc.data.id, fileUrl, filename });
}
