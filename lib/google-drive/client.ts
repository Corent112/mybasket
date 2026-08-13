
export type GoogleDrivePickedVideo = {
  id: string;
  name: string;
  mimeType?: string;
  url?: string;
};

export function googleDriveFileStreamUrl(
  teamId: string,
  fileId: string,
) {
  return (
    `/api/google-drive/files/${encodeURIComponent(fileId)}/stream` +
    `?teamId=${encodeURIComponent(teamId)}`
  );
}

export function matchMediaStreamUrl(matchId: string) {
  return `/api/media/matches/${encodeURIComponent(matchId)}/stream`;
}

export async function linkGoogleDriveFileToMatch(args: {
  matchId: string;
  teamId: string;
  fileId: string;
}) {
  const response = await fetch(
    `/api/media/matches/${encodeURIComponent(args.matchId)}/google-drive`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        teamId: args.teamId,
        fileId: args.fileId,
      }),
    },
  );

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(
      payload.error || "Impossible de lier la vidéo Google Drive.",
    );
  }

  return payload.media;
}
