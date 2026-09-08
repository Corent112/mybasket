import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

export async function institutionalSportActor(structureId: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      error: NextResponse.json({ error: "Non connecté" }, { status: 401 }),
    } as const;
  }

  const admin = createAdminClient();

  if (!admin) {
    return {
      error: NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY absente" },
        { status: 503 }
      ),
    } as const;
  }

  const { data: member } = await admin
    .from("institutional_members")
    .select("id,role,status,permissions")
    .eq("structure_id", structureId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!member) {
    return {
      error: NextResponse.json(
        { error: "Accès refusé à cette institution" },
        { status: 403 }
      ),
    } as const;
  }

  return { admin, user, member } as const;
}

export function canManageSport(member: {
  role?: string | null;
  permissions?: Record<string, unknown> | null;
}) {
  const role = String(member?.role || "");
  if (role === "owner" || role === "admin" || role === "performance") return true;
  return member?.permissions?.players === true;
}

export async function resolveOrInviteUser(
  admin: NonNullable<ReturnType<typeof createAdminClient>>,
  email: string,
  redirectTo: string
) {
  const normalized = email.trim().toLowerCase();

  const { data: profile } = await admin
    .from("profiles")
    .select("id,email")
    .ilike("email", normalized)
    .maybeSingle();

  if (profile?.id) {
    return { userId: String(profile.id), invited: false };
  }

  const invite = await admin.auth.admin.inviteUserByEmail(normalized, {
    redirectTo,
  });

  if (invite.error || !invite.data.user?.id) {
    throw new Error(invite.error?.message || "Invitation utilisateur impossible");
  }

  return { userId: String(invite.data.user.id), invited: true };
}
