import { createClient } from "@/lib/supabase/server";

type AccessResult = {
  userId: string | null;
  allowed: boolean;
};

type LimitResult = {
  userId: string | null;
  limit: number | null;
  count: number;
  canCreate: boolean;
};

type ClubSubscriptionAccess = {
  userId: string | null;
  planId: string | null;
  planName: string | null;
  planSlug: string | null;
  hasClubSubscription: boolean;
  isAdmin: boolean;
  limits: {
    maxCoaches: number | null;
    maxTeams: number | null;
    maxPlayers: number | null;
    maxDocuments: number | null;
    storageGb: number | null;
  };
};

type CurrentUserAccessContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  user: any | null;
  profile: any | null;
  subscription: any | null;
  plan: any | null;
  isAdmin: boolean;
};

function toNumberOrNull(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  const numberValue = Number(value);

  return Number.isFinite(numberValue) ? numberValue : null;
}

function isClubPlan(plan: any | null): boolean {
  if (!plan) return false;

  return (
    plan.target === "club" ||
    String(plan.slug || "").includes("club") ||
    String(plan.name || "").toLowerCase().includes("club")
  );
}

export async function getCurrentUserAccessContext(): Promise<CurrentUserAccessContext> {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      supabase,
      user: null,
      profile: null,
      subscription: null,
      plan: null,
      isAdmin: false,
    };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role,status")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin =
    profile?.platform_role === "ceo" ||
    profile?.platform_role === "superadmin" ||
    profile?.platform_role === "admin";

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select(
      `
      *,
      subscription_plans (*)
    `
    )
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  const plan = (subscription as any)?.subscription_plans ?? null;

  return {
    supabase,
    user,
    profile,
    subscription,
    plan,
    isAdmin,
  };
}

export async function hasAccess(sectionKey: string): Promise<boolean> {
  const { supabase, user, subscription, isAdmin } =
    await getCurrentUserAccessContext();

  if (!user) return false;
  if (isAdmin) return true;
  if (!subscription?.plan_id) return false;

  const { data: access } = await supabase
    .from("subscription_access")
    .select("enabled")
    .eq("plan_id", subscription.plan_id)
    .eq("section_key", sectionKey)
    .maybeSingle();

  return Boolean(access?.enabled);
}

export async function getAccessResult(
  sectionKey: string
): Promise<AccessResult> {
  const { user } = await getCurrentUserAccessContext();

  return {
    userId: user?.id ?? null,
    allowed: await hasAccess(sectionKey),
  };
}

async function getLimitForCurrentUser(options: {
  column: "team_limit" | "playbook_limit" | "document_limit";
  table: string;
  userColumn: string;
}): Promise<LimitResult> {
  const { supabase, user, plan, isAdmin } = await getCurrentUserAccessContext();

  if (!user) {
    return {
      userId: null,
      limit: 0,
      count: 0,
      canCreate: false,
    };
  }

  if (isAdmin) {
    return {
      userId: user.id,
      limit: null,
      count: 0,
      canCreate: true,
    };
  }

  const limit = toNumberOrNull(plan?.[options.column]);

  const { count } = await supabase
    .from(options.table)
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq(options.userColumn, user.id);

  const usedCount = count ?? 0;

  return {
    userId: user.id,
    limit,
    count: usedCount,
    canCreate: limit === null ? true : usedCount < limit,
  };
}

export async function getTeamLimitForCurrentUser(): Promise<LimitResult> {
  return getLimitForCurrentUser({
    column: "team_limit",
    table: "teams",
    userColumn: "owner_id",
  });
}

export async function canCreateTeam(): Promise<boolean> {
  const result = await getTeamLimitForCurrentUser();
  return result.canCreate;
}

export async function getPlaybookLimitForCurrentUser(): Promise<LimitResult> {
  return getLimitForCurrentUser({
    column: "playbook_limit",
    table: "playbooks",
    userColumn: "user_id",
  });
}

export async function canCreatePlaybook(): Promise<boolean> {
  const result = await getPlaybookLimitForCurrentUser();
  return result.canCreate;
}

