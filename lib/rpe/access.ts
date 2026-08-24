import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

export type RpePermissionKey =
  | "rpe"
  | "rpe_individual"
  | "rpe_group"
  | "rpe_manage_target"
  | "rpe_manage_questionnaires"
  | "rpe_receive_digest"
  | "rpe_receive_alerts"
  | "rpe_channel_in_app"
  | "rpe_channel_email"
  | "rpe_channel_external";

export type RpePermissions = Partial<Record<RpePermissionKey, boolean>>;

export type TeamRpeAccess = {
  allowed: boolean;
  owner: boolean;
  userId: string | null;
  permissions: RpePermissions;
};

export function ownerRpePermissions(): RpePermissions {
  return {
    rpe: true,
    rpe_individual: true,
    rpe_group: true,
    rpe_manage_target: true,
    rpe_manage_questionnaires: true,
    rpe_receive_digest: true,
    rpe_receive_alerts: true,
    rpe_channel_in_app: true,
    rpe_channel_email: true,
    rpe_channel_external: false,
  };
}

export async function getTeamRpeAccess(teamId: string): Promise<TeamRpeAccess> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !teamId) {
    return { allowed: false, owner: false, userId: user?.id ?? null, permissions: {} };
  }

  const admin = createAdminClient();
  if (!admin) {
    return { allowed: false, owner: false, userId: user.id, permissions: {} };
  }

  const { data: team } = await admin
    .from("teams")
    .select("id,user_id")
    .eq("id", teamId)
    .maybeSingle();

  if (team?.user_id && String(team.user_id) === user.id) {
    return {
      allowed: true,
      owner: true,
      userId: user.id,
      permissions: ownerRpePermissions(),
    };
  }

  const { data: member } = await admin
    .from("team_members")
    .select("permissions,status")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const permissions =
    member?.permissions && typeof member.permissions === "object"
      ? (member.permissions as RpePermissions)
      : {};

  return {
    allowed: permissions.rpe === true,
    owner: false,
    userId: user.id,
    permissions,
  };
}

export function hasRpePermission(
  access: TeamRpeAccess,
  key: RpePermissionKey,
) {
  return access.owner || access.permissions[key] === true;
}
