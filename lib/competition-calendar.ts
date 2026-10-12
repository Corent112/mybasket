import type { SupabaseClient } from "@supabase/supabase-js";

export type OfficialCalendarMatch = {
  sourceKey: string; date: string; time: string; homeAway: string;
  opponent: string; ourScore?: number | null; opponentScore?: number | null;
};

async function officialEventId(name: string): Promise<string> {
  // UUID v5, URL namespace: concurrent imports share the existing id primary key.
  const namespace = new Uint8Array([0x6b,0xa7,0xb8,0x11,0x9d,0xad,0x11,0xd1,0x80,0xb4,0x00,0xc0,0x4f,0xd4,0x30,0xc8]);
  const encoded = new TextEncoder().encode(name);
  const input = new Uint8Array(namespace.length + encoded.length);
  input.set(namespace); input.set(encoded, namespace.length);
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-1", input)).slice(0, 16);
  hash[6] = (hash[6] & 15) | 80; hash[8] = (hash[8] & 63) | 128;
  const hex = Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

/** Only existing calendar columns are used. Official identity lives in description. */
export async function syncCompetitionCalendar(
  supabase: SupabaseClient, teamId: string, userId: string,
  source: "ffbb" | "lnb", matches: OfficialCalendarMatch[],
): Promise<number> {
  const today = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
  let saved = 0;
  const seen = new Set<string>();
  for (const match of matches) {
    if (!match.sourceKey || seen.has(match.sourceKey)) continue;
    seen.add(match.sourceKey);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(match.date) || match.date < today || match.ourScore != null) continue;
    const marker = `[mybasket-match:${source}:${match.sourceKey}]`;
    const escapeLike = (value: string) => value.replace(/[\\%_]/g, char => `\\${char}`);
    const existing = await supabase.from("calendar_events").select("id")
      .eq("team_id", teamId).eq("user_id", userId)
      .like("description", `%${escapeLike(marker)}%`).limit(1);
    if (existing.error) throw new Error(`Lecture du calendrier impossible : ${existing.error.message}`);
    let id = existing.data?.[0]?.id;
    if (!id) {
      // Reuse an earlier imported event only; manual events remain intact.
      const legacy = await supabase.from("calendar_events").select("id,description")
        .eq("team_id", teamId).eq("user_id", userId).eq("event_type", "game")
        .eq("event_date", match.date).ilike("title", `%${escapeLike(match.opponent)}%`);
      if (legacy.error) throw new Error(`Lecture du calendrier impossible : ${legacy.error.message}`);
      const prefix = new RegExp(`^(Match ${source.toUpperCase()}|Synchronisé ${source.toUpperCase()})`);
      id = legacy.data?.find(row => prefix.test(String(row.description || "")))?.id;
    }
    const eventId = id || await officialEventId(JSON.stringify([userId, teamId, source, match.sourceKey]));
    const payload = {
      id: eventId,
      user_id: userId, owner_id: userId, team_id: teamId,
      title: `Match ${match.homeAway === "away" ? "@" : "vs"} ${match.opponent}`,
      description: `Synchronisé ${source.toUpperCase()} · ${marker}`,
      event_date: match.date, start_time: /^\d{2}:\d{2}/.test(match.time || "") ? match.time.slice(0, 5) : null,
      end_time: null, location: match.homeAway === "away" ? "Extérieur" : "Domicile",
      event_type: "game", session_id: null, visibility: "private", updated_at: new Date().toISOString(),
    };
    const result = id
      ? await supabase.from("calendar_events").update(payload).eq("id", id).eq("team_id", teamId).eq("user_id", userId)
      : await supabase.from("calendar_events").upsert(payload, { onConflict: "id" });
    if (result.error) throw new Error(`Enregistrement du calendrier impossible : ${result.error.message}`);
    saved++;
  }
  return saved;
}
