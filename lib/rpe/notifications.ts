import { createAdminClient } from "@/lib/supabase/admin-server";
import { sendTransactionalEmail } from "@/lib/server-notifications";
import { sendRpeExternalMessage } from "@/lib/rpe/external-messaging";
import {
  averageOtherPlayers,
  evaluateRpe,
  type RpeEvaluation,
} from "@/lib/rpe/engine";

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

function appUrl() {
  return String(
    process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.NEXT_PUBLIC_APP_URL ||
      "https://mybasket.fr",
  ).replace(/\/$/, "");
}

function signed(value: number | null) {
  if (value == null) return "—";
  const n = Math.round(value * 10) / 10;
  return `${n > 0 ? "+" : ""}${n}`;
}

function frDate(value: string) {
  try {
    return new Intl.DateTimeFormat("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Paris",
    }).format(new Date(`${value}T12:00:00Z`));
  } catch {
    return value;
  }
}

function initials(name: string) {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .map((part) => part[0])
      .slice(0, 2)
      .join("")
      .toUpperCase() || "MB"
  );
}

function playerAvatarHtml(name: string, photo?: string | null) {
  if (photo && /^https?:\/\//i.test(photo)) {
    return `<img src="${esc(photo)}" alt="" width="88" height="88" style="display:block;width:88px;height:88px;border-radius:50%;object-fit:cover;border:4px solid #F2E8DF;box-shadow:0 6px 18px rgba(52,25,20,.12)" />`;
  }

  return `<div style="width:88px;height:88px;border-radius:50%;background:#F4ECE6;border:4px solid #F2E8DF;color:#6B1A2C;font-size:28px;line-height:88px;text-align:center;font-weight:900">${esc(initials(name))}</div>`;
}

function teamLogoFromRow(team: any): string | null {
  if (!team || typeof team !== "object") return null;

  const metadata =
    team.metadata && typeof team.metadata === "object" ? team.metadata : {};
  const data = team.data && typeof team.data === "object" ? team.data : {};

  const raw =
    team.club_logo_url ??
    team.logo_url ??
    metadata.club_logo_url ??
    metadata.logo_url ??
    metadata.logo ??
    data.club_logo_url ??
    data.logo_url ??
    data.logo ??
    null;

  const value = String(raw || "").trim();
  return value || null;
}

function teamLogoHtml(teamName: string, logo?: string | null) {
  if (logo && /^https?:\/\//i.test(logo)) {
    return `<img src="${esc(logo)}" alt="${esc(teamName)}" width="78" height="78" style="display:block;width:78px;height:78px;max-width:78px;max-height:78px;object-fit:contain;border-radius:18px;background:#FFFFFF;padding:5px;border:1px solid rgba(255,255,255,.25)" />`;
  }

  return `<div style="width:72px;height:72px;border-radius:18px;background:rgba(255,255,255,.10);border:1px solid rgba(255,255,255,.20);color:#D4A24C;font-size:20px;line-height:72px;text-align:center;font-weight:900">${esc(initials(teamName))}</div>`;
}

