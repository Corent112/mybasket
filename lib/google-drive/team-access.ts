import { createClient } from "@/lib/supabase/server";
import { createGoogleDriveAdminClient } from "@/lib/google-drive/admin";

type AccessResult = {
  allowed: boolean;
  owner: boolean;
  staff: boolean;
  userId: string | null;
};

function mediaPermission(value: unknown) {
  if (!value || typeof value !== "object") return false;
  return (value as Record<string, unknown>).media === true;
}

/**
 * Source de vérité Google Drive.
 *
 * - teams.user_id : coach principal / propriétaire => gestion + lecture
 * - team_drive_connections.connected_by : secours pour une équipe migrée
 * - team_members actif + permissions.media === true : lecture uniquement
 *
 * Aucun token Google n'est renvoyé au navigateur ou au staff.
 */
export async function getTeamMediaAccess(teamId: string): Promise<AccessResult> {
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

  // 1. Même règle propriétaire que /api/team-invitations.
  const { data: team } = await supabase
    .from("teams")
    .select("id,user_id")
    .eq("id", teamId)
    .maybeSingle();

  if (team?.user_id && String(team.user_id) === user.id) {
    return { allowed: true, owner: true, staff: false, userId: user.id };
  }

  // 2. Secours après OAuth pour les équipes historiques/migrées.
  // La table sensible est lue uniquement côté serveur avec le service role.
  try {
    const admin = createGoogleDriveAdminClient();
    const { data: connection } = await admin
      .from("team_drive_connections")
      .select("connected_by,revoked_at")
      .eq("team_id", teamId)
      .eq("provider", "google_drive")
      .is("revoked_at", null)
      .maybeSingle();

    if (
      connection?.connected_by &&
      String(connection.connected_by) === user.id
    ) {
      return { allowed: true, owner: true, staff: false, userId: user.id };
    }
  } catch {
    // On ne donne jamais l'accès par défaut si l'admin n'est pas disponible.
  }

  // 3. Collaboration actuelle MyBasket.
  const { data: member } = await supabase
    .from("team_members")
    .select("user_id,status,permissions")
    .eq("team_id", teamId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (member && mediaPermission(member.permissions)) {
    return { allowed: true, owner: false, staff: true, userId: user.id };
  }

  return { allowed: false, owner: false, staff: false, userId: user.id };
}

export async function canReadTeamMedia(teamId: string) {
  return (await getTeamMediaAccess(teamId)).allowed;
}
