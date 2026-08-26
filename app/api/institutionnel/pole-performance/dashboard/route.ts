import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

export const runtime = "nodejs";

async function one(query: any) {
  try { const r = await query; return r?.error ? null : r?.data ?? null; } catch { return null; }
}
async function rows(query: any) {
  try { const r = await query; return r?.error ? [] : r?.data ?? []; } catch { return []; }
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });
  const url = new URL(req.url);
  const structureId = url.searchParams.get("structureId") || "";
  const season = url.searchParams.get("season") || "";
  const db = createAdminClient() || supabase;

  const [structure, member] = await Promise.all([
    one(db.from("institutional_structures").select("id,structure_type").eq("id", structureId).maybeSingle()),
    one(db.from("institutional_members").select("id").eq("structure_id", structureId).eq("user_id", user.id).eq("status", "active").maybeSingle()),
  ]);
  if (!structure || structure.structure_type !== "league" || !member) {
    return NextResponse.json({ error: "Pôle / Performance réservé aux Ligues." }, { status: 403 });
  }

  const [teamLinks, memberships, playerLinks, reports] = await Promise.all([
    rows(db.from("institutional_pole_teams").select("*").eq("structure_id", structureId).eq("active", true)),
    rows(db.from("institutional_pole_player_memberships").select("*").eq("structure_id", structureId).eq("active", true)),
    rows(db.from("institutional_pole_player_team_links").select("*").eq("structure_id", structureId).eq("active", true)),
    rows(db.from("institutional_pole_sports_reports").select("*").eq("structure_id", structureId).order("report_date", { ascending: false }).limit(1000)),
  ]);

  const currentTeamLinks = season ? teamLinks.filter((x:any) => String(x.season_label || "") === season) : teamLinks;
  const poleTeamIds = new Set(currentTeamLinks.filter((x:any) => x.team_kind === "pole").map((x:any) => String(x.team_id)));
  const partnerTeamIds = new Set(currentTeamLinks.filter((x:any) => x.team_kind === "partner").map((x:any) => String(x.team_id)));
  const currentMemberships = memberships.filter((m:any) => poleTeamIds.has(String(m.pole_team_id)));
  const currentPlayerLinks = playerLinks.filter((l:any) => partnerTeamIds.has(String(l.partner_team_id)) && poleTeamIds.has(String(l.pole_team_id)));
  const institutionalIds = new Set(currentMemberships.map((m:any) => String(m.institutional_player_id)));
  const currentReports = reports.filter((r:any) => institutionalIds.has(String(r.institutional_player_id)));

  const allTeamIds = [...new Set([...poleTeamIds, ...partnerTeamIds])];
  const seven = new Date(); seven.setDate(seven.getDate() - 6);
  const sevenIso = seven.toISOString().slice(0,10);
  const matches = allTeamIds.length
    ? await rows(db.from("match_stats").select("id,team_id,match_date,project_status").in("team_id", allTeamIds).gte("match_date", sevenIso))
    : [];
  const doneMatches = matches.filter((m:any) => m.project_status !== "draft");
  const matchIds = doneMatches.map((m:any) => m.id);

  const rosterPairs = new Map<string,string>();
  currentMemberships.forEach((m:any) => rosterPairs.set(`${m.pole_team_id}|${m.pole_player_id}`, String(m.institutional_player_id)));
  currentPlayerLinks.forEach((l:any) => rosterPairs.set(`${l.partner_team_id}|${l.partner_player_id}`, String(l.institutional_player_id)));
  const rosterPlayerIds = [...new Set([...currentMemberships.map((m:any)=>String(m.pole_player_id)), ...currentPlayerLinks.map((l:any)=>String(l.partner_player_id))])];

  const stats = matchIds.length && rosterPlayerIds.length
    ? await rows(db.from("match_player_stats").select("match_id,team_id,player_id,minutes,pts").in("match_id", matchIds).in("player_id", rosterPlayerIds))
    : [];
  const polistsPlayed = new Set(stats.filter((r:any) => rosterPairs.has(`${r.team_id}|${r.player_id}`)).map((r:any) => rosterPairs.get(`${r.team_id}|${r.player_id}`)));

  const actionSets = await Promise.all(currentPlayerLinks.slice(0,80).map((l:any) => rows(
    db.from("match_actions").select("id,match_id,team_id,player_id,assist_player_id,rebound_player_id,clip_start,clip_end,video_time,created_at")
      .eq("team_id", l.partner_team_id)
      .or(`player_id.eq.${l.partner_player_id},assist_player_id.eq.${l.partner_player_id},rebound_player_id.eq.${l.partner_player_id}`)
      .gte("created_at", `${sevenIso}T00:00:00`).limit(300)
  )));
  const newClips = actionSets.flat().filter((a:any) => a.clip_start != null || a.clip_end != null || a.video_time != null).length;

  const recentReports = currentReports.filter((r:any) => String(r.report_date || "") >= sevenIso);
  const watchReports = currentReports.filter((r:any) => [r.involvement,r.behavior,r.intensity,r.physical_state].some((v:any) => String(v || "").toLowerCase().includes("surveiller")));

  const partnerPlayers: string[] = currentPlayerLinks.map((l:any) => String(l.institutional_player_id));
  const latestClubReport = new Map<string,string>();
  currentReports.filter((r:any) => r.author_context === "club").forEach((r:any) => {
    const id = String(r.institutional_player_id);
    const d = String(r.report_date || "");
    if (!latestClubReport.has(id) || d > String(latestClubReport.get(id))) latestClubReport.set(id,d);
  });
  const staleClub = [...new Set<string>(partnerPlayers)].filter((id: string) => {
    const d = latestClubReport.get(id);
    return !d || Date.now() - new Date(`${d}T12:00:00`).getTime() > 35*86400000;
  }).length;

  return NextResponse.json({
    polists: currentMemberships.length,
    poleTeams: poleTeamIds.size,
    partnerTeams: partnerTeamIds.size,
    partnerLinks: currentPlayerLinks.length,
    playedThisWeek: polistsPlayed.size,
    matchesThisWeek: doneMatches.length,
    newReports: recentReports.length,
    newClips,
    alerts: {
      watchReports: watchReports.length,
      staleClubReports: staleClub,
      total: watchReports.length + staleClub,
    },
  });
}
