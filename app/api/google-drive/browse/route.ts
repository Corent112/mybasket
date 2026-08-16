import { NextRequest, NextResponse } from "next/server";
import {
  GOOGLE_DRIVE_SCOPE,
  GoogleDriveStepError,
  canManageTeamMedia,
  getTeamDriveConnection,
  logGoogleDriveError,
  refreshTeamGoogleDriveAccessToken,
  requireGoogleDriveUser,
} from "@/lib/google-drive/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ROUTE = "google-drive/browse";
const FOLDER_MIME = "application/vnd.google-apps.folder";

export async function GET(request: NextRequest) {
  try {
    await requireGoogleDriveUser();

    const teamId = request.nextUrl.searchParams.get("teamId") || "";
    const folderId = request.nextUrl.searchParams.get("folderId") || "root";

    if (!teamId) {
      return NextResponse.json({ error: "teamId manquant" }, { status: 400 });
    }

    if (!(await canManageTeamMedia(teamId))) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    // Une ancienne connexion MyBasket peut encore avoir le scope drive.file.
    // Dans ce cas Google répond 200 mais ne retourne que les fichiers déjà
    // explicitement partagés avec l'app, ce qui donne un faux Drive "vide".
    // On force donc une réautorisation avec drive.readonly avant de lister.
    const connection = await getTeamDriveConnection(teamId);
    const grantedScopes = String(connection?.scope || "")
      .split(/\s+/)
      .filter(Boolean);

    if (!connection || !grantedScopes.includes(GOOGLE_DRIVE_SCOPE)) {
      return NextResponse.json(
        {
          error:
            "Google Drive doit être réautorisé une fois pour afficher tes dossiers et tes vidéos.",
          code: "scope_upgrade_required",
        },
        { status: 409 },
      );
    }

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
      "files(id,name,mimeType,size,modifiedTime,webViewLink,parents)",
    );

    const response = await fetch(driveUrl, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      cache: "no-store",
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      const googleMessage =
        payload?.error?.message ||
        "Google Drive a refusé la lecture des fichiers.";

      const insufficient =
        response.status === 403 &&
        /insufficient|permission|scope|auth/i.test(String(googleMessage));

      if (insufficient) {
        return NextResponse.json(
          {
            error:
              "Autorisation Google Drive à mettre à jour pour parcourir tes dossiers.",
            code: "scope_upgrade_required",
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { error: googleMessage },
        { status: response.status },
      );
    }

    const rawFiles = Array.isArray(payload?.files) ? payload.files : [];

    const files = rawFiles
      .filter((file: any) => {
        const mime = String(file?.mimeType || "");
        return mime === FOLDER_MIME || mime.startsWith("video/");
      })
      .map((file: any) => ({
        id: String(file.id),
        name: String(file.name || file.id),
        mimeType: String(file.mimeType || ""),
        size: file.size ? String(file.size) : null,
        modifiedTime: file.modifiedTime ? String(file.modifiedTime) : null,
        webViewLink: file.webViewLink ? String(file.webViewLink) : null,
      }))
      .sort((a: any, b: any) => {
        const af = a.mimeType === FOLDER_MIME ? 0 : 1;
        const bf = b.mimeType === FOLDER_MIME ? 0 : 1;
        if (af !== bf) return af - bf;
        return a.name.localeCompare(b.name, "fr", { sensitivity: "base" });
      });

    return NextResponse.json({ files });
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
      { error: "Impossible de parcourir Google Drive." },
      { status: 500 },
    );
  }
}
