import { createClient } from "@/lib/supabase/server";
import { sendTransactionalEmail } from "@/lib/server-notifications";
import { isSameOriginMutation } from "@/lib/security/request-origin";
import { rateLimit } from "@/lib/security/rate-limit";

const email = /^[a-z\d.!#$%&'*+/=?^_`{|}~-]+@[a-z\d-]+(?:\.[a-z\d-]+)+$/i;
const escape = (text: string) => text.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");

export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return Response.json({ error: "Origine invalide." }, { status: 403 });
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user?.email || !user.email_confirmed_at) return Response.json({ error: "Connecte-toi avec une adresse e-mail confirmée." }, { status: 401 });
  const body = await request.json().catch(() => null);
  const to = typeof body?.to === "string" ? body.to.trim() : "";
  const subject = typeof body?.subject === "string" ? body.subject.trim() : "";
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!email.test(to) || to.length > 254 || !subject || subject.length > 140 || /[\r\n]/.test(subject) || !message || message.length > 5000) {
    return Response.json({ error: "Vérifie l’adresse, l’objet et le message." }, { status: 400 });
  }
  if (!rateLimit(`messaging-email:${user.id}`, 5, 60000).allowed) {
    return Response.json({ error: "Trop d’envois. Réessaie dans une minute." }, { status: 429 });
  }
  try {
    const result = await sendTransactionalEmail({
      to, subject, replyTo: user.email,
      text: `Message de ${user.email} via MyBasket\n\n${message}`,
      html: `<p>Message de ${escape(user.email)} via MyBasket</p><p style="white-space:pre-wrap">${escape(message)}</p>`,
    });
    if (result.sent) return Response.json({ ok: true });
  } catch {
    return Response.json({ error: "Le service e-mail n’a pas pu envoyer ce message." }, { status: 502 });
  }
  return Response.json({ error: "Le service e-mail est indisponible." }, { status: 503 });
}
