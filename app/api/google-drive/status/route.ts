
import { NextRequest, NextResponse } from "next/server";
import {
  canAccessTeam,
  getTeamDriveConnection,
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

    if (!(await canAccessTeam(teamId))) {
      return NextResponse.json(
        { error: "Accès refusé" },
        { status: 403 },
      );
    }

    const connection = await getTeamDriveConnection(teamId);

    return NextResponse.json({
      connected: Boolean(connection),
      connectedAt: connection?.connected_at || null,
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
