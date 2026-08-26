import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

export const runtime = "nodejs";

type Source = {
  kind: "pole" | "club";
  teamId: string;
  playerId: string;
  teamName: string;
  category?: string | null;
  seasonLabel?: string | null;
};

function n(value: unknown) {
  const x = Number(value ?? 0);
  return Number.isFinite(x) ? x : 0;
}

function isoDate(value: unknown) {
  const text = String(value ?? "");
  return text ? text.slice(0, 10) : "";
}

async function rows(query: any): Promise<any[]> {
  try {
    const result = await query;
    if (result?.error) {
      console.error("Pôle longitudinal query:", result.error);
      return [];
    }
    return result?.data ?? [];
  } catch (error) {
    console.error("Pôle longitudinal query exception:", error);
    return [];
  }
}

async function one(query: any): Promise<any | null> {
  try {
    const result = await query;
    if (result?.error) return null;
    return result?.data ?? null;
  } catch {
    return null;
  }
}

async function canRead(db: any, userId: string, teamId: string, structureId: string) {
  const [owner, member, institution] = await Promise.all([
    one(db.from("teams").select("id").eq("id", teamId).eq("user_id", userId).maybeSingle()),
    one(db.from("team_members").select("id").eq("team_id", teamId).eq("user_id", userId).eq("status", "active").maybeSingle()),
    one(db.from("institutional_members").select("id").eq("structure_id", structureId).eq("user_id", userId).eq("status", "active").maybeSingle()),
  ]);
  return Boolean(owner || member || institution);
}

function statTotals(statRows: any[]) {
  const total = statRows.reduce(
    (acc, row) => {
      acc.games += 1;
      acc.minutes += n(row.minutes);
      acc.pts += n(row.pts);
      acc.reb += n(row.reb) || n(row.off_reb) + n(row.def_reb);
      acc.ast += n(row.ast);
      acc.stl += n(row.stl);
      acc.blk += n(row.blk);
      acc.turnovers += n(row.turnovers);
      acc.p2m += n(row.p2m); acc.p2a += n(row.p2a);
      acc.p3m += n(row.p3m); acc.p3a += n(row.p3a);
      acc.ftm += n(row.ftm); acc.fta += n(row.fta);
      return acc;
    },
    { games: 0, minutes: 0, pts: 0, reb: 0, ast: 0, stl: 0, blk: 0, turnovers: 0, p2m: 0, p2a: 0, p3m: 0, p3a: 0, ftm: 0, fta: 0 },
  );
  const g = Math.max(1, total.games);
  return {
    ...total,
    avgPts: total.games ? total.pts / g : 0,
    avgReb: total.games ? total.reb / g : 0,
    avgAst: total.games ? total.ast / g : 0,
    avgMinutes: total.games ? total.minutes / g : 0,
  };
}

