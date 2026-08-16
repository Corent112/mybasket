import { randomBytes, createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { sendTransactionalEmail } from "@/lib/server-notifications";

type PermissionKey = "view_team" | "players" | "sessions" | "livestats" | "media";
type PermissionMap = Record<PermissionKey, boolean>;

const PERMISSION_KEYS: PermissionKey[] = [
  "view_team",
  "players",
  "sessions",
  "livestats",
  "media",
];

const PERMISSION_LABELS: Record<PermissionKey, string> = {
  view_team: "Voir l’équipe",
  players: "Gérer les joueurs",
  sessions: "Séances & calendrier",
  livestats: "LiveStats",
  media: "Médias & Google Drive",
};

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

async function findAuthUserIdByEmail(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  email: string,
) {
  const target = normalizeEmail(email);
  if (!target) return null;

  let page = 1;
  const perPage = 200;

  while (page <= 50) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

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

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function normalizePermissions(value: unknown): PermissionMap {
  const source =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};

  return {
    view_team: true,
    players: source.players === true,
    sessions: source.sessions === true,
    livestats: source.livestats === true,
    media: source.media === true,
  };
}

function createInviteToken() {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  return { token, tokenHash };
}

function siteUrl(request: NextRequest) {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    new URL(request.url).origin ||
    "https://mybasket.vercel.app"
  ).replace(/\/$/, "");
}

async function getOwnerContext(request: NextRequest, teamId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return { error: NextResponse.json({ error: "Non connecté." }, { status: 401 }) };
  }

  const { data: team, error: teamError } = await supabase
    .from("teams")
    .select("id,user_id,name,category,metadata")
    .eq("id", teamId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (teamError || !team) {
    return {
      error: NextResponse.json(
        { error: "Seul le propriétaire de l’équipe peut gérer les invitations." },
        { status: 403 },
      ),
    };
  }

  return { supabase, user, team };
}

async function inviterName(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
) {
  const { data } = await supabase
    .from("profiles")
    .select("display_name,first_name,last_name")
    .eq("id", userId)
    .maybeSingle();

  return (
    String(data?.display_name || "").trim() ||
    [data?.first_name, data?.last_name].filter(Boolean).join(" ").trim() ||
    "Un coach MyBasket"
  );
}

async function sendTeamInvitation(input: {
  request: NextRequest;
  to: string;
  token: string;
  teamName: string;
  role: string;
  inviter: string;
  permissions: PermissionMap;
}) {
  const inviteUrl = `${siteUrl(input.request)}/invitation/${encodeURIComponent(input.token)}`;
  const logoUrl = `${siteUrl(input.request)}/logo-mybasket02.png`;
  const allowed = PERMISSION_KEYS.filter(
    (key) => key !== "view_team" && input.permissions[key],
  );

  const permissionRows = allowed.length
    ? allowed
        .map(
          (key) =>
            `<span style="display:inline-block;margin:4px 6px 4px 0;padding:7px 10px;border-radius:999px;background:#f6eee7;color:#6B1A2C;font-size:12px;font-weight:700">${escapeHtml(PERMISSION_LABELS[key])}</span>`,
        )
        .join("")
    : `<span style="color:#7a6e68;font-size:13px">Consultation de l’équipe</span>`;

  const teamName = escapeHtml(input.teamName);
  const role = escapeHtml(input.role);
  const inviter = escapeHtml(input.inviter);

  const html = `
    <div style="margin:0;padding:32px 14px;background:#f5f1ed;font-family:Arial,Helvetica,sans-serif;color:#231f20">
      <div style="max-width:640px;margin:0 auto;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(45,25,20,.12)">
        <div style="background:#6B1A2C;padding:28px 32px;text-align:center">
          <img src="${logoUrl}" alt="MyBasket" style="max-width:170px;max-height:72px;object-fit:contain" />
        </div>
        <div style="height:5px;background:#D4A24C"></div>

        <div style="padding:34px 36px 18px">
          <div style="color:#D4A24C;font-size:12px;font-weight:800;letter-spacing:1.6px;text-transform:uppercase">Collaboration équipe</div>
          <h1 style="margin:9px 0 12px;font-size:27px;line-height:1.15;color:#241d1a">Tu es invité à rejoindre ${teamName}</h1>
          <p style="margin:0 0 18px;color:#6f625c;font-size:15px;line-height:1.65">
            <strong style="color:#241d1a">${inviter}</strong> t’invite à collaborer sur MyBasket en tant que
            <strong style="color:#6B1A2C">${role}</strong>.
          </p>

          <div style="margin:22px 0;padding:18px;border-radius:16px;background:#fbf8f5;border:1px solid #eee2d8">
            <div style="margin-bottom:8px;font-size:12px;font-weight:800;color:#7b6d65;text-transform:uppercase;letter-spacing:.7px">Accès prévus sur cette équipe</div>
            ${permissionRows}
          </div>

          <p style="margin:0 0 24px;color:#6f625c;font-size:14px;line-height:1.6">
            Ces accès concernent uniquement <strong>${teamName}</strong>. Ils ne donnent pas accès à l’abonnement personnel de ${inviter}.
          </p>

          <div style="text-align:center;margin:28px 0 22px">
            <a href="${inviteUrl}" style="display:inline-block;background:#6B1A2C;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:999px;font-size:15px;font-weight:800">
              Rejoindre l’équipe
            </a>
          </div>

          <p style="margin:0;color:#8b7d76;font-size:12px;line-height:1.55;text-align:center">
            Pas encore de compte MyBasket ? Le lien te permettra de créer ton compte puis de revenir automatiquement à l’invitation.
          </p>
        </div>

        <div style="padding:18px 28px 26px;text-align:center;color:#9a8e88;font-size:11px">
          Invitation valable 7 jours · MyBasket
        </div>
      </div>
    </div>
  `;

  return sendTransactionalEmail({
    to: input.to,
    subject: `${input.inviter} t’invite à rejoindre ${input.teamName} sur MyBasket`,
    html,
  });
}

