
import { NextRequest } from "next/server";
import {
  proxyDriveFile,
  requireGoogleDriveUser,
} from "@/lib/google-drive/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function copyHeader(source: Headers, target: Headers, key: string) {
  const value = source.get(key);
  if (value) target.set(key, value);
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ matchId: string }> },
) {
  try {
    const { supabase } = await requireGoogleDriveUser();
    const { matchId } = await context.params;

    const { data: media, error } = await supabase
      .from("match_media_sources")
      .select(
        "match_id,team_id,provider,external_file_id,resource_key,file_name,mime_type",
      )
      .eq("match_id", matchId)
      .maybeSingle();

    if (error) throw error;
    if (!media) {
      return new Response("Vidéo non liée", { status: 404 });
    }
    if (
      media.provider !== "google_drive" ||
      !media.external_file_id
    ) {
      return new Response("Source vidéo non prise en charge", {
        status: 400,
      });
    }

    const drive = await proxyDriveFile({
      teamId: String(media.team_id),
      fileId: String(media.external_file_id),
      resourceKey: media.resource_key
        ? String(media.resource_key)
        : null,
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
      drive.headers.get("content-type") ||
        media.mime_type ||
        "video/mp4",
    );
    headers.set("Accept-Ranges", "bytes");
    headers.set("Cache-Control", "private, no-store");
    headers.set(
      "Content-Disposition",
      `inline; filename*=UTF-8''${encodeURIComponent(
        media.file_name || "match.mp4",
      )}`,
    );

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