export async function GET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Non connecté." }, { status: 401 });

  const url = new URL(req.url);
  const teamId = url.searchParams.get("teamId") || "";
  const playerId = url.searchParams.get("playerId") || "";
  if (!teamId || !playerId) return NextResponse.json({ error: "Équipe ou joueur manquant." }, { status: 400 });

  const db = createAdminClient() || supabase;

  const [asPoleMembership, asPartnerLink, asPoleLink] = await Promise.all([
    one(db.from("institutional_pole_player_memberships").select("structure_id,institutional_player_id,pole_team_id,pole_player_id,season_id").eq("pole_player_id", playerId).eq("active", true).maybeSingle()),
    one(db.from("institutional_pole_player_team_links").select("*").eq("partner_player_id", playerId).eq("active", true).maybeSingle()),
    one(db.from("institutional_pole_player_team_links").select("*").eq("pole_player_id", playerId).eq("active", true).maybeSingle()),
  ]);

  const seed = asPoleMembership || asPartnerLink || asPoleLink;
  if (!seed) return NextResponse.json({ linked: false, sources: [], timeline: [], alerts: [] });

  const structureId = String(seed.structure_id);
  const institutionalPlayerId = String(seed.institutional_player_id);
  if (!(await canRead(db, user.id, teamId, structureId))) {
    return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
  }

  const [memberships, links, institutionalPlayer, measurements, reports] = await Promise.all([
    rows(db.from("institutional_pole_player_memberships").select("*").eq("institutional_player_id", institutionalPlayerId).eq("active", true)),
    rows(db.from("institutional_pole_player_team_links").select("*").eq("institutional_player_id", institutionalPlayerId).eq("active", true)),
    one(db.from("institutional_players").select("*").eq("id", institutionalPlayerId).maybeSingle()),
    rows(db.from("institutional_player_measurements").select("*").eq("player_id", institutionalPlayerId).order("measured_at", { ascending: true })),
    rows(db.from("institutional_pole_sports_reports").select("*").eq("institutional_player_id", institutionalPlayerId).order("report_date", { ascending: false }).limit(300)),
  ]);

  const sourceSeed: Array<{ kind: "pole" | "club"; teamId: string; playerId: string; seasonId?: string | null }> = [];
  for (const m of memberships) {
    sourceSeed.push({ kind: "pole", teamId: String(m.pole_team_id), playerId: String(m.pole_player_id), seasonId: m.season_id ?? null });
  }
  for (const l of links) {
    sourceSeed.push({ kind: "club", teamId: String(l.partner_team_id), playerId: String(l.partner_player_id), seasonId: l.season_id ?? null });
  }

  const uniq = new Map<string, typeof sourceSeed[number]>();
  sourceSeed.forEach((s) => uniq.set(`${s.teamId}|${s.playerId}`, s));
  const rawSources = [...uniq.values()];
  const teamIds = [...new Set(rawSources.map((s) => s.teamId))];
  const playerIds = [...new Set(rawSources.map((s) => s.playerId))];

  const [teams, seasons] = await Promise.all([
    teamIds.length ? rows(db.from("teams").select("id,name,club_name,category,club_logo_url,metadata").in("id", teamIds)) : [],
    rows(db.from("institutional_player_tracking_seasons").select("id,season_label").eq("structure_id", structureId)),
  ]);
  const teamMap = new Map(teams.map((t) => [String(t.id), t]));
  const seasonMap = new Map(seasons.map((s) => [String(s.id), String(s.season_label || "")]));

  const sources: Source[] = rawSources.map((s) => ({
    kind: s.kind,
    teamId: s.teamId,
    playerId: s.playerId,
    teamName: teamMap.get(s.teamId)?.name || teamMap.get(s.teamId)?.club_name || (s.kind === "pole" ? "Équipe Pôle" : "Club partenaire"),
    category: teamMap.get(s.teamId)?.category ?? null,
    seasonLabel: s.seasonId ? seasonMap.get(String(s.seasonId)) || null : teamMap.get(s.teamId)?.metadata?.seasonLabel || null,
  }));

  const combo = new Set(sources.map((s) => `${s.teamId}|${s.playerId}`));

  const statsRaw = playerIds.length
    ? await rows(db.from("match_player_stats").select("*").in("player_id", playerIds).limit(5000))
    : [];
  const filteredStats0 = statsRaw.filter((r) => combo.has(`${String(r.team_id)}|${String(r.player_id)}`));
  const matchIds = [...new Set(filteredStats0.map((r) => String(r.match_id || "")).filter(Boolean))];
  const matches = matchIds.length
    ? await rows(db.from("match_stats").select("id,team_id,opponent,match_date,project_status,result,us_score,them_score").in("id", matchIds))
    : [];
  const matchMap = new Map(matches.map((m) => [String(m.id), m]));
  const statsRawFiltered = filteredStats0.filter((r) => matchMap.get(String(r.match_id))?.project_status !== "draft");

  const actionSets = await Promise.all(sources.map(async (source) => {
    const q = db.from("match_actions").select("*").eq("team_id", source.teamId)
      .or(`player_id.eq.${source.playerId},assist_player_id.eq.${source.playerId},rebound_player_id.eq.${source.playerId}`)
      .order("created_at", { ascending: false }).limit(800);
    return rows(q);
  }));
  const actions = actionSets.flat();

  const [loadSets, wellnessSets, presenceSets, testSets] = await Promise.all([
    Promise.all(sources.map((s) => rows(db.from("training_load_entries").select("*").eq("team_id", s.teamId).eq("player_id", s.playerId).order("load_date", { ascending: true }).limit(1500)))),
    Promise.all(sources.map((s) => rows(db.from("player_wellness_responses").select("*").eq("team_id", s.teamId).eq("player_id", s.playerId).order("response_date", { ascending: true }).limit(1500)))),
    Promise.all(sources.map((s) => rows(db.from("player_event_presence").select("*").eq("team_id", s.teamId).eq("player_id", s.playerId).order("updated_at", { ascending: true }).limit(1500)))),
    Promise.all(sources.map((s) => rows(db.from("player_tests").select("*").eq("team_id", s.teamId).eq("player_id", s.playerId).eq("category", "Anthropométrie").order("date", { ascending: true }).limit(500)))),
  ]);

  const loads = loadSets.flat();
  const wellness = wellnessSets.flat();
  const presence = presenceSets.flat();
  const playerTests = testSets.flat();

  const statsBySource = sources.map((source) => {
    const rowsForSource = statsRawFiltered.filter((r) => String(r.team_id) === source.teamId && String(r.player_id) === source.playerId);
    return { source, totals: statTotals(rowsForSource) };
  });
  const globalStats = statTotals(statsRawFiltered);

  const loadBySource = sources.map((source) => {
    const sourceLoads = loads.filter((r) => String(r.team_id) === source.teamId && String(r.player_id) === source.playerId);
    const sourceWellness = wellness.filter((r) => String(r.team_id) === source.teamId && String(r.player_id) === source.playerId);
    const last7Start = new Date(); last7Start.setDate(last7Start.getDate() - 6);
    const prev7Start = new Date(); prev7Start.setDate(prev7Start.getDate() - 13);
    const prev7End = new Date(); prev7End.setDate(prev7End.getDate() - 7);
    const a = last7Start.toISOString().slice(0,10), b = prev7Start.toISOString().slice(0,10), c = prev7End.toISOString().slice(0,10);
    const value = (r: any) => n(r.actual_load) || n(r.computed_load) || n(r.duration_minutes) * n(r.actual_rpe ?? r.rpe);
    const current = [...sourceLoads, ...sourceWellness].filter((r) => isoDate(r.load_date ?? r.response_date) >= a).reduce((sum, r) => sum + value(r), 0);
    const previous = [...sourceLoads, ...sourceWellness].filter((r) => { const d=isoDate(r.load_date ?? r.response_date); return d >= b && d <= c; }).reduce((sum, r) => sum + value(r), 0);
    const latestWellness = [...sourceWellness].reverse().find((r) => r.fatigue != null || r.rpe != null) || null;
    return { source, current7: Math.round(current), previous7: Math.round(previous), latestFatigue: latestWellness?.fatigue == null ? null : n(latestWellness.fatigue), latestRpe: latestWellness?.rpe == null ? null : n(latestWellness.rpe) };
  });

  const presenceBySource = sources.map((source) => {
    const rr = presence.filter((r) => String(r.team_id) === source.teamId && String(r.player_id) === source.playerId);
    const valid = rr.filter((r) => ["present","late","absent"].includes(String(r.status || "")));
    const positive = valid.filter((r) => ["present","late"].includes(String(r.status || ""))).length;
    return { source, total: valid.length, present: rr.filter((r) => r.status === "present").length, late: rr.filter((r) => r.status === "late").length, absent: rr.filter((r) => r.status === "absent").length, rate: valid.length ? Math.round(positive / valid.length * 100) : null };
  });

  const growthPoints: any[] = [];
  for (const m of measurements) {
    if (m.height_cm != null) growthPoints.push({ date: isoDate(m.measured_at), height: n(m.height_cm), weight: m.weight_kg == null ? null : n(m.weight_kg), wingspan: m.wingspan_cm == null ? null : n(m.wingspan_cm), source: "Pôle", seasonId: m.season_id || null });
  }
  for (const t of playerTests) {
    const label = String(t.label || "").toLowerCase();
    if (label.includes("taille") && n(t.value) > 0) {
      growthPoints.push({ date: isoDate(t.date), height: n(t.value), weight: null, wingspan: null, source: "Équipe", seasonId: null });
    }
  }
  growthPoints.sort((a,b) => a.date.localeCompare(b.date));
  const dedupGrowth = growthPoints.filter((p, idx, arr) => arr.findIndex((x) => x.date === p.date && Math.abs(x.height - p.height) < .01) === idx);

  const clipActions = actions.filter((a) => a.clip_start != null || a.clip_end != null || a.video_time != null || a.clip_id || a.sync_status === "synced");

  const timeline: any[] = [];
  for (const r of reports) timeline.push({ type: "report", date: isoDate(r.report_date), source: r.author_context === "pole" ? "Pôle" : "Club", title: r.report_type === "match" ? `Bilan match${r.opponent ? ` · ${r.opponent}` : ""}` : `Bilan entraînement${r.event_title ? ` · ${r.event_title}` : ""}`, detail: r.coach_comment || r.positives || r.improvement_areas || "" });
  for (const m of matches) {
    const stat = statsRawFiltered.find((r) => String(r.match_id) === String(m.id));
    if (!stat) continue;
    const source = sources.find((s) => s.teamId === String(stat.team_id) && s.playerId === String(stat.player_id));
    timeline.push({ type: "match", date: isoDate(m.match_date), source: source?.kind === "pole" ? "Pôle" : "Club", title: `Match · ${m.opponent || "Adversaire"}`, detail: `${n(stat.pts)} pts · ${n(stat.reb) || n(stat.off_reb)+n(stat.def_reb)} reb · ${n(stat.ast)} pd` });
  }
  for (const p of dedupGrowth) timeline.push({ type: "growth", date: p.date, source: p.source, title: `Mesure · ${p.height} cm`, detail: p.weight ? `${p.weight} kg` : "" });
  for (const w of wellness.slice(-80)) {
    if (!w.response_date) continue;
    const source = sources.find((s) => s.teamId === String(w.team_id) && s.playerId === String(w.player_id));
    timeline.push({ type: "load", date: isoDate(w.response_date), source: source?.kind === "pole" ? "Pôle" : "Club", title: w.response_kind === "post_session" ? `RPE ${w.rpe ?? "—"}/10` : "Wellness", detail: w.fatigue != null ? `Fatigue ${w.fatigue}/10` : (w.comment || "") });
  }
  timeline.sort((a,b) => (b.date || "").localeCompare(a.date || ""));

  const alerts: any[] = [];
  for (const l of loadBySource) {
    if (l.latestFatigue != null && l.latestFatigue >= 7) alerts.push({ level: "high", source: l.source.kind === "pole" ? "Pôle" : "Club", label: `Fatigue élevée (${l.latestFatigue}/10)` });
    if (l.previous7 > 0 && l.current7 > l.previous7 * 1.5 && l.current7 - l.previous7 > 250) alerts.push({ level: "watch", source: l.source.kind === "pole" ? "Pôle" : "Club", label: `Hausse de charge +${Math.round((l.current7/l.previous7-1)*100)}%` });
  }
  for (const p of presenceBySource) if (p.rate != null && p.total >= 4 && p.rate < 80) alerts.push({ level: "watch", source: p.source.kind === "pole" ? "Pôle" : "Club", label: `Présence en baisse (${p.rate}%)` });
  const watchReport = reports.find((r) => [r.involvement,r.behavior,r.intensity,r.physical_state].some((v) => String(v || "").toLowerCase().includes("surveiller")));
  if (watchReport) alerts.push({ level: "high", source: watchReport.author_context === "pole" ? "Pôle" : "Club", label: `Bilan « À surveiller » du ${isoDate(watchReport.report_date).split("-").reverse().join("/")}` });
  const clubSources = sources.filter((s) => s.kind === "club");
  if (clubSources.length) {
    const clubReports = reports.filter((r) => r.author_context === "club");
    const latest = clubReports[0]?.report_date ? new Date(`${clubReports[0].report_date}T12:00:00`).getTime() : 0;
    if (!latest || Date.now() - latest > 35 * 86400000) alerts.push({ level: "info", source: "Club", label: "Bilan club à actualiser" });
  }

  return NextResponse.json({
    linked: true,
    structureId,
    institutionalPlayerId,
    player: institutionalPlayer,
    sources,
    stats: { global: globalStats, bySource: statsBySource },
    loads: loadBySource,
    presence: presenceBySource,
    growth: dedupGrowth,
    reports,
    clips: clipActions.slice(0, 120).map((a) => ({ id: a.id, teamId: a.team_id, playerId: a.player_id, createdAt: a.created_at, clipStart: a.clip_start, clipEnd: a.clip_end, videoTime: a.video_time, title: a.clip_title || a.action_type || a.result || "Action vidéo", tempsFort: a.temps_fort || a.tempsFort || null, result: a.result || a.shot_result || null })),
    timeline: timeline.slice(0, 160),
    alerts,
  });
}
