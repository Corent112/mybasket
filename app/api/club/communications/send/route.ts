import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function emailBody(value: unknown) {
  return escapeHtml(value).replace(/\n/g, "<br />");
}

export async function POST(request: NextRequest) {
  try {
    const { campaignId } = await request.json();

    if (!campaignId) {
      return NextResponse.json({ error: "Campagne manquante." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      return NextResponse.json({ error: "Non connecté." }, { status: 401 });
    }

    const { data: campaign } = await supabase
      .from("club_communication_campaigns")
      .select("id,club_id,subject,body,status")
      .eq("id", campaignId)
      .maybeSingle();

    if (!campaign) {
      return NextResponse.json({ error: "Campagne introuvable." }, { status: 404 });
    }

    const { data: member } = await supabase
      .from("club_members")
      .select("role")
      .eq("club_id", campaign.club_id)
      .eq("user_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!member || !["owner", "admin", "direction_technique", "secretariat"].includes(member.role)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const [{ data: club }, { data: settings }, { data: recipients, error: recipientsError }] =
      await Promise.all([
        supabase
          .from("clubs")
          .select("name,logo_url,primary_color,secondary_color,contact_email")
          .eq("id", campaign.club_id)
          .maybeSingle(),
        supabase
          .from("club_settings")
          .select("email_from_name,email_from_address,reply_to_email,signature_text,signature_image_url,primary_color,secondary_color")
          .eq("club_id", campaign.club_id)
          .maybeSingle(),
        supabase
          .from("club_communication_recipients")
          .select("id,email,name,status")
          .eq("campaign_id", campaign.id)
          .eq("club_id", campaign.club_id),
      ]);

    if (recipientsError) {
      return NextResponse.json({ error: recipientsError.message }, { status: 500 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "RESEND_API_KEY manquant." }, { status: 500 });
    }

    const clubName = settings?.email_from_name || club?.name || "MyBasket Club";
    const primary = settings?.primary_color || club?.primary_color || "#6B1A2C";
    const secondary = settings?.secondary_color || club?.secondary_color || "#D4A24C";
    const logoUrl = club?.logo_url || "";
    const replyTo =
      settings?.reply_to_email ||
      settings?.email_from_address ||
      club?.contact_email ||
      undefined;
    const signatureText = settings?.signature_text || "";
    const signatureImage = settings?.signature_image_url || "";

    let sent = 0;
    let failed = 0;

    for (const recipient of recipients ?? []) {
      if (!recipient.email) {
        failed += 1;
        await supabase
          .from("club_communication_recipients")
          .update({ status: "missing_email", error: "Email manquant" })
          .eq("id", recipient.id);
        continue;
      }

      const recipientName = recipient.name ? `Bonjour ${escapeHtml(recipient.name)},` : "Bonjour,";
      const logo = logoUrl
        ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(clubName)}" style="max-height:82px;max-width:190px;object-fit:contain;background:#fff;border-radius:18px;padding:8px" />`
        : `<div style="font-weight:900;font-size:28px">${escapeHtml(clubName)}</div>`;

      const signature = signatureText || signatureImage
        ? `
          <div style="margin-top:28px;padding-top:18px;border-top:1px solid #eee4df;color:#6f625c;font-size:13px">
            ${signatureText ? `<div>${emailBody(signatureText)}</div>` : ""}
            ${signatureImage ? `<img src="${escapeHtml(signatureImage)}" alt="Signature" style="display:block;margin-top:12px;max-width:280px;max-height:100px;object-fit:contain" />` : ""}
          </div>
        `
        : "";

      const html = `
        <div style="margin:0;padding:32px 14px;background:#f5f1ed;font-family:Arial,Helvetica,sans-serif;color:#211b19">
          <div style="max-width:680px;margin:0 auto;background:#ffffff;border-radius:24px;overflow:hidden;box-shadow:0 18px 50px rgba(45,25,20,.10)">
            <div style="background:${escapeHtml(primary)};padding:28px 34px;display:flex;align-items:center;gap:18px">
              ${logo}
            </div>
            <div style="height:5px;background:${escapeHtml(secondary)}"></div>
            <div style="padding:34px 38px">
              <div style="font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase;color:${escapeHtml(secondary)}">${escapeHtml(clubName)}</div>
              <h1 style="margin:8px 0 24px;font-size:25px;line-height:1.2;color:${escapeHtml(primary)}">${escapeHtml(campaign.subject)}</h1>
              <p style="margin:0 0 18px;font-size:15px;line-height:1.65">${recipientName}</p>
              <div style="font-size:15px;line-height:1.72;color:#352d29">${emailBody(campaign.body)}</div>
              ${signature}
            </div>
            <div style="padding:16px 28px 24px;text-align:center;color:#9a8e88;font-size:11px">
              Message envoyé par ${escapeHtml(clubName)} via MyBasket
            </div>
          </div>
        </div>
      `;

      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: process.env.RESEND_FROM || "MyBasket <onboarding@resend.dev>",
          to: [recipient.email],
          subject: campaign.subject,
          html,
          ...(replyTo ? { reply_to: replyTo } : {}),
        }),
      });

      const result = await response.json().catch(() => null);

      if (response.ok) {
        sent += 1;
        await supabase
          .from("club_communication_recipients")
          .update({ status: "sent", sent_at: new Date().toISOString(), error: null })
          .eq("id", recipient.id);
      } else {
        failed += 1;
        await supabase
          .from("club_communication_recipients")
          .update({ status: "failed", error: result?.message || "Erreur envoi" })
          .eq("id", recipient.id);
      }
    }

    await supabase
      .from("club_communication_campaigns")
      .update({
        status: failed > 0 ? "sent_with_errors" : "sent",
        sent_count: sent,
        failed_count: failed,
        sent_at: new Date().toISOString(),
      })
      .eq("id", campaign.id);

    return NextResponse.json({ ok: true, sent, failed });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erreur serveur." },
      { status: 500 },
    );
  }
}
