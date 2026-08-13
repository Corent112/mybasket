
import { createClient } from "@/lib/supabase/server";
import { createGoogleDriveAdminClient } from "./admin";
import { decryptGoogleDriveToken } from "./crypto";

export const GOOGLE_DRIVE_SCOPE =
  "https://www.googleapis.com/auth/drive.file";

type TeamDriveConnection = {
  team_id: string;
  provider: "google_drive";
  connected_by: string;
  refresh_token_encrypted: string;
  scope: string | null;
  connected_at: string;
  revoked_at: string | null;
};

export async function requireGoogleDriveUser() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) throw new Error("UNAUTHENTICATED");
  return { supabase, user };
}

async function boolRpc(name: string, teamId: string) {
  const { supabase } = await requireGoogleDriveUser();
  const { data, error } = await supabase.rpc(name, { p_team_id: teamId });
  if (error) throw error;
  return data === true;
}

export const canAccessTeam = (teamId: string) =>
  boolRpc("can_access_team", teamId);

export const canManageTeamMedia = (teamId: string) =>
  boolRpc("can_manage_team_media", teamId);

export async function getTeamDriveConnection(
  teamId: string,
): Promise<TeamDriveConnection | null> {
  const admin = createGoogleDriveAdminClient();
  const { data, error } = await admin
    .from("team_drive_connections")
    .select(
      "team_id,provider,connected_by,refresh_token_encrypted,scope,connected_at,revoked_at",
    )
    .eq("team_id", teamId)
    .eq("provider", "google_drive")
    .is("revoked_at", null)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as TeamDriveConnection | null;
}

export async function refreshTeamGoogleDriveAccessToken(teamId: string) {
  const connection = await getTeamDriveConnection(teamId);
  if (!connection) throw new Error("GOOGLE_DRIVE_NOT_CONNECTED");

  const clientId = process.env.GOOGLE_DRIVE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_DRIVE_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    throw new Error("Configuration OAuth Google Drive manquante.");
  }

  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: decryptGoogleDriveToken(
        connection.refresh_token_encrypted,
      ),
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });

  const payload = await response.json();

  if (!response.ok || !payload.access_token) {
    if (payload?.error === "invalid_grant") {
      const admin = createGoogleDriveAdminClient();
      await admin
        .from("team_drive_connections")
        .update({ revoked_at: new Date().toISOString() })
        .eq("team_id", teamId)
        .eq("provider", "google_drive");
    }

    throw new Error(
      payload?.error_description ||
        payload?.error ||
        "Impossible de renouveler l'accès Google Drive.",
    );
  }

  return {
    accessToken: String(payload.access_token),
    expiresIn: Number(payload.expires_in || 3600),
  };
}

export async function getDriveFileMetadata(
  teamId: string,
  fileId: string,
) {
  const { accessToken } =
    await refreshTeamGoogleDriveAccessToken(teamId);

  const fields = [
    "id",
    "name",
    "mimeType",
    "size",
    "md5Checksum",
    "modifiedTime",
    "resourceKey",
    "webViewLink",
    "capabilities(canDownload)",
  ].join(",");

  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}`,
  );
  url.searchParams.set("supportsAllDrives", "true");
  url.searchParams.set("fields", fields);

  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload?.error?.message || "Fichier Google Drive introuvable.",
    );
  }

  return payload as {
    id: string;
    name: string;
    mimeType?: string;
    size?: string;
    md5Checksum?: string;
    modifiedTime?: string;
    resourceKey?: string;
    webViewLink?: string;
    capabilities?: { canDownload?: boolean };
  };
}

export async function proxyDriveFile(args: {
  teamId: string;
  fileId: string;
  resourceKey?: string | null;
  range?: string | null;
}) {
  const { accessToken } =
    await refreshTeamGoogleDriveAccessToken(args.teamId);

  const url = new URL(
    `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(args.fileId)}`,
  );
  url.searchParams.set("alt", "media");
  url.searchParams.set("supportsAllDrives", "true");
  if (args.resourceKey) {
    url.searchParams.set("resourceKey", args.resourceKey);
  }

  const headers = new Headers({
    Authorization: `Bearer ${accessToken}`,
  });
  if (args.range) headers.set("Range", args.range);

  return fetch(url, {
    method: "GET",
    headers,
    cache: "no-store",
  });
}
