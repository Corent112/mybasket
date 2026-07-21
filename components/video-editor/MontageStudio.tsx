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

type MontageItem = {
  id?: string;
  montage_id?: string;
  action_id: string;
  sort_order: number;
  title: string;
  note: string;
  clip_start: number;
  clip_end: number;
  freeze_time: number | null;
  freeze_duration: number | null;
  annotations: Drawing[];
  action?: ActionRow;
};

type Props = {
  initialTeamId?: string;
  initialPlayerId?: string;
  initialMontageId?: string;
  onClose?: () => void;
  embedded?: boolean;
};

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

          return {
            id: item.id,
            montage_id: montageId,
            action_id: actionId,
            sort_order: numberValue(item.sort_order ?? item.position ?? index),
            title:
              item.title ||
              item.clip_title ||
              (action ? actionLabel(action) : `Clip ${index + 1}`),
            note: item.note || item.text || "",
            clip_start: numberValue(
              item.clip_start ?? (action ? clipStart(action) : 0),
            ),
            clip_end: numberValue(
              item.clip_end ?? (action ? clipEnd(action) : 8),
            ),
            freeze_time:
              item.freeze_time == null ? null : numberValue(item.freeze_time),
            freeze_duration:
              item.freeze_duration == null
                ? null
                : numberValue(item.freeze_duration),
            annotations: Array.isArray(item.annotations)
              ? item.annotations
              : [],
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
    const existing = new Set(items.map((item) => item.action_id));
    const query = search.trim().toLowerCase();

    return actions.filter((action) => {
      if (existing.has(String(action.id))) return false;
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

      if (!query) return true;

      return `${actionLabel(action)} ${actionSub(action, matchMap)}`
        .toLowerCase()
        .includes(query);
    });
  }, [actions, filter, items, matchMap, search]);

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

  const addAction = (action: ActionRow) => {
    setItems((current) => {
      const next: MontageItem = {
        action_id: String(action.id),
        sort_order: current.length,
        title: action.clip_title || actionLabel(action),
        note: "",
        clip_start: clipStart(action),
        clip_end: clipEnd(action),
        freeze_time: null,
        freeze_duration: null,
        annotations: [],
        action,
      };
      return [...current, next];
    });
    setSelectedIndex(items.length);
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
          item_type: "clip",
          action_id: item.action_id,
          sort_order: index,
          title: item.title || null,
          text: item.note || null,
          clip_start: item.clip_start,
          clip_end: item.clip_end,
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

  const totalDuration = items.reduce(
    (sum, item) => sum + Math.max(0, item.clip_end - item.clip_start),
    0,
  );

  return (
    <div className={`studio-root ${embedded ? "embedded" : ""}`}>
      <header className="studio-header">
        <div className="brand">
          <span className="brand-mark">MB</span>
          <div>
            <p>MyBasket Video</p>
            <h1>Studio Montage</h1>
          </div>
        </div>

        <div className="project-title">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Nom du montage"
          />
          <small>
            {items.length} clip{items.length > 1 ? "s" : ""} ·{" "}
            {Math.round(totalDuration)} s
          </small>
        </div>

        <div className="header-actions">
          {onClose && (
            <button type="button" className="ghost" onClick={onClose}>
              Fermer
            </button>
          )}
          <button type="button" className="ghost" onClick={refreshExport}>
            Partager
          </button>
          <button
            type="button"
            className="ghost"
            disabled={rendering}
            onClick={renderMontage}
          >
            {rendering ? "Rendu…" : "Exporter MP4"}
          </button>
          <button
            type="button"
            className="primary"
            disabled={saving}
            onClick={saveMontage}
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </header>

      <div className="studio-toolbar">
        <label>
          <span>Équipe</span>
          <select value={teamId} onChange={(event) => setTeamId(event.target.value)}>
            <option value="">Choisir</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {team.name}
              </option>
            ))}
          </select>
        </label>

        <label>
          <span>Montage</span>
          <select
            value={montageId}
            onChange={(event) => setMontageId(event.target.value)}
          >
            <option value="">Nouveau montage</option>
            {montages.map((montage) => (
              <option key={montage.id} value={montage.id}>
                {montage.title || "Montage"}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          onClick={() => {
            setMontageId("");
            setItems([]);
            setTitle(playerId ? "Montage joueur" : "Nouveau montage");
            setCoachNote("");
            setSelectedIndex(0);
          }}
        >
          + Nouveau
        </button>

        <div className="spacer" />

        <button
          type="button"
          className={drawMode === "arrow" ? "active" : ""}
          onClick={() => setDrawMode("arrow")}
        >
          Flèche
        </button>
        <button
          type="button"
          className={drawMode === "line" ? "active" : ""}
          onClick={() => setDrawMode("line")}
        >
          Trait
        </button>
        <button
          type="button"
          className={drawMode === "circle" ? "active" : ""}
          onClick={() => setDrawMode("circle")}
        >
          Cercle
        </button>
        <button
          type="button"
          className={drawMode === "text" ? "active" : ""}
          onClick={() => setDrawMode("text")}
        >
          Texte
        </button>
        <input
          type="color"
          className="color"
          value={drawColor}
          onChange={(event) => setDrawColor(event.target.value)}
          aria-label="Couleur du dessin"
        />
      </div>

      <main className="studio-workspace">
        <aside className="library-panel">
          <div className="panel-heading">
            <div>
              <p>Bibliothèque</p>
              <h2>Clips LiveStats</h2>
            </div>
            <span>{filteredActions.length}</span>
          </div>

          <input
            className="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Rechercher une action…"
          />

          <div className="filters">
            {(
              [
                ["all", "Tous"],
                ["made", "Marqués"],
                ["missed", "Ratés"],
                ["video", "Avec vidéo"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={filter === key ? "active" : ""}
                onClick={() => setFilter(key)}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="clip-library">
            {loading ? (
              <div className="empty">Chargement des clips…</div>
            ) : filteredActions.length === 0 ? (
              <div className="empty">Aucun clip disponible.</div>
            ) : (
              filteredActions.map((action) => (
                <button
                  type="button"
                  className="library-clip"
                  key={action.id}
                  onClick={() => addAction(action)}
                >
                  <span
                    className={`result-dot ${
                      action.shot_result === "made"
                        ? "made"
                        : action.shot_result === "missed"
                          ? "missed"
                          : ""
                    }`}
                  />
                  <span>
                    <strong>{actionLabel(action)}</strong>
                    <small>{actionSub(action, matchMap)}</small>
                  </span>
                  <b>+</b>
                </button>
              ))
            )}
          </div>
        </aside>

        <section className="preview-panel">
          <div className="preview-top">
            <div>
              <p>Lecteur</p>
              <h2>{selected?.title || "Sélectionne un clip"}</h2>
            </div>
            {selected && (
              <span>
                {selectedIndex + 1}/{items.length}
              </span>
            )}
          </div>

          <div className="video-stage">
            {selectedVideo ? (
              <video
                ref={videoRef}
                src={selectedVideo}
                controls
                playsInline
                onTimeUpdate={(event) => {
                  if (
                    selected &&
                    event.currentTarget.currentTime >= selected.clip_end
                  ) {
                    event.currentTarget.pause();
                  }
                }}
              />
            ) : (
              <div className="video-empty">
                <strong>Vidéo non synchronisée</strong>
                <span>
                  Le clip reste montable, mais il faut une URL vidéo sur le match
                  pour le lire.
                </span>
              </div>
            )}

            <canvas
              ref={canvasRef}
              width={960}
              height={540}
              onPointerDown={(event) => {
                dragOrigin.current = pointer(event);
              }}
              onPointerUp={(event) => {
                if (!selected || !dragOrigin.current) return;
                const startPoint = dragOrigin.current;
                const endPoint = pointer(event);
                dragOrigin.current = null;
                const currentTime = numberValue(videoRef.current?.currentTime);
                const text =
                  drawMode === "text"
                    ? window.prompt("Texte à afficher") || "Texte"
                    : undefined;

                updateSelected({
                  annotations: [
                    ...selected.annotations,
                    {
                      id: uid(),
                      kind: drawMode,
                      x1: startPoint.x,
                      y1: startPoint.y,
                      x2: endPoint.x,
                      y2: endPoint.y,
                      color: drawColor,
                      width: 5,
                      text,
                      start: currentTime,
                      end: currentTime + 3,
                    },
                  ],
                });
              }}
            />
          </div>

          <div className="player-controls">
            <button
              type="button"
              disabled={selectedIndex <= 0}
              onClick={() => setSelectedIndex((index) => index - 1)}
            >
              Clip précédent
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={() => {
                if (!videoRef.current || !selected) return;
                videoRef.current.currentTime = selected.clip_start;
                void videoRef.current.play();
              }}
            >
              Lire le clip
            </button>
            <button
              type="button"
              disabled={selectedIndex >= items.length - 1}
              onClick={() => setSelectedIndex((index) => index + 1)}
            >
              Clip suivant
            </button>
          </div>

          <div className="timeline">
            <div className="timeline-head">
              <div>
                <p>Timeline</p>
                <strong>Vidéo principale</strong>
              </div>
              <span>{Math.round(totalDuration)} secondes</span>
            </div>

            <div className="timeline-track">
              {items.length === 0 ? (
                <div className="timeline-empty">
                  Ajoute des clips depuis la bibliothèque.
                </div>
              ) : (
                items.map((item, index) => {
                  const duration = Math.max(1, item.clip_end - item.clip_start);

                  return (
                    <button
                      type="button"
                      key={`${item.action_id}-${index}`}
                      draggable
                      onDragStart={() => {
                        dragIndex.current = index;
                      }}
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={() => {
                        if (dragIndex.current == null) return;
                        moveItem(dragIndex.current, index);
                        dragIndex.current = null;
                      }}
                      onClick={() => setSelectedIndex(index)}
                      className={`timeline-clip ${
                        selectedIndex === index ? "selected" : ""
                      }`}
                      style={{
                        width: `${clamp(duration * 16, 105, 260)}px`,
                      }}
                    >
                      <span>{index + 1}</span>
                      <strong>{item.title}</strong>
                      <small>{duration.toFixed(1)} s</small>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        </section>

        <aside className="inspector-panel">
          <div className="panel-heading">
            <div>
              <p>Inspecteur</p>
              <h2>Réglages du clip</h2>
            </div>
          </div>

          {!selected ? (
            <div className="empty">
              Sélectionne un clip dans la timeline pour le modifier.
            </div>
          ) : (
            <div className="inspector-content">
              <label>
                <span>Titre</span>
                <input
                  value={selected.title}
                  onChange={(event) =>
                    updateSelected({ title: event.target.value })
                  }
                />
              </label>

              <div className="two-columns">
                <label>
                  <span>Début</span>
                  <input
                    type="number"
                    step="0.1"
                    value={selected.clip_start}
                    onChange={(event) =>
                      updateSelected({
                        clip_start: numberValue(event.target.value),
                      })
                    }
                  />
                </label>
                <label>
                  <span>Fin</span>
                  <input
                    type="number"
                    step="0.1"
                    value={selected.clip_end}
                    onChange={(event) =>
                      updateSelected({
                        clip_end: numberValue(event.target.value),
                      })
                    }
                  />
                </label>
              </div>

              <div className="mark-buttons">
                <button
                  type="button"
                  onClick={() =>
                    updateSelected({
                      clip_start: numberValue(videoRef.current?.currentTime),
                    })
                  }
                >
                  Début = temps actuel
                </button>
                <button
                  type="button"
                  onClick={() =>
                    updateSelected({
                      clip_end: numberValue(videoRef.current?.currentTime),
                    })
                  }
                >
                  Fin = temps actuel
                </button>
              </div>

              <label>
                <span>Note coach</span>
                <textarea
                  value={selected.note}
                  onChange={(event) =>
                    updateSelected({ note: event.target.value })
                  }
                  placeholder="Point à montrer au joueur…"
                />
              </label>

              <div className="freeze-box">
                <div>
                  <strong>Arrêt sur image</strong>
                  <small>
                    Fige l'image pendant le rendu pour laisser le temps de lire
                    les annotations.
                  </small>
                </div>

                <button
                  type="button"
                  onClick={() =>
                    updateSelected({
                      freeze_time: numberValue(videoRef.current?.currentTime),
                      freeze_duration: selected.freeze_duration || 2,
                    })
                  }
                >
                  Créer maintenant
                </button>

                {selected.freeze_time != null && (
                  <>
                    <label>
                      <span>Position</span>
                      <input
                        type="number"
                        step="0.1"
                        value={selected.freeze_time}
                        onChange={(event) =>
                          updateSelected({
                            freeze_time: numberValue(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      <span>Durée</span>
                      <input
                        type="number"
                        min="0.5"
                        step="0.5"
                        value={selected.freeze_duration || 2}
                        onChange={(event) =>
                          updateSelected({
                            freeze_duration: numberValue(event.target.value),
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="danger"
                      onClick={() =>
                        updateSelected({
                          freeze_time: null,
                          freeze_duration: null,
                        })
                      }
                    >
                      Supprimer l'arrêt
                    </button>
                  </>
                )}
              </div>

              <div className="annotation-actions">
                <button
                  type="button"
                  disabled={!selected.annotations.length}
                  onClick={() =>
                    updateSelected({
                      annotations: selected.annotations.slice(0, -1),
                    })
                  }
                >
                  Annuler le dernier dessin
                </button>
                <button
                  type="button"
                  disabled={!selected.annotations.length}
                  onClick={() => updateSelected({ annotations: [] })}
                >
                  Effacer les dessins
                </button>
              </div>

              <button
                type="button"
                className="danger remove"
                onClick={() => removeItem(selectedIndex)}
              >
                Retirer ce clip du montage
              </button>
            </div>
          )}

          <label className="project-note">
            <span>Note générale du montage</span>
            <textarea
              value={coachNote}
              onChange={(event) => setCoachNote(event.target.value)}
              placeholder="Objectif de la vidéo, message collectif…"
            />
          </label>
        </aside>
      </main>

      {shareOpen && (
        <div className="share-backdrop" onClick={() => setShareOpen(false)}>
          <div className="share-modal" onClick={(event) => event.stopPropagation()}>
            <h2>Partager le montage</h2>
            <p>
              Le lien devient disponible lorsque le rendu MP4 est terminé.
            </p>
            <input
              value={recipient}
              onChange={(event) => setRecipient(event.target.value)}
              placeholder="E-mail ou téléphone"
            />
            <div>
              <button type="button" onClick={() => void share("mail")}>
                E-mail
              </button>
              <button type="button" onClick={() => void share("whatsapp")}>
                WhatsApp
              </button>
              <button type="button" onClick={() => void share("copy")}>
                Copier le lien
              </button>
              <button type="button" onClick={() => void share("native")}>
                Partager
              </button>
            </div>
            <button
              type="button"
              className="close-share"
              onClick={() => setShareOpen(false)}
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {toast && <div className="studio-toast">{toast}</div>}

      <style jsx>{`
        .studio-root {
          --wine: #6b1a2c;
          --gold: #d4a24c;
          --dark: #151113;
          --panel: #211b1e;
          --panel-2: #2b2327;
          --line: #43383d;
          --text: #f7f2f4;
          --muted: #aa9ca2;
          min-height: 100vh;
          background: #100d0f;
          color: var(--text);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
            "Segoe UI", sans-serif;
        }

        .studio-root * {
          box-sizing: border-box;
        }

        .studio-root.embedded {
          min-height: 760px;
          border-radius: 18px;
          overflow: hidden;
        }

        .studio-header {
          min-height: 74px;
          display: grid;
          grid-template-columns: auto minmax(240px, 1fr) auto;
          align-items: center;
          gap: 1.25rem;
          padding: 0.8rem 1.1rem;
          border-bottom: 1px solid var(--line);
          background: #171214;
        }

        .brand {
          display: flex;
          align-items: center;
          gap: 0.75rem;
        }

        .brand-mark {
          width: 42px;
          height: 42px;
          border-radius: 12px;
          display: grid;
          place-items: center;
          background: var(--wine);
          color: #fff;
          font-weight: 950;
        }

        .brand p,
        .preview-top p,
        .panel-heading p,
        .timeline-head p {
          margin: 0;
          color: var(--gold);
          font-size: 0.68rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 950;
        }

        .brand h1,
        .preview-top h2,
        .panel-heading h2 {
          margin: 0.15rem 0 0;
          font-size: 1rem;
          color: #fff;
        }

        .project-title {
          display: grid;
          justify-items: center;
        }

        .project-title input {
          width: min(520px, 100%);
          border: 0;
          background: transparent;
          color: #fff;
          text-align: center;
          font-size: 1.05rem;
          font-weight: 950;
        }

        .project-title input:focus {
          outline: 0;
        }

        .project-title small {
          color: var(--muted);
          margin-top: 0.2rem;
        }

        .header-actions,
        .studio-toolbar,
        .player-controls,
        .mark-buttons,
        .annotation-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }

        button {
          border: 1px solid var(--line);
          border-radius: 9px;
          background: var(--panel-2);
          color: #fff;
          min-height: 36px;
          padding: 0.55rem 0.8rem;
          font-weight: 850;
          cursor: pointer;
        }

        button:hover:not(:disabled) {
          border-color: var(--gold);
        }

        button:disabled {
          opacity: 0.42;
          cursor: not-allowed;
        }

        button.primary {
          border-color: var(--wine);
          background: var(--wine);
        }

        button.ghost {
          background: transparent;
        }

        button.active {
          border-color: var(--gold);
          background: rgba(212, 162, 76, 0.14);
          color: #ffd979;
        }

        button.danger {
          border-color: rgba(239, 68, 68, 0.45);
          color: #ff8b8b;
        }

        .studio-toolbar {
          min-height: 54px;
          padding: 0.55rem 1rem;
          border-bottom: 1px solid var(--line);
          background: #1b1619;
        }

        .studio-toolbar label {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          color: var(--muted);
          font-size: 0.72rem;
          font-weight: 850;
        }

        select,
        input,
        textarea {
          border: 1px solid var(--line);
          border-radius: 8px;
          background: #171214;
          color: #fff;
          padding: 0.55rem 0.65rem;
          font: inherit;
        }

        select {
          min-width: 170px;
        }

        textarea {
          resize: vertical;
        }

        .studio-toolbar .spacer {
          flex: 1;
        }

        .studio-toolbar .color {
          width: 42px;
          height: 36px;
          padding: 2px;
        }

        .studio-workspace {
          min-height: calc(100vh - 128px);
          display: grid;
          grid-template-columns: 300px minmax(0, 1fr) 310px;
          gap: 1px;
          background: var(--line);
        }

        .library-panel,
        .preview-panel,
        .inspector-panel {
          min-width: 0;
          background: var(--dark);
        }

        .library-panel,
        .inspector-panel {
          padding: 0.9rem;
          overflow: auto;
        }

        .panel-heading,
        .preview-top,
        .timeline-head {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 0.75rem;
          margin-bottom: 0.8rem;
        }

        .panel-heading > span,
        .preview-top > span {
          min-width: 32px;
          height: 27px;
          padding: 0 0.5rem;
          border-radius: 999px;
          display: grid;
          place-items: center;
          background: rgba(212, 162, 76, 0.13);
          color: #ffd979;
          font-size: 0.75rem;
          font-weight: 950;
        }

        .search {
          width: 100%;
          margin-bottom: 0.7rem;
        }

        .filters {
          display: flex;
          gap: 0.35rem;
          overflow-x: auto;
          padding-bottom: 0.5rem;
        }

        .filters button {
          min-height: 30px;
          padding: 0.35rem 0.6rem;
          white-space: nowrap;
          font-size: 0.7rem;
        }

        .clip-library {
          display: grid;
          gap: 0.45rem;
          max-height: calc(100vh - 260px);
          overflow-y: auto;
          padding-right: 0.2rem;
        }

        .library-clip {
          width: 100%;
          display: grid;
          grid-template-columns: 9px minmax(0, 1fr) auto;
          align-items: center;
          gap: 0.65rem;
          text-align: left;
          background: var(--panel);
        }

        .library-clip span:nth-child(2) {
          min-width: 0;
          display: grid;
        }

        .library-clip strong,
        .library-clip small {
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .library-clip strong {
          font-size: 0.77rem;
        }

        .library-clip small {
          color: var(--muted);
          margin-top: 0.15rem;
          font-size: 0.66rem;
        }

        .library-clip > b {
          color: var(--gold);
          font-size: 1rem;
        }

        .result-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #797075;
        }

        .result-dot.made {
          background: #24b36b;
        }

        .result-dot.missed {
          background: #e34d59;
        }

        .empty {
          border: 1px dashed var(--line);
          border-radius: 11px;
          padding: 1rem;
          color: var(--muted);
          text-align: center;
          line-height: 1.45;
        }

        .preview-panel {
          min-width: 0;
          display: grid;
          grid-template-rows: auto minmax(260px, 1fr) auto auto;
          padding: 0.9rem;
          overflow: hidden;
        }

        .video-stage {
          position: relative;
          min-height: 330px;
          aspect-ratio: 16 / 9;
          background: #000;
          border-radius: 13px;
          overflow: hidden;
          box-shadow: 0 15px 45px rgba(0, 0, 0, 0.45);
        }

        .video-stage video,
        .video-stage canvas {
          position: absolute;
          inset: 0;
          width: 100%;
          height: 100%;
        }

        .video-stage video {
          object-fit: contain;
        }

        .video-stage canvas {
          z-index: 2;
          touch-action: none;
          cursor: crosshair;
        }

        .video-empty {
          height: 100%;
          display: grid;
          place-content: center;
          gap: 0.45rem;
          padding: 2rem;
          text-align: center;
          color: var(--muted);
        }

        .video-empty strong {
          color: #fff;
        }

        .player-controls {
          justify-content: center;
          padding: 0.75rem 0;
        }

        .timeline {
          min-height: 175px;
          border: 1px solid var(--line);
          border-radius: 12px;
          background: #181416;
          overflow: hidden;
        }

        .timeline-head {
          margin: 0;
          padding: 0.75rem;
          border-bottom: 1px solid var(--line);
        }

        .timeline-head strong {
          display: block;
          margin-top: 0.15rem;
          font-size: 0.82rem;
        }

        .timeline-head > span {
          color: var(--muted);
          font-size: 0.72rem;
        }

        .timeline-track {
          min-height: 112px;
          display: flex;
          align-items: stretch;
          gap: 3px;
          overflow-x: auto;
          padding: 0.65rem;
          background-image: linear-gradient(
            90deg,
            transparent 24px,
            rgba(255, 255, 255, 0.035) 25px
          );
          background-size: 25px 100%;
        }

        .timeline-empty {
          width: 100%;
          display: grid;
          place-items: center;
          color: var(--muted);
        }

        .timeline-clip {
          flex: 0 0 auto;
          min-height: 84px;
          display: grid;
          grid-template-columns: auto 1fr;
          grid-template-rows: 1fr auto;
          align-items: start;
          gap: 0.3rem 0.5rem;
          text-align: left;
          background: linear-gradient(145deg, #35272d, #241c20);
          border-color: #55454d;
        }

        .timeline-clip.selected {
          border-color: var(--gold);
          box-shadow: inset 0 0 0 1px var(--gold);
        }

        .timeline-clip > span {
          width: 22px;
          height: 22px;
          border-radius: 6px;
          display: grid;
          place-items: center;
          background: var(--wine);
          font-size: 0.67rem;
        }

        .timeline-clip strong {
          overflow: hidden;
          display: -webkit-box;
          -webkit-line-clamp: 2;
          -webkit-box-orient: vertical;
          font-size: 0.72rem;
          line-height: 1.3;
        }

        .timeline-clip small {
          grid-column: 1 / -1;
          color: var(--muted);
          font-size: 0.65rem;
        }

        .inspector-content {
          display: grid;
          gap: 0.8rem;
        }

        .inspector-content label,
        .project-note {
          display: grid;
          gap: 0.35rem;
        }

        .inspector-content label > span,
        .project-note > span {
          color: var(--muted);
          font-size: 0.7rem;
          font-weight: 900;
          text-transform: uppercase;
        }

        .inspector-content input,
        .inspector-content textarea,
        .project-note textarea {
          width: 100%;
        }

        .inspector-content textarea {
          min-height: 76px;
        }

        .two-columns {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.55rem;
        }

        .mark-buttons,
        .annotation-actions {
          display: grid;
          grid-template-columns: 1fr 1fr;
        }

        .freeze-box {
          display: grid;
          gap: 0.65rem;
          padding: 0.75rem;
          border: 1px solid var(--line);
          border-radius: 11px;
          background: var(--panel);
        }

        .freeze-box > div {
          display: grid;
          gap: 0.2rem;
        }

        .freeze-box small {
          color: var(--muted);
          line-height: 1.4;
        }

        .remove {
          width: 100%;
        }

        .project-note {
          margin-top: 1rem;
          padding-top: 1rem;
          border-top: 1px solid var(--line);
        }

        .project-note textarea {
          min-height: 100px;
        }

        .share-backdrop {
          position: fixed;
          inset: 0;
          z-index: 20000;
          display: grid;
          place-items: center;
          padding: 1rem;
          background: rgba(0, 0, 0, 0.72);
          backdrop-filter: blur(7px);
        }

        .share-modal {
          width: min(520px, 96vw);
          border: 1px solid var(--line);
          border-radius: 17px;
          background: var(--panel);
          padding: 1.2rem;
        }

        .share-modal h2 {
          margin: 0;
        }

        .share-modal p {
          color: var(--muted);
        }

        .share-modal input {
          width: 100%;
        }

        .share-modal > div {
          display: flex;
          gap: 0.5rem;
          flex-wrap: wrap;
          margin-top: 0.8rem;
        }

        .close-share {
          width: 100%;
          margin-top: 0.8rem;
        }

        .studio-toast {
          position: fixed;
          left: 50%;
          bottom: 22px;
          z-index: 30000;
          transform: translateX(-50%);
          border: 1px solid var(--line);
          border-radius: 10px;
          background: #211b1e;
          color: #fff;
          padding: 0.75rem 1rem;
          box-shadow: 0 12px 35px rgba(0, 0, 0, 0.5);
          font-weight: 850;
        }

        @media (max-width: 1180px) {
          .studio-workspace {
            grid-template-columns: 255px minmax(0, 1fr);
          }

          .inspector-panel {
            grid-column: 1 / -1;
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 1rem;
          }

          .inspector-content {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }

        @media (max-width: 820px) {
          .studio-header {
            grid-template-columns: 1fr;
          }

          .project-title {
            justify-items: start;
          }

          .project-title input {
            text-align: left;
          }

          .studio-workspace {
            grid-template-columns: 1fr;
          }

          .library-panel {
            max-height: 420px;
          }

          .clip-library {
            max-height: 270px;
          }

          .inspector-panel {
            grid-template-columns: 1fr;
          }

          .inspector-content {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