async function alertRecipients(
  teamId: string,
  digest = false,
): Promise<Recipient[]> {
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
    const p =
      member.permissions && typeof member.permissions === "object"
        ? member.permissions
        : {};

    return digest
      ? p.rpe_receive_digest === true
      : p.rpe_receive_alerts === true;
  });

  const memberIds = eligibleMembers
    .map((row: any) => String(row.user_id || ""))
    .filter(Boolean);

  const ownerId = team?.user_id ? String(team.user_id) : "";
  const ids = [...new Set([ownerId, ...memberIds].filter(Boolean))];
  if (!ids.length) return [];

  const { data: profiles } = await admin
    .from("profiles")
    .select("id,email")
    .in("id", ids);

  const byId = new Map(
    (profiles || []).map((row: any) => [String(row.id), row]),
  );

  const memberRecipients = eligibleMembers.map((member: any) => {
    const p =
      member.permissions && typeof member.permissions === "object"
        ? member.permissions
        : {};
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

function immediateAlertHtml(input: {
  teamId: string;
  teamName: string;
  teamLogo?: string | null;
  playerId: string;
  playerName: string;
  playerPhoto?: string | null;
  responseDate?: string | null;
  evaluation: RpeEvaluation;
}) {
  const ev = input.evaluation;
  const href = `${appUrl()}/equipes/${encodeURIComponent(input.teamId)}?tab=load`;

  const reasonTarget =
    ev.targetDelta == null
      ? "La charge prévue n’est pas renseignée."
      : `Le RPE déclaré est supérieur de <strong style="color:#6B1A2C">${esc(
          signed(ev.targetDelta),
        )} points</strong> à la charge prévue.`;

  const reasonGroup =
    ev.groupDelta == null
      ? "La moyenne des autres joueurs n’est pas encore disponible."
      : `Il est également supérieur de <strong style="color:#6B1A2C">${esc(
          signed(ev.groupDelta),
        )} points</strong> à la moyenne des autres joueurs ayant répondu.`;

  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#F3EFEC;font-family:Arial,Helvetica,sans-serif;color:#241D1A">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F3EFEC">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#FFFFFF;border-radius:22px;overflow:hidden;box-shadow:0 16px 45px rgba(52,25,20,.12)">
<tr>
  <td style="background:#6B1A2C;padding:26px 30px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0"><tr>
      <td valign="middle">
        <div style="font-size:12px;line-height:16px;font-weight:900;letter-spacing:.14em;color:#E8C681">MYBASKET · CHARGE & RPE</div>
        <div style="margin-top:8px;font-size:27px;line-height:32px;font-weight:900;color:#FFFFFF">Point d’attention élevé</div>
        <div style="margin-top:5px;font-size:13px;color:#EBDDE1">${esc(
          input.teamName,
        )}${
          input.responseDate
            ? ` · ${esc(frDate(input.responseDate))}`
            : ""
        }</div>
      </td>
      <td width="94" align="right" valign="middle">${teamLogoHtml(
        input.teamName,
        input.teamLogo,
      )}</td>
    </tr></table>
  </td>
</tr>
<tr><td style="height:5px;background:#D4A24C"></td></tr>

<tr><td align="center" style="padding:26px 26px 8px">
  ${playerAvatarHtml(input.playerName, input.playerPhoto)}
  <div style="margin-top:12px;font-size:20px;font-weight:900;color:#241D1A">${esc(
    input.playerName,
  )}</div>
  <div style="margin-top:18px;font-size:11px;font-weight:900;letter-spacing:.12em;color:#8A7A72">RPE RESSENTI</div>
  <div style="margin-top:2px;font-size:52px;line-height:58px;font-weight:900;color:#6B1A2C">${esc(
    ev.rpeValue,
  )}<span style="font-size:20px;color:#9B8E88"> / 10</span></div>
  <div style="display:inline-block;margin-top:8px;padding:7px 13px;border-radius:999px;background:#FFF0EF;color:#B42318;font-size:12px;font-weight:900">🔴 ALERTE ÉLEVÉE</div>
</td></tr>

<tr><td style="padding:18px 22px 6px">
  <table role="presentation" width="100%" cellspacing="8" cellpadding="0" border="0">
    <tr>
      <td width="50%" style="padding:17px;border:1px solid #E9DFD9;border-radius:15px;background:#FBF8F6;text-align:center">
        <div style="font-size:10px;font-weight:900;letter-spacing:.1em;color:#8B7D76">CHARGE PRÉVUE</div>
        <div style="margin-top:5px;font-size:24px;font-weight:900;color:#241D1A">${
          ev.targetRpe ?? "—"
        }<span style="font-size:13px;color:#8B7D76"> /10</span></div>
        <div style="margin-top:3px;color:#B42318;font-weight:900">${esc(
          signed(ev.targetDelta),
        )}</div>
      </td>
      <td width="50%" style="padding:17px;border:1px solid #E9DFD9;border-radius:15px;background:#FBF8F6;text-align:center">
        <div style="font-size:10px;font-weight:900;letter-spacing:.1em;color:#8B7D76">MOYENNE DES AUTRES</div>
        <div style="margin-top:5px;font-size:24px;font-weight:900;color:#241D1A">${
          ev.groupAverage ?? "—"
        }<span style="font-size:13px;color:#8B7D76"> /10</span></div>
        <div style="margin-top:3px;color:#B42318;font-weight:900">${esc(
          signed(ev.groupDelta),
        )}</div>
      </td>
    </tr>
  </table>
</td></tr>

<tr><td style="padding:14px 30px">
  <div style="padding:20px;border-radius:16px;background:#FFF8F1;border:1px solid #F0DAC0">
    <div style="font-size:11px;font-weight:900;letter-spacing:.11em;color:#A56300">POURQUOI RECEVEZ-VOUS CE MAIL ?</div>
    <div style="margin-top:11px;font-size:14px;line-height:22px;color:#4C413C">${reasonTarget}</div>
    <div style="margin-top:7px;font-size:14px;line-height:22px;color:#4C413C">${reasonGroup}</div>
    <div style="margin-top:10px;font-size:13px;line-height:20px;color:#756760">Les deux seuils de vigilance définis dans MyBasket sont dépassés. Cette alerte permet au staff de porter son attention sur ce ressenti.</div>
  </div>
</td></tr>

<tr><td align="center" style="padding:14px 30px 28px">
  <a href="${esc(
    href,
  )}" style="display:inline-block;background:#6B1A2C;color:#FFFFFF;text-decoration:none;border-radius:999px;padding:14px 24px;font-size:13px;font-weight:900">VOIR LE SUIVI DANS MYBASKET →</a>
</td></tr>

<tr><td style="background:#FBF8F6;padding:18px 28px;text-align:center;border-top:1px solid #EFE6E0">
  <div style="font-size:12px;font-weight:900;color:#6B1A2C">MYBASKET</div>
  <div style="margin-top:5px;font-size:11px;line-height:17px;color:#958780">Cette notification présente des indicateurs de suivi de charge. Elle ne constitue pas un diagnostic médical.</div>
</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

export async function sendCriticalRpeAlert(input: {
  alertId: string;
  teamId: string;
  teamName: string;
  playerId: string;
  playerName: string;
  playerPhoto?: string | null;
  responseDate?: string | null;
  evaluation: RpeEvaluation;
}) {
  const admin = createAdminClient();
  if (!admin) return;

  const recipients = await alertRecipients(input.teamId, false);
  if (!recipients.length) return;

  const href = `/equipes/${input.teamId}?tab=load`;
  const title = `ALERTE RPE — ${input.teamName}`;
  const body = `${input.playerName} · RPE ${input.evaluation.rpeValue}/10 · prévu ${
    input.evaluation.targetRpe ?? "—"
  } · groupe ${input.evaluation.groupAverage ?? "—"}`;

  const { data: team } = await admin
    .from("teams")
    .select("*")
    .eq("id", input.teamId)
    .maybeSingle();

  const teamLogo = teamLogoFromRow(team);

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
        metadata: {
          rpe_alert_id: input.alertId,
          severity: "alert",
        },
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
        const result = await sendTransactionalEmail({
          to: recipient.email,
          from: "MyBasket <contact@mybasket.fr>",
          subject: `🔴 Point d’attention RPE — ${input.playerName} · ${input.teamName}`,
          html: immediateAlertHtml({
            ...input,
            teamLogo,
          }),
        });

        if (result.sent) anyEmail = true;
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

export async function sendRpeDailyDigest(input: {
  teamId: string;
  teamName: string;
  responseDate: string;
}) {
  const admin = createAdminClient();
  if (!admin) return { sent: 0, skipped: 0 };

  const [
    { data: team },
    { data: players },
    { data: responses },
    { data: plan },
    { data: storedAlerts },
  ] = await Promise.all([
    admin.from("teams").select("*").eq("id", input.teamId).maybeSingle(),
    admin
      .from("players")
      .select("id,first_name,last_name,photo_url")
      .eq("team_id", input.teamId)
      .order("last_name"),
    admin
      .from("player_wellness_responses")
      .select(
        "player_id,rpe,fatigue,soreness,sleep,stress,comment,created_at",
      )
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
    admin
      .from("rpe_alerts")
      .select("player_id,severity,email_sent_at,triggered_at")
      .eq("team_id", input.teamId)
      .eq("response_date", input.responseDate),
  ]);

  if (!players?.length) return { sent: 0, skipped: 0 };

  const latest = new Map<string, any>();
  for (const row of responses || []) {
    latest.set(String(row.player_id), row);
  }

  if (!latest.size) return { sent: 0, skipped: 0 };

  const recipients = await alertRecipients(input.teamId, true);
  if (!recipients.length) return { sent: 0, skipped: 0 };

  const target =
    plan?.planned_rpe == null ? null : Number(plan.planned_rpe);

  const teamLogo = teamLogoFromRow(team);
  const playerById = new Map(
    players.map((player: any) => [String(player.id), player]),
  );

  const allResponses = Array.from(latest.entries()).map(
    ([playerId, row]) => ({
      player_id: playerId,
      rpe: Number(row.rpe),
      created_at: row.created_at,
    }),
  );

  const evaluated = Array.from(latest.entries()).map(
    ([playerId, row]) => {
      const player: any = playerById.get(playerId);
      const groupAverage = averageOtherPlayers(allResponses, playerId);

      const evaluation = evaluateRpe({
        rpeValue: Number(row.rpe),
        targetRpe: target,
        groupAverage,
      });

      return {
        playerId,
        player,
        row,
        evaluation,
      };
    },
  );

  const values = evaluated.map((item) => Number(item.row.rpe || 0));
  const average =
    Math.round(
      (values.reduce((a, b) => a + b, 0) / values.length) * 10,
    ) / 10;

  const red = evaluated.filter(
    (item) => item.evaluation.severity === "alert",
  );
  const orange = evaluated.filter(
    (item) => item.evaluation.severity === "watch",
  );
  const green = evaluated.filter(
    (item) => item.evaluation.severity === "normal",
  );

  const missing = (players || []).filter(
    (player: any) => !latest.has(String(player.id)),
  );

  const storedByPlayer = new Map(
    (storedAlerts || []).map((row: any) => [
      String(row.player_id),
      row,
    ]),
  );

  const tableRows = evaluated
    .map(({ player, row, evaluation }) => {
      const status =
        evaluation.severity === "alert"
          ? "🔴"
          : evaluation.severity === "watch"
            ? "🟠"
            : "🟢";

      const name =
        [player?.first_name, player?.last_name]
          .filter(Boolean)
          .join(" ") || "Joueur";

      return `<tr>
        <td style="padding:10px 8px;border-bottom:1px solid #EEE6E1;font-size:13px;font-weight:700">${esc(
          name,
        )}</td>
        <td align="center" style="padding:10px 5px;border-bottom:1px solid #EEE6E1;font-size:13px">${
          target ?? "—"
        }</td>
        <td align="center" style="padding:10px 5px;border-bottom:1px solid #EEE6E1;font-size:14px;font-weight:900;color:#6B1A2C">${esc(
          row.rpe,
        )}</td>
        <td align="center" style="padding:10px 5px;border-bottom:1px solid #EEE6E1;font-size:13px">${esc(
          signed(evaluation.targetDelta),
        )}</td>
        <td align="center" style="padding:10px 5px;border-bottom:1px solid #EEE6E1;font-size:13px">${esc(
          signed(evaluation.groupDelta),
        )}</td>
        <td align="center" style="padding:10px 5px;border-bottom:1px solid #EEE6E1;font-size:16px">${status}</td>
      </tr>`;
    })
    .join("");

  const attentionBlocks = [...red, ...orange]
    .map(({ playerId, player, row, evaluation }) => {
      const isRed = evaluation.severity === "alert";
      const name =
        [player?.first_name, player?.last_name]
          .filter(Boolean)
          .join(" ") || "Joueur";

      const stored: any = storedByPlayer.get(playerId);

      const sentLabel =
        isRed && stored?.email_sent_at
          ? `<div style="margin-top:8px;font-size:11px;font-weight:800;color:#44704D">✓ Alerte immédiate déjà envoyée</div>`
          : "";

      const reason = isRed
        ? `RPE supérieur de ${esc(
            signed(evaluation.targetDelta),
          )} au prévu et de ${esc(
            signed(evaluation.groupDelta),
          )} à la moyenne des autres joueurs.`
        : `RPE supérieur de ${esc(
            signed(evaluation.targetDelta),
          )} à la charge prévue. L’écart au groupe (${esc(
            signed(evaluation.groupDelta),
          )}) reste sous le second seuil de +2.`;

      return `<div style="margin-top:12px;padding:16px;border-radius:15px;border:1px solid ${
        isRed ? "#F1C7C3" : "#F0D8A9"
      };background:${isRed ? "#FFF4F3" : "#FFF9ED"}">
        <table role="presentation" width="100%"><tr>
          <td valign="top">
            <div style="font-size:14px;font-weight:900;color:#241D1A">${
              isRed ? "🔴" : "🟠"
            } ${esc(name)}</div>
            <div style="margin-top:4px;font-size:12px;color:#71645E">${esc(
              reason,
            )}</div>
            ${sentLabel}
          </td>
          <td width="82" align="right" valign="top">
            <div style="font-size:24px;font-weight:900;color:#6B1A2C">${esc(
              row.rpe,
            )}<span style="font-size:12px;color:#8E8079">/10</span></div>
          </td>
        </tr></table>
      </div>`;
    })
    .join("");

  const missingNames = missing
    .map((player: any) =>
      [player.first_name, player.last_name]
        .filter(Boolean)
        .join(" "),
    )
    .filter(Boolean)
    .join(" · ");

  const href = `${appUrl()}/equipes/${encodeURIComponent(
    input.teamId,
  )}?tab=load`;

  const digestHtml = `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#171717;font-family:Arial,Helvetica,sans-serif;color:#FFFFFF">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#171717">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:760px;background:#1D1D1D;border-radius:22px;overflow:hidden;border:1px solid #3A302A">
<tr><td style="background:#6B1A2C;padding:27px 30px">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0">
    <tr>
      <td valign="middle">
        <div style="font-size:12px;font-weight:900;letter-spacing:.14em;color:#D4A24C">MYBASKET · CHARGE & RPE</div>
        <div style="margin-top:8px;font-size:30px;font-weight:900;color:#FFFFFF">Bilan du jour</div>
        <div style="margin-top:5px;font-size:13px;color:#EBDDE1">${esc(
          input.teamName,
        )} · ${esc(frDate(input.responseDate))}</div>
      </td>
      <td width="94" align="right" valign="middle">${teamLogoHtml(
        input.teamName,
        teamLogo,
      )}</td>
    </tr>
  </table>
</td></tr>
<tr><td style="height:5px;background:#D4A24C"></td></tr>

<tr><td style="padding:22px 22px 10px">
<table role="presentation" width="100%" cellspacing="7">
<tr>
<td width="25%" align="center" style="padding:14px 5px;border-radius:13px;background:#242424;border:1px solid #4A403A"><div style="font-size:22px;font-weight:900;color:#FFFFFF">${latest.size}/${players.length}</div><div style="font-size:9px;font-weight:900;color:#D4A24C;letter-spacing:.08em">RÉPONSES</div></td>
<td width="25%" align="center" style="padding:14px 5px;border-radius:13px;background:#242424;border:1px solid #4A403A"><div style="font-size:22px;font-weight:900;color:#FFFFFF">${average}</div><div style="font-size:9px;font-weight:900;color:#D4A24C;letter-spacing:.08em">RPE MOYEN</div></td>
<td width="25%" align="center" style="padding:14px 5px;border-radius:13px;background:#242424;border:1px solid #4A403A"><div style="font-size:22px;font-weight:900;color:#FFFFFF">${
    target ?? "—"
  }</div><div style="font-size:9px;font-weight:900;color:#D4A24C;letter-spacing:.08em">RPE PRÉVU</div></td>
<td width="25%" align="center" style="padding:14px 5px;border-radius:13px;background:#242424;border:1px solid #4A403A"><div style="font-size:22px;font-weight:900;color:#FFFFFF">${
    red.length + orange.length
  }</div><div style="font-size:9px;font-weight:900;color:#D4A24C;letter-spacing:.08em">ATTENTIONS</div></td>
</tr>
</table>
</td></tr>

<tr><td style="padding:12px 24px">
  <div style="font-size:11px;font-weight:900;letter-spacing:.1em;color:#D4A24C">TABLEAU ÉQUIPE</div>
  <table width="100%" cellspacing="0" cellpadding="0" style="margin-top:8px;border-collapse:collapse;color:#FFFFFF">
    <thead><tr style="background:#2B2928">
      <th align="left" style="padding:9px 8px;font-size:10px;color:#D9CCC5">Joueur</th>
      <th style="padding:9px 5px;font-size:10px;color:#D9CCC5">Prévu</th>
      <th style="padding:9px 5px;font-size:10px;color:#D9CCC5">RPE</th>
      <th style="padding:9px 5px;font-size:10px;color:#D9CCC5">vs prévu</th>
      <th style="padding:9px 5px;font-size:10px;color:#D9CCC5">vs groupe</th>
      <th style="padding:9px 5px;font-size:10px;color:#D9CCC5">Statut</th>
    </tr></thead>
    <tbody>${tableRows
      .replaceAll("#EEE6E1", "#403A36")
      .replaceAll("#6B1A2C", "#D4A24C")}</tbody>
  </table>
</td></tr>

<tr><td style="padding:12px 24px 6px">
  <div style="font-size:11px;font-weight:900;letter-spacing:.1em;color:#D4A24C">POINTS D’ATTENTION</div>
  ${
    attentionBlocks ||
    `<div style="margin-top:10px;padding:15px;border-radius:14px;background:#203126;color:#8ED49A;font-size:13px;font-weight:700">🟢 Aucun point d’attention aujourd’hui.</div>`
  }
</td></tr>

${
  missing.length
    ? `<tr><td style="padding:16px 24px 4px"><div style="padding:14px 16px;border-radius:14px;background:#292625;font-size:12px;color:#CBBDB6"><strong style="color:#FFFFFF">Sans réponse (${missing.length}) :</strong> ${esc(
        missingNames,
      )}</div></td></tr>`
    : ""
}

<tr><td style="padding:20px 24px">
  <div style="padding:17px;border-radius:15px;background:#242424;border:1px solid #4A403A">
    <div style="font-size:12px;font-weight:900;color:#FFFFFF">À retenir</div>
    <div style="margin-top:8px;font-size:12px;line-height:20px;color:#D7CBC5">🔴 ${
      red.length
    } alerte${red.length > 1 ? "s" : ""} élevée${
    red.length > 1 ? "s" : ""
  } · 🟠 ${orange.length} point${
    orange.length > 1 ? "s" : ""
  } d’attention · 🟢 ${green.length} dans la zone attendue · ⚪ ${
    missing.length
  } sans réponse</div>
  </div>
</td></tr>

<tr><td align="center" style="padding:5px 24px 28px">
  <a href="${esc(
    href,
  )}" style="display:inline-block;background:#6B1A2C;color:#FFFFFF;text-decoration:none;border-radius:999px;padding:14px 24px;font-size:13px;font-weight:900;border:1px solid #D4A24C">OUVRIR LE SUIVI DE CHARGE →</a>
</td></tr>

<tr><td style="background:#111111;padding:18px 28px;text-align:center;border-top:1px solid #3D3632">
  <div style="font-size:12px;font-weight:900;color:#D4A24C">MYBASKET</div>
  <div style="margin-top:5px;font-size:11px;line-height:17px;color:#A99D96">Ce rapport présente des indicateurs de suivi de charge et ne constitue pas un diagnostic médical.</div>
  <div style="margin-top:4px;font-size:10px;line-height:16px;color:#827872">Vous recevez cet email car vous êtes configuré pour recevoir le récapitulatif Charge & RPE de cette équipe.</div>
</td></tr>
</table>
</td></tr></table>
</body></html>`;

  let sent = 0;
  let skipped = 0;

  for (const recipient of recipients) {
    if (!recipient.emailEnabled || !recipient.email) {
      skipped += 1;
      continue;
    }

    const { data: existingDelivery } = await admin
      .from("rpe_digest_deliveries")
      .select("id,status")
      .eq("team_id", input.teamId)
      .eq("response_date", input.responseDate)
      .eq("response_kind", "post_session")
      .eq("user_id", recipient.userId)
      .maybeSingle();

    if (
      existingDelivery?.status === "sent" ||
      existingDelivery?.status === "pending"
    ) {
      skipped += 1;
      continue;
    }

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

    if (!delivery?.id) {
      skipped += 1;
      continue;
    }

    if (existingDelivery?.status === "failed") {
      await admin
        .from("rpe_digest_deliveries")
        .update({
          status: "pending",
          error_message: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);
    }

    try {
      const result = await sendTransactionalEmail({
        to: recipient.email,
        from: "MyBasket <contact@mybasket.fr>",
        subject: `RPE — ${input.teamName} — bilan du ${frDate(
          input.responseDate,
        )}`,
        html: digestHtml,
      });

      if (!result.sent) {
        throw new Error(String(result.reason || "Email non envoyé"));
      }

      await admin
        .from("rpe_digest_deliveries")
        .update({
          status: "sent",
          sent_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);

      sent += 1;
    } catch (error) {
      await admin
        .from("rpe_digest_deliveries")
        .update({
          status: "failed",
          error_message:
            error instanceof Error ? error.message : "Erreur",
          updated_at: new Date().toISOString(),
        })
        .eq("id", delivery.id);
    }
  }

  return { sent, skipped };
}
