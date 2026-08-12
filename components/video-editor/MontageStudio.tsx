"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  kind: "arrow" | "line" | "circle" | "text";
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  color: string;
  width: number;
  text?: string;
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
  const match = matches.get(String(action.match_id || ""));
  return String(match?.video_url || match?.youtube_url || "");
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
  const supabase = useMemo(() => createClient(), []);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragOrigin = useRef<{ x: number; y: number } | null>(null);
  const dragIndex = useRef<number | null>(null);

  const [teams, setTeams] = useState<TeamRow[]>([]);
  const [teamId, setTeamId] = useState(initialTeamId);
  const [playerId, setPlayerId] = useState(initialPlayerId);
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
  const [selectedPlayerFilter, setSelectedPlayerFilter] = useState("");
  const [selectedSystemFilter, setSelectedSystemFilter] = useState("");
  const [selectedThemeId, setSelectedThemeId] = useState("");
  const [playhead, setPlayhead] = useState(0);
  const [audioUploading, setAudioUploading] = useState(false);


  const flash = useCallback((message: string) => {
    setToast(message);
    window.setTimeout(() => setToast(""), 2600);
  }, []);


  useEffect(() => {
    let active = true;

    (async () => {
      const { data, error } = await supabase
        .from("teams")
        .select("id,name")
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

      setActions(
        playerId
          ? actionRows.filter(
              (action) => String(action.player_id || "") === String(playerId),
            )
          : actionRows,
      );

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
            action,
          };
        }),
      );
      setSelectedIndex(0);
    })();

    return () => {
      active = false;
    };
  }, [actions, flash, montageId, supabase]);

  const matchMap = useMemo(
    () => new Map(matches.map((match) => [String(match.id), match])),
    [matches],
  );

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

      if (drawing.kind === "text") {
        ctx.font = "bold 27px Arial";
        ctx.fillText(drawing.text || "Texte", drawing.x1, drawing.y1);
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

  const saveMontage = async () => {
    if (!teamId) {
      flash("Choisis une équipe.");
      return;
    }

    setSaving(true)

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
        player_id: playerId || null,
        title: title.trim() || "Nouveau montage",
        type: playerId ? "player" : "team",
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
          created_at: new Date().toISOString(),
        }));

        const { error } = await supabase
          .from("livestat_montage_items")
          .insert(payload);

        if (error) throw error;
      }

      flash("Montage enregistré ✓");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Enregistrement impossible.";
      console.error("Erreur sauvegarde montage :", error);
      flash(message);
    } finally {
      setSaving(false);
    }
  };

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
        body: JSON.stringify({ montageId }),
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

  const itemDuration = (item: MontageItem) =>
    item.item_type === "clip"
      ? Math.max(0.1, item.clip_end - item.clip_start)
      : Math.max(0.5, item.duration || (item.item_type === "audio" ? item.clip_end - item.clip_start : 4));

  const totalDuration = items.reduce((sum, item) => sum + itemDuration(item), 0);

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
      setItems((current) => [
        ...current,
        {
          action_id: `image:${uid()}`,
          sort_order: current.length,
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
        },
      ]);
      setSelectedIndex(items.length);
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
    setItems((list) => [
      ...list,
      {
        action_id: `freeze:${uid()}`,
        sort_order: list.length,
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
      },
    ]);
    setSelectedIndex(items.length);
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

  return (
    <div className={`montage-pro ${embedded ? "embedded" : ""}`}>
      <header className="mp-header">
        <div className="mp-brand">
          <span>🎬</span>
          <strong>MyBasket Montage Pro</strong>
          <em>ÉDITEUR</em>
        </div>

        <div className="mp-project-name">
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
          <small>{items.length} élément{items.length > 1 ? "s" : ""} · {totalDuration.toFixed(1)} s</small>
        </div>

        <div className="mp-header-actions">
          <button onClick={saveMontage} disabled={saving}>💾 {saving ? "Sauvegarde…" : "Sauvegarder"}</button>
          <button onClick={refreshExport}>⬇ Exporter le projet</button>
          <button className="gold" onClick={renderMontage} disabled={rendering}>🎞 {rendering ? "Rendu…" : "Export vidéo"}</button>
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
                  className="mp-clip-card"
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
                  <button className="mp-add" onClick={()=>addAction(action)}>＋</button>
                </div>
              )
            })}
          </div>

          <div className="mp-themes">
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
            {selected?.item_type==="image" && selected.image_url ? (
              <img src={selected.image_url} alt={selected.title} />
            ) : selected?.item_type==="title" || selected?.item_type==="text" ? (
              <div className="mp-design-preview">
                <strong>{selected.item_type==="title" ? selected.title : selected.note}</strong>
              </div>
            ) : selectedVideo ? (
              <video
                ref={videoRef}
                src={selectedVideo}
                controls
                playsInline
                onTimeUpdate={(event)=>{
                  if(selected?.item_type==="clip" && event.currentTarget.currentTime>=selected.clip_end) event.currentTarget.pause();
                }}
              />
            ) : (
              <div className="mp-stage-empty">Sélectionne un clip dans la bibliothèque ou dans la timeline.</div>
            )}
            {selected?.item_type==="clip" && <canvas
              ref={canvasRef}
              width={960}
              height={540}
              onPointerDown={(event)=>{dragOrigin.current=pointer(event)}}
              onPointerUp={(event)=>{
                if(!selected || !dragOrigin.current) return;
                const startPoint=dragOrigin.current;
                const endPoint=pointer(event);
                dragOrigin.current=null;
                const currentTime=numberValue(videoRef.current?.currentTime);
                const drawText=drawMode==="text" ? window.prompt("Texte à afficher") || "Texte" : undefined;
                updateSelected({annotations:[...selected.annotations,{
                  id:uid(),kind:drawMode,x1:startPoint.x,y1:startPoint.y,x2:endPoint.x,y2:endPoint.y,
                  color:drawColor,width:5,text:drawText,start:currentTime,end:currentTime+3
                }]});
              }}
            />}
          </div>

          <div className="mp-player-bar">
            <button onClick={()=>selectedIndex>0 && setSelectedIndex(selectedIndex-1)}>⏮</button>
            <button onClick={()=>{
              const video=videoRef.current;
              if(!video || !selected || selected.item_type!=="clip") return;
              if(video.paused){ if(video.currentTime<selected.clip_start || video.currentTime>=selected.clip_end) video.currentTime=selected.clip_start; void video.play(); }
              else video.pause();
            }}>▶</button>
            <button onClick={()=>selectedIndex<items.length-1 && setSelectedIndex(selectedIndex+1)}>⏭</button>
            <div className="mp-time">
              <span>{selected?.item_type==="clip" ? `${selected.clip_start.toFixed(1)}s` : "00:00"}</span>
              <div><i /></div>
              <span>{selected ? `${itemDuration(selected).toFixed(1)}s` : "00:00"}</span>
            </div>
            <select><option>1x</option><option>0.5x</option><option>1.5x</option><option>2x</option></select>
          </div>

          <div className="mp-tools">
            <button onClick={()=>addDesignItem("title")}>＋ Titre</button>
            <button onClick={()=>addDesignItem("text")}>＋ Texte</button>
            <button onClick={()=>imageInputRef.current?.click()} disabled={designUploading}>▣ {designUploading ? "Import…" : "Image"}</button>
            <button className={drawMode==="arrow"?"on":""} onClick={()=>setDrawMode("arrow")}>✎ Dessin</button>
            <button className={drawMode==="circle"?"on":""} onClick={()=>setDrawMode("circle")}>◎ Cercle</button>
            <button onClick={addFreezeItem}>◉ Freeze</button>
            <button onClick={() => audioInputRef.current?.click()} disabled={audioUploading}>♫ {audioUploading ? "Import…" : "Audio"}</button>
            <input ref={imageInputRef} type="file" accept="image/*" hidden onChange={(e)=>{const file=e.target.files?.[0]; if(file) void uploadImageItem(file)}} />
            <input ref={audioInputRef} type="file" accept="audio/*" hidden onChange={(e)=>{const file=e.target.files?.[0]; if(file) void uploadAudioItem(file)}} />
          </div>

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

          <div
            className="mp-timeline-scroll"
            onClick={(event) => {
              const target = event.currentTarget.querySelector(".mp-ruler") as HTMLElement | null;
              if (!target) return;
              const rect = target.getBoundingClientRect();
              const ratio = clamp((event.clientX - rect.left) / Math.max(1, rect.width), 0, 1);
              setPlayhead(ratio * Math.max(0.1, totalDuration));
            }}
          >
            <div className="mp-ruler" style={{ minWidth: `${Math.max(1000, totalDuration * 45 * timelineZoom)}px` }}>
              {Array.from({ length: Math.max(2, Math.ceil(totalDuration / 5) + 1) }).map((_, index) => {
                const value = Math.min(totalDuration, index * 5);
                return <span key={index} style={{ left: `${totalDuration ? (value / totalDuration) * 100 : 0}%` }}>{`${String(Math.floor(value / 60)).padStart(2,"0")}:${String(Math.floor(value % 60)).padStart(2,"0")}`}</span>;
              })}
              <i className="mp-playhead" style={{ left: `${totalDuration ? (playhead / totalDuration) * 100 : 0}%` }} />
            </div>

            {(["video", "overlay", "audio"] as const).map((track) => {
              const label = track === "video" ? "VIDÉO" : track === "overlay" ? "TITRES / OVERLAYS" : "AUDIO";
              const trackItems = items.map((item, index) => ({ item, index })).filter(({ item }) => (item.track || (item.item_type === "audio" ? "audio" : item.item_type === "clip" ? "video" : "overlay")) === track);
              return (
                <div className={`mp-track-row track-${track}`} key={track}>
                  <label>{label}</label>
                  <div className="mp-track" style={{ minWidth: `${Math.max(930, totalDuration * 45 * timelineZoom)}px` }}>
                    {trackItems.length === 0 ? <div className="mp-track-empty">Aucun élément</div> : trackItems.map(({ item, index }) => {
                      const duration = itemDuration(item);
                      const start = item.timeline_start ?? items.slice(0, index).reduce((sum, row) => sum + itemDuration(row), 0);
                      return (
                        <button
                          key={`${item.action_id}:${index}`}
                          className={`mp-timeline-item type-${item.item_type} ${selectedIndex === index ? "selected" : ""}`}
                          style={{
                            position: "absolute",
                            left: `${start * 45 * timelineZoom}px`,
                            width: `${Math.max(70, duration * 45 * timelineZoom)}px`,
                          }}
                          onClick={(event) => { event.stopPropagation(); setSelectedIndex(index); setPlayhead(start); }}
                          draggable
                          onDragStart={() => { dragIndex.current = index; }}
                          onDragOver={(event) => event.preventDefault()}
                          onDrop={() => {
                            if (dragIndex.current != null) moveItem(dragIndex.current, index);
                            dragIndex.current = null;
                          }}
                        >
                          <strong>{item.title || item.item_type}</strong>
                          <small>{duration.toFixed(1)}s</small>
                          {item.item_type === "audio" && <small>♫ {Math.round((item.volume ?? 1) * 100)}%</small>}
                          <b onClick={(event) => { event.stopPropagation(); removeItem(index); }}>×</b>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <aside className="mp-inspector">
          <div className="mp-section-title"><strong>INSPECTEUR</strong></div>
          {!selected ? <div className="mp-empty">Sélectionne un élément.</div> : (
            <div className="mp-inspector-form">
              <label>Titre<input value={selected.title} onChange={(e)=>updateSelected({title:e.target.value})}/></label>
              <label>Type<div className="mp-readonly">{selected.item_type}</div></label>

              {selected.item_type==="clip" ? <>
                <div className="mp-two">
                  <label>Début<input type="number" step=".1" value={selected.clip_start} onChange={(e)=>updateSelected({clip_start:numberValue(e.target.value)})}/></label>
                  <label>Fin<input type="number" step=".1" value={selected.clip_end} onChange={(e)=>updateSelected({clip_end:numberValue(e.target.value)})}/></label>
                </div>
                <div className="mp-nudge">
                  <button onClick={()=>updateSelected({clip_start:Math.max(0,selected.clip_start-1)})}>−1 début</button>
                  <button onClick={()=>updateSelected({clip_start:selected.clip_start+1})}>+1 début</button>
                  <button onClick={()=>updateSelected({clip_end:Math.max(selected.clip_start+.1,selected.clip_end-1)})}>−1 fin</button>
                  <button onClick={()=>updateSelected({clip_end:selected.clip_end+1})}>+1 fin</button>
                </div>
              </> : (
                <label>Durée<input type="number" min=".5" step=".5" value={selected.duration||4} onChange={(e)=>updateSelected({duration:numberValue(e.target.value)})}/></label>
              )}

              <label>Note / texte<textarea value={selected.note} onChange={(e)=>updateSelected({note:e.target.value})}/></label>

              {selected.item_type==="clip" && <>
                <div className="mp-inspector-tools">
                  <button onClick={()=>setDrawMode("arrow")}>➜ Flèche</button>
                  <button onClick={()=>setDrawMode("circle")}>○ Cercle</button>
                  <button onClick={()=>setDrawMode("text")}>T Texte</button>
                  <input type="color" value={drawColor} onChange={(e)=>setDrawColor(e.target.value)}/>
                </div>
                <button onClick={()=>updateSelected({annotations:selected.annotations.slice(0,-1)})}>↶ Annuler le dernier dessin</button>
              </>}

              <button className="danger" onClick={()=>removeItem(selectedIndex)}>🗑 Retirer de la timeline</button>
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
        .montage-pro{--gold:#d4a24c;--bg:#080d16;--panel:#0e1624;--panel2:#121d2f;--line:#27344a;--text:#eef2f8;--muted:#7f8aa0;min-height:100vh;background:var(--bg);color:var(--text);font-family:Inter,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif}.montage-pro *{box-sizing:border-box}
        button,input,textarea,select{font:inherit}.mp-header{height:66px;display:grid;grid-template-columns:320px 1fr auto;align-items:center;gap:16px;padding:0 20px;border-bottom:1px solid var(--line);background:#0d1522}.mp-brand{display:flex;align-items:center;gap:9px}.mp-brand span{font-size:21px}.mp-brand strong{font-size:20px}.mp-brand em{font-style:normal;color:var(--gold);font-size:9px;font-weight:900;border:1px solid var(--gold);border-radius:999px;padding:4px 7px}.mp-project-name{text-align:center}.mp-project-name input{border:0;background:transparent;color:#fff;text-align:center;font-size:14px;font-weight:900;max-width:460px;width:100%}.mp-project-name small{display:block;color:var(--muted);font-size:9px}.mp-header-actions{display:flex;gap:8px}.mp-header button,.mp-tools button,.mp-timeline-head button,.mp-inspector button,.mp-modal-actions button,.mp-clip-modal footer button,.mp-share button{border:1px solid var(--line);border-radius:8px;background:#121d2f;color:#eef2f8;padding:8px 11px;font-weight:850;cursor:pointer}.gold{background:var(--gold)!important;color:#17110a!important;border-color:var(--gold)!important}
        .mp-grid{display:grid;grid-template-columns:310px minmax(620px,1fr) 300px;height:calc(100vh - 66px);min-height:720px}.mp-library,.mp-inspector{background:#0b1220;padding:14px;overflow:auto}.mp-library{border-right:1px solid var(--line)}.mp-inspector{border-left:1px solid var(--line)}.mp-section-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.mp-section-title strong{font-size:11px;letter-spacing:.05em}.mp-section-title span{background:#172238;color:var(--gold);border-radius:999px;padding:4px 8px;font-size:9px;font-weight:900}
        .mp-search-row{display:grid;grid-template-columns:1fr 34px;gap:6px}.mp-search-row input,.mp-inspector input,.mp-inspector textarea,.mp-share input{width:100%;border:1px solid var(--line);background:#0b1321;color:#fff;border-radius:8px;padding:9px}.mp-search-row button{border:1px solid var(--line);background:#101a2b;color:#fff;border-radius:8px}.mp-tabs{display:flex;overflow:auto;border-bottom:1px solid var(--line);margin:8px 0}.mp-tabs button{border:0;background:transparent;color:#8e9ab0;padding:8px 9px;font-size:9px;white-space:nowrap}.mp-tabs button.on{color:var(--gold);border-bottom:2px solid var(--gold)}.mp-library-select{width:100%;margin:0 0 8px;border:1px solid #34415a;background:#101a2b;color:#fff;border-radius:8px;padding:8px;font-size:9px}
        .mp-filter-chips{display:flex;gap:4px;overflow:auto;margin-bottom:8px}.mp-filter-chips button{border:1px solid #34415a;background:#111b2d;color:#9aa6bb;border-radius:999px;padding:4px 7px;font-size:8px;white-space:nowrap}.mp-filter-chips button.on{border-color:var(--gold);color:var(--gold)}
        .mp-clips{display:grid;gap:7px;max-height:50vh;overflow:auto;padding-right:2px}.mp-clip-card{display:grid;grid-template-columns:minmax(0,1fr) 30px 30px;gap:4px;border:1px solid #25324a;border-radius:9px;background:#101a2b;padding:6px}.mp-clip-card:hover{border-color:#4c5c78}.mp-clip-open{display:grid;grid-template-columns:62px 1fr;gap:8px;border:0;background:transparent;color:#fff;text-align:left;cursor:pointer;padding:0}.mp-thumb{height:48px;border-radius:6px;background:linear-gradient(135deg,#253653,#101724);position:relative;display:grid;place-items:center}.mp-thumb span{font-size:16px}.mp-thumb small{position:absolute;bottom:3px;right:4px;background:#050910aa;padding:2px 4px;border-radius:4px;font-size:7px}.mp-clip-copy{min-width:0}.mp-clip-copy>small{color:#75849d;font-size:7px}.mp-clip-copy strong{display:block;font-size:9px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin:3px 0}.mp-clip-copy div{display:flex;gap:3px;flex-wrap:wrap}.mp-clip-copy i,.mp-modal-tags i{font-style:normal;font-size:7px;border:1px solid #3b4861;border-radius:999px;padding:2px 5px;color:#aab6c9}.mp-star,.mp-add{width:28px;height:28px;align-self:center;border:1px solid #3a465d;background:#0d1523;color:#d4a24c;border-radius:7px;cursor:pointer}.mp-star{font-size:17px}.mp-star.on{border-color:var(--gold);background:#d4a24c12}.mp-add{font-size:16px}
        .mp-themes{border-top:1px solid var(--line);margin-top:12px;padding-top:10px}.mp-themes-head{display:flex;justify-content:space-between;align-items:center}.mp-themes-head strong{font-size:10px;color:var(--gold)}.mp-themes-head button{font-size:8px;border:1px solid #34415a;background:#111b2d;color:#fff;border-radius:7px;padding:5px 7px}.mp-theme{display:grid;grid-template-columns:22px 1fr auto;gap:6px;align-items:center;margin-top:6px;padding:8px;border:1px solid #22304a;border-radius:7px}.mp-theme strong{font-size:9px}.mp-theme b{font-size:8px;color:#8591a6}.mp-empty{border:1px dashed #34415a;border-radius:8px;padding:14px;text-align:center;color:#78869e;font-size:10px}.mp-empty.small{padding:9px;margin-top:7px;font-size:8px}
        .mp-center{min-width:0;display:grid;grid-template-rows:minmax(300px,1fr) 46px 48px 48px minmax(180px,auto);background:#070c14}.mp-stage{position:relative;display:grid;place-items:center;background:#000;overflow:hidden}.mp-stage video,.mp-stage img{width:100%;height:100%;object-fit:contain}.mp-stage canvas{position:absolute;inset:0;width:100%;height:100%;touch-action:none}.mp-stage-empty{color:#68758c;font-size:11px}.mp-design-preview{width:100%;height:100%;display:grid;place-items:center;background:linear-gradient(145deg,#090d14,#171d2a)}.mp-design-preview strong{font-size:40px;text-align:center;padding:30px}
        .mp-player-bar{display:flex;align-items:center;gap:6px;padding:6px 12px;border-top:1px solid var(--line);border-bottom:1px solid var(--line);background:#0d1522}.mp-player-bar button{width:32px;height:30px;border:1px solid var(--line);background:#142035;color:#fff;border-radius:7px}.mp-time{display:grid;grid-template-columns:50px 1fr 50px;align-items:center;gap:6px;flex:1}.mp-time span{font-size:8px;color:var(--gold);font-weight:900;text-align:center}.mp-time div{height:5px;border-radius:5px;background:#e4e8ef}.mp-time i{display:block;width:20%;height:100%;background:#3d8cff;border-radius:5px}.mp-player-bar select{border:1px solid var(--line);background:#101a2b;color:#fff;border-radius:6px;padding:5px}
        .mp-tools{display:flex;gap:6px;padding:7px 12px;border-bottom:1px solid var(--line);background:#0d1522}.mp-tools button{font-size:9px;padding:6px 9px}.mp-tools button.on{border-color:var(--gold);color:var(--gold)}.mp-timeline-head{display:flex;justify-content:space-between;align-items:center;padding:7px 12px;background:#0b1320}.mp-timeline-head>div:first-child{display:flex;align-items:baseline;gap:8px}.mp-timeline-head strong{font-size:11px}.mp-timeline-head small{font-size:8px;color:#78869e}.mp-timeline-head>div:last-child{display:flex;align-items:center;gap:5px}.mp-timeline-head button{padding:4px 8px;min-width:28px}.mp-timeline-head span{font-size:8px;color:var(--gold)}
        .mp-timeline-scroll{overflow:auto;background:#08101c;border-top:1px solid var(--line)}.mp-ruler{height:26px;position:relative;margin-left:110px;border-bottom:1px solid #22304a;min-width:1000px}.mp-ruler span{position:absolute;top:7px;font-size:7px;color:#6f7e96;white-space:nowrap}.mp-track-row{display:grid;grid-template-columns:110px minmax(0,1fr);min-height:92px}.mp-track-row>label{padding:12px;color:#8d98ab;font-size:8px;font-weight:900;border-right:1px solid #22304a;background:#0b1320}.mp-track{position:relative;height:84px;padding:8px;min-width:max-content;background:repeating-linear-gradient(90deg,transparent 0,transparent 224px,rgba(255,255,255,.025) 225px)}.mp-timeline-item{position:absolute;top:8px;height:68px;border:1px solid #33415c;border-radius:8px;background:#121d2f;color:#fff;padding:8px;text-align:left;display:grid;grid-template-columns:auto 1fr;grid-template-rows:auto 1fr auto;gap:4px;cursor:pointer;overflow:hidden}.mp-timeline-item.selected{border-color:var(--gold);box-shadow:0 0 0 1px #d4a24c55}.mp-timeline-item.type-title{background:#2c2250}.mp-timeline-item.type-text{background:#253249}.mp-timeline-item.type-image{background:#27353a}.mp-timeline-item.type-freeze{background:#34402d}.mp-timeline-item strong{grid-column:1/-1;font-size:9px;overflow:hidden}.mp-timeline-item small{font-size:8px;color:#c1cad9}.mp-timeline-item b{position:absolute;right:4px;top:4px;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:#8e2438;color:#fff}.mp-track-empty{color:#607087;font-size:9px;padding:25px}
        .mp-playhead{position:absolute;top:0;bottom:-280px;width:2px;background:#d4a24c;z-index:20;pointer-events:none;box-shadow:0 0 0 1px #0008}
        .track-audio .mp-timeline-item{background:#253047}.track-overlay .mp-timeline-item{background:#32284a}
        .mp-audio-inspector{display:grid;gap:8px;border:1px solid #2b3850;border-radius:9px;padding:10px;margin:10px 0}.mp-audio-inspector strong{color:#d4a24c;font-size:10px}.mp-audio-inspector label{display:grid;gap:5px;font-size:9px;color:#8e9ab0}
        .mp-inspector-form{display:grid;gap:10px}.mp-inspector label,.mp-project-note{display:grid;gap:5px;color:#8a96aa;font-size:9px;font-weight:800}.mp-inspector textarea{min-height:80px;resize:vertical}.mp-two{display:grid;grid-template-columns:1fr 1fr;gap:6px}.mp-readonly{border:1px solid var(--line);background:#0c1422;color:#d4a24c;border-radius:8px;padding:9px;text-transform:capitalize}.mp-nudge{display:grid;grid-template-columns:1fr 1fr;gap:5px}.mp-nudge button,.mp-inspector-form>button{font-size:8px}.mp-inspector-tools{display:grid;grid-template-columns:1fr 1fr 1fr 40px;gap:4px}.mp-inspector-tools input{width:40px;height:34px;padding:2px}.danger{border-color:#6d2c3a!important;color:#ff8293!important}.mp-project-note{margin-top:18px}.mp-project-note textarea{min-height:90px}
        .mp-modal-backdrop{position:fixed;inset:0;z-index:10000;background:#02050bc7;display:grid;place-items:center;padding:18px}.mp-clip-modal{width:min(690px,94vw);border:1px solid #34415a;border-radius:14px;background:#0d1522;box-shadow:0 30px 80px #000;overflow:hidden}.mp-clip-modal header{display:flex;justify-content:space-between;align-items:flex-start;padding:12px 14px;border-bottom:1px solid var(--line)}.mp-clip-modal header small{color:#7f8ca2;font-size:8px}.mp-clip-modal h2{margin:3px 0 0;font-size:15px}.mp-clip-modal header button{border:0;background:#172238;color:#fff;border-radius:7px;width:28px;height:28px}.mp-modal-stage{aspect-ratio:16/9;background:#000}.mp-modal-stage video{width:100%;height:100%;object-fit:contain}.mp-modal-tags{display:flex;gap:5px;flex-wrap:wrap;padding:9px 14px}.mp-modal-tags i{font-size:8px;padding:4px 7px}.mp-modal-actions{display:flex;gap:7px;padding:0 14px 10px}.mp-clip-modal footer{display:grid;grid-template-columns:1fr 1.3fr 1fr;gap:7px;padding:10px 14px;border-top:1px solid var(--line)}.mp-clip-modal footer button{font-size:9px}.mp-clip-modal kbd{font-size:7px;color:#7d899d;margin-left:4px}.mp-share{width:min(480px,94vw);padding:18px;border:1px solid var(--line);border-radius:12px;background:#0e1624}.mp-share div{display:flex;gap:7px;margin-top:10px}.mp-toast{position:fixed;right:18px;bottom:18px;z-index:12000;background:#d4a24c;color:#1b150d;border-radius:9px;padding:10px 14px;font-weight:900}
        @media(max-width:1180px){.mp-grid{grid-template-columns:260px minmax(520px,1fr)}.mp-inspector{display:none}.mp-header{grid-template-columns:260px 1fr auto}.mp-header-actions button:nth-child(2){display:none}}@media(max-width:850px){.mp-grid{grid-template-columns:1fr;height:auto}.mp-library{max-height:none}.mp-center{min-height:760px}.mp-header{grid-template-columns:1fr}.mp-project-name,.mp-header-actions{display:none}}
      `}</style>
    </div>
  );
}