import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import type { AiScope } from "@/lib/ai/config";
import type { KnowledgeScopeContext } from "./types";

/**
 * Résolution de l'utilisateur courant pour les routes API IA.
 *
 * Contrairement à `requireAdmin()` (lib/admin/guard.ts) qui appelle
 * `redirect()` — inadapté à une route API qui doit répondre en JSON — ces
 * helpers renvoient un objet et laissent l'appelant produire la réponse.
 */

export const AI_ADMIN_ROLES = ["ceo", "superadmin"] as const;

export type AiActor = {
  supabase: SupabaseClient;
  userId: string;
  email: string | null;
  role: string | null;
  isAdmin: boolean;
  clubIds: string[];
};

export type ActorResult =
  | { ok: true; actor: AiActor }
  | { ok: false; status: 401 | 403; error: string };

export async function resolveActor(): Promise<ActorResult> {
  const supabase = await createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return { ok: false, status: 401, error: "Non authentifié." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("platform_role, status, email")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.status === "suspended") {
    return { ok: false, status: 403, error: "Compte suspendu." };
  }

  const role = (profile?.platform_role as string) ?? null;

  const { data: memberships } = await supabase
    .from("club_members")
    .select("club_id")
    .eq("user_id", user.id)
    .eq("status", "active");

  return {
    ok: true,
    actor: {
      supabase,
      userId: user.id,
      email: (profile?.email as string) ?? user.email ?? null,
      role,
      isAdmin: AI_ADMIN_ROLES.includes(role as (typeof AI_ADMIN_ROLES)[number]),
      clubIds: (memberships || []).map((m: { club_id: string }) => m.club_id).filter(Boolean),
    },
  };
}

/** Variante qui exige le rôle admin plateforme (CEO / superadmin). */
export async function resolveAdminActor(): Promise<ActorResult> {
  const result = await resolveActor();
  if (!result.ok) return result;
  if (!result.actor.isAdmin) {
    return { ok: false, status: 403, error: "Accès réservé à l'administration MyBasket." };
  }
  return result;
}

/**
 * Client à privilèges élevés pour les écritures que la RLS interdit à
 * l'utilisateur (insertion des chunks d'indexation, journal d'usage).
 * Retombe sur le client utilisateur si la clé service role est absente.
 */
export function getWriterClient(fallback: SupabaseClient): SupabaseClient {
  return createAdminClient() ?? fallback;
}

/**
 * Portée effective d'une requête au Knowledge Engine.
 * Par défaut : GLOBAL + le club de l'utilisateur + ses connaissances perso.
 */
export function buildScopeContext(
  actor: Pick<AiActor, "userId" | "clubIds">,
  overrides?: Partial<KnowledgeScopeContext>
): KnowledgeScopeContext {
  const clubId = overrides?.clubId ?? actor.clubIds[0] ?? null;

  const scopes: AiScope[] =
    overrides?.scopes ??
    (["global", clubId ? "club" : null, "user"].filter(Boolean) as AiScope[]);

  return {
    scopes,
    clubId,
    userId: overrides?.userId ?? actor.userId,
  };
}

/** Portée « administration MyBasket » : GLOBAL uniquement. */
export function globalScopeContext(userId: string | null = null): KnowledgeScopeContext {
  return { scopes: ["global"], clubId: null, userId };
}
