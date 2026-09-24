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
    admin.from("institutional_structures").select("id,name,short_name,logo_url,email,city,document_primary_color,document_secondary_color,email_signature_url").eq("id", structureId).maybeSingle(),
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
      html: (() => {
        const primary = esc(structure.document_primary_color || "#172B54");
        const secondary = esc(structure.document_secondary_color || "#D7282F");
        const message = String(body.mailBody || `Bonjour,\n\nVeuillez trouver en pièce jointe la convocation « ${title} ».\n\nNous vous remercions d’en prendre connaissance et restons à votre disposition pour toute information complémentaire.\n\nCordialement,\n${structure.name}`);
        const messageHtml = esc(message).replace(/\n/g, "<br>");
        const logo = structure.logo_url ? `<img src="${esc(structure.logo_url)}" alt="${esc(structure.name)}" style="display:block;max-width:150px;max-height:64px;object-fit:contain">` : `<strong style="font-size:18px;color:${primary}">${esc(structure.name)}</strong>`;
        const signature = structure.email_signature_url ? `<div style="margin-top:18px"><img src="${esc(structure.email_signature_url)}" alt="Signature" style="display:block;max-width:420px;max-height:180px;width:auto;height:auto;object-fit:contain"></div>` : "";
        return `<div style="margin:0;padding:0;background:#ffffff;font-family:Arial,Helvetica,sans-serif;color:#202733;text-align:left"><div style="max-width:680px;margin:0 auto;padding:28px 24px"><div style="display:flex;align-items:center;min-height:64px">${logo}</div><div style="height:3px;margin:14px 0 28px;background:linear-gradient(90deg,${primary} 0 82%,${secondary} 82% 100%)"></div><div style="font-size:15px;line-height:1.7;text-align:left">${messageHtml}</div>${signature}<div style="margin-top:28px;padding-top:14px;border-top:1px solid #e6e9ee;font-size:11px;line-height:1.5;color:#7a8494;text-align:left">${esc(structure.name)}${structure.email ? ` · ${esc(structure.email)}` : ""}</div></div></div>`;
      })(),
      attachments: [{ filename, content: Buffer.from(buffer).toString("base64") }],
    });
    sent = mail.sent;
    await admin.from("institutional_communications").insert({ structure_id: structureId, sender_user_id: user.id, subject: String(body.subject || title), body: String(note.body), recipient_emails: to, status: sent ? "sent" : "failed", provider_id: sent ? mail.providerId : null });
  }

  return NextResponse.json({ ok: true, sent, documentId: doc.data.id, fileUrl, filename });
}
