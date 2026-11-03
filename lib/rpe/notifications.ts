import { renderDailyDigest } from "@/lib/rpe/daily-digest";
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
        <div style="font-size:12px;line-height:16px;font-weight:900;letter-spacing:.14em;color:#E8C681">MYBASKET · RPE & WELLNESS</div>
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

export async function sendWellnessPainAlert(input: {
  teamId: string;
  teamName: string;
  playerName: string;
  responseDate: string;
  zones: Array<{ label: string; intensity: number; previousIntensity: number | null; reason: "new" | "increase" }>;
}) {
  const admin = createAdminClient();
  if (!admin || !input.zones.length) return;

  const recipients = await alertRecipients(input.teamId, false);
  if (!recipients.length) return;

  const { data: team } = await admin.from("teams").select("*").eq("id", input.teamId).maybeSingle();
  const teamLogo = teamLogoFromRow(team);
  const href = `${appUrl()}/equipes/${encodeURIComponent(input.teamId)}?tab=load`;
  const isIncrease = input.zones.some((zone) => zone.reason === "increase");
  const headline = isIncrease ? "Alerte douleur — Aggravation" : "Alerte douleur — Nouvelle douleur";
  const intro = isIncrease
    ? "Une douleur déclarée par un joueur est plus élevée que lors du dernier relevé."
    : "Une nouvelle zone douloureuse vient d’être déclarée par un joueur.";

  const rows = input.zones.map((zone) => {
    const delta = zone.previousIntensity == null ? null : zone.intensity - zone.previousIntensity;
    const reason = zone.reason === "new"
      ? "Nouvelle douleur"
      : `Aggravation (+${delta})`;
    const previous = zone.previousIntensity == null ? "—" : `${zone.previousIntensity}/10`;
    return `<tr>
      <td style="padding:14px 10px;border-bottom:1px solid #EEE6E1;font-size:13px;font-weight:900;color:#241D1A">${esc(zone.label)}</td>
      <td align="center" style="padding:14px 8px;border-bottom:1px solid #EEE6E1;font-size:20px;font-weight:900;color:#B42318">${esc(zone.intensity)}/10</td>
      <td align="center" style="padding:14px 8px;border-bottom:1px solid #EEE6E1;font-size:13px;color:#625650">${esc(previous)}</td>
      <td style="padding:14px 10px;border-bottom:1px solid #EEE6E1;font-size:12px;font-weight:800;color:#9B1C31">${esc(reason)}</td>
    </tr>`;
  }).join("");

  const html = `<!doctype html>
<html><body style="margin:0;padding:0;background:#F3EFEC;font-family:Arial,Helvetica,sans-serif;color:#241D1A">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F3EFEC">
<tr><td align="center" style="padding:28px 12px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:680px;background:#FFFFFF;border-radius:22px;overflow:hidden;box-shadow:0 16px 45px rgba(52,25,20,.12)">
<tr><td style="background:#6B1A2C;padding:26px 30px">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
<td valign="middle">
<div style="font-size:12px;line-height:16px;font-weight:900;letter-spacing:.14em;color:#E8C681">MYBASKET · WELLNESS</div>
<div style="margin-top:8px;font-size:27px;line-height:32px;font-weight:900;color:#FFFFFF">${esc(headline)}</div>
<div style="margin-top:5px;font-size:13px;color:#EBDDE1">${esc(input.teamName)} · ${esc(frDate(input.responseDate))}</div>
</td>
<td width="94" align="right" valign="middle">${teamLogoHtml(input.teamName, teamLogo)}</td>
</tr></table>
</td></tr>
<tr><td style="height:5px;background:#D4A24C"></td></tr>

<tr><td style="padding:28px 30px 10px">
<div style="padding:18px 20px;border-radius:16px;background:#FFF4F3;border:1px solid #F1C7C3">
<div style="font-size:11px;font-weight:900;letter-spacing:.11em;color:#B42318">POINT D’ATTENTION WELLNESS</div>
<div style="margin-top:8px;font-size:21px;font-weight:900;color:#241D1A">${esc(input.playerName)}</div>
<div style="margin-top:7px;font-size:14px;line-height:21px;color:#625650">${esc(intro)}</div>
</div>
</td></tr>

<tr><td style="padding:15px 30px">
<table width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;border:1px solid #EEE6E1;border-radius:14px">
<thead><tr style="background:#FBF8F6">
<th align="left" style="padding:11px 10px;font-size:10px;color:#8B7D76">ZONE</th>
<th style="padding:11px 8px;font-size:10px;color:#8B7D76">AUJOURD’HUI</th>
<th style="padding:11px 8px;font-size:10px;color:#8B7D76">PRÉCÉDENT</th>
<th align="left" style="padding:11px 10px;font-size:10px;color:#8B7D76">ALERTE</th>
</tr></thead><tbody>${rows}</tbody>
</table>
</td></tr>

<tr><td style="padding:4px 30px 14px">
<div style="padding:17px;border-radius:15px;background:#FFF8F1;border:1px solid #F0DAC0">
<div style="font-size:11px;font-weight:900;letter-spacing:.1em;color:#A56300">RÈGLE D’ALERTE</div>
<div style="margin-top:8px;font-size:13px;line-height:20px;color:#625650">Une alerte est envoyée pour une <strong>nouvelle douleur</strong> ou lorsqu’une douleur déjà présente augmente d’au moins <strong>2 points</strong>. Une douleur stable, en baisse ou en hausse de seulement 1 point ne déclenche aucun email.</div>
</div>
</td></tr>

<tr><td align="center" style="padding:10px 30px 30px">
<a href="${esc(href)}" style="display:inline-block;background:#6B1A2C;color:#FFFFFF;text-decoration:none;border-radius:999px;padding:14px 24px;font-size:13px;font-weight:900">VOIR LE SUIVI DU JOUEUR →</a>
</td></tr>

<tr><td style="background:#FBF8F6;padding:18px 28px;text-align:center;border-top:1px solid #EFE6E0">
<div style="font-size:12px;font-weight:900;color:#6B1A2C">MYBASKET</div>
<div style="margin-top:5px;font-size:11px;line-height:17px;color:#958780">Email envoyé automatiquement à la suite du questionnaire Wellness. Ces informations sont des indicateurs de suivi et ne constituent pas un diagnostic médical.</div>
</td></tr>
</table></td></tr></table></body></html>`;

  for (const recipient of recipients) {
    if (!recipient.emailEnabled || !recipient.email) continue;
    try {
      await sendTransactionalEmail({
        to: recipient.email,
        from: "MyBasket <contact@mybasket.fr>",
        subject: `🔴 ${headline} — ${input.playerName} · ${input.teamName}`,
        html,
      });
    } catch (error) {
      console.error("Email alerte douleur impossible", error);
    }
  }
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

export async function sendWellnessDailyDigest(input: {
  teamId: string;
  teamName: string;
  responseDate: string;
}) {
  const admin = createAdminClient();
  if (!admin) return { sent: 0, skipped: 0 };

  const results = await Promise.all([
    admin.from("teams").select("*").eq("id", input.teamId).maybeSingle(),
    admin.from("players").select("id,first_name,last_name").eq("team_id", input.teamId).order("last_name"),
    admin.from("player_wellness_responses")
      .select("player_id,fatigue,sleep,stress,comment,pain_zones,pain_details,created_at")
      .eq("team_id", input.teamId).eq("response_kind", "wellness").eq("response_date", input.responseDate)
      .order("created_at", { ascending: true }),
  ]);
  for (const result of results) if (result.error) throw result.error;
  const team = results[0].data;
  const players = results[1].data || [];
  const responses = results[2].data || [];
  if (!responses.length || !players.length) return { sent: 0, skipped: 0 };
  const html = renderDailyDigest({
    ...input, kind: "wellness", players, responses,
    teamLogo: teamLogoFromRow(team),
    href: `${appUrl()}/equipes/${encodeURIComponent(input.teamId)}?tab=load`,
  });

  const recipients=await alertRecipients(input.teamId,true); let sent=0,skipped=0;
  for(const recipient of recipients){
    if(!recipient.emailEnabled||!recipient.email){skipped++;continue;}
    const {data:existing}=await admin.from("rpe_digest_deliveries").select("id,status").eq("team_id",input.teamId).eq("response_date",input.responseDate).eq("response_kind","wellness").eq("user_id",recipient.userId).maybeSingle();
    if(existing?.status==="sent"){skipped++;continue;}
    const delivery=existing?.id?existing:(await admin.from("rpe_digest_deliveries").insert({team_id:input.teamId,response_date:input.responseDate,response_kind:"wellness",user_id:recipient.userId,status:"pending"}).select("id,status").maybeSingle()).data;
    if(!delivery?.id){skipped++;continue;}
    try{const result=await sendTransactionalEmail({to:recipient.email,from:"MyBasket <contact@mybasket.fr>",subject:`Wellness — ${input.teamName} — bilan du matin`,html});if(!result.sent)throw new Error(String(result.reason||"Email non envoyé"));await admin.from("rpe_digest_deliveries").update({status:"sent",sent_at:new Date().toISOString()}).eq("id",delivery.id);sent++;}catch(error){await admin.from("rpe_digest_deliveries").update({status:"failed",error_message:error instanceof Error?error.message:"Erreur",updated_at:new Date().toISOString()}).eq("id",delivery.id);}
  }
  return {sent,skipped};
}

export async function sendRpeDailyDigest(input: {
  teamId: string;
  teamName: string;
  responseDate: string;
}) {
  const admin = createAdminClient();
  if (!admin) return { sent: 0, skipped: 0 };

  const results = await Promise.all([
    admin.from("teams").select("*").eq("id", input.teamId).maybeSingle(),
    admin.from("players").select("id,first_name,last_name,photo_url")
      .eq("team_id", input.teamId).order("last_name"),
    admin.from("player_wellness_responses")
      .select("player_id,rpe,duration_minutes,comment,pain_zones,pain_details,is_injured,created_at")
      .eq("team_id", input.teamId).eq("response_kind", "post_session")
      .eq("response_date", input.responseDate).order("created_at", { ascending: true }),
    admin.from("team_load_plans").select("planned_rpe")
      .eq("team_id", input.teamId).eq("plan_date", input.responseDate).maybeSingle(),
    admin.from("player_wellness_responses")
      .select("player_id,fatigue,sleep,stress,comment,pain_zones,pain_details,created_at")
      .eq("team_id", input.teamId).eq("response_kind", "wellness")
      .eq("response_date", input.responseDate).order("created_at", { ascending: true }),
  ]);
  // A failed morning query must not become a fabricated "no pain/no response".
  for (const result of results) if (result.error) throw result.error;
  const team = results[0].data;
  const players = results[1].data || [];
  const responses = results[2].data || [];
  const plan = results[3].data;
  const wellnessResponses = results[4].data || [];
  if (!players.length || !responses.length) return { sent: 0, skipped: 0 };
  const recipients = await alertRecipients(input.teamId, true);
  if (!recipients.length) return { sent: 0, skipped: 0 };
  const digestHtml = renderDailyDigest({
    ...input, kind: "post_session", players, responses, wellnessResponses,
    plannedRpe: plan?.planned_rpe, teamLogo: teamLogoFromRow(team),
    href: `${appUrl()}/equipes/${encodeURIComponent(input.teamId)}?tab=load`,
  });

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

    // Seul un envoi réellement terminé est terminal.
    // Un "pending" laissé par une exécution interrompue doit pouvoir être repris.
    if (existingDelivery?.status === "sent") {
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

    if (existingDelivery?.status === "failed" || existingDelivery?.status === "pending") {
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
        subject: `RPE & Wellness — ${input.teamName} — bilan du ${frDate(
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
