
import { NextRequest, NextResponse } from "next/server";
import { createGoogleDriveAdminClient } from "@/lib/google-drive/admin";
import {
  canManageTeamMedia,
  getDriveFileMetadata,
  requireGoogleDriveUser,
} from "@/lib/google-drive/server";

export const runtime = "nodejs";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ matchId: string }> },
) {
  try {
    const { user } = await requireGoogleDriveUser();
    const { matchId } = await context.params;
    const body = await request.json();

    const teamId = String(body?.teamId || "");
    const fileId = String(body?.fileId || "");

    if (!matchId || !teamId || !fileId) {
      return NextResponse.json(
        { error: "matchId, teamId et fileId obligatoires" },
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

    const { data: match, error: matchError } = await admin
      .from("match_stats")
      .select("id,team_id")
      .eq("id", matchId)
      .eq("team_id", teamId)
      .maybeSingle();

    if (matchError) throw matchError;
    if (!match) {
      return NextResponse.json(
        { error: "Match introuvable pour cette équipe" },
        { status: 404 },
      );
    }

    const file = await getDriveFileMetadata(teamId, fileId);

    if (!String(file.mimeType || "").startsWith("video/")) {
      return NextResponse.json(
        { error: "Le fichier sélectionné n'est pas une vidéo." },
        { status: 400 },
      );
    }

    if (file.capabilities?.canDownload === false) {
      return NextResponse.json(
        {
          error:
            "Le propriétaire Google Drive interdit le téléchargement de cette vidéo.",
        },
        { status: 400 },
      );
    }

    const { data, error } = await admin
      .from("match_media_sources")
      .upsert(
        {
          match_id: matchId,
          team_id: teamId,
          provider: "google_drive",
          external_file_id: file.id,
          resource_key: file.resourceKey || null,
          file_name: file.name,
          mime_type: file.mimeType || "video/mp4",
          file_size: file.size ? Number(file.size) : null,
          md5_checksum: file.md5Checksum || null,
          provider_modified_at: file.modifiedTime || null,
          web_view_link: file.webViewLink || null,
          linked_by: user.id,
          linked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        { onConflict: "match_id" },
      )
      .select(
        "match_id,team_id,provider,external_file_id,file_name,mime_type,file_size,md5_checksum,linked_at",
      )
      .single();

    if (error) throw error;

    return NextResponse.json({
      ok: true,
      media: data,
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

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ matchId: string }> },
) {
  try {
    const { supabase } = await requireGoogleDriveUser();
    const { matchId } = await context.params;

    const { data, error } = await supabase
      .from("match_media_sources")
      .select(
        "match_id,team_id,provider,external_file_id,file_name,mime_type,file_size,md5_checksum,linked_at,web_view_link",
      )
      .eq("match_id", matchId)
      .maybeSingle();

    if (error) throw error;

    return NextResponse.json({
      media: data || null,
      streamUrl: data
        ? `/api/media/matches/${encodeURIComponent(matchId)}/stream`
        : null,
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
