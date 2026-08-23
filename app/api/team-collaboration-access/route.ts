import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { userHasSubscriptionAccess } from "@/lib/subscription-entitlements";

type RawPermissions = {
  view_team?: boolean;
  players?: boolean;
  sessions?: boolean;
  livestats?: boolean;
  media?: boolean;
};

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non authentifié" }, { status: 401 });

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "Configuration serveur incomplète" }, { status: 500 });
  }

  const { data: memberships, error: membershipsError } = await admin
    .from("team_members")
    .select("team_id,permissions,status")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipsError) {
    return NextResponse.json({ error: membershipsError.message }, { status: 500 });
  }

  const teamIds = (memberships ?? [])
    .map((row: any) => String(row.team_id || ""))
    .filter(Boolean);

  if (!teamIds.length) return NextResponse.json({ accessByTeam: {} });

  const { data: teams, error: teamsError } = await admin
    .from("teams")
    .select("id,user_id")
    .in("id", teamIds);

  if (teamsError) {
    return NextResponse.json({ error: teamsError.message }, { status: 500 });
  }

  const teamById = new Map((teams ?? []).map((team: any) => [String(team.id), team]));
  const membershipByTeam = new Map((memberships ?? []).map((row: any) => [String(row.team_id), row]));
  const ownerIds = Array.from(new Set((teams ?? []).map((team: any) => String(team.user_id || "")).filter(Boolean)));

  const ownerEmails = new Map<string, string | null>();
  await Promise.all(ownerIds.map(async (ownerId) => {
    const result = await admin.auth.admin.getUserById(ownerId);
    ownerEmails.set(ownerId, result.data.user?.email ?? null);
  }));

  const ownerRights = new Map<string, {
    collaboration: boolean;
    teams: boolean;
    sessions: boolean;
    stats: boolean;
    livestats: boolean;
  }>();

  await Promise.all(ownerIds.map(async (ownerId) => {
    const email = ownerEmails.get(ownerId) ?? null;
    const [collaboration, teamsAccess, sessions, stats, livestats] = await Promise.all([
      userHasSubscriptionAccess({ supabase: admin, userId: ownerId, email, sectionKey: "collaboration_equipe" }),
      userHasSubscriptionAccess({ supabase: admin, userId: ownerId, email, sectionKey: "equipes" }),
      userHasSubscriptionAccess({ supabase: admin, userId: ownerId, email, sectionKey: "creation_seances" }),
      userHasSubscriptionAccess({ supabase: admin, userId: ownerId, email, sectionKey: "stats_joueur" }),
      userHasSubscriptionAccess({ supabase: admin, userId: ownerId, email, sectionKey: "stats_live" }),
    ]);
    ownerRights.set(ownerId, { collaboration, teams: teamsAccess, sessions, stats, livestats });
  }));

  const accessByTeam: Record<string, any> = {};

  for (const teamId of teamIds) {
    const team = teamById.get(teamId) as any;
    const membership = membershipByTeam.get(teamId) as any;
    if (!team || !membership) continue;

    const ownerId = String(team.user_id || "");
    const rights = ownerRights.get(ownerId);
    const raw = (membership.permissions && typeof membership.permissions === "object"
      ? membership.permissions
      : {}) as RawPermissions;

    const active = Boolean(rights?.collaboration && rights?.teams);
    accessByTeam[teamId] = {
      active,
      permissions: {
        view_team: active && raw.view_team !== false,
        players: active && raw.players === true,
        sessions: active && raw.sessions === true && Boolean(rights?.sessions),
        livestats: active && raw.livestats === true && Boolean(rights?.livestats),
        stats: active && raw.livestats === true && Boolean(rights?.stats),
        media: active && raw.media === true,
      },
    };
  }

  return NextResponse.json({ accessByTeam });
}
