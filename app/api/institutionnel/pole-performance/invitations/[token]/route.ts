import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

const hash = (token: string) => createHash("sha256").update(token).digest("hex");

async function findInvite(token: string) {
  const db = createAdminClient();
  if (!db) throw new Error("Service indisponible.");
  const q = await db.from("institutional_pole_partner_invitations")
    .select("*,institutional_structures(name),teams(name,category,user_id)")
    .eq("token_hash", hash(token)).maybeSingle();
  if (q.error) throw new Error(q.error.message);
  return { db, invite: q.data };
}

export async function GET(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { invite } = await findInvite(token);
    if (!invite) return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });
    if (invite.status === "pending" && Date.parse(invite.expires_at) < Date.now()) return NextResponse.json({ error: "Invitation expirée." }, { status: 410 });
    return NextResponse.json({
      invitation: {
        email: invite.coach_email,
        firstName: invite.coach_first_name,
        lastName: invite.coach_last_name,
        status: invite.status,
        expiresAt: invite.expires_at,
        teamId: invite.team_id,
        teamName: (invite.teams as any)?.name,
        category: (invite.teams as any)?.category,
        structureName: (invite.institutional_structures as any)?.name,
      },
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Erreur." }, { status: 400 });
  }
}

export async function POST(_req: Request, { params }: { params: Promise<{ token: string }> }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Connecte-toi pour accepter l'invitation.", needsLogin: true }, { status: 401 });
  try {
    const { token } = await params;
    const { db, invite } = await findInvite(token);
    if (!invite) throw new Error("Invitation introuvable.");
    if (invite.status !== "pending") throw new Error("Cette invitation a déjà été traitée.");
    if (Date.parse(invite.expires_at) < Date.now()) throw new Error("Invitation expirée.");
    if (String(user.email || "").trim().toLowerCase() !== String(invite.coach_email || "").trim().toLowerCase()) throw new Error(`Cette invitation est destinée à ${invite.coach_email}.`);

    const now = new Date().toISOString();
    const formerOwnerId = String((invite.teams as any)?.user_id || invite.created_by || "");

    const teamUpdate = await db.from("teams").update({
      user_id: user.id,
      coach_name: `${invite.coach_first_name || ""} ${invite.coach_last_name || ""}`.trim() || user.email,
      updated_at: now,
    }).eq("id", invite.team_id);
    if (teamUpdate.error) throw new Error(teamUpdate.error.message);

    // Le nouveau coach a les pleins pouvoirs parce qu'il devient propriétaire de teams.user_id.
    // La Ligue / créateur reste membre superviseur en lecture.
    if (formerOwnerId && formerOwnerId !== user.id) {
      await db.from("team_members").upsert({
        team_id: invite.team_id,
        user_id: formerOwnerId,
        role: "institution_supervisor",
        status: "active",
        permissions: {
          view_team: true,
          players: false,
          sessions: false,
          livestats: false,
          media: false,
          rpe: false,
          rpe_individual: true,
          rpe_group: true,
          institution_supervisor: true,
        },
        invited_by: invite.created_by,
        updated_at: now,
      }, { onConflict: "team_id,user_id" });
    }

    await db.from("institutional_pole_partner_invitations").update({ status: "accepted", accepted_by: user.id, accepted_at: now, updated_at: now }).eq("id", invite.id);
    return NextResponse.json({ ok: true, teamId: invite.team_id });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Acceptation impossible." }, { status: 400 });
  }
}
