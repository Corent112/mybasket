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

  async function hasActiveFreeGrant() {
    const now = Date.now();

    const { data: grants, error } = await adminClient
      .from("free_access_grants")
      .select("id,status,starts_at,ends_at")
      .ilike("user_email", email)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      console.error("Vérification accès gratuit impossible :", error.message);
      return false;
    }

    return (grants || []).some((grant) => {
      const start = grant.starts_at
        ? new Date(grant.starts_at).getTime()
        : 0;
      const end = grant.ends_at
        ? new Date(grant.ends_at).getTime()
        : Number.POSITIVE_INFINITY;

      return start <= now && end >= now;
    });
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

  let generated = await generateSignupLink();

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
        const freeGrant = await hasActiveFreeGrant();

        /**
         * Ancien compte fantôme :
         * - invitation automatique créée historiquement par un accès gratuit ;
         * - invitation admin non finalisée ;
         * - utilisateur jamais connecté.
         *
         * On ne supprime JAMAIS un vrai compte déjà utilisé.
         */
        const canRecreateGhost =
          neverSignedIn &&
          (isUnconfirmed || freeGrant);

        if (canRecreateGhost) {
          const { error: deleteError } =
            await adminClient.auth.admin.deleteUser(existingUser.id);

          if (deleteError) {
            console.error(
              "Suppression ancien compte fantôme impossible :",
              deleteError,
            );
          } else {
            generated = await generateSignupLink();
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
            "Un compte existe déjà avec cette adresse. Utilise « Connexion » ou « Mot de passe oublié ».",
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
        error: message || "Impossible de créer le compte.",
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
    )}&type=signup&next=${encodeURIComponent(next)}`;

  const safeName = escapeHtml(displayName || "Coach");
  const safeEmail = escapeHtml(email);

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

  let customEmailSent = false;

  try {
    const delivery = await sendTransactionalEmail({
      to: email,
      subject: "Confirme ton inscription MyBasket",
      html,
    });

    customEmailSent = Boolean(delivery?.sent);
  } catch (mailError) {
    console.error(
      "E-mail MyBasket via Resend non envoyé, tentative Supabase :",
      mailError,
    );
  }

  /**
   * Sécurité importante :
   * generateLink() a déjà créé l'utilisateur Auth.
   * On ne supprime PLUS le compte si Resend est mal configuré ou temporairement
   * indisponible. On tente le système e-mail Supabase comme second canal.
   */
  if (!customEmailSent) {
    const { error: resendError } = await adminClient.auth.resend({
      type: "signup",
      email,
      options: {
        emailRedirectTo: redirectTo,
      },
    });

    if (resendError) {
      console.error(
        "E-mail de confirmation Supabase non envoyé :",
        resendError.message,
      );

      return NextResponse.json(
        {
          ok: true,
          confirmationPending: true,
          message:
            "Ton compte a bien été créé, mais l’e-mail de confirmation n’a pas pu partir. Ton compte n’a pas été supprimé. Contacte MyBasket ou réessaie la confirmation dans quelques instants.",
          code: "CONFIRMATION_EMAIL_PENDING",
        },
        { status: 202 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    confirmationPending: false,
    message:
      "Compte créé. Clique sur « Confirmer mon inscription » dans l’e-mail MyBasket.",
  });
}
