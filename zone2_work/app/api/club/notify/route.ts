// app/api/club/notify/route.ts
// Envoi des communications du club (relances cotisation, convocations...).
// Fournisseur par défaut : Resend (https://resend.com) — simple à brancher
// avec Next.js. Remplace par ton SMTP/Nodemailer/SendGrid si tu préfères.
//
// CONFIG (.env.local) :
//   RESEND_API_KEY=re_xxx
//   CLUB_MAIL_FROM="Mon Club <club@ton-domaine.fr>"   (domaine vérifié chez Resend)
//
// Sans RESEND_API_KEY, la route répond en mode "simulation" (ok:true, sent:0)
// pour ne pas bloquer le dev.
import { NextResponse } from "next/server";

export const runtime = "nodejs";

type Body = {
  subject?: string;
  message?: string;
  recipients?: string[];
  kind?: string;
};

const KIND_PREFIX: Record<string, string> = {
  relance: "Relance cotisation",
  convocation: "Convocation",
  info: "Information club",
  autre: "Communication club",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const recipients = (body.recipients || []).filter((e) => typeof e === "string" && e.includes("@"));
  if (!recipients.length) {
    return NextResponse.json({ error: "Aucun destinataire valide." }, { status: 400 });
  }

  const prefix = KIND_PREFIX[body.kind || "autre"] || "Communication club";
  const subject = body.subject ? `[${prefix}] ${body.subject}` : prefix;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f0f12">
      <h2 style="color:#6b1a2c;margin:0 0 12px">${escapeHtml(body.subject || prefix)}</h2>
      <div style="white-space:pre-wrap;line-height:1.5">${escapeHtml(body.message || "")}</div>
      <hr style="border:none;border-top:1px solid #e7e1da;margin:18px 0"/>
      <p style="font-size:12px;color:#6f6f6f">Envoyé via l'Espace Mon Club — MyBasket</p>
    </div>`;

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.CLUB_MAIL_FROM || "Mon Club <onboarding@resend.dev>";

  // Mode simulation si la clé n'est pas configurée
  if (!apiKey) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      simulated: true,
      note: "RESEND_API_KEY absente : aucun e-mail réellement envoyé.",
    });
  }

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: recipients, // Resend accepte un tableau de destinataires
        subject,
        html,
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "");
      return NextResponse.json({ error: `Resend: ${res.status} ${err}` }, { status: 502 });
    }

    return NextResponse.json({ ok: true, sent: recipients.length });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Échec d'envoi" }, { status: 500 });
  }
}