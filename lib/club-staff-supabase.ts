import { createClient } from "@/lib/supabase/client";

const supabase = createClient();

export type ClubRole =
  | "owner"
  | "admin"
  | "coach"
  | "player"
  | "viewer"
  | "member";

type ClubMemberRow = {
  user_id: string;
  role: string | null;
  status: string | null;
};

type ProfileRow = {
  id: string;
  display_name: string | null;
  email: string | null;
  avatar_url: string | null;
  platform_role: string | null;
};

type ClubMemberTeamRow = {
  user_id: string;
  team_id: string;
};

type InvitationRow = {
  id: string;
  email: string;
  role: string | null;
  status: string | null;
  token: string;
  created_at: string;
  expires_at: string;
};

export type StaffMember = {
  userId: string;
  role: ClubRole;
  status: string;
  displayName: string;
  email: string;
  avatarUrl: string | null;
  platformRole: string | null;
  teamIds: string[];
};

export type ClubTeam = {
  id: string;
  name: string;
};

export type StaffInvitation = {
  id: string;
  email: string;
  role: ClubRole;
  status: string;
  token: string;
  createdAt: string;
  expiresAt: string;
};

function asClubRole(value: string | null | undefined): ClubRole {
  if (
    value === "owner" ||
    value === "admin" ||
    value === "coach" ||
    value === "player" ||
    value === "viewer" ||
    value === "member"
  ) {
    return value;
  }

  return "member";
}

export async function getClubStaff(clubId: string): Promise<StaffMember[]> {
  const { data: membersData, error: membersError } = await supabase
    .from("club_members")
    .select("user_id, role, status")
    .eq("club_id", clubId)
    .eq("status", "active")
    .in("role", ["owner", "admin", "coach"]);

  if (membersError) throw membersError;

  const members = (membersData ?? []) as ClubMemberRow[];

  if (members.length === 0) return [];

  const userIds = members
    .map((member: ClubMemberRow) => member.user_id)
    .filter(Boolean);

  const { data: profilesData, error: profilesError } = await supabase
    .from("profiles")
    .select("id, display_name, email, avatar_url, platform_role")
    .in("id", userIds);

  if (profilesError) throw profilesError;

  const profiles = (profilesData ?? []) as ProfileRow[];

  const profilesById = new Map<string, ProfileRow>(
    profiles.map((profile: ProfileRow) => [profile.id, profile])
  );

  const { data: linksData, error: linksError } = await supabase
    .from("club_member_teams")
    .select("user_id, team_id")
    .eq("club_id", clubId)
    .in("user_id", userIds);

  if (linksError) throw linksError;

  const links = (linksData ?? []) as ClubMemberTeamRow[];

  const teamsByUser = new Map<string, string[]>();

  for (const link of links) {
    const list = teamsByUser.get(link.user_id) ?? [];
    list.push(link.team_id);
    teamsByUser.set(link.user_id, list);
  }

  return members.map((member: ClubMemberRow): StaffMember => {
    const profile = profilesById.get(member.user_id);

    return {
      userId: member.user_id,
      role: asClubRole(member.role),
      status: member.status ?? "active",
      displayName: profile?.display_name || profile?.email || "—",
      email: profile?.email || "",
      avatarUrl: profile?.avatar_url ?? null,
      platformRole: profile?.platform_role ?? null,
      teamIds: teamsByUser.get(member.user_id) ?? [],
    };
  });
}

export async function getClubTeams(clubId: string): Promise<ClubTeam[]> {
  const { data, error } = await supabase
    .from("club_teams")
    .select("id, name")
    .eq("club_id", clubId)
    .order("name", { ascending: true });

  if (error) throw error;

  return (data ?? []) as ClubTeam[];
}

export async function getPendingInvitations(
  clubId: string
): Promise<StaffInvitation[]> {
  const { data, error } = await supabase
    .from("club_member_invitations")
    .select("id, email, role, status, token, created_at, expires_at")
    .eq("club_id", clubId)
    .eq("status", "pending")
    .order("created_at", { ascending: false });

  if (error) throw error;

  const rows = (data ?? []) as InvitationRow[];

  return rows.map((row: InvitationRow): StaffInvitation => ({
    id: row.id,
    email: row.email,
    role: asClubRole(row.role),
    status: row.status ?? "pending",
    token: row.token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  }));
}

export async function inviteStaff(
  clubId: string,
  email: string,
  role: ClubRole = "coach"
): Promise<StaffInvitation> {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("club_member_invitations")
    .insert({
      club_id: clubId,
      email: email.trim().toLowerCase(),
      role,
      invited_by: user?.id ?? null,
    })
    .select("id, email, role, status, token, created_at, expires_at")
    .single();

  if (error) throw error;

  const row = data as InvitationRow;

  return {
    id: row.id,
    email: row.email,
    role: asClubRole(row.role),
    status: row.status ?? "pending",
    token: row.token,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
  };
}

export async function revokeInvitation(invitationId: string): Promise<void> {
  const { error } = await supabase
    .from("club_member_invitations")
    .update({ status: "revoked" })
    .eq("id", invitationId);

  if (error) throw error;
}

export async function setCoachTeams(
  clubId: string,
  userId: string,
  teamIds: string[]
): Promise<void> {
  const { error: deleteError } = await supabase
    .from("club_member_teams")
    .delete()
    .eq("club_id", clubId)
    .eq("user_id", userId);

  if (deleteError) throw deleteError;

  if (teamIds.length === 0) return;

  const rows = teamIds.map((teamId: string) => ({
    club_id: clubId,
    user_id: userId,
    team_id: teamId,
  }));

  const { error: insertError } = await supabase
    .from("club_member_teams")
    .insert(rows);

  if (insertError) throw insertError;
}

export function buildInvitationLink(token: string): string {
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  return `${origin}/club/invitation?token=${token}`;
}