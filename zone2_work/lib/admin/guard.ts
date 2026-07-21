import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const SERVER_ADMIN_ROLES = ["ceo", "superadmin"] as const;
export type ServerAdminRole = (typeof SERVER_ADMIN_ROLES)[number];

type ProfileGuardRow = {
  id: string;
  platform_role: string | null;
  status: string | null;
};

function isServerAdminRole(role: string | null | undefined): role is ServerAdminRole {
  return role === "ceo" || role === "superadmin";
}

export async function requireAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/connexion?next=/admin");
  }

  const { data, error: profileError } = await supabase
    .from("profiles")
    .select("id, platform_role, status")
    .eq("id", user.id)
    .maybeSingle();

  const profile = data as ProfileGuardRow | null;

  if (profileError || !profile) {
    redirect("/connexion?next=/admin");
  }

  if (profile.status === "suspended") {
    redirect("/mon-compte");
  }

  if (!isServerAdminRole(profile.platform_role)) {
    redirect("/mon-compte");
  }

  return {
    user,
    profile: {
      ...profile,
      platform_role: profile.platform_role,
    },
    supabase,
  };
}

export async function isAdmin() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return false;

  const { data } = await supabase
    .from("profiles")
    .select("platform_role, status")
    .eq("id", user.id)
    .maybeSingle();

  const profile = data as Pick<ProfileGuardRow, "platform_role" | "status"> | null;

  return Boolean(
    profile &&
      profile.status !== "suspended" &&
      isServerAdminRole(profile.platform_role)
  );
}
