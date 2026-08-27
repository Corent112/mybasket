import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { sendTransactionalEmail } from "@/lib/server-notifications";
import { getSiteUrl, safeInternalPath } from "@/lib/site-url";

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const email = String(body?.email || "").trim().toLowerCase();
  const next = safeInternalPath(body?.next, "/mon-compte");

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "Adresse e-mail invalide." },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { error: "Configuration serveur Supabase incomplète." },
      { status: 500 },
    );
  }

  // Réponse volontairement générique : ne révèle pas si une adresse est inscrite.
  const genericSuccess = {
    ok: true,
    message:
      "Si ce compte est en attente de confirmation, un nouvel e-mail vient d’être envoyé.",
  };

  let existingUser = null;
  let page = 1;
  const perPage = 200;

  while (page <= 100) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage,
    });

    if (error) {
      console.error("Recherche utilisateur pour renvoi impossible :", error);
      return NextResponse.json(genericSuccess);
    }

    existingUser =
      (data?.users || []).find(
        (candidate) =>
          candidate.email?.trim().toLowerCase() === email,
      ) || null;

    if (existingUser || (data?.users || []).length < perPage) break;
    page += 1;
  }

  if (
    !existingUser ||
    existingUser.email_confirmed_at ||
    existingUser.confirmed_at
  ) {
    return NextResponse.json(genericSuccess);
  }

  const siteUrl = getSiteUrl(request);
  const redirectTo =
    `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`;

  const generated =
    await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo,
      },
    });

  const hashedToken =
    generated.data?.properties?.hashed_token;

  if (generated.error || !hashedToken) {
    console.error(
      "Génération renvoi confirmation impossible :",
      generated.error,
    );
    return NextResponse.json(genericSuccess);
  }

  const confirmUrl =
    `${siteUrl}/auth/callback?token_hash=${encodeURIComponent(
      hashedToken,
    )}&type=magiclink&next=${encodeURIComponent(next)}`;

  const safeEmail = escapeHtml(email);

  const html = `
    <div style="margin:0;padding:32px 14px;background:#f5f1ed;font-family:Arial,Helvetica,sans-serif;color:#231f20">
      <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:22px;overflow:hidden">
        <div style="background:#6B1A2C;padding:30px 32px;text-align:center">
          <div style="color:#D4A24C;font-size:24px;font-weight:900">MYBASKET</div>
        </div>
        <div style="height:5px;background:#D4A24C"></div>
        <div style="padding:34px 38px">
          <div style="color:#D4A24C;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">
            Confirmation d’inscription
          </div>
          <h1 style="margin:10px 0 14px;font-size:27px;color:#241d1a">
            Nouveau lien de confirmation
          </h1>
          <p style="color:#6f625c;font-size:15px;line-height:1.65">
            Le compte <strong>${safeEmail}</strong> est toujours en attente de confirmation.
          </p>
          <div style="text-align:center;margin:30px 0">
            <a href="${confirmUrl}"
              style="display:inline-block;background:#6B1A2C;color:#fff;text-decoration:none;padding:15px 30px;border-radius:999px;font-size:15px;font-weight:800">
              Confirmer mon inscription
            </a>
          </div>
          <p style="color:#8b7d76;font-size:12px;line-height:1.6;word-break:break-all">
            ${confirmUrl}
          </p>
        </div>
      </div>
    </div>
  `;

  const text = [
    "MyBasket — nouveau lien de confirmation",
    "",
    `Compte : ${email}`,
    "",
    "Confirmer mon inscription :",
    confirmUrl,
  ].join("\n");

  try {
    await sendTransactionalEmail({
      to: email,
      subject: "Nouveau lien de confirmation MyBasket",
      html,
      text,
    });
  } catch (error) {
    console.error("Renvoi confirmation MyBasket impossible :", error);
  }

  return NextResponse.json(genericSuccess);
}
