import type { SupabaseClient } from "@supabase/supabase-js";
import type { MatchProjectFingerprint } from "./local-match-project";

export type MatchLocalMediaRow = {
  match_id: string;
  team_id: string;
  user_id: string;
  source_kind: "local";
  file_name: string | null;
  file_size: number | null;
  file_duration: number | null;
  file_last_modified: number | null;
  file_mime_type: string | null;
  file_partial_hash: string | null;
  updated_at: string;
};

export const loadMatchLocalMedia = async (
  supabase: SupabaseClient,
  matchId: string,
): Promise<MatchLocalMediaRow | null> => {
  const { data, error } = await supabase
    .from("livestat_match_local_media")
    .select("*")
    .eq("match_id", matchId)
    .maybeSingle();

  if (error) throw error;
  return (data ?? null) as MatchLocalMediaRow | null;
};

export const saveMatchLocalMedia = async (
  supabase: SupabaseClient,
  args: {
    matchId: string;
    teamId: string;
    fingerprint: MatchProjectFingerprint;
  },
) => {
  const auth = await supabase.auth.getUser();
  const userId = auth.data.user?.id;
  if (!userId) throw new Error("Utilisateur non connecté.");

  const f = args.fingerprint;

  const { error } = await supabase
    .from("livestat_match_local_media")
    .upsert(
      {
        match_id: args.matchId,
        team_id: args.teamId,
        user_id: userId,
        source_kind: "local",
        file_name: f.name,
        file_size: f.size,
        file_duration: f.duration,
        file_last_modified: f.lastModified,
        file_mime_type: f.mimeType,
        file_partial_hash: f.partialHash,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "match_id" },
    );

  if (error) throw error;
};

export const fingerprintFromRow = (
  row: MatchLocalMediaRow | null,
): MatchProjectFingerprint | null =>
  row
    ? {
        name: row.file_name || "",
        size: Number(row.file_size || 0),
        duration: Number(row.file_duration || 0),
        lastModified: Number(row.file_last_modified || 0),
        mimeType: row.file_mime_type || "video/mp4",
        partialHash: row.file_partial_hash || "",
      }
    : null;
