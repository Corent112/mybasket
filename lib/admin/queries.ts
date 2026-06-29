"use client";

import { createBrowserClient } from "@supabase/ssr";

/* ----------------------------- Client ----------------------------- */
export function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/* ----------------------------- Rôle ------------------------------- */
export type RoleCheck = { authed: boolean; role: string | null };

export async function getCurrentRole(): Promise<RoleCheck> {
  const sb = getSupabase();

  const {
    data: { session },
  } = await sb.auth.getSession();

  if (!session) return { authed: false, role: null };

  const { data } = await sb
    .from("profiles")
    .select("platform_role")
    .eq("id", session.user.id)
    .maybeSingle();

  return { authed: true, role: (data?.platform_role as string) ?? null };
}

export const ADMIN_ROLES = ["ceo", "superadmin"];

/* --------------------------- Utilisateurs -------------------------- */

export interface AdminUser {
  id: string;
  nom: string;
  email: string;
  role: string;
  abonnement: string;
  statut: string;
  avatar: string | null;
  created_at?: string | null;
}

function mapUser(r: Record<string, any>): AdminUser {
  const nom =
    r.full_name ||
    r.display_name ||
    [r.prenom, r.nom].filter(Boolean).join(" ").trim() ||
    r.name ||
    r.email ||
    "—";

  return {
    id: r.id,
    nom,
    email: r.email ?? "—",
    role: r.platform_role ?? r.role ?? "user",
    abonnement: r.subscription ?? r.plan ?? r.abonnement ?? "—",
    statut: r.status ?? r.account_status ?? "active",
    avatar: r.avatar_url ?? r.avatar ?? null,
    created_at: r.created_at ?? null,
  };
}

export async function getProfiles(): Promise<AdminUser[]> {
  const sb = getSupabase();

  const { data, error } = await sb
    .from("profiles")
    .select("*")
    .order("created_at", { ascending: false });

  if (error || !data) {
    console.warn("Erreur chargement profiles:", error?.message);
    return [];
  }

  return data.map(mapUser);
}

export async function updateUserRole(id: string, role: string) {
  const sb = getSupabase();

  const { error } = await sb
    .from("profiles")
    .update({
      platform_role: role,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function setUserStatus(id: string, statut: "active" | "suspended") {
  const sb = getSupabase();

  const { error } = await sb
    .from("profiles")
    .update({
      status: statut,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
}

export async function deleteUser(id: string) {
  const sb = getSupabase();

  const { error } = await sb.from("profiles").delete().eq("id", id);

  if (error) throw new Error(error.message);
}
