export function messageNotificationEmail(siteUrl: string, sender: string) {
  const url = new URL("/mon-compte?tab=messagerie", siteUrl).href;
  const image = new URL("/images/bandeau-message.jpg", siteUrl).href;
  const name = sender.trim() || "MyBasket";
  const escaped = name.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  return {
    subject: "Tu as reçu un nouveau message sur MyBasket",
    text: `${name} t’a envoyé un message sur MyBasket. Ouvre ta messagerie pour le lire et y répondre.\n\n${url}`,
    html: `<!doctype html><html lang="fr"><body style="margin:0;background:#f6f1ee;font-family:Arial,sans-serif;color:#25151b">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f6f1ee"><tr><td align="center" style="padding:24px 12px">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e5d8d5;border-radius:16px;overflow:hidden">
          <tr><td style="padding:18px 26px;background:#6b1a2c;color:#fff;font-weight:bold;letter-spacing:2px">MYBASKET</td></tr>
          <tr><td><img src="${image}" alt="" width="560" style="display:block;width:100%;max-width:560px;height:auto" /></td></tr>
          <tr><td style="padding:28px 26px 32px">
            <h1 style="font-size:26px;margin:0 0 14px;color:#6b1a2c">Nouveau message</h1>
            <p style="font-size:16px;line-height:1.6;margin:0 0 24px">Tu as reçu un message de <strong>${escaped}</strong>. Ouvre ta messagerie pour le lire et y répondre.</p>
            <a href="${url}" style="display:inline-block;background:#6b1a2c;color:#fff;padding:14px 20px;border-radius:8px;font-weight:bold;text-decoration:none">Ouvrir ma messagerie</a>
          </td></tr>
        </table>
      </td></tr></table></body></html>`,
  };
}
