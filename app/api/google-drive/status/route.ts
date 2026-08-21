import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_DRIVE_SCOPE,
  getTeamDriveConnection,
} from "@/lib/google-drive/server";
import { getTeamMediaAccess } from "@/lib/google-drive/team-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const teamId = request.nextUrl.searchParams.get("teamId") || "";
  if (!teamId) {
    return NextResponse.json({ error: "teamId manquant" }, { status: 400 });
  }

  const access = await getTeamMediaAccess(teamId);
  if (!access.allowed) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const connection = await getTeamDriveConnection(teamId);
  const scopes = String(connection?.scope || "").split(/\s+/).filter(Boolean);
  const scopeReady = scopes.includes(GOOGLE_DRIVE_SCOPE);

  return NextResponse.json({
    configured: true,
    connected: Boolean(connection),
    scopeReady,
    canManage: access.owner,
    sharedWithStaff: true,
    reason:
      connection && !scopeReady
        ? "Le coach principal doit réautoriser Google Drive une fois."
        : null,
  });
}
