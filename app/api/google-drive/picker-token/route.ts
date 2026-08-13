
import { NextRequest, NextResponse } from "next/server";
import {
  canManageTeamMedia,
  refreshTeamGoogleDriveAccessToken,
  requireGoogleDriveUser,
} from "@/lib/google-drive/server";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await requireGoogleDriveUser();

    const teamId = request.nextUrl.searchParams.get("teamId") || "";
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

    const { accessToken, expiresIn } =
      await refreshTeamGoogleDriveAccessToken(teamId);

    return NextResponse.json({
      accessToken,
      expiresIn,
      developerKey:
        process.env.NEXT_PUBLIC_GOOGLE_DRIVE_PICKER_API_KEY || "",
      appId: process.env.NEXT_PUBLIC_GOOGLE_DRIVE_APP_ID || "",
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur";
    return NextResponse.json(
      { error: message },
      { status: message === "UNAUTHENTICATED" ? 401 : 500 },
    );
  }
}
