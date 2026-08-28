import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { averageOtherPlayers, evaluateRpe } from "@/lib/rpe/engine";
import { sendCriticalRpeAlert } from "@/lib/rpe/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body?.token || "");
    const playerId = String(body?.playerId || "");
    const injured = body?.injured === true;

    if (!token || !playerId) {
      return NextResponse.json({ error: "Questionnaire ou joueur manquant." }, { status: 400 });
    }

    const admin = createAdminClient();
    if (!admin) {
      return NextResponse.json({ error: "Configuration serveur indisponible." }, { status: 500 });
    }

    const { data: link, error: linkError } = await admin
      .from("team_wellness_links")
      .select("id,team_id,response_kind,enabled")
      .eq("token", token)
      .maybeSingle();

    if (linkError || !link?.enabled || !link.team_id) {
      return NextResponse.json({ error: "Ce questionnaire n'est plus actif." }, { status: 404 });
    }

    const responseKind = String(link.response_kind || "post_session");
    const submittedAt = new Date();
    const responseDate = submittedAt.toISOString().slice(0, 10);

    const { data: rpcData, error: rpcError } = await admin.rpc("submit_team_wellness_response", {
      p_token: token,
      p_player_id: playerId,
      p_duration_minutes: responseKind === "post_session" ? Number(body?.duration || 0) : null,
      p_rpe: responseKind === "post_session" ? Number(body?.rpe || 0) : null,
      p_fatigue: Number(body?.fatigue || 0),
      p_soreness: Number(body?.soreness || 0),
      p_sleep: Number(body?.sleep || 0),
      p_stress: Number(body?.stress || 0),
      p_comment: String(body?.comment || "").trim() || null,
      p_load_type: responseKind === "post_session" ? String(body?.loadType || "basket") : null,
    });

    if (rpcError) {
      return NextResponse.json({ error: rpcError.message }, { status: 400 });
    }

    const rpcResult = (rpcData || {}) as { ok?: boolean; message?: string };
    if (rpcResult.ok === false) {
      return NextResponse.json({ error: rpcResult.message || "Réponse non enregistrée." }, { status: 400 });
    }

    // La RPC existante reste inchangée pour éviter toute cassure.
    // On marque simplement la réponse qu'elle vient d'enregistrer.
    const { data: savedResponse, error: savedResponseError } = await admin
      .from("player_wellness_responses")
      .select("id,team_id,player_id,response_date,response_kind,rpe,created_at,is_injured")
      .eq("team_id", link.team_id)
      .eq("player_id", playerId)
      .eq("response_kind", responseKind)
      .eq("response_date", responseDate)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (savedResponseError) {
      return NextResponse.json({ error: savedResponseError.message }, { status: 400 });
    }

    if (savedResponse?.id) {
      const { error: injuredError } = await admin
        .from("player_wellness_responses")
        .update({ is_injured: injured })
        .eq("id", savedResponse.id);

      if (injuredError) {
        return NextResponse.json({ error: injuredError.message }, { status: 400 });
      }
    }

    if (responseKind !== "post_session") {
      return NextResponse.json({ ok: true, injured });
    }

    // Un joueur blessé reste visible dans le récapitulatif, mais sa réponse
    // ne participe ni aux moyennes groupe ni aux alertes RPE comparatives.
    if (injured || !savedResponse?.id || savedResponse.rpe == null) {
      return NextResponse.json({ ok: true, injured, excludedFromGroupAverages: injured });
    }

    const [{ data: team }, { data: player }, { data: plan }, { data: dayResponses }] =
      await Promise.all([
        admin.from("teams").select("id,name").eq("id", link.team_id).maybeSingle(),
        admin.from("players").select("id,first_name,last_name,photo_url").eq("id", playerId).maybeSingle(),
        admin
          .from("team_load_plans")
          .select("planned_rpe")
          .eq("team_id", link.team_id)
          .eq("plan_date", responseDate)
          .maybeSingle(),
        admin
          .from("player_wellness_responses")
          .select("player_id,rpe,created_at,is_injured")
          .eq("team_id", link.team_id)
          .eq("response_kind", "post_session")
          .eq("response_date", responseDate)
          .eq("is_injured", false)
          .not("rpe", "is", null)
          .order("created_at", { ascending: true }),
      ]);

    const groupAverage = averageOtherPlayers((dayResponses || []) as any[], playerId);
    const targetRpe = plan?.planned_rpe == null ? null : Number(plan.planned_rpe);
    const evaluation = evaluateRpe({
      rpeValue: Number(savedResponse.rpe),
      targetRpe,
      groupAverage,
    });

    if (evaluation.severity !== "normal") {
      const { data: alert, error: alertError } = await admin
        .from("rpe_alerts")
        .upsert(
          {
            team_id: link.team_id,
            player_id: playerId,
            response_id: savedResponse.id,
            response_date: responseDate,
            rpe_value: evaluation.rpeValue,
            target_rpe: evaluation.targetRpe,
            group_average: evaluation.groupAverage,
            target_delta: evaluation.targetDelta,
            group_delta: evaluation.groupDelta,
            severity: evaluation.severity,
            triggered_at: new Date().toISOString(),
          },
          { onConflict: "response_id" },
        )
        .select("id")
        .maybeSingle();

      if (!alertError && alert?.id && evaluation.severity === "alert") {
        await sendCriticalRpeAlert({
          alertId: String(alert.id),
          teamId: String(link.team_id),
          teamName: String(team?.name || "Équipe"),
          playerId,
          playerName:
            [player?.first_name, player?.last_name].filter(Boolean).join(" ") || "Joueur",
          playerPhoto: player?.photo_url ? String(player.photo_url) : null,
          responseDate,
          evaluation,
        });
      }
    }

    return NextResponse.json({ ok: true, evaluation, injured: false });
  } catch (error) {
    console.error("RPE submit:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Réponse RPE impossible." },
      { status: 500 },
    );
  }
}
