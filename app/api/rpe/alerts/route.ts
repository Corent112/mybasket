import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { getTeamRpeAccess, hasRpePermission } from "@/lib/rpe/access";
import { averageOtherPlayers, evaluateRpe } from "@/lib/rpe/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const teamId = request.nextUrl.searchParams.get("teamId") || "";
  if (!teamId) return NextResponse.json({ error: "teamId manquant" }, { status: 400 });

  const access = await getTeamRpeAccess(teamId);
  if (!access.allowed) return NextResponse.json({ error: "Accès Charge & RPE refusé." }, { status: 403 });

  const canIndividual = hasRpePermission(access, "rpe_individual");
  const canGroup = hasRpePermission(access, "rpe_group");
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "Configuration serveur indisponible." }, { status: 500 });

  const { data: latest } = await admin
    .from("player_wellness_responses")
    .select("response_date")
    .eq("team_id", teamId)
    .eq("response_kind", "post_session")
    .not("rpe", "is", null)
    .order("response_date", { ascending: false })
    .limit(1)
    .maybeSingle();

  const responseDate = String(latest?.response_date || new Date().toISOString().slice(0, 10));

  const [{ data: responses }, { data: players }, { data: plan }, { data: storedAlerts }] = await Promise.all([
    admin
      .from("player_wellness_responses")
      .select("id,player_id,rpe,created_at")
      .eq("team_id", teamId)
      .eq("response_kind", "post_session")
      .eq("response_date", responseDate)
      .not("rpe", "is", null)
      .order("created_at", { ascending: true }),
    admin.from("players").select("id,first_name,last_name").eq("team_id", teamId),
    admin.from("team_load_plans").select("planned_rpe").eq("team_id", teamId).eq("plan_date", responseDate).maybeSingle(),
    admin
      .from("rpe_alerts")
      .select("id,response_id,severity,acknowledged_at,acknowledged_by")
      .eq("team_id", teamId)
      .eq("response_date", responseDate),
  ]);

  const latestByPlayer = new Map<string, any>();
  for (const row of responses || []) latestByPlayer.set(String(row.player_id), row);
  const rows = Array.from(latestByPlayer.values());
  const byPlayer = new Map((players || []).map((p: any) => [String(p.id), p]));
  const alertByResponse = new Map((storedAlerts || []).map((a: any) => [String(a.response_id), a]));
  const targetRpe = plan?.planned_rpe == null ? null : Number(plan.planned_rpe);

  const evaluated = rows.map((row: any) => {
    const evaluation = evaluateRpe({
      rpeValue: Number(row.rpe),
      targetRpe,
      groupAverage: averageOtherPlayers(rows, String(row.player_id)),
    });
    const player: any = byPlayer.get(String(row.player_id));
    const stored: any = alertByResponse.get(String(row.id));
    return {
      id: stored?.id || null,
      responseId: row.id,
      playerId: row.player_id,
      playerName: canIndividual
        ? [player?.first_name, player?.last_name].filter(Boolean).join(" ") || "Joueur"
        : null,
      ...evaluation,
      acknowledgedAt: stored?.acknowledged_at || null,
    };
  });

  const counts = {
    normal: evaluated.filter((row) => row.severity === "normal").length,
    watch: evaluated.filter((row) => row.severity === "watch").length,
    alert: evaluated.filter((row) => row.severity === "alert").length,
  };

  return NextResponse.json({
    responseDate,
    answered: rows.length,
    totalPlayers: players?.length || 0,
    targetRpe: canGroup ? targetRpe : null,
    groupAverage: canGroup && rows.length
      ? Math.round((rows.reduce((sum, row: any) => sum + Number(row.rpe || 0), 0) / rows.length) * 10) / 10
      : null,
    counts,
    alerts: canIndividual ? evaluated.filter((row) => row.severity !== "normal") : [],
  });
}
