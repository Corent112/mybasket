"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { loadMontageLibrary, hasMontageBounds, synchronizeMontageAction, type MontageAction, type MontageMatch } from "@/lib/montage/multi-match-data";
import { fingerprintVideo } from "@/lib/local-match-project";
import { MONTAGE_INCOMING_EVENT, readIncomingClips, markIncomingReceived, type IncomingMontageClip } from "@/lib/montage/incoming-clips";
import { enforceTimelineSequence, montageItemDuration, montageTrack } from "@/lib/montage/timeline-sequence";
import ClipThumbnail from "@/components/video-editor/ClipThumbnail";
import { saveReceivedClipReference, RECEIVED_PLAYLIST_NAME } from "@/lib/montage/received-playlist";
import { saveMontageAtomically } from "@/lib/montage/save-timeline";
import { useLivestatTags } from "@/lib/livestat-tags";
import { getLocalMatchVideoUrl, setLocalMatchVideo } from "@/lib/local-video-registry";
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

type ActionRow = MontageAction;

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
  saved_editor_state?: Record<string, unknown>;
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

type LibraryView = "received" | "all" | "favorites" | "playlists" | "players" | "systems";
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

function actionLabel(action: ActionRow, label = tfLabel) {
  const result =
    action.action_type === "tir"
      ? action.shot_result === "made"
        ? "Tir marqué"
        : "Tir manqué"
      : action.action_type || "Action";

  return [action.temps_fort ? label(action.temps_fort) : "", action.action_type === "tir" ? result : label(result)].filter(Boolean).join(" · ");
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
    action.resolved_clip_start ?? action.edited_clip_start ?? action.clip_start ?? action.video_time ?? 0,
  );
}

function clipEnd(action: ActionRow) {
  const start = clipStart(action);
  const raw = numberValue(action.resolved_clip_end ?? action.edited_clip_end ?? action.clip_end);
  return raw > start ? raw : start;
}

