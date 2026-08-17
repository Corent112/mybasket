import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

function tokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function normalizeEmail(value: unknown) {
  return String(value ?? "").trim().toLowerCase();
}

function normalizeRole(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function technicalTeamRole(value: unknown) {
  const role = normalizeRole(value);

  if (
    [
      "head coach",
      "coach principal",
      "entraineur principal",
      "responsable equipe",
      "responsable de l equipe",
    ].includes(role)
  ) {
    return "head_coach";
  }

  if (
    [
      "assistant",
      "assistant coach",
      "coach assistant",
      "entraineur assistant",
    ].includes(role)
  ) {
    return "assistant";
  }

  if (["analyst", "analyste", "video analyst", "analyste video"].includes(role)) {
    return "analyst";
  }

  if (
    [
      "physical coach",
      "preparateur physique",
      "prepa physique",
      "preparateur",
    ].includes(role)
  ) {
    return "physical_coach";
  }

  if (
    [
      "manager",
      "responsable",
      "team manager",
      "responsable administratif",
    ].includes(role)
  ) {
    return "manager";
  }

  if (["viewer", "observateur", "lecture seule"].includes(role)) {
    return "viewer";
  }

  // Rôle technique le plus restrictif si un ancien libellé inconnu arrive.
  // Les permissions de l'invitation restent ensuite la source des droits réels.
  return "viewer";
}

async function findInvitation(token: string) {
  const admin = createAdminClient();
  if (!admin) {
    return {
      admin: null,
      invitation: null,
      error: "SUPABASE_SERVICE_ROLE_KEY manquant.",
    };
  }

  const { data, error } = await admin
    .from("team_invitations")
    .select(`
      id,
      team_id,
      staff_member_id,
      email,
      role,
      permissions,
      status,
      expires_at,
      invited_by,
      teams (
        id,
        user_id,
        name,
        category,
        metadata
      )
    `)
    .eq("token_hash", tokenHash(token))
    .maybeSingle();

  if (error) return { admin, invitation: null, error: error.message };
  return { admin, invitation: data, error: null };
}

function isExpired(value: string | null | undefined) {
  if (!value) return true;
  return new Date(value).getTime() <= Date.now();
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const result = await findInvitation(token);

  if (!result.admin) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const invitation: any = result.invitation;
  if (!invitation) {
    return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });
  }

  if (invitation.status === "pending" && isExpired(invitation.expires_at)) {
    await result.admin
      .from("team_invitations")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", invitation.id);
    invitation.status = "expired";
  }

  const team = Array.isArray(invitation.teams)
    ? invitation.teams[0]
    : invitation.teams;

  const { data: inviterProfile } = await result.admin
    .from("profiles")
    .select("display_name,first_name,last_name")
    .eq("id", invitation.invited_by)
    .maybeSingle();

  const inviterName =
    String(inviterProfile?.display_name || "").trim() ||
    [inviterProfile?.first_name, inviterProfile?.last_name]
      .filter(Boolean)
      .join(" ")
      .trim() ||
    "Un coach MyBasket";

  return NextResponse.json({
    invitation: {
      status: invitation.status,
      expiresAt: invitation.expires_at,
      email: invitation.email,
      role: invitation.role,
      permissions: invitation.permissions || {},
      teamId: invitation.team_id,
      teamName:
        String(team?.metadata?.categorieLabel || "").trim() ||
        String(team?.name || "").trim() ||
        "Équipe MyBasket",
      clubName: String(team?.name || "").trim(),
      inviterName,
    },
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> },
) {
  const { token } = await context.params;
  const body = await request.json().catch(() => ({}));
  const action = String(body?.action || "accept");

  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json(
      { error: "Connecte-toi pour répondre à l’invitation.", needsLogin: true },
      { status: 401 },
    );
  }

  const result = await findInvitation(token);
  if (!result.admin) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  const invitation: any = result.invitation;
  if (!invitation) {
    return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });
  }

  if (invitation.status !== "pending") {
    return NextResponse.json(
      { error: `Cette invitation est ${invitation.status}.` },
      { status: 409 },
    );
  }

  if (isExpired(invitation.expires_at)) {
    await result.admin
      .from("team_invitations")
      .update({ status: "expired", updated_at: new Date().toISOString() })
      .eq("id", invitation.id);

    return NextResponse.json(
      { error: "Cette invitation a expiré." },
      { status: 410 },
    );
  }

  const invitedEmail = normalizeEmail(invitation.email);
  const accountEmail = normalizeEmail(user.email);

  if (!accountEmail || accountEmail !== invitedEmail) {
    return NextResponse.json(
      {
        error: `Cette invitation est destinée à ${invitedEmail}. Connecte-toi avec cette adresse.`,
      },
      { status: 403 },
    );
  }

  if (action === "decline") {
    await result.admin
      .from("team_invitations")
      .update({ status: "declined", updated_at: new Date().toISOString() })
      .eq("id", invitation.id);

    return NextResponse.json({ ok: true, declined: true });
  }

  if (action !== "accept") {
    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  }

  const { data: ownerEntitled, error: entitlementError } = await supabase.rpc(
    "team_owner_has_collaboration_access",
    { p_team_id: invitation.team_id },
  );

  if (entitlementError) {
    return NextResponse.json(
      { error: entitlementError.message },
      { status: 500 },
    );
  }

  if (ownerEntitled !== true) {
    return NextResponse.json(
      {
        error:
          "L’abonnement du propriétaire ne permet pas actuellement d’activer cette équipe partagée.",
      },
      { status: 403 },
    );
  }

  const now = new Date().toISOString();
  const technicalRole = technicalTeamRole(invitation.role);

  const { error: memberError } = await result.admin
    .from("team_members")
    .upsert(
      {
        team_id: invitation.team_id,
        user_id: user.id,
        role: technicalRole,
        permissions: invitation.permissions || { view_team: true },
        status: "accepted",
        invited_by: invitation.invited_by,
        updated_at: now,
      },
      { onConflict: "team_id,user_id" },
    );

  if (memberError) {
    return NextResponse.json({ error: memberError.message }, { status: 500 });
  }

  await result.admin
    .from("team_invitations")
    .update({
      status: "accepted",
      accepted_at: now,
      updated_at: now,
    })
    .eq("id", invitation.id);

  // Lie aussi le membre du staff visuel au compte MyBasket, sans changer
  // l'architecture métier de la fiche équipe.
  const { data: teamRow } = await result.admin
    .from("teams")
    .select("metadata")
    .eq("id", invitation.team_id)
    .maybeSingle();

  const metadata =
    teamRow?.metadata && typeof teamRow.metadata === "object"
      ? { ...(teamRow.metadata as Record<string, any>) }
      : {};

  const staff = Array.isArray(metadata.staff) ? [...metadata.staff] : [];

  const linkedStaff = staff.map((member: any) => {
    const sameId =
      invitation.staff_member_id &&
      String(member?.id || "") === String(invitation.staff_member_id);

    const sameEmail =
      invitedEmail && normalizeEmail(member?.email) === invitedEmail;

    return sameId || sameEmail ? { ...member, userId: user.id } : member;
  });

  if (linkedStaff.length) {
    metadata.staff = linkedStaff;

    await result.admin
      .from("teams")
      .update({ metadata, updated_at: now })
      .eq("id", invitation.team_id);
  }

  return NextResponse.json({
    ok: true,
    teamId: invitation.team_id,
    role: invitation.role,
    technicalRole,
    permissions: invitation.permissions || {},
  });
}