export async function GET(request: NextRequest) {
  const teamId = request.nextUrl.searchParams.get("teamId") || "";
  if (!teamId) {
    return NextResponse.json({ error: "teamId manquant." }, { status: 400 });
  }

  const context = await getOwnerContext(request, teamId);
  if ("error" in context) return context.error;

  const { supabase } = context;

  const [{ data: invitations, error: invitationError }, { data: members, error: memberError }] =
    await Promise.all([
      supabase
        .from("team_invitations")
        .select("id,team_id,staff_member_id,email,role,permissions,status,expires_at,sent_at,accepted_at,created_at")
        .eq("team_id", teamId)
        .order("created_at", { ascending: false }),
      supabase
        .from("team_members")
        .select("id,team_id,user_id,role,permissions,status,created_at")
        .eq("team_id", teamId)
        .eq("status", "accepted")
        .order("created_at", { ascending: true }),
    ]);

  if (invitationError || memberError) {
    return NextResponse.json(
      { error: invitationError?.message || memberError?.message || "Erreur collaboration." },
      { status: 500 },
    );
  }

  const admin = createAdminClient();
  const enrichedMembers = await Promise.all(
    (members ?? []).map(async (member) => {
      if (!admin || !member.user_id) return member;

      const { data } = await admin.auth.admin.getUserById(member.user_id);
      return {
        ...member,
        email: normalizeEmail(data?.user?.email) || null,
      };
    }),
  );

  return NextResponse.json({
    invitations: invitations ?? [],
    members: enrichedMembers,
  });
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const teamId = String(body?.teamId || "");
  const email = normalizeEmail(body?.email);
  const role = String(body?.role || "Staff").trim() || "Staff";
  const staffMemberId = body?.staffMemberId ? String(body.staffMemberId) : null;
  const permissions = normalizePermissions(body?.permissions);

  if (!teamId || !email || !email.includes("@")) {
    return NextResponse.json(
      { error: "Équipe ou adresse e-mail invalide." },
      { status: 400 },
    );
  }

  const context = await getOwnerContext(request, teamId);
  if ("error" in context) return context.error;

  const { supabase, user, team } = context;

  const { data: ownerEntitled, error: entitlementError } = await supabase.rpc(
    "team_owner_has_collaboration_access",
    { p_team_id: teamId },
  );

  if (entitlementError) {
    return NextResponse.json({ error: entitlementError.message }, { status: 500 });
  }

  if (ownerEntitled !== true) {
    return NextResponse.json(
      {
        error:
          "Ton abonnement actuel ne permet pas d’activer la collaboration sur cette équipe.",
      },
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

  let existingUserId: string | null = null;

  try {
    existingUserId = await findAuthUserIdByEmail(admin, email);
  } catch (error) {
    console.error("Erreur recherche compte invité:", error);
  }

  if (existingUserId) {
    const { data: existingMember } = await admin
      .from("team_members")
      .select("id,status")
      .eq("team_id", teamId)
      .eq("user_id", existingUserId)
      .eq("status", "accepted")
      .maybeSingle();

    if (existingMember?.id) {
      return NextResponse.json(
        { error: "Cette personne collabore déjà sur l’équipe." },
        { status: 409 },
      );
    }
  }

  await admin
    .from("team_invitations")
    .update({ status: "revoked", updated_at: new Date().toISOString() })
    .eq("team_id", teamId)
    .ilike("email", email)
    .eq("status", "pending");

  const { token, tokenHash } = createInviteToken();
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const { data: invitation, error: insertError } = await admin
    .from("team_invitations")
    .insert({
      team_id: teamId,
      staff_member_id: staffMemberId,
      email,
      role,
      permissions,
      token_hash: tokenHash,
      status: "pending",
      invited_by: user.id,
      expires_at: expiresAt,
      updated_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (insertError || !invitation?.id) {
    return NextResponse.json(
      { error: insertError?.message || "Impossible de créer l’invitation." },
      { status: 500 },
    );
  }

  const inviter = await inviterName(supabase, user.id);
  const teamName =
    String((team.metadata as any)?.categorieLabel || "").trim() ||
    String(team.name || "").trim() ||
    String(team.category || "").trim() ||
    "une équipe";

  try {
    await sendTeamInvitation({
      request,
      to: email,
      token,
      teamName,
      role,
      inviter,
      permissions,
    });

    await admin
      .from("team_invitations")
      .update({ sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", invitation.id);
  } catch (error) {
    console.error("Erreur envoi invitation équipe:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? `Invitation créée mais e-mail non envoyé : ${error.message}`
            : "Invitation créée mais e-mail non envoyé.",
        invitationId: invitation.id,
      },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, invitationId: invitation.id });
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const teamId = String(body?.teamId || "");
  const action = String(body?.action || "");

  if (!teamId || !action) {
    return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });
  }

  const context = await getOwnerContext(request, teamId);
  if ("error" in context) return context.error;

  const { supabase, user, team } = context;
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY manquant côté serveur." },
      { status: 500 },
    );
  }

  if (action === "revoke") {
    const invitationId = String(body?.invitationId || "");
    const { error } = await admin
      .from("team_invitations")
      .update({ status: "revoked", updated_at: new Date().toISOString() })
      .eq("id", invitationId)
      .eq("team_id", teamId)
      .eq("status", "pending");

    return error
      ? NextResponse.json({ error: error.message }, { status: 500 })
      : NextResponse.json({ ok: true });
  }

  if (action === "resend") {
    const invitationId = String(body?.invitationId || "");
    const { data: invitation, error: invitationError } = await admin
      .from("team_invitations")
      .select("id,email,role,permissions,status")
      .eq("id", invitationId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (invitationError || !invitation) {
      return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });
    }

    const { token, tokenHash } = createInviteToken();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const permissions = normalizePermissions(invitation.permissions);

    const { error: updateError } = await admin
      .from("team_invitations")
      .update({
        token_hash: tokenHash,
        status: "pending",
        expires_at: expiresAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", invitation.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    const inviter = await inviterName(supabase, user.id);
    const teamName =
      String((team.metadata as any)?.categorieLabel || "").trim() ||
      String(team.name || "").trim() ||
      "une équipe";

    try {
      await sendTeamInvitation({
        request,
        to: invitation.email,
        token,
        teamName,
        role: invitation.role || "Staff",
        inviter,
        permissions,
      });

      await admin
        .from("team_invitations")
        .update({ sent_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq("id", invitation.id);
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : "E-mail non envoyé." },
        { status: 502 },
      );
    }

    return NextResponse.json({ ok: true });
  }

  if (action === "update_member") {
    const memberId = String(body?.memberId || "");
    const permissions = normalizePermissions(body?.permissions);
    const role = String(body?.role || "Staff").trim() || "Staff";

    const { error } = await admin
      .from("team_members")
      .update({
        role,
        permissions,
        updated_at: new Date().toISOString(),
      })
      .eq("id", memberId)
      .eq("team_id", teamId)
      .eq("status", "accepted");

    return error
      ? NextResponse.json({ error: error.message }, { status: 500 })
      : NextResponse.json({ ok: true });
  }

  if (action === "remove_member") {
    const memberId = String(body?.memberId || "");
    const { error } = await admin
      .from("team_members")
      .update({
        status: "removed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", memberId)
      .eq("team_id", teamId);

    return error
      ? NextResponse.json({ error: error.message }, { status: 500 })
      : NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
}
