import { createAdminClient } from "@/lib/supabase/admin-server";

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

type CoachRow = {
  id: string;
  club_id: string;
  user_id: string | null;
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  email: string | null;
  role: string | null;
  status: string | null;
  team_ids: unknown;
};

type TeamRow = {
  id: string;
  club_id: string;
  name: string | null;
  category: string | null;
  gender: string | null;
  level: string | null;
  season: string | null;
  status: string | null;
  coach_id: string | null;
  assistant_id: string | null;
  notes: string | null;
};

function asTeamIds(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).filter(Boolean);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed.map(String).filter(Boolean);
    } catch {
      return value ? [value] : [];
    }
  }
  return [];
}

function normalizeRole(value: unknown) {
  return String(value ?? "coach").trim().toLowerCase();
}

function displayRole(value: unknown) {
  const role = normalizeRole(value);
  if (role === "coach" || role.includes("principal") || role.includes("entraîneur") || role.includes("entraineur")) return "Entraîneur principal";
  if (role.includes("assistant")) return "Assistant";
  if (role.includes("preparateur") || role.includes("préparateur")) return "Préparateur physique";
  if (role.includes("video") || role.includes("vidéo") || role.includes("analyste")) return "Analyste vidéo";
  if (role.includes("manager")) return "Manager";
  if (role.includes("direction") || role.includes("responsable")) return "Responsable";
  return String(value || "Staff");
}

function permissionsForRole(value: unknown) {
  const role = normalizeRole(value);
  const base = {
    view_team: true,
    players: false,
    sessions: false,
    livestats: false,
    media: false,
    rpe: false,
    rpe_individual: false,
    rpe_group: false,
    rpe_manage_target: false,
    rpe_manage_questionnaires: false,
    rpe_receive_digest: false,
    rpe_receive_alerts: false,
    rpe_channel_in_app: true,
    rpe_channel_email: true,
    rpe_channel_external: false,
    club_managed: true,
  };

  if (role === "coach" || role.includes("principal") || role.includes("responsable") || role.includes("direction")) {
    return {
      ...base,
      players: true,
      sessions: true,
      livestats: true,
      media: true,
      rpe: true,
      rpe_individual: true,
      rpe_group: true,
      rpe_manage_target: true,
      rpe_manage_questionnaires: true,
      rpe_receive_digest: true,
      rpe_receive_alerts: true,
    };
  }

  if (role.includes("preparateur") || role.includes("préparateur")) {
    return {
      ...base,
      sessions: true,
      rpe: true,
      rpe_individual: true,
      rpe_group: true,
      rpe_manage_target: true,
      rpe_manage_questionnaires: true,
      rpe_receive_digest: true,
      rpe_receive_alerts: true,
    };
  }

  if (role.includes("assistant")) {
    return { ...base, players: true, sessions: true, livestats: true, media: true };
  }

  if (role.includes("video") || role.includes("vidéo") || role.includes("analyste")) {
    return { ...base, livestats: true, media: true };
  }

  return base;
}

function coachName(coach: CoachRow) {
  return (
    String(coach.name || "").trim() ||
    [coach.first_name, coach.last_name].filter(Boolean).join(" ").trim() ||
    String(coach.email || "").trim() ||
    "Coach"
  );
}

function staffMember(coach: CoachRow) {
  return {
    id: coach.id,
    prenom: coach.first_name || "",
    nom: coach.last_name || "",
    role: displayRole(coach.role),
    email: coach.email || undefined,
    photo: null,
    userId: coach.user_id || null,
    clubManaged: true,
    accountStatus: coach.user_id ? "linked" : "pending",
  };
}

function isPrimaryCoach(coach: CoachRow) {
  const role = normalizeRole(coach.role);
  return role === "coach" || role.includes("principal") || role.includes("entraîneur") || role.includes("entraineur");
}

function isAssistant(coach: CoachRow) {
  return normalizeRole(coach.role).includes("assistant");
}

