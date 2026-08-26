import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { canCreateClubCoach } from "@/lib/access";
import { syncClubTeamAccess } from "@/lib/club-team-sync-server";

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function findAuthUserIdByEmail(email: string) {
  const admin = createAdminClient();
  if (!admin) return null;

  const target = normalizeEmail(email);
  let page = 1;
  const perPage = 200;

  while (page <= 50) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const found = (data?.users ?? []).find(
      (candidate) => normalizeEmail(candidate.email) === target,
    );
    if (found?.id) return found.id;
    if ((data?.users ?? []).length < perPage) break;
    page += 1;
  }

  return null;
}

function siteUrl(request: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    new URL(request.url).origin ||
    "https://mybasket.vercel.app"
  ).replace(/\/$/, "");
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { invitationId, clubId, clubName, email, firstName, token } = body || {};

    if (!invitationId || !clubId || !email || !token) {
      return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });
    }

    const cleanEmail = normalizeEmail(email);
    const supabase = await createClient();
    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      return NextResponse.json({ error: "Non connecté." }, { status: 401 });
    }

    const { data: member, error: memberError } = await supabase
      .from("club_members")
      .select("role,status")
      .eq("club_id", clubId)
      .eq("user_id", userData.user.id)
      .eq("status", "active")
      .maybeSingle();

    if (memberError || !member) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    if (!["owner", "admin", "direction_technique", "secretariat"].includes(member.role)) {
      return NextResponse.json({ error: "Rôle insuffisant pour inviter un coach." }, { status: 403 });
    }

    if (!(await canCreateClubCoach(clubId))) {
      return NextResponse.json(
        { error: "La limite d’entraîneurs de votre abonnement est atteinte." },
        { status: 403 },
      );
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY manquant côté serveur." },
        { status: 500 },
      );
    }

    const { data: coach } = await admin
      .from("club_coaches")
      .select("id,club_id,user_id,email,role,status,team_ids,first_name,last_name,name")
      .eq("club_id", clubId)
      .eq("email", cleanEmail)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const existingUserId = await findAuthUserIdByEmail(cleanEmail);

    if (existingUserId && coach) {
      await admin
        .from("club_coaches")
        .update({ user_id: existingUserId, status: "active" })
        .eq("id", coach.id);

      await admin.from("club_members").upsert(
        {
          club_id: clubId,
          user_id: existingUserId,
          role: String(coach.role || "") === "direction_technique" ? "direction_technique" : "coach",
          status: "active",
        },
        { onConflict: "club_id,user_id" },
      );

      const teamIds = Array.isArray(coach.team_ids)
        ? coach.team_ids.map(String).filter(Boolean)
        : [];

      for (const teamId of teamIds) {
        await admin.from("club_member_teams").upsert(
          { club_id: clubId, team_id: teamId, user_id: existingUserId },
          { onConflict: "club_id,team_id,user_id" },
        );

        const role = String(coach.role || "coach").toLowerCase();
        if (role.includes("assistant")) {
          await admin.from("club_teams").update({ assistant_id: existingUserId }).eq("id", teamId).eq("club_id", clubId);
        } else if (
          role === "coach" ||
          role.includes("principal") ||
          role.includes("entraîneur") ||
          role.includes("entraineur")
        ) {
          await admin.from("club_teams").update({ coach_id: existingUserId }).eq("id", teamId).eq("club_id", clubId);
        }
      }

      await admin
        .from("club_member_invitations")
        .update({
          status: "accepted",
          accepted_at: new Date().toISOString(),
          sent_at: new Date().toISOString(),
        })
        .eq("id", invitationId);

      await syncClubTeamAccess(admin, String(clubId));

      const loginUrl = `${siteUrl(request)}/connexion`;
      if (process.env.RESEND_API_KEY) {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            from: process.env.RESEND_FROM || "MyBasket <contact@mybasket.fr>",
            to: [cleanEmail],
            subject: `${clubName || "Un club"} t’a ajouté sur MyBasket`,
            html: `
              <div style="margin:0;padding:30px 14px;background:#f5f1ed;font-family:Arial,sans-serif;color:#211b19">
                <div style="max-width:620px;margin:auto;background:#fff;border-radius:22px;overflow:hidden">
                  <div style="padding:26px;background:#6B1A2C;color:#fff">
                    <div style="font-size:12px;color:#D4A24C;font-weight:800;letter-spacing:1.5px">MYBASKET · CLUB</div>
                    <h1 style="margin:8px 0 0">${clubName || "Ton club"}</h1>
                  </div>
                  <div style="height:5px;background:#D4A24C"></div>
                  <div style="padding:30px">
                    <p>Bonjour ${firstName || ""},</p>
                    <p>Ton compte MyBasket existait déjà : il a été automatiquement rattaché à <strong>${clubName || "ton club"}</strong>.</p>
                    <p>Les équipes qui te sont attribuées apparaissent désormais dans <strong>Mon compte → Mes équipes</strong>.</p>
                    <p style="text-align:center;margin:28px 0">
                      <a href="${loginUrl}" style="background:#6B1A2C;color:white;padding:13px 22px;border-radius:999px;text-decoration:none;font-weight:800">Ouvrir MyBasket</a>
                    </p>
                  </div>
                </div>
              </div>
            `,
          }),
        }).catch(() => null);
      }

      return NextResponse.json({ ok: true, linkedExistingAccount: true });
    }

    const inviteUrl = `${siteUrl(request)}/invitation-club?token=${encodeURIComponent(token)}`;
    if (!process.env.RESEND_API_KEY) {
      return NextResponse.json({ error: "RESEND_API_KEY manquant dans .env.local." }, { status: 500 });
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: process.env.RESEND_FROM || "MyBasket <contact@mybasket.fr>",
        to: [cleanEmail],
        subject: `Invitation à rejoindre ${clubName || "le club"} sur MyBasket`,
        html: `
          <div style="margin:0;padding:30px 14px;background:#f5f1ed;font-family:Arial,sans-serif;color:#211b19">
            <div style="max-width:620px;margin:auto;background:#fff;border-radius:22px;overflow:hidden">
              <div style="padding:26px;background:#6B1A2C;color:#fff">
                <div style="font-size:12px;color:#D4A24C;font-weight:800;letter-spacing:1.5px">MYBASKET · INVITATION CLUB</div>
                <h1 style="margin:8px 0 0">${clubName || "Ton club"}</h1>
              </div>
              <div style="height:5px;background:#D4A24C"></div>
              <div style="padding:30px">
                <p>Bonjour ${firstName || ""},</p>
                <p>Tu es invité à rejoindre <strong>${clubName || "un club"}</strong> sur MyBasket.</p>
                <p style="text-align:center;margin:28px 0">
                  <a href="${inviteUrl}" style="background:#6B1A2C;color:white;padding:13px 22px;border-radius:999px;text-decoration:none;font-weight:800">Accepter l’invitation</a>
                </p>
              </div>
            </div>
          </div>
        `,
      }),
    });

    const result = await response.json().catch(() => null);
    if (!response.ok) {
      return NextResponse.json({ error: result?.message || "Email non envoyé." }, { status: 500 });
    }

    await supabase
      .from("club_member_invitations")
      .update({ sent_at: new Date().toISOString() })
      .eq("id", invitationId);

    return NextResponse.json({ ok: true, linkedExistingAccount: false });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erreur serveur." },
      { status: 500 },
    );
  }
}
