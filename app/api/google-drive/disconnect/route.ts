import { NextRequest, NextResponse } from "next/server";
import { createGoogleDriveAdminClient } from "@/lib/google-drive/admin";
import {
  GoogleDriveStepError,
  logGoogleDriveError,
  requireGoogleDriveUser,
} from "@/lib/google-drive/server";
import { getTeamMediaAccess } from "@/lib/google-drive/team-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "google-drive/disconnect";

export async function POST(request: NextRequest) {
  try {
    await requireGoogleDriveUser();

    const body = await request.json();
    const teamId = String(body?.teamId || "");

    if (!teamId) {
      return NextResponse.json({ error: "teamId manquant" }, { status: 400 });
    }

    // Même règle que pour la connexion : seul le coach principal/propriétaire
    // peut déconnecter le Drive partagé de l'équipe.
    const access = await getTeamMediaAccess(teamId);
    if (!access.owner) {
      return NextResponse.json(
        { error: "Seul le coach principal peut déconnecter Google Drive." },
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
      { error: "Déconnexion impossible.", step: "unknown" },
      { status: 500 },
    );
  }
}
