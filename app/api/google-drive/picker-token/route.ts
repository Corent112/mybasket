
import { NextRequest, NextResponse } from "next/server";
import {
  GoogleDriveStepError,
  logGoogleDriveError,
  refreshTeamGoogleDriveAccessToken,
  requireGoogleDriveUser,
} from "@/lib/google-drive/server";
import { canReadTeamMedia } from "@/lib/google-drive/team-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "google-drive/picker-token";

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

    if (!(await canReadTeamMedia(teamId))) {
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
      { error: "Google Drive indisponible.", step: "unknown" },
      { status: 500 },
    );
  }
}