export async function syncClubTeamAccess(admin: Admin, clubId: string) {
  const [{ data: club, error: clubError }, { data: memberships, error: membershipError }, { data: teamRows, error: teamError }, { data: coachRows, error: coachError }] = await Promise.all([
    admin.from("clubs").select("id,name,logo_url,banner_url,primary_color,secondary_color").eq("id", clubId).maybeSingle(),
    admin.from("club_members").select("user_id,role,status").eq("club_id", clubId).eq("status", "active"),
    admin.from("club_teams").select("id,club_id,name,category,gender,level,season,status,coach_id,assistant_id,notes").eq("club_id", clubId),
    admin.from("club_coaches").select("id,club_id,user_id,first_name,last_name,name,email,role,status,team_ids").eq("club_id", clubId),
  ]);

  if (clubError) throw clubError;
  if (membershipError) throw membershipError;
  if (teamError) throw teamError;
  if (coachError) throw coachError;
  if (!club) throw new Error("Club introuvable.");

  const owner = (memberships || []).find((row: any) => row.role === "owner") || (memberships || []).find((row: any) => row.role === "admin");
  const ownerId = owner?.user_id ? String(owner.user_id) : "";
  if (!ownerId) throw new Error("Aucun propriétaire actif pour ce club.");

  const teams = (teamRows || []) as TeamRow[];
  const coaches = (coachRows || []) as CoachRow[];

  for (const team of teams) {
    const assigned = coaches.filter((coach) => {
      const teamIds = asTeamIds(coach.team_ids);
      return teamIds.includes(team.id) || (!!coach.user_id && (coach.user_id === team.coach_id || coach.user_id === team.assistant_id));
    });

    const primary = assigned.find(isPrimaryCoach) || assigned.find((coach) => coach.user_id && coach.user_id === team.coach_id) || null;
    const assistant = assigned.find(isAssistant) || assigned.find((coach) => coach.user_id && coach.user_id === team.assistant_id) || null;

    const primaryUserId = primary?.user_id || null;
    const assistantUserId = assistant?.user_id || null;

    if (team.coach_id !== primaryUserId || team.assistant_id !== assistantUserId) {
      const { error } = await admin
        .from("club_teams")
        .update({ coach_id: primaryUserId, assistant_id: assistantUserId })
        .eq("id", team.id)
        .eq("club_id", clubId);
      if (error) throw error;
    }

    const staff = assigned.map(staffMember);
    const metadata = {
      isClubTeam: true,
      clubManaged: true,
      clubId,
      clubTeamId: team.id,
      clubName: club.name || "",
      category: team.category || "",
      cat: team.category || "",
      gender: team.gender || "Mixte",
      level: team.level || "",
      season: team.season || "",
      staff,
    };

    const { data: existingTeam } = await admin
      .from("teams")
      .select("id,metadata")
      .eq("id", team.id)
      .maybeSingle();

    const existingMetadata = existingTeam?.metadata && typeof existingTeam.metadata === "object" ? existingTeam.metadata : {};

    const { error: upsertTeamError } = await admin.from("teams").upsert(
      {
        id: team.id,
        user_id: ownerId,
        team_type: "coached",
        name: team.name || team.category || "Équipe",
        club_name: club.name || team.name || "Club",
        category: team.category || "",
        coach_name: primary ? coachName(primary) : "",
        club_logo_url: club.logo_url || null,
        banner_url: club.banner_url || null,
        metadata: { ...existingMetadata, ...metadata },
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (upsertTeamError) throw upsertTeamError;

    const linkedUserIds = assigned.map((coach) => coach.user_id).filter((value): value is string => Boolean(value));

    const { data: managedMembers, error: managedMembersError } = await admin
      .from("team_members")
      .select("id,user_id,permissions")
      .eq("team_id", team.id);
    if (managedMembersError) throw managedMembersError;

    for (const member of managedMembers || []) {
      const permissions = member.permissions && typeof member.permissions === "object" ? member.permissions as Record<string, unknown> : {};
      if (permissions.club_managed === true && !linkedUserIds.includes(String(member.user_id))) {
        const { error } = await admin.from("team_members").delete().eq("id", member.id);
        if (error) throw error;
      }
    }

    for (const coach of assigned) {
      if (!coach.user_id || coach.status === "disabled") continue;

      const role = displayRole(coach.role);
      const permissions = permissionsForRole(coach.role);

      const { error: memberUpsertError } = await admin.from("team_members").upsert(
        {
          team_id: team.id,
          user_id: coach.user_id,
          role,
          permissions,
          status: "active",
        },
        { onConflict: "team_id,user_id" },
      );
      if (memberUpsertError) throw memberUpsertError;

      const { error: clubMemberTeamError } = await admin.from("club_member_teams").upsert(
        { club_id: clubId, team_id: team.id, user_id: coach.user_id },
        { onConflict: "club_id,team_id,user_id" },
      );
      if (clubMemberTeamError) throw clubMemberTeamError;
    }
  }

  return { teams: teams.length, coaches: coaches.length };
}
