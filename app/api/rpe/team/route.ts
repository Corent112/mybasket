import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { getTeamRpeAccess, hasRpePermission } from "@/lib/rpe/access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const teamId = request.nextUrl.searchParams.get("teamId") || "";
  if (!teamId) return NextResponse.json({ error: "teamId manquant." }, { status: 400 });

  const access = await getTeamRpeAccess(teamId);
  if (!access.allowed) return NextResponse.json({ error: "Accès Charge & RPE refusé." }, { status: 403 });

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Serveur indisponible." }, { status: 500 });

  const canIndividual = hasRpePermission(access, "rpe_individual");
  const canGroup = hasRpePermission(access, "rpe_group");
  const canManageTarget = hasRpePermission(access, "rpe_manage_target");
  const canManageQuestionnaires = hasRpePermission(access, "rpe_manage_questionnaires");
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const now = new Date().toISOString();

  const availabilityPromise = admin
    .from("player_availability")
    .select("*")
    .eq("team_id", teamId)
    .lte("starts_at", now)
    .or(`ends_at.is.null,ends_at.gte.${now}`)
    .order("starts_at", { ascending: false });

  const loadsPromise = canIndividual || canManageTarget
    ? admin
        .from("training_load_entries")
        .select("id,player_id,load_date,duration_minutes,planned_rpe,actual_rpe,planned_load,actual_load,load_type")
        .eq("team_id", teamId)
        .order("load_date", { ascending: false })
        .limit(500)
    : Promise.resolve({ data: [], error: null } as any);

  const linksPromise = canManageQuestionnaires
    ? admin
        .from("team_wellness_links")
        .select("id,token,response_kind,enabled,title")
        .eq("team_id", teamId)
        .order("created_at")
    : Promise.resolve({ data: [], error: null } as any);

  let responseQuery = admin
    .from("player_wellness_responses")
    .select("id,player_id,response_kind,response_date,duration_minutes,rpe,fatigue,soreness,sleep,stress,comment,created_at")
    .eq("team_id", teamId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (from) responseQuery = responseQuery.gte("response_date", from);
  if (to) responseQuery = responseQuery.lte("response_date", to);
  const responsesPromise = canIndividual
    ? responseQuery
    : Promise.resolve({ data: [], error: null } as any);

  let planQuery = admin.from("team_load_plans").select("*").eq("team_id", teamId).order("plan_date");
  if (from) planQuery = planQuery.gte("plan_date", from);
  if (to) planQuery = planQuery.lte("plan_date", to);
  const plansPromise = canGroup || canIndividual || canManageTarget
    ? planQuery
    : Promise.resolve({ data: [], error: null } as any);

  const [availability, loads, links, responses, plans] = await Promise.all([
    availabilityPromise,
    loadsPromise,
    linksPromise,
    responsesPromise,
    plansPromise,
  ]);

  const error = availability.error || loads.error || links.error || responses.error || plans.error;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    availability: availability.data || [],
    loads: loads.data || [],
    links: links.data || [],
    responses: responses.data || [],
    plans: plans.data || [],
    permissions: {
      canIndividual,
      canGroup,
      canManageTarget,
      canManageQuestionnaires,
    },
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  const teamId = String(body?.teamId || "");
  const action = String(body?.action || "");
  if (!teamId || !action) return NextResponse.json({ error: "Paramètres manquants." }, { status: 400 });

  const access = await getTeamRpeAccess(teamId);
  if (!access.allowed || !access.userId) return NextResponse.json({ error: "Accès Charge & RPE refusé." }, { status: 403 });
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Serveur indisponible." }, { status: 500 });

  if (["save_plan", "clear_plan", "save_load", "reset_week", "copy_previous_week"].includes(action)) {
    if (!hasRpePermission(access, "rpe_manage_target")) return NextResponse.json({ error: "Droit de gestion de la charge requis." }, { status: 403 });
  }
  if (["create_link", "regenerate_link", "toggle_link"].includes(action)) {
    if (!hasRpePermission(access, "rpe_manage_questionnaires")) return NextResponse.json({ error: "Droit de gestion des questionnaires requis." }, { status: 403 });
  }
  if (action === "delete_response" && !hasRpePermission(access, "rpe_individual")) {
    return NextResponse.json({ error: "Droit sur les données individuelles requis." }, { status: 403 });
  }

  if (action === "save_plan") {
    const planDate = String(body?.planDate || "");
    if (!planDate) return NextResponse.json({ error: "Date manquante." }, { status: 400 });
    const { error } = await admin.from("team_load_plans").upsert(
      {
        team_id: teamId,
        plan_date: planDate,
        duration_minutes: Number(body?.durationMinutes || 0),
        planned_rpe: Number(body?.plannedRpe || 0),
        load_type: String(body?.loadType || "basket"),
        note: body?.note ? String(body.note) : null,
        created_by: access.userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "team_id,plan_date" },
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (action === "clear_plan") {
    const { error } = await admin.from("team_load_plans").delete().eq("team_id", teamId).eq("plan_date", String(body?.planDate || ""));
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (action === "reset_week") {
    const weekStart = String(body?.weekStart || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json({ error: "Début de semaine invalide." }, { status: 400 });
    }
    const start = new Date(`${weekStart}T12:00:00Z`);
    const end = new Date(start);
    end.setUTCDate(end.getUTCDate() + 6);
    const endIso = end.toISOString().slice(0, 10);
    const { error } = await admin
      .from("team_load_plans")
      .delete()
      .eq("team_id", teamId)
      .gte("plan_date", weekStart)
      .lte("plan_date", endIso);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (action === "copy_previous_week") {
    const weekStart = String(body?.weekStart || "");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekStart)) {
      return NextResponse.json({ error: "Début de semaine invalide." }, { status: 400 });
    }

    const currentStart = new Date(`${weekStart}T12:00:00Z`);
    const currentEnd = new Date(currentStart);
    currentEnd.setUTCDate(currentEnd.getUTCDate() + 6);
    const previousStart = new Date(currentStart);
    previousStart.setUTCDate(previousStart.getUTCDate() - 7);
    const previousEnd = new Date(currentStart);
    previousEnd.setUTCDate(previousEnd.getUTCDate() - 1);

    const prevStartIso = previousStart.toISOString().slice(0, 10);
    const prevEndIso = previousEnd.toISOString().slice(0, 10);
    const currentEndIso = currentEnd.toISOString().slice(0, 10);

    const { data: previousPlans, error: readError } = await admin
      .from("team_load_plans")
      .select("plan_date,duration_minutes,planned_rpe,load_type,note")
      .eq("team_id", teamId)
      .gte("plan_date", prevStartIso)
      .lte("plan_date", prevEndIso)
      .order("plan_date");

    if (readError) return NextResponse.json({ error: readError.message }, { status: 400 });
    if (!previousPlans?.length) {
      return NextResponse.json(
        { error: "Aucun RPE théorique trouvé sur la semaine précédente." },
        { status: 404 },
      );
    }

    const { error: deleteError } = await admin
      .from("team_load_plans")
      .delete()
      .eq("team_id", teamId)
      .gte("plan_date", weekStart)
      .lte("plan_date", currentEndIso);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 400 });

    const rows = previousPlans.map((plan: any) => {
      const source = new Date(`${String(plan.plan_date)}T12:00:00Z`);
      source.setUTCDate(source.getUTCDate() + 7);
      return {
        team_id: teamId,
        plan_date: source.toISOString().slice(0, 10),
        duration_minutes: Number(plan.duration_minutes || 0),
        planned_rpe: Number(plan.planned_rpe || 0),
        load_type: String(plan.load_type || "basket"),
        note: plan.note || null,
        created_by: access.userId,
        updated_at: new Date().toISOString(),
      };
    });

    const { error: copyError } = await admin
      .from("team_load_plans")
      .upsert(rows, { onConflict: "team_id,plan_date" });
    if (copyError) return NextResponse.json({ error: copyError.message }, { status: 400 });
  } else if (action === "save_load") {
    const { error } = await admin.from("training_load_entries").insert({
      team_id: teamId,
      player_id: body?.playerId ? String(body.playerId) : null,
      load_date: String(body?.loadDate || ""),
      duration_minutes: Number(body?.durationMinutes || 0),
      planned_rpe: Number(body?.plannedRpe || 0),
      actual_rpe: body?.actualRpe == null ? null : Number(body.actualRpe),
      load_type: String(body?.loadType || "basket"),
      source: "staff",
      created_by: access.userId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (action === "create_link") {
    const kind = body?.kind === "wellness" ? "wellness" : "post_session";
    const { error } = await admin.from("team_wellness_links").insert({
      team_id: teamId,
      response_kind: kind,
      title: kind === "post_session" ? "Questionnaire après séance" : "Questionnaire récupération",
      created_by: access.userId,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (action === "regenerate_link") {
    const { error } = await admin.from("team_wellness_links").update({ token: crypto.randomUUID(), updated_at: new Date().toISOString() }).eq("id", String(body?.linkId || "")).eq("team_id", teamId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (action === "toggle_link") {
    const { error } = await admin.from("team_wellness_links").update({ enabled: body?.enabled === true, updated_at: new Date().toISOString() }).eq("id", String(body?.linkId || "")).eq("team_id", teamId);
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  } else if (action === "delete_response") {
    const responseId = String(body?.responseId || "");
    const { data, error } = await admin.rpc("delete_player_wellness_response", { p_response_id: responseId });
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    const result = (data || {}) as { ok?: boolean; message?: string };
    if (result.ok === false) return NextResponse.json({ error: result.message || "Suppression impossible." }, { status: 400 });
  } else {
    return NextResponse.json({ error: "Action RPE inconnue." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
