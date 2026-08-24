import { createAdminClient } from "@/lib/supabase/admin-server";
import { sendTransactionalEmail } from "@/lib/server-notifications";
import { sendRpeExternalMessage } from "@/lib/rpe/external-messaging";
import type { RpeEvaluation } from "@/lib/rpe/engine";

type Recipient = {
  userId: string;
  email: string | null;
  phone: string | null;
  inApp: boolean;
  emailEnabled: boolean;
  external: boolean;
};

function esc(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

async function alertRecipients(teamId: string, digest = false): Promise<Recipient[]> {
  const admin = createAdminClient();
  if (!admin) return [];

  const [{ data: team }, { data: members }] = await Promise.all([
    admin.from("teams").select("user_id").eq("id", teamId).maybeSingle(),
    admin
      .from("team_members")
      .select("user_id,permissions,status")
      .eq("team_id", teamId)
      .eq("status", "active"),
  ]);

  const eligibleMembers = (members || []).filter((member: any) => {
    const p = member.permissions && typeof member.permissions === "object" ? member.permissions : {};
    return digest ? p.rpe_receive_digest === true : p.rpe_receive_alerts === true;
  });

  const memberIds = eligibleMembers.map((row: any) => String(row.user_id || "")).filter(Boolean);
  const ownerId = team?.user_id ? String(team.user_id) : "";
  const ids = [...new Set([ownerId, ...memberIds].filter(Boolean))];
  if (!ids.length) return [];

  const { data: profiles } = await admin.from("profiles").select("id,email").in("id", ids);
  const byId = new Map((profiles || []).map((row: any) => [String(row.id), row]));

  const memberRecipients = eligibleMembers.map((member: any) => {
    const p = member.permissions && typeof member.permissions === "object" ? member.permissions : {};
    const profile: any = byId.get(String(member.user_id));
    return {
      userId: String(member.user_id),
      email: profile?.email ? String(profile.email) : null,
      phone: null,
      inApp: p.rpe_channel_in_app !== false,
      emailEnabled: p.rpe_channel_email !== false,
      external: p.rpe_channel_external === true,
    };
  });

  if (!ownerId) return memberRecipients;

  const eventKey = digest ? "rpe.digest" : "rpe.alert";
  const { data: ownerPref } = await admin
    .from("notification_preferences")
    .select("email,in_app")
    .eq("user_id", ownerId)
    .eq("team_id", teamId)
    .eq("event_key", eventKey)
    .maybeSingle();
  const ownerProfile: any = byId.get(ownerId);

  return [
    {
      userId: ownerId,
      email: ownerProfile?.email ? String(ownerProfile.email) : null,
      phone: null,
      inApp: ownerPref?.in_app !== false,
      emailEnabled: ownerPref?.email !== false,
      external: false,
    },
    ...memberRecipients.filter((row) => row.userId !== ownerId),
  ];
}

export async function sendCriticalRpeAlert(input: {
  alertId: string;
  teamId: string;
  teamName: string;
  playerId: string;
  playerName: string;
  evaluation: RpeEvaluation;
}) {
  const admin = createAdminClient();
  if (!admin) return;

  const recipients = await alertRecipients(input.teamId, false);
  if (!recipients.length) return;

  const href = `/equipes/${input.teamId}?tab=load`;
  const title = `ALERTE RPE — ${input.teamName}`;
  const body = `${input.playerName} · RPE ${input.evaluation.rpeValue}/10 · attendu ${input.evaluation.targetRpe ?? "—"} · groupe ${input.evaluation.groupAverage ?? "—"}`;

  const { data: team } = await admin
    .from("teams")
    .select("user_id")
    .eq("id", input.teamId)
    .maybeSingle();

  let activityId: string | null = null;
  if (team?.user_id) {
    const { data: activity } = await admin
      .from("activity_log")
      .insert({
        actor_id: team.user_id,
        team_id: input.teamId,
        player_id: input.playerId,
        scope: "training",
        action_key: "rpe.alert",
        title,
        description: body,
        href,
        metadata: { rpe_alert_id: input.alertId, severity: "alert" },
      })
      .select("id")
      .maybeSingle();
    activityId = activity?.id ? String(activity.id) : null;
  }

  let anyEmail = false;
  let anyInApp = false;
  let anyExternal = false;

  for (const recipient of recipients) {
    if (recipient.inApp && activityId) {
      const { error } = await admin.from("user_notifications").insert({
        user_id: recipient.userId,
        activity_id: activityId,
        title,
        body,
        href,
        email_status: recipient.emailEnabled ? "pending" : "skipped",
      });
      if (!error) anyInApp = true;
    }

    if (recipient.emailEnabled && recipient.email) {
      try {
        const ev = input.evaluation;
        const html = `
          <div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#261d1a">
            <div style="background:#6B1A2C;color:white;padding:24px;border-radius:16px 16px 0 0">
              <small style="color:#D4A24C;font-weight:800">MYBASKET · ALERTE RPE</small>
              <h1 style="margin:7px 0 0">${esc(input.teamName)}</h1>
            </div>
            <div style="border:1px solid #eadfd8;border-top:0;padding:24px;border-radius:0 0 16px 16px">
              <h2 style="margin-top:0">${esc(input.playerName)} · ${ev.rpeValue}/10</h2>
              <p>Une valeur anormalement élevée vient d’être enregistrée.</p>
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px;border-bottom:1px solid #eee">Charge souhaitée</td><td style="text-align:right"><b>${ev.targetRpe ?? "—"}</b>${ev.targetDelta != null ? ` (${ev.targetDelta >= 0 ? "+" : ""}${ev.targetDelta})` : ""}</td></tr>
                <tr><td style="padding:8px;border-bottom:1px solid #eee">Moyenne des autres joueurs</td><td style="text-align:right"><b>${ev.groupAverage ?? "—"}</b>${ev.groupDelta != null ? ` (${ev.groupDelta >= 0 ? "+" : ""}${ev.groupDelta})` : ""}</td></tr>
              </table>
              <p style="color:#786a63;font-size:13px">MyBasket signale uniquement les données et les écarts. Ce message ne constitue pas un diagnostic médical.</p>
            </div>
          </div>`;
        await sendTransactionalEmail({
          to: recipient.email,
          from: "MyBasket <contact@mybasket.fr>",
          subject: `${title} · ${input.playerName}`,
          html,
        });
        anyEmail = true;
      } catch (error) {
        console.error("Email alerte RPE impossible", error);
      }
    }

    if (recipient.external) {
      const result = await sendRpeExternalMessage({
        phone: recipient.phone,
        message: `${title}\n${body}\nMyBasket signale uniquement un écart de charge.`,
      });
      if (result.sent) anyExternal = true;
    }
  }

  await admin
    .from("rpe_alerts")
    .update({
      in_app_sent_at: anyInApp ? new Date().toISOString() : null,
      email_sent_at: anyEmail ? new Date().toISOString() : null,
      external_sent_at: anyExternal ? new Date().toISOString() : null,
    })
    .eq("id", input.alertId);
}

export async function sendRpeDigestIfComplete(input: {
  teamId: string;
  teamName: string;
  responseDate: string;
}) {
  const admin = createAdminClient();
  if (!admin) return;

  const [{ data: players }, { data: responses }, { data: plan }] = await Promise.all([
    admin.from("players").select("id,first_name,last_name").eq("team_id", input.teamId),
    admin
      .from("player_wellness_responses")
      .select("player_id,rpe,created_at")
      .eq("team_id", input.teamId)
      .eq("response_kind", "post_session")
      .eq("response_date", input.responseDate)
      .not("rpe", "is", null)
      .order("created_at", { ascending: true }),
    admin
      .from("team_load_plans")
      .select("planned_rpe")
      .eq("team_id", input.teamId)
      .eq("plan_date", input.responseDate)
      .maybeSingle(),
  ]);

  if (!players?.length) return;
  const latest = new Map<string, any>();
  for (const row of responses || []) latest.set(String(row.player_id), row);
  if (latest.size < players.length) return;

  const recipients = await alertRecipients(input.teamId, true);
  if (!recipients.length) return;

  const values = Array.from(latest.values()).map((row: any) => Number(row.rpe || 0));
  const average = Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 10) / 10;
  const playerById = new Map(players.map((p: any) => [String(p.id), p]));

  const rows = Array.from(latest.entries())
    .map(([playerId, row]: any) => {
      const player: any = playerById.get(playerId);
      const target = plan?.planned_rpe == null ? null : Number(plan.planned_rpe);
      const delta = target == null ? null : Number(row.rpe) - target;
      return `<tr><td style="padding:7px;border-bottom:1px solid #eee">${esc([player?.first_name, player?.last_name].filter(Boolean).join(" ") || "Joueur")}</td><td style="text-align:center">${target ?? "—"}</td><td style="text-align:center"><b>${row.rpe}</b></td><td style="text-align:center">${delta == null ? "—" : `${delta >= 0 ? "+" : ""}${Math.round(delta * 10) / 10}`}</td></tr>`;
    })
    .join("");

  for (const recipient of recipients) {
    if (!recipient.emailEnabled || !recipient.email) continue;

    const { data: existingDelivery } = await admin
      .from("rpe_digest_deliveries")
      .select("id,status")
      .eq("team_id", input.teamId)
      .eq("response_date", input.responseDate)
      .eq("response_kind", "post_session")
      .eq("user_id", recipient.userId)
      .maybeSingle();

    if (existingDelivery?.status === "sent" || existingDelivery?.status === "pending") continue;

    const delivery = existingDelivery?.id
      ? existingDelivery
      : (
          await admin
            .from("rpe_digest_deliveries")
            .insert({
              team_id: input.teamId,
              response_date: input.responseDate,
              response_kind: "post_session",
              user_id: recipient.userId,
              status: "pending",
            })
            .select("id,status")
            .maybeSingle()
        ).data;

    if (!delivery?.id) continue;

    if (existingDelivery?.status === "failed") {
      await admin
        .from("rpe_digest_deliveries")
        .update({ status: "pending", error_message: null, updated_at: new Date().toISOString() })
        .eq("id", delivery.id);
    }

    try {
      await sendTransactionalEmail({
        to: recipient.email,
        from: "MyBasket <contact@mybasket.fr>",
        subject: `RPE — ${input.teamName} — ${input.responseDate}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:720px;margin:auto"><h1 style="color:#6B1A2C">RPE — ${esc(input.teamName)}</h1><p><b>Réponses :</b> ${latest.size}/${players.length} · <b>Moyenne groupe :</b> ${average} · <b>Charge souhaitée :</b> ${plan?.planned_rpe ?? "—"}</p><table style="width:100%;border-collapse:collapse"><thead><tr><th align="left">Joueur</th><th>Attendu</th><th>RPE</th><th>Écart</th></tr></thead><tbody>${rows}</tbody></table></div>`,
      });
      await admin
        .from("rpe_digest_deliveries")
        .update({ status: "sent", sent_at: new Date().toISOString() })
        .eq("id", delivery.id);
    } catch (error) {
      await admin
        .from("rpe_digest_deliveries")
        .update({ status: "failed", error_message: error instanceof Error ? error.message : "Erreur" })
        .eq("id", delivery.id);
    }
  }
}
