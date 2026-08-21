import { NextRequest, NextResponse } from "next/server";
import {
  getTeamDriveConnection,
  refreshTeamGoogleDriveAccessToken,
} from "@/lib/google-drive/server";
import { canReadTeamMedia } from "@/lib/google-drive/team-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function copyHeader(from: Headers, to: Headers, name: string) {
  const value = from.get(name);
  if (value) to.set(name, value);
}

export async function GET(request: NextRequest) {
  const teamId = request.nextUrl.searchParams.get("teamId") || "";
  const fileId = request.nextUrl.searchParams.get("fileId") || "";

  if (!teamId || !fileId) {
    return NextResponse.json(
      { error: "teamId ou fileId manquant" },
      { status: 400 },
    );
  }

  if (!(await canReadTeamMedia(teamId))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const connection = await getTeamDriveConnection(teamId);
  if (!connection) {
    return NextResponse.json(
      { error: "Google Drive non connecté pour cette équipe." },
      { status: 409 },
    );
  }

  const { accessToken } = await refreshTeamGoogleDriveAccessToken(teamId);

  // Vérifie d'abord que le fichier est bien une vidéo accessible via le Drive
  // de l'équipe avant d'envoyer le moindre octet.
  const metaUrl =
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}` +
    `?fields=id,name,mimeType,size&supportsAllDrives=true`;

  const metaResponse = await fetch(metaUrl, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  if (!metaResponse.ok) {
    return NextResponse.json(
      { error: "Vidéo Google Drive introuvable ou inaccessible." },
      { status: metaResponse.status },
    );
  }

  const meta = await metaResponse.json();
  if (!String(meta.mimeType || "").startsWith("video/")) {
    return NextResponse.json(
      { error: "Ce fichier Google Drive n'est pas une vidéo." },
      { status: 415 },
    );
  }

  const mediaUrl =
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}` +
    `?alt=media&supportsAllDrives=true`;

  const googleHeaders: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };

  const range = request.headers.get("range");
  if (range) googleHeaders.Range = range;

  const mediaResponse = await fetch(mediaUrl, {
    headers: googleHeaders,
    cache: "no-store",
  });

  if (!mediaResponse.ok && mediaResponse.status !== 206) {
    return NextResponse.json(
      { error: "Lecture de la vidéo Google Drive impossible." },
      { status: mediaResponse.status },
    );
  }

  const headers = new Headers();
  headers.set("Content-Type", String(meta.mimeType || "video/mp4"));
  headers.set("Accept-Ranges", "bytes");
  headers.set("Cache-Control", "private, no-store");
  headers.set("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(String(meta.name || "video"))}`);

  copyHeader(mediaResponse.headers, headers, "content-length");
  copyHeader(mediaResponse.headers, headers, "content-range");
  copyHeader(mediaResponse.headers, headers, "etag");

  return new NextResponse(mediaResponse.body, {
    status: mediaResponse.status,
    headers,
  });
}
