import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Exercise } from "@/types/exercise";
import { cleanPracticeText, parsePracticeDuration } from "@/lib/practice-session-format";

const MAX_QUICK_SESSIONS = 4;

export type QuickPracticeSession = {
  id: string;
  title: string;
  session_date: string | null;
  theme: string | null;
  exerciseCount: number;
};

function toText(value: string[] | string | undefined): string | null {
  if (Array.isArray(value)) return value.filter(Boolean).join("\n") || null;
  const text = String(value || "").trim();
  return text || null;
}

function durationMinutes(exercise: Exercise): number {
  return parsePracticeDuration(exercise.temps ?? exercise.duration, 10);
}

function exerciseImage(exercise: Exercise): string | null {
  return (
    exercise.diagrams?.[0]?.imageUrl ||
    exercise.schemaImages?.[0] ||
    exercise.schemaImage ||
    exercise.images?.[0] ||
    null
  );
}

export async function loadQuickSessions(
  supabase: SupabaseClient,
  user: User
): Promise<{ sessions: QuickPracticeSession[]; activeSessionId: string | null }> {
  const [{ data: profile }, { data: sessions, error }] = await Promise.all([
    supabase
      .from("profiles")
      .select("active_practice_session_id")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("practice_sessions")
      .select("id,title,session_date,theme")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(MAX_QUICK_SESSIONS),
  ]);

  if (error) throw error;

  const rows = sessions ?? [];
  const ids = rows.map((session) => session.id);
  const counts = new Map<string, number>();

  if (ids.length > 0) {
    const { data: exerciseRows, error: exerciseError } = await supabase
      .from("practice_session_exercises")
      .select("session_id")
      .in("session_id", ids);

    if (exerciseError) throw exerciseError;

    for (const row of exerciseRows ?? []) {
      counts.set(row.session_id, (counts.get(row.session_id) ?? 0) + 1);
    }
  }

  return {
    sessions: rows.map((session) => ({
      ...session,
      exerciseCount: counts.get(session.id) ?? 0,
    })),
    activeSessionId: profile?.active_practice_session_id ?? null,
  };
}

export async function setActiveQuickSession(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string | null
) {
  const { error } = await supabase
    .from("profiles")
    .update({ active_practice_session_id: sessionId })
    .eq("id", userId);

  if (error) throw error;
}

async function deleteSessionCascade(
  supabase: SupabaseClient,
  userId: string,
  sessionId: string
) {
  await supabase.from("calendar_events").delete().eq("session_id", sessionId);
  await supabase.from("practice_session_attendance").delete().eq("session_id", sessionId);
  await supabase.from("practice_session_players").delete().eq("session_id", sessionId);
  await supabase.from("practice_session_exercises").delete().eq("session_id", sessionId);

  const { error } = await supabase
    .from("practice_sessions")
    .delete()
    .eq("id", sessionId)
    .eq("user_id", userId);

  if (error) throw error;
}

export async function deleteQuickSession(
  supabase: SupabaseClient,
  user: User,
  sessionId: string
) {
  await deleteSessionCascade(supabase, user.id, sessionId);

  const { data: profile } = await supabase
    .from("profiles")
    .select("active_practice_session_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.active_practice_session_id === sessionId) {
    await setActiveQuickSession(supabase, user.id, null);
  }
}

async function keepOnlyFourNewestSessions(
  supabase: SupabaseClient,
  user: User
) {
  const { data, error } = await supabase
    .from("practice_sessions")
    .select("id")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) throw error;

  const obsolete = (data ?? []).slice(MAX_QUICK_SESSIONS);
  for (const session of obsolete) {
    await deleteSessionCascade(supabase, user.id, session.id);
  }
}

export async function createQuickSession(
  supabase: SupabaseClient,
  user: User,
  title = "Séance rapide"
): Promise<QuickPracticeSession> {
  const cleanTitle = title.trim() || "Séance rapide";

  const today = new Date().toISOString().slice(0, 10);
  const { data, error } = await supabase
    .from("practice_sessions")
    .insert({
      user_id: user.id,
      visibility: "private",
      team_id: null,
      title: cleanTitle,
      theme: null,
      session_date: today,
      start_time: null,
      end_time: null,
      location: null,
      club_logo_url: null,
      mybasket_logo_url: "/logo-mybasket02.png",
      pdf_url: null,
    })
    .select("id,title,session_date,theme")
    .single();

  if (error) throw error;

  await setActiveQuickSession(supabase, user.id, data.id);
  await keepOnlyFourNewestSessions(supabase, user);

  return { ...data, exerciseCount: 0 };
}

