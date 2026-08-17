import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { sendTransactionalEmail } from "@/lib/server-notifications";

function safeNextPath(value: unknown) {
  const next = String(value || "/mon-compte");
  if (!next.startsWith("/") || next.startsWith("//")) return "/mon-compte";
  return next;
}

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
  const password = String(body?.password || "");
  const displayName = String(body?.displayName || "").trim();
  const next = safeNextPath(body?.next);

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Adresse e-mail invalide." }, { status: 400 });
  }

  if (password.length < 8) {
    return NextResponse.json(
      { error: "Le mot de passe doit contenir au moins 8 caractères." },
      { status: 400 },
    );
  }

  const adminClient = createAdminClient();
  if (!adminClient) {
    return NextResponse.json(
      { error: "Configuration serveur Supabase incomplète." },
      { status: 500 },
    );
  }

  const admin = adminClient;

  const siteUrl = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://mybasket.vercel.app"
  ).replace(/\/$/, "");

  const redirectTo = `${siteUrl}/auth/callback?next=${encodeURIComponent(next)}`;

  async function generateSignupLink() {
    return admin.auth.admin.generateLink({
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

  if (generated.error || !generated.data?.properties?.hashed_token) {
    const message = String(generated.error?.message || "");
    const alreadyExists =
      message.toLowerCase().includes("already") ||
      message.toLowerCase().includes("registered") ||
      message.toLowerCase().includes("exists");

    if (alreadyExists) {
      // Un accès gratuit peut avoir créé auparavant un utilisateur Auth "invité"
      // sans mot de passe et sans confirmation. Dans ce seul cas, on recrée
      // proprement le compte afin que l'utilisateur puisse s'inscrire lui-même.
      const { data: listedUsers, error: listError } =
        await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });

      if (listError) {
        console.error("Recherche utilisateur Auth impossible :", listError);
      }

      const existingUser = (listedUsers?.users || []).find(
        (candidate) =>
          candidate.email?.trim().toLowerCase() === email,
      );

      const isUnconfirmed =
        existingUser &&
        !existingUser.email_confirmed_at &&
        !existingUser.confirmed_at;

      // Les anciens "accès gratuits" ont parfois créé un utilisateur Auth via
      // inviteUserByEmail. Supabase peut alors considérer l'adresse comme déjà
      // enregistrée même si la personne n'a jamais réellement créé son compte.
      // On ne nettoie ce compte fantôme que s'il n'a jamais ouvert de session
      // ET qu'un accès gratuit actif existe pour cette adresse.
      let hasActiveFreeGrant = false;

      if (existingUser?.id && !existingUser.last_sign_in_at) {
        const now = new Date().toISOString();
        const { data: grants, error: grantsError } = await admin
          .from("free_access_grants")
          .select("id,status,starts_at,ends_at")
          .ilike("user_email", email)
          .eq("status", "active")
          .order("created_at", { ascending: false });

        if (grantsError) {
          console.error(
            "Vérification de l'accès gratuit impossible :",
            grantsError.message,
          );
        }

        hasActiveFreeGrant = (grants || []).some((grant) => {
          const startsAt = grant.starts_at
            ? new Date(grant.starts_at).getTime()
            : 0;
          const endsAt = grant.ends_at
            ? new Date(grant.ends_at).getTime()
            : Number.POSITIVE_INFINITY;
          const current = new Date(now).getTime();

          return startsAt <= current && endsAt >= current;
        });
      }

      const canRecreateGhostAccount =
        Boolean(existingUser?.id) &&
        !existingUser?.last_sign_in_at &&
        (isUnconfirmed || hasActiveFreeGrant);

      if (existingUser?.id && canRecreateGhostAccount) {
        const { error: deleteError } =
          await admin.auth.admin.deleteUser(existingUser.id);

        if (deleteError) {
          console.error(
            "Suppression du compte invité/fantôme impossible :",
            deleteError,
          );
        } else {
          generated = await generateSignupLink();
        }
      }
    }
  }

  if (generated.error || !generated.data?.properties?.hashed_token) {
    const message = String(generated.error?.message || "");

    if (
      message.toLowerCase().includes("already") ||
      message.toLowerCase().includes("registered") ||
      message.toLowerCase().includes("exists")
    ) {
      return NextResponse.json(
        {
          error:
            "Un compte confirmé existe déjà avec cette adresse. Utilise « Connexion » ou « Mot de passe oublié ».",
        },
        { status: 409 },
      );
    }

    console.error("Création lien inscription MyBasket impossible :", generated.error);
    return NextResponse.json(
      { error: message || "Impossible de créer le compte." },
      { status: 500 },
    );
  }

  const confirmUrl =
    `${siteUrl}/auth/callback?token_hash=${encodeURIComponent(
      generated.data.properties.hashed_token,
    )}&type=signup&next=${encodeURIComponent(next)}`;

  const safeName = escapeHtml(displayName || "Coach");
  const safeEmail = escapeHtml(email);

  const html = `
    <div style="margin:0;padding:32px 14px;background:#f5f1ed;font-family:Arial,Helvetica,sans-serif;color:#231f20">
      <div style="max-width:620px;margin:0 auto;background:#ffffff;border-radius:22px;overflow:hidden;box-shadow:0 18px 50px rgba(45,25,20,.12)">
        <div style="background:#6B1A2C;padding:30px 32px;text-align:center">
          <div style="color:#D4A24C;font-size:24px;font-weight:900;letter-spacing:1px">MYBASKET</div>
        </div>
        <div style="height:5px;background:#D4A24C"></div>

        <div style="padding:34px 38px">
          <div style="color:#D4A24C;font-size:12px;font-weight:800;letter-spacing:1.5px;text-transform:uppercase">
            Confirmation d’inscription
          </div>

          <h1 style="margin:10px 0 14px;font-size:27px;line-height:1.2;color:#241d1a">
            Bienvenue ${safeName}
          </h1>

          <p style="margin:0 0 20px;color:#6f625c;font-size:15px;line-height:1.65">
            Ton compte MyBasket a été créé avec l’adresse
            <strong style="color:#241d1a">${safeEmail}</strong>.
            Confirme maintenant ton adresse e-mail pour activer ton compte.
          </p>

          <div style="text-align:center;margin:30px 0">
            <a
              href="${confirmUrl}"
              style="display:inline-block;background:#6B1A2C;color:#ffffff;text-decoration:none;padding:15px 30px;border-radius:999px;font-size:15px;font-weight:800"
            >
              Confirmer mon inscription
            </a>
          </div>

          <p style="margin:0;color:#8b7d76;font-size:12px;line-height:1.6">
            Si le bouton ne fonctionne pas, tu peux aussi cliquer sur ce lien :
            <br />
            <a href="${confirmUrl}" style="color:#6B1A2C;text-decoration:underline;word-break:break-all">
              ${confirmUrl}
            </a>
          </p>
        </div>

        <div style="padding:18px 28px 26px;text-align:center;color:#9a8e88;font-size:11px">
          MyBasket · E-mail automatique de confirmation
        </div>
      </div>
    </div>
  `;

  try {
    const delivery = await sendTransactionalEmail({
      to: email,
      subject: "Confirme ton inscription MyBasket",
      html,
    });

    if (!delivery?.sent) {
      throw new Error(
        delivery?.reason === "missing_api_key"
          ? "RESEND_API_KEY absente."
          : delivery?.reason === "missing_from"
            ? "RESEND_FROM absente."
            : "L’e-mail n’a pas pu être envoyé.",
      );
    }
  } catch (mailError) {
    console.error("Compte créé mais e-mail de confirmation non envoyé :", mailError);
    return NextResponse.json(
      {
        error:
          "Le compte a été créé mais l’e-mail de confirmation n’a pas pu être envoyé. Contacte MyBasket.",
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    ok: true,
    message:
      "Compte créé. Un e-mail MyBasket vient de t’être envoyé : clique sur « Confirmer mon inscription ».",
  });
}
