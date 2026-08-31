"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getLocalMatchVideoUrl } from "@/lib/local-video-registry";
import useLocalMatchVideoVersion from "@/hooks/useLocalMatchVideoVersion";
import { exportTimelineLocally, downloadLocalExport, shareLocalExport, type LocalExportResult, type LocalExportOverlay, type LocalExportSource } from "@/lib/local-montage-export";
import LocalMatchVideoButton from "@/components/video/LocalMatchVideoButton";
import { restoreMatchVideoForClip } from "@/lib/video/match-video-resolver";
import { createClient } from "@/lib/supabase/client";

type TeamRow = { id: string; name: string };

type MatchRow = {
  id: string;
  opponent: string | null;
  match_date: string | null;
  video_url: string | null;
  youtube_url: string | null;
};

type ActionRow = {
  id: string;
  client_action_id: string | null;
  team_id: string | null;
  match_id: string | null;
  player_id: string | null;
  quarter: number | null;
  clock: string | null;
  context: string | null;
  temps_fort: string | null;
  action_type: string | null;
  shot_type: string | null;
  shot_result: string | null;
  video_time: number | null;
  clip_start: number | null;
  clip_end: number | null;
  edited_clip_start?: number | null;
  edited_clip_end?: number | null;
  clip_title?: string | null;
};

