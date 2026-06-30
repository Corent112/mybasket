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

async function getUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return { supabase, user };
}

export async function hasAccess(_sectionKey: string): Promise<boolean> {
  const { user } = await getUser();
  return Boolean(user);
}

export async function getAccessResult(
  sectionKey: string
): Promise<AccessResult> {
  const { user } = await getUser();

  return {
    userId: user?.id ?? null,
    allowed: await hasAccess(sectionKey),
  };
}

export async function getTeamLimitForCurrentUser(): Promise<LimitResult> {
  const { user } = await getUser();
  return {
    userId: user?.id ?? null,
    limit: null,
    count: 0,
    canCreate: Boolean(user),
  };
}

export async function canCreateTeam(): Promise<boolean> {
  return (await getTeamLimitForCurrentUser()).canCreate;
}

export async function getPlaybookLimitForCurrentUser(): Promise<LimitResult> {
  const { user } = await getUser();
  return {
    userId: user?.id ?? null,
    limit: null,
    count: 0,
    canCreate: Boolean(user),
  };
}

export async function canCreatePlaybook(): Promise<boolean> {
  return (await getPlaybookLimitForCurrentUser()).canCreate;
}

export async function getDocumentLimitForCurrentUser(): Promise<LimitResult> {
  const { user } = await getUser();
  return {
    userId: user?.id ?? null,
    limit: null,
    count: 0,
    canCreate: Boolean(user),
  };
}

export async function canUploadDocument(): Promise<boolean> {
  return (await getDocumentLimitForCurrentUser()).canCreate;
}

export async function getClubSubscriptionAccess(): Promise<ClubSubscriptionAccess> {
  const { supabase, user } = await getUser();

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

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role")
    .eq("id", user.id)
    .maybeSingle();

  const isAdmin =
    profile?.platform_role === "ceo" ||
    profile?.platform_role === "superadmin" ||
    profile?.platform_role === "admin";

  return {
    userId: user.id,
    planId: null,
    planName: isAdmin ? "Admin" : "Accès bêta gratuit",
    planSlug: isAdmin ? "admin" : "beta-free-full-access",
    hasClubSubscription: true,
    isAdmin,
    limits: {
      maxCoaches: null,
      maxTeams: null,
      maxPlayers: null,
      maxDocuments: null,
      storageGb: null,
    },
  };
}

export async function canAccessClubSpace(): Promise<boolean> {
  const { user } = await getUser();
  return Boolean(user);
}

export async function getClubLimitForCurrentUser(_options: {
  table: string;
  clubId: string;
  clubColumn?: string;
  limitKey: keyof ClubSubscriptionAccess["limits"];
}): Promise<LimitResult> {
  const { user } = await getUser();

  return {
    userId: user?.id ?? null,
    limit: null,
    count: 0,
    canCreate: Boolean(user),
  };
}

export async function canCreateClubTeam(_clubId: string): Promise<boolean> {
  const { user } = await getUser();
  return Boolean(user);
}

export async function canCreateClubCoach(_clubId: string): Promise<boolean> {
  const { user } = await getUser();
  return Boolean(user);
}

export async function canCreateClubPlayer(_clubId: string): Promise<boolean> {
  const { user } = await getUser();
  return Boolean(user);
}

export async function canUploadClubDocument(_clubId: string): Promise<boolean> {
  const { user } = await getUser();
  return Boolean(user);
}