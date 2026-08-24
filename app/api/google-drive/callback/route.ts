import { NextRequest, NextResponse } from "next/server";
import { createGoogleDriveAdminClient } from "@/lib/google-drive/admin";
import { encryptGoogleDriveToken } from "@/lib/google-drive/crypto";
import {
  GoogleDriveStepError,
  canManageTeamMedia,
  logGoogleDriveError,
  requireGoogleDriveUser,
} from "@/lib/google-drive/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "google-drive/callback";

export async function GET(request: NextRequest) {
  const rawReturnTo =
    request.cookies.get("gdrive_return_to")?.value || "/management";
  const returnTo =
    rawReturnTo.startsWith("/") && !rawReturnTo.startsWith("//")
      ? rawReturnTo
      : "/management";
  const target = new URL(returnTo, request.nextUrl.origin);

  try {
    const { user } = await requireGoogleDriveUser();

    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const expectedState = request.cookies.get("gdrive_oauth_state")?.value;
    const teamId = request.cookies.get("gdrive_team_id")?.value;

    if (!code || !state || !expectedState || state !== expectedState || !teamId) {
      throw new Error("Réponse OAuth Google invalide.");
    }

    if (!(await canManageTeamMedia(teamId))) {
      throw new Error("Accès refusé.");
    }

    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
    const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;

    if (!clientId || !clientSecret || !redirectUri) {
      throw new Error("Configuration OAuth Google Drive manquante.");
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        code,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
      cache: "no-store",
    });

    const tokens = await tokenResponse.json();
    if (!tokenResponse.ok) {
      throw new Error(
        tokens?.error_description || tokens?.error || "Échange OAuth Google impossible.",
      );
    }

    const admin = createGoogleDriveAdminClient();

    // Google ne renvoie pas toujours un nouveau refresh_token lorsqu'un compte
    // a déjà autorisé l'application. Dans ce cas on conserve la connexion
    // existante au lieu de faire croire que la connexion a échoué.
    const { data: existing, error: existingError } = await admin
      .from("team_drive_connections")
      .select("refresh_token_encrypted")
      .eq("team_id", teamId)
      .eq("provider", "google_drive")
      .maybeSingle();

    if (existingError) throw existingError;

    const refreshTokenEncrypted = tokens.refresh_token
      ? encryptGoogleDriveToken(String(tokens.refresh_token))
      : String(existing?.refresh_token_encrypted || "");

    if (!refreshTokenEncrypted) {
      throw new Error(
        "Google n'a pas fourni de refresh token. Révoque l'accès MyBasket dans ton compte Google puis reconnecte le Drive.",
      );
    }

    const { error } = await admin.from("team_drive_connections").upsert(
      {
        team_id: teamId,
        provider: "google_drive",
        connected_by: user.id,
        refresh_token_encrypted: refreshTokenEncrypted,
        scope: String(tokens.scope || ""),
        connected_at: new Date().toISOString(),
        revoked_at: null,
      },
      { onConflict: "team_id,provider" },
    );

    if (error) throw error;

    target.searchParams.set("drive", "connected");

    const response = NextResponse.redirect(target);
    response.cookies.delete("gdrive_oauth_state");
    response.cookies.delete("gdrive_team_id");
    response.cookies.delete("gdrive_return_to");
    return response;
  } catch (error) {
    logGoogleDriveError(ROUTE, error);

    target.searchParams.set("drive", "error");
    target.searchParams.set(
      "message",
      error instanceof GoogleDriveStepError
        ? error.publicMessage
        : error instanceof Error
          ? error.message
          : "Connexion Google Drive impossible",
    );
    return NextResponse.redirect(target);
  }
}