type MontageRow = {
  id: string;
  team_id: string | null;
  player_id: string | null;
  match_id: string | null;
  title: string | null;
  type: string | null;
  coach_note?: string | null;
  status?: string | null;
  export_url?: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type Drawing = {
  id: string;
  kind: "arrow" | "line" | "circle" | "zone" | "freehand" | "text" | "tracker";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  text?: string;
  points?: Array<{ x: number; y: number }>;
  fillOpacity?: number;
  start: number;
  end: number;
};

type MontageItemType = "clip" | "title" | "text" | "image" | "freeze" | "audio";

type MontageItem = {
  id?: string;
  montage_id?: string;
  action_id: string;
  sort_order: number;
  item_type: MontageItemType;
  title: string;
  note: string;
  clip_start: number;
  clip_end: number;
  duration?: number;
  image_url?: string;
  freeze_time: number | null;
  freeze_duration: number | null;
  annotations: Drawing[];
  action?: ActionRow;
  track?: "video" | "overlay" | "audio";
  timeline_start?: number;
  asset_url?: string;
  volume?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  rotation?: number;
  opacity?: number;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: number;
  textAlign?: "left" | "center" | "right";
  background?: string;
  locked?: boolean;
  hidden?: boolean;
  playbackRate?: number;
  repeatCount?: number;
  transition?: "none" | "fade";
};

type Props = {
  initialTeamId?: string;
  initialPlayerId?: string;
  initialMontageId?: string;
  onClose?: () => void;
  embedded?: boolean;
};

type LibraryView = "all" | "favorites" | "themes" | "players" | "systems";
type ClipTheme = { id: string; name: string; actionIds: string[] };
type PlayerRow = { id: string; name: string | null; first_name?: string | null; last_name?: string | null; jersey_number?: number | null };



const TF_LABELS: Record<string, string> = {
  "fast-break": "Fast Break",
  transition: "Transition",
  "jeu-place": "Jeu placé",
  "pick-side": "Pick Side",
  "pick-top": "Pick Top",
  "pick_non_porteur": "Écran non porteur",
  "pick-non-porteur": "Écran non porteur",
  "hand-off": "Hand Off",
  "one_vs_one": "1v1",
  "1v1": "1v1",
  "drive-kick": "Drive & Kick",
  "jeu-sans-ballon": "Jeu sans ballon",
  "off-rebound": "Rebond offensif",
};

const numberValue = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function tfLabel(value: string | null) {
  const key = String(value || "");
  return TF_LABELS[key] || key.replace(/[-_]+/g, " ") || "Action";
}

function actionLabel(action: ActionRow) {
  const result =
    action.action_type === "tir"
      ? action.shot_result === "made"
        ? "Tir marqué"
        : "Tir manqué"
      : action.action_type || "Action";

  return `${tfLabel(action.temps_fort)} · ${result}`;
}

function actionSub(action: ActionRow, matches: Map<string, MatchRow>) {
  const match = matches.get(String(action.match_id || ""));
  const period =
    action.quarter == null
      ? ""
      : action.quarter <= 4
        ? `Q${action.quarter}`
        : `OT${action.quarter - 4}`;

  return [
    match?.opponent ? `vs ${match.opponent}` : "",
    period,
    action.clock || "",
    action.context || "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function actionVideoUrl(action: ActionRow | undefined, matches: Map<string, MatchRow>) {
  if (!action) return "";
  const matchId = String(action.match_id || "");
  const local = matchId ? getLocalMatchVideoUrl(matchId) : null;
  if (local) return local;
  const match = matches.get(matchId);
  return String(match?.video_url || match?.youtube_url || "");
}

function formatClipTime(value: number) {
  const safe = Math.max(0, Number.isFinite(value) ? value : 0);
  const minutes = Math.floor(safe / 60);
  const seconds = safe - minutes * 60;
  return `${String(minutes).padStart(2, "0")}:${seconds.toFixed(1).padStart(4, "0")}`;
}

function clipStart(action: ActionRow) {
  return numberValue(
    action.edited_clip_start ?? action.clip_start ?? action.video_time ?? 0,
  );
}

function clipEnd(action: ActionRow) {
  const start = clipStart(action);
  const raw = numberValue(action.edited_clip_end ?? action.clip_end);
  return raw > start ? raw : start + 8;
}

export default function MontageStudio({
  initialTeamId = "",
  initialPlayerId = "",
  initialMontageId = "",
  onClose,
  embedded = false,
}: Props) {
  useLocalMatchVideoVersion();
  const supabase = useMemo(() => createClient(), []);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const freehandPointsRef = useRef<Array<{ x: number; y: number }>>([]);
  const dragIndex = useRef<number | null>(null);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamId, setTeamId] = useState(initialTeamId);
  const [playerId, setPlayerId] = useState(initialPlayerId);
  const [assignedPlayerId, setAssignedPlayerId] = useState(initialPlayerId);
  const [matches, setMatches] = useState<MatchRow[]>([]);
  const [actions, setActions] = useState<ActionRow[]>([]);
  const [montages, setMontages] = useState<MontageRow[]>([]);
  const [montageId, setMontageId] = useState(initialMontageId);
  const [title, setTitle] = useState("Nouveau montage");
  const [coachNote, setCoachNote] = useState("");
  const [items, setItems] = useState<MontageItem[]>([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [filter, setFilter] = useState<"all" | "made" | "missed" | "video">("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rendering, setRendering] = useState(false);
  const [toast, setToast] = useState("");
  const [drawMode, setDrawMode] = useState<Drawing["kind"]>("arrow");
  const [drawColor, setDrawColor] = useState("#ffd34d");
  const [selectedDrawingId, setSelectedDrawingId] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [recipient, setRecipient] = useState("");
  const [exportUrl, setExportUrl] = useState("");
  const [libraryView, setLibraryView] = useState<LibraryView>("all");
  const [favoriteActionIds, setFavoriteActionIds] = useState<string[]>([]);
  const [themes, setThemes] = useState<ClipTheme[]>([]);
  const [clipPreviewIndex, setClipPreviewIndex] = useState<number | null>(null);
  const [clipPreviewPlaying, setClipPreviewPlaying] = useState(false);
  const [timelineZoom, setTimelineZoom] = useState(1);
  const [designUploading, setDesignUploading] = useState(false);
  const clipPreviewVideoRef = useRef<HTMLVideoElement | null>(null);
  const imageInputRef = useRef<HTMLInputElement | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);
  const [players, setPlayers] = useState<PlayerRow[]>([]);
  const [selectedPlayerFilter, setSelectedPlayerFilter] = useState(initialPlayerId || "");
  const [selectedSystemFilter, setSelectedSystemFilter] = useState("");
  const [selectedThemeId, setSelectedThemeId] = useState("");
  const [playhead, setPlayhead] = useState(0);
  const [audioUploading, setAudioUploading] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [renderJobId, setRenderJobId] = useState<string | null>(null);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderStatus, setRenderStatus] = useState("");
  const [renderOutputUrl, setRenderOutputUrl] = useState("");
  const [localExport, setLocalExport] = useState<LocalExportResult | null>(null);
  const [localExportProgress, setLocalExportProgress] = useState(0);
  const [montagePlaying, setMontagePlaying] = useState(false);
  const montageAudioRef = useRef<HTMLAudioElement | null>(null);
  const playStartedAtRef = useRef<{ wall: number; timeline: number } | null>(null);
  const hydratedRef = useRef(false);
  const historyRef = useRef<MontageItem[][]>([]);
  const historyIndexRef = useRef(-1);
  const historyApplyingRef = useRef(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [librarySelection, setLibrarySelection] = useState<string[]>([]);
  const [addMenuOpen, setAddMenuOpen] = useState(false);


  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);


  useEffect(() => {
    let active = true;

    (async () => {
      // ISOLATION · outil personnel : uniquement les équipes de l'utilisateur.
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("teams")
        .select("id,name")
        .eq("user_id", user.id)
        .order("name");

      if (!active) return;
      if (error) {
        flash(`Équipes indisponibles : ${error.message}`);
        return;
      }

      const rows = (data ?? []) as TeamRow[];
      setTeams(rows);
      if (!teamId && rows.length) setTeamId(rows[0].id);
    })();

    return () => {
      active = false;
    };
  }, [flash, supabase, teamId]);

  useEffect(() => {
    if (!teamId) return;
    let active = true;

    (async () => {
      const userResponse = await supabase.auth.getUser();
      const userId = userResponse.data.user?.id;
      if (!userId) return;

      const [playersResponse, favoritesResponse, themesResponse] = await Promise.all([
        supabase
          .from("players")
          .select("id,name,first_name,last_name,jersey_number")
          .eq("team_id", teamId)
          .order("name"),
        supabase
          .from("livestat_clip_favorites")
          .select("action_id")
          .eq("user_id", userId)
          .eq("team_id", teamId),
        supabase
          .from("livestat_clip_themes")
          .select("id,name,livestat_clip_theme_items(action_id)")
          .eq("user_id", userId)
          .eq("team_id", teamId)
          .order("sort_order"),
      ]);

      if (!active) return;

      if (!playersResponse.error) setPlayers((playersResponse.data ?? []) as PlayerRow[]);

      if (!favoritesResponse.error) {
        setFavoriteActionIds((favoritesResponse.data ?? []).map((row: any) => String(row.action_id)));
      }

      if (!themesResponse.error) {
        setThemes(
          (themesResponse.data ?? []).map((row: any) => ({
            id: String(row.id),
            name: String(row.name),
            actionIds: (row.livestat_clip_theme_items ?? []).map((item: any) => String(item.action_id)),
          })),
        );
      }
    })();

    return () => { active = false; };
  }, [supabase, teamId]);

  useEffect(() => {
    if (!teamId) return;

    let active = true;
    setLoading(true);

    (async () => {
      const [matchResponse, actionResponse, montageResponse] = await Promise.all([
        supabase
          .from("match_stats")
          .select("id,opponent,match_date,video_url,youtube_url")
          .eq("team_id", teamId)
          .order("match_date", { ascending: false }),
        supabase
          .from("match_actions")
          .select(
            "id,client_action_id,team_id,match_id,player_id,quarter,clock,context,temps_fort,action_type,shot_type,shot_result,video_time,clip_start,clip_end,edited_clip_start,edited_clip_end,clip_title",
          )
          .eq("team_id", teamId)
          .order("created_at", { ascending: false })
          .limit(800),
        supabase
          .from("livestat_montages")
          .select("*")
          .eq("team_id", teamId)
          .order("updated_at", { ascending: false }),
      ]);

      if (!active) return;

      setMatches(
        matchResponse.error ? [] : ((matchResponse.data ?? []) as MatchRow[]),
      );

      const actionRows = actionResponse.error
        ? []
        : ((actionResponse.data ?? []) as ActionRow[]);

      // Conserve toutes les actions de l'équipe en mémoire : un montage peut
      // contenir plusieurs joueurs. Le filtre joueur reste purement visuel dans
      // la bibliothèque et ne doit jamais casser la réouverture d'un montage.
      setActions(actionRows);

      const montageRows = montageResponse.error
        ? []
        : ((montageResponse.data ?? []) as MontageRow[]);
      setMontages(montageRows);

      if (!montageId && initialMontageId) setMontageId(initialMontageId);
      setLoading(false);
    })();

    return () => {
      active = false;
    };
  }, [initialMontageId, montageId, playerId, supabase, teamId]);

  useEffect(() => {
    if (!montageId) {
      setTitle(playerId ? "Montage joueur" : "Nouveau montage");
      setCoachNote("");
      setItems([]);
      setSelectedIndex(0);
      setExportUrl("");
      setAssignedPlayerId(initialPlayerId || "");
      return;
    }

    let active = true;

    (async () => {
      const [montageResponse, itemsResponse] = await Promise.all([
        supabase
          .from("livestat_montages")
          .select("*")
          .eq("id", montageId)
          .maybeSingle(),
        supabase
          .from("livestat_montage_items")
          .select("*")
          .eq("montage_id", montageId)
          .order("sort_order", { ascending: true }),
      ]);

      if (!active) return;

      const montage = montageResponse.data as MontageRow | null;
      if (montage) {
        setTitle(montage.title || "Montage");
        setCoachNote(montage.coach_note || "");
        setExportUrl(montage.export_url || "");
        setAssignedPlayerId(String(montage.player_id || ""));
      }

      if (itemsResponse.error) {
        flash(`Clips indisponibles : ${itemsResponse.error.message}`);
        setItems([]);
        return;
      }

      const actionMap = new Map(
        actions.map((action) => [String(action.id), action]),
      );

      setItems(
        ((itemsResponse.data ?? []) as any[]).map((item, index) => {
          const actionId = String(
            item.action_id || item.client_action_id || item.clip_id || "",
          );
          const action =
            actionMap.get(actionId) ||
            actions.find(
              (row) => String(row.client_action_id || "") === actionId,
            );

          const itemType = String(item.item_type || "clip") as MontageItemType;
          const startValue = numberValue(item.clip_start ?? (action ? clipStart(action) : 0));
          const endValue = numberValue(item.clip_end ?? (action ? clipEnd(action) : 0));
          return {
            id: item.id,
            montage_id: montageId,
            action_id: actionId || `design:${item.id || index}`,
            sort_order: numberValue(item.sort_order ?? item.position ?? index),
            item_type: itemType,
            title:
              item.title ||
              item.clip_title ||
              (action ? actionLabel(action) : itemType === "image" ? "Image" : `Élément ${index + 1}`),
            note: item.note || item.text || "",
            clip_start: startValue,
            clip_end: endValue,
            duration: numberValue(item.duration ?? (endValue > startValue ? endValue - startValue : 4)),
            image_url: String(item.image_url || ""),
            freeze_time:
              item.freeze_time == null ? null : numberValue(item.freeze_time),
            freeze_duration:
              item.freeze_duration == null
                ? null
                : numberValue(item.freeze_duration),
            annotations: Array.isArray(item.annotations)
              ? item.annotations
              : [],
            track: item.track || (item.item_type === "audio" ? "audio" : item.item_type === "clip" ? "video" : "overlay"),
            timeline_start: numberValue(item.timeline_start),
            asset_url: String(item.image_url || ""),
            volume: item.volume == null ? 1 : numberValue(item.volume),
            ...(item.editor_state && typeof item.editor_state === "object" ? item.editor_state : {}),
            action,
          };
        }),
      );
      setSelectedIndex(0);
      hydratedRef.current = true;
    })();

    return () => {
      active = false;
    };
  }, [actions, flash, montageId, supabase]);

  // À la réouverture d'un montage, restaure UNE fois chaque source locale
  // nécessaire, par matchId. Un montage de 20 clips issus de 3 matchs ne doit
  // donc jamais demander 20 reconnexions. Les sources encore autorisées par
  // Chrome réapparaissent automatiquement ; les autres restent reconnectables
  // via le bouton du lecteur sans perdre le montage ni ses trims.
  useEffect(() => {
    if (!teamId || !items.length) return;
    const matchIds = Array.from(new Set(items
      .map((item) => String(item.action?.match_id || ""))
      .filter(Boolean)));
    if (!matchIds.length) return;
    let cancelled = false;
    void (async () => {
      let restored = 0;
      for (const matchId of matchIds) {
        if (cancelled || getLocalMatchVideoUrl(matchId)) continue;
        try {
          const result = await restoreMatchVideoForClip(matchId, teamId);
          if (result.video) restored += 1;
        } catch {
          // Pas de popup : le bouton de reconnexion du match reste disponible.
        }
      }
      if (!cancelled && restored > 0) flash(`${restored} source${restored > 1 ? "s" : ""} vidéo restaurée${restored > 1 ? "s" : ""} automatiquement ✓`);
    })();
    return () => { cancelled = true; };
  }, [items, teamId, flash]);

  const matchMap = useMemo(
    () => new Map(matches.map((match) => [String(match.id), match])),
    [matches],
  );

  useEffect(() => {
    if (!renderJobId) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const poll = async () => {
      const { data, error } = await supabase.from("livestat_render_jobs")
        .select("id,status,progress,output_url,error_message").eq("id", renderJobId).single();
      if (cancelled) return;
      if (error) { setRenderStatus("failed"); flash(error.message); return; }
      const status = String(data?.status || "");
      setRenderStatus(status);
      setRenderProgress(Number(data?.progress || 0));
      setRenderOutputUrl(String(data?.output_url || ""));
      if (["done","completed","failed","error"].includes(status)) {
        if (["done","completed"].includes(status)) flash("Export MP4 terminé");
        else flash(String(data?.error_message || "Échec du rendu"));
        return;
      }
      timer = setTimeout(poll, 1500);
    };
    void poll();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [flash, renderJobId, supabase]);

  const selected = items[selectedIndex];
  const selectedAction = selected?.action;
  const selectedVideo = actionVideoUrl(selectedAction, matchMap);
  const selectedDuration = Math.max(
    0.1,
    (selected?.clip_end || 0) - (selected?.clip_start || 0),
  );

  const filteredActions = useMemo(() => {
    const query = search.trim().toLowerCase();

    return actions.filter((action) => {
      if (filter === "made" && action.shot_result !== "made") return false;
      if (filter === "missed" && action.shot_result !== "missed") return false;
      if (
        filter === "video" &&
        !(
          action.video_time != null ||
          action.clip_start != null ||
          actionVideoUrl(action, matchMap)
        )
      ) {
        return false;
      }

      if (selectedPlayerFilter && String(action.player_id || "") !== selectedPlayerFilter) return false;
      if (selectedSystemFilter && String(action.temps_fort || "") !== selectedSystemFilter) return false;
      if (selectedThemeId) {
        const theme = themes.find((row) => row.id === selectedThemeId);
        if (theme && !theme.actionIds.includes(String(action.id))) return false;
      }

      if (!query) return true;

      const player = players.find((row) => String(row.id) === String(action.player_id || ""));
      return `${actionLabel(action)} ${actionSub(action, matchMap)} ${player?.name || ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [actions, filter, matchMap, search, selectedPlayerFilter, selectedSystemFilter, selectedThemeId, themes, players]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !selected) return;

    const seek = () => {
      video.currentTime = selected.clip_start;
    };

    if (video.readyState >= 1) seek();
    else video.addEventListener("loadedmetadata", seek, { once: true });

    return () => {
      video.removeEventListener("loadedmetadata", seek);
    };
  }, [selected?.action_id, selected?.clip_start, selectedVideo]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    (selected?.annotations || []).forEach((drawing) => {
      ctx.strokeStyle = drawing.color;
      ctx.fillStyle = drawing.color;
      ctx.lineWidth = drawing.width;

      if (drawing.kind === "circle") {
        const radius = Math.hypot(
          drawing.x2 - drawing.x1,
          drawing.y2 - drawing.y1,
        );
        ctx.beginPath();
        ctx.arc(drawing.x1, drawing.y1, radius, 0, Math.PI * 2);
        ctx.stroke();
        return;
      }

      if (drawing.kind === "zone") {
        ctx.save();
        ctx.globalAlpha = drawing.fillOpacity ?? 0.18;
        ctx.fillRect(drawing.x1, drawing.y1, drawing.x2 - drawing.x1, drawing.y2 - drawing.y1);
        ctx.restore();
        ctx.strokeRect(drawing.x1, drawing.y1, drawing.x2 - drawing.x1, drawing.y2 - drawing.y1);
        return;
      }

      if (drawing.kind === "freehand") {
        const points = drawing.points || [];
        if (points.length > 1) {
          ctx.beginPath();
          ctx.moveTo(points[0].x, points[0].y);
          points.slice(1).forEach((point) => ctx.lineTo(point.x, point.y));
          ctx.stroke();
        }
        return;
      }

      if (drawing.kind === "text") {
        ctx.font = "bold 27px Arial";
        ctx.fillText(drawing.text || "Texte", drawing.x1, drawing.y1);
        return;
      }

      if (drawing.kind === "tracker") {
        ctx.beginPath();
        ctx.arc(drawing.x1, drawing.y1, 40, 0, Math.PI * 2);
        ctx.stroke();
        return;
      }

      ctx.beginPath();
      ctx.moveTo(drawing.x1, drawing.y1);
      ctx.lineTo(drawing.x2, drawing.y2);
      ctx.stroke();

      if (drawing.kind === "arrow") {
        const angle = Math.atan2(
          drawing.y2 - drawing.y1,
          drawing.x2 - drawing.x1,
        );
        const size = 16;
        ctx.beginPath();
        ctx.moveTo(drawing.x2, drawing.y2);
        ctx.lineTo(
          drawing.x2 - size * Math.cos(angle - 0.48),
          drawing.y2 - size * Math.sin(angle - 0.48),
        );
        ctx.lineTo(
          drawing.x2 - size * Math.cos(angle + 0.48),
          drawing.y2 - size * Math.sin(angle + 0.48),
        );
        ctx.closePath();
        ctx.fill();
      }
    });
  }, [selected?.annotations, selectedIndex]);

  const updateSelected = (patch: Partial<MontageItem>) => {
    setItems((current) =>
      current.map((item, index) =>
        index === selectedIndex ? { ...item, ...patch } : item,
      ),
    );
  };

  const duplicateSelected = () => {
    if (!selected) return;
    const copy: MontageItem = { ...selected, id: undefined, action_id: selected.item_type === "clip" ? selected.action_id : `${selected.item_type}:${uid()}`, timeline_start: timelineStartOf(selected, selectedIndex) + 0.35, annotations: selected.annotations.map((a) => ({ ...a, id: uid() })) };
    setItems((current) => { const next=[...current]; next.splice(selectedIndex+1,0,copy); return next.map((row,index)=>({...row,sort_order:index})); });
    setSelectedIndex(selectedIndex+1);
  };

  const resetSelectedTrim = () => {
    if (!selected?.action || selected.item_type !== "clip") return;
    updateSelected({ clip_start: clipStart(selected.action), clip_end: clipEnd(selected.action) });
  };

  const splitSelectedClip = () => {
    if (!selected || selected.item_type !== "clip") return;
    const current = numberValue(videoRef.current?.currentTime ?? selected.clip_start);
    if (current <= selected.clip_start + 0.05 || current >= selected.clip_end - 0.05) { flash("Place la tête de lecture à l’intérieur du clip."); return; }
    const first = { ...selected, clip_end: current };
    const second: MontageItem = { ...selected, id: undefined, clip_start: current, timeline_start: timelineStartOf(selected, selectedIndex) + (current-selected.clip_start), annotations: selected.annotations.map(a=>({...a,id:uid()})) };
    setItems((rows)=>{ const next=[...rows]; next.splice(selectedIndex,1,first,second); return next.map((row,index)=>({...row,sort_order:index})); });
    setSelectedIndex(selectedIndex+1);
    flash("Clip scindé ✓");
  };


  const beginTimelineTrim = (
    event: import("react").PointerEvent<HTMLSpanElement>,
    itemIndex: number,
    edge: "start" | "end",
  ) => {
    event.preventDefault();
    event.stopPropagation();

    const item = items[itemIndex];
    if (!item || item.item_type !== "clip") return;

    const originX = event.clientX;
    const originStart = item.clip_start;
    const originEnd = item.clip_end;
    const actionStart = item.action ? clipStart(item.action) : 0;
    const actionEnd = item.action ? clipEnd(item.action) : Number.POSITIVE_INFINITY;
    const pxPerSecond = 45 * timelineZoom;

    const onMove = (moveEvent: PointerEvent) => {
      const delta = (moveEvent.clientX - originX) / Math.max(1, pxPerSecond);

      setItems((current) =>
        current.map((row, index) => {
          if (index !== itemIndex) return row;

          if (edge === "start") {
            const nextStart = clamp(
              originStart + delta,
              actionStart,
              Math.min(originEnd - 0.1, actionEnd),
            );
            return { ...row, clip_start: nextStart };
          }

          const nextEnd = clamp(
            originEnd + delta,
            Math.max(originStart + 0.1, actionStart + 0.1),
            actionEnd,
          );
          return { ...row, clip_end: nextEnd };
        }),
      );
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const insertionIndex = () =>
    items.length === 0 ? 0 : clamp(selectedIndex + 1, 0, items.length);

  const addAction = (action: ActionRow) => {
    const insertAt = insertionIndex();
    setItems((current) => {
      const next: MontageItem = {
        action_id: String(action.id),
        item_type: "clip",
        sort_order: insertAt,
        title: action.clip_title || actionLabel(action),
        note: "",
        clip_start: clipStart(action),
        clip_end: clipEnd(action),
        freeze_time: null,
        freeze_duration: null,
        annotations: [],
        action,
        track: "video",
        timeline_start: playhead,
        volume: 1,
      };
      const rows = [...current];
      rows.splice(insertAt, 0, next);
      return rows.map((item, index) => ({ ...item, sort_order: index }));
    });
    setSelectedIndex(insertAt);
  };

  const removeItem = (index: number) => {
    setItems((current) =>
      current
        .filter((_, currentIndex) => currentIndex !== index)
        .map((item, currentIndex) => ({
          ...item,
          sort_order: currentIndex,
        })),
    );
    setSelectedIndex((current) =>
      clamp(current > index ? current - 1 : current, 0, Math.max(0, items.length - 2)),
    );
  };

  const moveItem = (from: number, to: number) => {
    if (from === to || to < 0 || to >= items.length) return;

    setItems((current) => {
      const next = [...current];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
      return next.map((item, index) => ({ ...item, sort_order: index }));
    });
    setSelectedIndex(to);
  };

  const exportMontageLocally = async () => {
    const orderedVideoItems = items
      .filter((item) => (item.track || (item.item_type === "clip" || item.item_type === "freeze" ? "video" : item.item_type === "audio" ? "audio" : "overlay")) === "video" && item.action)
      .sort((a, b) => Number(a.timeline_start || 0) - Number(b.timeline_start || 0));

    // Préflight : tente d'abord la restauration automatique de chaque match
    // nécessaire à l'export avant de déclarer une source manquante.
    const neededMatchIds = Array.from(new Set(orderedVideoItems.map((item) => String(item.action?.match_id || "")).filter(Boolean)));
    for (const matchId of neededMatchIds) {
      if (getLocalMatchVideoUrl(matchId)) continue;
      try { await restoreMatchVideoForClip(matchId, teamId); } catch {}
    }

    const sources: LocalExportSource[] = orderedVideoItems.map((item) => {
      const matchId = String(item.action?.match_id || "");
      const url = getLocalMatchVideoUrl(matchId);
      if (!url) {
        throw new Error(`Vidéo locale manquante pour le match ${matchId}. Reconnecte ce match une seule fois avant l'export.`);
      }
      return {
        id: item.id || item.action_id,
        type: item.item_type === "freeze" ? "freeze" : "clip",
        url,
        start: item.clip_start,
        end: item.clip_end,
        timelineStart: item.timeline_start ?? 0,
        duration: item.duration ?? item.freeze_duration ?? undefined,
        freezeTime: item.freeze_time,
        playbackRate: item.playbackRate ?? 1,
        repeatCount: item.repeatCount ?? 1,
        annotations: item.annotations,
        transition: item.transition ?? "none",
      };
    });

    const overlays: LocalExportOverlay[] = items
      .filter((item) => ["title", "text", "image"].includes(item.item_type))
      .map((item, index) => ({
        id: item.id || item.action_id,
        type: item.item_type as "title" | "text" | "image",
        timelineStart: timelineStartOf(item, index),
        duration: itemDuration(item),
        text: item.item_type === "title" ? item.title : item.note,
        imageUrl: item.image_url || item.asset_url || undefined,
        x: item.x, y: item.y, width: item.width, height: item.height, rotation: item.rotation, opacity: item.opacity,
        fontSize: item.fontSize, fontFamily: item.fontFamily, fontWeight: item.fontWeight, textAlign: item.textAlign, background: item.background, hidden: item.hidden,
      }));

    setRendering(true);
    setLocalExportProgress(0);
    try {
      const result = await exportTimelineLocally(
        sources, overlays,
        (title || "montage-mybasket").replace(/[^a-zA-Z0-9_-]+/g, "-"),
        setLocalExportProgress,
      );
      setLocalExport(result);
      downloadLocalExport(result);
      flash(`Export ${result.extension.toUpperCase()} téléchargé avec annotations`);
    } catch (error) {
      flash(error instanceof Error ? error.message : "Export local impossible");
    } finally {
      setRendering(false);
    }
  };

  const saveMontage = async () => {
    if (!teamId) {
      flash("Choisis une équipe.");
      return;
    }

    setSaving(true)
    setSaveState("saving");

    try {
      const userResponse = await supabase.auth.getUser();
      const userId = userResponse.data.user?.id;

      if (!userId) {
        flash("Utilisateur non connecté.");
        return;
      }

      let currentMontageId = montageId;

      const montagePayload: Record<string, unknown> = {
        user_id: userId,
        team_id: teamId,
        player_id: assignedPlayerId || null,
        title: title.trim() || "Nouveau montage",
        type: assignedPlayerId ? "player" : "team",
        coach_note: coachNote,
        updated_at: new Date().toISOString(),
      };

      if (!currentMontageId) {
        const { data, error } = await supabase
          .from("livestat_montages")
          .insert({
            ...montagePayload,
            created_at: new Date().toISOString(),
          })
          .select("*")
          .single();

        if (error || !data) throw error || new Error("Création impossible.");
        currentMontageId = String(data.id);
        setMontageId(currentMontageId);
        setMontages((current) => [data as MontageRow, ...current]);
      } else {
        const { error } = await supabase
          .from("livestat_montages")
          .update(montagePayload)
          .eq("id", currentMontageId);

        if (error) throw error;
      }

      const { error: deleteError } = await supabase
        .from("livestat_montage_items")
        .delete()
        .eq("montage_id", currentMontageId);

      if (deleteError) throw deleteError;

      if (items.length) {
        const payload = items.map((item, index) => ({
          montage_id: currentMontageId,
          user_id: userId,
          item_type: item.item_type,
          action_id: item.item_type === "clip" ? item.action_id : null,
          sort_order: index,
          title: item.title || null,
          text: item.note || null,
          image_url: item.image_url || item.asset_url || null,
          clip_start: item.item_type === "clip" ? item.clip_start : null,
          clip_end: item.item_type === "clip" ? item.clip_end : null,
          duration: item.duration ?? Math.max(0.1, item.clip_end - item.clip_start),
          track: item.track || (item.item_type === "audio" ? "audio" : item.item_type === "clip" ? "video" : "overlay"),
          timeline_start: item.timeline_start ?? 0,
          volume: item.volume ?? 1,
          freeze_time: item.freeze_time,
          freeze_duration: item.freeze_duration,
          annotations: item.annotations,
          editor_state: { x:item.x ?? 50, y:item.y ?? 50, width:item.width ?? (item.item_type === "image" ? 30 : 70), height:item.height ?? 20, rotation:item.rotation ?? 0, opacity:item.opacity ?? 1, fontSize:item.fontSize ?? (item.item_type === "title" ? 48 : 30), fontFamily:item.fontFamily ?? "Arial", fontWeight:item.fontWeight ?? 800, textAlign:item.textAlign ?? "center", background:item.background ?? "transparent", locked:item.locked ?? false, hidden:item.hidden ?? false, playbackRate:item.playbackRate ?? 1, repeatCount:item.repeatCount ?? 1, transition:item.transition ?? "none" },
          created_at: new Date().toISOString(),
        }));

        const { error } = await supabase
          .from("livestat_montage_items")
          .insert(payload);

        if (error) throw error;
      }

      setSaveState("saved");
      flash("Montage enregistré ✓");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Enregistrement impossible.";
      console.error("Erreur sauvegarde montage :", error);
      setSaveState("error");
      flash(message);
    } finally {
      setSaving(false);
    }
  };

  // Historique non destructif + autosave. Chaque mutation de timeline reste réversible.
  useEffect(() => {
    if (!hydratedRef.current) return;
    if (historyApplyingRef.current) { historyApplyingRef.current = false; return; }
    const snapshot = items.map((row) => ({ ...row, annotations: row.annotations.map((a)=>({...a})) }));
    const current = historyRef.current[historyIndexRef.current];
    if (current && JSON.stringify(current) === JSON.stringify(snapshot)) return;
    historyRef.current = historyRef.current.slice(0, historyIndexRef.current + 1);
    historyRef.current.push(snapshot);
    if (historyRef.current.length > 60) historyRef.current.shift();
    historyIndexRef.current = historyRef.current.length - 1;
  }, [items]);

  const undoEdit = useCallback(() => {
    if (historyIndexRef.current <= 0) return;
    historyIndexRef.current -= 1; historyApplyingRef.current = true;
    setItems(historyRef.current[historyIndexRef.current].map(row=>({...row,annotations:row.annotations.map(a=>({...a}))})));
  }, []);
  const redoEdit = useCallback(() => {
    if (historyIndexRef.current >= historyRef.current.length - 1) return;
    historyIndexRef.current += 1; historyApplyingRef.current = true;
    setItems(historyRef.current[historyIndexRef.current].map(row=>({...row,annotations:row.annotations.map(a=>({...a}))})));
  }, []);

  useEffect(() => {
    const onKey=(event:KeyboardEvent)=>{
      const el=event.target as HTMLElement | null; if(el && ["INPUT","TEXTAREA","SELECT"].includes(el.tagName)) return;
      if((event.metaKey||event.ctrlKey) && event.key.toLowerCase()==="z"){ event.preventDefault(); event.shiftKey ? redoEdit() : undoEdit(); }
    };
    window.addEventListener("keydown",onKey); return()=>window.removeEventListener("keydown",onKey);
  }, [redoEdit, undoEdit]);

  useEffect(() => {
    if (!hydratedRef.current || !teamId) return;
    const timer=window.setTimeout(()=>{ void saveMontage(); }, 900);
    return()=>window.clearTimeout(timer);
    // autosave volontairement déclenché par l'état éditable du projet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, title, coachNote, assignedPlayerId, teamId]);

  const renderMontage = async () => {
    if (!montageId) {
      flash("Enregistre d'abord le montage.");
      return;
    }

    setRendering(true);

    try {
      const response = await fetch("/api/montages/render", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ montageId, playbackRate }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Rendu impossible.");
      }

      flash("Rendu MP4 lancé.");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Rendu impossible.");
    } finally {
      setRendering(false);
    }
  };

  const refreshExport = async () => {
    if (!montageId) {
      flash("Enregistre d'abord le montage.");
      return;
    }

    const { data, error } = await supabase
      .from("livestat_montages")
      .select("export_url")
      .eq("id", montageId)
      .maybeSingle();

    if (error) {
      flash(error.message);
      return;
    }

    setExportUrl(String(data?.export_url || ""));
    setShareOpen(true);
  };

  const share = async (kind: "mail" | "whatsapp" | "copy" | "native") => {
    if (!exportUrl) {
      flash("Le MP4 n'est pas encore disponible.");
      return;
    }

    const text = `${title} - ${exportUrl}`;

    if (kind === "mail") {
      window.location.href = `mailto:${encodeURIComponent(
        recipient,
      )}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(text)}`;
    }

    if (kind === "whatsapp") {
      window.open(
        `https://wa.me/${recipient.replace(/\D/g, "")}?text=${encodeURIComponent(
          text,
        )}`,
        "_blank",
      );
    }

    if (kind === "copy") {
      await navigator.clipboard.writeText(exportUrl);
      flash("Lien copié.");
    }

    if (kind === "native" && navigator.share) {
      await navigator.share({ title, text: title, url: exportUrl });
    }
  };

  const pointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x:
        (event.clientX - rect.left) *
        (event.currentTarget.width / rect.width),
      y:
        (event.clientY - rect.top) *
        (event.currentTarget.height / rect.height),
    };
  };

  const itemDuration = (item: MontageItem) => {
    if (item.item_type === "clip") {
      const sourceDuration = Math.max(0.1, item.clip_end - item.clip_start);
      const rate = clamp(item.playbackRate ?? 1, 0.25, 4);
      const repeats = Math.max(1, Math.round(item.repeatCount ?? 1));
      return Math.max(0.1, (sourceDuration / rate) * repeats);
    }
    return Math.max(0.5, item.duration || (item.item_type === "audio" ? item.clip_end - item.clip_start : 4));
  };

  const timelineStartOf = (item: MontageItem, index: number) =>
    item.timeline_start ?? items.slice(0, index).reduce((sum, row) => sum + itemDuration(row), 0);

  const totalDuration = Math.max(
    0,
    ...items.map((item, index) => timelineStartOf(item, index) + itemDuration(item)),
  );

  const activeEntryAt = (track: "video" | "overlay" | "audio", time: number) =>
    items
      .map((item, index) => ({ item, index, start: timelineStartOf(item, index) }))
      .find(({ item, start }) => {
        const resolvedTrack = item.track || (item.item_type === "audio" ? "audio" : item.item_type === "clip" || item.item_type === "freeze" ? "video" : "overlay");
        return resolvedTrack === track && time >= start && time < start + itemDuration(item);
      });

  const activeVideoEntry = activeEntryAt("video", playhead);
  const activeOverlayEntries = items
    .map((item, index) => ({ item, index, start: timelineStartOf(item, index) }))
    .filter(({ item, start }) => {
      const resolvedTrack = item.track || (item.item_type === "audio" ? "audio" : item.item_type === "clip" || item.item_type === "freeze" ? "video" : "overlay");
      return resolvedTrack === "overlay" && playhead >= start && playhead < start + itemDuration(item);
    });
  const activeAudioEntry = activeEntryAt("audio", playhead);

  useEffect(() => {
    if (!montagePlaying) {
      playStartedAtRef.current = null;
      videoRef.current?.pause();
      montageAudioRef.current?.pause();
      return;
    }

    playStartedAtRef.current = { wall: performance.now(), timeline: playhead };
    let raf = 0;
    const tick = (now: number) => {
      const started = playStartedAtRef.current;
      if (!started) return;
      const next = started.timeline + ((now - started.wall) / 1000) * playbackRate;
      if (next >= totalDuration) {
        setPlayhead(totalDuration);
        setMontagePlaying(false);
        return;
      }
      setPlayhead(next);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [montagePlaying]);

  useEffect(() => {
    if (!montagePlaying || !activeVideoEntry) return;
    const { item, start } = activeVideoEntry;
    const video = videoRef.current;
    if (!video || !item.action) return;
    const itemRate = clamp(item.playbackRate ?? 1, 0.25, 4);
    const sourceDuration = Math.max(0.1, item.clip_end - item.clip_start);
    const elapsed = Math.max(0, playhead - start);
    const sourceElapsed = (elapsed * itemRate) % sourceDuration;
    const target = item.item_type === "freeze"
      ? numberValue(item.freeze_time ?? item.clip_start)
      : item.clip_start + sourceElapsed;
    if (Math.abs(video.currentTime - target) > 0.35) video.currentTime = target;
    video.playbackRate = playbackRate * itemRate;
    if (item.item_type === "freeze") video.pause();
    else if (video.paused) void video.play().catch(() => {});
  }, [montagePlaying, playhead, activeVideoEntry?.index, playbackRate]);

  useEffect(() => {
    const audio = montageAudioRef.current;
    if (!audio) return;
    if (!montagePlaying || !activeAudioEntry) {
      audio.pause();
      return;
    }
    const { item, start } = activeAudioEntry;
    const src = item.asset_url || item.image_url || "";
    if (!src) return;
    if (audio.src !== src) audio.src = src;
    audio.volume = clamp(item.volume ?? 1, 0, 1);
    audio.playbackRate = playbackRate;
    const target = Math.max(0, playhead - start);
    if (Math.abs(audio.currentTime - target) > 0.35) audio.currentTime = target;
    if (audio.paused) void audio.play().catch(() => {});
  }, [montagePlaying, playhead, activeAudioEntry?.index, playbackRate]);

  const previewActions = useMemo(() => {
    let source = filteredActions;
    if (libraryView === "favorites") {
      source = source.filter((action) => favoriteActionIds.includes(String(action.id)));
    }
    return source;
  }, [filteredActions, favoriteActionIds, libraryView]);

  const previewAction =
    clipPreviewIndex == null ? null : previewActions[clipPreviewIndex] || null;

  const toggleFavorite = async (actionId: string) => {
    const userResponse = await supabase.auth.getUser();
    const userId = userResponse.data.user?.id;
    if (!userId || !teamId) return;

    const isFavorite = favoriteActionIds.includes(actionId);
    setFavoriteActionIds((current) =>
      isFavorite ? current.filter((id) => id !== actionId) : [...current, actionId],
    );

    if (isFavorite) {
      const { error } = await supabase
        .from("livestat_clip_favorites")
        .delete()
        .eq("user_id", userId)
        .eq("team_id", teamId)
        .eq("action_id", actionId);
      if (error) flash(error.message);
    } else {
      const { error } = await supabase
        .from("livestat_clip_favorites")
        .upsert(
          { user_id: userId, team_id: teamId, action_id: actionId },
          { onConflict: "user_id,team_id,action_id" },
        );
      if (error) flash(error.message);
    }
  };

  const createTheme = async () => {
    const name = window.prompt("Nom du thème");
    if (!name?.trim() || !teamId) return;

    const userResponse = await supabase.auth.getUser();
    const userId = userResponse.data.user?.id;
    if (!userId) return;

    const { data, error } = await supabase
      .from("livestat_clip_themes")
      .insert({
        user_id: userId,
        team_id: teamId,
        name: name.trim(),
        sort_order: themes.length,
      })
      .select("id,name")
      .single();

    if (error || !data) {
      flash(error?.message || "Création du thème impossible");
      return;
    }

    setThemes((current) => [...current, { id: String(data.id), name: String(data.name), actionIds: [] }]);
  };

  const addActionToTheme = async (themeId: string, actionId: string) => {
    const userResponse = await supabase.auth.getUser();
    const userId = userResponse.data.user?.id;
    if (!userId) return;

    const { error } = await supabase
      .from("livestat_clip_theme_items")
      .upsert(
        { theme_id: themeId, user_id: userId, action_id: actionId },
        { onConflict: "theme_id,action_id" },
      );

    if (error) {
      flash(error.message);
      return;
    }

    setThemes((current) =>
      current.map((theme) =>
        theme.id === themeId && !theme.actionIds.includes(actionId)
          ? { ...theme, actionIds: [...theme.actionIds, actionId] }
          : theme,
      ),
    );
    flash("Clip ajouté au thème");
  };

  const addDesignItem = (type: "title" | "text") => {
    const label = type === "title" ? "Nouveau titre" : "Nouveau texte";
    const value = window.prompt(type === "title" ? "Titre à afficher" : "Texte à afficher", label);
    if (!value?.trim()) return;
    const insertAt = insertionIndex();
    setItems((current) => {
      const next: MontageItem = {
        action_id: `design:${uid()}`,
        sort_order: insertAt,
        item_type: type,
        title: type === "title" ? value.trim() : "Texte",
        note: type === "text" ? value.trim() : "",
        clip_start: 0,
        clip_end: 0,
        duration: type === "title" ? 4 : 4,
        image_url: "",
        freeze_time: null,
        freeze_duration: null,
        annotations: [],
        track: "overlay",
        timeline_start: playhead,
      };
      const rows = [...current];
      rows.splice(insertAt, 0, next);
      return rows.map((item, index) => ({ ...item, sort_order: index }));
    });
    setSelectedIndex(insertAt);
  };

  const uploadImageItem = async (file: File) => {
    setDesignUploading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw authError || new Error("Utilisateur non connecté");
      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const objectPath = `${authData.user.id}/${teamId || "sans-equipe"}/editor/${Date.now()}-${safeName}`;
      const { error: uploadError } = await supabase.storage
        .from("livestat-montages")
        .upload(objectPath, file, { upsert: false, contentType: file.type || undefined });
      if (uploadError) throw uploadError;
      const { data } = supabase.storage.from("livestat-montages").getPublicUrl(objectPath);
      const imageUrl = data.publicUrl;
      const insertAt = insertionIndex();
      setItems((current) => {
        const next: MontageItem = {
          action_id: `image:${uid()}`,
          sort_order: insertAt,
          item_type: "image",
          title: file.name,
          note: "",
          clip_start: 0,
          clip_end: 0,
          duration: 4,
          image_url: imageUrl,
          freeze_time: null,
          freeze_duration: null,
          annotations: [],
          track: "overlay",
          timeline_start: playhead,
        };
        const rows = [...current];
        rows.splice(insertAt, 0, next);
        return rows.map((item, index) => ({ ...item, sort_order: index }));
      });
      setSelectedIndex(insertAt);
      flash("Image ajoutée au montage");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Import image impossible.");
    } finally {
      setDesignUploading(false);
      if (imageInputRef.current) imageInputRef.current.value = "";
    }
  };

  const uploadAudioItem = async (file: File) => {
    if (!teamId) return;
    setAudioUploading(true);
    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();
      if (authError || !authData.user) throw authError || new Error("Utilisateur non connecté");

      const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "-");
      const objectPath = `${authData.user.id}/${teamId}/editor/audio/${Date.now()}-${safeName}`;

      const { error: uploadError } = await supabase.storage
        .from("livestat-montages")
        .upload(objectPath, file, {
          upsert: false,
          contentType: file.type || "audio/mpeg",
        });
      if (uploadError) throw uploadError;

      const { data } = supabase.storage.from("livestat-montages").getPublicUrl(objectPath);
      const assetUrl = data.publicUrl;

      const audio = document.createElement("audio");
      audio.preload = "metadata";
      audio.src = assetUrl;
      const duration = await new Promise<number>((resolve) => {
        const done = () => resolve(Number.isFinite(audio.duration) ? audio.duration : 10);
        audio.addEventListener("loadedmetadata", done, { once: true });
        audio.addEventListener("error", () => resolve(10), { once: true });
      });

      const insertAt = insertionIndex();
      setItems((current) => {
        const next: MontageItem = {
          action_id: `audio:${uid()}`,
          sort_order: insertAt,
          item_type: "audio",
          title: file.name,
          note: "",
          clip_start: 0,
          clip_end: duration,
          duration,
          image_url: assetUrl,
          asset_url: assetUrl,
          freeze_time: null,
          freeze_duration: null,
          annotations: [],
          track: "audio",
          timeline_start: playhead,
          volume: 1,
        };
        const rows = [...current];
        rows.splice(insertAt, 0, next);
        return rows.map((item, index) => ({ ...item, sort_order: index }));
      });
      setSelectedIndex(insertAt);
      flash("Audio ajouté au montage");
    } catch (error) {
      flash(error instanceof Error ? error.message : "Import audio impossible.");
    } finally {
      setAudioUploading(false);
      if (audioInputRef.current) audioInputRef.current.value = "";
    }
  };

  const addFreezeItem = () => {
    if (!selected || selected.item_type !== "clip") {
      flash("Sélectionne d'abord un clip.");
      return;
    }
    const current = numberValue(videoRef.current?.currentTime ?? selected.clip_start);
    const insertAt = insertionIndex();
    setItems((list) => {
      const next: MontageItem = {
        action_id: `freeze:${uid()}`,
        sort_order: insertAt,
        item_type: "freeze",
        title: "Arrêt sur image",
        note: "",
        clip_start: current,
        clip_end: current,
        duration: 2,
        image_url: "",
        freeze_time: current,
        freeze_duration: 2,
        annotations: selected.annotations,
        action: selected.action,
        track: "video",
        timeline_start: playhead,
      };
      const rows = [...list];
      rows.splice(insertAt, 0, next);
      return rows.map((item, index) => ({ ...item, sort_order: index }));
    });
    setSelectedIndex(insertAt);
  };

  useEffect(() => {
    if (clipPreviewIndex == null) return;
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target && ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)) return;

      if (event.key === "Escape") {
        setClipPreviewIndex(null);
        return;
      }
      if (event.key === "Tab") {
        event.preventDefault();
        setClipPreviewIndex((current) => {
          const index = current ?? 0;
          return event.shiftKey
            ? Math.max(0, index - 1)
            : Math.min(previewActions.length - 1, index + 1);
        });
        return;
      }
      if (event.key === "Enter" && previewAction) {
        event.preventDefault();
        addAction(previewAction);
        flash("Clip envoyé dans le montage");
        if (!event.shiftKey) {
          setClipPreviewIndex((current) => Math.min(previewActions.length - 1, (current ?? 0) + 1));
        }
        return;
      }
      if ((event.key === "f" || event.key === "F") && previewAction) {
        event.preventDefault();
        toggleFavorite(String(previewAction.id));
        return;
      }
      if (event.code === "Space") {
        event.preventDefault();
        const video = clipPreviewVideoRef.current;
        if (!video) return;
        if (video.paused) void video.play();
        else video.pause();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [clipPreviewIndex, previewAction, previewActions.length, flash]);

  useEffect(() => {
    const video = clipPreviewVideoRef.current;
    if (!video || !previewAction) return;
    const start = clipStart(previewAction);
    const end = clipEnd(previewAction);
    const seek = () => {
      video.currentTime = start;
      setClipPreviewPlaying(false);
    };
    if (video.readyState >= 1) seek();
    else video.addEventListener("loadedmetadata", seek, { once: true });
    const tick = () => {
      if (video.currentTime >= end) {
        video.pause();
        video.currentTime = end;
      }
    };
    video.addEventListener("timeupdate", tick);
    return () => {
      video.removeEventListener("loadedmetadata", seek);
      video.removeEventListener("timeupdate", tick);
    };
  }, [previewAction]);

  const toggleLibrarySelection = (actionId: string) => {
    setLibrarySelection((current) =>
      current.includes(actionId) ? current.filter((id) => id !== actionId) : [...current, actionId],
    );
  };

  const addSelectedLibraryClips = () => {
    const selectedActions = previewActions.filter((action) => librarySelection.includes(String(action.id)));
    if (!selectedActions.length) {
      flash("Sélectionne au moins un clip.");
      return;
    }
    selectedActions.forEach((action) => addAction(action));
    flash(`${selectedActions.length} clip${selectedActions.length > 1 ? "s" : ""} ajouté${selectedActions.length > 1 ? "s" : ""} au montage`);
    setLibrarySelection([]);
  };

  const presentMontage = async () => {
    if (!items.length) {
      flash("Ajoute d'abord des éléments au montage.");
      return;
    }
    setPlayhead(0);
    setMontagePlaying(true);
    const stage = document.querySelector<HTMLElement>(".mp-stage");
    if (stage?.requestFullscreen) {
      try { await stage.requestFullscreen(); } catch { /* plein écran facultatif */ }
    }
  };

  const stageEntry = montagePlaying && activeVideoEntry ? activeVideoEntry : (selected ? { item: selected, index: selectedIndex, start: timelineStartOf(selected, selectedIndex) } : undefined);
  const stageItem = stageEntry?.item;
  const stageVideo = actionVideoUrl(stageItem?.action, matchMap);

  const stageSourceTime = stageItem
    ? stageItem.item_type === "freeze"
      ? numberValue(stageItem.freeze_time ?? stageItem.clip_start)
      : (() => {
          const sourceDuration = Math.max(0.1, stageItem.clip_end - stageItem.clip_start);
          const rate = clamp(stageItem.playbackRate ?? 1, 0.25, 4);
          const elapsed = Math.max(0, playhead - (stageEntry?.start ?? 0));
          return stageItem.clip_start + ((elapsed * rate) % sourceDuration);
        })()
    : 0;

  const visibleStageDrawings = (stageItem?.annotations || []).filter((drawing) => {
    const start = numberValue(drawing.start);
    const end = Math.max(start, numberValue(drawing.end));
    return stageSourceTime >= start && stageSourceTime <= end;
  });

  return (
    <div className={`montage-pro ${embedded ? "embedded" : ""}`}>
      <header className="mp-header">
        <div className="mp-brand">
          <span className="mp-logo">◩</span>
          <strong>MyBasket</strong>
          <em>MONTAGE PRO</em>
        </div>

        <div className="mp-project-name">
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Titre du montage" />
          <span className={`mp-save-pill ${saveState}`}>
            {saveState === "saving" ? "Sauvegarde…" : saveState === "error" ? "Erreur" : "Sauvegardé"}
          </span>
        </div>

        <div className="mp-header-actions">
          <button onClick={presentMontage}>▷ Présenter</button>
          <button onClick={exportMontageLocally} disabled={rendering}>⇧ {rendering ? "Rendu…" : "Exporter"}</button>
          <div className="mp-add-menu-wrap">
            <button className="gold" onClick={() => setAddMenuOpen((value) => !value)}>＋ Ajouter des éléments⌄</button>
            {addMenuOpen && (
              <div className="mp-add-menu">
                <button onClick={() => { setAddMenuOpen(false); addDesignItem("title"); }}>T Titre</button>
                <button onClick={() => { setAddMenuOpen(false); addDesignItem("text"); }}>¶ Texte</button>
                <button onClick={() => { setAddMenuOpen(false); imageInputRef.current?.click(); }}>▣ Image</button>
                <button onClick={() => { setAddMenuOpen(false); addFreezeItem(); }}>❄ Freeze</button>
                <button onClick={() => { setAddMenuOpen(false); audioInputRef.current?.click(); }}>♫ Audio</button>
              </div>
            )}
          </div>
          <button className="mp-more" onClick={saveMontage} disabled={saving} title="Sauvegarder">•••</button>
        </div>
      </header>

      <main className="mp-grid">
        <aside className="mp-library">
          <div className="mp-section-title">
            <strong>BIBLIOTHÈQUE DE CLIPS</strong>
            <span>{previewActions.length}</span>
          </div>

          <div className="mp-search-row">
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher joueur, système, action, tag…" />
            <button title="Filtres">⚲</button>
          </div>

          <div className="mp-tabs">
            {([
              ["all","Tous"],
              ["favorites","Favoris"],
              ["themes","Thèmes"],
              ["players","Joueurs"],
              ["systems","Systèmes"],
            ] as const).map(([key,label]) => (
              <button key={key} className={libraryView===key?"on":""} onClick={()=>setLibraryView(key)}>{label}</button>
            ))}
          </div>

          {libraryView === "players" && (
            <select className="mp-library-select" value={selectedPlayerFilter} onChange={(e) => setSelectedPlayerFilter(e.target.value)}>
              <option value="">Tous les joueurs</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>{player.name || `${player.first_name || ""} ${player.last_name || ""}`.trim() || player.id}</option>
              ))}
            </select>
          )}

          {libraryView === "systems" && (
            <select className="mp-library-select" value={selectedSystemFilter} onChange={(e) => setSelectedSystemFilter(e.target.value)}>
              <option value="">Tous les systèmes / temps forts</option>
              {Array.from(new Set(actions.map((action) => String(action.temps_fort || "")).filter(Boolean))).map((value) => (
                <option key={value} value={value}>{tfLabel(value)}</option>
              ))}
            </select>
          )}

          {libraryView === "themes" && (
            <select className="mp-library-select" value={selectedThemeId} onChange={(e) => setSelectedThemeId(e.target.value)}>
              <option value="">Tous les thèmes</option>
              {themes.map((theme) => <option key={theme.id} value={theme.id}>{theme.name}</option>)}
            </select>
          )}

          <div className="mp-filter-chips">
            <button className={filter==="all"?"on":""} onClick={()=>setFilter("all")}>Tous</button>
            <button className={filter==="made"?"on":""} onClick={()=>setFilter("made")}>Marqués</button>
            <button className={filter==="missed"?"on":""} onClick={()=>setFilter("missed")}>Ratés</button>
            <button className={filter==="video"?"on":""} onClick={()=>setFilter("video")}>Avec vidéo</button>
          </div>

          <div className="mp-clips">
            {loading ? <div className="mp-empty">Chargement…</div> :
            previewActions.length===0 ? <div className="mp-empty">Aucun clip disponible.</div> :
            previewActions.map((action,index)=>{
              const id=String(action.id);
              const favorite=favoriteActionIds.includes(id);
              const duration=Math.max(.1,clipEnd(action)-clipStart(action));
              return (
                <div
                  className={`mp-clip-card ${librarySelection.includes(id) ? "selected" : ""}`}
                  key={id}
                  draggable
                  onDragStart={(event)=>{
                    event.dataTransfer.setData("text/mybasket-action",id);
                    event.dataTransfer.effectAllowed="copy";
                  }}
                >
                  <button className="mp-clip-open" onClick={()=>setClipPreviewIndex(index)}>
                    <div className="mp-thumb">
                      <span>▶</span>
                      <small>{duration.toFixed(0)}s</small>
                    </div>
                    <div className="mp-clip-copy">
                      <small>{action.quarter ? `Q${action.quarter}` : ""} · {action.clock || ""}</small>
                      <strong>{actionLabel(action)}</strong>
                      <div>
                        {action.context && <i>{action.context}</i>}
                        {action.temps_fort && <i>{tfLabel(action.temps_fort)}</i>}
                        {action.action_type && <i>{action.action_type}</i>}
                        {action.shot_type && <i>{action.shot_type}</i>}
                      </div>
                    </div>
                  </button>
                  <button className={`mp-star ${favorite?"on":""}`} onClick={()=>toggleFavorite(id)}>{favorite?"★":"☆"}</button>
                  <button className={`mp-add ${librarySelection.includes(id) ? "selected" : ""}`} onClick={()=>toggleLibrarySelection(id)}>{librarySelection.includes(id) ? "✓" : "○"}</button>
                </div>
              )
            })}
          </div>

          <button className="mp-library-add-selected" onClick={addSelectedLibraryClips} disabled={!librarySelection.length}>
            Ajouter les clips sélectionnés ({librarySelection.length})
          </button>

          <div className={`mp-themes ${libraryView === "themes" ? "visible" : ""}`}>
            <div className="mp-themes-head">
              <strong>MES THÈMES</strong>
              <button onClick={createTheme}>＋ Nouveau thème</button>
            </div>
            {themes.length===0 && <div className="mp-empty small">Crée un thème puis glisse tes clips dedans.</div>}
            {themes.map(theme=>(
              <div
                className="mp-theme"
                key={theme.id}
                onDragOver={(event)=>event.preventDefault()}
                onDrop={(event)=>{
                  event.preventDefault();
                  const actionId=event.dataTransfer.getData("text/mybasket-action");
                  if(actionId) addActionToTheme(theme.id,actionId);
                }}
              >
                <span>📁</span>
                <strong>{theme.name}</strong>
                <b>{theme.actionIds.length}</b>
              </div>
            ))}
          </div>
        </aside>

        <section className="mp-center">
          <div className="mp-stage">
            {stageItem?.item_type === "image" && stageItem.image_url ? (
              <div className="mp-editable-overlay" style={{left:`${stageItem.x ?? 50}%`,top:`${stageItem.y ?? 50}%`,width:`${stageItem.width ?? 30}%`,opacity:stageItem.opacity ?? 1,transform:`translate(-50%,-50%) rotate(${stageItem.rotation ?? 0}deg)`}} onPointerDown={(e)=>{if(stageItem.locked)return; const box=e.currentTarget.parentElement!.getBoundingClientRect(); const move=(ev:PointerEvent)=>updateSelected({x:clamp(((ev.clientX-box.left)/box.width)*100,0,100),y:clamp(((ev.clientY-box.top)/box.height)*100,0,100)}); const up=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up)};window.addEventListener("pointermove",move);window.addEventListener("pointerup",up)}}><img src={stageItem.image_url} alt={stageItem.title} /></div>
            ) : stageItem?.item_type === "title" || stageItem?.item_type === "text" ? (
              <div className="mp-design-preview mp-editable-overlay" style={{left:`${stageItem.x ?? 50}%`,top:`${stageItem.y ?? 50}%`,width:`${stageItem.width ?? 70}%`,opacity:stageItem.opacity ?? 1,transform:`translate(-50%,-50%) rotate(${stageItem.rotation ?? 0}deg)`,fontSize:`${stageItem.fontSize ?? (stageItem.item_type === "title" ? 48 : 30)}px`,fontFamily:stageItem.fontFamily ?? "Arial",fontWeight:stageItem.fontWeight ?? 800,textAlign:stageItem.textAlign ?? "center",background:stageItem.background ?? "transparent"}} onPointerDown={(e)=>{if(stageItem.locked)return; const box=e.currentTarget.parentElement!.getBoundingClientRect(); const move=(ev:PointerEvent)=>updateSelected({x:clamp(((ev.clientX-box.left)/box.width)*100,0,100),y:clamp(((ev.clientY-box.top)/box.height)*100,0,100)}); const up=()=>{window.removeEventListener("pointermove",move);window.removeEventListener("pointerup",up)};window.addEventListener("pointermove",move);window.addEventListener("pointerup",up)}}><strong>{stageItem.item_type === "title" ? stageItem.title : stageItem.note}</strong></div>
            ) : stageVideo ? (
              <video
                ref={videoRef}
                src={stageVideo}
                playsInline
                onTimeUpdate={(event) => {
                  if (!montagePlaying && stageItem?.item_type === "clip" && event.currentTarget.currentTime >= stageItem.clip_end) event.currentTarget.pause();
                }}
              />
            ) : stageItem?.action?.match_id ? (
              <div className="mp-stage-empty mp-stage-connect">
                <strong>Vidéo locale du match</strong>
                <span>MyBasket utilise la vidéo locale liée à ce match pour garder une lecture fluide.</span>
                <LocalMatchVideoButton
                  matchId={String(stageItem.action.match_id)}
                  teamId={String(stageItem.action.team_id || teamId)}
                />
              </div>
            ) : (
              <div className="mp-stage-empty">Sélectionne un clip dans la bibliothèque ou dans la timeline.</div>
            )}

            {(stageItem?.item_type === "clip" || stageItem?.item_type === "freeze") && !montagePlaying && <canvas
              ref={canvasRef}
              width={960}
              height={540}
              onPointerDown={(event)=>{
                const point = pointer(event);
                dragOrigin.current=point;
                freehandPointsRef.current = drawMode === "freehand" ? [point] : [];
                event.currentTarget.setPointerCapture?.(event.pointerId);
              }}
              onPointerMove={(event)=>{
                if (drawMode !== "freehand" || !dragOrigin.current) return;
                freehandPointsRef.current = [...freehandPointsRef.current, pointer(event)];
              }}
              onPointerUp={(event)=>{
                if(!selected || !dragOrigin.current) return;
                const startPoint=dragOrigin.current;
                const endPoint=pointer(event);
                dragOrigin.current=null;
                const currentTime=stageItem?.item_type === "freeze"
                  ? numberValue(stageItem.freeze_time ?? stageItem.clip_start)
                  : numberValue(videoRef.current?.currentTime);
                const drawText=drawMode==="text" ? window.prompt("Texte à afficher") || "Texte" : undefined;
                const drawing: Drawing = {
                  id:uid(),kind:drawMode,x1:startPoint.x,y1:startPoint.y,x2:endPoint.x,y2:endPoint.y,
                  color:drawColor,width:5,text:drawText,start:currentTime,end:currentTime+3,
                  points: drawMode === "freehand" ? freehandPointsRef.current : undefined,
                  fillOpacity: drawMode === "zone" ? 0.18 : undefined,
                };
                freehandPointsRef.current = [];
                updateSelected({annotations:[...selected.annotations,drawing]});
                setSelectedDrawingId(drawing.id);
              }}
            />}

            {visibleStageDrawings.length > 0 && (
              <svg className="mp-live-drawings" viewBox="0 0 960 540" preserveAspectRatio="none">
                <defs>
                  <marker id="mp-arrow-head" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                    <path d="M0,0 L0,6 L9,3 z" fill="context-stroke" />
                  </marker>
                </defs>
                {visibleStageDrawings.map((drawing) => {
                  if (drawing.kind === "circle") {
                    const radius = Math.hypot(drawing.x2 - drawing.x1, drawing.y2 - drawing.y1);
                    return (
                      <circle
                        key={drawing.id}
                        cx={drawing.x1}
                        cy={drawing.y1}
                        r={radius}
                        fill="none"
                        stroke={drawing.color}
                        strokeWidth={drawing.width}
                      />
                    );
                  }
                  if (drawing.kind === "zone") {
                    const x = Math.min(drawing.x1, drawing.x2);
                    const y = Math.min(drawing.y1, drawing.y2);
                    const width = Math.abs(drawing.x2 - drawing.x1);
                    const height = Math.abs(drawing.y2 - drawing.y1);
                    return (
                      <rect key={drawing.id} x={x} y={y} width={width} height={height}
                        fill={drawing.color} fillOpacity={drawing.fillOpacity ?? 0.18}
                        stroke={drawing.color} strokeWidth={drawing.width} rx="8" />
                    );
                  }
                  if (drawing.kind === "freehand") {
                    const points = drawing.points || [];
                    return points.length > 1 ? (
                      <polyline key={drawing.id} points={points.map((point) => `${point.x},${point.y}`).join(" ")}
                        fill="none" stroke={drawing.color} strokeWidth={drawing.width} strokeLinecap="round" strokeLinejoin="round" />
                    ) : null;
                  }
                  if (drawing.kind === "tracker") {
                    const local = Math.max(0, playhead - Number(stageItem?.timeline_start ?? 0));
                    const span = Math.max(0.001, Number(drawing.end ?? 0) - Number(drawing.start ?? 0));
                    const t = Math.max(0, Math.min(1, (local - Number(drawing.start ?? 0)) / span));
                    const cx = drawing.x1 + (drawing.x2 - drawing.x1) * t;
                    const cy = drawing.y1 + (drawing.y2 - drawing.y1) * t;
                    return <circle key={drawing.id} cx={cx} cy={cy} r="42" fill="none" stroke={drawing.color} strokeWidth={drawing.width} />;
                  }
                  if (drawing.kind === "text") {
                    return (
                      <text
                        key={drawing.id}
                        x={drawing.x1}
                        y={drawing.y1}
                        fill={drawing.color}
                        fontSize="30"
                        fontWeight="900"
                      >
                        {drawing.text || "Texte"}
                      </text>
                    );
                  }
                  return (
                    <line
                      key={drawing.id}
                      x1={drawing.x1}
                      y1={drawing.y1}
                      x2={drawing.x2}
                      y2={drawing.y2}
                      stroke={drawing.color}
                      strokeWidth={drawing.width}
                      strokeLinecap="round"
                      markerEnd={drawing.kind === "arrow" ? "url(#mp-arrow-head)" : undefined}
                    />
                  );
                })}
              </svg>
            )}

            {montagePlaying && activeOverlayEntries.map(({ item, index }) => (
              <div className={`mp-live-overlay type-${item.item_type}`} key={`${item.action_id}:${index}`}>
                {item.item_type === "image" && item.image_url ? <img src={item.image_url} alt={item.title} /> : <strong>{item.item_type === "title" ? item.title : item.note || item.title}</strong>}
              </div>
            ))}
            <audio ref={montageAudioRef} hidden />
          </div>

          <div className="mp-player-bar">
            <button onClick={()=>selectedIndex>0 && setSelectedIndex(selectedIndex-1)}>⏮</button>
            <button onClick={()=>{
              if (playhead >= totalDuration) setPlayhead(0);
              setMontagePlaying((value) => !value);
            }}>{montagePlaying ? "❚❚" : "▶"}</button>
            <button onClick={()=>selectedIndex<items.length-1 && setSelectedIndex(selectedIndex+1)}>⏭</button>
            <div className="mp-time">
              <span>{`${String(Math.floor(playhead/60)).padStart(2,"0")}:${String(Math.floor(playhead%60)).padStart(2,"0")}`}</span>
              <div><i /></div>
              <span>{`${String(Math.floor(totalDuration/60)).padStart(2,"0")}:${String(Math.floor(totalDuration%60)).padStart(2,"0")}`}</span>
            </div>
            <select value={playbackRate} onChange={(e) => setPlaybackRate(numberValue(e.target.value))}>
              <option value={0.5}>0.5x</option>
              <option value={0.75}>0.75x</option>
              <option value={1}>1x</option>
              <option value={1.25}>1.25x</option>
              <option value={1.5}>1.5x</option>
              <option value={2}>2x</option>
            </select>
          </div>

          <div className="mp-tools">
            <button onClick={()=>addDesignItem("title")}>＋ Titre</button>
            <button onClick={()=>addDesignItem("text")}>＋ Texte</button>
            <button onClick={()=>imageInputRef.current?.click()} disabled={designUploading}>▣ {designUploading ? "Import…" : "Image"}</button>
            <button className={drawMode==="arrow"?"on":""} onClick={()=>setDrawMode("arrow")}>➜</button>
            <button className={drawMode==="line"?"on":""} onClick={()=>setDrawMode("line")}>／</button>
            <button className={drawMode==="circle"?"on":""} onClick={()=>setDrawMode("circle")}>◎</button>
            <button className={drawMode==="zone"?"on":""} onClick={()=>setDrawMode("zone")}>▭</button>
            <button className={drawMode==="freehand"?"on":""} onClick={()=>setDrawMode("freehand")}>✎</button><button className={drawMode==="tracker"?"on":""} onClick={()=>setDrawMode("tracker" as any)}>◎</button>
            <button onClick={addFreezeItem}>◉ Freeze</button>
            <button onClick={() => audioInputRef.current?.click()} disabled={audioUploading}>♫ {audioUploading ? "Import…" : "Audio"}</button>
            <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(e)=>{const file=e.target.files?.[0]; if(file) void uploadImageItem(file)}} />
            <input ref={audioInputRef} type="file" accept="audio/*" hidden onChange={(e)=>{const file=e.target.files?.[0]; if(file) void uploadAudioItem(file)}} />
          </div>

          {renderJobId && (
            <div className="mp-render-status">
              <div><strong>EXPORT MP4</strong><span>{renderStatus === "queued" ? "En attente…" : renderStatus === "rendering" ? "Rendu en cours…" : ["done","completed"].includes(renderStatus) ? "Terminé" : renderStatus}</span></div>
              <div className="mp-render-progress"><i style={{ width: `${Math.max(0, Math.min(100, renderProgress))}%` }} /></div>
              <b>{Math.round(renderProgress)}%</b>
              {renderOutputUrl && <a href={renderOutputUrl} target="_blank" rel="noreferrer">Ouvrir la vidéo</a>}
            </div>
          )}

          <div className="mp-timeline-head">
            <div>
              <strong>ORDRE DU MONTAGE</strong>
              <small>{items.length} élément{items.length>1?"s":""} · {totalDuration.toFixed(1)}s</small>
            </div>
            <div>
              <button onClick={()=>setTimelineZoom(z=>Math.max(.5,z-.25))}>−</button>
              <span>{timelineZoom.toFixed(2)}×</span>
              <button onClick={()=>setTimelineZoom(z=>Math.min(3,z+.25))}>＋</button>
            </div>
          </div>

          <div className="mp-storyboard">
            <div className="mp-storyboard-ruler">
              <span>00:00</span><span>00:15</span><span>00:30</span><span>00:45</span><span>01:00</span><span>01:15</span><span>{formatClipTime(totalDuration)}</span>
            </div>
            <div className="mp-storyboard-strip">
              {items.length === 0 ? (
                <div className="mp-storyboard-empty">Ajoute des clips ou des éléments pour construire ton montage.</div>
              ) : items.map((item, index) => {
                const duration = itemDuration(item);
                const typeLabel = item.item_type === "freeze" ? "Freeze" : item.item_type === "title" ? "Titre" : item.item_type === "image" ? "Image" : item.item_type === "audio" ? "Audio" : item.item_type === "text" ? "Texte" : "Clip";
                return (
                  <button
                    key={`${item.action_id}:${index}`}
                    className={`mp-story-card type-${item.item_type} ${selectedIndex === index ? "selected" : ""}`}
                    onClick={() => { setSelectedIndex(index); setPlayhead(timelineStartOf(item, index)); }}
                    draggable
                    onDragStart={(event) => { event.dataTransfer.setData("text/mybasket-story-index", String(index)); }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const from = Number(event.dataTransfer.getData("text/mybasket-story-index"));
                      if (Number.isFinite(from) && from !== index) moveItem(from, index);
                    }}
                  >
                    <span className="mp-story-index">{index + 1}</span>
                    <div className="mp-story-visual">
                      {item.item_type === "clip" ? <span>▶</span> : item.item_type === "freeze" ? <span>Ⅱ</span> : item.item_type === "audio" ? <span>♫</span> : item.item_type === "image" ? <span>▣</span> : <strong>{item.item_type === "title" ? item.title : item.note || item.title}</strong>}
                    </div>
                    <strong className="mp-story-title">{item.title || typeLabel}</strong>
                    <small>{typeLabel} · {formatClipTime(duration)}</small>
                    <b onClick={(event) => { event.stopPropagation(); removeItem(index); }}>×</b>
                  </button>
                );
              })}
              <button className="mp-story-add" onClick={() => setAddMenuOpen(true)}>＋<small>Ajouter</small></button>
            </div>
            <div className="mp-story-toolbar">
              <button onClick={() => { document.querySelector<HTMLElement>(".mp-library")?.scrollTo({ top: 0, behavior: "smooth" }); }}>▣ Ajouter des clips</button>
              <button onClick={() => addDesignItem("title")}>T Titre</button>
              <button onClick={() => imageInputRef.current?.click()}>▧ Image</button>
              <button onClick={addFreezeItem}>❄ Freeze</button>
              <button onClick={() => addDesignItem("text")}>Ⅱ Pause / texte</button>
              <button onClick={() => audioInputRef.current?.click()}>♫ Audio</button>
              <button onClick={() => selected && updateSelected({ transition: selected.transition === "fade" ? "none" : "fade" })}>⌁ Transition</button>
              <div className="mp-zoom"><span>Zoom</span><input type="range" min="0.5" max="3" step="0.25" value={timelineZoom} onChange={(e)=>setTimelineZoom(numberValue(e.target.value))}/></div>
            </div>
          </div>
        </section>

        <aside className="mp-inspector">
          <div className="mp-inspector-tabs"><button className="on">Élément</button><button>Projet</button></div>
          {!selected ? <div className="mp-empty">Sélectionne un élément.</div> : (
            <div className="mp-inspector-form">
              <label>Titre<input value={selected.title} onChange={(e)=>updateSelected({title:e.target.value})}/></label>
              <label>Type<div className="mp-readonly">{selected.item_type}</div></label>

              {selected.item_type==="clip" ? <>
                <div className="mp-clip-time-readable">
                  <span>Début <b>00:00.0</b></span>
                  <span>Fin <b>{formatClipTime(Math.max(0, selected.clip_end - selected.clip_start))}</b></span>
                  <span>Durée <b>{formatClipTime(itemDuration(selected))}</b></span>
                </div>
                <div className="mp-trim-panel">
                  <strong>ROGNER LE CLIP</strong>
                  <div className="mp-trim-labels"><span>Début<br/><b>00:00.0</b></span><span>Fin<br/><b>{formatClipTime(selected.clip_end - selected.clip_start)}</b></span></div>
                  <div className="mp-trim-range">
                    <input type="range" min={selected.action ? clipStart(selected.action) : selected.clip_start} max={Math.max(selected.clip_start, selected.clip_end - 0.1)} step="0.1" value={selected.clip_start} onChange={(e)=>updateSelected({clip_start:Math.min(numberValue(e.target.value), selected.clip_end - 0.1)})}/>
                    <input type="range" min={Math.min(selected.clip_end, selected.clip_start + 0.1)} max={selected.action ? clipEnd(selected.action) : selected.clip_end} step="0.1" value={selected.clip_end} onChange={(e)=>updateSelected({clip_end:Math.max(numberValue(e.target.value), selected.clip_start + 0.1)})}/>
                  </div>
                </div>
                <div className="mp-nudge">
                  <button onClick={()=>updateSelected({clip_start:Math.max(0,selected.clip_start-1)})}>−1 début</button>
                  <button onClick={()=>updateSelected({clip_start:selected.clip_start+1})}>+1 début</button>
                  <button onClick={()=>updateSelected({clip_end:Math.max(selected.clip_start+.1,selected.clip_end-1)})}>−1 fin</button>
                  <button onClick={()=>updateSelected({clip_end:selected.clip_end+1})}>+1 fin</button>
                </div>
                <div className="mp-two">
                  <label>Vitesse<select value={selected.playbackRate ?? 1} onChange={(e)=>updateSelected({playbackRate:numberValue(e.target.value)})}><option value={0.25}>0.25x</option><option value={0.5}>0.5x</option><option value={0.75}>0.75x</option><option value={1}>1x</option><option value={1.25}>1.25x</option><option value={1.5}>1.5x</option><option value={2}>2x</option></select></label>
                  <label>Répéter<select value={selected.repeatCount ?? 1} onChange={(e)=>updateSelected({repeatCount:Math.max(1,Math.round(numberValue(e.target.value)))})}><option value={1}>1 fois</option><option value={2}>2 fois</option><option value={3}>3 fois</option><option value={4}>4 fois</option></select></label><label>Transition<select value={selected.transition ?? "none"} onChange={(e)=>updateSelected({transition:e.target.value as "none" | "fade"})}><option value="none">Aucune</option><option value="fade">Fondu</option></select></label>
                </div>
              </> : (
                <label>Durée<input type="number" min=".5" step=".5" value={selected.duration||4} onChange={(e)=>updateSelected({duration:numberValue(e.target.value)})}/></label>
              )}

              <label>Note / texte<textarea value={selected.note} onChange={(e)=>updateSelected({note:e.target.value})}/></label>

              {(selected.item_type==="clip" || selected.item_type==="freeze") && <>
                <div className="mp-inspector-tools mp-draw-tools">
                  <button className={drawMode==="arrow"?"on":""} onClick={()=>setDrawMode("arrow")}>➜ Flèche</button>
                  <button className={drawMode==="line"?"on":""} onClick={()=>setDrawMode("line")}>／ Ligne</button>
                  <button className={drawMode==="circle"?"on":""} onClick={()=>setDrawMode("circle")}>○ Cercle</button>
                  <button className={drawMode==="zone"?"on":""} onClick={()=>setDrawMode("zone")}>▭ Zone</button>
                  <button className={drawMode==="freehand"?"on":""} onClick={()=>setDrawMode("freehand")}>✎ Libre</button><button className={drawMode==="tracker"?"on":""} onClick={()=>setDrawMode("tracker" as any)}>◎ Suivi</button>
                  <button className={drawMode==="text"?"on":""} onClick={()=>setDrawMode("text")}>T Texte</button>
                  <input type="color" value={drawColor} onChange={(e)=>setDrawColor(e.target.value)}/>
                </div>
                <button onClick={()=>updateSelected({annotations:selected.annotations.slice(0,-1)})}>↶ Annuler le dernier dessin</button>
                {selected.annotations.length > 0 && <div className="mp-annotation-list">
                  <strong>Annotations temporelles</strong>
                  {selected.annotations.map((drawing, drawingIndex) => (
                    <div key={drawing.id} className={`mp-annotation-row ${selectedDrawingId===drawing.id?"on":""}`}>
                      <button className="mp-annotation-name" onClick={()=>setSelectedDrawingId(drawing.id)}>
                        {drawing.kind === "arrow" ? "Flèche" : drawing.kind === "circle" ? "Cercle" : drawing.kind === "line" ? "Ligne" : drawing.kind === "zone" ? "Zone" : drawing.kind === "freehand" ? "Dessin libre" : drawing.kind === "tracker" ? "Suivi joueur" : "Texte"}
                      </button>
                      <input type="number" step=".1" value={drawing.start} title="Apparition" onChange={(e)=>{ const value=numberValue(e.target.value); updateSelected({annotations:selected.annotations.map((row,i)=>i===drawingIndex?{...row,start:value,end:Math.max(value,row.end)}:row)}); }}/>
                      <span>→</span>
                      <input type="number" step=".1" value={drawing.end} title="Disparition" onChange={(e)=>{ const value=numberValue(e.target.value); updateSelected({annotations:selected.annotations.map((row,i)=>i===drawingIndex?{...row,end:Math.max(row.start,value)}:row)}); }}/>
                      <button className="danger mini" onClick={()=>updateSelected({annotations:selected.annotations.filter((_,i)=>i!==drawingIndex)})}>×</button>
                    </div>
                  ))}
                  <small>Début et fin sont exprimés dans le temps source du clip. Tu peux donc faire apparaître puis disparaître chaque annotation exactement au bon moment.</small>
                </div>}
              </>}

              {selected.item_type === "clip" && <div className="mp-inspector-tools"><button onClick={splitSelectedClip}>✂ Scinder ici</button><button onClick={resetSelectedTrim}>↺ Réinitialiser rognage</button></div>}
              <div className="mp-inspector-tools"><button onClick={duplicateSelected}>⧉ Dupliquer</button></div>
              {["title","text","image"].includes(selected.item_type) && <>
                <div className="mp-two"><label>X %<input type="number" value={selected.x ?? 50} onChange={e=>updateSelected({x:numberValue(e.target.value)})}/></label><label>Y %<input type="number" value={selected.y ?? 50} onChange={e=>updateSelected({y:numberValue(e.target.value)})}/></label></div>
                <div className="mp-two"><label>Largeur %<input type="number" min="5" max="100" value={selected.width ?? (selected.item_type === "image" ? 30 : 70)} onChange={e=>updateSelected({width:numberValue(e.target.value)})}/></label><label>Rotation°<input type="number" value={selected.rotation ?? 0} onChange={e=>updateSelected({rotation:numberValue(e.target.value)})}/></label></div>
                <label>Opacité<input type="range" min="0" max="1" step=".05" value={selected.opacity ?? 1} onChange={e=>updateSelected({opacity:numberValue(e.target.value)})}/></label>
                {selected.item_type !== "image" && <><div className="mp-two"><label>Taille texte<input type="number" min="10" max="140" value={selected.fontSize ?? (selected.item_type === "title" ? 48 : 30)} onChange={e=>updateSelected({fontSize:numberValue(e.target.value)})}/></label><label>Police<select value={selected.fontFamily ?? "Arial"} onChange={e=>updateSelected({fontFamily:e.target.value})}><option>Arial</option><option>Roboto</option><option>Georgia</option><option>Impact</option></select></label></div><label>Alignement<select value={selected.textAlign ?? "center"} onChange={e=>updateSelected({textAlign:e.target.value as "left"|"center"|"right"})}><option value="left">Gauche</option><option value="center">Centre</option><option value="right">Droite</option></select></label></>}
                <label><input type="checkbox" checked={selected.locked ?? false} onChange={e=>updateSelected({locked:e.target.checked})}/> Verrouiller le calque</label>
              </>}
              <button className="danger" onClick={()=>removeItem(selectedIndex)}>🗑 Retirer de la timeline</button>
            </div>
          )}

          {selected?.item_type === "freeze" && (
            <div className="mp-freeze-inspector">
              <strong>Arrêt sur image</strong>
              <label>
                Durée
                <input
                  type="number"
                  min="0.2"
                  step="0.1"
                  value={selected.duration ?? selected.freeze_duration ?? 2}
                  onChange={(e) => {
                    const duration = Math.max(0.2, numberValue(e.target.value));
                    updateSelected({ duration, freeze_duration: duration });
                  }}
                />
              </label>
              <small>Image figée à {`${String(Math.floor(numberValue(selected.freeze_time)/60)).padStart(2,"0")}:${String((numberValue(selected.freeze_time)%60).toFixed(1)).padStart(4,"0")}`}</small>
            </div>
          )}

          {selected?.item_type === "audio" && (
            <div className="mp-audio-inspector">
              <strong>Audio</strong>
              <label>
                Volume
                <input
                  type="range"
                  min="0"
                  max="1.5"
                  step="0.05"
                  value={selected.volume ?? 1}
                  onChange={(e) => updateSelected({ volume: Number(e.target.value) })}
                />
              </label>
              <small>{Math.round((selected.volume ?? 1) * 100)}%</small>
            </div>
          )}

          <label className="mp-project-note">Notes projet<textarea value={coachNote} onChange={(e)=>setCoachNote(e.target.value)}/></label>
        </aside>
      </main>

      {clipPreviewIndex!=null && previewAction && (
        <div className="mp-modal-backdrop" onClick={()=>setClipPreviewIndex(null)}>
          <div className="mp-clip-modal" onClick={(e)=>e.stopPropagation()}>
            <header>
              <div>
                <small>{previewAction.quarter ? `Q${previewAction.quarter}` : ""} · {previewAction.clock || ""}</small>
                <h2>{actionLabel(previewAction)}</h2>
              </div>
              <button onClick={()=>setClipPreviewIndex(null)}>×</button>
            </header>

            <div className="mp-modal-stage">
              {actionVideoUrl(previewAction,matchMap) ? (
                <video
                  ref={clipPreviewVideoRef}
                  src={actionVideoUrl(previewAction,matchMap)}
                  controls
                  playsInline
                  onPlay={()=>setClipPreviewPlaying(true)}
                  onPause={()=>setClipPreviewPlaying(false)}
                />
              ) : <div className="mp-stage-empty">Vidéo indisponible</div>}
            </div>

            <div className="mp-modal-tags">
              {previewAction.context && <i>{previewAction.context}</i>}
              {previewAction.temps_fort && <i>{tfLabel(previewAction.temps_fort)}</i>}
              {previewAction.action_type && <i>{previewAction.action_type}</i>}
              {previewAction.shot_type && <i>{previewAction.shot_type}</i>}
              {previewAction.shot_result && <i>{previewAction.shot_result==="made"?"Marqué":"Raté"}</i>}
            </div>

            <div className="mp-modal-actions">
              <button onClick={()=>toggleFavorite(String(previewAction.id))}>{favoriteActionIds.includes(String(previewAction.id))?"★ Favori":"☆ Favori"}</button>
              <button onClick={()=>setDrawMode("arrow")}>✎ Dessiner</button>
            </div>

            <footer>
              <button onClick={()=>setClipPreviewIndex(i=>Math.max(0,(i??0)-1))}>← Précédent <kbd>⇧TAB</kbd></button>
              <button className="gold" onClick={()=>{addAction(previewAction);flash("Clip envoyé dans le montage")}}>＋ Ajouter au montage <kbd>Entrée</kbd></button>
              <button onClick={()=>setClipPreviewIndex(i=>Math.min(previewActions.length-1,(i??0)+1))}>Suivant <kbd>TAB</kbd> →</button>
            </footer>
          </div>
        </div>
      )}

      {shareOpen && (
        <div className="mp-modal-backdrop" onClick={()=>setShareOpen(false)}>
          <div className="mp-share" onClick={(e)=>e.stopPropagation()}>
            <h2>Partager le montage</h2>
            <input value={recipient} onChange={(e)=>setRecipient(e.target.value)} placeholder="E-mail ou téléphone"/>
            <div><button onClick={()=>void share("mail")}>E-mail</button><button onClick={()=>void share("whatsapp")}>WhatsApp</button><button onClick={()=>void share("copy")}>Copier</button><button onClick={()=>void share("native")}>Partager</button></div>
          </div>
        </div>
      )}

      {toast && <div className="mp-toast">{toast}</div>}

      <style jsx>{`
        .montage-pro{--gold:#d6a23d;--gold2:#f2b948;--bg:#050a11;--panel:#09111b;--panel2:#0c1622;--line:#263344;--text:#f3f5f8;--muted:#8995a5;min-height:100vh;background:radial-gradient(circle at 50% 0,#0c1622 0,#050a11 42%);color:var(--text);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.montage-pro *{box-sizing:border-box}.montage-pro button,.montage-pro input,.montage-pro textarea,.montage-pro select{font:inherit}.montage-pro button{cursor:pointer}
        .mp-header{height:64px;display:grid;grid-template-columns:330px minmax(260px,1fr) auto;align-items:center;gap:18px;padding:0 18px;border-bottom:1px solid #1b2735;background:#060c13;position:sticky;top:0;z-index:50}.mp-brand{display:flex;align-items:center;gap:10px}.mp-logo{width:28px;height:28px;display:grid;place-items:center;color:#fff;font-size:22px}.mp-brand strong{font-size:18px;letter-spacing:-.02em}.mp-brand em{font-style:normal;color:var(--gold2);font-size:11px;font-weight:900;letter-spacing:.12em;margin-left:8px}.mp-project-name{display:flex;justify-content:center;align-items:center;gap:10px;min-width:0}.mp-project-name input{min-width:0;width:min(440px,100%);border:0;background:transparent;color:#f7f8fa;text-align:center;font-size:15px;font-weight:800;outline:none}.mp-save-pill{border:1px solid #6b501e;border-radius:999px;padding:5px 9px;color:var(--gold2);font-size:9px;font-weight:800;background:#171209}.mp-save-pill.error{color:#ff8a9b;border-color:#71303b}.mp-header-actions{display:flex;align-items:center;gap:8px}.mp-header-actions>button,.mp-add-menu-wrap>button{height:36px;border:1px solid #2c394a;background:#0b131e;color:#f5f7fa;border-radius:8px;padding:0 14px;font-size:10px;font-weight:800}.gold{background:linear-gradient(180deg,#e5ad42,#c98e2b)!important;color:#161009!important;border-color:#e0aa40!important}.mp-more{width:40px;padding:0!important}.mp-add-menu-wrap{position:relative}.mp-add-menu{position:absolute;top:43px;right:0;width:190px;background:#0c1521;border:1px solid #324052;border-radius:10px;padding:6px;box-shadow:0 18px 50px #000c;display:grid;gap:4px;z-index:80}.mp-add-menu button{border:0;background:transparent;color:#fff;text-align:left;padding:9px;border-radius:7px;font-size:10px}.mp-add-menu button:hover{background:#182334}
        .mp-grid{display:grid;grid-template-columns:370px minmax(650px,1fr) 330px;height:calc(100vh - 64px);min-height:760px}.mp-library,.mp-inspector{background:linear-gradient(180deg,#08111b,#070e17);padding:16px;overflow:auto}.mp-library{border-right:1px solid #1d2938}.mp-inspector{border-left:1px solid #1d2938}.mp-section-title{display:flex;align-items:center;justify-content:space-between;margin-bottom:12px}.mp-section-title strong{font-size:10px;letter-spacing:.05em}.mp-section-title span{font-size:9px;color:var(--gold2);background:#171f2c;padding:3px 8px;border-radius:999px}.mp-search-row{display:grid;grid-template-columns:1fr 38px;gap:8px}.mp-search-row input,.mp-library-select,.mp-inspector input,.mp-inspector textarea,.mp-inspector select,.mp-share input{width:100%;border:1px solid #263447;background:#080f19;color:#f4f6f8;border-radius:8px;padding:9px 10px;outline:none}.mp-search-row button{border:1px solid #2c394a;background:#0b141f;color:#fff;border-radius:8px}.mp-tabs{display:flex;gap:16px;border-bottom:1px solid #1f2b3a;margin:12px 0 10px}.mp-tabs button{border:0;background:none;color:#9aa5b4;padding:7px 0;font-size:9px}.mp-tabs button.on{color:#fff;border-bottom:2px solid var(--gold2)}.mp-library-select{font-size:9px;margin-bottom:8px}.mp-filter-chips{display:flex;gap:6px;overflow:auto;margin-bottom:10px}.mp-filter-chips button{border:1px solid #2c3a4c;background:#0d1723;color:#a7b1bf;border-radius:999px;padding:4px 8px;font-size:8px;white-space:nowrap}.mp-filter-chips button.on{border-color:#a77b2d;color:#f2bb4d;background:#1b160e}.mp-clips{display:grid;gap:8px;max-height:calc(100vh - 335px);overflow:auto;padding-right:3px}.mp-clip-card{display:grid;grid-template-columns:minmax(0,1fr) 30px 32px;gap:4px;border:1px solid #223042;border-radius:9px;background:#0b1521;padding:6px;transition:.15s}.mp-clip-card:hover{border-color:#506078}.mp-clip-card.selected{border-color:var(--gold);box-shadow:0 0 0 1px #d6a23d44 inset}.mp-clip-open{border:0;background:transparent;color:#fff;display:grid;grid-template-columns:94px 1fr;gap:9px;text-align:left;padding:0;min-width:0}.mp-thumb{height:56px;border-radius:7px;background:linear-gradient(135deg,#202c3c,#101822);display:grid;place-items:center;position:relative;overflow:hidden}.mp-thumb:before{content:"";position:absolute;inset:0;background:radial-gradient(circle at 65% 45%,#9f783266,transparent 28%),linear-gradient(160deg,transparent 55%,#d5a14222 56% 58%,transparent 59%)}.mp-thumb span{position:relative;font-size:14px}.mp-thumb small{position:absolute;right:4px;bottom:4px;background:#000c;border-radius:4px;padding:2px 4px;font-size:7px}.mp-clip-copy{min-width:0}.mp-clip-copy>small{font-size:7px;color:#8591a2}.mp-clip-copy strong{display:block;font-size:9px;margin:4px 0 6px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mp-clip-copy div{display:flex;flex-wrap:wrap;gap:3px}.mp-clip-copy i,.mp-modal-tags i{font-style:normal;border:1px solid #354357;color:#aab5c4;border-radius:999px;padding:2px 5px;font-size:7px}.mp-star,.mp-add{align-self:center;width:28px;height:28px;border:1px solid #354357;background:#0b141f;color:#c9d2dd;border-radius:50%}.mp-star{border-radius:7px;color:#d7a544}.mp-add.selected{background:var(--gold);color:#161009;border-color:var(--gold)}.mp-library-add-selected{width:100%;margin-top:10px;height:38px;border:1px solid var(--gold);background:#18140d;color:#f0b945;border-radius:8px;font-size:9px;font-weight:850}.mp-library-add-selected:disabled{opacity:.35}.mp-themes{display:none}.mp-themes.visible{display:block;border-top:1px solid #243142;margin-top:12px;padding-top:10px}.mp-themes-head{display:flex;justify-content:space-between;align-items:center}.mp-themes-head strong{font-size:9px;color:var(--gold)}.mp-themes-head button{font-size:8px;border:1px solid #324155;background:#0d1723;color:#fff;border-radius:7px;padding:5px 7px}.mp-theme{display:grid;grid-template-columns:22px 1fr auto;gap:6px;align-items:center;margin-top:6px;padding:8px;border:1px solid #263447;border-radius:7px}.mp-theme strong,.mp-theme b{font-size:8px}.mp-empty{border:1px dashed #334154;border-radius:8px;padding:14px;text-align:center;color:#768396;font-size:9px}
        .mp-center{min-width:0;display:grid;grid-template-rows:minmax(360px,1fr) 48px 50px auto auto;background:#050b12}.mp-stage{position:relative;display:grid;place-items:center;background:#000;overflow:hidden;margin:16px 14px 0;border:1px solid #263345;border-radius:7px 7px 0 0;aspect-ratio:16/9;max-height:56vh}.mp-stage video,.mp-stage img{width:100%;height:100%;object-fit:contain}.mp-stage canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none}.mp-stage-empty{color:#667388;font-size:11px}.mp-stage-connect{display:grid;gap:10px;text-align:center;justify-items:center;padding:24px}.mp-stage-connect strong{color:#fff;font-size:13px}.mp-stage-connect span{max-width:440px;color:#8290a2;font-size:9px;line-height:1.5}.mp-stage-connect :global(.local-video-reconnect),.mp-stage-connect :global(.local-video-connected){border:1px solid var(--gold);background:#18140d;color:var(--gold2);border-radius:8px;padding:9px 12px;font-weight:800}.mp-design-preview{width:100%;height:100%;display:grid;place-items:center;background:linear-gradient(145deg,#090d14,#171d2a)}.mp-design-preview strong{font-size:38px;text-align:center;padding:30px}.mp-editable-overlay{position:absolute;z-index:5}.mp-live-drawings{position:absolute;inset:0;width:100%;height:100%;z-index:7;pointer-events:none}.mp-player-bar{display:flex;align-items:center;gap:8px;padding:7px 14px;margin:0 14px;border:1px solid #263345;border-top:0;background:#0a121d}.mp-player-bar button{width:32px;height:30px;border:0;background:transparent;color:#fff;font-size:14px}.mp-time{display:grid;grid-template-columns:55px 1fr 55px;align-items:center;gap:8px;flex:1}.mp-time span{font-size:8px;color:var(--gold2);font-weight:900;text-align:center}.mp-time div{height:5px;border-radius:999px;background:#4c5562}.mp-time i{display:block;width:20%;height:100%;background:var(--gold);border-radius:999px}.mp-player-bar select{border:1px solid #293748;background:#0b141f;color:#fff;border-radius:6px;padding:5px;font-size:8px}.mp-tools{display:flex;justify-content:center;gap:7px;padding:8px 14px;margin:0 14px;border:1px solid #263345;border-top:0;background:#08111b}.mp-tools button{height:30px;border:1px solid #2e3d50;border-radius:7px;background:#0d1723;color:#e4e8ed;font-size:8px;padding:0 10px}.mp-tools button.on{border-color:var(--gold);color:var(--gold2);background:#1a150c}.mp-timeline-head{display:flex;justify-content:space-between;align-items:center;padding:9px 16px 4px;background:#050b12}.mp-timeline-head strong{font-size:9px;color:#c7ced7}.mp-timeline-head small{font-size:8px;color:#7e8999;margin-left:8px}.mp-timeline-head>div:last-child{display:none}
        .mp-storyboard{border-top:1px solid #1e2a39;background:#060d15;padding:0 14px 10px;min-height:195px}.mp-storyboard-ruler{height:28px;display:flex;justify-content:space-between;align-items:end;padding:0 14px 5px;border-bottom:1px solid #273447;color:#788596;font-size:7px}.mp-storyboard-strip{display:flex;gap:10px;align-items:stretch;overflow:auto;padding:10px 8px 8px;min-height:120px}.mp-story-card{position:relative;flex:0 0 142px;height:106px;border:1px solid #334256;border-radius:8px;background:#0c1622;color:#fff;padding:5px;text-align:left;display:grid;grid-template-rows:60px auto auto;overflow:hidden}.mp-story-card.selected{border-color:var(--gold);box-shadow:0 0 0 1px #d6a23d55}.mp-story-card.type-title,.mp-story-card.type-text{background:#0c1622}.mp-story-card.type-freeze{background:#3f2660}.mp-story-card.type-audio{background:#18263a}.mp-story-visual{border-radius:5px;background:linear-gradient(135deg,#1c2939,#0c141f);display:grid;place-items:center;overflow:hidden}.mp-story-card.type-title .mp-story-visual,.mp-story-card.type-text .mp-story-visual{background:#081018}.mp-story-visual>strong{font-size:10px;text-align:center;padding:7px}.mp-story-index{position:absolute;top:8px;left:8px;width:22px;height:22px;border-radius:6px;background:#090d12e6;color:#e9b248;display:grid;place-items:center;font-size:8px;font-weight:900;z-index:2}.mp-story-title{font-size:8px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:3px}.mp-story-card small{font-size:7px;color:#99a4b3}.mp-story-card>b{position:absolute;top:5px;right:5px;width:18px;height:18px;border-radius:50%;background:#772a39;display:none;place-items:center}.mp-story-card:hover>b{display:grid}.mp-story-add{flex:0 0 120px;border:1px dashed #334256;border-radius:8px;background:#09111b;color:#d6dde6;display:grid;place-items:center;align-content:center;gap:8px;font-size:24px}.mp-story-add small{font-size:8px}.mp-story-toolbar{display:flex;gap:6px;align-items:center;border-top:1px solid #1c2836;padding:8px 2px 0}.mp-story-toolbar button{height:28px;border:1px solid #2c3a4c;background:#0b141f;color:#dce2e9;border-radius:6px;padding:0 9px;font-size:8px}.mp-zoom{margin-left:auto;display:flex;align-items:center;gap:8px;color:#8f9aaa;font-size:8px}.mp-zoom input{accent-color:var(--gold);width:110px}
        .mp-inspector-tabs{display:grid;grid-template-columns:1fr 1fr;margin:-16px -16px 16px;border-bottom:1px solid #223042}.mp-inspector-tabs button{height:44px;border:0;background:#0b141f;color:#9aa5b4;font-size:9px}.mp-inspector-tabs button.on{color:#fff;border-bottom:2px solid var(--gold)}.mp-inspector-form{display:grid;gap:12px}.mp-inspector-form>label,.mp-project-note{display:grid;gap:5px;color:#8f9aab;font-size:8px;font-weight:800}.mp-readonly{border:1px solid #273548;background:#08111b;color:var(--gold2);border-radius:8px;padding:9px;text-transform:capitalize}.mp-clip-time-readable{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:10px;border:1px solid #263548;border-radius:8px;background:#08111b}.mp-clip-time-readable span{display:grid;gap:3px;color:#8793a4;font-size:7px}.mp-clip-time-readable b{color:#fff;font-size:9px}.mp-trim-panel{display:grid;gap:9px;padding:10px 0;border-top:1px solid #202c3b;border-bottom:1px solid #202c3b}.mp-trim-panel>strong{font-size:9px;color:var(--gold2)}.mp-trim-labels{display:flex;justify-content:space-between;color:#8894a4;font-size:7px}.mp-trim-labels b{color:#fff;font-size:9px}.mp-trim-range{position:relative;height:24px}.mp-trim-range:before{content:"";position:absolute;left:4px;right:4px;top:10px;height:4px;border-radius:999px;background:var(--gold)}.mp-trim-range input[type=range]{position:absolute;inset:0;width:100%;height:24px;background:transparent;border:0;padding:0;pointer-events:none;appearance:none}.mp-trim-range input::-webkit-slider-thumb{appearance:none;width:17px;height:17px;border-radius:50%;background:var(--gold2);border:2px solid #1b1307;pointer-events:auto}.mp-two{display:grid;grid-template-columns:1fr 1fr;gap:6px}.mp-nudge{display:grid;grid-template-columns:1fr 1fr;gap:5px}.mp-inspector button{border:1px solid #2c3a4c;background:#0c1622;color:#e4e9ef;border-radius:7px;padding:8px;font-size:8px}.mp-inspector-tools{display:grid;grid-template-columns:1fr 1fr 1fr 40px;gap:4px}.mp-draw-tools{grid-template-columns:repeat(3,minmax(0,1fr))}.mp-draw-tools button.on{border-color:var(--gold);color:var(--gold)}.danger{border-color:#6e2d3b!important;color:#ff8595!important}.mp-project-note textarea{min-height:90px;resize:vertical}.mp-annotation-list,.mp-freeze-inspector,.mp-audio-inspector{display:grid;gap:6px;padding:9px;border:1px solid #263548;border-radius:8px;background:#08111b}.mp-annotation-list>strong,.mp-freeze-inspector strong,.mp-audio-inspector strong{font-size:8px;color:var(--gold2)}.mp-annotation-list>small{font-size:7px;color:#8290a2}.mp-annotation-row{display:grid;grid-template-columns:minmax(70px,1fr) 58px 12px 58px 26px;gap:4px;align-items:center}.mp-annotation-row input{padding:5px!important;font-size:7px}.mp-annotation-name{padding:5px!important;text-align:left;font-size:7px}
        .mp-render-status{display:grid;grid-template-columns:auto 1fr auto auto;gap:10px;align-items:center;margin:6px 14px;padding:8px 10px;border:1px solid #2b394c;border-radius:8px;background:#0a131e}.mp-render-status strong{font-size:8px;color:var(--gold)}.mp-render-status span{font-size:7px;color:#909cab}.mp-render-progress{height:6px;background:#1a2635;border-radius:999px;overflow:hidden}.mp-render-progress i{display:block;height:100%;background:var(--gold)}.mp-render-status>b,.mp-render-status>a{font-size:8px;color:var(--gold)}
        .mp-modal-backdrop{position:fixed;inset:0;z-index:10000;background:#02050bd9;display:grid;place-items:center;padding:18px}.mp-clip-modal{width:min(760px,94vw);border:1px solid #344156;border-radius:12px;background:#0a131e;overflow:hidden;box-shadow:0 30px 90px #000}.mp-clip-modal header{display:flex;justify-content:space-between;padding:12px 14px;border-bottom:1px solid #263447}.mp-clip-modal h2{font-size:15px;margin:3px 0}.mp-clip-modal header small{font-size:8px;color:#8793a4}.mp-modal-stage{aspect-ratio:16/9;background:#000}.mp-modal-stage video{width:100%;height:100%;object-fit:contain}.mp-modal-tags,.mp-modal-actions{display:flex;gap:6px;flex-wrap:wrap;padding:9px 14px}.mp-clip-modal footer{display:grid;grid-template-columns:1fr 1.2fr 1fr;gap:7px;padding:10px 14px;border-top:1px solid #273548}.mp-share{width:min(480px,94vw);padding:18px;border:1px solid #2d3b4e;border-radius:12px;background:#0b141f}.mp-share div{display:flex;gap:7px;margin-top:10px}.mp-toast{position:fixed;right:18px;bottom:18px;z-index:12000;background:var(--gold);color:#171007;border-radius:9px;padding:10px 14px;font-size:10px;font-weight:900;box-shadow:0 10px 30px #0008}
        @media(max-width:1320px){.mp-grid{grid-template-columns:320px minmax(600px,1fr) 290px}.mp-header{grid-template-columns:250px 1fr auto}.mp-brand em{display:none}}@media(max-width:1080px){.mp-grid{grid-template-columns:290px minmax(560px,1fr)}.mp-inspector{display:none}.mp-header-actions>button:first-child{display:none}}@media(max-width:820px){.mp-header{grid-template-columns:1fr}.mp-project-name,.mp-header-actions{display:none}.mp-grid{grid-template-columns:1fr;height:auto}.mp-library{max-height:420px}.mp-center{min-height:740px}.mp-stage{margin-top:10px}.mp-clips{max-height:260px}}
      `}</style>
    </div>
  );
}