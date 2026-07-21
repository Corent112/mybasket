// app/api/club/invitations/accept/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  try {
    const { token } = await request.json();

    if (!token) {
      return NextResponse.json({ error: "Token manquant." }, { status: 400 });
    }

    const supabase = await createClient();

    const { data: userData, error: userError } = await supabase.auth.getUser();

    if (userError || !userData.user) {
      return NextResponse.json({ error: "Non connecté." }, { status: 401 });
    }

    const { data: invitation, error: invitationError } = await supabase
      .from("club_member_invitations")
      .select("id, club_id, email, role, status, team_id, expires_at")
      .eq("token", token)
      .maybeSingle();

    if (invitationError || !invitation) {
      return NextResponse.json({ error: "Invitation introuvable." }, { status: 404 });
    }

    if (invitation.status !== "pending") {
      return NextResponse.json({ error: "Invitation déjà utilisée." }, { status: 400 });
    }

    if (new Date(invitation.expires_at).getTime() < Date.now()) {
      return NextResponse.json({ error: "Invitation expirée." }, { status: 400 });
    }

    const userEmail = userData.user.email?.toLowerCase();
    const inviteEmail = String(invitation.email || "").toLowerCase();

    if (userEmail !== inviteEmail) {
      return NextResponse.json(
        { error: `Connecte-toi avec l’adresse invitée : ${inviteEmail}` },
        { status: 403 }
      );
    }

    const { error: memberError } = await supabase
      .from("club_members")
      .upsert(
        {
          club_id: invitation.club_id,
          user_id: userData.user.id,
          role: invitation.role || "coach",
          status: "active",
        },
        {
          onConflict: "club_id,user_id",
        }
      );

    if (memberError) {
      return NextResponse.json({ error: memberError.message }, { status: 500 });
    }

    await supabase
      .from("club_coaches")
      .update({
        user_id: userData.user.id,
        status: "active",
      })
      .eq("club_id", invitation.club_id)
      .eq("email", inviteEmail);

    if (invitation.team_id) {
      await supabase
        .from("club_member_teams")
        .upsert(
          {
            club_id: invitation.club_id,
            team_id: invitation.team_id,
            user_id: userData.user.id,
          },
          {
            onConflict: "club_id,team_id,user_id",
          }
        );
    }

    const { error: updateError } = await supabase
      .from("club_member_invitations")
      .update({
        status: "accepted",
        accepted_at: new Date().toISOString(),
      })
      .eq("id", invitation.id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    await supabase
      .from("club_notifications")
      .insert({
        club_id: invitation.club_id,
        user_id: userData.user.id,
        type: "coach_invitation_accepted",
        title: "Invitation acceptée",
        message: `${userEmail} a rejoint le club.`,
        status: "unread",
      })
      .then(() => null);

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Erreur serveur." },
      { status: 500 }
    );
  }
}
