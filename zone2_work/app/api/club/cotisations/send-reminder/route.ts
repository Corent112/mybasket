// app/api/club/cotisations/send-reminder/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { reminderId } = await request.json();

    if (!reminderId) {
      return NextResponse.json({ error: "Identifiant manquant." }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();

    if (!userData.user) {
      return NextResponse.json({ error: "Non connecté." }, { status: 401 });
    }

    const { data: reminder } = await supabase
      .from("club_cotisation_reminders")
      .select("id, club_id, recipient_email, subject, body")
      .eq("id", reminderId)
      .maybeSingle();

    if (!reminder) {
      return NextResponse.json({ error: "Relance introuvable." }, { status: 404 });
    }

    const { data: member } = await supabase
      .from("club_members")
      .select("role")
      .eq("club_id", reminder.club_id)
      .eq("user_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();

    if (!member || !["owner", "admin", "direction_technique", "secretariat"].includes(member.role)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    if (!reminder.recipient_email) {
      return NextResponse.json({ error: "Aucun email destinataire." }, { status: 400 });
    }

    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "RESEND_API_KEY manquant." }, { status: 500 });
    }

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <h2 style="color:#6B1A2C">MyBasket - Cotisation</h2>
        <p>${String(reminder.body || "").replace(/\n/g, "<br />")}</p>
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
        to: [reminder.recipient_email],
        subject: reminder.subject,
        html,
      }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json({ error: result?.message || "Email non envoyé." }, { status: 500 });
    }

    await supabase
      .from("club_cotisation_reminders")
      .update({ status: "sent", sent_at: new Date().toISOString() })
      .eq("id", reminder.id);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erreur serveur." }, { status: 500 });
  }
}
