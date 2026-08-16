"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import ShotChart, { SHOT_ZONES, type ShotLike } from "@/components/prise-stats-pro/ShotChart";
import type { Team } from "@/types/player";

type MatchRow = {
  id: string;
  opponent?: string | null;
  match_date?: string | null;
  us_score?: number | null;
  them_score?: number | null;
  video_provider?: string | null;
  video_url?: string | null;
  youtube_url?: string | null;
  video_filename?: string | null;
  google_drive_file_id?: string | null;
  drive_file_id?: string | null;
  video_file_id?: string | null;
  [key: string]: unknown;
};

type ActionRow = {
  id?: string | null;
  match_id: string;
  player_id?: string | null;
  assist_player_id?: string | null;
  rebound_player_id?: string | null;
  context?: string | null;
  inbound?: string | null;
  temps_fort?: string | null;
  coverage?: string | null;
  systeme_slot?: string | null;
  systeme_id?: string | null;
  systeme_name?: string | null;
  action_type?: string | null;
  shot_type?: string | null;
  shot_result?: string | null;
  special_case?: string | null;
  rebound_type?: string | null;
  shot_zone_id?: string | null;
  court_x?: number | null;
  court_y?: number | null;
  quarter?: number | null;
  clock?: string | null;
  possession_start?: number | null;
  possession_end?: number | null;
  video_time?: number | null;
  clip_start?: number | null;
  clip_end?: number | null;
  sync_status?: string | null;
};

type PlayerStatRow = {
  match_id: string;
  player_id: string;
  pts?: number | null;
  p2m?: number | null;
  p2a?: number | null;
  p3m?: number | null;
  p3a?: number | null;
  ftm?: number | null;
  fta?: number | null;
  off_reb?: number | null;
  def_reb?: number | null;
  reb?: number | null;
  ast?: number | null;
  stl?: number | null;
  blk?: number | null;
  turnovers?: number | null;
  pf?: number | null;
  present?: boolean | null;
};

type Filters = {
  matchId: string;
  playerId: string;
  context: string;
  system: string;
  tempo: string;
  action: string;
  shotResult: string;
  shotType: string;
  inbound: string;
  coverage: string;
  specialCase: string;
  reboundType: string;
};

const EMPTY_FILTERS: Filters = {
  matchId: "",
  playerId: "",
  context: "",
  system: "",
  tempo: "",
  action: "",
  shotResult: "",
  shotType: "",
  inbound: "",
  coverage: "",
  specialCase: "",
  reboundType: "",
};


type ClipSelection = {
  title: string;
  actions: ActionRow[];
};

type ResolvedVideoSource = {
  kind: "drive" | "direct" | "youtube" | "unknown";
  src: string;
  label: string;
};

function extractDriveFileId(raw: unknown): string {
  const value = String(raw || "").trim();
  if (!value) return "";

  if (/^[a-zA-Z0-9_-]{20,}$/.test(value)) return value;

  const patterns = [
    /\/file\/d\/([a-zA-Z0-9_-]+)/,
    /[?&]id=([a-zA-Z0-9_-]+)/,
    /\/d\/([a-zA-Z0-9_-]+)/,
    /drive\.google\.com\/open\?id=([a-zA-Z0-9_-]+)/,
  ];

  for (const pattern of patterns) {
    const match = value.match(pattern);
    if (match?.[1]) return match[1];
  }

  return "";
}

function resolveMatchVideo(match: MatchRow | undefined, teamId: string): ResolvedVideoSource {
  if (!match) return { kind: "unknown", src: "", label: "Vidéo introuvable" };

  const candidates = [
    match.google_drive_file_id,
    match.drive_file_id,
    match.video_file_id,
    match["googleDriveFileId"],
    match["driveFileId"],
    match["file_id"],
    match.video_url,
    match["drive_url"],
  ];

  for (const candidate of candidates) {
    const fileId = extractDriveFileId(candidate);
    if (fileId) {
      return {
        kind: "drive",
        src: `/api/google-drive/files/${encodeURIComponent(fileId)}/stream?teamId=${encodeURIComponent(teamId)}`,
        label: String(match.video_filename || "Vidéo Google Drive"),
      };
    }
  }

  const youtube = String(match.youtube_url || match["youtubeUrl"] || "").trim();
  if (youtube) return { kind: "youtube", src: youtube, label: "YouTube" };

  const direct = String(match.video_url || match["videoUrl"] || "").trim();
  if (/^https?:\/\//i.test(direct)) {
    return {
      kind: /youtu\.?be/i.test(direct) ? "youtube" : "direct",
      src: direct,
      label: String(match.video_filename || "Vidéo du match"),
    };
  }

  return { kind: "unknown", src: "", label: "Vidéo introuvable" };
}

function actionHasClip(action: ActionRow) {
  return (
    action.clip_start != null ||
    action.clip_end != null ||
    action.video_time != null ||
    action.sync_status === "synced"
  );
}

type ShotBenchmark = {
  target: number;
  greenFrom: number;
  redBelow: number;
};

type ShotBenchmarks = {
  three: ShotBenchmark;
  twoOutside: ShotBenchmark;
  twoInside: ShotBenchmark;
};

const DEFAULT_BENCHMARKS: ShotBenchmarks = {
  three: { target: 35, greenFrom: 35, redBelow: 28 },
  twoOutside: { target: 45, greenFrom: 45, redBelow: 35 },
  twoInside: { target: 55, greenFrom: 55, redBelow: 45 },
};

const INSIDE_2PT_ZONES = new Set(["z1", "z2", "z3", "z4"]);
const OUTSIDE_2PT_ZONES = new Set(["z5", "z6", "z7", "z8", "z9"]);

function benchmarkKeyForZone(zoneId: string): keyof ShotBenchmarks {
  const zoneNumber = Number(zoneId.replace("z", ""));
  if (zoneNumber >= 10) return "three";
  if (INSIDE_2PT_ZONES.has(zoneId)) return "twoInside";
  return "twoOutside";
}

function zoneStatus(
  percent: number,
  benchmark: ShotBenchmark,
): "positive" | "neutral" | "negative" {
  if (percent >= benchmark.greenFrom) return "positive";
  if (percent < benchmark.redBelow) return "negative";
  return "neutral";
}

function isMade(action: ActionRow) {
  return /made|marqu|réussi|reussi|in/i.test(String(action.shot_result || ""));
}

function shotPoints(action: ActionRow) {
  if (!isMade(action)) return 0;
  return /3/i.test(String(action.shot_type || "")) ? 3 : 2;
}

function isTurnover(action: ActionRow) {
  return /perte|turnover|bp/i.test(String(action.action_type || ""));
}

function isTerminalAction(action: ActionRow) {
  if (action.possession_end != null) return true;
  if (action.shot_type || action.action_type === "tir") return true;
  if (isTurnover(action)) return true;
  return false;
}

function num(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function pct(made: number, attempted: number) {
  if (!attempted) return "0%";
  return `${Math.round((made / attempted) * 100)}%`;
}

function uniq(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.map((v) => String(v || "").trim()).filter(Boolean))).sort((a, b) =>
    a.localeCompare(b, "fr", { sensitivity: "base" }),
  );
}

function human(value: string) {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (m) => m.toUpperCase());
}


function normalizeTagValue(value: unknown) {
  return String(value || "")
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase("fr");
}

function systemDisplayName(action: ActionRow) {
  const explicitName = String(action.systeme_name || "").trim();
  if (explicitName) return explicitName;

  // Only fall back when LiveStats did not store a real system name.
  const systemId = String(action.systeme_id || "").trim();
  if (systemId) return systemId;

  const slot = String(action.systeme_slot || "").trim();
  return slot ? `Système ${slot.replace(/[^0-9A-Za-zÀ-ÿ -]/g, "")}` : "";
}

function sameTag(a: unknown, b: unknown) {
  return normalizeTagValue(a) === normalizeTagValue(b);
}

