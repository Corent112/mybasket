import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { averageOtherPlayers, evaluateRpe } from "@/lib/rpe/engine";
import { sendCriticalRpeAlert, sendWellnessPainAlert } from "@/lib/rpe/notifications";

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
      const painZones = Array.isArray(body?.painZones)
        ? body.painZones.map((value: unknown) => String(value)).slice(0, 20)
        : [];
      const painDetails =
        body?.painDetails && typeof body.painDetails === "object" && !Array.isArray(body.painDetails)
          ? body.painDetails
          : {};

      const { error: injuredError } = await admin
        .from("player_wellness_responses")
        .update({
          is_injured: injured,
          pain_zones: painZones,
          pain_details: painDetails,
        })
        .eq("id", savedResponse.id);

      if (injuredError) {
        // Compatibilité pendant le déploiement de la migration additive :
        // l'ancien wellness continue de fonctionner même si les nouvelles
        // colonnes de cartographie corporelle ne sont pas encore disponibles.
        if (/pain_zones|pain_details/i.test(injuredError.message || "")) {
          const { error: fallbackError } = await admin
            .from("player_wellness_responses")
            .update({ is_injured: injured })
            .eq("id", savedResponse.id);
          if (fallbackError) {
            return NextResponse.json({ error: fallbackError.message }, { status: 400 });
          }
        } else {
          return NextResponse.json({ error: injuredError.message }, { status: 400 });
        }
      }
    }

    if (responseKind !== "post_session") {
      const currentZones = Array.isArray(body?.painZones) ? body.painZones.map((value: unknown) => String(value)) : [];
      const currentDetails = body?.painDetails && typeof body.painDetails === "object" && !Array.isArray(body.painDetails) ? body.painDetails as Record<string, any> : {};

      if (currentZones.length && savedResponse?.id) {
        const { data: previous } = await admin
          .from("player_wellness_responses")
          .select("pain_zones,pain_details,response_date,created_at")
          .eq("team_id", link.team_id)
          .eq("player_id", playerId)
          .eq("response_kind", responseKind)
          .neq("id", savedResponse.id)
          .order("response_date", { ascending: false })
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        const previousZones = Array.isArray(previous?.pain_zones) ? previous.pain_zones.map(String) : [];
        const previousDetails = previous?.pain_details && typeof previous.pain_details === "object" && !Array.isArray(previous.pain_details) ? previous.pain_details as Record<string, any> : {};
        const zoneLabels: Record<string, string> = {
          head_front:"Tête / visage", neck_front:"Cou", shoulder_left_front:"Épaule gauche", shoulder_right_front:"Épaule droite", chest_front:"Thorax", plexus_front:"Plexus", abdomen_front:"Abdominaux", elbow_left_front:"Coude gauche", elbow_right_front:"Coude droit", wrist_left_front:"Poignet / main gauche", wrist_right_front:"Poignet / main droite", hip_left_front:"Hanche gauche", hip_right_front:"Hanche droite", thigh_left_front:"Cuisse gauche", thigh_right_front:"Cuisse droite", knee_left_front:"Genou gauche", knee_right_front:"Genou droit", calf_left_front:"Mollet gauche", calf_right_front:"Mollet droit", ankle_left_front:"Cheville / pied gauche", ankle_right_front:"Cheville / pied droit", head_back:"Arrière de la tête", neck_back:"Nuque", shoulder_left_back:"Épaule gauche (dos)", shoulder_right_back:"Épaule droite (dos)", upper_back:"Haut du dos", lower_back:"Lombaires", elbow_left_back:"Coude gauche (dos)", elbow_right_back:"Coude droit (dos)", wrist_left_back:"Poignet / main gauche (dos)", wrist_right_back:"Poignet / main droite (dos)", glute_left:"Fessier gauche", glute_right:"Fessier droit", hamstring_left:"Ischio gauche", hamstring_right:"Ischio droit", knee_left_back:"Genou gauche (arrière)", knee_right_back:"Genou droit (arrière)", calf_left:"Mollet gauche", calf_right:"Mollet droit", ankle_left_back:"Cheville / pied gauche (dos)", ankle_right_back:"Cheville / pied droit (dos)"
        };
        const alerts = currentZones.flatMap((zoneId: string) => {
          const intensity = Number(currentDetails?.[zoneId]?.intensity || 0);
          const wasPresent = previousZones.includes(zoneId);
          const previousIntensity = wasPresent ? Number(previousDetails?.[zoneId]?.intensity || 0) : null;
          if (!wasPresent) return [{ label: zoneLabels[zoneId] || zoneId, intensity, previousIntensity: null, reason: "new" as const }];
          if (previousIntensity !== null && intensity >= previousIntensity + 2) return [{ label: zoneLabels[zoneId] || zoneId, intensity, previousIntensity, reason: "increase" as const }];
          return [];
        });

        if (alerts.length) {
          const [{ data: team }, { data: player }] = await Promise.all([
            admin.from("teams").select("name").eq("id", link.team_id).maybeSingle(),
            admin.from("players").select("first_name,last_name").eq("id", playerId).maybeSingle(),
          ]);
          await sendWellnessPainAlert({
            teamId: String(link.team_id),
            teamName: String(team?.name || "Équipe"),
            playerName: [player?.first_name, player?.last_name].filter(Boolean).join(" ") || "Joueur",
            responseDate,
            zones: alerts,
          });
        }
      }

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
