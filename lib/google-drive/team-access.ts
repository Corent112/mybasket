import { createClient } from "@/lib/supabase/server";
import { createGoogleDriveAdminClient } from "@/lib/google-drive/admin";

export type TeamMediaAccess = {
  allowed: boolean;
  owner: boolean;
  staff: boolean;
  userId: string | null;
};

function hasMediaPermission(value: unknown) {
  if (!value || typeof value !== "object") return false;
  return (value as Record<string, unknown>).media === true;
}

function activeMembership(status: unknown) {
  const value = String(status || "").toLowerCase();
  return ["active", "accepted", "actif", "approved", "member"].includes(value);
}

/**
 * Source de vérité unique des droits Google Drive.
 *
 * Auth = session Supabase de l'utilisateur.
 * Autorisation = lecture serveur via service-role afin que les RLS ne puissent
 * pas masquer au serveur la ligne teams/team_members de l'utilisateur connecté.
 *
 * Le service-role et les tokens Google ne sont jamais envoyés au navigateur.
 */
export async function getTeamMediaAccess(teamId: string): Promise<TeamMediaAccess> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !teamId) {
    return {
      allowed: false,
      owner: false,
      staff: false,
      userId: user?.id ?? null,
    };
  }

  const admin = createGoogleDriveAdminClient();

  // 1. Coach principal / propriétaire.
  const { data: team, error: teamError } = await admin
    .from("teams")
    .select("id,user_id")
    .eq("id", teamId)
    .maybeSingle();

  if (!teamError && team?.user_id && String(team.user_id) === user.id) {
    return { allowed: true, owner: true, staff: false, userId: user.id };
  }

  // 2. Une connexion Drive déjà créée par cet utilisateur confirme aussi
  // qu'il est le gestionnaire média de cette équipe (compatibilité migrations).
  const { data: connection } = await admin
    .from("team_drive_connections")
    .select("connected_by,revoked_at")
    .eq("team_id", teamId)
    .eq("provider", "google_drive")
    .is("revoked_at", null)
    .maybeSingle();

  if (connection?.connected_by && String(connection.connected_by) === user.id) {
    return { allowed: true, owner: true, staff: false, userId: user.id };
  }

  // 3. Collaborateur actif avec droit médias.
  const { data: member } = await admin
    .from("team_members")
    .select("user_id,status,permissions")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    member &&
    activeMembership(member.status) &&
    hasMediaPermission(member.permissions)
  ) {
    return { allowed: true, owner: false, staff: true, userId: user.id };
  }

  return { allowed: false, owner: false, staff: false, userId: user.id };
}

export async function canReadTeamMedia(teamId: string) {
  return (await getTeamMediaAccess(teamId)).allowed;
}
