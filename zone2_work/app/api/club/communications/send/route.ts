// app/api/club/communications/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
      .select("id, club_id, subject, body, status")
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

    const { data: recipients, error: recipientsError } = await supabase
      .from("club_communication_recipients")
      .select("id, email, name, status")
      .eq("campaign_id", campaign.id)
      .eq("club_id", campaign.club_id);

    if (recipientsError) {
      return NextResponse.json({ error: recipientsError.message }, { status: 500 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "RESEND_API_KEY manquant." }, { status: 500 });
    }

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

      const html = `
        <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
          <h2 style="color:#6B1A2C">${campaign.subject}</h2>
          <p>${String(campaign.body || "").replace(/\n/g, "<br />")}</p>
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
      { status: 500 }
    );
  }
}
