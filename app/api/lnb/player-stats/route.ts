import { createClient } from "@/lib/supabase/server";
import { readLnbPlayerStats, resolveLnbPlayer, normalizeLnbName } from "@/lib/lnb-player-stats";
import { createHash } from "node:crypto";
export const maxDuration = 60;
// Stable owner + official person identity prevents duplicate inserts on retry.
function lnbProfileId(userId: string, personId: number) {
  const bytes = createHash("sha1").update(`mybasket:lnb-player:${userId}:${personId}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50; bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export async function POST(request: Request) {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
    const { teamId } = await request.json();
    if (typeof teamId !== "string") return Response.json({ error: "Équipe invalide." }, { status: 400 });
    const team = await sb.from("teams").select("id,user_id,metadata,team_type,name").eq("id", teamId).eq("user_id", user.id).single();
    if (team.error || !team.data) return Response.json({ error: "Modification réservée au propriétaire." }, { status: 403 });
    if (!(team.data.team_type === "scout" || team.data.metadata?.isScoutTeam === true || team.data.metadata?.scout === true)) return Response.json({ error: "Création réservée aux équipes scoutées." }, { status: 400 });
    const connections = await sb.from("ffbb_team_connections").select("source_url,last_synced_at").eq("team_id", teamId).order("last_synced_at", { ascending: false });
    if (connections.error) throw connections.error;
    const sourceUrl = connections.data?.find(row => /^https:\/\/(www\.)?lnb\.fr\//i.test(row.source_url))?.source_url;
    if (!sourceUrl) throw new Error("Connecte d’abord cette équipe à la LNB.");
    const official = await readLnbPlayerStats(sourceUrl);
    const owned = await sb.from("players").select("id,team_id,first_name,last_name,birth_date,metadata").eq("user_id", user.id);
    if (owned.error) throw owned.error;
    const links = team.data.metadata?.lnbPlayerLinks || {};
    // Resolve all ambiguous names before writing any profile.
    const plan = official.players.map((row: any) => {
      const id = String(row.person.external_id);
      if (Object.prototype.hasOwnProperty.call(links, id) && links[id] === null) return null;
      const explicit = (owned.data || []).find(p => p.id === links[id]);
      const identity = (owned.data || []).filter(p => Number(p.metadata?.lnbExternalId) === row.person.external_id);
      const names = (owned.data || []).filter(p => normalizeLnbName(`${p.first_name || p.metadata?.firstName || ""} ${p.last_name || p.metadata?.lastName || ""}`) === normalizeLnbName(`${row.person.first_name} ${row.person.family_name}`));
      const existing = explicit || (identity.length === 1 ? identity[0] : names.length === 1 ? names[0] : undefined);
      if (!explicit && (identity.length > 1 || (!identity.length && names.length > 1) || (!identity.length && existing?.birth_date && row.person.dob && String(existing.birth_date).slice(0, 10) !== row.person.dob.slice(0, 10)) || (existing?.metadata?.lnbExternalId && Number(existing.metadata.lnbExternalId) !== row.person.external_id))) throw new Error(`Association à vérifier pour ${row.person.first_name} ${row.person.family_name}. Choisis sa fiche dans le tableau avant de créer les autres.`);
      return { row, existing, id: existing?.id || lnbProfileId(user.id, row.person.external_id) };
    }).filter(Boolean);
    let created = 0, reused = 0;
    const savedLinks: Record<string, string> = {};
    for (const item of plan) {
      const { row, id, existing } = item;
      if (!existing) {
        const num = /^\d+$/.test(row.player_role?.shirt_number || "") ? Number(row.player_role.shirt_number) : null;
        const metadata = { firstName: row.person.first_name, lastName: row.person.family_name, num, photo: row.person.photo?.md || null, club: team.data.name, dob: row.person.dob?.slice(0, 10) || "", lnbExternalId: row.person.external_id, primaryTeamId: teamId, additionalTeamIds: [] };
        const insert = await sb.from("players").upsert({ id, user_id: user.id, team_id: teamId, first_name: row.person.first_name, last_name: row.person.family_name, number: num, photo_url: metadata.photo, birth_date: metadata.dob || null, position_primary: row.player_role?.playing_position || "", height: row.person.height == null ? "" : String(row.person.height), age: row.person.age ?? null, status: "Disponible", metadata }, { onConflict: "id", ignoreDuplicates: true });
        if (insert.error) throw insert.error;
        created++;
      } else reused++;
      const current = await sb.from("players").select("team_id,metadata").eq("id", id).eq("user_id", user.id).single();
      if (current.error || !current.data) throw new Error("Fiche joueur non enregistrée.");
      const additional = Array.from(new Set([...(current.data.metadata?.additionalTeamIds || []), ...(current.data.team_id === teamId ? [] : [teamId])]));
      const update = await sb.from("players").update({ metadata: { ...current.data.metadata, lnbExternalId: row.person.external_id, primaryTeamId: current.data.team_id, additionalTeamIds: additional } }).eq("id", id).eq("user_id", user.id);
      if (update.error) throw update.error;
      savedLinks[String(row.person.external_id)] = id;
    }
    const latest = await sb.from("teams").select("metadata").eq("id", teamId).eq("user_id", user.id).single();
    if (latest.error) throw latest.error;
    const update = await sb.from("teams").update({ metadata: { ...latest.data.metadata, lnbPlayerLinks: { ...latest.data.metadata?.lnbPlayerLinks, ...savedLinks } } }).eq("id", teamId).eq("user_id", user.id).select("id");
    if (update.error || !update.data?.length) throw new Error(update.error?.message || "Liaisons non enregistrées.");
    return Response.json({ created, reused });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Création impossible. Les fiches déjà créées sont conservées ; tu peux relancer." }, { status: 400 }); }
}
export async function GET(request: Request) {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
    const params = new URL(request.url).searchParams;
    const teamId = params.get("teamId");
    let sourceUrl = params.get("sourceUrl") || "";
    let localPlayers: any[] = [], links = {}, canEdit = false, isScout = false;
    if (teamId) {
      const team = await sb.from("teams").select("id,user_id,metadata,team_type").eq("id", teamId).single();
      if (team.error || !team.data) return Response.json({ error: "Équipe inaccessible." }, { status: 403 });
      const connections = await sb.from("ffbb_team_connections").select("source_url,last_synced_at").eq("team_id", teamId).order("last_synced_at", { ascending: false });
      if (connections.error) throw connections.error;
      sourceUrl = (connections.data || []).find(row => /^https:\/\/(www\.)?lnb\.fr\//i.test(row.source_url))?.source_url || "";
      if (!sourceUrl) return Response.json({ connected: false });
      const players = await sb.from("players").select("id,team_id,first_name,last_name,metadata").eq("user_id", team.data.user_id);
      if (players.error) throw players.error;
      localPlayers = (players.data || []).filter(p => p.team_id === teamId || p.metadata?.additionalTeamIds?.includes(teamId));
      links = team.data.metadata?.lnbPlayerLinks || {};
      canEdit = team.data.user_id === user.id;
      isScout = team.data.team_type === "scout" || team.data.metadata?.isScoutTeam === true || team.data.metadata?.scout === true;
    }
    const personId = params.get("personId") ? Number(params.get("personId")) : undefined;
    if (personId !== undefined && (!Number.isSafeInteger(personId) || personId <= 0)) throw new Error("Joueur LNB invalide.");
    const stats = await readLnbPlayerStats(sourceUrl, personId, params.get("refresh") === "1");
    return Response.json({ ...stats, connected: true, canEdit, isScout, localPlayers: localPlayers.map(p => ({ id: p.id, name: `${p.first_name || p.metadata?.firstName || ""} ${p.last_name || p.metadata?.lastName || ""}`.trim() })), players: stats.players.map((row: any) => ({ ...row, playerId: resolveLnbPlayer(row.person, localPlayers, links) })) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Statistiques LNB indisponibles." }, { status: 502 });
  }
}
export async function PATCH(request: Request) {
  try {
    const sb = await createClient();
    const { data: { user } } = await sb.auth.getUser();
    if (!user) return Response.json({ error: "Connexion requise." }, { status: 401 });
    const { teamId, personId, playerId } = await request.json();
    if (!Number.isSafeInteger(personId) || personId <= 0 || typeof teamId !== "string" || (playerId !== null && typeof playerId !== "string")) return Response.json({ error: "Association invalide." }, { status: 400 });
    const team = await sb.from("teams").select("metadata").eq("id", teamId).eq("user_id", user.id).single();
    if (team.error || !team.data) return Response.json({ error: "Modification réservée au propriétaire." }, { status: 403 });
    if (playerId) {
      const player = await sb.from("players").select("team_id,metadata").eq("id", playerId).eq("user_id", user.id).single();
      if (player.error || !player.data || (player.data.team_id !== teamId && !player.data.metadata?.additionalTeamIds?.includes(teamId))) return Response.json({ error: "Le joueur doit appartenir à cette équipe." }, { status: 400 });
      const existing = Object.entries(team.data.metadata?.lnbPlayerLinks || {}).find(([id, value]) => id !== String(personId) && value === playerId);
      if (existing) return Response.json({ error: "Cette fiche est déjà associée à un autre joueur LNB." }, { status: 409 });
    }
    const saved = await sb.from("teams").update({ metadata: { ...team.data.metadata, lnbPlayerLinks: { ...team.data.metadata?.lnbPlayerLinks, [personId]: playerId } } }).eq("id", teamId).eq("user_id", user.id).select("id");
    if (saved.error || !saved.data?.length) throw new Error(saved.error?.message || "Association non enregistrée.");
    return Response.json({ success: true });
  } catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Association impossible." }, { status: 400 }); }
}
