// lib/club-stats-live-bridge.ts
"use client";

import { createClient } from "@/lib/supabase/client";
import type { ClubMatch } from "@/lib/club-performance-links";

export type LiveBridgeMatch = {
  liveMatchId: string;
  clubId: string;
  teamId: string | null;
  clubMatchId: string | null;
  createdAt: string | null;
};

function sb() {
  return createClient();
}

function fail(context: string, error: any): never {
  console.error(context, error);
  throw new Error(error?.message || error?.details || error?.hint || error?.code || context);
}

export async function listLinkedLiveMatches(clubId: string): Promise<LiveBridgeMatch[]> {
  const { data, error } = await sb()
    .from("club_live_matches_bridge")
    .select("*")
    .eq("club_id", clubId)
    .order("created_at", { ascending: false });

  if (error) {
    // Vue absente ou table live pas encore créée : on renvoie vide, pas de crash UI.
    console.warn("LIST_LINKED_LIVE_MATCHES_WARNING", error);
    return [];
  }

  return (data ?? []).map((row: any) => ({
    liveMatchId: String(row.live_match_id),
    clubId: String(row.club_id),
    teamId: row.team_id ?? null,
    clubMatchId: row.club_match_id ?? null,
    createdAt: row.created_at ?? null,
  }));
}

export async function syncLiveStatsToClubMatch(clubMatchId: string): Promise<void> {
  const { error } = await sb().rpc("sync_live_stats_to_club_match", {
    p_club_match_id: clubMatchId,
  });

  if (error) fail("SYNC_LIVE_STATS_TO_CLUB_MATCH_ERROR", error);
}

export async function attachLiveMatchToClub(input: {
  liveMatchId: string;
  clubMatch: ClubMatch;
}): Promise<void> {
  const supabase = sb();

  await supabase
    .from("match_stats")
    .update({
      club_id: input.clubMatch.clubId,
      team_id: input.clubMatch.teamId,
      club_match_id: input.clubMatch.id,
    })
    .eq("id", input.liveMatchId);

  await supabase
    .from("match_player_stats")
    .update({
      club_id: input.clubMatch.clubId,
      team_id: input.clubMatch.teamId,
      club_match_id: input.clubMatch.id,
    })
    .eq("match_id", input.liveMatchId);

  await supabase
    .from("match_actions")
    .update({
      club_id: input.clubMatch.clubId,
      team_id: input.clubMatch.teamId,
      club_match_id: input.clubMatch.id,
    })
    .eq("match_id", input.liveMatchId);
}
