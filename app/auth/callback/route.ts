import { NextRequest, NextResponse } from "next/server";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl, safeInternalPath } from "@/lib/site-url";

function redirectOnSite(
  request: NextRequest,
  path: string,
) {
  return NextResponse.redirect(
    new URL(path, `${getSiteUrl(request)}/`),
  );
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash =
    request.nextUrl.searchParams.get("token_hash");
  const type =
    request.nextUrl.searchParams.get("type") as
      | EmailOtpType
      | null;

  const next = safeInternalPath(
    request.nextUrl.searchParams.get("next"),
    "/mon-compte",
  );

  const supabase = await createClient();

  if (code) {
    const { error } =
      await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return redirectOnSite(request, next);
    }

    console.error(
      "Échange code auth impossible :",
      error.message,
    );
  }

  if (tokenHash && type) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type,
    });

    if (!error) {
      return redirectOnSite(request, next);
    }

    console.error(
      "Vérification token auth impossible :",
      error.message,
    );
  }

  const sourceMessage =
    request.nextUrl.searchParams.get("error_description") ||
    request.nextUrl.searchParams.get("error") ||
    "Lien invalide ou expiré.";

  // Pour une récupération de mot de passe, renvoyer l'erreur sur la page
  // dédiée afin que l'utilisateur puisse demander immédiatement un nouveau lien.
  const errorPath = next === "/auth/reset-password"
    ? "/auth/reset-password"
    : "/connexion";
  const destination = new URL(
    errorPath,
    `${getSiteUrl(request)}/`,
  );
  destination.searchParams.set("error", sourceMessage);

  return NextResponse.redirect(destination);
}
