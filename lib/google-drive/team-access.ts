import { createClient } from "@/lib/supabase/server";

type AccessResult = {
  allowed: boolean;
  owner: boolean;
  staff: boolean;
  userId: string | null;
};

const ACCEPTED_STATUSES = new Set(["accepted", "active", "actif", "approved", "member", ""]);

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
    row.status ??
    row.invitation_status ??
    row.member_status ??
    "",
  ).toLowerCase();

  return ACCEPTED_STATUSES.has(status);
}

/**
 * Lecture média = propriétaire OU membre staff accepté de l'équipe.
 * IMPORTANT : ceci ne donne jamais le token Google au membre staff.
 * Il autorise seulement les routes serveur MyBasket à utiliser la connexion
 * Google Drive enregistrée au niveau de l'équipe.
 */
export async function getTeamMediaAccess(teamId: string): Promise<AccessResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || !teamId) {
    return { allowed: false, owner: false, staff: false, userId: user?.id ?? null };
  }

  // Propriétaire / coach principal.
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

  // Staff équipe. On essaie team_members puis club_members pour rester
  // compatible avec les deux générations de MyBasket.
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
