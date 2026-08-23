import { createAdminClient } from "@/lib/supabase/admin-server";
import { getEffectiveSubscriptionForUser } from "@/lib/effective-subscription";

function isAdminRole(role: unknown) {
  const normalized = String(role || "").toLowerCase();
  return normalized === "ceo" || normalized === "superadmin" || normalized === "admin";
}

function normalizeLimit(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return 0;
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (number < 0) return null;
  return Math.floor(number);
}

export async function getAssistantLimitForOwner(options: {
  supabase: any;
  ownerId: string;
  ownerEmail?: string | null;
}) {
  const admin = createAdminClient();
  const client = admin || options.supabase;

  const [{ data: profile }, effective] = await Promise.all([
    client
      .from("profiles")
      .select("platform_role")
      .eq("id", options.ownerId)
      .maybeSingle(),
    getEffectiveSubscriptionForUser({
      supabase: options.supabase,
      userId: options.ownerId,
      email: options.ownerEmail,
    }),
  ]);

  if (isAdminRole(profile?.platform_role)) return null;
  if (!effective.active || !effective.plan) return 0;

  return normalizeLimit(effective.plan.max_assistants_per_team);
}

export async function getTeamCollaborationUsage(options: {
  admin: NonNullable<ReturnType<typeof createAdminClient>>;
  teamId: string;
  excludeInvitationId?: string | null;
}) {
  const now = new Date().toISOString();

  const [{ count: activeCount, error: activeError }, pendingResult] = await Promise.all([
    options.admin
      .from("team_members")
      .select("id", { count: "exact", head: true })
      .eq("team_id", options.teamId)
      .eq("status", "active"),
    options.admin
      .from("team_invitations")
      .select("id", { count: "exact", head: true })
      .eq("team_id", options.teamId)
      .eq("status", "pending")
      .gt("expires_at", now),
  ]);

  if (activeError || pendingResult.error) {
    throw activeError || pendingResult.error;
  }

  let pendingCount = pendingResult.count ?? 0;

  if (options.excludeInvitationId) {
    const { data: excluded } = await options.admin
      .from("team_invitations")
      .select("id,status,expires_at")
      .eq("id", options.excludeInvitationId)
      .eq("team_id", options.teamId)
      .maybeSingle();

    if (
      excluded?.id &&
      excluded.status === "pending" &&
      (!excluded.expires_at || new Date(excluded.expires_at).getTime() > Date.now())
    ) {
      pendingCount = Math.max(0, pendingCount - 1);
    }
  }

  const active = activeCount ?? 0;
  return {
    active,
    pending: pendingCount,
    used: active + pendingCount,
  };
}

export function collaborationLimitReached(limit: number | null, used: number) {
  return limit !== null && used >= limit;
}
