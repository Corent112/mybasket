import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_DRIVE_SCOPE,
  GoogleDriveStepError,
  getTeamDriveConnection,
  logGoogleDriveError,
  refreshTeamGoogleDriveAccessToken,
} from "@/lib/google-drive/server";
import { canReadTeamMedia } from "@/lib/google-drive/team-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "google-drive/browse";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export async function GET(request: NextRequest) {
  try {
    const teamId = request.nextUrl.searchParams.get("teamId") || "";
    const folderId = request.nextUrl.searchParams.get("folderId") || "root";

    if (!teamId) {
      return NextResponse.json({ error: "teamId manquant" }, { status: 400 });
    }

    // CORRECTION : lecture autorisée au staff MyBasket de l'équipe.
    if (!(await canReadTeamMedia(teamId))) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const connection = await getTeamDriveConnection(teamId);
    if (!connection) {
      return NextResponse.json(
        {
          error: "Le coach principal n'a pas encore connecté Google Drive à cette équipe.",
          code: "team_drive_not_connected",
        },
        { status: 409 },
      );
    }

    const grantedScopes = String(connection.scope || "")
      .split(/\s+/)
      .filter(Boolean);

    if (!grantedScopes.includes(GOOGLE_DRIVE_SCOPE)) {
      return NextResponse.json(
        {
          error:
            "Le coach principal doit réautoriser Google Drive une fois pour afficher les dossiers et vidéos.",
          code: "scope_upgrade_required",
        },
        { status: 409 },
      );
    }

    // Cette fonction utilise la connexion enregistrée POUR L'ÉQUIPE :
    // jamais le compte Google personnel de l'assistant.
    const { accessToken } = await refreshTeamGoogleDriveAccessToken(teamId);

    const driveUrl = new URL("https://www.googleapis.com/drive/v3/files");
    driveUrl.searchParams.set(
      "q",
      `'${folderId.replaceAll("'", "\\'")}' in parents and trashed = false`,
    );
    driveUrl.searchParams.set("pageSize", "1000");
    driveUrl.searchParams.set("orderBy", "folder,name_natural");
    driveUrl.searchParams.set("spaces", "drive");
    driveUrl.searchParams.set("supportsAllDrives", "true");
    driveUrl.searchParams.set("includeItemsFromAllDrives", "true");
    driveUrl.searchParams.set(
      "fields",
      "files(id,name,mimeType,size,modifiedTime,webViewLink,parents,videoMediaMetadata)",
    );

    const response = await fetch(driveUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return NextResponse.json(
        {
          error:
            payload?.error?.message ||
            "Google Drive a refusé la lecture des fichiers.",
        },
        { status: response.status },
      );
    }

    const files = (Array.isArray(payload.files) ? payload.files : [])
      .filter((file: any) => {
        const mime = String(file?.mimeType || "");
        return mime === FOLDER_MIME || mime.startsWith("video/");
      })
      .map((file: any) => ({
        id: String(file.id),
        name: String(file.name || file.id),
        mimeType: String(file.mimeType || ""),
        isFolder: String(file.mimeType || "") === FOLDER_MIME,
        size: file.size ? Number(file.size) : null,
        modifiedTime: file.modifiedTime ? String(file.modifiedTime) : null,
        webViewLink: file.webViewLink ? String(file.webViewLink) : null,
        durationMs:
          file.videoMediaMetadata?.durationMillis != null
            ? Number(file.videoMediaMetadata.durationMillis)
            : null,
      }));

    return NextResponse.json({ files, folderId });
  } catch (error) {
    logGoogleDriveError(ROUTE, error);

    if (error instanceof GoogleDriveStepError) {
      return NextResponse.json(
        { error: error.publicMessage, step: error.step },
        { status: error.status },
      );
    }

    return NextResponse.json(
      { error: "Impossible de parcourir Google Drive." },
      { status: 500 },
    );
  }
}
