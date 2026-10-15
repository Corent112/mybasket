"use client";

import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import styles from "./FreeCodingBoard.module.css";
import { createPortal } from "react-dom";
import ShotChart from "./ShotChart";

export type MatchReviewControlType =
  "button" | "plus-minus" | "counter" | "rating" | "choice" | "text";

export type MatchReviewFlowStepType =
  | "block"
  | "control"
  | "player"
  | "passer"
  | "receiver"
  | "opponent"
  | "team"
  | "value"
  | "comment"
  | "clip"
  | "save";

export type MatchReviewControl = {
  id: string;
  label: string;
  type: MatchReviewControlType;
  color: string;
  value?: number;
  shortcut?: string;
  requirePlayer?: boolean;
  requireComment?: boolean;
  createClip?: boolean;
  preRoll?: number;
  postRoll?: number;
  options?: string[];
  /** Logique exécutée après le clic sur ce bouton. */
  logic?: MatchReviewFlowStep[];
};

export type MatchReviewBlock = {
  id: string;
  title: string;
  subtitle?: string;
  color: string;
  columns: 1 | 2 | 3 | 4;
  buttonSize?: "compact" | "normal" | "large";
  controls: MatchReviewControl[];
  kind?: "buttons" | "players" | "shot-chart" | "context";
  frame?: { x: number; y: number; width: number; height: number };
};

export type MatchReviewFlowStep = {
  id: string;
  type: MatchReviewFlowStepType;
  required: boolean;
};

export type MatchReviewLayout = {
  columns: 1 | 2 | 3;
  compact: boolean;
  showPlayerPanel: boolean;
  showVideo: boolean;
  showHistory: boolean;
};

export type MatchReviewTemplate = {
  id: string;
  name: string;
  description: string;
  blocks: MatchReviewBlock[];
  flow: MatchReviewFlowStep[];
  layout: MatchReviewLayout;
  updatedAt: string;
};

export type MatchReviewEvent = {
  id: string;
  templateId: string;
  templateName: string;
  blockId: string;
  blockTitle: string;
  controlId: string;
  controlLabel: string;
  controlType: MatchReviewControlType;
  value: string | number | null;
  playerId: string | null;
  playerName: string | null;
  comment: string;
  createClip: boolean;
  preRoll: number;
  postRoll: number;
  videoTime: number | null;
  createdAt: string;
  context?: "attaque" | "defense" | null;
  shotPosition?: { x: number; y: number } | null;
  shotZoneId?: string | null;
  shotType?: "2PTS" | "3PTS" | null;
};

type PlayerOption = { id: string; name: string; num?: number | string | null };

type Props = {
  projectId?: string | null;
  players?: PlayerOption[];
  getVideoTime?: () => number | null;
  onSeek?: (time: number) => void;
  embedded?: boolean;
  initialEditorOpen?: boolean;
  onClose?: () => void;
  onSaved?: (templateId: string) => void;
  onRecord?: (event: MatchReviewEvent) => void;
  onLayoutChange?: (layout: MatchReviewLayout) => void;
};

const TEMPLATE_STORAGE = "mybasket.match-review.templates.v2";
const ACTIVE_TEMPLATE_STORAGE = "mybasket.match-review.active-template.v2";
const EVENT_STORAGE_PREFIX = "mybasket.match-review.events.v2.";

const storageGet = (key: string): string | null => {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
};

