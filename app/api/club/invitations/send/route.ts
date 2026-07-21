// app/api/club/invitations/send/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { canCreateClubCoach } from "@/lib/access";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    const {
      invitationId,
      clubId,
      clubName,
      email,
      firstName,
      token,
    } = body || {};

    if (!invitationId || !clubId || !email || !token) {
      return NextResponse.json(
        { error: "Paramètres manquants." },
        { status: 400 }
      );
    }

    const supabase = await createClient();

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      return NextResponse.json(
        { error: "Non connecté." },
        { status: 401 }
      );
    }

    const { data: member, error: memberError } = await supabase
      .from("club_members")
      .select("role, status")
      .eq("club_id", clubId)
      .eq("user_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();

    if (memberError || !member) {
      return NextResponse.json(
        { error: "Accès refusé." },
        { status: 403 }
      );
    }

    if (!["owner", "admin", "direction_technique", "secretariat"].includes(member.role)) {
      return NextResponse.json(
        { error: "Rôle insuffisant pour inviter un coach." },
        { status: 403 }
      );
    }

    if (!(await canCreateClubCoach(clubId))) {
      return NextResponse.json(
        { error: "La limite d’entraîneurs de votre abonnement est atteinte." },
        { status: 403 },
      );
    }

    const siteUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "http://localhost:3000";

    const inviteUrl = `${siteUrl}/invitation-club?token=${encodeURIComponent(token)}`;

    const resendApiKey = process.env.RESEND_API_KEY;

    if (!resendApiKey) {
      return NextResponse.json(
        { error: "RESEND_API_KEY manquant dans .env.local." },
        { status: 500 }
      );
    }

    const subject = `Invitation à rejoindre ${clubName || "le club"} sur MyBasket`;

    const html = `
      <div style="font-family:Arial,sans-serif;line-height:1.5;color:#111827">
        <h2 style="color:#6B1A2C">Invitation MyBasket</h2>
        <p>Bonjour ${firstName || ""},</p>
        <p>Tu as été invité à rejoindre <strong>${clubName || "un club"}</strong> sur MyBasket.</p>
        <p>
          <a href="${inviteUrl}"
             style="display:inline-block;background:#6B1A2C;color:white;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:bold">
            Accepter l'invitation
          </a>
        </p>
        <p>Si le bouton ne fonctionne pas, copie ce lien :</p>
        <p>${inviteUrl}</p>
      </div>
    `;

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "MyBasket <contact@mybasket.fr>",
        to: [email],
        subject,
        html,
      }),
    });

    const result = await response.json().catch(() => null);

    if (!response.ok) {
      return NextResponse.json(
        { error: result?.message || "Email non envoyé." },
        { status: 500 }
      );
    }

    await supabase
      .from("club_member_invitations")
      .update({
        sent_at: new Date().toISOString(),
      })
      .eq("id", invitationId);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erreur serveur." },
      { status: 500 }
    );
  }
}
