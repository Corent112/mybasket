import { createClient } from "@/lib/supabase/client";

export type GamePlan = {
  id: string;
  user_id?: string;
  team_id?: string | null;
  calendar_event_id?: string | null;
  title: string;
  opponent?: string | null;
  match_date?: string | null;
  match_time?: string | null;
  competition?: string | null;
  key_points?: string[];
  defensive_plan?: string | null;
  notes?: string | null;
};

export type GamePlanSystem = {
  id: string;
  game_plan_id: string;
  source: "playbook" | "bibliotheque" | "quick" | "scouting";
  title: string;
  category?: string | null;
  priority?: number | null;
  objectif?: string | null;
  schema_image?: string | null;
};

export type GamePlanScouting = {
  id: string;
  game_plan_id: string;
  opponent_team?: string | null;
  coach?: string | null;
  style_of_play?: string | null;
  strengths?: string[];
  weaknesses?: string[];
  key_players?: any[];
  watch_player?: string | null;
  defensive_plan?: string | null;
};

export async function createGamePlan(payload: Partial<GamePlan>) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  if (!user) throw new Error("Utilisateur non connecté");

  const { data, error } = await supabase
    .from("game_plans")
    .insert({
      user_id: user.id,
      title: payload.title ?? "Game Plan",
      opponent: payload.opponent ?? "",
      match_date: payload.match_date ?? null,
      match_time: payload.match_time ?? null,
      competition: payload.competition ?? "",
      key_points: payload.key_points ?? [],
      defensive_plan: payload.defensive_plan ?? "",
      notes: payload.notes ?? "",
      team_id: payload.team_id ?? null,
      calendar_event_id: payload.calendar_event_id ?? null,
    })
    .select()
    .single();

  if (error) throw error;
  return data as GamePlan;
}

export async function createMatchEventForGamePlan(gamePlan: GamePlan) {
  const supabase = createClient();
  const { data: auth } = await supabase.auth.getUser();
  const user = auth.user;

  if (!user) throw new Error("Utilisateur non connecté");

  const { data, error } = await supabase
    .from("calendar_events")
    .insert({
      user_id: user.id,
      title: `Match vs ${gamePlan.opponent || "Adversaire"}`,
      description: `Game Plan associé : ${gamePlan.title}`,
      event_type: "match",
      event_date: gamePlan.match_date,
      start_time: gamePlan.match_time,
      opponent: gamePlan.opponent,
      game_plan_id: gamePlan.id,
    })
    .select()
    .single();

  if (error) throw error;

  await supabase
    .from("game_plans")
    .update({ calendar_event_id: data.id })
    .eq("id", gamePlan.id);

  return data;
}

export async function linkGamePlanToEvent(gamePlanId: string, eventId: string) {
  const supabase = createClient();

  const { error: e1 } = await supabase
    .from("game_plans")
    .update({ calendar_event_id: eventId })
    .eq("id", gamePlanId);

  if (e1) throw e1;

  const { error: e2 } = await supabase
    .from("calendar_events")
    .update({ game_plan_id: gamePlanId })
    .eq("id", eventId);

  if (e2) throw e2;
}

export async function addGamePlanSystem(payload: Omit<GamePlanSystem, "id">) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("game_plan_systems")
    .insert(payload)
    .select()
    .single();

  if (error) throw error;
  return data as GamePlanSystem;
}

export async function saveGamePlanScouting(
  payload: Partial<GamePlanScouting> & { game_plan_id: string }
) {
  const supabase = createClient();

  const { data: existing } = await supabase
    .from("game_plan_scouting")
    .select("id")
    .eq("game_plan_id", payload.game_plan_id)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase
      .from("game_plan_scouting")
      .update(payload)
      .eq("id", existing.id);

    if (error) throw error;
    return;
  }

  const { error } = await supabase.from("game_plan_scouting").insert(payload);
  if (error) throw error;
}

export async function loadFullGamePlan(gamePlanId: string) {
  const supabase = createClient();

  const [{ data: plan }, { data: systems }, { data: scouting }] =
    await Promise.all([
      supabase.from("game_plans").select("*").eq("id", gamePlanId).single(),
      supabase
        .from("game_plan_systems")
        .select("*")
        .eq("game_plan_id", gamePlanId)
        .order("priority"),
      supabase
        .from("game_plan_scouting")
        .select("*")
        .eq("game_plan_id", gamePlanId)
        .maybeSingle(),
    ]);

  return {
    plan: plan as GamePlan,
    systems: (systems ?? []) as GamePlanSystem[],
    scouting: scouting as GamePlanScouting | null,
  };
}