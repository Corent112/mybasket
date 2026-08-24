
import { NextRequest } from "next/server";
import {
  proxyDriveFile,
  requireGoogleDriveUser,
} from "@/lib/google-drive/server";
import { canReadTeamMedia } from "@/lib/google-drive/team-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function copyHeader(source: Headers, target: Headers, key: string) {
  const value = source.get(key);
  if (value) target.set(key, value);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ fileId: string }> },
) {
  try {
    await requireGoogleDriveUser();

    const { fileId } = await context.params;
    const teamId = request.nextUrl.searchParams.get("teamId") || "";

    if (!fileId || !teamId) {
      return new Response("Paramètres vidéo manquants", {
        status: 400,
      });
    }

    if (!(await canReadTeamMedia(teamId))) {
      return new Response("Accès refusé", { status: 403 });
    }

    const drive = await proxyDriveFile({
      teamId,
      fileId,
      range: request.headers.get("range"),
    });

    if (!drive.ok && drive.status !== 206) {
      return new Response("Lecture Google Drive impossible", {
        status: drive.status,
      });
    }

    const headers = new Headers();
    headers.set(
      "Content-Type",
      drive.headers.get("content-type") || "video/mp4",
    );
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, no-store");

    copyHeader(drive.headers, headers, "content-length");
    copyHeader(drive.headers, headers, "content-range");
    copyHeader(drive.headers, headers, "etag");
    copyHeader(drive.headers, headers, "last-modified");

    return new Response(drive.body, {
      status: drive.status,
      headers,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Erreur";
    return new Response(
      message === "UNAUTHENTICATED" ? "Non connecté" : message,
      {
        status: message === "UNAUTHENTICATED" ? 401 : 500,
      },
    );
  }
}
