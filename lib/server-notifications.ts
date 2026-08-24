import { createAdminClient } from "@/lib/supabase/admin-server";

export const ADMIN_EMAIL = process.env.MYBASKET_ADMIN_EMAIL || "contact@mybasket.fr";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function safeMailto(value?: string | null) {
  const email = String(value || "").trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : null;
}

export async function sendTransactionalEmail(input: {
  to: string | string[];
  subject: string;
  html: string;
  replyTo?: string | null;
  from?: string | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = input.from || process.env.RESEND_FROM;

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

type AdminNotificationTheme = {
  eyebrow?: string;
  icon?: string;
  accent?: string;
  intro?: string;
  actionLabel?: string;
};

export async function notifyAdmin(input: {
  subject: string;
  title: string;
  fields: Array<[string, unknown]>;
  message?: string | null;
  replyTo?: string | null;
  theme?: AdminNotificationTheme;
}) {
  const accent = input.theme?.accent || "#6B1A2C";
  const icon = input.theme?.icon || "🏀";
  const eyebrow = input.theme?.eyebrow || "NOUVELLE DEMANDE";
  const intro =
    input.theme?.intro ||
    "Une nouvelle demande vient d’être envoyée depuis MyBasket.";
  const actionLabel = input.theme?.actionLabel || "Répondre au demandeur";
  const replyEmail = safeMailto(input.replyTo);

  const visibleFields = input.fields.filter(
    ([, value]) => value !== null && value !== undefined && String(value).trim()
  );

  const cards = visibleFields
    .map(
      ([label, value]) => `
        <td width="50%" valign="top" style="padding:6px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="border:1px solid #E9E5E2;border-radius:12px;background:#FFFFFF;">
            <tr>
              <td style="padding:14px 16px;">
                <div style="font-size:11px;line-height:16px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#8A817C;">${escapeHtml(label)}</div>
                <div style="margin-top:4px;font-size:15px;line-height:21px;font-weight:700;color:#201B18;word-break:break-word;">${escapeHtml(value)}</div>
              </td>
            </tr>
          </table>
        </td>`
    )
    .reduce<string[]>((rows, cell, index) => {
      const rowIndex = Math.floor(index / 2);
      rows[rowIndex] = (rows[rowIndex] || "") + cell;
      return rows;
    }, [])
    .map((row, index) => {
      const isOddLastRow = index === Math.floor((visibleFields.length - 1) / 2) && visibleFields.length % 2 === 1;
      return `<tr>${row}${isOddLastRow ? '<td width="50%" style="padding:6px;"></td>' : ""}</tr>`;
    })
    .join("");

  const messageHtml = input.message
    ? `
      <tr>
        <td style="padding:8px 30px 0;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#FBF8F5;border:1px solid #EFE6DF;border-radius:14px;">
            <tr>
              <td style="padding:18px 20px;">
                <div style="font-size:12px;line-height:16px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:${accent};">Message du demandeur</div>
                <div style="margin-top:8px;font-size:15px;line-height:24px;color:#322B27;white-space:pre-wrap;">${escapeHtml(input.message)}</div>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  const actionHtml = replyEmail
    ? `
      <tr>
        <td align="center" style="padding:24px 30px 8px;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0">
            <tr>
              <td bgcolor="${accent}" style="border-radius:10px;">
                <a href="mailto:${escapeHtml(replyEmail)}" style="display:inline-block;padding:13px 22px;font-size:14px;line-height:20px;font-weight:800;color:#FFFFFF;text-decoration:none;">${escapeHtml(actionLabel)}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>`
    : "";

  const html = `
<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#F4F1EE;font-family:Arial,Helvetica,sans-serif;color:#201B18;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F4F1EE;">
      <tr>
        <td align="center" style="padding:34px 12px;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:720px;background:#FFFFFF;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(32,27,24,.08);">
            <tr>
              <td style="background:${accent};padding:26px 30px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td valign="middle">
                      <div style="font-size:12px;line-height:16px;font-weight:800;letter-spacing:.12em;color:#E8C681;">MYBASKET · ${escapeHtml(eyebrow)}</div>
                      <h1 style="margin:7px 0 0;font-size:25px;line-height:31px;color:#FFFFFF;font-weight:800;">${escapeHtml(input.title)}</h1>
                    </td>
                    <td width="58" align="right" valign="middle">
                      <div style="font-size:34px;line-height:40px;">${escapeHtml(icon)}</div>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <tr>
              <td style="padding:24px 30px 10px;">
                <div style="font-size:15px;line-height:23px;color:#675E59;">${escapeHtml(intro)}</div>
              </td>
            </tr>

            <tr>
              <td style="padding:4px 24px 8px;">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
                  ${cards}
                </table>
              </td>
            </tr>

            ${messageHtml}
            ${actionHtml}

            <tr>
              <td style="padding:22px 30px 28px;">
                <div style="height:1px;background:#EEE8E4;margin-bottom:18px;"></div>
                <div style="font-size:12px;line-height:18px;color:#958B85;text-align:center;">
                  MyBasket — La plateforme des coachs de basketball
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return sendTransactionalEmail({
    to: ADMIN_EMAIL,
    subject: input.subject,
    replyTo: input.replyTo,
    html,
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