function draftFingerprint(items: MontageItem[], title: string, note: string, playerId: string) {
  return JSON.stringify({ items: items.map(({ action, ...item }) => item), title, note, playerId });
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
  const [items, setItemsState] = useState<MontageItem[]>([]);
  const setItems = useCallback((update: SetStateAction<MontageItem[]>) => {
    setItemsState(current => enforceTimelineSequence(typeof update === "function" ? update(current) : update));
    setSaveState("idle");
  }, []);
  const loadedKeyRef = useRef<string | null>(null);
  const montageVersionRef = useRef<string | null>(null);
  const newMontageIdRef = useRef<string | null>(null);
  const saveBusyRef = useRef(false);
  const savedFingerprintRef = useRef("");
  const failedFingerprintRef = useRef("");
  const [editorReady, setEditorReady] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const tags = useLivestatTags(teamId);
  const clipLabel = (action: ActionRow) => action.clip_title || [players.find(player => player.id === action.player_id)?.name, actionLabel(action, key => tags.label(key))].filter(Boolean).join(" · ");
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
  const [libraryView, setLibraryView] = useState<LibraryView>("received");
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
  const [transferError, setTransferError] = useState("");
  const [selectedMatchFilter, setSelectedMatchFilter] = useState("");
  const [selectedActionFilter, setSelectedActionFilter] = useState("");
  const [receivedClips, setReceivedClips] = useState<IncomingMontageClip[]>([]);
  const [clipLimit, setClipLimit] = useState(48);
  const [selectedContextFilter, setSelectedContextFilter] = useState("");
  const [clipSort, setClipSort] = useState("received");
  const receiptTokensRef = useRef(new Set<string>());
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const incomingSourcesRef = useRef({ actions, matches, themes });
  incomingSourcesRef.current = { actions, matches, themes };


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
      if (!teamId && rows.length) {
        if (initialMontageId) {
          const result = await supabase.from("livestat_montages").select("team_id").eq("id", initialMontageId).maybeSingle();
          if (!active) return;
          if (result.error || !result.data?.team_id) { flash("Montage inaccessible."); return; }
          setTeamId(String(result.data.team_id));
        } else setTeamId(rows[0].id);
      }
    })();

    return () => {
      active = false;
    };
  }, [flash, supabase, teamId, initialMontageId]);

  useEffect(() => {
    if (!teamId) return;
    let active = true;

    (async () => {
      const userResponse = await supabase.auth.getUser();
      const userId = userResponse.data.user?.id;
      if (!userId) return;

      const [favoritesResponse, themesResponse] = await Promise.all([
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

  // Garde la rubrique Favoris de Montage synchronisée avec les étoiles ajoutées
  // depuis l'analyse vidéo / l'historique, même si Montage est déjà ouvert.
  useEffect(() => {
    if (!teamId) return;
    let active = true;

    const refreshFavorites = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!active || !user?.id) return;
      const { data, error } = await supabase
        .from("livestat_clip_favorites")
        .select("action_id")
        .eq("user_id", user.id)
        .eq("team_id", teamId);
      if (!active || error) return;
      setFavoriteActionIds((data ?? []).map((row: any) => String(row.action_id)));
    };

    const onFocus = () => { void refreshFavorites(); };
    window.addEventListener("focus", onFocus);

    const channel = supabase
      .channel(`montage-favorites-${teamId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "livestat_clip_favorites", filter: `team_id=eq.${teamId}` },
        () => { void refreshFavorites(); },
      )
      .subscribe();

    return () => {
      active = false;
      window.removeEventListener("focus", onFocus);
      void supabase.removeChannel(channel);
    };
  }, [supabase, teamId]);

  useEffect(() => {
    if (!teamId) return;
    let active = true;
    setLoading(true);
    setLibraryError("");
    setEditorReady(false);
    hydratedRef.current = false;
    void (async () => {
      try {
        const [library, montageResponse] = await Promise.all([
          loadMontageLibrary(supabase, teamId),
          supabase.from("livestat_montages").select("*").eq("team_id", teamId).order("updated_at", { ascending: false }),
        ]);
        if (!active) return;
        if (montageResponse.error) throw new Error(montageResponse.error.message);
        setMatches(library.matches);
        setActions(library.actions);
        setPlayers(library.players);
        setMontages((montageResponse.data ?? []) as MontageRow[]);
      } catch (error) {
        if (!active) return;
        const message = error instanceof Error ? error.message : "Bibliothèque indisponible.";
        setLibraryError(message);
        flash(message);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [flash, supabase, teamId]);

  useEffect(() => {
    if (loading || libraryError || !teamId) return;
    const key = `${teamId}:${montageId}`;
    if (loadedKeyRef.current === key) { setEditorReady(true); return; }
    hydratedRef.current = false;
    setEditorReady(false);
    if (!montageId) {
      loadedKeyRef.current = key;
      montageVersionRef.current = null;
      newMontageIdRef.current = null;
      historyRef.current = [];
      historyIndexRef.current = -1;
      hydratedRef.current = true;
      setEditorReady(true);
      savedFingerprintRef.current = draftFingerprint([], playerId ? "Montage joueur" : "Nouveau montage", "", initialPlayerId || "");
      failedFingerprintRef.current = "";
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

      if (montageResponse.error || !montageResponse.data) {
        flash(montageResponse.error?.message || "Montage inaccessible.");
        return;
      }
      const montage = montageResponse.data as MontageRow | null;
      if (montage?.team_id && montage.team_id !== teamId) { setTeamId(montage.team_id); return; }
      montageVersionRef.current = montage?.updated_at || null;
      if (montage) {
        setTitle(montage.title || "Montage");
        setCoachNote(montage.coach_note || "");
        setExportUrl(montage.export_url || "");
        setAssignedPlayerId(String(montage.player_id || ""));
      }

      if (itemsResponse.error) {
        flash(`Clips indisponibles : ${itemsResponse.error.message}`);
        return;
      }

      const actionMap = new Map(
        actions.map((action) => [String(action.id), action]),
      );

      const restoredItems: MontageItem[] = ((itemsResponse.data ?? []) as any[]).map((item, index) => {
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
              (action ? clipLabel(action) : itemType === "image" ? "Image" : `Élément ${index + 1}`),
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
            track: item.track || (item.item_type === "audio" ? "audio" : item.item_type === "clip" || item.item_type === "freeze" ? "video" : "overlay"),
            timeline_start: numberValue(item.timeline_start),
            asset_url: String(item.image_url || ""),
            volume: item.volume == null ? 1 : numberValue(item.volume),
            ...(item.editor_state && typeof item.editor_state === "object" ? item.editor_state : {}),
            saved_editor_state: item.editor_state ?? {},
            action,
          };
        });
      const sequenced = enforceTimelineSequence(restoredItems);
      setItems(sequenced);
      historyRef.current = [];
      historyIndexRef.current = -1;
      savedFingerprintRef.current = draftFingerprint(sequenced, montage?.title || "Montage", montage?.coach_note || "", String(montage?.player_id || ""));
      loadedKeyRef.current = key;
      setSelectedIndex(0);
      hydratedRef.current = true;
      setEditorReady(true);
      failedFingerprintRef.current = "";
      setSaveState("saved");
    })().catch(error => {
      if (active) flash(error instanceof Error ? error.message : "Montage inaccessible.");
    });

    return () => {
      active = false;
    };
  }, [actions, flash, montageId, supabase, teamId, loading, libraryError]);

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

    return actions.map(action => {
      const incoming = receivedClips.find(clip => clip.actionId === action.id);
      return incoming ? { ...action, clip_title: incoming.title || action.clip_title, resolved_clip_start: incoming.clipStart ?? action.resolved_clip_start, resolved_clip_end: incoming.clipEnd ?? action.resolved_clip_end } : action;
    }).filter((action) => {
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

      if (selectedMatchFilter && action.match_id !== selectedMatchFilter) return false;
      if (selectedActionFilter && action.action_type !== selectedActionFilter) return false;
      if (selectedPlayerFilter && String(action.player_id || "") !== selectedPlayerFilter) return false;
      if (selectedContextFilter && action.context !== selectedContextFilter) return false;
      if (selectedSystemFilter && String(action.temps_fort || "") !== selectedSystemFilter) return false;
      if (selectedThemeId) {
        const theme = themes.find((row) => row.id === selectedThemeId);
        if (theme && !theme.actionIds.includes(String(action.id))) return false;
      }

      if (!query) return true;

      const player = players.find((row) => String(row.id) === String(action.player_id || ""));
      return `${clipLabel(action)} ${actionSub(action, matchMap)} ${player?.name || ""}`
        .toLowerCase()
        .includes(query);
    });
  }, [actions, receivedClips, filter, matchMap, search, selectedMatchFilter, selectedActionFilter, selectedPlayerFilter, selectedSystemFilter, selectedContextFilter, selectedThemeId, themes, players, tags]);

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

  const addAction = (action: ActionRow, position?: number) => {
    if (!hasMontageBounds(action)) { flash("Cette action ne possède pas de bornes vidéo exploitables."); return false; }
    const insertAt = position == null ? items.length : clamp(position, 0, items.length);
    setItems((current) => {
      const next: MontageItem = {
        action_id: String(action.id),
        item_type: "clip",
        sort_order: insertAt,
        title: action.clip_title || clipLabel(action),
        note: receivedClips.find(clip => clip.actionId === action.id)?.note || "",
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
      rows.splice(position == null ? rows.length : Math.min(position, rows.length), 0, next);
      return rows.map((item, index) => ({ ...item, sort_order: index }));
    });
    setSelectedIndex(insertAt);
    setPlayhead(position == null ? totalDuration : timelineStartOf(items[insertAt], insertAt));
    flash("Clip ajouté dans la timeline");
    return true;
  };

  // Confirm reception only once the source clip is available in the playlist.
  useEffect(() => {
    if (!teamId) return;
    let active = true;
    void (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;
      for (const clip of receivedClips) {
        if (actions.some(action => action.id === clip.actionId)) markIncomingReceived(user.id, teamId, clip.transferId);
      }
    })();
    return () => { active = false; };
  }, [receivedClips, actions, teamId, supabase]);

  useEffect(() => { setReceivedClips([]); receiptTokensRef.current.clear(); }, [teamId]);

  useEffect(() => {
    const receiveVideo = async (event: MessageEvent) => {
      const data = event.data;
      if (event.origin !== window.location.origin || event.source !== window.opener || data?.type !== "mybasket:montage-video" || data.teamId !== teamId || !(data.file instanceof File)) return;
      const fingerprint = await fingerprintVideo(data.file);
      setLocalMatchVideo({ matchId: data.matchId, file: data.file, url: URL.createObjectURL(data.file), fingerprint });
    };
    window.addEventListener("message", receiveVideo);
    return () => window.removeEventListener("message", receiveVideo);
  }, [teamId]);

  // Transfer from LiveStats works both in an already-open window and after
  // navigation. Received references stay independent of the current film.
  useEffect(() => {
    if (!teamId) return;
    let active = true;
    let processing = false;
    let requested = false;
    const receive = async () => {
      if (!active) return;
      if (processing) { requested = true; return; }
      processing = true;
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user || !active) return;
        const incoming = readIncomingClips(user.id, teamId);
        for (const clip of incoming) {
          if (!active) return;
          if (receiptTokensRef.current.has(clip.transferId)) continue;
          let action = incomingSourcesRef.current.actions.find(row => row.id === clip.actionId);
          if (!action) {
            const result = await supabase.from("match_actions").select("*").eq("id", clip.actionId).eq("team_id", teamId).maybeSingle();
            if (result.error) throw new Error(result.error.message);
            if (!result.data) throw new Error("L’action envoyée dans Montage est introuvable.");
            action = result.data as ActionRow;
          }
          let source = incomingSourcesRef.current.matches.find(row => row.id === action!.match_id) as MontageMatch | undefined;
          if (!source && action.match_id) {
            const result = await supabase.from("match_stats").select("*").eq("id", action.match_id).eq("team_id", teamId).maybeSingle();
            if (result.error) throw new Error(result.error.message);
            if (!result.data) throw new Error("Le match source est introuvable.");
            source = result.data as MontageMatch;
          }
          if (action.match_id && !getLocalMatchVideoUrl(action.match_id)) {
            window.opener?.postMessage({ type: "mybasket:montage-video-request", teamId, matchId: action.match_id }, window.location.origin);
          }
          const synced = synchronizeMontageAction(action, source);
          // Reception never changes the timeline or the source statistics.
          const receivedAction = { ...synced, clip_title: clip.title || synced.clip_title,
            resolved_clip_start: clip.clipStart ?? synced.resolved_clip_start,
            resolved_clip_end: clip.clipEnd ?? synced.resolved_clip_end,
          };
          if (!active) return;
          setReceivedClips(current => [...current.filter(row => row.actionId !== clip.actionId), clip]);
          setActions(current => [...current.filter(row => row.id !== synced.id), receivedAction]);
          setLibraryView("received");
          setClipSort("received");
          setSelectedThemeId("");
          setSearch(""); setFilter("all"); setSelectedMatchFilter(""); setSelectedActionFilter(""); setSelectedPlayerFilter(""); setSelectedSystemFilter(""); setSelectedContextFilter("");
          setClipPreviewIndex(null);
          receiptTokensRef.current.add(clip.transferId);
          // Reuse the existing playlist tables; local references remain a recovery copy.
          try {
            const playlist = incomingSourcesRef.current.themes.find(theme => theme.name === RECEIVED_PLAYLIST_NAME && theme.actionIds.includes(synced.id)) || await saveReceivedClipReference(supabase, user.id, teamId, synced.id);
            if (!active) return;
            setThemes(current => {
              const previous = current.find(row => row.id === playlist.id);
              const next = { ...playlist, actionIds: Array.from(new Set([...(previous?.actionIds || []), synced.id])) };
              return [...current.filter(row => row.id !== playlist.id), next];
            });
            setTransferError("");
          } catch (error) {
            if (active) setTransferError(`Clip reçu sur cet appareil. Playlist en ligne non enregistrée : ${error instanceof Error ? error.message : "erreur réseau"}`);

          }
          if (source) setMatches(current => current.some(row => row.id === source!.id) ? current : [...current, source!]);
          flash("✓ Clip reçu dans la playlist · glisse-le dans la timeline pour l’insérer");
        }
      } catch (error) {
        if (active) setTransferError(error instanceof Error ? error.message : "Transfert Montage impossible.");
      } finally {
        processing = false;
        if (requested && active) { requested = false; void receive(); }
      }
    };
    const onIncoming = () => { void receive(); };
    const onStorage = (event: StorageEvent) => {
      if (event.key?.startsWith("mybasket:montage-incoming:") && event.newValue !== event.oldValue) void receive();
    };
    void receive();
    const poll = window.setInterval(onIncoming, 1500);
    window.addEventListener(MONTAGE_INCOMING_EVENT, onIncoming);
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", onIncoming);
    return () => {
      active = false;
      window.clearInterval(poll);
      window.removeEventListener(MONTAGE_INCOMING_EVENT, onIncoming);
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", onIncoming);
    };
  }, [editorReady, teamId, supabase, flash, setItems]);

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
    if (!teamId || !editorReady || loading || saveBusyRef.current) return;
    const snapshot = enforceTimelineSequence(items);
    const fingerprint = draftFingerprint(snapshot, title, coachNote, assignedPlayerId);
    if (montageId && fingerprint === savedFingerprintRef.current) return;
    saveBusyRef.current = true;
    setSaving(true);
    setSaveState("saving");
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Utilisateur non connecté.");
      if (!newMontageIdRef.current) newMontageIdRef.current = montageId || uid();
      const id = montageId || newMontageIdRef.current;
      const montagePayload = {
        team_id: teamId, player_id: assignedPlayerId || null,
        title: title.trim() || "Nouveau montage", coach_note: coachNote,
      };
      const payload = snapshot.map((item, index) => {
        const sourceActionId = item.action?.id || (item.item_type === "clip" ? item.action_id : null);
        if (["clip", "freeze"].includes(item.item_type) && !sourceActionId) throw new Error("Une source vidéo est introuvable. Le montage précédent est conservé.");
        if (item.item_type === "clip" && (!Number.isFinite(item.clip_start) || !Number.isFinite(item.clip_end) || item.clip_start < 0 || item.clip_end <= item.clip_start)) throw new Error("Bornes du clip invalides.");
        return {
          item_type: item.item_type, action_id: ["clip", "freeze"].includes(item.item_type) ? sourceActionId : null,
          sort_order: index, title: item.title || null, text: item.note || null,
          image_url: item.image_url || item.asset_url || null,
          clip_start: ["clip", "freeze"].includes(item.item_type) ? item.clip_start : null,
          clip_end: ["clip", "freeze"].includes(item.item_type) ? item.clip_end : null,
          duration: montageItemDuration(item), track: montageTrack(item),
          timeline_start: item.timeline_start ?? 0, volume: item.volume ?? 1,
          freeze_time: item.freeze_time, freeze_duration: item.freeze_duration, annotations: item.annotations,
          editor_state: { ...item.saved_editor_state, x:item.x ?? 50, y:item.y ?? 50, width:item.width ?? (item.item_type === "image" ? 30 : 70), height:item.height ?? 20, rotation:item.rotation ?? 0, opacity:item.opacity ?? 1, fontSize:item.fontSize ?? (item.item_type === "title" ? 48 : 30), fontFamily:item.fontFamily ?? "Arial", fontWeight:item.fontWeight ?? 800, textAlign:item.textAlign ?? "center", background:item.background ?? "transparent", locked:item.locked ?? false, hidden:item.hidden ?? false, playbackRate:item.playbackRate ?? 1, repeatCount:item.repeatCount ?? 1, transition:item.transition ?? "none" },
        };
      });
      const result = await saveMontageAtomically(supabase, id, montagePayload, payload, montageVersionRef.current);
      // Playlist sources remain available after saving or deleting film segments.
      montageVersionRef.current = result.updated_at;
      savedFingerprintRef.current = fingerprint;
      failedFingerprintRef.current = "";
      loadedKeyRef.current = `${teamId}:${result.id}`;
      setMontageId(result.id);
      setMontages(rows => [{ ...montagePayload, id: result.id, updated_at: result.updated_at } as MontageRow, ...rows.filter(row => row.id !== result.id)]);
      setSaveState("saved");
      flash("Montage enregistré ✓");
    } catch (error) {
      failedFingerprintRef.current = fingerprint;
      setSaveState("error");
      flash(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      saveBusyRef.current = false;
      setSaving(false);
    }
  };
  const saveLatestRef = useRef(saveMontage);
  saveLatestRef.current = saveMontage;

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
    if (!hydratedRef.current || !teamId || !editorReady || saving) return;
    const fingerprint = draftFingerprint(items, title, coachNote, assignedPlayerId);
    if (fingerprint === savedFingerprintRef.current || fingerprint === failedFingerprintRef.current) return;
    const timer=window.setTimeout(()=>{ void saveLatestRef.current(); }, 900);
    return()=>window.clearTimeout(timer);
    // autosave volontairement déclenché par l'état éditable du projet
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, title, coachNote, assignedPlayerId, teamId, editorReady, saving]);

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

  const itemDuration = montageItemDuration;

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
    if (libraryView === "received") {
      const ids = new Set([...receivedClips.map(clip => clip.actionId), ...themes.filter(theme => theme.name === RECEIVED_PLAYLIST_NAME).flatMap(theme => theme.actionIds)]);
      source = source.filter(action => ids.has(action.id));
    }
    return [...source].sort((a, b) => {
      if (clipSort === "received") { const rank = (action: ActionRow) => receivedClips.findIndex(clip => clip.actionId === action.id); const delta = rank(b) - rank(a); if (delta) return delta; }
      if (clipSort === "player") return clipLabel(a).localeCompare(clipLabel(b), "fr");
      if (clipSort === "action") return String(a.action_type || "").localeCompare(String(b.action_type || ""), "fr");
      const date = (row: ActionRow) => String(matchMap.get(String(row.match_id))?.match_date || "");
      return clipSort === "oldest" ? date(a).localeCompare(date(b)) : date(b).localeCompare(date(a));
    });
  }, [filteredActions, favoriteActionIds, libraryView, receivedClips, themes, clipSort, matchMap]);

  useEffect(() => { setClipLimit(48); setClipPreviewIndex(null); }, [search, filter, selectedMatchFilter, selectedActionFilter, selectedPlayerFilter, selectedSystemFilter, selectedContextFilter, selectedThemeId, libraryView, clipSort]);

  const previewAction =
    clipPreviewIndex == null ? null : previewActions[clipPreviewIndex] || null;

  useEffect(() => {
    if (!previewAction?.match_id || !teamId) return;
    void restoreMatchVideoForClip(String(previewAction.match_id), teamId).catch(() => {});
  }, [previewAction?.id, teamId]);

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
    const name = window.prompt("Nom de la playlist");
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
      flash(error?.message || "Création de la playlist impossible");
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
    flash("Clip ajouté à la playlist");
  };


  const renamePlaylist = async (playlist: ClipTheme) => {
    const name = window.prompt("Nouveau nom de la playlist", playlist.name);
    if (!name?.trim() || name.trim() === playlist.name) return;
    const { error } = await supabase.from("livestat_clip_themes").update({ name: name.trim() }).eq("id", playlist.id);
    if (error) { flash(error.message); return; }
    setThemes((rows) => rows.map((row) => row.id === playlist.id ? { ...row, name: name.trim() } : row));
    flash("Playlist renommée");
  };

  const deletePlaylist = async (playlist: ClipTheme) => {
    if (!window.confirm(`Supprimer la playlist « ${playlist.name} » ? Les clips resteront disponibles dans la bibliothèque.`)) return;
    const { error: itemError } = await supabase.from("livestat_clip_theme_items").delete().eq("theme_id", playlist.id);
    if (itemError) { flash(itemError.message); return; }
    const { error } = await supabase.from("livestat_clip_themes").delete().eq("id", playlist.id);
    if (error) { flash(error.message); return; }
    setThemes((rows) => rows.filter((row) => row.id !== playlist.id));
    if (selectedThemeId === playlist.id) setSelectedThemeId("");
    flash("Playlist supprimée");
  };

  const openClipCollection = (view: LibraryView) => { setLibraryView(view); setSelectedThemeId(""); };

  const openPlaylist = (playlist: ClipTheme) => {
    setLibraryView("playlists");
    setSelectedThemeId(playlist.id);
    setSearch("");
    setFilter("all");
  };

  const removeActionFromPlaylist = async (playlistId: string, actionId: string) => {
    const { error } = await supabase.from("livestat_clip_theme_items").delete().eq("theme_id", playlistId).eq("action_id", actionId);
    if (error) { flash(error.message); return; }
    setThemes((rows) => rows.map((row) => row.id === playlistId ? { ...row, actionIds: row.actionIds.filter((id) => id !== actionId) } : row));
    flash("Clip retiré de la playlist");
  };

  const addPlaylistToMontage = (playlist: ClipTheme) => {
    const rows = actions.filter((action) => playlist.actionIds.includes(String(action.id)));
    if (!rows.length) { flash("Cette playlist est vide."); return; }
    const validRows = rows.filter(hasMontageBounds);
    if (validRows.length !== rows.length) { flash("Certains clips n’ont pas de bornes vidéo. Aucun ajout effectué."); return; }
    rows.forEach((action) => addAction(action));
    setSelectedIndex(items.length + rows.length - 1);
    flash(`${rows.length} clip${rows.length > 1 ? "s" : ""} ajouté${rows.length > 1 ? "s" : ""} au montage`);
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
    videoRef.current?.pause();
    setMontagePlaying(false);
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
        if (!addAction(previewAction)) return;
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
  }, [previewAction, actionVideoUrl(previewAction || undefined, matchMap)]);

  const toggleLibrarySelection = (actionId: string) => {
    setLibrarySelection((current) =>
      current.includes(actionId) ? current.filter((id) => id !== actionId) : [...current, actionId],
    );
  };

  const addSelectedLibraryClips = () => {
    const selectedActions = librarySelection.map(id => { const action = actions.find(action => String(action.id) === id); const clip = receivedClips.find(row => row.actionId === id); return action && clip ? { ...action, clip_title: clip.title || action.clip_title, resolved_clip_start: clip.clipStart ?? action.resolved_clip_start, resolved_clip_end: clip.clipEnd ?? action.resolved_clip_end } : action; }).filter((action): action is ActionRow => Boolean(action));
    if (!selectedActions.length) {
      flash("Sélectionne au moins un clip.");
      return;
    }
    if (selectedActions.some(action => !hasMontageBounds(action))) { flash("Un clip sélectionné n’a pas de bornes vidéo. La sélection est conservée."); return; }
    selectedActions.forEach((action) => addAction(action));
    setSelectedIndex(items.length + selectedActions.length - 1);
    flash(`${selectedActions.length} clip${selectedActions.length > 1 ? "s" : ""} ajouté${selectedActions.length > 1 ? "s" : ""} au montage`);
    setLibrarySelection([]);
  };

  const presentMontage = async () => {
    if (!items.length) {
      flash("Ajoute d'abord des éléments au montage.");
      return;
    }
    setClipPreviewIndex(null);
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
  const confirmDraftExit = () => !editorReady || draftFingerprint(items, title, coachNote, assignedPlayerId || "") === savedFingerprintRef.current || window.confirm("Ce montage contient des modifications non enregistrées. Quitter ce montage ?");

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
          <span className="mp-logo">🏀</span>
          <div>
            <strong>Montage vidéo</strong>
            <em>Créez des playlists et des montages personnalisés à partir de vos clips</em>
          </div>
        </div>

        <div className="mp-project-name">
          <input value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Titre du montage" />
          <span className={`mp-save-pill ${saveState}`}>
            {saveState === "saving" ? "Sauvegarde…" : saveState === "error" ? "Non enregistré" : saveState === "saved" ? "Sauvegardé" : montageId ? "Modifications en cours" : "Non enregistré"}
          </span>
        </div>

        <div className="mp-header-actions">
          <button onClick={presentMontage}>▶ Présenter</button>
          <button onClick={exportMontageLocally} disabled={rendering}>⇩ {rendering ? "Rendu…" : "Exporter"}</button>
          <div className="mp-add-menu-wrap">
            <button className="gold" onClick={createTheme}>＋ Nouvelle playlist</button>
          </div>
          <button onClick={saveMontage} disabled={saving}>Enregistrer</button>
        </div>
      </header>

      {transferError && <div role="alert" style={{ padding: 12, background: "#fff0f0", color: "#941b32" }}>Transfert Montage : {transferError} <button onClick={() => { receiptTokensRef.current.clear(); window.dispatchEvent(new Event(MONTAGE_INCOMING_EVENT)); }}>Réessayer</button></div>}
      <main className="mp-grid">
        <aside className="mp-library">
          <select className="mp-library-select" aria-label="Équipe des clips" disabled={saving} value={teamId || ""} onChange={event => { if (!confirmDraftExit()) return; setTeamId(event.target.value); setMontageId(""); setSelectedThemeId(""); setSelectedPlayerFilter(""); setSelectedMatchFilter(""); setLibrarySelection([]); }}>
            {teams.map(team => <option key={team.id} value={team.id}>{team.name}</option>)}
          </select>
          <div className="mp-playlist-title">
            <div>
              <strong>Playlists</strong>
              <small>Organise tes clips par thème, joueur ou match.</small>
            </div>
            <button onClick={createTheme} title="Nouvelle playlist">＋</button>
          </div>

          <div className="mp-playlist-tabs">
            <button className={libraryView === "received" ? "on" : ""} onClick={() => openClipCollection("received")}>Clips reçus</button>
            <button className={libraryView === "all" ? "on" : ""} onClick={() => openClipCollection("all")}>Tous les clips</button>
          </div>

          <button className="mp-inbox-button" onClick={() => openClipCollection("received")}>
            ↓ Clips reçus <b>{new Set([...receivedClips.map(clip => clip.actionId), ...themes.filter(theme => theme.name === RECEIVED_PLAYLIST_NAME).flatMap(theme => theme.actionIds)]).size}</b>
            <small>Les clips envoyés depuis MyBasket arrivent ici.</small>
          </button>
          <div className="mp-playlist-list">
            {themes.length === 0 ? (
              <div className="mp-empty">Aucune playlist. Clique sur ＋ pour créer la première.</div>
            ) : themes.map((playlist) => (
              <div
                key={playlist.id}
                className={`mp-playlist-card ${selectedThemeId === playlist.id ? "on" : ""}`}
                onDragOver={(event) => { event.preventDefault(); event.dataTransfer.dropEffect = "copy"; }}
                onDrop={(event) => {
                  event.preventDefault();
                  const actionId = event.dataTransfer.getData("text/mybasket-action");
                  if (actionId) addActionToTheme(playlist.id, actionId);
                }}
              >
                <button className="mp-playlist-open" onClick={() => openPlaylist(playlist)}>
                  <span className="mp-playlist-thumb">▶</span>
                  <span>
                    <strong>{playlist.name}</strong>
                    <small>{playlist.actionIds.length} clip{playlist.actionIds.length > 1 ? "s" : ""}</small>
                  </span>
                </button>
                <div className="mp-playlist-menu">
                  <button onClick={() => addPlaylistToMontage(playlist)} title="Ajouter au montage">＋</button>
                  <button onClick={() => renamePlaylist(playlist)} title="Renommer">✎</button>
                  <button onClick={() => deletePlaylist(playlist)} title="Supprimer">⋮</button>
                </div>
              </div>
            ))}
          </div>

          <label style={{ display: "block", marginTop: 12, fontSize: 11 }}>Film en cours
            <select className="mp-library-select" aria-label="Ouvrir un montage" disabled={saving} value={montageId || ""} onChange={event => { if (!confirmDraftExit()) return; setMontageId(event.target.value); setClipPreviewIndex(null); }}>
              <option value="">Nouveau montage</option>
              {montages.map(montage => <option key={montage.id} value={montage.id}>{montage.title || "Montage"}</option>)}
            </select>
          </label>
          <div className="mp-playlist-drop" onDragOver={event => event.preventDefault()} onDrop={event => {
            event.preventDefault();
            const actionId = event.dataTransfer.getData("text/mybasket-action");
            if (actionId && selectedThemeId) void addActionToTheme(selectedThemeId, actionId);
            else flash("Crée ou ouvre une playlist, puis glisse le clip dessus.");
          }}>
            <span>＋</span>
            <strong>{selectedThemeId ? "Ajouter à la playlist ouverte" : "Glisse un clip sur une playlist"}</strong>
            <small>ou directement sur une playlist</small>
          </div>
        </aside>

        <aside className="mp-match-clips">
          <div className="mp-match-clips-head">
            <div>
              <strong>{libraryView === "received" ? "Clips reçus" : selectedThemeId ? themes.find(theme => theme.id === selectedThemeId)?.name : "Clips disponibles"}</strong>
              <span>{previewActions.length}</span>
            </div>
            <select value={filter} onChange={(e) => setFilter(e.target.value as "all" | "made" | "missed" | "video")}>
              <option value="all">Tout</option>
              <option value="made">Marqués</option>
              <option value="missed">Ratés</option>
              <option value="video">Avec vidéo</option>
            </select>
          </div>

          <select className="mp-library-select" aria-label="Filtrer par match" value={selectedMatchFilter} onChange={e => setSelectedMatchFilter(e.target.value)}>
            <option value="">Tous les matchs</option>
            {matches.map(match => <option key={match.id} value={match.id}>{match.opponent || "Adversaire"} · {match.match_date || "Date inconnue"}</option>)}
          </select>
          <select className="mp-library-select" aria-label="Filtrer par action" value={selectedActionFilter} onChange={e => setSelectedActionFilter(e.target.value)}>
            <option value="">Toutes les actions</option>
            {Array.from(new Set(actions.map(action => action.action_type).filter(Boolean))).map(type => <option key={type!} value={type!}>{tags.label(type!)}</option>)}
          </select>
          <input className="mp-clips-search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Rechercher un clip…" />

          <div className="mp-quick-filters">
            <button className={libraryView === "all" ? "on" : ""} onClick={() => openClipCollection("all")}>Tous</button>
            <button className={libraryView === "players" ? "on" : ""} onClick={() => openClipCollection("players")}>Joueurs</button>
            <button className={libraryView === "systems" ? "on" : ""} onClick={() => openClipCollection("systems")}>Systèmes</button>
            <button className={libraryView === "favorites" ? "on" : ""} onClick={() => openClipCollection("favorites")}>Favoris</button>
          </div>

          {(
            <select className="mp-library-select" value={selectedPlayerFilter} onChange={(e) => setSelectedPlayerFilter(e.target.value)}>
              <option value="">Tous les joueurs</option>
              {players.map((player) => (
                <option key={player.id} value={player.id}>{player.name || `${player.first_name || ""} ${player.last_name || ""}`.trim() || player.id}</option>
              ))}
            </select>
          )}

          {(
            <select className="mp-library-select" value={selectedSystemFilter} onChange={(e) => setSelectedSystemFilter(e.target.value)}>
              <option value="">Tous les systèmes / temps forts</option>
              {Array.from(new Set(actions.map((action) => String(action.temps_fort || "")).filter(Boolean))).map((value) => (
                <option key={value} value={value}>{tags.label(value)}</option>
              ))}
            </select>
          )}

          <select className="mp-library-select" aria-label="Filtrer par contexte" value={selectedContextFilter} onChange={event => setSelectedContextFilter(event.target.value)}>
            <option value="">Tous les contextes</option>
            {Array.from(new Set(actions.map(action => action.context).filter(Boolean))).map(context => <option key={context!} value={context!}>{tags.label(context!)}</option>)}
          </select>
          <select className="mp-library-select" aria-label="Trier les clips" value={clipSort} onChange={event => setClipSort(event.target.value)}>
            <option value="received">Derniers clips reçus</option><option value="recent">Matchs les plus récents</option><option value="oldest">Matchs les plus anciens</option><option value="player">Joueur / titre</option><option value="action">Type d’action</option>
          </select>
          <button onClick={() => { setSearch(""); setFilter("all"); setSelectedMatchFilter(""); setSelectedActionFilter(""); setSelectedPlayerFilter(""); setSelectedSystemFilter(""); setSelectedContextFilter(""); }}>Réinitialiser les filtres</button>
          <div style={{ padding: "8px 0", display: "grid", gap: 6 }}>
            <strong>{librarySelection.length} actions sélectionnées · {new Set(actions.filter(action => librarySelection.includes(action.id)).map(action => action.match_id)).size} matchs</strong>
            <button disabled={!librarySelection.length} onClick={addSelectedLibraryClips}>＋ Ajouter la sélection au montage</button>
            <button disabled={!librarySelection.length} onClick={() => setLibrarySelection([])}>Vider la sélection</button>
          </div>
          <div className="mp-match-clip-list">
            {libraryError ? <div className="mp-empty">Bibliothèque indisponible : {libraryError}</div> : loading ? <div className="mp-empty">Chargement…</div> :
            previewActions.length === 0 ? <div className="mp-empty">Aucun clip disponible.</div> :
            previewActions.slice(0, clipLimit).map((action, index) => {
              const id = String(action.id);
              const favorite = favoriteActionIds.includes(id);
              const duration = Math.max(.1, clipEnd(action) - clipStart(action));
              return (
                <div
                  className="mp-match-clip"
                  key={id}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.setData("text/mybasket-action", id);
                    event.dataTransfer.effectAllowed = "copy";
                  }}
                >
                  <input type="checkbox" aria-label={`Sélectionner ${clipLabel(action)}`} checked={librarySelection.includes(id)} onChange={() => toggleLibrarySelection(id)} />
                  <button className="mp-match-clip-open" onClick={() => setClipPreviewIndex(index)}>
                    <span className="mp-match-thumb"><ClipThumbnail src={actionVideoUrl(action, matchMap)} time={clipStart(action)} /><small>{duration.toFixed(0)}s</small></span>
                    <span className="mp-match-copy">
                      <strong>{clipLabel(action)}</strong>
                      <small>{actionSub(action, matchMap)} · {matchMap.get(String(action.match_id))?.match_date || "Date inconnue"}</small>
                    </span>
                  </button>
                  <button className={`mp-mini-star ${favorite ? "on" : ""}`} onClick={() => toggleFavorite(id)}>{favorite ? "★" : "☆"}</button>
                  <button className="mp-mini-add" title="Insérer dans la timeline" aria-label={`Insérer ${clipLabel(action)} dans la timeline`} onClick={() => addAction(action)}>＋</button>
                </div>
              );
            })}
          </div>
          {previewActions.length > clipLimit && <button onClick={() => setClipLimit(limit => limit + 48)}>Afficher 48 clips de plus ({previewActions.length - clipLimit} restants)</button>}
        </aside>

        <section className="mp-center">
      {clipPreviewIndex!=null && previewAction && (
        <div className="mp-source-preview">
          <div className="mp-source-card" onClick={(e)=>e.stopPropagation()}>
            <header>
              <div>
                <small>{previewAction.quarter ? `Q${previewAction.quarter}` : ""} · {previewAction.clock || ""}</small>
                <h2>{clipLabel(previewAction)}</h2><small>{actionSub(previewAction, matchMap)} · {matchMap.get(String(previewAction.match_id))?.match_date || ""}</small>
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
              ) : <div className="mp-stage-empty"><strong>Vidéo indisponible</strong>{previewAction.match_id && <LocalMatchVideoButton matchId={String(previewAction.match_id)} teamId={teamId} />}</div>}
            </div>

            <div className="mp-modal-tags">
              {previewAction.context && <i>{previewAction.context}</i>}
              {previewAction.temps_fort && <i>{tags.label(previewAction.temps_fort)}</i>}
              {previewAction.action_type && <i>{previewAction.action_type}</i>}
              {previewAction.shot_type && <i>{previewAction.shot_type}</i>}
              {previewAction.shot_result && <i>{previewAction.shot_result==="made"?"Marqué":"Raté"}</i>}
            </div>

            <div className="mp-modal-actions">
              <button onClick={()=>toggleFavorite(String(previewAction.id))}>{favoriteActionIds.includes(String(previewAction.id))?"★ Favori":"☆ Favori"}</button>
              <button onClick={() => setClipPreviewIndex(null)}>Revenir au film</button>
            </div>

            <footer>
              <button onClick={()=>setClipPreviewIndex(i=>Math.max(0,(i??0)-1))}>← Précédent <kbd>⇧TAB</kbd></button>
              <button className="gold" onClick={()=>addAction(previewAction)}>＋ Ajouter au montage <kbd>Entrée</kbd></button>
              <button onClick={()=>setClipPreviewIndex(i=>Math.min(previewActions.length-1,(i??0)+1))}>Suivant <kbd>TAB</kbd> →</button>
            </footer>
          </div>
        </div>
      )}

          <div hidden={clipPreviewIndex != null}>

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



          </div>
        </section>


        <aside className="mp-inspector">
          <div className="mp-detail-title"><strong>Détails du clip</strong><small>Agis sur le clip sélectionné</small></div>
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
              <button disabled={selectedIndex === 0} onClick={() => moveItem(selectedIndex, selectedIndex - 1)}>← Déplacer avant</button>
              <button disabled={selectedIndex >= items.length - 1} onClick={() => moveItem(selectedIndex, selectedIndex + 1)}>Déplacer après →</button>
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
          <div className="mp-storyboard">
          <div className="mp-timeline-head">
            <div>
              <strong>Ma timeline — {title}</strong>
              <small>{items.length} élément{items.length>1?"s":""} · {totalDuration.toFixed(1)}s</small>
            </div>
            <div>
              <button onClick={()=>setTimelineZoom(z=>Math.max(.5,z-.25))}>−</button>
              <span>{timelineZoom.toFixed(2)}×</span>
              <button onClick={()=>setTimelineZoom(z=>Math.min(3,z+.25))}>＋</button>
            </div>
          </div>

            <div className="mp-storyboard-ruler">
              <strong>Timeline · {items.length} éléments</strong><span>00:15</span><span>00:30</span><span>00:45</span><span>01:00</span><span>01:15</span><span>{formatClipTime(totalDuration)}</span>
            </div>
            <div className="mp-storyboard-strip" onDragOver={event => event.preventDefault()} onDrop={event => {
              event.preventDefault();
              const id = event.dataTransfer.getData("text/mybasket-action");
              const action = previewActions.find(row => row.id === id);
              if (action) addAction(action);
            }}>
              {items.length === 0 ? (
                <div className="mp-storyboard-empty">Ton film est vide. Regarde les clips reçus, puis glisse ici ceux que tu veux garder.</div>
              ) : items.map((item, index) => {
                const duration = itemDuration(item);
                const typeLabel = item.item_type === "freeze" ? "Freeze" : item.item_type === "title" ? "Titre" : item.item_type === "image" ? "Image" : item.item_type === "audio" ? "Audio" : item.item_type === "text" ? "Texte" : "Clip";
                return (
                  <button
                    key={`${item.action_id}:${index}`}
                    className={`mp-story-card type-${item.item_type} ${selectedIndex === index ? "selected" : ""}`}
                    style={{ minWidth: Math.max(125, duration * 14 * timelineZoom), maxWidth: Math.max(125, duration * 14 * timelineZoom) }}
                    onClick={() => { setClipPreviewIndex(null); setSelectedIndex(index); setPlayhead(timelineStartOf(item, index)); }}
                    draggable
                    onDragStart={(event) => { event.dataTransfer.setData("text/mybasket-story-index", String(index)); }}
                    onDragOver={(event) => event.preventDefault()}
                    onDrop={(event) => {
                      event.preventDefault();
                      const raw = event.dataTransfer.getData("text/mybasket-story-index");
                      if (!raw) {
                        const id = event.dataTransfer.getData("text/mybasket-action");
                        const action = previewActions.find(row => row.id === id);
                        if (action) { event.stopPropagation(); addAction(action, index); }
                        return;
                      }
                      event.stopPropagation();
                      const from = Number(raw);
                      if (Number.isInteger(from) && from >= 0 && from < items.length && from !== index) moveItem(from, index);
                    }}
                  >
                    <span className="mp-story-index">{index + 1}</span>
                    <div className="mp-story-visual">
                      {item.item_type === "clip" ? <ClipThumbnail src={actionVideoUrl(item.action, matchMap)} time={item.clip_start} /> : item.item_type === "freeze" ? <span>Ⅱ</span> : item.item_type === "audio" ? <span>♫</span> : item.item_type === "image" ? <span>▣</span> : <strong>{item.item_type === "title" ? item.title : item.note || item.title}</strong>}
                    </div>
                    <strong className="mp-story-title">{item.title || typeLabel}</strong>
                    <small>{typeLabel} · {formatClipTime(duration)}</small>
                    {item.action && <small>{actionSub(item.action, matchMap)}</small>}
                    <b onClick={(event) => { event.stopPropagation(); removeItem(index); }}>×</b>
                  </button>
                );
              })}
              <button className="mp-story-add" onClick={() => document.querySelector<HTMLElement>(".mp-match-clips")?.scrollIntoView({ behavior: "smooth", block: "nearest" })}>＋<small>Choisir un clip</small></button>
            </div>
            <div className="mp-story-toolbar">
              <button onClick={() => { document.querySelector<HTMLElement>(".mp-match-clips")?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }}>▣ Ajouter des clips</button>
              <button onClick={() => addDesignItem("title")}>T Titre</button>
              <button onClick={() => imageInputRef.current?.click()}>▧ Image</button>
              <button onClick={addFreezeItem}>❄ Freeze</button>
              <button onClick={() => addDesignItem("text")}>Ⅱ Pause / texte</button>
              <button onClick={() => audioInputRef.current?.click()}>♫ Audio</button>
              <button onClick={() => selected && updateSelected({ transition: selected.transition === "fade" ? "none" : "fade" })}>⌁ Transition</button>
              <div className="mp-zoom"><span>Zoom</span><input type="range" min="0.5" max="3" step="0.25" value={timelineZoom} onChange={(e)=>setTimelineZoom(numberValue(e.target.value))}/></div>
            </div>
          </div>
      </main>


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
        .montage-pro{--wine:#7b1730;--wine2:#9d2344;--gold:#c9972f;--ink:#17181c;--muted:#6f737c;--line:#e6e8ec;--soft:#f5f6f8;min-height:100vh;background:#f5f6f8;color:var(--ink);font-family:Inter,Arial,sans-serif}
        .montage-pro button,.montage-pro input,.montage-pro select,.montage-pro textarea{font:inherit}
        .mp-header{height:78px;background:#fff;border-bottom:1px solid var(--line);display:grid;grid-template-columns:minmax(290px,1fr) minmax(260px,420px) auto;align-items:center;gap:18px;padding:0 24px;position:sticky;top:0;z-index:30}
        .mp-brand{display:flex;align-items:center;gap:12px}.mp-logo{width:40px;height:40px;border-radius:12px;background:#111;color:#fff;display:grid;place-items:center}.mp-brand>div{display:grid;gap:3px}.mp-brand strong{font-size:22px;line-height:1}.mp-brand em{font-style:normal;font-size:11px;color:#7d818a;font-weight:650}
        .mp-project-name{display:flex;align-items:center;gap:8px}.mp-project-name input{width:100%;border:1px solid #dddfe4;background:#fff;border-radius:10px;padding:10px 12px;font-weight:800}.mp-save-pill{font-size:10px;color:#747981;white-space:nowrap}.mp-save-pill.saving{color:#a87510}.mp-save-pill.error{color:#b72d3e}
        .mp-header-actions{display:flex;gap:8px;align-items:center}.mp-header-actions>button,.mp-add-menu-wrap>button{height:40px;border:1px solid #dfe2e7;background:#fff;color:#25272b;border-radius:10px;padding:0 14px;font-weight:850}.mp-header-actions .gold{background:var(--wine);border-color:var(--wine);color:#fff}.mp-more{width:42px;padding:0!important}.mp-add-menu{display:none}
        .mp-grid{display:grid;grid-template-columns:250px minmax(520px,1fr) 310px 280px;gap:12px;padding:12px;min-height:calc(100vh - 78px);align-items:start}
        .mp-library,.mp-match-clips,.mp-inspector,.mp-center{background:#fff;border:1px solid var(--line);border-radius:14px;box-shadow:0 4px 18px #16191d0a}
        .mp-library,.mp-match-clips,.mp-inspector{padding:14px;height:calc(100vh - 104px);overflow:auto;position:sticky;top:90px}
        .mp-playlist-title{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.mp-playlist-title strong{display:block;font-size:18px}.mp-playlist-title small{display:block;color:#858992;font-size:10px;margin-top:4px;line-height:1.35}.mp-playlist-title>button{width:34px;height:34px;border:0;border-radius:9px;background:var(--wine);color:#fff;font-size:20px}
        .mp-playlist-tabs{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin:14px 0;background:#f3f4f6;border-radius:10px;padding:3px}.mp-playlist-tabs button{border:0;background:transparent;border-radius:8px;padding:8px;font-size:11px;font-weight:800;color:#6f737c}.mp-playlist-tabs button.on{background:var(--wine);color:#fff}
        .mp-playlist-list{display:grid;gap:8px}.mp-playlist-card{border:1px solid #e3e5e9;border-radius:11px;padding:7px;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px;align-items:center;background:#fff}.mp-playlist-card.on{background:#fff4f6;border-color:#bd7283}.mp-playlist-open{border:0;background:transparent;display:grid;grid-template-columns:46px minmax(0,1fr);gap:8px;align-items:center;text-align:left;min-width:0}.mp-playlist-thumb{height:42px;border-radius:8px;background:linear-gradient(135deg,#2b2024,#8a2039);color:#fff;display:grid;place-items:center}.mp-playlist-open>span:last-child{min-width:0}.mp-playlist-open strong,.mp-playlist-open small{display:block}.mp-playlist-open strong{font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mp-playlist-open small{font-size:9px;color:#7d8189;margin-top:3px}.mp-playlist-menu{display:grid;gap:2px}.mp-playlist-menu button{border:0;background:transparent;color:#747881;width:25px;height:23px;border-radius:6px}.mp-playlist-menu button:hover{background:#f1f2f4}
        .mp-playlist-drop{margin-top:12px;border:1px dashed #d4d7dc;border-radius:11px;padding:14px;text-align:center;color:#7c8088}.mp-playlist-drop span{display:block;font-size:22px;color:var(--wine)}.mp-playlist-drop strong,.mp-playlist-drop small{display:block}.mp-playlist-drop strong{font-size:10px;margin-top:3px}.mp-playlist-drop small{font-size:9px;margin-top:2px}
        .mp-center{padding:12px;min-width:0}.mp-stage{position:relative;background:#090909;border-radius:12px;overflow:hidden;aspect-ratio:16/9;display:grid;place-items:center}.mp-stage video{width:100%;height:100%;object-fit:contain}.mp-stage canvas{position:absolute;inset:0;width:100%;height:100%}.mp-stage-empty{color:#9297a0;font-size:13px}.mp-editable-overlay{position:absolute;z-index:8}.mp-editable-overlay img{width:100%;display:block}.mp-design-preview{color:#fff;text-align:center;z-index:8}.mp-live-overlay{position:absolute;left:50%;top:12%;transform:translateX(-50%);background:#000a;color:#fff;padding:10px 16px;border-radius:8px;z-index:9}.mp-live-overlay img{max-width:220px}
        .mp-player-bar{display:grid;grid-template-columns:34px 42px 34px 1fr 72px;gap:6px;align-items:center;margin-top:8px}.mp-player-bar button,.mp-player-bar select{height:34px;border:1px solid #e0e2e6;background:#fff;border-radius:8px}.mp-player-bar button:nth-child(2){background:var(--wine);color:#fff;border-color:var(--wine)}.mp-time{display:grid;grid-template-columns:auto 1fr auto;gap:8px;align-items:center;font-size:9px;color:#777}.mp-time div{height:5px;background:#e5e6e9;border-radius:999px;overflow:hidden}.mp-time i{display:block;width:30%;height:100%;background:var(--wine)}
        .mp-tools{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;padding:8px;border:1px solid var(--line);border-radius:10px}.mp-tools button{border:0;background:#f5f6f8;border-radius:8px;padding:8px 10px;font-size:10px;font-weight:750}.mp-tools button.on{background:#f2dfe4;color:var(--wine)}
        .mp-render-status{margin-top:8px;padding:10px;border-radius:10px;background:#faf6ec;border:1px solid #ead9af;display:grid;grid-template-columns:1fr auto;gap:8px;font-size:10px}.mp-render-progress{grid-column:1/-1;height:5px;background:#eee;border-radius:99px;overflow:hidden}.mp-render-progress i{display:block;height:100%;background:var(--gold)}
        .mp-timeline-head{display:flex;justify-content:space-between;align-items:center;margin-top:12px;padding:8px 4px}.mp-timeline-head strong{font-size:14px}.mp-timeline-head small{margin-left:8px;color:#858992}.mp-timeline-head button{border:1px solid #ddd;background:#fff;border-radius:7px}.mp-timeline-head span{font-size:9px;margin:0 5px}
        .mp-storyboard{border:1px solid var(--line);border-radius:12px;overflow:hidden;background:#fafbfc}.mp-storyboard-ruler{height:30px;padding:0 12px;display:flex;justify-content:space-between;align-items:end;border-bottom:1px solid var(--line);color:#8a8e96;font-size:8px}.mp-storyboard-strip{min-height:118px;padding:10px;display:flex;gap:7px;overflow:auto;align-items:stretch}.mp-storyboard-empty{flex:1;border:1px dashed #cfd3d9;border-radius:9px;display:grid;place-items:center;color:#969aa2;font-size:11px}.mp-story-card{min-width:125px;max-width:160px;border:1px solid #dde0e5;background:#fff;border-radius:9px;padding:5px;text-align:left;position:relative}.mp-story-card.selected{border:2px solid var(--wine)}.mp-story-visual{height:58px;border-radius:6px;background:linear-gradient(135deg,#d7c0a1,#7b1730);display:grid;place-items:center;color:#fff}.mp-story-title{display:block;font-size:9px;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mp-story-card small{font-size:8px;color:#888}.mp-story-card>b{position:absolute;right:5px;top:5px;background:#fff;border-radius:50%;width:18px;height:18px;display:grid;place-items:center}.mp-story-index{position:absolute;left:8px;top:8px;z-index:2;background:#111c;color:#fff;border-radius:5px;padding:2px 4px;font-size:7px}.mp-story-add{min-width:80px;border:1px dashed #cfd3d9;background:#fff;border-radius:9px;font-size:20px;color:var(--wine)}.mp-story-add small{display:block;font-size:8px;color:#777}.mp-story-toolbar{display:flex;gap:6px;align-items:center;border-top:1px solid var(--line);padding:8px;flex-wrap:wrap}.mp-story-toolbar button{border:0;background:#fff;border-radius:7px;padding:7px 9px;font-size:9px}.mp-zoom{margin-left:auto;display:flex;gap:6px;align-items:center;font-size:8px}
        .mp-match-clips-head{display:flex;justify-content:space-between;align-items:center}.mp-match-clips-head>div{display:flex;gap:7px;align-items:center}.mp-match-clips-head strong{font-size:16px}.mp-match-clips-head span{background:#f0e4e7;color:var(--wine);font-size:9px;font-weight:900;border-radius:99px;padding:3px 6px}.mp-match-clips-head select{border:1px solid #e0e2e6;background:#fff;border-radius:8px;padding:7px;font-size:9px}.mp-clips-search{width:100%;margin-top:10px;border:1px solid #e0e2e6;border-radius:9px;padding:9px 10px;font-size:10px}.mp-quick-filters{display:flex;gap:5px;margin:8px 0;overflow:auto}.mp-quick-filters button{border:0;background:#f0f1f3;color:#737780;border-radius:999px;padding:6px 8px;font-size:8px;white-space:nowrap}.mp-quick-filters button.on{background:var(--wine);color:#fff}.mp-library-select{width:100%;border:1px solid #e0e2e6;border-radius:8px;padding:8px;margin-bottom:8px;font-size:9px;background:#fff}
        .mp-match-clip-list{display:grid;gap:7px}.mp-match-clip{display:grid;grid-template-columns:18px minmax(0,1fr) 27px 30px;gap:4px;align-items:center;border-bottom:1px solid #eee;padding:5px 0}.mp-match-clip-open{border:0;background:transparent;display:grid;grid-template-columns:72px minmax(0,1fr);gap:7px;text-align:left;min-width:0}.mp-match-thumb{height:45px;border-radius:7px;background:linear-gradient(135deg,#3b2b27,#8b6346);color:#fff;display:grid;place-items:center;position:relative}.mp-match-thumb small{position:absolute;right:3px;bottom:3px;background:#000b;border-radius:4px;padding:2px 3px;font-size:7px}.mp-match-copy{min-width:0}.mp-match-copy strong,.mp-match-copy small{display:block}.mp-match-copy strong{font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mp-match-copy small{font-size:8px;color:#858992;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.mp-mini-star,.mp-mini-add{width:27px;height:27px;border:1px solid #ddd;background:#fff;border-radius:7px}.mp-mini-star.on{color:#c69222}.mp-mini-add{font-size:17px;color:var(--wine)}
        .mp-detail-title{border-bottom:1px solid var(--line);padding-bottom:10px;margin-bottom:10px}.mp-detail-title strong,.mp-detail-title small{display:block}.mp-detail-title strong{font-size:16px}.mp-detail-title small{font-size:9px;color:#8a8e96;margin-top:3px}.mp-inspector-form{display:grid;gap:10px}.mp-inspector-form label{font-size:9px;color:#6f737c;font-weight:800}.mp-inspector-form input,.mp-inspector-form textarea,.mp-inspector-form select{width:100%;margin-top:4px;border:1px solid #e0e2e6;background:#fff;border-radius:8px;padding:8px;color:#222}.mp-readonly{margin-top:4px;background:#f4f5f7;border-radius:8px;padding:8px}.mp-empty{border:1px dashed #d3d6db;border-radius:9px;padding:16px;text-align:center;color:#90949c;font-size:10px}.mp-clip-time-readable,.mp-trim-panel,.mp-nudge,.mp-design-controls,.mp-drawing-list,.mp-project-box{border:1px solid var(--line);border-radius:9px;padding:9px}.mp-clip-time-readable{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;font-size:8px}.mp-clip-time-readable span,.mp-clip-time-readable b{display:block}.mp-trim-labels{display:flex;justify-content:space-between;font-size:8px}.mp-trim-range input{width:100%}.mp-nudge{display:flex;gap:5px;flex-wrap:wrap}.mp-nudge button,.mp-inspector-form button{border:1px solid #e0e2e6;background:#fff;border-radius:7px;padding:7px;font-size:9px}.mp-danger{color:#b62d40!important}.mp-share-modal,.mp-preview-modal{position:fixed;inset:0;background:#0009;z-index:80;display:grid;place-items:center;padding:20px}.mp-share,.mp-preview-card{background:#fff;color:#222;border-radius:14px;max-width:760px;width:min(94vw,760px);padding:18px}.mp-preview-card video{width:100%;background:#000;border-radius:10px}.mp-modal-tags{display:flex;gap:5px;flex-wrap:wrap}.mp-modal-tags i{font-style:normal;background:#f1f2f4;border-radius:99px;padding:4px 7px;font-size:8px}
        .mp-grid{grid-template-columns:180px minmax(280px,.85fr) minmax(340px,1.2fr) 220px;min-height:0;align-items:stretch}
        .mp-library,.mp-match-clips,.mp-inspector{position:static;height:min(66vh,720px);min-height:320px;overflow:auto;padding:12px}
        .mp-center{height:min(66vh,720px);min-height:320px;overflow:auto}
        .mp-storyboard{grid-column:1/-1;background:#fff;min-width:0}
        .mp-match-clip-list{grid-template-columns:repeat(auto-fill,minmax(125px,1fr));gap:9px}
        .mp-match-clip{position:relative;border:1px solid var(--line);border-radius:9px;padding:6px;grid-template-columns:18px 1fr 28px 28px;align-items:center}
        .mp-match-clip-open{grid-column:1/-1;grid-row:1;display:flex;flex-direction:column;gap:6px;width:100%;padding:0}
        .mp-match-thumb{width:100%;height:auto;aspect-ratio:16/9;overflow:hidden}
        .mp-match-copy strong{font-size:11px}.mp-match-copy small{font-size:10px;white-space:normal;line-height:1.4}.mp-match-copy{width:100%}
        .mp-match-clip input{grid-column:1;grid-row:2}.mp-mini-star{grid-column:3;grid-row:2}.mp-mini-add{grid-column:4;grid-row:2}
        .mp-inbox-button{border:1px solid var(--line);border-radius:10px;padding:12px;text-align:left;background:#fff4f6;width:100%;margin-bottom:12px;font-weight:800}.mp-inbox-button small{display:block;font-size:11px;font-weight:400;margin-top:5px}.mp-inbox-button b{float:right}
        .mp-source-card header{display:flex;justify-content:space-between;gap:10px;padding:8px 0}.mp-source-card h2{font-size:16px;margin:4px 0}.mp-source-card small{font-size:11px;color:var(--muted)}
        .mp-source-card button{border:1px solid var(--line);border-radius:8px;background:#fff;padding:8px;cursor:pointer}.mp-source-card footer,.mp-modal-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.mp-source-card .gold{background:var(--wine);color:#fff}.mp-source-card video{width:100%;max-height:43vh;background:#090909;border-radius:10px}.mp-source-card kbd{font-size:9px}.mp-source-card .mp-stage-empty{background:#090909;padding:32px;display:grid;gap:12px;text-align:center}
        .mp-story-visual{overflow:hidden}.mp-match-clips-head strong{font-size:15px}.mp-library-select{font-size:11px}.mp-quick-filters button{font-size:10px}
        @media(max-width:1450px){.mp-grid{grid-template-columns:160px minmax(260px,.85fr) minmax(320px,1.2fr)}.mp-inspector{grid-column:1/-1;height:auto;min-height:0;max-height:260px;grid-row:3}.mp-brand em{display:none}.mp-storyboard{grid-row:2}}
        @media(max-width:1000px){.mp-header{height:auto;min-height:78px;padding:12px;grid-template-columns:1fr auto}.mp-project-name{grid-column:1/-1}.mp-grid{grid-template-columns:150px minmax(0,1fr)}.mp-library{grid-row:1/3;height:auto}.mp-match-clips{grid-column:2;grid-row:1;height:320px}.mp-center{grid-column:2;grid-row:2;height:auto;min-height:0}.mp-storyboard{grid-row:3}.mp-inspector{grid-row:4}}
        @media(max-width:650px){.mp-header{grid-template-columns:1fr}.mp-header-actions{flex-wrap:wrap}.mp-grid{grid-template-columns:minmax(0,1fr)}.mp-library,.mp-match-clips,.mp-center,.mp-inspector,.mp-storyboard{grid-column:1;grid-row:auto;min-height:0;height:auto;max-height:none}.mp-library{max-height:230px}.mp-match-clips{max-height:460px}.mp-storyboard-strip{min-height:130px}}

      `}</style>
    </div>
  );
}
