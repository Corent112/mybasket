
import { NextRequest, NextResponse } from "next/server";
import { createGoogleDriveAdminClient } from "@/lib/google-drive/admin";
import {
  canManageTeamMedia,
  requireGoogleDriveUser,
} from "@/lib/google-drive/server";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  try {
    await requireGoogleDriveUser();

    const body = await request.json();
    const teamId = String(body?.teamId || "");

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

    const admin = createGoogleDriveAdminClient();
    const { error } = await admin
      .from("team_drive_connections")
      .update({ revoked_at: new Date().toISOString() })
      .eq("team_id", teamId)
      .eq("provider", "google_drive");

    if (error) throw error;

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Erreur",
      },
      { status: 500 },
    );
  }
}
