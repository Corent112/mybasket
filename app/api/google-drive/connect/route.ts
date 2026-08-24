import crypto from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_DRIVE_SCOPE,
  GoogleDriveStepError,
  getGoogleDriveConfig,
  logGoogleDriveError,
  logGoogleDriveStep,
  requireGoogleDriveUser,
} from "@/lib/google-drive/server";
import { getTeamMediaAccess } from "@/lib/google-drive/team-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "google-drive/connect";

function safeReturnTo(value: string | null) {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/management";
  }
  return value;
}

export async function GET(request: NextRequest) {
  try {
    logGoogleDriveStep(ROUTE, "auth");
    await requireGoogleDriveUser();

    logGoogleDriveStep(ROUTE, "params");
    const teamId = request.nextUrl.searchParams.get("teamId") || "";
    const returnTo = safeReturnTo(request.nextUrl.searchParams.get("returnTo"));

    if (!teamId) {
      return NextResponse.json({ error: "teamId manquant" }, { status: 400 });
    }

    // La connexion Drive appartient à l'équipe. Seul le coach principal /
    // propriétaire la connecte. Le staff autorisé pourra ensuite consulter les
    // vidéos via les routes browse/stream sans recevoir le token Google.
    logGoogleDriveStep(ROUTE, "team-access");
    const access = await getTeamMediaAccess(teamId);
    if (!access.owner) {
      return NextResponse.json(
        { error: "Seul le coach principal peut connecter Google Drive." },
        { status: 403 },
      );
    }

    logGoogleDriveStep(ROUTE, "config");
    const config = getGoogleDriveConfig();

    if (!config.ok || !config.clientId || !config.redirectUri) {
      throw new GoogleDriveStepError({
        step: "config",
        message:
          config.redirectUriReason ||
          `Variables absentes ou invalides : ${config.missing.join(", ") || "aucune"}`,
        publicMessage: "Configuration Google Drive incomplète.",
        missing: config.missing,
        status: 500,
      });
    }

    logGoogleDriveStep(ROUTE, "oauth-url");
    const state = crypto.randomBytes(24).toString("base64url");
    const auth = new URL("https://accounts.google.com/o/oauth2/v2/auth");

    auth.searchParams.set("client_id", config.clientId);
    auth.searchParams.set("redirect_uri", config.redirectUri);
    auth.searchParams.set("response_type", "code");
    auth.searchParams.set("scope", GOOGLE_DRIVE_SCOPE);
    auth.searchParams.set("access_type", "offline");
    auth.searchParams.set("include_granted_scopes", "true");
    auth.searchParams.set("prompt", "consent");
    auth.searchParams.set("state", state);

    if (config.redirectUriHost && config.redirectUriHost !== request.nextUrl.host) {
      console.warn(
        `[${ROUTE}] step=oauth-url attention: hôte courant=${request.nextUrl.host} ` +
          `mais GOOGLE_DRIVE_REDIRECT_URI pointe vers ${config.redirectUriHost}. ` +
          "Le cookie d'état ne survivra pas au retour de Google.",
      );
    }

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
    logGoogleDriveError(ROUTE, error);

    if (error instanceof GoogleDriveStepError) {
      return NextResponse.json(
        {
          error: error.publicMessage,
          step: error.step,
          ...(error.missing?.length ? { missing: error.missing } : {}),
        },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "Erreur Google Drive", step: "unknown" },
      { status: 500 },
    );
  }
}
