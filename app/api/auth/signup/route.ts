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

function looksLikeExistingUserError(message: unknown) {
  const value = String(message || "").toLowerCase();
  return (
    value.includes("already") ||
    value.includes("registered") ||
    value.includes("exists")
  );
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));

  const email = String(body?.email || "").trim().toLowerCase();
  const password = String(body?.password || "");
  const displayName = String(body?.displayName || "").trim();
  const next = safeInternalPath(body?.next, "/mon-compte");

  if (!email || !email.includes("@")) {
    return NextResponse.json(
      { error: "Adresse e-mail invalide." },
      { status: 400 },
    );
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Le mot de passe doit contenir au moins 8 caractères." },
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

  // Après ce guard, on utilise une référence non-null stable.
  // Cela permet à TypeScript de conserver le narrowing dans les fonctions imbriquées.
  const adminClient = admin;

  const siteUrl = getSiteUrl(request);
  const redirectTo =
    `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`;

  async function findUserByEmail() {
    let page = 1;
    const perPage = 200;

    while (page <= 100) {
      const { data, error } = await adminClient.auth.admin.listUsers({
        page,
        perPage,
      });

      if (error) {
        console.error("Recherche utilisateur Auth impossible :", error);
        return null;
      }

      const found = (data?.users || []).find(
        (candidate) =>
          candidate.email?.trim().toLowerCase() === email,
      );

      if (found) return found;
      if ((data?.users || []).length < perPage) return null;

      page += 1;
    }

    return null;
  }

  async function generateSignupLink() {
    return adminClient.auth.admin.generateLink({
      type: "signup",
      email,
      password,
      options: {
        redirectTo,
        data: {
          display_name: displayName,
        },
      },
    });
  }

  async function generateExistingUserConfirmationLink(userId: string) {
    /**
     * Un compte peut exister sans jamais avoir été confirmé (ancien e-mail perdu,
     * antispam, invitation incomplète...). On ne le supprime jamais.
     *
     * On met à jour le mot de passe seulement pour un compte NON confirmé et
     * jamais connecté, puis on génère un magic-link MyBasket. Le clic prouve
     * l'accès à la boîte e-mail et crée la session.
     */
    const { error: updateError } =
      await adminClient.auth.admin.updateUserById(userId, {
        password,
        user_metadata: {
          display_name: displayName,
        },
      });

    if (updateError) {
      throw new Error(updateError.message);
    }

    return adminClient.auth.admin.generateLink({
      type: "magiclink",
      email,
      options: {
        redirectTo,
      },
    });
  }

  let generated = await generateSignupLink();
  let verificationType: "signup" | "magiclink" = "signup";
  let accountWasAlreadyPending = false;

  if (
    generated.error ||
    !generated.data?.properties?.hashed_token
  ) {
    if (looksLikeExistingUserError(generated.error?.message)) {
      const existingUser = await findUserByEmail();

      if (existingUser) {
        const isUnconfirmed =
          !existingUser.email_confirmed_at &&
          !existingUser.confirmed_at;
        const neverSignedIn = !existingUser.last_sign_in_at;

        if (isUnconfirmed && neverSignedIn) {
          try {
            generated =
              await generateExistingUserConfirmationLink(existingUser.id);
            verificationType = "magiclink";
            accountWasAlreadyPending = true;
          } catch (existingError) {
            console.error(
              "Régénération confirmation compte en attente impossible :",
              existingError,
            );
          }
        }
      }
    }
  }

  if (
    generated.error ||
    !generated.data?.properties?.hashed_token
  ) {
    const message = String(generated.error?.message || "");

    if (looksLikeExistingUserError(message)) {
      return NextResponse.json(
        {
          error:
            "Un compte confirmé existe déjà avec cette adresse. Utilise « Connexion » ou « Mot de passe oublié ».",
          code: "ACCOUNT_EXISTS",
        },
        { status: 409 },
      );
    }

    console.error(
      "Création lien inscription MyBasket impossible :",
      generated.error,
    );

    return NextResponse.json(
      {
        error: message || "Impossible de créer ou récupérer le compte.",
        code: "SIGNUP_FAILED",
      },
      { status: 500 },
    );
  }

  /**
   * Le lien contenu dans l'email pointe DIRECTEMENT vers le site MyBasket.
   * Il ne montre jamais une URL Supabase à l'utilisateur.
   */
  const confirmUrl =
    `${siteUrl}/auth/callback?token_hash=${encodeURIComponent(
      generated.data.properties.hashed_token,
    )}&type=${verificationType}&next=${encodeURIComponent(next)}`;

  const safeName = escapeHtml(displayName || "Coach");
  const safeEmail = escapeHtml(email);

  const plainText = [
    `Bienvenue ${displayName || "Coach"} sur MyBasket.`,
    "",
    `Ton compte utilise l'adresse ${email}.`,
    accountWasAlreadyPending
      ? "Ton compte existait déjà mais n'avait pas encore été confirmé. Voici un nouveau lien."
      : "Confirme ton adresse pour activer ton compte.",
    "",
    "Confirmer mon inscription :",
    confirmUrl,
    "",
    "Si tu n'es pas à l'origine de cette demande, ignore cet e-mail.",
  ].join("\n");

  const html = `
    <div style="margin:0;padding:32px 14px;background:#f5f1ed;font-family:Arial,Helvetica,sans-serif;color:#231f20">
      <div style="max-width:620px;margin:0 auto;background:#fff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(45,25,20,.12)">
        <div style="background:#6B1A2C;padding:30px 32px;text-align:center">
          <div style="color:#D4A24C;font-size:24px;font-weight:900;letter-spacing:1px">MYBASKET</div>
        </div>
        <div style="height:5px;background:#D4A24C"></div>
        <div style="padding:34px 38px">
          <div style="color:#D4A24C;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">
            Confirmation d’inscription
          </div>
          <h1 style="margin:10px 0 14px;font-size:27px;color:#241d1a">
            Bienvenue ${safeName}
          </h1>
          <p style="margin:0 0 20px;color:#6f625c;font-size:15px;line-height:1.65">
            Ton compte MyBasket a été créé avec l’adresse
            <strong style="color:#241d1a">${safeEmail}</strong>.
            Confirme ton adresse pour activer ton compte.
          </p>
          <div style="text-align:center;margin:30px 0">
            <a href="${confirmUrl}"
              style="display:inline-block;background:#6B1A2C;color:#fff;text-decoration:none;padding:15px 30px;border-radius:999px;font-size:15px;font-weight:800">
              Confirmer mon inscription
            </a>
          </div>
          <p style="margin:0;color:#8b7d76;font-size:12px;line-height:1.6">
            Si le bouton ne fonctionne pas :
            <br />
            <a href="${confirmUrl}"
              style="color:#6B1A2C;text-decoration:underline;word-break:break-all">
              ${confirmUrl}
            </a>
          </p>
        </div>
      </div>
    </div>
  `;

  try {
    const delivery = await sendTransactionalEmail({
      to: email,
      subject: "Confirme ton inscription MyBasket",
      html,
      text: plainText,
    });

    if (!delivery?.sent) {
      console.error("E-mail de confirmation non envoyé :", delivery);
      return NextResponse.json(
        {
          ok: true,
          confirmationPending: true,
          email,
          message:
            "Ton compte est créé, mais l'e-mail n'a pas pu partir immédiatement. Utilise « Renvoyer l'e-mail » sans recréer ton compte.",
          code: "CONFIRMATION_EMAIL_PENDING",
        },
        { status: 202 },
      );
    }
  } catch (mailError) {
    /**
     * JAMAIS de suppression du compte ici.
     * Un incident e-mail ne doit jamais détruire une inscription.
     */
    console.error("E-mail de confirmation non envoyé :", mailError);

    return NextResponse.json(
      {
        ok: true,
        confirmationPending: true,
        email,
        message:
          "Ton compte est créé. L'envoi de confirmation rencontre un problème temporaire : utilise « Renvoyer l'e-mail ».",
        code: "CONFIRMATION_EMAIL_PENDING",
      },
      { status: 202 },
    );
  }

  return NextResponse.json({
    ok: true,
    confirmationPending: false,
    email,
    resentExistingAccount: accountWasAlreadyPending,
    message: accountWasAlreadyPending
      ? "Ton compte existait déjà mais n’était pas confirmé. Un nouveau lien vient d’être envoyé."
      : "Compte créé. Clique sur « Confirmer mon inscription » dans l’e-mail MyBasket.",
  });
}
