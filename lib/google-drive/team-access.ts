import { createClient } from "@/lib/supabase/server";
import { createGoogleDriveAdminClient } from "@/lib/google-drive/admin";

// Redeploy marker 2026-08-24: keep Google Drive team access fix active on Vercel.
type AccessResult = {
  allowed: boolean;
  owner: boolean;
  staff: boolean;
  userId: string | null;
};

const ACCEPTED_STATUSES = new Set([
  "accepted",
  "active",
  "actif",
  "approved",
  "member",
  "",
]);

function userIdOf(row: Record<string, any>) {
  return String(
    row.user_id ??
      row.profile_id ??
      row.member_id ??
      row.coach_id ??
      row.staff_user_id ??
      "",
  );
}

function statusAllows(row: Record<string, any>) {
  const status = String(
    row.status ?? row.invitation_status ?? row.member_status ?? "",
  ).toLowerCase();

  return ACCEPTED_STATUSES.has(status);
}

/**
 * Source de vérité unique des droits médias d'une équipe.
 *
 * - Coach principal / propriétaire : gestion + lecture.
 * - Personne qui a connecté le Drive de l'équipe : considérée propriétaire
 *   média de secours. Cela évite qu'une ancienne équipe / migration de colonnes
 *   fasse perdre l'accès au coach juste après le retour OAuth.
 * - Staff accepté : lecture uniquement.
 * - Aucun token Google n'est exposé ici ni au navigateur.
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

  // 1) Source la plus fiable après une connexion OAuth : la connexion Drive
  // enregistrée au niveau de l'équipe. Cette table n'est jamais exposée au
  // navigateur ; on ne lit ici que connected_by, jamais le refresh token.
  try {
    const admin = createGoogleDriveAdminClient();
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
  } catch {
    // Si la table/service role n'est pas disponible, on continue avec les
    // sources d'équipe classiques. L'accès n'est jamais accordé par défaut.
  }

  // 2) Propriétaire / coach principal depuis la table teams.
  const { data: team } = await supabase
    .from("teams")
    .select("*")
    .eq("id", teamId)
    .maybeSingle();

  if (team) {
    const ownerIds = [
      team.user_id,
      team.owner_id,
      team.created_by,
      team.coach_id,
      team.head_coach_id,
    ]
      .filter(Boolean)
      .map(String);

    if (ownerIds.includes(user.id)) {
      return { allowed: true, owner: true, staff: false, userId: user.id };
    }
  }

  // 3) Staff accepté de l'équipe : lecture uniquement.
  // On garde les deux générations de tables MyBasket.
  for (const table of ["team_members", "club_members"]) {
    try {
      const { data: rows, error } = await supabase
        .from(table)
        .select("*")
        .eq("team_id", teamId);

      if (error || !rows) continue;

      const membership = rows.find(
        (row: Record<string, any>) =>
          userIdOf(row) === user.id && statusAllows(row),
      );

      if (membership) {
        return { allowed: true, owner: false, staff: true, userId: user.id };
      }
    } catch {
      // table absente sur une ancienne base : on essaie la suivante
    }
  }

  return { allowed: false, owner: false, staff: false, userId: user.id };
}

export async function canReadTeamMedia(teamId: string) {
  return (await getTeamMediaAccess(teamId)).allowed;
}