export async function quickAddExerciseToSession(
  supabase: SupabaseClient,
  user: User,
  sessionId: string,
  exercise: Exercise
): Promise<{ added: boolean; count: number }> {
  const image = exerciseImage(exercise);
  // La fiche séance suit les rubriques de la fiche exercice :
  // Explications = Déroulement. Consignes = Consignes, sinon Variantes.
  const explanation =
    cleanPracticeText(exercise.deroulement) ||
    cleanPracticeText(exercise.description) ||
    null;
  const instructions =
    cleanPracticeText(exercise.consignes) ||
    cleanPracticeText(exercise.instructions) ||
    cleanPracticeText(exercise.variantes) ||
    null;
  const duration = durationMinutes(exercise);

  // 1) Toujours alimenter le panier de construction de séance.
  const { data: existingCart, error: existingCartError } = await supabase
    .from("cart_items")
    .select("id")
    .eq("user_id", user.id)
    .eq("item_type", "exercise")
    .eq("item_id", exercise.id)
    .limit(1);

  if (existingCartError) throw existingCartError;

  const { data: cartRows, error: cartRowsError } = await supabase
    .from("cart_items")
    .select("sort_order")
    .eq("user_id", user.id)
    .in("item_type", ["exercise", "system", "session"])
    .order("sort_order", { ascending: false })
    .limit(1);

  if (cartRowsError) throw cartRowsError;

  let addedToCart = false;
  if ((existingCart ?? []).length === 0) {
    const nextSortOrder = Number(cartRows?.[0]?.sort_order ?? -1) + 1;
    const { error: cartInsertError } = await supabase.from("cart_items").insert({
      user_id: user.id,
      item_type: "exercise",
      item_id: exercise.id,
      title: exercise.title || "Exercice",
      description: explanation,
      image_url: image,
      price: 0,
      quantity: 1,
      duration_minutes: duration,
      assigned_to: "Coach principal",
      sort_order: nextSortOrder,
      metadata: {
        source: "exercise_quick_add",
        exercise_id: exercise.id,
        exercise_title: exercise.title || "Exercice",
        deroulement: exercise.deroulement ?? exercise.description ?? null,
        consignes: exercise.consignes ?? exercise.instructions ?? null,
        variantes: exercise.variantes ?? null,
        organisation: exercise.organisation ?? null,
        temps: exercise.temps ?? exercise.duration ?? null,
        schema_images: [
          ...(exercise.schemaImages ?? []),
          ...(exercise.diagrams ?? []).map((diagram) => diagram.imageUrl).filter(Boolean),
        ],
        explanation,
        instructions,
      },
    });

    if (cartInsertError) throw cartInsertError;
    addedToCart = true;
  }

  // 2) Si une séance active a été choisie, l’alimenter également.
  if (sessionId) {
    const { data: existingSession, error: existingSessionError } = await supabase
      .from("practice_session_exercises")
      .select("id")
      .eq("session_id", sessionId)
      .eq("exercise_id", exercise.id)
      .limit(1);

    if (existingSessionError) throw existingSessionError;

    if ((existingSession ?? []).length === 0) {
      const { count, error: countError } = await supabase
        .from("practice_session_exercises")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId);

      if (countError) throw countError;

      const fullRow = {
        session_id: sessionId,
        user_id: user.id,
        exercise_id: exercise.id,
        title: exercise.title || "Exercice",
        who: "CP",
        duration_minutes: duration,
        situation_image_url: image,
        explanation,
        instructions,
        sort_order: count ?? 0,
      };

      const fullInsert = await supabase
        .from("practice_session_exercises")
        .insert(fullRow);

      if (fullInsert.error) {
        const legacyInsert = await supabase
          .from("practice_session_exercises")
          .insert({
            session_id: sessionId,
            title: fullRow.title,
            who: fullRow.who,
            duration_minutes: fullRow.duration_minutes,
            situation_image_url: fullRow.situation_image_url,
            explanation: fullRow.explanation,
            instructions: fullRow.instructions,
            sort_order: fullRow.sort_order,
          });

        if (legacyInsert.error) throw legacyInsert.error;
      }
    }
  }

  const countQuery = sessionId
    ? supabase
        .from("practice_session_exercises")
        .select("id", { count: "exact", head: true })
        .eq("session_id", sessionId)
    : supabase
        .from("cart_items")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .in("item_type", ["exercise", "system", "session"]);

  const { count, error: countError } = await countQuery;
  if (countError) throw countError;

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("cart-updated"));
  }

  return { added: addedToCart, count: count ?? 0 };
}

export async function resetQuickSession(
  supabase: SupabaseClient,
  user: User,
  sessionId: string
) {
  await deleteSessionCascade(supabase, user.id, sessionId);

  const { data: quickCartRows } = await supabase
    .from("cart_items")
    .select("id,metadata")
    .eq("user_id", user.id)
    .eq("item_type", "exercise");

  const idsToDelete = (quickCartRows ?? [])
    .filter((row) => (row.metadata as Record<string, unknown> | null)?.source === "exercise_quick_add")
    .map((row) => row.id);

  if (idsToDelete.length > 0) {
    await supabase.from("cart_items").delete().in("id", idsToDelete);
  }

  await setActiveQuickSession(supabase, user.id, null);

  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event("cart-updated"));
  }
}
