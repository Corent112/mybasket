import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function validWeekKey(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function authorizeTeamSessions(teamId: string) {
  const supabase = await createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Non connecté." }, { status: 401 }),
    };
  }

  const admin = createAdminClient();
  if (!admin) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "SUPABASE_SERVICE_ROLE_KEY manquant côté serveur." },
        { status: 500 },
      ),
    };
  }

  const { data: team, error: teamError } = await admin
    .from("teams")
    .select("id,user_id,metadata")
    .eq("id", teamId)
    .maybeSingle();

  if (teamError || !team) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: "Équipe introuvable." }, { status: 404 }),
    };
  }

  if (String(team.user_id) === user.id) {
    return { ok: true as const, admin, user, team };
  }

  const { data: allowed, error: permissionError } = await supabase.rpc(
    "team_member_has_permission",
    {
      p_team_id: teamId,
      p_permission: "sessions",
    },
  );

  if (permissionError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: permissionError.message }, { status: 500 }),
    };
  }

  if (allowed !== true) {
    return {
      ok: false as const,
      response: NextResponse.json(
        { error: "Tu n’as pas accès au plan d’entraînement de cette équipe." },
        { status: 403 },
      ),
    };
  }

  return { ok: true as const, admin, user, team };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await context.params;
  const weekKey = request.nextUrl.searchParams.get("weekKey") || "";

  if (!validWeekKey(weekKey)) {
    return NextResponse.json({ error: "Semaine invalide." }, { status: 400 });
  }

  const auth = await authorizeTeamSessions(teamId);
  if (!auth.ok) return auth.response;

  const metadata = isPlainObject(auth.team.metadata)
    ? auth.team.metadata
    : {};
  const weeklyPlans = isPlainObject(metadata.weekly_training_plans)
    ? metadata.weekly_training_plans
    : {};
  const library = Array.isArray(metadata.weekly_training_library)
    ? metadata.weekly_training_library
    : [];

  return NextResponse.json({
    weekKey,
    plan: isPlainObject(weeklyPlans[weekKey]) ? weeklyPlans[weekKey] : {},
    library,
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ teamId: string }> },
) {
  const { teamId } = await context.params;
  const body = await request.json().catch(() => ({}));

  const weekKey = String(body?.weekKey || "");
  if (!validWeekKey(weekKey)) {
    return NextResponse.json({ error: "Semaine invalide." }, { status: 400 });
  }

  if (!isPlainObject(body?.plan)) {
    return NextResponse.json({ error: "Plan invalide." }, { status: 400 });
  }

  const auth = await authorizeTeamSessions(teamId);
  if (!auth.ok) return auth.response;

  const metadata = isPlainObject(auth.team.metadata)
    ? { ...auth.team.metadata }
    : {};

  const weeklyPlans = isPlainObject(metadata.weekly_training_plans)
    ? { ...metadata.weekly_training_plans }
    : {};

  weeklyPlans[weekKey] = body.plan;

  metadata.weekly_training_plans = weeklyPlans;
  metadata.weekly_training_library = Array.isArray(body?.library)
    ? body.library.slice(0, 50)
    : [];

  const { error } = await auth.admin
    .from("teams")
    .update({
      metadata,
      updated_at: new Date().toISOString(),
    })
    .eq("id", teamId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, weekKey });
}
