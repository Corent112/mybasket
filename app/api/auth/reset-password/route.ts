import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { sendTransactionalEmail } from "@/lib/server-notifications";
import { getSiteUrl } from "@/lib/site-url";
import { getClientIp, rateLimit } from "@/lib/security/rate-limit";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 });
  }
  if (!rateLimit(`password-reset:ip:${getClientIp(request.headers)}`, 12, 600_000).allowed ||
      !rateLimit(`password-reset:email:${email}`, 3, 600_000).allowed) {
    return NextResponse.json({ error: "Trop de demandes. Réessaie dans quelques minutes." }, { status: 429 });
  }
  const unavailable = () => NextResponse.json({
    error: "L’envoi du lien est momentanément indisponible. Réessaie dans quelques minutes.",
  }, { status: 503 });
  const success = () => NextResponse.json({
    ok: true,
    message: "Si un compte existe avec cette adresse, tu recevras un e-mail pour créer ou réinitialiser ton mot de passe. Vérifie aussi les indésirables.",
  });
  const admin = createAdminClient();
  if (!admin) return unavailable();
  try {
    // Ne crée aucun compte et conserve l’identifiant, les formations et les accès.
    let existingUser = null;
    for (let page = 1; ; page += 1) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) return unavailable();
      existingUser = data.users.find((user) => user.email?.trim().toLowerCase() === email) || null;
      if (existingUser || data.users.length === 0) break;
    }
    if (!existingUser) return success();
    // Les fiches importées ont un compte non confirmé, sans mot de passe.
    // Le clic sur l’e-mail prouve la possession de l’adresse avant toute modification.
    const type = existingUser.email_confirmed_at || existingUser.confirmed_at ? "recovery" : "magiclink";
    const siteUrl = getSiteUrl(request);
    const { data, error } = await admin.auth.admin.generateLink({
      type, email,
      options: { redirectTo: `${siteUrl}/auth/reset-password` },
    });
    const token = data?.properties?.hashed_token;
    const verificationType = data?.properties?.verification_type;
    if (error || !token || !["recovery", "magiclink", "signup", "invite"].includes(String(verificationType))) {
      console.error("[password-reset] Génération du lien impossible", error?.code);
      return unavailable();
    }
    const link = new URL("/auth/callback", siteUrl);
    link.searchParams.set("token_hash", token);
    link.searchParams.set("type", verificationType!);
    link.searchParams.set("next", "/auth/reset-password");
    const url = link.toString();
    const delivery = await sendTransactionalEmail({
      to: email,
      subject: "Créer ou réinitialiser ton mot de passe MyBasket",
      text: `Un compte MyBasket existe déjà avec ton adresse. Pour définir ton mot de passe, ouvre ce lien :\n\n${url}\n\nSaisis ton nouveau mot de passe puis confirme-le. Tes formations et tes accès sont conservés. Si tu n’as pas demandé ce lien, ignore ce message.`,
      html: `<div style="font-family:Arial,sans-serif;max-width:560px;margin:auto;padding:32px;color:#231f20"><h1 style="color:#6B1A2C">Ton mot de passe MyBasket</h1><p>Ton compte existe déjà. Tu peux créer ou réinitialiser ton mot de passe sans refaire ton inscription.</p><p><a style="display:inline-block;background:#6B1A2C;color:white;padding:15px 22px;border-radius:12px;text-decoration:none" href="${url.replaceAll("&", "&amp;")}">Choisir mon mot de passe</a></p><p>Saisis ton nouveau mot de passe puis confirme-le. Tes formations et tes accès sont conservés.</p><p>Ce lien est personnel et utilisable une seule fois. S’il expire, demande un nouveau lien depuis « Mot de passe oublié ».</p><p>Si tu n’as pas demandé ce lien, ignore ce message.</p></div>`,
    });
    if (!delivery.sent) return unavailable();
    return success();
  } catch {
    console.error("[password-reset] Envoi impossible");
    return unavailable();
  }
}