export default function TeamAdvancedStats({
  teamId,
  team,
}: {
  teamId: string;
  team: Team;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStatRow[]>([]);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [benchmarks, setBenchmarks] = useState<ShotBenchmarks>(DEFAULT_BENCHMARKS);
  const [benchmarkOpen, setBenchmarkOpen] = useState(false);
  const [clipSelection, setClipSelection] = useState<ClipSelection | null>(null);
  const [activeClipIndex, setActiveClipIndex] = useState(0);
  const clipVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      setError("");

      try {
        const { data: matchData, error: matchError } = await supabase
          .from("match_stats")
          .select("*")
          .eq("team_id", teamId)
          .order("match_date", { ascending: false });

        if (matchError) throw matchError;
        const loadedMatches = (matchData || []) as MatchRow[];
        const matchIds = loadedMatches.map((m) => m.id).filter(Boolean);

        let loadedActions: ActionRow[] = [];
        let loadedPlayerStats: PlayerStatRow[] = [];

        if (matchIds.length) {
          const [{ data: actionData, error: actionError }, { data: statData, error: statError }] =
            await Promise.all([
              supabase
                .from("match_actions")
                .select(
                  "id,match_id,player_id,assist_player_id,rebound_player_id,context,inbound,temps_fort,coverage,systeme_slot,systeme_id,systeme_name,action_type,shot_type,shot_result,special_case,rebound_type,shot_zone_id,court_x,court_y,quarter,clock,possession_start,possession_end,video_time,clip_start,clip_end,sync_status",
                )
                .in("match_id", matchIds),
              supabase
                .from("match_player_stats")
                .select(
                  "match_id,player_id,pts,p2m,p2a,p3m,p3a,ftm,fta,off_reb,def_reb,reb,ast,stl,blk,turnovers,pf,present",
                )
                .in("match_id", matchIds),
            ]);

          if (actionError) throw actionError;
          if (statError) throw statError;
          loadedActions = (actionData || []) as ActionRow[];
          loadedPlayerStats = (statData || []) as PlayerStatRow[];
        }

        if (!active) return;
        setMatches(loadedMatches);
        setActions(loadedActions);
        setPlayerStats(loadedPlayerStats);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Impossible de charger les statistiques avancées.");
      } finally {
        if (active) setLoading(false);
      }
    }

    void load();
    return () => {
      active = false;
    };
  }, [supabase, teamId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(`mybasket:shot-benchmarks:${teamId}`);
      if (!raw) return;
      const parsed = JSON.parse(raw) as Partial<ShotBenchmarks>;
      setBenchmarks({
        three: { ...DEFAULT_BENCHMARKS.three, ...(parsed.three || {}) },
        twoOutside: { ...DEFAULT_BENCHMARKS.twoOutside, ...(parsed.twoOutside || {}) },
        twoInside: { ...DEFAULT_BENCHMARKS.twoInside, ...(parsed.twoInside || {}) },
      });
    } catch {
      // Valeurs par défaut conservées.
    }
  }, [teamId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(
      `mybasket:shot-benchmarks:${teamId}`,
      JSON.stringify(benchmarks),
    );
  }, [benchmarks, teamId]);

  const playerMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const player of team.players || []) {
      const name = `${player.firstName || ""} ${player.lastName || ""}`.trim() || "Joueur";
      map.set(String(player.id), name);
      if (player.supabasePlayerId) map.set(String(player.supabasePlayerId), name);
    }
    return map;
  }, [team.players]);

  const selectedMatchIds = useMemo(() => {
    if (filters.matchId) return new Set([filters.matchId]);
    return new Set(matches.map((m) => m.id));
  }, [filters.matchId, matches]);

  const filteredActions = useMemo(() => {
    return actions.filter((a) => {
      if (!selectedMatchIds.has(a.match_id)) return false;
      if (filters.playerId && a.player_id !== filters.playerId) return false;
      if (filters.context && !sameTag(a.context, filters.context)) return false;

      // IMPORTANT: a system is grouped by its LiveStats name, never by Système 1/2/3/4.
      // Example: Match 1 slot 1 = "Corne" and Match 2 slot 4 = "Corne"
      // are the SAME system in advanced stats.
      const system = systemDisplayName(a);
      if (filters.system && !sameTag(system, filters.system)) return false;

      if (filters.tempo && !sameTag(a.temps_fort, filters.tempo)) return false;
      if (filters.action && !sameTag(a.action_type, filters.action)) return false;
      if (filters.shotResult && !sameTag(a.shot_result, filters.shotResult)) return false;
      if (filters.shotType && !sameTag(a.shot_type, filters.shotType)) return false;
      if (filters.inbound && !sameTag(a.inbound, filters.inbound)) return false;
      if (filters.coverage && !sameTag(a.coverage, filters.coverage)) return false;
      if (filters.specialCase && !sameTag(a.special_case, filters.specialCase)) return false;
      if (filters.reboundType && !sameTag(a.rebound_type, filters.reboundType)) return false;
      return true;
    });
  }, [actions, filters, selectedMatchIds]);

  const filteredPlayerStats = useMemo(() => {
    return playerStats.filter((row) => {
      if (!selectedMatchIds.has(row.match_id)) return false;
      if (filters.playerId && row.player_id !== filters.playerId) return false;
      return row.present !== false;
    });
  }, [filters.playerId, playerStats, selectedMatchIds]);

  const liveStatsOptions = useMemo(() => {
    const canonicalUnique = (values: Array<string | null | undefined>) => {
      const map = new Map<string, string>();

      for (const raw of values) {
        const value = String(raw || "").trim();
        if (!value) continue;
        const key = normalizeTagValue(value);
        if (!map.has(key)) map.set(key, value);
      }

      return Array.from(map.values()).sort((a, b) =>
        a.localeCompare(b, "fr", { sensitivity: "base" }),
      );
    };

    return {
      // LiveStats system names are canonical across matches.
      // Slot 1/2/3/4 is deliberately ignored when a name exists.
      systems: canonicalUnique(actions.map(systemDisplayName)),
      tempos: canonicalUnique(actions.map((a) => a.temps_fort)),
      actionTypes: canonicalUnique(actions.map((a) => a.action_type)),
      contexts: canonicalUnique(actions.map((a) => a.context)),
      shotResults: canonicalUnique(actions.map((a) => a.shot_result)),
      shotTypes: canonicalUnique(actions.map((a) => a.shot_type)),
      inbounds: canonicalUnique(actions.map((a) => a.inbound)),
      coverages: canonicalUnique(actions.map((a) => a.coverage)),
      specialCases: canonicalUnique(actions.map((a) => a.special_case)),
      reboundTypes: canonicalUnique(actions.map((a) => a.rebound_type)),
    };
  }, [actions]);

  const {
    systems,
    tempos,
    actionTypes,
    contexts,
    shotResults,
    shotTypes,
    inbounds,
    coverages,
    specialCases,
    reboundTypes,
  } = liveStatsOptions;

  const systemStats = useMemo(() => {
    const map = new Map<
      string,
      {
        actions: number;
        made: number;
        shots: number;
        turnovers: number;
        points: number;
        possessions: number;
      }
    >();

    for (const a of filteredActions) {
      const key = systemDisplayName(a) || "Sans système";
      const current = map.get(key) || {
        actions: 0,
        made: 0,
        shots: 0,
        turnovers: 0,
        points: 0,
        possessions: 0,
      };

      current.actions += 1;

      if (a.action_type === "tir" || a.shot_type) {
        current.shots += 1;
        if (isMade(a)) current.made += 1;
        current.points += shotPoints(a);
      }

      if (isTurnover(a)) current.turnovers += 1;
      if (isTerminalAction(a)) current.possessions += 1;

      map.set(key, current);
    }

    return Array.from(map.entries())
      .map(([name, value]) => ({
        name,
        ...value,
        ppp: value.possessions ? value.points / value.possessions : 0,
      }))
      .sort((a, b) => b.ppp - a.ppp || b.actions - a.actions);
  }, [filteredActions]);

  const tempoStats = useMemo(() => {
    const map = new Map<
      string,
      { actions: number; points: number; possessions: number; turnovers: number }
    >();

    for (const a of filteredActions) {
      const key = a.temps_fort || "Sans temps fort";
      const current = map.get(key) || {
        actions: 0,
        points: 0,
        possessions: 0,
        turnovers: 0,
      };

      current.actions += 1;
      current.points += shotPoints(a);
      if (isTurnover(a)) current.turnovers += 1;
      if (isTerminalAction(a)) current.possessions += 1;
      map.set(key, current);
    }

    return Array.from(map.entries())
      .map(([name, value]) => ({
        name,
        ...value,
        ppp: value.possessions ? value.points / value.possessions : 0,
      }))
      .sort((a, b) => b.ppp - a.ppp || b.actions - a.actions);
  }, [filteredActions]);

  const playerRows = useMemo(() => {
    const map = new Map<
      string,
      {
        playerId: string;
        name: string;
        games: Set<string>;
        pts: number;
        p2m: number;
        p2a: number;
        p3m: number;
        p3a: number;
        ftm: number;
        fta: number;
        reb: number;
        ast: number;
        stl: number;
        blk: number;
        turnovers: number;
      }
    >();

    for (const row of filteredPlayerStats) {
      const key = String(row.player_id);
      const current = map.get(key) || {
        playerId: key,
        name: playerMap.get(key) || "Joueur",
        games: new Set<string>(),
        pts: 0,
        p2m: 0,
        p2a: 0,
        p3m: 0,
        p3a: 0,
        ftm: 0,
        fta: 0,
        reb: 0,
        ast: 0,
        stl: 0,
        blk: 0,
        turnovers: 0,
      };
      current.games.add(row.match_id);
      current.pts += num(row.pts);
      current.p2m += num(row.p2m);
      current.p2a += num(row.p2a);
      current.p3m += num(row.p3m);
      current.p3a += num(row.p3a);
      current.ftm += num(row.ftm);
      current.fta += num(row.fta);
      current.reb += num(row.reb);
      current.ast += num(row.ast);
      current.stl += num(row.stl);
      current.blk += num(row.blk);
      current.turnovers += num(row.turnovers);
      map.set(key, current);
    }

    return Array.from(map.values()).sort((a, b) => b.pts - a.pts);
  }, [filteredPlayerStats, playerMap]);

  const shots = useMemo<ShotLike[]>(() => {
    return filteredActions
      .filter((a) => a.action_type === "tir" || a.shot_type)
      .map((a) => ({
        shot_type: a.shot_type,
        shot_result: a.shot_result,
        shot_zone_id: a.shot_zone_id,
        court_x: a.court_x,
        court_y: a.court_y,
      }));
  }, [filteredActions]);

  const madeShots = useMemo(
    () =>
      filteredActions.filter(
        (a) =>
          (a.action_type === "tir" || a.shot_type) &&
          /made|marqu|réussi|reussi|in/i.test(String(a.shot_result || "")),
      ).length,
    [filteredActions],
  );

  const shotZoneRows = useMemo(() => {
    return SHOT_ZONES.map((zone) => {
      const zoneShots = filteredActions.filter((a) => a.shot_zone_id === zone.id);
      const made = zoneShots.filter(isMade).length;
      const attempts = zoneShots.length;
      const percent = attempts ? Math.round((made / attempts) * 100) : 0;
      const benchmark = benchmarks[benchmarkKeyForZone(zone.id)];

      return {
        zone,
        attempts,
        made,
        percent,
        status: zoneStatus(percent, benchmark),
      };
    });
  }, [benchmarks, filteredActions]);

  const overallPossessions = useMemo(
    () => filteredActions.filter(isTerminalAction).length,
    [filteredActions],
  );

  const overallPoints = useMemo(
    () => filteredActions.reduce((total, action) => total + shotPoints(action), 0),
    [filteredActions],
  );

  const overallPpp = overallPossessions ? overallPoints / overallPossessions : 0;


  const matchMap = useMemo(
    () => new Map(matches.map((match) => [match.id, match])),
    [matches],
  );

  const openClips = (title: string, rows: ActionRow[]) => {
    const unique = Array.from(
      new Map(
        rows.map((action, index) => [
          String(action.id || `${action.match_id}-${action.quarter}-${action.clock}-${index}`),
          action,
        ]),
      ).values(),
    ).sort((a, b) => {
      const ma = matches.findIndex((match) => match.id === a.match_id);
      const mb = matches.findIndex((match) => match.id === b.match_id);
      if (ma !== mb) return ma - mb;
      return num(a.video_time ?? a.clip_start) - num(b.video_time ?? b.clip_start);
    });

    if (!unique.length) return;

    setActiveClipIndex(0);
    setClipSelection({ title, actions: unique });
  };

  const openFilteredClips = (title: string, predicate?: (action: ActionRow) => boolean) => {
    openClips(title, predicate ? filteredActions.filter(predicate) : filteredActions);
  };

  const activeClip = clipSelection?.actions[activeClipIndex];
  const activeMatch = activeClip ? matchMap.get(activeClip.match_id) : undefined;
  const activeVideoSource = resolveMatchVideo(activeMatch, teamId);

  useEffect(() => {
    const video = clipVideoRef.current;
    if (!video || !activeClip || activeVideoSource.kind === "youtube") return;

    const start = num(activeClip.clip_start ?? activeClip.video_time);
    const end = activeClip.clip_end == null ? null : num(activeClip.clip_end);

    const seek = () => {
      if (Number.isFinite(start) && start >= 0) {
        try {
          video.currentTime = start;
        } catch {
          // Le navigateur réessaiera après loadedmetadata.
        }
      }
    };

    const stopAtEnd = () => {
      if (end != null && end > start && video.currentTime >= end) {
        video.pause();
      }
    };

    video.addEventListener("loadedmetadata", seek);
    video.addEventListener("timeupdate", stopAtEnd);
    if (video.readyState >= 1) seek();

    return () => {
      video.removeEventListener("loadedmetadata", seek);
      video.removeEventListener("timeupdate", stopAtEnd);
    };
  }, [activeClip, activeVideoSource.kind, activeVideoSource.src]);

  const reset = () => setFilters(EMPTY_FILTERS);

  if (loading) {
    return <div className="advanced-loading">Chargement des statistiques avancées…</div>;
  }

  return (
    <section className="advanced-stats">
      <div className="advanced-head">
        <div>
          <span className="advanced-kicker">ANALYSE LIVE & SAISON</span>
          <h2>Statistiques avancées</h2>
          <p>
            Tous les filtres proviennent directement du codage LiveStats.
            Les systèmes sont regroupés par leur nom, même si leur numéro de slot change d’un match à l’autre.
          </p>
        </div>
        <div className="advanced-actions">
          <button type="button" className="target-button" onClick={() => setBenchmarkOpen(true)}>
            ➕ Ajouter des critères
          </button>
          <button type="button" className="reset" onClick={reset}>
            Réinitialiser les filtres
          </button>
        </div>
      </div>

      {error ? <div className="advanced-error">{error}</div> : null}

      {benchmarkOpen ? (
        <div className="benchmark-backdrop" onClick={() => setBenchmarkOpen(false)}>
          <div className="benchmark-modal" onClick={(event) => event.stopPropagation()}>
            <div className="benchmark-head">
              <div>
                <span>OBJECTIFS DE TIR</span>
                <h3>Définir les critères de couleur</h3>
                <p>Renseigne les pourcentages qui déterminent quand une zone passe en vert, orange ou rouge.</p>
              </div>
              <button type="button" onClick={() => setBenchmarkOpen(false)}>×</button>
            </div>

            <div className="benchmark-grid">
              <BenchmarkEditor
                title="3 points"
                value={benchmarks.three}
                onChange={(value) => setBenchmarks((prev) => ({ ...prev, three: value }))}
              />
              <BenchmarkEditor
                title="2 points extérieur"
                value={benchmarks.twoOutside}
                onChange={(value) => setBenchmarks((prev) => ({ ...prev, twoOutside: value }))}
              />
              <BenchmarkEditor
                title="2 points intérieur"
                value={benchmarks.twoInside}
                onChange={(value) => setBenchmarks((prev) => ({ ...prev, twoInside: value }))}
              />
            </div>

            <div className="benchmark-legend">
              <span className="legend-positive">Vert : ≥ seuil positif</span>
              <span className="legend-neutral">Orange : zone neutre</span>
              <span className="legend-negative">Rouge : &lt; seuil négatif</span>
            </div>

            <div className="benchmark-footer">
              <button
                type="button"
                className="benchmark-default"
                onClick={() => setBenchmarks(DEFAULT_BENCHMARKS)}
              >
                Valeurs par défaut
              </button>
              <button type="button" className="benchmark-save" onClick={() => setBenchmarkOpen(false)}>
                Enregistrer
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {clipSelection ? (
        <div className="clip-browser-backdrop" onClick={() => setClipSelection(null)}>
          <section className="clip-browser-modal" onClick={(event) => event.stopPropagation()}>
            <header className="clip-browser-head">
              <div>
                <span>VIDÉO · FILTRE ACTIF</span>
                <h3>{clipSelection.title}</h3>
                <p>
                  {clipSelection.actions.length} action{clipSelection.actions.length > 1 ? "s" : ""} correspondante{clipSelection.actions.length > 1 ? "s" : ""}
                  {" · "}
                  {clipSelection.actions.filter(actionHasClip).length} avec timecode vidéo
                </p>
              </div>
              <button type="button" onClick={() => setClipSelection(null)} aria-label="Fermer">×</button>
            </header>

            <div className="clip-browser-layout">
              <div className="clip-player-column">
                {activeClip ? (
                  <>
                    <div className="clip-player">
                      {activeVideoSource.kind === "drive" || activeVideoSource.kind === "direct" ? (
                        <video
                          key={`${activeClip.match_id}-${activeClipIndex}-${activeVideoSource.src}`}
                          ref={clipVideoRef}
                          controls
                          playsInline
                          preload="metadata"
                          src={activeVideoSource.src}
                        />
                      ) : activeVideoSource.kind === "youtube" ? (
                        <div className="clip-external">
                          <strong>Vidéo YouTube</strong>
                          <p>Le timecode du clip est {Math.round(num(activeClip.clip_start ?? activeClip.video_time))} s.</p>
                          <a href={activeVideoSource.src} target="_blank" rel="noreferrer">Ouvrir la vidéo ↗</a>
                        </div>
                      ) : (
                        <div className="clip-external missing">
                          <strong>Source vidéo non retrouvée</strong>
                          <p>
                            L’action est bien codée, mais aucun identifiant de vidéo n’est enregistré sur ce match.
                          </p>
                        </div>
                      )}
                    </div>

                    <div className="active-clip-meta">
                      <ClipMeta
                        action={activeClip}
                        match={activeMatch}
                        playerName={activeClip.player_id ? playerMap.get(String(activeClip.player_id)) : undefined}
                      />
                    </div>
                  </>
                ) : null}
              </div>

              <div className="clip-list">
                {clipSelection.actions.map((action, index) => {
                  const match = matchMap.get(action.match_id);
                  const playerName = action.player_id
                    ? playerMap.get(String(action.player_id))
                    : undefined;

                  return (
                    <button
                      type="button"
                      key={String(action.id || `${action.match_id}-${index}`)}
                      className={`clip-row ${index === activeClipIndex ? "active" : ""}`}
                      onClick={() => setActiveClipIndex(index)}
                    >
                      <span className={`clip-dot ${actionHasClip(action) ? "ready" : ""}`} />
                      <div>
                        <strong>
                          {playerName || "Équipe"} · {human(String(action.action_type || action.shot_type || "Action"))}
                        </strong>
                        <small>
                          {match?.opponent || "Match"}
                          {action.quarter ? ` · Q${action.quarter}` : ""}
                          {action.clock ? ` · ${action.clock}` : ""}
                        </small>
                        <small>
                          {[systemDisplayName(action), action.temps_fort]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </small>
                      </div>
                      <b>
                        {actionHasClip(action)
                          ? `${Math.round(num(action.clip_start ?? action.video_time))}s`
                          : "Sans clip"}
                      </b>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>
        </div>
      ) : null}

      <div className="filters">
        <Filter label="Match" value={filters.matchId} onChange={(v) => setFilters((p) => ({ ...p, matchId: v }))}>
          <option value="">Tous les matchs</option>
          {matches.map((m) => (
            <option key={m.id} value={m.id}>
              {m.match_date ? new Date(m.match_date).toLocaleDateString("fr-FR") : "Match"} · {m.opponent || "Adversaire"}
            </option>
          ))}
        </Filter>

        <Filter label="Joueur" value={filters.playerId} onChange={(v) => setFilters((p) => ({ ...p, playerId: v }))}>
          <option value="">Tous les joueurs</option>
          {(team.players || []).map((p) => {
            const id = String(p.supabasePlayerId || p.id);
            return (
              <option key={id} value={id}>
                {p.num != null ? `#${p.num} · ` : ""}{p.firstName} {p.lastName}
              </option>
            );
          })}
        </Filter>

        <Filter label="Contexte" value={filters.context} onChange={(v) => setFilters((p) => ({ ...p, context: v }))}>
          <option value="">Attaque + défense</option>
          {contexts.map((v) => <option key={v} value={v}>{human(v)}</option>)}
        </Filter>

        <Filter label="Système" value={filters.system} onChange={(v) => setFilters((p) => ({ ...p, system: v }))}>
          <option value="">Tous les systèmes</option>
          {systems.map((v) => <option key={v} value={v}>{v}</option>)}
        </Filter>

        <Filter label="Temps fort" value={filters.tempo} onChange={(v) => setFilters((p) => ({ ...p, tempo: v }))}>
          <option value="">Tous les temps forts</option>
          {tempos.map((v) => <option key={v} value={v}>{human(v)}</option>)}
        </Filter>

        <Filter label="Action" value={filters.action} onChange={(v) => setFilters((p) => ({ ...p, action: v }))}>
          <option value="">Toutes les actions</option>
          {actionTypes.map((v) => <option key={v} value={v}>{human(v)}</option>)}
        </Filter>

        <Filter label="Résultat tir" value={filters.shotResult} onChange={(v) => setFilters((p) => ({ ...p, shotResult: v }))}>
          <option value="">Tous les résultats</option>
          {shotResults.map((v) => <option key={v} value={v}>{human(v)}</option>)}
        </Filter>

        {shotTypes.length > 0 ? (
          <Filter label="Type de tir" value={filters.shotType} onChange={(v) => setFilters((p) => ({ ...p, shotType: v }))}>
            <option value="">Tous les types de tir</option>
            {shotTypes.map((v) => <option key={v} value={v}>{human(v)}</option>)}
          </Filter>
        ) : null}

        {inbounds.length > 0 ? (
          <Filter label="Remise en jeu" value={filters.inbound} onChange={(v) => setFilters((p) => ({ ...p, inbound: v }))}>
            <option value="">Toutes les remises en jeu</option>
            {inbounds.map((v) => <option key={v} value={v}>{human(v)}</option>)}
          </Filter>
        ) : null}

        {coverages.length > 0 ? (
          <Filter label="Couverture" value={filters.coverage} onChange={(v) => setFilters((p) => ({ ...p, coverage: v }))}>
            <option value="">Toutes les couvertures</option>
            {coverages.map((v) => <option key={v} value={v}>{human(v)}</option>)}
          </Filter>
        ) : null}

        {specialCases.length > 0 ? (
          <Filter label="Cas spécial" value={filters.specialCase} onChange={(v) => setFilters((p) => ({ ...p, specialCase: v }))}>
            <option value="">Tous les cas spéciaux</option>
            {specialCases.map((v) => <option key={v} value={v}>{human(v)}</option>)}
          </Filter>
        ) : null}

        {reboundTypes.length > 0 ? (
          <Filter label="Type de rebond" value={filters.reboundType} onChange={(v) => setFilters((p) => ({ ...p, reboundType: v }))}>
            <option value="">Tous les rebonds</option>
            {reboundTypes.map((v) => <option key={v} value={v}>{human(v)}</option>)}
          </Filter>
        ) : null}
      </div>

      <div className="summary-grid">
        <MiniStat
          label="Matchs"
          value={selectedMatchIds.size}
          onClick={() => openFilteredClips("Toutes les actions des matchs filtrés")}
        />
        <MiniStat
          label="Actions"
          value={filteredActions.length}
          onClick={() => openFilteredClips("Toutes les actions filtrées")}
        />
        <MiniStat
          label="Tirs"
          value={shots.length}
          onClick={() => openFilteredClips("Tous les tirs", (a) => a.action_type === "tir" || Boolean(a.shot_type))}
        />
        <MiniStat
          label="% tirs"
          value={pct(madeShots, shots.length)}
          onClick={() => openFilteredClips("Tous les tirs", (a) => a.action_type === "tir" || Boolean(a.shot_type))}
        />
        <MiniStat
          label="Possessions"
          value={overallPossessions}
          onClick={() => openFilteredClips("Fins de possession", isTerminalAction)}
        />
        <MiniStat
          label="PPP"
          value={overallPpp.toFixed(2)}
          onClick={() => openFilteredClips("Possessions utilisées pour le PPP", isTerminalAction)}
        />
      </div>

      <div className="two-cols">
        <Panel title="Rentabilité par système" subtitle="PPP, possessions, tirs, réussite et pertes de balle">
          {systemStats.length ? (
            <div className="simple-table">
              <div className="tr th system-profit">
                <span>Système</span><span>Poss.</span><span>Pts</span><span>PPP</span><span>Tirs</span><span>%</span><span>BP</span>
              </div>
              {systemStats.map((row) => {
                const systemPredicate = (a: ActionRow) =>
                  sameTag(systemDisplayName(a) || "Sans système", row.name);
                const systemActions = filteredActions.filter(systemPredicate);

                return (
                  <div className="tr system-profit" key={row.name}>
                    <button className="stat-link name" type="button" onClick={() => openClips(`${row.name} · toutes les actions`, systemActions)}>{row.name}</button>
                    <button className="stat-link" type="button" onClick={() => openClips(`${row.name} · possessions`, systemActions.filter(isTerminalAction))}>{row.possessions}</button>
                    <button className="stat-link" type="button" onClick={() => openClips(`${row.name} · paniers / points`, systemActions.filter((a) => shotPoints(a) > 0))}>{row.points}</button>
                    <button className={`stat-link ppp ${row.ppp >= 1 ? "good" : row.ppp >= .8 ? "mid" : "bad"}`} type="button" onClick={() => openClips(`${row.name} · PPP ${row.ppp.toFixed(2)}`, systemActions.filter(isTerminalAction))}>{row.ppp.toFixed(2)}</button>
                    <button className="stat-link" type="button" onClick={() => openClips(`${row.name} · tirs`, systemActions.filter((a) => a.action_type === "tir" || Boolean(a.shot_type)))}>{row.made}/{row.shots}</button>
                    <button className="stat-link" type="button" onClick={() => openClips(`${row.name} · tirs`, systemActions.filter((a) => a.action_type === "tir" || Boolean(a.shot_type)))}>{pct(row.made, row.shots)}</button>
                    <button className="stat-link" type="button" onClick={() => openClips(`${row.name} · pertes de balle`, systemActions.filter(isTurnover))}>{row.turnovers}</button>
                  </div>
                );
              })}
            </div>
          ) : <Empty />}
        </Panel>

        <Panel title="Rentabilité par temps fort" subtitle="PPP et efficacité de chaque séquence">
          {tempoStats.length ? (
            <div className="tempo-list">
              {tempoStats.map((row) => {
                const max = Math.max(...tempoStats.map((r) => r.actions), 1);
                return (
                  <button
                    type="button"
                    className="tempo-row profitability clickable-tempo"
                    key={row.name}
                    onClick={() =>
                      openClips(
                        `${human(row.name)} · ${row.ppp.toFixed(2)} PPP`,
                        filteredActions.filter((a) => (a.temps_fort || "Sans temps fort") === row.name),
                      )
                    }
                  >
                    <div>
                      <strong>{human(row.name)}</strong>
                      <span>{row.possessions} poss. · {row.points} pts · {row.turnovers} BP</span>
                      <b className={`tempo-ppp ${row.ppp >= 1 ? "good" : row.ppp >= .8 ? "mid" : "bad"}`}>
                        {row.ppp.toFixed(2)} PPP
                      </b>
                    </div>
                    <div className="tempo-bar"><i style={{ width: `${(row.actions / max) * 100}%` }} /></div>
                  </button>
                );
              })}
            </div>
          ) : <Empty />}
        </Panel>
      </div>

      <Panel title="Joueurs & actions" subtitle="Box-score consolidée selon les filtres actifs">
        {playerRows.length ? (
          <div className="player-table-wrap">
            <table className="player-table">
              <thead>
                <tr>
                  <th>Joueur</th><th>MJ</th><th>PTS</th><th>2PTS</th><th>3PTS</th><th>LF</th>
                  <th>REB</th><th>PD</th><th>INT</th><th>CTR</th><th>BP</th>
                </tr>
              </thead>
              <tbody>
                {playerRows.map((row) => {
                  const own = (a: ActionRow) => String(a.player_id || "") === row.playerId;
                  const assists = (a: ActionRow) => String(a.assist_player_id || "") === row.playerId;
                  const rebounds = (a: ActionRow) =>
                    String(a.rebound_player_id || a.player_id || "") === row.playerId &&
                    /rebond/i.test(String(a.action_type || a.rebound_type || ""));
                  const shots2 = (a: ActionRow) => own(a) && /2/i.test(String(a.shot_type || ""));
                  const shots3 = (a: ActionRow) => own(a) && /3/i.test(String(a.shot_type || ""));

                  return (
                    <tr key={row.playerId}>
                      <td><button className="table-link player-name" type="button" onClick={() => openClips(`${row.name} · toutes les actions`, filteredActions.filter(own))}><strong>{row.name}</strong></button></td>
                      <td><button className="table-link" type="button" onClick={() => openClips(`${row.name} · actions`, filteredActions.filter(own))}>{row.games.size}</button></td>
                      <td><button className="table-link" type="button" onClick={() => openClips(`${row.name} · paniers`, filteredActions.filter((a) => own(a) && shotPoints(a) > 0))}>{row.pts}</button></td>
                      <td><button className="table-link" type="button" onClick={() => openClips(`${row.name} · tirs à 2 points`, filteredActions.filter(shots2))}>{row.p2m}/{row.p2a} <small>{pct(row.p2m, row.p2a)}</small></button></td>
                      <td><button className="table-link" type="button" onClick={() => openClips(`${row.name} · tirs à 3 points`, filteredActions.filter(shots3))}>{row.p3m}/{row.p3a} <small>{pct(row.p3m, row.p3a)}</small></button></td>
                      <td><button className="table-link" type="button" onClick={() => openClips(`${row.name} · lancers francs`, filteredActions.filter((a) => own(a) && /lf|ft|lancer/i.test(String(a.action_type || a.shot_type || ""))))}>{row.ftm}/{row.fta} <small>{pct(row.ftm, row.fta)}</small></button></td>
                      <td><button className="table-link" type="button" onClick={() => openClips(`${row.name} · rebonds`, filteredActions.filter(rebounds))}>{row.reb}</button></td>
                      <td><button className="table-link" type="button" onClick={() => openClips(`${row.name} · passes décisives`, filteredActions.filter(assists))}>{row.ast}</button></td>
                      <td><button className="table-link" type="button" onClick={() => openClips(`${row.name} · interceptions`, filteredActions.filter((a) => own(a) && /interception|steal|int/i.test(String(a.action_type || ""))))}>{row.stl}</button></td>
                      <td><button className="table-link" type="button" onClick={() => openClips(`${row.name} · contres`, filteredActions.filter((a) => own(a) && /contre|block|blk/i.test(String(a.action_type || ""))))}>{row.blk}</button></td>
                      <td><button className="table-link" type="button" onClick={() => openClips(`${row.name} · pertes de balle`, filteredActions.filter((a) => own(a) && isTurnover(a)))}>{row.turnovers}</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : <Empty />}
      </Panel>

      <div className="criteria-toolbar">
        <div>
          <span className="criteria-kicker">CRITÈRES DE COULEUR</span>
          <strong>Shot chart</strong>
          <small>
            3PTS : vert ≥ {benchmarks.three.greenFrom}% · orange {benchmarks.three.redBelow}%–{benchmarks.three.greenFrom - 1}% · rouge &lt; {benchmarks.three.redBelow}%
          </small>
          <small>
            2PTS ext. : vert ≥ {benchmarks.twoOutside.greenFrom}% · orange {benchmarks.twoOutside.redBelow}%–{benchmarks.twoOutside.greenFrom - 1}% · rouge &lt; {benchmarks.twoOutside.redBelow}%
          </small>
          <small>
            2PTS int. : vert ≥ {benchmarks.twoInside.greenFrom}% · orange {benchmarks.twoInside.redBelow}%–{benchmarks.twoInside.greenFrom - 1}% · rouge &lt; {benchmarks.twoInside.redBelow}%
          </small>
        </div>

        <button type="button" onClick={() => setBenchmarkOpen(true)}>
          + Ajouter des critères
        </button>
      </div>

      <div className="shot-layout">
        <Panel title="Shot chart" subtitle={`${madeShots}/${shots.length} tirs réussis · ${pct(madeShots, shots.length)}`}>
          <div className="shot-chart-wrap">
            <ShotChart mode="analysis" shots={shots} showPoints={false} showStats={false} size="lg" />
            <div className="shot-zone-overlay" aria-hidden="true">
              {shotZoneRows.map(({ zone, attempts, percent, status }) => (
                <button
                  type="button"
                  key={zone.id}
                  className={`zone-badge ${status} ${attempts === 0 ? "empty" : ""}`}
                  style={{
                    left: `${(zone.px / 1577) * 100}%`,
                    top: `${(zone.py / 997) * 100}%`,
                  }}
                  disabled={attempts === 0}
                  onClick={() =>
                    openClips(
                      `${zone.label} · ${attempts} tir${attempts > 1 ? "s" : ""} · ${percent}%`,
                      filteredActions.filter((a) => a.shot_zone_id === zone.id),
                    )
                  }
                >
                  <strong>{attempts}</strong>
                  <span>{attempts ? `${percent}%` : "—"}</span>
                </button>
              ))}
            </div>
          </div>
        </Panel>

        <Panel title="Détail par zone" subtitle="Réussite sur les zones réellement utilisées">
          {shotZoneRows.length ? (
            <div className="zone-list">
              {shotZoneRows.filter((row) => row.attempts > 0).map(({ zone, attempts, made, percent, status }) => {
                const target = benchmarks[benchmarkKeyForZone(zone.id)].target;
                return (
                  <button
                    type="button"
                    className={`zone-row ${status} clickable-zone-row`}
                    key={zone.id}
                    onClick={() =>
                      openClips(
                        `${zone.label} · ${attempts} tir${attempts > 1 ? "s" : ""} · ${percent}%`,
                        filteredActions.filter((a) => a.shot_zone_id === zone.id),
                      )
                    }
                  >
                    <span className="zone-number">{zone.num}</span>
                    <div><strong>{zone.label}</strong><small>Objectif {target}%</small></div>
                    <b>{made}/{attempts}</b>
                    <em>{percent}%</em>
                  </button>
                );
              })}
            </div>
          ) : <Empty />}
        </Panel>
      </div>

      <style jsx>{`
        .advanced-stats { display:grid; gap:18px; }
        .advanced-head { display:flex; justify-content:space-between; gap:20px; align-items:flex-start; padding:20px; border:1px solid #eadfd5; border-radius:20px; background:#fff; }
        .advanced-kicker { color:#d4a24c; font-size:.66rem; font-weight:950; letter-spacing:.12em; }
        .advanced-head h2 { margin:5px 0 4px; color:#6b1a2c; font-size:1.55rem; }
        .advanced-head p { margin:0; color:#7d6f68; font-size:.82rem; }
        .advanced-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; justify-content:flex-end; }
        .reset, .target-button { min-height:38px; padding:0 14px; border:1px solid #e1d4cc; border-radius:999px; background:#fff; color:#6b1a2c; font-weight:900; cursor:pointer; white-space:nowrap; }
        .target-button { border-color:#d4a24c; background:#fff9ef; }
        .advanced-error { padding:12px 14px; border-radius:12px; background:#fff1f2; color:#a3283d; font-weight:800; }
        .filters { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; padding:14px; border:1px solid #eadfd5; border-radius:18px; background:#fffaf5; }
        .summary-grid { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:10px; }
        .two-cols, .shot-layout { display:grid; grid-template-columns:minmax(0,1.15fr) minmax(320px,.85fr); gap:18px; }
        .simple-table { display:grid; }
        .tr { display:grid; grid-template-columns:minmax(150px,1.5fr) repeat(4,minmax(55px,.55fr)); gap:8px; align-items:center; min-height:44px; padding:0 8px; border-bottom:1px solid #f1e7e0; font-size:.76rem; }
        .tr.system-profit { grid-template-columns:minmax(140px,1.4fr) repeat(6,minmax(48px,.55fr)); }
        .ppp, .tempo-ppp { font-weight:950; }
        .ppp.good, .tempo-ppp.good { color:#2f8f5b; }
        .ppp.mid, .tempo-ppp.mid { color:#d98b22; }
        .ppp.bad, .tempo-ppp.bad { color:#c43d4d; }
        .tr.th { color:#9a887f; font-size:.65rem; font-weight:950; text-transform:uppercase; }
        .tr strong { color:#352720; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .tempo-list { display:grid; gap:12px; }
        .tempo-row > div:first-child { display:flex; justify-content:space-between; gap:12px; margin-bottom:5px; }
        .tempo-row.profitability > div:first-child { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:3px 12px; }
        .tempo-row.profitability > div:first-child span { grid-column:1; }
        .tempo-row.profitability > div:first-child b { grid-column:2; grid-row:1 / span 2; }
        .tempo-row strong { color:#382a24; font-size:.78rem; }
        .tempo-row span { color:#9b8c84; font-size:.7rem; }
        .tempo-bar { height:7px; border-radius:999px; overflow:hidden; background:#f0e7e1; }
        .tempo-bar i { display:block; height:100%; border-radius:999px; background:#6b1a2c; }
        .player-table-wrap { overflow:auto; }
        .player-table { width:100%; min-width:900px; border-collapse:collapse; font-size:.75rem; }
        .player-table th { padding:9px 10px; border-bottom:1px solid #e9ddd5; color:#9a887f; font-size:.63rem; text-transform:uppercase; text-align:center; }
        .player-table th:first-child, .player-table td:first-child { text-align:left; }
        .player-table td { padding:10px; border-bottom:1px solid #f2e9e3; text-align:center; }
        .player-table td strong { color:#362820; }
        .player-table small { display:block; margin-top:2px; color:#a39086; }
        .criteria-toolbar {
          display:flex;
          align-items:center;
          justify-content:space-between;
          gap:18px;
          padding:14px 16px;
          border:1px solid #eadfd5;
          border-radius:16px;
          background:#fffaf5;
        }
        .criteria-toolbar > div {
          min-width:0;
          display:grid;
          gap:3px;
        }
        .criteria-kicker {
          color:#d4a24c;
          font-size:.6rem;
          font-weight:950;
          letter-spacing:.1em;
        }
        .criteria-toolbar strong {
          color:#6b1a2c;
          font-size:.9rem;
        }
        .criteria-toolbar small {
          color:#8c7d74;
          font-size:.64rem;
          line-height:1.35;
        }
        .criteria-toolbar > button {
          flex:0 0 auto;
          min-height:40px;
          padding:0 15px;
          border:1px solid #6b1a2c;
          border-radius:999px;
          background:#6b1a2c;
          color:#fff;
          font-weight:900;
          cursor:pointer;
          white-space:nowrap;
        }
        .criteria-toolbar > button:hover {
          background:#571523;
        }

        .shot-chart-wrap { position:relative; width:100%; max-width:900px; margin:0 auto; }
        .shot-chart-wrap :global(svg text) { display:none !important; }
        .shot-zone-overlay { position:absolute; inset:0; pointer-events:none; overflow:hidden; border-radius:inherit; }
        .zone-badge { position:absolute; pointer-events:auto; transform:translate(-50%,-50%); border:0; cursor:pointer; min-width:46px; min-height:40px; padding:5px 7px; display:grid; place-items:center; align-content:center; border:2px solid rgba(255,255,255,.95); border-radius:12px; box-shadow:0 4px 13px rgba(0,0,0,.2); color:#fff; line-height:1; }
        .zone-badge strong { font-size:.85rem; }
        .zone-badge span { margin-top:3px; font-size:.65rem; font-weight:950; }
        .zone-badge.positive { background:#2f8f5b; }
        .zone-badge.neutral { background:#d98b22; }
        .zone-badge.negative { background:#c43d4d; }
        .zone-badge.empty { min-width:30px; min-height:26px; padding:3px 4px; background:rgba(61,49,43,.28); opacity:.6; }
        .zone-badge.empty strong { font-size:.68rem; }
        .zone-badge.empty span { display:none; }
        .zone-list { display:grid; gap:7px; }
        .zone-row { display:grid; grid-template-columns:34px minmax(0,1fr) 48px 48px; gap:9px; align-items:center; min-height:48px; padding:7px 9px; border:1px solid #eee4dc; border-radius:11px; background:#fff; }
        .zone-number { width:30px; height:30px; display:grid; place-items:center; border-radius:50%; background:#fff3df; color:#6b1a2c; font-weight:950; }
        .zone-row div { display:grid; }
        .zone-row strong { color:#3a2c25; font-size:.75rem; }
        .zone-row small { color:#a19087; font-size:.62rem; }
        .zone-row b { color:#392a24; text-align:right; }
        .zone-row em { color:#6b1a2c; font-style:normal; font-weight:950; text-align:right; }
        .zone-row.positive { border-left:4px solid #2f8f5b; }
        .zone-row.neutral { border-left:4px solid #d98b22; }
        .zone-row.negative { border-left:4px solid #c43d4d; }
        .benchmark-backdrop { position:fixed; inset:0; z-index:10050; display:grid; place-items:center; padding:20px; background:rgba(24,18,16,.58); backdrop-filter:blur(4px); }
        .benchmark-modal { width:min(860px,96vw); max-height:90vh; overflow:auto; border-radius:20px; background:#fff; box-shadow:0 30px 90px rgba(0,0,0,.32); }
        .benchmark-head { display:flex; justify-content:space-between; gap:16px; padding:20px 22px 14px; border-bottom:1px solid #eee3db; }
        .benchmark-head span { color:#d4a24c; font-size:.64rem; font-weight:950; letter-spacing:.12em; }
        .benchmark-head h3 { margin:4px 0 3px; color:#6b1a2c; font-size:1.2rem; }
        .benchmark-head p { margin:0; color:#8d7e75; font-size:.74rem; }
        .benchmark-head > button { width:36px; height:36px; border:1px solid #e6d9d0; border-radius:50%; background:#fff; color:#6b1a2c; font-size:1.3rem; cursor:pointer; }
        .benchmark-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; padding:18px 22px; }
        .benchmark-legend { display:flex; gap:9px; flex-wrap:wrap; padding:0 22px 18px; }
        .benchmark-legend span { padding:7px 10px; border-radius:999px; color:#fff; font-size:.68rem; font-weight:900; }
        .legend-positive { background:#2f8f5b; }
        .legend-neutral { background:#d98b22; }
        .legend-negative { background:#c43d4d; }
        .benchmark-footer { display:flex; justify-content:flex-end; gap:8px; padding:14px 22px; border-top:1px solid #eee3db; background:#fffaf5; }
        .benchmark-footer button { min-height:38px; padding:0 14px; border-radius:999px; font-weight:900; cursor:pointer; }
        .benchmark-default { border:1px solid #dfd3ca; background:#fff; color:#6b1a2c; }
        .benchmark-save { border:1px solid #6b1a2c; background:#6b1a2c; color:#fff; }
        .stat-link, .table-link { border:0; background:transparent; color:inherit; font:inherit; padding:5px 4px; cursor:pointer; border-radius:7px; }
        .stat-link:hover, .table-link:hover { background:#fff1e7; color:#6b1a2c; }
        .stat-link.name { text-align:left; font-weight:900; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .table-link { width:100%; min-height:34px; }
        .table-link.player-name { text-align:left; }
        .clickable-tempo { width:100%; border:0; background:transparent; text-align:left; cursor:pointer; padding:5px; border-radius:10px; }
        .clickable-tempo:hover { background:#fff7ef; }
        .clickable-zone-row { width:100%; cursor:pointer; text-align:left; }
        .clickable-zone-row:hover { background:#fff8f1; }
        .zone-badge:disabled { cursor:default; }
        .clip-browser-backdrop { position:fixed; inset:0; z-index:10100; display:grid; place-items:center; padding:18px; background:rgba(20,16,14,.67); backdrop-filter:blur(5px); }
        .clip-browser-modal { width:min(1180px,96vw); height:min(790px,92vh); display:grid; grid-template-rows:auto minmax(0,1fr); overflow:hidden; border-radius:22px; background:#fff; box-shadow:0 34px 110px rgba(0,0,0,.4); }
        .clip-browser-head { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; padding:18px 22px 15px; border-bottom:1px solid #eadfd7; background:#fffaf5; }
        .clip-browser-head span { color:#d4a24c; font-size:.63rem; font-weight:950; letter-spacing:.12em; }
        .clip-browser-head h3 { margin:4px 0 3px; color:#6b1a2c; font-size:1.2rem; }
        .clip-browser-head p { margin:0; color:#8c7c73; font-size:.72rem; }
        .clip-browser-head > button { width:38px; height:38px; flex:0 0 38px; border:1px solid #e3d7cf; border-radius:50%; background:#fff; color:#6b1a2c; font-size:1.35rem; cursor:pointer; }
        .clip-browser-layout { min-height:0; display:grid; grid-template-columns:minmax(0,1.55fr) minmax(330px,.8fr); }
        .clip-player-column { min-width:0; min-height:0; overflow:auto; padding:16px; background:#171313; }
        .clip-player { width:100%; aspect-ratio:16/9; display:grid; place-items:center; overflow:hidden; border-radius:14px; background:#050505; }
        .clip-player video { width:100%; height:100%; object-fit:contain; background:#000; }
        .clip-external { padding:26px; color:#fff; text-align:center; }
        .clip-external strong { font-size:1rem; }
        .clip-external p { color:#c9c0bb; font-size:.75rem; }
        .clip-external a { display:inline-flex; min-height:38px; align-items:center; padding:0 14px; border-radius:999px; background:#d4a24c; color:#241a16; font-weight:900; text-decoration:none; }
        .clip-external.missing { color:#f4ddd9; }
        .active-clip-meta { margin-top:12px; }
        .clip-list { min-height:0; overflow:auto; padding:10px; background:#fff; border-left:1px solid #eadfd7; }
        .clip-row { width:100%; display:grid; grid-template-columns:10px minmax(0,1fr) auto; gap:9px; align-items:center; padding:10px 9px; border:1px solid transparent; border-bottom-color:#f0e8e2; background:#fff; text-align:left; cursor:pointer; }
        .clip-row:hover { background:#fff8f1; }
        .clip-row.active { border-color:#d4a24c; border-radius:10px; background:#fff5e8; }
        .clip-dot { width:8px; height:8px; border-radius:50%; background:#c9c0bb; }
        .clip-dot.ready { background:#2f8f5b; }
        .clip-row div { min-width:0; display:grid; gap:2px; }
        .clip-row strong { overflow:hidden; color:#3a2b24; font-size:.73rem; text-overflow:ellipsis; white-space:nowrap; }
        .clip-row small { overflow:hidden; color:#96867d; font-size:.62rem; text-overflow:ellipsis; white-space:nowrap; }
        .clip-row > b { color:#6b1a2c; font-size:.63rem; white-space:nowrap; }

        .advanced-loading { padding:26px; border:1px solid #eadfd5; border-radius:18px; background:#fff; color:#7c6c64; font-weight:850; }
        @media (max-width: 1050px) {
          .filters { grid-template-columns:repeat(2,minmax(0,1fr)); }
          .summary-grid { grid-template-columns:repeat(3,minmax(0,1fr)); }
          .benchmark-grid { grid-template-columns:1fr; }
          .criteria-toolbar { flex-direction:column; align-items:stretch; }
          .criteria-toolbar > button { width:100%; }
          .clip-browser-layout { grid-template-columns:1fr; }
          .clip-list { max-height:290px; border-left:0; border-top:1px solid #eadfd7; }
          .two-cols, .shot-layout { grid-template-columns:1fr; }
        }
        @media (max-width: 650px) {
          .advanced-head { flex-direction:column; }
          .filters, .summary-grid { grid-template-columns:1fr; }
          .reset { width:100%; }
        }
      `}</style>
    </section>
  );
}

function Filter({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {children}
      </select>
      <style jsx>{`
        .filter-field { display:grid; gap:5px; min-width:0; }
        .filter-field > span { color:#8e7d74; font-size:.62rem; font-weight:950; text-transform:uppercase; letter-spacing:.055em; }
        select { width:100%; min-height:40px; border:1px solid #e7dbd3; border-radius:10px; background:#fff; color:#3b2c25; padding:0 10px; font-size:.76rem; font-weight:750; outline:none; }
      `}</style>
    </label>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="advanced-panel">
      <header>
        <div><h3>{title}</h3>{subtitle ? <p>{subtitle}</p> : null}</div>
      </header>
      <div className="body">{children}</div>
      <style jsx>{`
        .advanced-panel { min-width:0; overflow:hidden; border:1px solid #eadfd5; border-radius:18px; background:#fff; box-shadow:0 8px 24px rgba(48,30,20,.035); }
        header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:15px 17px; border-bottom:1px solid #f0e6df; background:#fffaf6; }
        h3 { margin:0; color:#6b1a2c; font-size:.96rem; }
        p { margin:3px 0 0; color:#9a8a82; font-size:.68rem; }
        .body { min-width:0; padding:14px; }
      `}</style>
    </section>
  );
}

function MiniStat({
  label,
  value,
  onClick,
}: {
  label: string;
  value: string | number;
  onClick?: () => void;
}) {
  return (
    <button type="button" className="mini" onClick={onClick} disabled={!onClick}>
      <strong>{value}</strong>
      <span>{label}</span>
      <small>{onClick ? "Voir les vidéos" : ""}</small>
      <style jsx>{`
        .mini { min-height:78px; display:grid; place-items:center; align-content:center; gap:2px; border:1px solid #eadfd5; border-radius:15px; background:#fff; font:inherit; cursor:pointer; }
        .mini:hover:not(:disabled) { border-color:#d4a24c; background:#fff9f1; transform:translateY(-1px); }
        .mini:disabled { cursor:default; }
        strong { color:#6b1a2c; font-size:1.3rem; }
        span { color:#96857c; font-size:.62rem; font-weight:950; text-transform:uppercase; letter-spacing:.05em; }
        small { min-height:10px; color:#d4a24c; font-size:.52rem; font-weight:850; }
      `}</style>
    </button>
  );
}

function ClipMeta({
  action,
  match,
  playerName,
}: {
  action: ActionRow;
  match?: MatchRow;
  playerName?: string;
}) {
  return (
    <div className="clip-meta">
      <strong>{playerName || "Équipe"}</strong>
      <span>{human(String(action.action_type || action.shot_type || "Action"))}</span>
      {action.shot_result ? <span>{human(String(action.shot_result))}</span> : null}
      {systemDisplayName(action) ? <span>Système : {systemDisplayName(action)}</span> : null}
      {action.temps_fort ? <span>Temps fort : {human(action.temps_fort)}</span> : null}
      {match?.opponent ? <span>vs {String(match.opponent)}</span> : null}
      {action.quarter ? <span>Q{action.quarter}</span> : null}
      {action.clock ? <span>{action.clock}</span> : null}
      {action.clip_start != null || action.video_time != null ? (
        <span>
          Clip {Math.round(num(action.clip_start ?? action.video_time))}s
          {action.clip_end != null ? ` → ${Math.round(num(action.clip_end))}s` : ""}
        </span>
      ) : null}

      <style jsx>{`
        .clip-meta { display:flex; gap:7px; flex-wrap:wrap; align-items:center; }
        strong, span { padding:6px 9px; border-radius:999px; background:#2a2220; color:#eee5e0; font-size:.65rem; }
        strong { background:#6b1a2c; color:#fff; }
      `}</style>
    </div>
  );
}

function BenchmarkEditor({
  title,
  value,
  onChange,
}: {
  title: string;
  value: ShotBenchmark;
  onChange: (value: ShotBenchmark) => void;
}) {
  const set = (key: keyof ShotBenchmark, raw: string) => {
    const next = Math.max(0, Math.min(100, Number(raw) || 0));
    onChange({ ...value, [key]: next });
  };

  return (
    <section className="benchmark-card">
      <h4>{title}</h4>
      <label>
        <span>% visé</span>
        <div><input type="number" min="0" max="100" value={value.target} onChange={(e) => set("target", e.target.value)} /><b>%</b></div>
      </label>
      <label className="positive-field">
        <span>Vert (positif) à partir de</span>
        <div><input type="number" min="0" max="100" value={value.greenFrom} onChange={(e) => set("greenFrom", e.target.value)} /><b>%</b></div>
      </label>
      <label className="negative-field">
        <span>Rouge (négatif) en dessous de</span>
        <div><input type="number" min="0" max="100" value={value.redBelow} onChange={(e) => set("redBelow", e.target.value)} /><b>%</b></div>
      </label>
      <p>Orange entre {value.redBelow}% et {value.greenFrom - 1}%.</p>

      <style jsx>{`
        .benchmark-card { display:grid; gap:10px; padding:14px; border:1px solid #eadfd7; border-radius:15px; background:#fffaf6; }
        h4 { margin:0 0 3px; color:#6b1a2c; font-size:.9rem; }
        label { display:grid; grid-template-columns:minmax(0,1fr) 78px; gap:8px; align-items:center; }
        label > span { color:#75665e; font-size:.7rem; font-weight:850; }
        label > div { display:flex; align-items:center; overflow:hidden; border:1px solid #ded1c8; border-radius:9px; background:#fff; }
        input { width:100%; min-width:0; height:34px; border:0; outline:0; padding:0 7px; color:#342720; font-weight:900; }
        b { padding-right:8px; color:#8d7d74; font-size:.7rem; }
        .positive-field > span { color:#2f8f5b; }
        .negative-field > span { color:#c43d4d; }
        p { margin:0; color:#9a8980; font-size:.65rem; }
      `}</style>
    </section>
  );
}

function Empty() {
  return <div style={{ padding: "22px 8px", color: "#9b8b82", textAlign: "center", fontSize: ".78rem" }}>Aucune donnée avec ces filtres.</div>;
}
