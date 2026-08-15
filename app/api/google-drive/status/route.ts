
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

    // Un défaut de configuration serveur (clé service role, table absente) ne
    // doit pas produire un 500 : l'interface a seulement besoin de savoir que
    // la connexion n'est pas établie, sinon tout le panneau vidéo casse.
    try {
      const connection = await getTeamDriveConnection(teamId);

      return NextResponse.json({
        connected: Boolean(connection),
        connectedAt: connection?.connected_at || null,
        configured: true,
      });
    } catch (connectionError) {
      const reason =
        connectionError instanceof Error
          ? connectionError.message
          : "Google Drive indisponible.";

      console.error("[google-drive] status", reason);

      return NextResponse.json({
        connected: false,
        connectedAt: null,
        configured: false,
        reason,
      });
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur";
    return NextResponse.json(
      { error: message },
      { status: message === "UNAUTHENTICATED" ? 401 : 500 },
    );
  }
}
