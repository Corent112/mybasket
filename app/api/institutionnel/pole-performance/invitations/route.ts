import { createHash, randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { sendTransactionalEmail } from "@/lib/server-notifications";

function siteUrl(req: Request) {
  return (process.env.NEXT_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, "");
}

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const structureId = String(body.structureId || "");
  const teamId = String(body.teamId || "");
  const email = String(body.email || "").trim().toLowerCase();
  const firstName = String(body.firstName || "").trim();
  const lastName = String(body.lastName || "").trim();
  if (!email.includes("@")) return NextResponse.json({ error: "Email coach invalide." }, { status: 400 });
  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: "Service admin indisponible." }, { status: 500 });

  const [member, structure, teamLink, team] = await Promise.all([
    db.from("institutional_members").select("id").eq("structure_id", structureId).eq("user_id", user.id).eq("status", "active").maybeSingle(),
    db.from("institutional_structures").select("id,name,structure_type").eq("id", structureId).maybeSingle(),
    db.from("institutional_pole_teams").select("id,season_label").eq("structure_id", structureId).eq("team_id", teamId).eq("team_kind", "partner").eq("active", true).maybeSingle(),
    db.from("teams").select("id,name,category,user_id").eq("id", teamId).maybeSingle(),
  ]);
  if (!member.data || structure.data?.structure_type !== "league") return NextResponse.json({ error: "Accès réservé à la Ligue." }, { status: 403 });
  if (!teamLink.data || !team.data) return NextResponse.json({ error: "Équipe partenaire introuvable." }, { status: 404 });

  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 14 * 86400000).toISOString();

  const invite = await db.from("institutional_pole_partner_invitations").insert({
    structure_id: structureId,
    team_id: teamId,
    coach_email: email,
    coach_first_name: firstName || null,
    coach_last_name: lastName || null,
    token_hash: tokenHash,
    status: "pending",
    expires_at: expiresAt,
    created_by: user.id,
  }).select("id").single();
  if (invite.error) return NextResponse.json({ error: invite.error.message }, { status: 400 });

  const end = new Date();
  end.setFullYear(end.getFullYear() + 1);
  const old = await db.from("free_access_grants").select("id").ilike("user_email", email).eq("plan_slug", "premium").order("created_at", { ascending: false }).limit(1);
  const payload = { status: "active", starts_at: new Date().toISOString(), ends_at: end.toISOString(), updated_at: new Date().toISOString() };
  const grant = old.data?.[0]?.id
    ? await db.from("free_access_grants").update(payload).eq("id", old.data[0].id)
    : await db.from("free_access_grants").insert({ user_email: email, plan_slug: "premium", ...payload, created_at: new Date().toISOString() });
  if (grant.error) return NextResponse.json({ error: grant.error.message }, { status: 400 });
  await db.from("institutional_pole_partner_grants").upsert({ structure_id: structureId, team_id: teamId, coach_email: email, plan_slug: "premium", status: "active", created_by: user.id }, { onConflict: "structure_id,team_id,coach_email" });

  const url = `${siteUrl(req)}/invitation-pole-partenaire/${token}`;
  try {
    await sendTransactionalEmail({
      to: email,
      subject: `Invitation coach principal · ${team.data.name}`,
      html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto"><div style="background:#6B1A2C;color:#fff;padding:22px"><b>MYBASKET · ${structure.data.name}</b></div><div style="padding:24px"><h2 style="color:#6B1A2C">${team.data.name}</h2><p>La Ligue t'invite à devenir <b>coach principal</b> de cette équipe partenaire.</p><p>En acceptant, tu deviens responsable opérationnel de l'équipe et tu disposes d'un <b>accès Premium MyBasket offert pendant un an</b>.</p><p>La Ligue reste superviseur de l'équipe, sans saisir à ta place.</p><p><a href="${url}" style="display:inline-block;background:#6B1A2C;color:#fff;padding:12px 18px;border-radius:999px;text-decoration:none;font-weight:bold">Accepter l'invitation</a></p></div></div>`,
    });
  } catch (error: any) {
    await db.from("institutional_pole_partner_invitations").update({ status: "revoked", updated_at: new Date().toISOString() }).eq("id", invite.data.id);
    return NextResponse.json({ error: error?.message || "Invitation créée mais email non envoyé." }, { status: 400 });
  }

  return NextResponse.json({ ok: true, invitationId: invite.data.id, expiresAt, premiumEndsAt: end.toISOString() });
}