const uid = () => {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now()}_${Math.random().toString(36).slice(2)}`;
  }
};

const blankTemplate = (): MatchReviewTemplate => ({
  id: uid(),
  name: "Ma fenêtre de codification",
  description: "Configuration 100 % personnalisable",
  blocks: [],
  flow: [
    { id: uid(), type: "block", required: true },
    { id: uid(), type: "control", required: true },
    { id: uid(), type: "player", required: false },
    { id: uid(), type: "value", required: false },
    { id: uid(), type: "comment", required: false },
    { id: uid(), type: "clip", required: false },
    { id: uid(), type: "save", required: true },
  ],
  layout: {
    columns: 2,
    compact: false,
    showPlayerPanel: true,
    showVideo: true,
    showHistory: true,
  },
  updatedAt: new Date().toISOString(),
});

const typeLabels: Record<MatchReviewControlType, string> = {
  button: "Bouton simple",
  "plus-minus": "+ / −",
  counter: "Compteur",
  rating: "Note",
  choice: "Choix multiple",
  text: "Texte / commentaire",
};

type PresetControl = Omit<MatchReviewControl, "id" | "logic"> & {
  logic?: MatchReviewFlowStepType[];
};

type PresetBlock = {
  key: string;
  label: string;
  icon: string;
  color: string;
  controls: PresetControl[];
};

const logic = (...types: MatchReviewFlowStepType[]): MatchReviewFlowStep[] =>
  types.map((type) => ({
    id: uid(),
    type,
    required: !["comment", "clip"].includes(type),
  }));

const PRESET_BLOCKS: PresetBlock[] = [
  {
    key: "systeme",
    label: "Système de jeu",
    icon: "🏀",
    color: "#D4A24C",
    controls: [
      "Contre attaque",
      "Transition",
      "Libre",
      "Système 1",
      "Système 2",
      "Système 3",
      "Système 4",
      "Système 5",
      "Système 6",
      "Système 7",
      "Système 8",
      "SLOB 1",
      "SLOB 2",
      "BLOB 1",
      "BLOB 2",
    ].map((label) => ({
      label,
      type: "button" as const,
      color: "#D4A24C",
      value: 1,
      createClip: true,
      preRoll: 4,
      postRoll: 4,
      logic: ["player", "value", "clip", "save"] as MatchReviewFlowStepType[],
    })),
  },
  {
    key: "temps-fort",
    label: "Temps fort",
    icon: "⚡",
    color: "#D4A24C",
    controls: [
      "1v1",
      "Hand Off",
      "Drive & Kick",
      "Jeu sans ballon",
      "Passing",
      "Rebond offensif",
      "Autres",
    ].map((label) => ({
      label,
      type: "button" as const,
      color: "#D4A24C",
      value: 1,
      createClip: true,
      preRoll: 4,
      postRoll: 4,
      logic:
        label === "Passing"
          ? ([
              "passer",
              "receiver",
              "value",
              "clip",
              "save",
            ] as MatchReviewFlowStepType[])
          : (["player", "value", "clip", "save"] as MatchReviewFlowStepType[]),
    })),
  },
  {
    key: "attaque",
    label: "Actions attaque",
    icon: "🔵",
    color: "#3B82F6",
    controls: [
      "Tir",
      "Faute provoquée",
      "Touche / Sortie",
      "Perte de balle",
      "Contre",
      "Faute commise",
      "Faute technique",
    ].map((label) => ({
      label,
      type: "button" as const,
      color: "#3B82F6",
      value: 1,
      createClip: true,
      preRoll: 4,
      postRoll: 4,
      logic: ["player", "value", "clip", "save"] as MatchReviewFlowStepType[],
    })),
  },
  {
    key: "defense",
    label: "Actions défense",
    icon: "🔴",
    color: "#EF4444",
    controls: [
      "Tir adverse",
      "Interception / récupération",
      "BP adverse",
      "Contre",
      "Touche",
      "Faute provoquée",
      "Faute commise",
      "Faute technique",
    ].map((label) => ({
      label,
      type: "button" as const,
      color: "#EF4444",
      value: 1,
      createClip: true,
      preRoll: 4,
      postRoll: 4,
      logic: [
        "player",
        "opponent",
        "value",
        "clip",
        "save",
      ] as MatchReviewFlowStepType[],
    })),
  },
  {
    key: "transition",
    label: "Transition",
    icon: "🏃",
    color: "#84CC16",
    controls: [
      "Montée de balle",
      "Fast break",
      "Repli défensif",
      "Retour défense",
    ].map((label) => ({
      label,
      type: "button" as const,
      color: "#84CC16",
      value: 1,
      createClip: true,
      preRoll: 4,
      postRoll: 4,
      logic: ["player", "value", "clip", "save"] as MatchReviewFlowStepType[],
    })),
  },
  {
    key: "individuel",
    label: "Individuel",
    icon: "🧍",
    color: "#A855F7",
    controls: [
      {
        label: "+ (positif)",
        type: "button",
        color: "#22C55E",
        value: 1,
        createClip: true,
        preRoll: 4,
        postRoll: 4,
        logic: ["player", "clip", "save"],
      },
      {
        label: "− (négatif)",
        type: "button",
        color: "#EF4444",
        value: -1,
        createClip: true,
        preRoll: 4,
        postRoll: 4,
        logic: ["player", "clip", "save"],
      },
      {
        label: "Bonne décision",
        type: "button",
        color: "#22C55E",
        value: 1,
        createClip: true,
        preRoll: 4,
        postRoll: 4,
        logic: ["player", "clip", "save"],
      },
      {
        label: "Mauvaise décision",
        type: "button",
        color: "#EF4444",
        value: -1,
        createClip: true,
        preRoll: 4,
        postRoll: 4,
        logic: ["player", "clip", "save"],
      },
    ],
  },
  {
    key: "collectif",
    label: "Collectif",
    icon: "👥",
    color: "#22D3EE",
    controls: ["Espacement", "Circulation", "Lecture jeu", "Discipline"].map(
      (label) => ({
        label,
        type: "button" as const,
        color: "#22D3EE",
        value: 1,
        createClip: true,
        preRoll: 4,
        postRoll: 4,
        logic: ["team", "value", "clip", "save"] as MatchReviewFlowStepType[],
      }),
    ),
  },
  {
    key: "rebond",
    label: "Rebond",
    icon: "↔",
    color: "#10B981",
    controls: [
      "Rebond offensif",
      "Rebond défensif",
      "Box out +",
      "Box out −",
    ].map((label) => ({
      label,
      type: "button" as const,
      color: "#10B981",
      value: label.endsWith("−") ? -1 : 1,
      createClip: true,
      preRoll: 4,
      postRoll: 4,
      logic: ["player", "value", "clip", "save"] as MatchReviewFlowStepType[],
    })),
  },
  {
    key: "faute",
    label: "Faute",
    icon: "❌",
    color: "#F97316",
    controls: ["Faute provoquée", "Faute personnelle", "Faute technique"].map(
      (label) => ({
        label,
        type: "button" as const,
        color: "#F97316",
        value: 1,
        createClip: true,
        preRoll: 4,
        postRoll: 4,
        logic: [
          "player",
          "opponent",
          "clip",
          "save",
        ] as MatchReviewFlowStepType[],
      }),
    ),
  },
  {
    key: "autres",
    label: "Autres",
    icon: "＋",
    color: "#94A3B8",
    controls: ["Commentaire", "Créer un clip", "Temps mort", "Autre"].map(
      (label) => ({
        label,
        type: label === "Commentaire" ? ("text" as const) : ("button" as const),
        color: "#94A3B8",
        value: 1,
        createClip: label !== "Commentaire",
        preRoll: 4,
        postRoll: 4,
        logic:
          label === "Commentaire"
            ? (["comment", "save"] as MatchReviewFlowStepType[])
            : (["player", "clip", "save"] as MatchReviewFlowStepType[]),
      }),
    ),
  },
];

const clonePresetControl = (control: PresetControl): MatchReviewControl => ({
  ...control,
  id: uid(),
  logic: logic(...(control.logic || ["player", "clip", "save"])),
});

const safeParseTemplates = (): MatchReviewTemplate[] => {
  if (typeof window === "undefined") return [];
  try {
    const parsed = JSON.parse(storageGet(TEMPLATE_STORAGE) || "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

/** Saved free windows are deliberately separate from guided coding profiles. */
export function MatchReviewWindowPicker() {
  const [windows, setWindows] = useState<MatchReviewTemplate[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    const reload = () => {
      const saved = safeParseTemplates();
      const id = storageGet(ACTIVE_TEMPLATE_STORAGE);
      setWindows(saved);
      setSelectedId(saved.some((t) => t.id === id) ? id! : saved[0]?.id || "");
    };
    reload();
    window.addEventListener("mybasket:mon-mode-saved", reload);
    window.addEventListener("storage", reload);
    return () => {
      window.removeEventListener("mybasket:mon-mode-saved", reload);
      window.removeEventListener("storage", reload);
    };
  }, []);
  const active = windows.find((t) => t.id === selectedId);
  return (
    <div className={styles.savedWindows}>
      <label>
        Ma fenêtre enregistrée
        <select
          aria-label="Fenêtre enregistrée de Mon mode"
          value={selectedId}
          disabled={!windows.length}
          onChange={(event) => {
            try {
              window.localStorage.setItem(
                ACTIVE_TEMPLATE_STORAGE,
                event.target.value,
              );
              setSelectedId(event.target.value);
              setError("");
              window.dispatchEvent(
                new CustomEvent("mybasket:mon-mode-selected", {
                  detail: { activeId: event.target.value },
                }),
              );
            } catch {
              setError(
                "Impossible de sélectionner cette fenêtre : stockage indisponible.",
              );
            }
          }}
        >
          {!windows.length && (
            <option value="">
              Aucune fenêtre enregistrée — cliquez sur Créer / modifier
            </option>
          )}
          {windows.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </label>
      <small>
        {active
          ? `${active.blocks.length} bloc(s) · Cette fenêtre sera utilisée au démarrage du match.`
          : "Créez votre fenêtre, donnez-lui un nom puis enregistrez-la."}
      </small>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

const normalizeHex = (value: string, fallback = "#6B1A2C") =>
  /^#[0-9a-f]{6}$/i.test(value) ? value : fallback;

const frameOf = (block: MatchReviewBlock, index: number) =>
  block.frame || {
    x: (index % 2) * 480,
    y: Math.floor(index / 2) * 270,
    width: 460,
    height: 250,
  };
const bounded = (n: number, min: number, max: number) =>
  Math.min(max, Math.max(min, n));
const freshControl = (): MatchReviewControl => ({
  id: uid(),
  label: "Nouveau bouton",
  type: "button",
  color: "#861b3a",
  value: 1,
  createClip: true,
  preRoll: 4,
  postRoll: 4,
});

export default function MatchReviewBuilder({
  projectId,
  players = [],
  getVideoTime,
  onSeek,
  embedded = false,
  initialEditorOpen = false,
  onClose,
  onSaved,
  onRecord,
  onLayoutChange,
}: Props) {
  const [templates, setTemplates] = useState<MatchReviewTemplate[]>([]);
  const [activeId, setActiveId] = useState("");
  const [editing, setEditing] = useState(initialEditorOpen || !embedded);
  const [selected, setSelected] = useState<string | null>(null);
  const [controlId, setControlId] = useState<string | null>(null);
  const [events, setEvents] = useState<MatchReviewEvent[]>([]);
  const [playerId, setPlayerId] = useState("");
  const [context, setContext] = useState<"attaque" | "defense" | null>(null);
  const [shotType, setShotType] = useState<"2PTS" | "3PTS">("2PTS");
  const [shotZoneId, setShotZoneId] = useState<string | null>(null);
  const [point, setPoint] = useState<{ x: number; y: number } | null>(null);
  const [draft, setDraft] = useState<{
    blockId: string;
    controlId: string;
    value: string | number;
    time: number | null;
  } | null>(null);
  const [comment, setComment] = useState("");
  const [message, setMessage] = useState("");
  const [dirty, setDirty] = useState(false);
  const [tab, setTab] = useState<"history" | "timeline">("history");
  const [ready, setReady] = useState(false);
  const [addMenu, setAddMenu] = useState(false);
  const [past, setPast] = useState<MatchReviewTemplate[][]>([]);
  const [future, setFuture] = useState<MatchReviewTemplate[][]>([]);
  const canvas = useRef<HTMLDivElement>(null);
  const origin = useRef(uid());
  const gesture = useRef<{
    id: string;
    mode: "move" | "resize";
    startX: number;
    startY: number;
    scale: number;
    frame: ReturnType<typeof frameOf>;
  } | null>(null);
  useEffect(() => {
    const saved = safeParseTemplates();
    const next = saved.length ? saved : [blankTemplate()];
    setTemplates(next);
    setActiveId(storageGet(ACTIVE_TEMPLATE_STORAGE) || next[0].id);
    setReady(true);
  }, []);
  useEffect(() => {
    setDraft(null);
    setPlayerId("");
    setPoint(null);
    setShotZoneId(null);
    try {
      const saved = JSON.parse(
        storageGet(`${EVENT_STORAGE_PREFIX}${projectId}`) || "[]",
      );
      setEvents(Array.isArray(saved) ? saved : []);
    } catch {
      setEvents([]);
    }
  }, [projectId]);
  const active = templates.find((t) => t.id === activeId) || templates[0];
  useEffect(() => {
    if (active) onLayoutChange?.({ ...active.layout, showVideo: true });
  }, [active?.id, onLayoutChange]);
  useEffect(() => {
    const sync = (event: Event) => {
      const data = (event as CustomEvent).detail;
      if (
        data?.origin !== origin.current &&
        !dirty &&
        Array.isArray(data?.templates)
      ) {
        setTemplates(data.templates);
        setActiveId(data.activeId);
      }
    };
    window.addEventListener("mybasket:mon-mode-saved", sync);
    return () => window.removeEventListener("mybasket:mon-mode-saved", sync);
  }, [dirty]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const change = (
    updater: (t: MatchReviewTemplate) => MatchReviewTemplate,
    checkpoint = true,
  ) => {
    if (!active) return;
    if (checkpoint) {
      setPast((p) => [...p.slice(-29), templates]);
      setFuture([]);
    }
    setTemplates((current) =>
      current.map((t) =>
        t.id === active.id
          ? { ...updater(t), updatedAt: new Date().toISOString() }
          : t,
      ),
    );
    setDirty(true);
    setMessage("");
  };
  const patchBlock = (
    id: string,
    patch: Partial<MatchReviewBlock>,
    checkpoint = true,
  ) =>
    change(
      (t) => ({
        ...t,
        blocks: t.blocks.map((b) => (b.id === id ? { ...b, ...patch } : b)),
      }),
      checkpoint,
    );
  const patchControl = (patch: Partial<MatchReviewControl>) => {
    if (!selected || !controlId) return;
    change((t) => ({
      ...t,
      blocks: t.blocks.map((b) =>
        b.id === selected
          ? {
              ...b,
              controls: b.controls.map((c) =>
                c.id === controlId ? { ...c, ...patch } : c,
              ),
            }
          : b,
      ),
    }));
  };
  const save = () => {
    if (!active.name.trim()) {
      setMessage("Donnez un nom à votre fenêtre avant de l’enregistrer.");
      return;
    }
    try {
      window.localStorage.setItem(TEMPLATE_STORAGE, JSON.stringify(templates));
      if (
        window.localStorage.getItem(TEMPLATE_STORAGE) !==
        JSON.stringify(templates)
      )
        throw new Error("storage verification");
      window.localStorage.setItem(ACTIVE_TEMPLATE_STORAGE, active.id);
      setDirty(false);
      setMessage("Fenêtre enregistrée dans ce navigateur ✓");
      window.dispatchEvent(
        new CustomEvent("mybasket:mon-mode-saved", {
          detail: { origin: origin.current, templates, activeId: active.id },
        }),
      );
      onSaved?.(active.id);
    } catch {
      setMessage(
        "Enregistrement impossible : espace de stockage indisponible. Vos modifications restent ouvertes.",
      );
    }
  };
  const addBlock = (
    kind: MatchReviewBlock["kind"] = "buttons",
    preset?: PresetBlock,
  ) => {
    const bottom = active.blocks.reduce(
      (max, b, i) => Math.max(max, frameOf(b, i).y + frameOf(b, i).height),
      0,
    );
    const b: MatchReviewBlock = {
      id: uid(),
      title:
        preset?.label ||
        {
          players: "Joueurs",
          "shot-chart": "Shot chart",
          context: "Contexte",
          buttons: "Nouveau bloc",
        }[kind!],
      kind,
      color: preset?.color || "#861b3a",
      columns: 2,
      controls: preset
        ? preset.controls.map(clonePresetControl)
        : kind === "buttons"
          ? [freshControl()]
          : [],
      frame: {
        x: 0,
        y: bottom ? bottom + 16 : 0,
        width: 460,
        height: kind === "shot-chart" ? 360 : 250,
      },
    };
    change((t) => ({ ...t, blocks: [...t.blocks, b] }));
    setSelected(b.id);
    setControlId(null);
    setAddMenu(false);
  };
  const begin = (
    block: MatchReviewBlock,
    control: MatchReviewControl,
    value?: string | number,
  ) => {
    if (editing) {
      setSelected(block.id);
      setControlId(control.id);
      return;
    }
    setDraft({
      blockId: block.id,
      controlId: control.id,
      value:
        value ??
        (control.type === "text" || control.type === "choice"
          ? ""
          : (control.value ?? 1)),
      time: getVideoTime?.() ?? null,
    });
    setComment("");
    setMessage("");
  };
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (
        editing ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        /INPUT|SELECT|TEXTAREA/.test((event.target as HTMLElement)?.tagName) ||
        (event.target as HTMLElement)?.isContentEditable
      )
        return;
      const matches =
        active?.blocks.flatMap((b) =>
          b.controls
            .filter(
              (c) => c.shortcut?.toLowerCase() === event.key.toLowerCase(),
            )
            .map((c) => ({ b, c })),
        ) || [];
      if (matches.length === 1) {
        event.preventDefault();
        begin(matches[0].b, matches[0].c);
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [active, editing, getVideoTime]);
  const record = () => {
    const b = active.blocks.find((b) => b.id === draft?.blockId),
      c = b?.controls.find((c) => c.id === draft?.controlId);
    if (!b || !c || !draft) return;
    if (c.requirePlayer && !playerId) {
      setMessage("Sélectionnez un joueur.");
      return;
    }
    if (c.requireComment && !comment.trim()) {
      setMessage("Renseignez un commentaire.");
      return;
    }
    if (draft.value === "") {
      setMessage("Renseignez le résultat ou le texte.");
      return;
    }
    const player = players.find((p) => p.id === playerId);
    const event: MatchReviewEvent = {
      id: uid(),
      templateId: active.id,
      templateName: active.name,
      blockId: b.id,
      blockTitle: b.title,
      controlId: c.id,
      controlLabel: c.label,
      controlType: c.type,
      value: draft.value,
      playerId: player?.id || null,
      playerName: player?.name || null,
      comment: comment.trim(),
      createClip: !!c.createClip,
      preRoll: Math.max(0, c.preRoll || 0),
      postRoll: Math.max(0, c.postRoll || 0),
      videoTime: draft.time,
      createdAt: new Date().toISOString(),
      context,
      shotPosition: point,
      shotZoneId: point ? shotZoneId : null,
      shotType: point ? shotType : null,
    };
    const next = [event, ...events];
    try {
      if (projectId)
        window.localStorage.setItem(
          `${EVENT_STORAGE_PREFIX}${projectId}`,
          JSON.stringify(next),
        );
    } catch {
      setMessage("Saisie non enregistrée : stockage indisponible.");
      return;
    }
    setEvents(next);
    onRecord?.(event);
    setDraft(null);
    setPoint(null);
    setShotZoneId(null);
    setComment("");
    setMessage("Action personnalisée enregistrée ✓");
  };
  const startGesture = (
    e: ReactPointerEvent<HTMLElement>,
    b: MatchReviewBlock,
    index: number,
    mode: "move" | "resize",
  ) => {
    if (!editing || !canvas.current || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    setSelected(b.id);
    setControlId(null);
    setPast((p) => [...p.slice(-29), templates]);
    setFuture([]);
    gesture.current = {
      id: b.id,
      mode,
      startX: e.clientX,
      startY: e.clientY,
      scale: 960 / canvas.current.getBoundingClientRect().width,
      frame: frameOf(b, index),
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const moveGesture = (e: ReactPointerEvent<HTMLElement>) => {
    const g = gesture.current;
    if (!g) return;
    const dx = Math.round(((e.clientX - g.startX) * g.scale) / 8) * 8,
      dy = Math.round((e.clientY - g.startY) / 8) * 8;
    const f =
      g.mode === "move"
        ? {
            ...g.frame,
            x: bounded(g.frame.x + dx, 0, 960 - g.frame.width),
            y: Math.max(0, g.frame.y + dy),
          }
        : {
            ...g.frame,
            width: bounded(g.frame.width + dx, 200, 960 - g.frame.x),
            height: bounded(g.frame.height + dy, 130, 1200),
          };
    patchBlock(g.id, { frame: f }, false);
  };
  const stopGesture = () => {
    gesture.current = null;
  };
  if (!ready || !active)
    return <div className={styles.board}>Chargement de Mon mode…</div>;
  const block = active.blocks.find((b) => b.id === selected),
    control = block?.controls.find((c) => c.id === controlId);
  const draftBlock = active.blocks.find((b) => b.id === draft?.blockId),
    draftControl = draftBlock?.controls.find((c) => c.id === draft?.controlId);
  const maxY = Math.max(
    500,
    ...active.blocks.map((b, i) => frameOf(b, i).y + frameOf(b, i).height + 24),
  );
  const updateFrame = (patch: Partial<ReturnType<typeof frameOf>>) => {
    if (!block) return;
    const f = { ...frameOf(block, active.blocks.indexOf(block)), ...patch };
    f.width = bounded(f.width, 200, 960);
    f.x = bounded(f.x, 0, 960 - f.width);
    f.y = Math.max(0, f.y);
    f.height = bounded(f.height, 130, 1200);
    patchBlock(block.id, { frame: f });
  };
  const content = (
    <div className={embedded ? styles.board : styles.overlay}>
      <div
        className={embedded ? "" : styles.dialog}
        role={embedded ? undefined : "dialog"}
        aria-label="Constructeur Mon mode"
        aria-modal={embedded ? undefined : true}
      >
        <div className={styles.top}>
          <div>
            <b>Mon mode · Fenêtre de codification</b>
            {message && (
              <span role="status" className={styles.saveNotice}>
                {message}
              </span>
            )}
            <small>
              {dirty
                ? "● Modifications non enregistrées"
                : "Tableau libre · sans codage guidé"}
            </small>
          </div>
          <label className={styles.windowName}>
            Nom de la fenêtre
            <input
              aria-label="Nom de la fenêtre"
              value={active.name}
              onChange={(e) => change((t) => ({ ...t, name: e.target.value }))}
            />
          </label>
          <select
            aria-label="Choisir une fenêtre"
            value={active.id}
            onChange={(e) => {
              if (
                dirty &&
                !window.confirm(
                  "Changer de fenêtre ? Les modifications restent en mémoire jusqu’à Enregistrer.",
                )
              )
                return;
              setActiveId(e.target.value);
              setSelected(null);
              setControlId(null);
              setDraft(null);
            }}
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button aria-pressed={editing} onClick={() => setEditing(!editing)}>
            {editing ? "Utiliser" : "Modifier"}
          </button>
          <button className={styles.primary} onClick={save}>
            Enregistrer
          </button>
          {!embedded && (
            <button
              aria-label="Fermer le constructeur"
              onClick={() => {
                if (
                  !dirty ||
                  window.confirm("Fermer sans enregistrer les modifications ?")
                )
                  onClose?.();
              }}
            >
              ×
            </button>
          )}
        </div>
        {editing && (
          <div className={styles.toolbar}>
            <div className={styles.menuWrap}>
              <button onClick={() => setAddMenu(!addMenu)}>＋ Bloc ▾</button>
              {addMenu && (
                <div className={styles.menu}>
                  <button onClick={() => addBlock()}>Bloc personnalisé</button>
                  <button onClick={() => addBlock("players")}>
                    Joueurs du match
                  </button>
                  <button onClick={() => addBlock("shot-chart")}>
                    Shot chart
                  </button>
                  <button onClick={() => addBlock("context")}>
                    Attaque / Défense
                  </button>
                  {PRESET_BLOCKS.map((p) => (
                    <button key={p.key} onClick={() => addBlock("buttons", p)}>
                      {p.icon} {p.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              disabled={!block || (block.kind && block.kind !== "buttons")}
              onClick={() => {
                if (!block) return;
                const c = freshControl();
                patchBlock(block.id, { controls: [...block.controls, c] });
                setControlId(c.id);
              }}
            >
              ＋ Bouton
            </button>
            <button
              disabled={!past.length}
              aria-label="Annuler la modification"
              onClick={() => {
                setFuture((f) => [templates, ...f]);
                setTemplates(past[past.length - 1]);
                setPast((p) => p.slice(0, -1));
                setDirty(true);
              }}
            >
              ↶
            </button>
            <button
              disabled={!future.length}
              aria-label="Rétablir la modification"
              onClick={() => {
                setPast((p) => [...p, templates]);
                setTemplates(future[0]);
                setFuture((f) => f.slice(1));
                setDirty(true);
              }}
            >
              ↷
            </button>
            <button
              onClick={() => {
                const t = blankTemplate();
                setTemplates((v) => [...v, t]);
                setActiveId(t.id);
                setSelected(null);
                setDirty(true);
              }}
            >
              Nouvelle fenêtre
            </button>
            <button
              onClick={() => {
                const copy = {
                  ...active,
                  id: uid(),
                  name: active.name + " — copie",
                  blocks: active.blocks.map((b) => ({
                    ...b,
                    id: uid(),
                    controls: b.controls.map((c) => ({ ...c, id: uid() })),
                  })),
                };
                setTemplates((t) => [...t, copy]);
                setActiveId(copy.id);
                setSelected(null);
                setDirty(true);
              }}
            >
              Dupliquer
            </button>
            <button
              onClick={() => {
                if (
                  !window.confirm(
                    `Supprimer la fenêtre « ${active.name} » ? Les actions existantes sont conservées.`,
                  )
                )
                  return;
                setPast((p) => [...p, templates]);
                setFuture([]);
                const remaining = templates.filter((t) => t.id !== active.id);
                const next = remaining.length ? remaining : [blankTemplate()];
                setTemplates(next);
                setActiveId(next[0].id);
                setSelected(null);
                setControlId(null);
                setDirty(true);
              }}
            >
              Supprimer la fenêtre
            </button>
            <span>Déplacez les blocs par leur poignée ⋮⋮</span>
          </div>
        )}
        <div className={styles.workspace}>
          <div className={styles.canvas} ref={canvas} style={{ height: maxY }}>
            {!active.blocks.length && (
              <button
                className={styles.empty}
                onClick={() => {
                  setEditing(true);
                  setAddMenu(true);
                }}
              >
                ＋ Ajouter mon premier bloc
                <small>Joueurs, shot chart ou boutons personnalisés</small>
              </button>
            )}
            {active.blocks.map((b, i) => {
              const f = frameOf(b, i);
              return (
                <section
                  key={b.id}
                  className={`${styles.block} ${editing && selected === b.id ? styles.selected : ""}`}
                  style={{
                    left: `${f.x / 9.6}%`,
                    top: f.y,
                    width: `${f.width / 9.6}%`,
                    height: f.height,
                    borderColor: b.color,
                  }}
                >
                  <div
                    className={styles.blockHead}
                    style={{ background: `${normalizeHex(b.color)}25` }}
                  >
                    <button
                      className={styles.grip}
                      aria-label={`Déplacer ${b.title}`}
                      disabled={!editing}
                      onPointerDown={(e) => startGesture(e, b, i, "move")}
                      onPointerMove={moveGesture}
                      onPointerUp={stopGesture}
                      onPointerCancel={stopGesture}
                    >
                      ⋮⋮
                    </button>
                    <button
                      className={styles.blockTitle}
                      onClick={() => {
                        if (editing) {
                          setSelected(b.id);
                          setControlId(null);
                        }
                      }}
                    >
                      {b.title}
                    </button>
                    {editing && (
                      <button
                        aria-label={`Configurer ${b.title}`}
                        onClick={() => {
                          setSelected(b.id);
                          setControlId(null);
                        }}
                      >
                        ⚙
                      </button>
                    )}
                  </div>
                  <div
                    className={`${styles.blockBody} ${b.kind === "shot-chart" ? styles.shotBody : ""}`}
                  >
                    {b.kind === "players" ? (
                      <div
                        className={styles.controls}
                        style={{
                          gridTemplateColumns: `repeat(${b.columns},minmax(0,1fr))`,
                        }}
                      >
                        <button
                          aria-pressed={!playerId}
                          onClick={() => setPlayerId("")}
                        >
                          Équipe
                        </button>
                        {players.map((p) => (
                          <button
                            aria-pressed={playerId === p.id}
                            key={p.id}
                            onClick={() => setPlayerId(p.id)}
                          >
                            #{p.num ?? "–"} {p.name}
                          </button>
                        ))}
                        {!players.length && (
                          <small>Les joueurs du match apparaîtront ici.</small>
                        )}
                      </div>
                    ) : b.kind === "context" ? (
                      <div className={styles.controls}>
                        <button
                          aria-pressed={context === "attaque"}
                          onClick={() => setContext("attaque")}
                        >
                          Attaque
                        </button>
                        <button
                          aria-pressed={context === "defense"}
                          onClick={() => setContext("defense")}
                        >
                          Défense
                        </button>
                      </div>
                    ) : b.kind === "shot-chart" ? (
                      <>
                        {!editing && (
                          <div
                            className={styles.variants}
                            aria-label="Type de tir"
                          >
                            <button
                              type="button"
                              aria-pressed={shotType === "2PTS"}
                              onClick={() => {
                                setShotType("2PTS");
                                setPoint(null);
                                setShotZoneId(null);
                              }}
                            >
                              2 PTS
                            </button>
                            <button
                              type="button"
                              aria-pressed={shotType === "3PTS"}
                              onClick={() => {
                                setShotType("3PTS");
                                setPoint(null);
                                setShotZoneId(null);
                              }}
                            >
                              3 PTS
                            </button>
                          </div>
                        )}
                        <div className={styles.sharedCourt}>
                          {editing ? (
                            <ShotChart
                              mode="analysis"
                              size="lg"
                              shots={[]}
                              showStats={false}
                              showLabels={false}
                              showDots={false}
                            />
                          ) : (
                            <ShotChart
                              mode="pick"
                              size="lg"
                              shotType={shotType}
                              locked={editing}
                              selectedZone={shotZoneId}
                              pendingPoint={
                                point
                                  ? { x: point.x * 100, y: point.y * 100 }
                                  : null
                              }
                              showLabels={false}
                              onPick={(zone, position) => {
                                setShotZoneId(zone.id);
                                setPoint({
                                  x: position.x / 100,
                                  y: position.y / 100,
                                });
                              }}
                            />
                          )}
                        </div>
                        {point && !editing && (
                          <button onClick={() => setPoint(null)}>
                            Effacer la position
                          </button>
                        )}
                      </>
                    ) : (
                      <div
                        className={`${styles.controls} ${styles[b.buttonSize || "normal"]}`}
                        style={{
                          gridTemplateColumns: `repeat(${b.columns},minmax(0,1fr))`,
                        }}
                      >
                        {b.controls.map((c) => (
                          <div key={c.id} className={styles.control}>
                            <button
                              style={{
                                borderColor: c.color,
                                background: `${normalizeHex(c.color)}22`,
                              }}
                              aria-pressed={
                                editing
                                  ? controlId === c.id
                                  : draft?.controlId === c.id
                              }
                              onClick={() => begin(b, c)}
                            >
                              {c.label}
                              {c.shortcut && <kbd>{c.shortcut}</kbd>}
                            </button>
                            {!editing && c.type === "plus-minus" && (
                              <div className={styles.variants}>
                                <button onClick={() => begin(b, c, -1)}>
                                  −
                                </button>
                                <button onClick={() => begin(b, c, 1)}>
                                  ＋
                                </button>
                              </div>
                            )}
                            {!editing && c.type === "rating" && (
                              <div className={styles.variants}>
                                {[1, 2, 3, 4, 5].map((n) => (
                                  <button
                                    key={n}
                                    onClick={() => begin(b, c, n)}
                                  >
                                    {n}
                                  </button>
                                ))}
                              </div>
                            )}
                            {!editing && c.type === "choice" && (
                              <div className={styles.variants}>
                                {c.options?.map((o) => (
                                  <button
                                    key={o}
                                    onClick={() => begin(b, c, o)}
                                  >
                                    {o}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        ))}
                        {!b.controls.length && (
                          <small>
                            Utilisez « ＋ Bouton » pour remplir ce bloc.
                          </small>
                        )}
                      </div>
                    )}
                  </div>
                  {editing && (
                    <button
                      className={styles.resize}
                      aria-label={`Redimensionner ${b.title}`}
                      onPointerDown={(e) => startGesture(e, b, i, "resize")}
                      onPointerMove={moveGesture}
                      onPointerUp={stopGesture}
                      onPointerCancel={stopGesture}
                    >
                      ◢
                    </button>
                  )}
                </section>
              );
            })}
          </div>
          {editing && block && (
            <aside className={styles.inspector}>
              <div className={styles.inspectorHead}>
                <b>{control ? "Propriétés du bouton" : "Propriétés du bloc"}</b>
                <button
                  aria-label="Fermer les propriétés"
                  onClick={() => {
                    setSelected(null);
                    setControlId(null);
                  }}
                >
                  ×
                </button>
              </div>
              <label>
                Nom
                <input
                  value={control?.label ?? block.title}
                  onChange={(e) =>
                    control
                      ? patchControl({ label: e.target.value })
                      : patchBlock(block.id, { title: e.target.value })
                  }
                />
              </label>
              {control ? (
                <>
                  <label>
                    Type
                    <select
                      value={control.type}
                      onChange={(e) =>
                        patchControl({
                          type: e.target.value as MatchReviewControlType,
                        })
                      }
                    >
                      {Object.entries(typeLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Raccourci
                    <input
                      maxLength={1}
                      value={control.shortcut || ""}
                      onChange={(e) =>
                        patchControl({ shortcut: e.target.value })
                      }
                    />
                  </label>
                  {control.type === "choice" && (
                    <label>
                      Choix (un par ligne)
                      <textarea
                        value={control.options?.join("\n") || ""}
                        onChange={(e) =>
                          patchControl({ options: e.target.value.split("\n") })
                        }
                      />
                    </label>
                  )}
                  <label>
                    <input
                      type="checkbox"
                      checked={!!control.requirePlayer}
                      onChange={(e) =>
                        patchControl({ requirePlayer: e.target.checked })
                      }
                    />{" "}
                    Joueur obligatoire
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!control.requireComment}
                      onChange={(e) =>
                        patchControl({ requireComment: e.target.checked })
                      }
                    />{" "}
                    Commentaire obligatoire
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={!!control.createClip}
                      onChange={(e) =>
                        patchControl({ createClip: e.target.checked })
                      }
                    />{" "}
                    Marquer un clip vidéo
                  </label>
                  {control.createClip && (
                    <div className={styles.two}>
                      <label>
                        Avant (s)
                        <input
                          type="number"
                          min="0"
                          max="600"
                          value={control.preRoll ?? 4}
                          onChange={(e) =>
                            patchControl({
                              preRoll: bounded(Number(e.target.value), 0, 600),
                            })
                          }
                        />
                      </label>
                      <label>
                        Après (s)
                        <input
                          type="number"
                          min="0"
                          max="600"
                          value={control.postRoll ?? 4}
                          onChange={(e) =>
                            patchControl({
                              postRoll: bounded(Number(e.target.value), 0, 600),
                            })
                          }
                        />
                      </label>
                    </div>
                  )}
                  <small>
                    Événement personnalisé : ce bouton ne modifie pas le score
                    officiel.
                  </small>
                  <button
                    onClick={() => {
                      const idx = block.controls.findIndex(
                        (c) => c.id === control.id,
                      );
                      if (idx < 1) return;
                      const controls = block.controls.slice();
                      [controls[idx - 1], controls[idx]] = [
                        controls[idx],
                        controls[idx - 1],
                      ];
                      patchBlock(block.id, { controls });
                    }}
                  >
                    ← Déplacer avant
                  </button>
                  <button
                    onClick={() => {
                      const idx = block.controls.findIndex(
                        (c) => c.id === control.id,
                      );
                      if (idx >= block.controls.length - 1) return;
                      const controls = block.controls.slice();
                      [controls[idx + 1], controls[idx]] = [
                        controls[idx],
                        controls[idx + 1],
                      ];
                      patchBlock(block.id, { controls });
                    }}
                  >
                    Déplacer après →
                  </button>
                  <button
                    onClick={() => {
                      if (
                        window.confirm("Supprimer ce bouton de la fenêtre ?")
                      ) {
                        patchBlock(block.id, {
                          controls: block.controls.filter(
                            (c) => c.id !== control.id,
                          ),
                        });
                        setControlId(null);
                      }
                    }}
                  >
                    Supprimer le bouton
                  </button>
                </>
              ) : (
                <>
                  <span>Taille du bloc</span>
                  <div className={styles.variants}>
                    {[
                      ["Petit", 300, 180],
                      ["Moyen", 460, 250],
                      ["Grand", 720, 380],
                    ].map(([label, w, h]) => (
                      <button
                        key={String(label)}
                        onClick={() =>
                          updateFrame({ width: Number(w), height: Number(h) })
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <div className={styles.two}>
                    <label>
                      Largeur
                      <input
                        aria-label="Largeur du bloc"
                        type="number"
                        min="200"
                        max="960"
                        value={
                          frameOf(block, active.blocks.indexOf(block)).width
                        }
                        onChange={(e) =>
                          updateFrame({ width: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Hauteur
                      <input
                        aria-label="Hauteur du bloc"
                        type="number"
                        min="130"
                        max="1200"
                        value={
                          frameOf(block, active.blocks.indexOf(block)).height
                        }
                        onChange={(e) =>
                          updateFrame({ height: Number(e.target.value) })
                        }
                      />
                    </label>
                  </div>
                  <div className={styles.two}>
                    <label>
                      Position X
                      <input
                        type="number"
                        min="0"
                        value={frameOf(block, active.blocks.indexOf(block)).x}
                        onChange={(e) =>
                          updateFrame({ x: Number(e.target.value) })
                        }
                      />
                    </label>
                    <label>
                      Position Y
                      <input
                        type="number"
                        min="0"
                        value={frameOf(block, active.blocks.indexOf(block)).y}
                        onChange={(e) =>
                          updateFrame({ y: Number(e.target.value) })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Taille des boutons
                    <select
                      value={block.buttonSize || "normal"}
                      onChange={(e) =>
                        patchBlock(block.id, {
                          buttonSize: e.target
                            .value as MatchReviewBlock["buttonSize"],
                        })
                      }
                    >
                      <option value="compact">Compact</option>
                      <option value="normal">Normal</option>
                      <option value="large">Grand</option>
                    </select>
                  </label>
                  <label>
                    Colonnes
                    <select
                      value={block.columns}
                      onChange={(e) =>
                        patchBlock(block.id, {
                          columns: Number(
                            e.target.value,
                          ) as MatchReviewBlock["columns"],
                        })
                      }
                    >
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n}>{n}</option>
                      ))}
                    </select>
                  </label>
                  <button
                    onClick={() => {
                      if (window.confirm("Supprimer ce bloc de la fenêtre ?")) {
                        change((t) => ({
                          ...t,
                          blocks: t.blocks.filter((b) => b.id !== block.id),
                        }));
                        setSelected(null);
                      }
                    }}
                  >
                    Supprimer le bloc
                  </button>
                </>
              )}
              <label>
                Couleur
                <input
                  type="color"
                  value={normalizeHex(control?.color || block.color)}
                  onChange={(e) =>
                    control
                      ? patchControl({ color: e.target.value })
                      : patchBlock(block.id, { color: e.target.value })
                  }
                />
              </label>
            </aside>
          )}
        </div>
        {!editing && (
          <div className={styles.composer}>
            <b>
              {draftControl
                ? `${draftBlock?.title} · ${draftControl.label}`
                : "Sélectionnez un bouton pour préparer une action"}
            </b>
            <div className={styles.two}>
              <label>
                Joueur
                <select
                  value={playerId}
                  onChange={(e) => setPlayerId(e.target.value)}
                >
                  <option value="">Équipe / sans joueur</option>
                  {players.map((p) => (
                    <option key={p.id} value={p.id}>
                      #{p.num ?? "–"} {p.name}
                    </option>
                  ))}
                </select>
              </label>
              {draft && (
                <label>
                  Valeur
                  <input
                    type={
                      draftControl?.type === "text" ||
                      draftControl?.type === "choice"
                        ? "text"
                        : "number"
                    }
                    value={draft.value}
                    onChange={(e) =>
                      setDraft({ ...draft, value: e.target.value })
                    }
                  />
                </label>
              )}
            </div>
            {draft && (
              <>
                <label>
                  Commentaire
                  <input
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                  />
                </label>
                <small>
                  {context || "Sans contexte"} ·{" "}
                  {point
                    ? "Position de tir renseignée"
                    : "Sans position de tir"}{" "}
                  ·{" "}
                  {draft.time == null
                    ? "Sans timecode vidéo"
                    : `${draft.time.toFixed(1)} s`}
                </small>
                <div className={styles.variants}>
                  <button
                    onClick={() => {
                      setDraft(null);
                      setPoint(null);
                      setShotZoneId(null);
                      setComment("");
                    }}
                  >
                    Annuler la saisie
                  </button>
                  <button className={styles.primary} onClick={record}>
                    Enregistrer l’action
                  </button>
                </div>
              </>
            )}
          </div>
        )}
        <p role="status" className={styles.status}>
          {message ||
            (editing
              ? "Position et taille libres · Enregistrer pour conserver votre fenêtre."
              : "Les saisies restent liées au projet courant.")}
        </p>
        {!!events.length && (
          <div className={styles.history}>
            <div className={styles.variants}>
              <button
                aria-pressed={tab === "history"}
                onClick={() => setTab("history")}
              >
                Historique · {events.length}
              </button>
              <button
                aria-pressed={tab === "timeline"}
                onClick={() => setTab("timeline")}
              >
                Timeline des saisies
              </button>
            </div>
            {tab === "timeline" && (
              <div className={styles.timeline}>
                {events
                  .slice()
                  .reverse()
                  .map((event) => (
                    <button
                      key={event.id}
                      disabled={event.videoTime == null || !onSeek}
                      title={`${event.controlLabel} · ${event.videoTime?.toFixed(1) ?? "–"} s`}
                      onClick={() =>
                        onSeek?.(
                          Math.max(0, (event.videoTime || 0) - event.preRoll),
                        )
                      }
                    >
                      {event.controlLabel}
                    </button>
                  ))}
              </div>
            )}
            {events.slice(0, 20).map((event) => (
              <button
                className={styles.event}
                key={event.id}
                disabled={event.videoTime == null || !onSeek}
                onClick={() =>
                  onSeek?.(Math.max(0, (event.videoTime || 0) - event.preRoll))
                }
              >
                <span>
                  {event.videoTime == null
                    ? "—"
                    : `${event.videoTime.toFixed(1)} s`}
                </span>
                <b>{event.controlLabel}</b>
                <span>{event.playerName || "Équipe"}</span>
                <span>{event.value}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
  return embedded ? content : createPortal(content, document.body);
}
