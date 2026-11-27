const escapeHtml = (value: string) => value.replaceAll("&", "&amp;").replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export function messageNotificationEmail(siteUrl: string, sender: string, options: {
  conversationId?: string;
  subject?: string;
  message?: string;
  replyEmail?: string;
  invitation?: boolean;
} = {}) {
  const inbox = new URL("/mon-compte?tab=messagerie", siteUrl);
  if (options.conversationId) inbox.searchParams.set("conversation", options.conversationId);
  const external = Boolean(options.replyEmail && !options.conversationId);
  const target = external ? `mailto:${encodeURIComponent(options.replyEmail!)}` : inbox.href;
  const logo = new URL("/logo-mybasket-header.png", siteUrl).href;
  const image = new URL("/images/bandeau-message.jpg", siteUrl).href;
  const name = sender.trim() || "MyBasket";
  const title = options.invitation ? "Invitation à échanger" : "Nouveau message";
  const cta = external ? "Répondre par e-mail" : "Ouvrir la conversation";
  const subject = options.subject || (options.invitation ? "Tu as reçu une invitation sur MyBasket" : "Tu as reçu un nouveau message sur MyBasket");
  const intro = options.invitation ? "t’invite à échanger via MyBasket." : "t’a envoyé un message sur MyBasket.";
  return {
    subject,
    text: `${name} ${intro}\n${options.message ? `\n${options.message}\n` : ""}\n${cta} · ${target}`,
    html: `<!doctype html><html lang="fr"><body style="margin:0;background:#f5efed;font-family:Arial,sans-serif;color:#27191e">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f5efed"><tr><td align="center" style="padding:28px 12px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e5d8d5;border-radius:16px;overflow:hidden">
          <tr><td align="center" style="padding:16px 24px;background:#fff;border-bottom:3px solid #d4a24c"><img src="${logo}" alt="MyBasket" width="64" style="display:block;max-width:64px;height:auto" /><strong style="display:block;margin-top:7px;color:#6b1a2c;letter-spacing:2px">MYBASKET</strong></td></tr>
          <tr><td><img src="${image}" alt="" width="560" style="display:block;width:100%;max-width:560px;height:auto" /></td></tr>
          <tr><td style="padding:28px 26px 32px">
            <p style="font-size:11px;font-weight:bold;letter-spacing:2px;color:#8c661f;margin:0 0 12px">MESSAGERIE MYBASKET</p>
            <h1 style="font-size:27px;margin:0 0 14px;color:#6b1a2c">${title}</h1>
            <p style="font-size:16px;line-height:1.55;margin:0 0 18px"><strong>${escapeHtml(name)}</strong> ${intro}</p>
            ${options.message ? `<div style="background:#f9f4f1;border-left:3px solid #d4a24c;padding:15px 17px;margin:0 0 22px;line-height:1.55;overflow-wrap:anywhere">${options.subject ? `<strong>${escapeHtml(options.subject)}</strong><br>` : ""}${escapeHtml(options.message).replace(/\r?\n/g, "<br>")}</div>` : ""}
            <a href="${escapeHtml(target)}" style="display:inline-block;background:#6b1a2c;color:#fff;padding:14px 20px;border-radius:8px;font-weight:bold;text-decoration:none">${cta}</a>
          </td></tr>
          <tr><td align="center" style="padding:15px 20px;background:#faf5f1;color:#6b565c;font-size:12px">MyBasket · Messagerie</td></tr>
        </table>
      </td></tr></table></body></html>`,
  };
}
