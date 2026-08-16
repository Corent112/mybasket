import { createAdminClient } from "@/lib/supabase/admin-server";

export const ADMIN_EMAIL = process.env.MYBASKET_ADMIN_EMAIL || "contact@asket.fr";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function sendTransactionalEmail(input: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM;

  if (!apiKey) {
    console.error("RESEND_API_KEY absente : email non envoyé", input.subject);
    return { sent: false as const, reason: "missing_api_key" as const };
  }

  if (!from) {
    console.error("RESEND_FROM absent : email non envoyé", input.subject);
    return { sent: false as const, reason: "missing_from" as const };
  }

  const recipients = Array.isArray(input.to) ? input.to : [input.to];
  const cleanRecipients = recipients.map((value) => value.trim()).filter(Boolean);

  if (cleanRecipients.length === 0) {
    throw new Error("Aucun destinataire e-mail valide.");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: cleanRecipients,
      subject: input.subject,
      html: input.html,
      reply_to: input.replyTo || undefined,
    }),
  });

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    const detail =
      result?.message ||
      result?.error ||
      `Erreur fournisseur e-mail (${response.status})`;

    console.error("Resend a refusé l'e-mail :", {
      status: response.status,
      detail,
      to: cleanRecipients,
      from,
      subject: input.subject,
    });

    throw new Error(String(detail));
  }

  const providerId = result?.id ? String(result.id) : null;

  if (!providerId) {
    console.error("Resend n'a pas retourné d'identifiant d'envoi.", result);
    throw new Error("Le fournisseur e-mail n’a pas confirmé l’envoi.");
  }

  console.info("E-mail transactionnel envoyé :", {
    providerId,
    to: cleanRecipients,
    subject: input.subject,
  });

  return {
    sent: true as const,
    reason: null,
    providerId,
    result,
  };
}

export async function notifyAdmin(input: {
  subject: string;
  title: string;
  fields: Array<[string, unknown]>;
  message?: string | null;
  replyTo?: string | null;
}) {
  const rows = input.fields
    .filter(([, value]) => value !== null && value !== undefined && String(value).trim())
    .map(([label, value]) => `<tr><td style="padding:8px 12px;border-bottom:1px solid #eee;color:#777">${escapeHtml(label)}</td><td style="padding:8px 12px;border-bottom:1px solid #eee;font-weight:700">${escapeHtml(value)}</td></tr>`)
    .join("");

  return sendTransactionalEmail({
    to: ADMIN_EMAIL,
    subject: input.subject,
    replyTo: input.replyTo,
    html: `<div style="font-family:Arial,sans-serif;max-width:720px;margin:auto"><div style="background:#6B1A2C;color:white;padding:18px 22px"><h2 style="margin:0">${escapeHtml(input.title)}</h2></div><table style="width:100%;border-collapse:collapse">${rows}</table>${input.message ? `<div style="padding:18px 12px"><strong>Message</strong><p style="white-space:pre-wrap">${escapeHtml(input.message)}</p></div>` : ""}</div>`,
  });
}

export async function createPlatformConversation(input: {
  type: "accompagnement" | "annonce" | "commande";
  subject: string;
  body: string;
  senderUserId?: string | null;
  senderName?: string | null;
  senderEmail?: string | null;
  referenceId?: string | null;
}) {
  const admin = createAdminClient();
  if (!admin) return null;

  const { data: ceo } = await admin
    .from("profiles")
    .select("id")
    .in("platform_role", ["ceo", "superadmin", "admin"])
    .limit(1)
    .maybeSingle();

  if (!ceo?.id) return null;

  const { data, error } = await admin
    .from("platform_conversations")
    .insert({
      conversation_type: input.type,
      subject: input.subject,
      initial_message: input.body,
      sender_user_id: input.senderUserId || null,
      sender_name: input.senderName || null,
      sender_email: input.senderEmail || null,
      recipient_user_id: ceo.id,
      reference_id: input.referenceId || null,
      status: "open",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) {
    console.warn("Messagerie plateforme indisponible :", error.message);
    return null;
  }

  return data;
}
