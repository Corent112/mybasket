
import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_DRIVE_SCOPE,
  canManageTeamMedia,
  requireGoogleDriveUser,
} from "@/lib/google-drive/server";

export const runtime = "nodejs";

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/management";
  }
  return value;
}

export async function GET(request: NextRequest) {
  try {
    await requireGoogleDriveUser();

    const teamId = request.nextUrl.searchParams.get("teamId") || "";
    const returnTo = safeReturnTo(
      request.nextUrl.searchParams.get("returnTo"),
    );

    if (!teamId) {
      return NextResponse.json(
        { error: "teamId manquant" },
        { status: 400 },
      );
    }

    if (!(await canManageTeamMedia(teamId))) {
      return NextResponse.json(
        { error: "Accès refusé" },
        { status: 403 },
      );
    }

    const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
    const redirectUri = process.env.GOOGLE_DRIVE_REDIRECT_URI;
    if (!clientId || !redirectUri) {
      return NextResponse.json(
        { error: "Configuration Google Drive incomplète" },
        { status: 500 },
      );
    }

    const state = crypto.randomBytes(24).toString("base64url");
    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");

    auth.searchParams.set("client_id", clientId);
    auth.searchParams.set("redirect_uri", redirectUri);
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("scope", GOOGLE_DRIVE_SCOPE);
    auth.searchParams.set("access_type", "offline");
    auth.searchParams.set("include_granted_scopes", "true");
    auth.searchParams.set("prompt", "consent");
    auth.searchParams.set("state", state);

    const response = NextResponse.redirect(auth);
    const options = {
      httpOnly: true,
      sameSite: "lax" as const,
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 600,
    };

    response.cookies.set("gdrive_oauth_state", state, options);
    response.cookies.set("gdrive_team_id", teamId, options);
    response.cookies.set("gdrive_return_to", returnTo, options);

    return response;
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur Google Drive";
    return NextResponse.json(
      { error: message },
      { status: message === "UNAUTHENTICATED" ? 401 : 500 },
    );
  }
}
