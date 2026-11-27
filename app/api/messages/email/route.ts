import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { sendTransactionalEmail } from "@/lib/server-notifications";
import { isSameOriginMutation } from "@/lib/security/request-origin";
import { rateLimit } from "@/lib/security/rate-limit";
import { getSiteUrl } from "@/lib/site-url";
import { messageNotificationEmail } from "@/lib/messaging/message-email";
import { messageBlocks } from "@/lib/messaging/inbox-controls";
import { GROUP_SUBJECT } from "@/lib/messaging/groups";

const email = /^[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d-]+(?:\.[a-z\d-]+)+$/i;

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return Response.json({ error: "Origine invalide." }, { status: 403 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user?.email || !user.email_confirmed_at) return Response.json({ error: "Connecte-toi avec une adresse e-mail confirmée." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const to = typeof body?.to === "string" ? body.to.trim().toLowerCase() : "";
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!email.test(to) || to.length > 254 || !subject || subject.length > 140 || /[\r\n]/.test(subject) || subject.startsWith(GROUP_SUBJECT) || !message || message.length > 5000) {
    return Response.json({ error: "Vérifie l’adresse, l’objet et le message." }, { status: 400 });
  }
  if (!rateLimit(`messaging-email:${user.id}`, 5, 60000).allowed) {
    return Response.json({ error: "Trop d’envois. Réessaie dans une minute." }, { status: 429 });
  }
  const admin = createAdminClient();
  if (!admin) return Response.json({ error: "Messagerie indisponible." }, { status: 503 });

  try {
    const [target, profile] = await Promise.all([
      admin.rpc("find_message_recipient", { p_email: to }),
      admin.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    ]);
    if (target.error || profile.error) throw target.error || profile.error;
    const recipientId = typeof target.data === "string" && target.data !== user.id ? target.data : null;

    const sender = profile.data?.display_name || user.email;
    const now = new Date().toISOString();
    let threadId: string = crypto.randomUUID();
    let existing = false;
    if (recipientId) {
      const blocks = await messageBlocks(admin, user.id);
      if (blocks.incoming.has(recipientId) || blocks.outgoing.has(recipientId)) {
        return Response.json({ error: "Ce destinataire ne peut pas recevoir ce message." }, { status: 403 });
      }
      const { data: previous, error } = await admin.from("platform_conversations")
        .select("id,subject")
        .or(`and(sender_user_id.eq.${user.id},recipient_user_id.eq.${recipientId}),and(sender_user_id.eq.${recipientId},recipient_user_id.eq.${user.id})`)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      const thread = previous?.find(row => !row.subject?.startsWith(GROUP_SUBJECT));
      if (thread) { threadId = thread.id; existing = true; }
    }

    if (existing) {
      const { error } = await admin.from("platform_conversation_replies").insert({
        conversation_id: threadId, sender_user_id: user.id, message, created_at: now,
      });
      if (error) throw error;
      const activity = await admin.from("platform_conversations").update({ updated_at: now }).eq("id", threadId).lt("updated_at", now);
      if (activity.error) console.error("Actualisation de la discussion impossible.", activity.error.code);
    } else {
      const { error } = await admin.from("platform_conversations").insert({
        id: threadId, conversation_type: "direct", subject, initial_message: message,
        sender_user_id: user.id, sender_name: sender, sender_email: user.email,
        recipient_user_id: recipientId, recipient_email: recipientId ? null : to,
        status: "open", created_at: now, updated_at: now,
      });
      if (error) throw error;
    }

    let emailSent = false;
    try {
      const template = messageNotificationEmail(getSiteUrl(), sender, {
        conversationId: recipientId ? threadId : undefined,
        replyEmail: recipientId ? undefined : user.email,
        subject, message, invitation: !existing,
      });
      emailSent = (await sendTransactionalEmail({ to, replyTo: user.email, ...template })).sent;
    } catch {
      // The saved MyBasket message remains available if delivery fails.
    }
    if (!emailSent && !recipientId) {
      const cleanup = await admin.from("platform_conversations").delete().eq("id", threadId).eq("sender_user_id", user.id);
      if (cleanup.error) console.error("Retrait de l’envoi externe non délivré impossible.", cleanup.error.code);
      return Response.json({ error: "Le service e-mail n’a pas pu envoyer ce message." }, { status: 502 });
    }
    return Response.json({ id: threadId, emailSent });
  } catch {
    return Response.json({ error: "Le message n’a pas pu être envoyé. Réessaie." }, { status: 503 });
  }
}