export async function getDocumentLimitForCurrentUser(): Promise<LimitResult> {
  return getLimitForCurrentUser({
    column: "document_limit",
    table: "user_documents",
    userColumn: "user_id",
  });
}

export async function canUploadDocument(): Promise<boolean> {
  const result = await getDocumentLimitForCurrentUser();
  return result.canCreate;
}

export async function getClubSubscriptionAccess(): Promise<ClubSubscriptionAccess> {
  const { user, plan, isAdmin } = await getCurrentUserAccessContext();

  if (!user) {
    return {
      userId: null,
      planId: null,
      planName: null,
      planSlug: null,
      hasClubSubscription: false,
      isAdmin: false,
      limits: {
        maxCoaches: 0,
        maxTeams: 0,
        maxPlayers: 0,
        maxDocuments: 0,
        storageGb: 0,
      },
    };
  }

  if (isAdmin) {
    return {
      userId: user.id,
      planId: plan?.id ?? null,
      planName: plan?.name ?? "Full access",
      planSlug: plan?.slug ?? "full-access",
      hasClubSubscription: true,
      isAdmin: true,
      limits: {
        maxCoaches: null,
        maxTeams: null,
        maxPlayers: null,
        maxDocuments: null,
        storageGb: null,
      },
    };
  }

  const hasClubSubscription = isClubPlan(plan);

  return {
    userId: user.id,
    planId: plan?.id ?? null,
    planName: plan?.name ?? null,
    planSlug: plan?.slug ?? null,
    hasClubSubscription,
    isAdmin: false,
    limits: {
      maxCoaches: toNumberOrNull(
        plan?.coach_limit ?? plan?.coach_limit_label
      ),
      maxTeams: toNumberOrNull(plan?.team_limit),
      maxPlayers: toNumberOrNull(plan?.player_limit),
      maxDocuments: toNumberOrNull(plan?.document_limit),
      storageGb: toNumberOrNull(plan?.storage_gb),
    },
  };
}

export async function canAccessClubSpace(): Promise<boolean> {
  const access = await getClubSubscriptionAccess();
  return access.hasClubSubscription;
}

export async function getClubLimitForCurrentUser(options: {
  table: string;
  clubId: string;
  clubColumn?: string;
  limitKey: keyof ClubSubscriptionAccess["limits"];
}): Promise<LimitResult> {
  const { supabase, user } = await getCurrentUserAccessContext();
  const access = await getClubSubscriptionAccess();

  if (!user || !access.hasClubSubscription) {
    return {
      userId: user?.id ?? null,
      limit: 0,
      count: 0,
      canCreate: false,
    };
  }

  const limit = access.limits[options.limitKey];

  if (access.isAdmin) {
    return {
      userId: user.id,
      limit: null,
      count: 0,
      canCreate: true,
    };
  }

  const { count } = await supabase
    .from(options.table)
    .select("*", {
      count: "exact",
      head: true,
    })
    .eq(options.clubColumn ?? "club_id", options.clubId);

  const usedCount = count ?? 0;

  return {
    userId: user.id,
    limit,
    count: usedCount,
    canCreate: limit === null ? true : usedCount < limit,
  };
}

export async function canCreateClubTeam(clubId: string): Promise<boolean> {
  const result = await getClubLimitForCurrentUser({
    table: "club_teams",
    clubId,
    limitKey: "maxTeams",
  });

  return result.canCreate;
}

export async function canCreateClubCoach(clubId: string): Promise<boolean> {
  const result = await getClubLimitForCurrentUser({
    table: "club_coaches",
    clubId,
    limitKey: "maxCoaches",
  });

  return result.canCreate;
}

export async function canCreateClubPlayer(clubId: string): Promise<boolean> {
  const result = await getClubLimitForCurrentUser({
    table: "club_players",
    clubId,
    limitKey: "maxPlayers",
  });

  return result.canCreate;
}

export async function canUploadClubDocument(clubId: string): Promise<boolean> {
  const result = await getClubLimitForCurrentUser({
    table: "club_documents",
    clubId,
    limitKey: "maxDocuments",
  });

  return result.canCreate;
}