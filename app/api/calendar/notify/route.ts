import { verifiedPlayerMemberships } from "@/lib/calendar-access";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { teamMessagingContacts } from "@/lib/messaging/team-contacts";
import { sendMessagePush } from "@/lib/messaging/push-server";
import { sendTransactionalEmail } from "@/lib/server-notifications";
import { getSiteUrl } from "@/lib/site-url";
import { rateLimit } from "@/lib/security/rate-limit";
import { isSameOriginMutation } from "@/lib/security/request-origin";
const BUCKET = "calendar-notifications-private";
const capabilities = () => ({
  email: !!(process.env.RESEND_API_KEY && process.env.RESEND_FROM),
  push: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  sms: !!(
    process.env.TWILIO_ACCOUNT_SID &&
    process.env.TWILIO_AUTH_TOKEN &&
    process.env.TWILIO_FROM_NUMBER
  ),
});
export async function GET() {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  return user
    ? NextResponse.json(capabilities())
    : NextResponse.json({ error: "Non connecté" }, { status: 401 });
}
export async function POST(request: Request) {
  if (!isSameOriginMutation(request))
    return NextResponse.json({ error: "Origine invalide" }, { status: 403 });
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  if (!rateLimit(`calendar-notify:${user.id}`, 6, 60000).allowed)
    return NextResponse.json({ error: "Trop de demandes" }, { status: 429 });
  const body = await request.json().catch(() => ({}));
  const channels = Array.isArray(body.channels)
    ? [...new Set(body.channels)].filter((c): c is "email" | "push" | "sms" =>
        ["email", "push", "sms"].includes(String(c)),
      )
    : [];
  if (!channels.length)
    return NextResponse.json({ sent: 0, failed: 0, missing: 0 });
  const available = capabilities();
  if (channels.some((c) => !available[c]))
    return NextResponse.json(
      {
        error:
          "Un canal choisi n’est pas configuré. Le rendez-vous reste enregistré.",
      },
      { status: 503 },
    );
  const { data: event, error } = await db
    .from("calendar_events")
    .select("*")
    .eq("id", String(body.eventId || ""))
    .or(`user_id.eq.${user.id},owner_id.eq.${user.id}`)
    .maybeSingle();
  if (error || !event || !event.team_id)
    return NextResponse.json(
      { error: "Évènement introuvable" },
      { status: 404 },
    );
  const admin = createAdminClient();
  if (!admin)
    return NextResponse.json(
      { error: "Notifications indisponibles" },
      { status: 503 },
    );
  try {
    const access = await teamMessagingContacts(db, user.id, event.team_id);
    if (!access.canLinkPlayers)
      return NextResponse.json(
        { error: "Accès à l’effectif requis." },
        { status: 403 },
      );
    const ids = Array.isArray(event.assigned_player_ids)
      ? event.assigned_player_ids.map(String)
      : [];
    if (!ids.length)
      return NextResponse.json({ sent: 0, failed: 0, missing: 0 });
    const { data: players, error: playersError } = await admin
      .from("players")
      .select("*")
      .in("id", ids)
      .limit(100);
    if (playersError) throw new Error("Effectif indisponible");
    const memberships = await verifiedPlayerMemberships(admin, players || []);
    const eligiblePlayers = (players || []).filter((p) =>
      memberships.some((m) => m.id === p.id && m.team_id === event.team_id),
    );
    const linkedIds = eligiblePlayers
      .map((p) => p.metadata?.messagingUserId)
      .filter(Boolean);
    const { data: profiles } = linkedIds.length
      ? await admin.from("profiles").select("id,email").in("id", linkedIds)
      : { data: [] };
    const existing = await admin.storage.getBucket(BUCKET);
    if (existing.data?.public) throw new Error("Stockage indisponible");
    if (!existing.data) {
      const created = await admin.storage.createBucket(BUCKET, {
        public: false,
        fileSizeLimit: 4096,
      });
      if (created.error && !/already exists/i.test(created.error.message))
        throw new Error("Stockage indisponible");
    }
    const bucket = admin.storage.from(BUCKET);
    let sent = 0,
      failed = 0,
      missing = ids.length - eligiblePlayers.length,
      skipped = 0;
    const link = `${getSiteUrl(request)}/mon-compte?tab=calendrier`;
    const date = new Date(`${event.event_date}T12:00:00`).toLocaleDateString(
      "fr-FR",
    );
    const message = `Un évènement est prévu sur MyBasket le ${date}${event.start_time ? " à " + String(event.start_time).slice(0, 5) : ""}. Consulte ton calendrier : ${link}`;
    for (const player of eligiblePlayers) {
      const linked = player.metadata?.messagingUserId;
      const email =
        profiles?.find((p) => p.id === linked)?.email ||
        player.email ||
        player.metadata?.email;
      const rawPhone = String(
        player.phone ||
          player.metadata?.phone ||
          player.metadata?.telephone ||
          "",
      ).replace(/[\s.()-]/g, "");
      const phone = /^0[1-9]\d{8}$/.test(rawPhone)
        ? `+33${rawPhone.slice(1)}`
        : rawPhone;
      for (const channel of channels) {
        if (
          (channel === "email" &&
            (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))) ||
          (channel === "sms" && !/^\+[1-9]\d{7,14}$/.test(phone)) ||
          (channel === "push" && !linked)
        ) {
          missing++;
          continue;
        }
        const key =
          createHash("sha256")
            .update(`${event.id}:${event.updated_at}:${player.id}:${channel}`)
            .digest("hex") + ".json";
        const claim = await bucket.upload(
          key,
          JSON.stringify({
            eventId: event.id,
            status: "processing",
            at: new Date().toISOString(),
          }),
          { contentType: "application/json", upsert: false },
        );
        if (claim.error) {
          if (/exists|duplicate/i.test(claim.error.message)) {
            skipped++;
            continue;
          }
          failed++;
          continue;
        }
        let ok = false;
        try {
          if (channel === "email") {
            const result = await sendTransactionalEmail({
              to: email,
              subject: "Ton calendrier MyBasket a été mis à jour",
              text: message,
              html: `<p>Un évènement est prévu le ${date}${event.start_time ? " à " + String(event.start_time).slice(0, 5) : ""}.</p><p><a href="${link}">Consulter mon calendrier MyBasket</a></p>`,
            });
            ok = result.sent;
          }
          if (channel === "push")
            ok =
              (await sendMessagePush(admin, [linked], {
                title: "Calendrier MyBasket",
                conversationId: event.id,
                url: "/mon-compte?tab=calendrier",
                body: "Un évènement de ton calendrier a été ajouté ou modifié.",
                tag: `calendar-${event.id}`,
              })) > 0;
          if (channel === "sms") {
            const response = await fetch(
              `https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`,
              {
                method: "POST",
                headers: {
                  Authorization: `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64")}`,
                  "Content-Type": "application/x-www-form-urlencoded",
                },
                body: new URLSearchParams({
                  To: phone,
                  From: process.env.TWILIO_FROM_NUMBER!,
                  Body: message,
                }),
                signal: AbortSignal.timeout(10000),
              },
            );
            ok = response.ok;
          }
        } catch {
          ok = false;
        }
        if (ok) sent++;
        else failed++;
        await bucket.upload(
          key,
          JSON.stringify({
            eventId: event.id,
            status: ok ? "accepted" : "failed",
            at: new Date().toISOString(),
          }),
          { contentType: "application/json", upsert: true },
        );
      }
    }
    return NextResponse.json({ sent, failed, missing, skipped });
  } catch {
    return NextResponse.json(
      {
        error: "Notifications indisponibles. Le rendez-vous reste enregistré.",
      },
      { status: 503 },
    );
  }
}

export const maxDuration = 300;
