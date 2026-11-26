import type { SupabaseClient } from "@supabase/supabase-js";
import { sendTransactionalEmail } from "@/lib/server-notifications";
import { getSiteUrl } from "@/lib/site-url";
import { sendMessagePush } from "./push-server";

export async function notifyMessageRecipients(db: SupabaseClient, userIds: string[], input: { title: string; conversationId: string }) {
  const recipients = [...new Set(userIds)];
  const email = async () => {
    if (!process.env.RESEND_API_KEY || !process.env.RESEND_FROM) return;
    const url = new URL("/mon-compte?tab=messagerie", getSiteUrl());
    const subject = "Nouveau message sur MyBasket";
    const text = `Tu as reçu un nouveau message. Ouvre ta messagerie pour le lire : ${url.href}`;
    const html = `<p>Tu as reçu un nouveau message sur MyBasket.</p><p><a href="${url.href}">Ouvrir ma messagerie</a></p>`;
    for (let index = 0; index < recipients.length; index += 2) {
      await Promise.allSettled(recipients.slice(index, index + 2).map(async id => {
        const { data: { user } } = await db.auth.admin.getUserById(id);
        if (user?.email && user.email_confirmed_at) await sendTransactionalEmail({ to: user.email, subject, text, html });
      }));
    }
  };
  await Promise.allSettled([sendMessagePush(db, recipients, input), email()]);
}
