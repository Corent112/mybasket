"use client";

/**
 * GamePlanModule — Game Plan complet (Mon compte › Management).
 *
 * Fusion des deux pistes (version claire intégrée + version "pro") :
 *  - onglets Systèmes / Scout adverse / Rotation
 *  - scouting structuré (forces, faiblesses, joueurs clés en lignes, plan défensif)
 *  - cartes d'action (Playbook / Bibliothèque / Plaquette)
 *  - export PDF A4 recto/verso (window.print via fenêtre dédiée)
 *  - persistance Supabase `management_gameplans` (scouting + library_systems + drawings en jsonb)
 *
 * Corrections opérationnelles importantes :
 *  1. AUTOSAVE débordé (debounce 800 ms) sur TOUS les champs + garde `dirtyRef` :
 *     le rechargement au focus NE peut plus écraser une saisie en cours.
 *  2. `createClient` mémoïsé (plus de client recréé à chaque render → plus de boucle d'effet).
 *  3. `visibilitychange` écouté sur `document` (et non `window`) avec cleanup symétrique.
 *  4. "Créer un match" écrit dans `mybasket_calendar_events` (le store que lit Mon Calendrier),
 *     donc le match apparaît vraiment dans le calendrier.
 *  5. Joueurs clés en lignes structurées (fini le parsing fragile sur "—").
 *  6. Persistance homogène : systèmes, dessins ET textes passent tous par l'autosave.
 *
 * NB : si la couche Supabase n'est pas prête, l'écran reste utilisable (l'état React
 * est la source de vérité ; les writes échouent silencieusement en console).
 * À CONFIRMER : noms de colonnes `management_gameplans` (cf. writeGP) et clés d'un
 * évènement de `mybasket_calendar_events` (cf. createMatchEvent) selon ton Calendrier.tsx.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  ReactNode,
  MouseEvent as ReactMouseEvent,
  TouchEvent as ReactTouchEvent,
} from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getTeams } from "@/lib/equipes-store";
import GamePlanScoutingDataPicker, { type ScoutImportItem } from "./GamePlanScoutingDataPicker";
import GamePlanMontage, { type GamePlanMontageItem } from "./GamePlanMontage";
import { loadMatchAnalysis, loadOfficialTeamMatches } from "@/lib/analytics/load-matches";
import { loadLnbTeamStatistics } from "@/lib/lnb-statistics-client";
import { fillLnbIdentity } from "@/lib/lnb-statistics-model";
import { SCOUTING_SHOT_COURT, scoutingPlayerShotZones, scoutingShotsByPlayer } from "@/lib/scouting-player-shots";
import { COURT_H, COURT_W } from "@/lib/shot-chart-zones";
import { compactPlayerMetrics, shotSplit, codedPlayerStats, officialPlayerStats, scoutingTeamStats, scoutingTeamForm, teamMetrics, formatScoutingStat } from "@/lib/scouting-report-stats";
import { scoutingHighlights, highlightColors } from "@/lib/scouting-highlights";
import { scoutingProfileIcon, scoutingProfileLabel } from "@/lib/scouting-profiles";
import { scoutingColors } from "@/lib/scouting-colors";
import { courtDiagramLayout, drawCourtDiagram, scoutingCourtsPerRow } from "@/lib/pdf-court-diagrams";
import GamePlanScoutingBoard, { scoutingPlayerNoteFields, type ScoutBoardValue } from "./GamePlanScoutingBoard";

/* =============================== Stores ================================ */

const K_SEL = "mybasket_management_team";
const K_ROT = "mybasket_management_rotation";
const K_CAL = "mybasket_calendar_events";
const K_PLQ_RESULT = "mybasket_plaquette_result"; // image renvoyée par la Plaquette
const K_PENDING = "mybasket_gameplan_pending_system"; // {section, teamId} posé avant d'aller dessiner
const K_SELECTED_SYSTEM = "mybasket_gameplan_selected_system"; // posé par /systemes quand on sélectionne un système

function lsGet<T = unknown>(key: string): T | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}
function lsSet(key: string, val: unknown) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(val));
  } catch {}
}
function newId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  } catch {}
  return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/* =============================== Types ================================= */

type Player = {
  id: string;
  firstName?: string;
  lastName?: string;
  num?: string | number;
  poste?: string;
  photo?: string;
  posteSecondaire?: string;
  taille?: string;
  mainDominante?: string;
};
type Team = {
  id: string;
  name?: string;
  cat?: string;
  logo?: string;
  players?: Player[];
  teamType?: string;
  competitionSource?:string;
  couleurs?: string[];
  kind?: string;
  isScoutTeam?: boolean;
  scout?: boolean;
};

type Drawing = { name: string; dataUrl: string };
type Section = "blob" | "slob" | "end" | "scout";

type ScoutPlayer = { name: string; role: string };

type Scouting = {
  team: string;
  coach: string;
  style: string;
  strengths: string;
  weaknesses: string;
  keyPlayers: ScoutPlayer[];
  watch: string;
  defensivePlan: string;
  imports?: ScoutImportItem[];
  montage?: GamePlanMontageItem[];
  scoutTeamId?: string;
  identity?: string;
  offensiveKeys?: string;
  defensiveKeys?: string;
  teamStats?: Record<string,number|null>;
  teamStatColors?: ScoutBoardValue["teamStatColors"];
  printCompetitionRanks?: boolean;
  hiddenPdfTeamStats?: ScoutBoardValue["hiddenPdfTeamStats"];
  hiddenPdfTeamSections?: ScoutBoardValue["hiddenPdfTeamSections"];
  offense?: string;
  defense?: string;
  depthChart?: Record<string, string[]>;
  importantStats?: Array<{ id: string; metric: string; limit: number }>;
  playerCards?: ScoutBoardValue["playerCards"];
  printPlayerIds?: string[];
  playNotes?: ScoutBoardValue["playNotes"];
  topPlaysCourtsPerRow?: ScoutBoardValue["topPlaysCourtsPerRow"];
  highlightSide?: ScoutBoardValue["highlightSide"];
  highlightMatchIds?: string[];
  highlightNotes?: string;
};

type SystemSection = "offensive" | "scout" | "blob" | "slob" | "end";

type LibrarySystem = {
  id: string;
  source: "playbook" | "bibliotheque" | "quick" | "scouting" | "plaquette";
  section?: SystemSection;
  title: string;
  category?: string;
  objectif?: string;
  schemaImage?: string;
  schemaImages?: string[];
  schemaDataList?: any[];
};

/** Section d'un système (rétro-compat : avant, `source:"scouting"` = section scout). */
function sysSection(s: LibrarySystem): SystemSection {
  return s.section ?? (s.source === "scouting" ? "scout" : "offensive");
}
const SECTION_LABEL: Record<SystemSection, string> = {
  offensive: "Système offensif",
  scout: "Système adverse",
  blob: "BLOB",
  slob: "SLOB",
  end: "Fin de match",
};

type SavedGamePlan = { id: string; title: string; match_date: string | null; updated_at: string };

type GamePlan = {
  savedPlanId?: string;
  opponent: string;
  date: string;
  matchTime: string;
  competition: string;
  calendarEventId: string;
  objective: string;
  keyPlayers: string;
  attackSchemes: string;
  defenseSchemes: string;
  keyPoints: string;
  includeRotation: boolean;
  blob: string;
  slob: string;
  endGameSystems: string;
  scouting: Scouting;
  librarySystems: LibrarySystem[];
  drawings: { blob: Drawing[]; slob: Drawing[]; end: Drawing[]; scout: Drawing[] };
};

type RotSegment = { id: string; playerId: string; qt: number; pos: number; start: number; end: number };
type Rotation = { durations: number[]; segments: RotSegment[] };

const EMPTY_GP: GamePlan = {
  opponent: "",
  date: "",
  matchTime: "",
  competition: "",
  calendarEventId: "",
  objective: "",
  keyPlayers: "",
  attackSchemes: "",
  defenseSchemes: "",
  keyPoints: "",
  includeRotation: false,
  blob: "",
  slob: "",
  endGameSystems: "",
  scouting: { team: "", coach: "", style: "", strengths: "", weaknesses: "", keyPlayers: [], watch: "", defensivePlan: "", imports: [], montage: [] },
  librarySystems: [],
  drawings: { blob: [], slob: [], end: [], scout: [] },
};

const POSTES = ["Meneur", "Arrière", "Ailier", "Ailier fort", "Pivot"];

/* ============================== Helpers =============================== */

function normalizeTeam(row: any): Team {
  return {
    id: String(row?.id ?? ""),
    name: String(row?.name ?? row?.nom ?? row?.teamName ?? "Équipe"),
    cat: String(row?.cat ?? row?.category ?? row?.categorie ?? ""),
    logo: row?.logo ?? row?.logo_url ?? row?.club_logo_url ?? "",
    competitionSource: row?.competitionSource||row?.metadata?.competitionSource,
    couleurs: row?.couleurs ?? row?.metadata?.couleurs,
    teamType: String(row?.teamType ?? row?.team_type ?? row?.type ?? row?.metadata?.teamType ?? ""),
    kind: String(row?.kind ?? row?.metadata?.kind ?? ""),
    isScoutTeam: Boolean(row?.isScoutTeam ?? row?.is_scout_team ?? row?.metadata?.isScoutTeam),
    scout: Boolean(row?.scout ?? row?.metadata?.scout),
    players: ((row?.players ?? row?.joueurs ?? row?.effectif ?? row?.roster ?? []) as any[]).map((p) => ({
      id: String(p?.id ?? p?.playerId ?? ""),
      firstName: p?.firstName ?? p?.prenom ?? (typeof p?.name === "string" ? p.name.split(" ")[0] : "") ?? "",
      lastName: p?.lastName ?? p?.nom ?? (typeof p?.name === "string" ? p.name.split(" ").slice(1).join(" ") : "") ?? "",
      num: p?.num ?? p?.numero ?? p?.number ?? "",
      poste: p?.poste ?? p?.postePrincipal ?? p?.position ?? "",
      photo: p?.photo ?? p?.photo_url ?? p?.avatar ?? "",
      posteSecondaire: p?.posteSecondaire ?? p?.position_secondary ?? "",
      taille: p?.taille ?? p?.height ?? "",
      mainDominante: p?.mainDominante ?? p?.dominant_hand ?? "",
    })),
  };
}

function isScoutTeam(team: Team): boolean {
  const type = String(team.teamType || team.kind || "").toLowerCase();
  return team.isScoutTeam === true || team.scout === true || type === "scout" || type === "scouting" || type === "scouted";
}

function scoutImportKey(item: ScoutImportItem): string {
  const source = String(item.sourceTeamId || "");
  if (item.kind === "player") return `player:${source}:${String(item.playerId || item.title).toLowerCase()}`;
  if (item.kind === "system") return `system:${source}:${String(item.systemName || item.title).toLowerCase()}`;
  if (item.kind === "clip") return `clip:${source}:${(item.matchIds || []).join(",")}:${item.clipStart ?? ""}:${item.clipEnd ?? ""}`;
  return `${item.kind}:${source}:${String(item.title).toLowerCase()}`;
}

async function readTeams(): Promise<Team[]> {
  try {
    const rows = await getTeams();
    return ((rows ?? []) as any[]).map(normalizeTeam).filter((t) => t.id);
  } catch {
    return [];
  }
}

function normalizeGamePlanRow(row: any): GamePlan {
  const drawings = row?.drawings && typeof row.drawings === "object" ? row.drawings : {};
  const scouting = row?.scouting && typeof row.scouting === "object" ? row.scouting : EMPTY_GP.scouting;
  return {
    ...EMPTY_GP,
    savedPlanId: typeof drawings.savedPlanId === "string" ? drawings.savedPlanId : undefined,
    opponent: row?.opponent ?? "",
    date: row?.date ?? "",
    matchTime: row?.match_time ?? "",
    competition: row?.competition ?? "",
    calendarEventId: row?.calendar_event_id ?? "",
    objective: row?.objective ?? "",
    keyPlayers: row?.key_players ?? "",
    attackSchemes: row?.attack_schemes ?? "",
    defenseSchemes: row?.defense_schemes ?? "",
    keyPoints: row?.key_points ?? "",
    includeRotation: Boolean(row?.include_rotation),
    blob: row?.blob ?? "",
    slob: row?.slob ?? "",
    endGameSystems: row?.end_game_systems ?? "",
    scouting: {
      ...EMPTY_GP.scouting,
      ...scouting,
      keyPlayers: Array.isArray(scouting.keyPlayers) ? scouting.keyPlayers : [],
      imports: Array.isArray(scouting.imports) ? scouting.imports : [],
      montage: Array.isArray(scouting.montage) ? scouting.montage : [],
    },
    librarySystems: Array.isArray(row?.library_systems) ? row.library_systems : [],
    drawings: {
      blob: Array.isArray(drawings.blob) ? drawings.blob : [],
      slob: Array.isArray(drawings.slob) ? drawings.slob : [],
      end: Array.isArray(drawings.end) ? drawings.end : [],
      scout: Array.isArray(drawings.scout) ? drawings.scout : [],
    },
  };
}

async function readGP(supabase: ReturnType<typeof createClient>, teamId: string): Promise<GamePlan> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !teamId) return EMPTY_GP;

  const { data, error } = await supabase
    .from("management_gameplans")
    .select("*")
    .eq("user_id", user.id)
    .eq("team_id", teamId)
    .limit(1);

  if (error) {
    console.error("Erreur chargement Game Plan:", error);
    return EMPTY_GP;
  }
  return data?.[0] ? normalizeGamePlanRow(data[0]) : EMPTY_GP;
}

async function writeGP(supabase: ReturnType<typeof createClient>, teamId: string, gp: GamePlan) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !teamId) throw new Error("Utilisateur non connecté ou équipe absente.");

  const payload = {
    user_id: user.id,
    team_id: teamId,
    opponent: gp.opponent || null,
    date: gp.date || null,
    match_time: gp.matchTime || null,
    competition: gp.competition || null,
    calendar_event_id: gp.calendarEventId || null,
    objective: gp.objective || null,
    key_players: gp.keyPlayers || null,
    attack_schemes: gp.attackSchemes || null,
    defense_schemes: gp.defenseSchemes || null,
    key_points: gp.keyPoints || null,
    include_rotation: Boolean(gp.includeRotation),
    blob: gp.blob || null,
    slob: gp.slob || null,
    end_game_systems: gp.endGameSystems || null,
    scouting: gp.scouting ?? EMPTY_GP.scouting,
    library_systems: gp.librarySystems ?? [],
    drawings: { ...gp.drawings, savedPlanId: gp.savedPlanId },
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("management_gameplans")
    .upsert(payload, { onConflict: "user_id,team_id" });

  if (!error) return;

  // Fallback si la contrainte unique user_id/team_id n'existe pas encore côté Supabase.
  const { data: existing, error: readError } = await supabase
    .from("management_gameplans")
    .select("id")
    .eq("user_id", user.id)
    .eq("team_id", teamId)
    .limit(1)
    .maybeSingle();

  if (readError) {
    console.error("Erreur sauvegarde Game Plan:", error, readError);
    throw error;
  }

  const fallback = existing?.id
    ? await supabase.from("management_gameplans").update(payload).eq("id", existing.id)
    : await supabase.from("management_gameplans").insert(payload);

  if (fallback.error) {
    console.error("Erreur sauvegarde Game Plan:", error, fallback.error);
    throw fallback.error;
  }
}

function readRotation(teamId: string): Rotation | null {
  const store = lsGet<Record<string, Rotation>>(K_ROT) || {};
  const r = store[teamId];
  return r && Array.isArray(r.segments) ? r : null;
}
function playerLabel(p: Player) {
  const num = p.num !== undefined && p.num !== "" ? `#${p.num} ` : "";
  return `${num}${p.firstName || ""} ${p.lastName || ""}`.trim();
}
function fmtDateLong(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("fr-FR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
}
function escapeHtml(s: string) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)
  );
}
function drawHalfCourt(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#F3E2C0";
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#BE9355";
  ctx.lineWidth = 2;
  ctx.strokeRect(8, 8, w - 16, h - 16);
  const keyW = w * 0.26;
  const keyH = h * 0.4;
  const kx = (w - keyW) / 2;
  const ky = 8;
  ctx.strokeRect(kx, ky, keyW, keyH);
  ctx.beginPath();
  ctx.arc(w / 2, ky + keyH, keyW * 0.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, ky + 20, 7, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(w / 2, ky + 20, w * 0.42, 0.12 * Math.PI, 0.88 * Math.PI);
  ctx.stroke();
}

/* ----- Sources de systèmes (best-effort : localStorage puis Supabase) ----- */

type LibItem = { id: string; title: string; category?: string; type?: string; schemaImage?: string; schemaImages?: string[]; schemaDataList?: any[]; objectif?: string };

function normalizeLibRow(row: any): LibItem {
  const img =
    row?.schemaImage ??
    row?.schema_image ??
    row?.image ??
    row?.thumbnail ??
    row?.preview ??
    (Array.isArray(row?.schemaImages) ? row.schemaImages[0] : "") ??
    "";
  return {
    id: String(row?.id ?? row?.uuid ?? row?._id ?? Math.random().toString(36).slice(2)),
    title: String(row?.title ?? row?.name ?? row?.nom ?? row?.titre ?? "Système"),
    category: String(row?.category ?? row?.categorie ?? row?.cat ?? row?.niveau ?? ""),
    type: String(row?.type ?? row?.systeme_type ?? row?.kind ?? ""),
    schemaImage: typeof img === "string" ? img : "",
    schemaImages: Array.isArray(row?.schemaImages) ? row.schemaImages : Array.isArray(row?.schema_images) ? row.schema_images : [],
    schemaDataList: Array.isArray(row?.schemaDataList) ? row.schemaDataList : Array.isArray(row?.schema_data_list) ? row.schema_data_list : [],
    objectif: String(row?.objectif ?? row?.objective ?? row?.description ?? ""),
  };
}

/** Charge les systèmes d'une source. Essaie localStorage puis Supabase ; renvoie [] si rien. */
async function loadSystems(supabase: ReturnType<typeof createClient>, origin: "bibliotheque" | "playbook"): Promise<LibItem[]> {
  const lsKeys =
    origin === "playbook"
      ? ["mybasket_playbook_systems", "mybasket_playbooks", "mybasket_playbook", "mybasket_mes_playbooks"]
      : ["mybasket_systemes", "mybasket_systems", "mybasket_bibliotheque_systemes", "mybasket_library_systems"];
  for (const k of lsKeys) {
    const v = lsGet<any[]>(k);
    if (Array.isArray(v) && v.length) return v.map(normalizeLibRow);
  }
  const tables =
    origin === "playbook"
      ? ["playbook_systems", "playbooks", "mes_playbooks"]
      : ["systemes", "systems", "plays", "library_systems", "gameplan_systems"];
  for (const t of tables) {
    try {
      const { data, error } = await supabase.from(t).select("*").limit(1000);
      if (!error && Array.isArray(data) && data.length) return data.map(normalizeLibRow);
    } catch {
      /* table absente : on essaie la suivante */
    }
  }
  return [];
}

function extractPlaquetteImage(raw: any): string {
  if (!raw) return "";
  if (typeof raw === "string") return raw;
  return (
    raw.image ||
    raw.dataUrl ||
    raw.png ||
    raw.schemaImage ||
    (Array.isArray(raw.images) ? raw.images[0] : "") ||
    (Array.isArray(raw.schemaImages) ? raw.schemaImages[0] : "") ||
    ""
  );
}

function saveSystemToLocalLibrary(system: LibrarySystem) {
  try {
    const arr = lsGet<any[]>("mybasket_systemes") || [];
    const item = {
      id: system.id || newId(),
      title: system.title,
      name: system.title,
      category: system.category || system.section || "Système",
      type: system.category || system.section || "Système",
      objectif: system.objectif || "",
      schemaImage: system.schemaImage || "",
      schemaImages: system.schemaImages || (system.schemaImage ? [system.schemaImage] : []),
      schemaDataList: system.schemaDataList || [],
      source: "gameplan-plaquette",
      createdAt: new Date().toISOString(),
    };
    const withoutDuplicate = arr.filter((x) => String(x?.id) !== String(item.id));
    lsSet("mybasket_systemes", [item, ...withoutDuplicate]);
  } catch {}
}

function extractPlaquetteImages(raw: any): string[] {
  if (!raw) return [];
  if (typeof raw === "string") return raw ? [raw] : [];
  const imgs =
    (Array.isArray(raw.schemaImages) && raw.schemaImages) ||
    (Array.isArray(raw.images) && raw.images) ||
    (Array.isArray(raw.phaseImages) && raw.phaseImages) ||
    [];
  const cover = extractPlaquetteImage(raw);
  return Array.from(new Set([cover, ...imgs].filter((x) => typeof x === "string" && x)));
}

/* ============================== Composant ============================= */

export default function GamePlanModule() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = useMemo(() => createClient(), []); // FIX #2 : client stable

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [gp, setGp] = useState<GamePlan>(EMPTY_GP);
  const [drawingFor, setDrawingFor] = useState<Section | null>(null);
  const [addSysFor, setAddSysFor] = useState<SystemSection | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [savedPlans, setSavedPlans] = useState<SavedGamePlan[] | null>(null);
  const [planAction, setPlanAction] = useState(false);
  const planActionRef = useRef(false);
  const planRevision = useRef(0);
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const [loading, setLoading] = useState(true);
  const [rotationTick, setRotationTick] = useState(0);
  const [activeTab, setActiveTab] = useState<"match" | "systems" | "scout" | "keys" | "montage" | "rotation">("match");
  const [pendingDraw, setPendingDraw] = useState<{ section: SystemSection; image: string } | null>(null);
  const [showScoutDataPicker, setShowScoutDataPicker] = useState(false);

  useEffect(() => {
    const requestedTab = searchParams.get("gamePlanTab");
    if (requestedTab === "keys") {
      setActiveTab("systems");
    } else if (requestedTab === "match" || requestedTab === "systems" || requestedTab === "scout" || requestedTab === "montage" || requestedTab === "rotation") {
      setActiveTab(requestedTab);
    }
  }, [searchParams]);

  const dirtyRef = useRef(false); // FIX #1 : édition en cours non sauvegardée
  const teamIdRef = useRef("");
  const gpRef = useRef(gp);
  gpRef.current = gp;
  teamIdRef.current = teamId;

  const writeCurrentPlan = useCallback((id: string, plan: GamePlan) => {
    const pending = writeQueue.current.then(() => writeGP(supabase, id, plan));
    writeQueue.current = pending.catch(() => {});
    return pending;
  }, [supabase]);

  async function runPlanAction(action: () => Promise<void>, message: string) {
    if (planActionRef.current) return;
    planActionRef.current = true;
    setPlanAction(true);
    try {
      await action();
    } catch (error) {
      console.error(message, error);
      window.alert(message);
    } finally {
      planActionRef.current = false;
      setPlanAction(false);
    }
  }

  const flash = useCallback(() => {
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1800);
  }, []);

  /* --- mutations : patch() = unique point d’écriture → marque dirty --- */
  const patch = useCallback((p: Partial<GamePlan>) => {
    dirtyRef.current = true;
    setGp((g) => ({ ...g, ...p }));
  }, []);

  const patchScout = useCallback((p: Partial<Scouting>) => {
    dirtyRef.current = true;
    setGp((g) => ({ ...g, scouting: { ...g.scouting, ...p } }));
  }, []);

  /* --- chargement initial (force = true recharge le game plan) --- */
  const loadInitial = useCallback(async () => {
    setLoading(true);
    try {
      const t = await readTeams();
      setTeams(t);
      const coached = t.filter((x) => !isScoutTeam(x));
      let id = lsGet<string>(K_SEL) || "";
      if (typeof id !== "string") id = "";
      if (!id || !coached.some((x) => String(x.id) === String(id))) {
        id = coached[0]?.id ?? "";
        lsSet(K_SEL, id);
      }
      teamIdRef.current = id;
      setTeamId(id);
      const next = id ? await readGP(supabase, id) : EMPTY_GP;
      gpRef.current = next;
      dirtyRef.current = false;
      setGp(next);
    } catch (e) {
      console.error("Erreur chargement Game Plan:", e);
      setTeams([]);
      setTeamId("");
      setGp(EMPTY_GP);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  const persistGamePlanNow = useCallback(
    async (next: GamePlan, targetTeamId?: string) => {
      const saveTeamId = targetTeamId || teamIdRef.current;

      gpRef.current = next;
      setGp(next);
      dirtyRef.current = true;

      // Backup local immédiat : même si Supabase refuse, tu ne perds pas le système ajouté.
      try {
        if (saveTeamId) lsSet(`mybasket_gameplan_backup_${saveTeamId}`, next);
      } catch {}

      if (!saveTeamId) {
        console.warn("Game Plan non sauvegardé : aucune équipe cible.");
        return false;
      }

      try {
        await writeCurrentPlan(saveTeamId, next);
        dirtyRef.current = false;
        flash();
        return true;
      } catch (error) {
        console.error("Sauvegarde Game Plan impossible :", error);
        // On garde dirty=true pour que le prochain autosave retente.
        return false;
      }
    },
    [writeCurrentPlan, flash]
  );

  /* --- détecte un système dessiné ou sélectionné renvoyé par la Plaquette / page Systèmes --- */
  const checkPendingDraw = useCallback(async () => {
    if (planActionRef.current) return;
    const revision = planRevision.current;
    const pendingBase = lsGet<{ section?: SystemSection; teamId?: string; title?: string; mode?: string }>(K_PENDING);
    const targetTeamId = pendingBase?.teamId || teamIdRef.current;

    // Important : au montage, loadInitial peut ne pas avoir encore rempli teamIdRef.
    // Dans ce cas on ne consomme PAS le localStorage, sinon le retour plaquette est perdu.
    if (!targetTeamId) return;

    const selected = lsGet<{ section?: SystemSection; teamId?: string; system?: any }>(K_SELECTED_SYSTEM);
    if (selected?.system) {
      const section = selected.section || pendingBase?.section || "offensive";
      const item = normalizeLibRow(selected.system);
      const sys: LibrarySystem = {
        id: item.id || newId(),
        source: "bibliotheque",
        section,
        title: item.title,
        category: item.category || item.type || SECTION_LABEL[section],
        objectif: item.objectif || "",
        schemaImage: item.schemaImage || "",
        schemaImages: item.schemaImages || [],
        schemaDataList: item.schemaDataList || [],
      };

      const baseGp =
        targetTeamId === teamIdRef.current
          ? gpRef.current
          : await readGP(supabase, targetTeamId);

      const next: GamePlan = {
        ...baseGp,
        librarySystems: [...baseGp.librarySystems, sys],
      };

      if (planActionRef.current || revision !== planRevision.current) return;
      if (targetTeamId !== teamIdRef.current) {
        teamIdRef.current = targetTeamId;
        setTeamId(targetTeamId);
        lsSet(K_SEL, targetTeamId);
      }

      await persistGamePlanNow(next, targetTeamId);
      try {
        localStorage.removeItem(K_SELECTED_SYSTEM);
        localStorage.removeItem(K_PENDING);
      } catch {}
      setActiveTab(section === "scout" ? "scout" : "systems");
      return;
    }

    const pend = lsGet<{ section: SystemSection; teamId: string; title?: string }>(K_PENDING);
    if (!pend) return;

    const raw = lsGet<any>(K_PLQ_RESULT);
    const images = extractPlaquetteImages(raw);
    const image = images[0] || "";
    if (!image) return;

    const section = pend.section || "offensive";
    const title = raw?.title || pend.title || `Système ${SECTION_LABEL[section]}`;
    const sys: LibrarySystem = {
      id: newId(),
      source: "plaquette",
      section,
      title,
      category: SECTION_LABEL[section],
      objectif: "",
      schemaImage: image,
      schemaImages: images,
      schemaDataList: Array.isArray(raw?.schemaDataList) ? raw.schemaDataList : [],
    };

    saveSystemToLocalLibrary(sys);

    const baseGp =
      targetTeamId === teamIdRef.current
        ? gpRef.current
        : await readGP(supabase, targetTeamId);

    const next: GamePlan = {
      ...baseGp,
      librarySystems: [...baseGp.librarySystems, sys],
    };

    if (targetTeamId !== teamIdRef.current) {
      teamIdRef.current = targetTeamId;
      setTeamId(targetTeamId);
      lsSet(K_SEL, targetTeamId);
    }

    if (planActionRef.current || revision !== planRevision.current) return;
    await persistGamePlanNow(next, targetTeamId);

    try {
      localStorage.removeItem(K_PLQ_RESULT);
      localStorage.removeItem(K_PENDING);
      localStorage.removeItem("mybasket_scouting_pending");
    } catch {}
    setActiveTab(section === "scout" ? "scout" : "systems");
    setPendingDraw({ section, image });
  }, [persistGamePlanNow, supabase]);

  /* --- refresh léger au focus : équipes + rotation, et game plan SEULEMENT si pas d'édition en cours --- */
  const refresh = useCallback(async () => {
    const t = await readTeams();
    setTeams(t);
    setRotationTick((x) => x + 1);
    if (planActionRef.current) return;
    checkPendingDraw();
    const id = teamIdRef.current;
    const revision = planRevision.current;
    if (id && !dirtyRef.current) {
      const next = await readGP(supabase, id);
      if (!planActionRef.current && revision === planRevision.current && teamIdRef.current === id && !dirtyRef.current) {
        setGp(next); // FIX #1 : ne clobber jamais une saisie non enregistrée
      }
    }
  }, [supabase, checkPendingDraw]);

  useEffect(() => {
    let active = true;
    loadInitial().then(() => {
      if (!active) return;
      window.setTimeout(() => checkPendingDraw(), 80);
    });
    return () => {
      active = false;
    };
  }, [loadInitial, checkPendingDraw]);

  useEffect(() => {
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus); // FIX #3 : bon target
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  /* --- AUTOSAVE débordé : tout passe par là (FIX #6) --- */
  useEffect(() => {
    if (loading || planAction || !teamId || !dirtyRef.current) return;
    const t = window.setTimeout(async () => {
      try {
        if (planActionRef.current || teamIdRef.current !== teamId || !dirtyRef.current) return;
        const next = gpRef.current;
        await writeCurrentPlan(teamId, next);
        if (gpRef.current === next) dirtyRef.current = false;
        flash();
      } catch {
        /* échec silencieux : on retentera au prochain changement / save manuel */
      }
    }, 800);
    return () => window.clearTimeout(t);
  }, [gp, teamId, loading, planAction, writeCurrentPlan, flash]);

  const flushSave = useCallback(async () => {
    if (dirtyRef.current && teamIdRef.current) {
      try {
        await writeCurrentPlan(teamIdRef.current, gpRef.current);
        dirtyRef.current = false;
      } catch {}
    }
  }, [writeCurrentPlan]);

  /* --- dérivés --- */
  const team = useMemo(() => teams.find((t) => t.id === teamId && !isScoutTeam(t)) || null, [teams, teamId]);
  const rotation = useMemo(() => (teamId ? readRotation(teamId) : null), [teamId, rotationTick]);
  const hasRotation = !!(rotation && rotation.segments.length);
  const systemsBySection = useMemo(() => {
    const m: Record<SystemSection, LibrarySystem[]> = { offensive: [], scout: [], blob: [], slob: [], end: [] };
    gp.librarySystems.forEach((s) => m[sysSection(s)].push(s));
    return m;
  }, [gp.librarySystems]);
  const offensiveSystems = systemsBySection.offensive;
  const opponentSystems = systemsBySection.scout;

  const rotationRows = useMemo(() => {
    if (!rotation || !team) return [] as { qt: number; mins: number; items: string[] }[];
    const rows: { qt: number; mins: number; items: string[] }[] = [];
    for (let qt = 0; qt < 4; qt++) {
      const segs = rotation.segments.filter((s) => s.qt === qt).sort((a, b) => a.pos - b.pos || a.start - b.start);
      if (!segs.length) continue;
      const items = segs
        .map((s) => {
          const pl = (team.players || []).find((p) => p.id === s.playerId);
          if (!pl) return null;
          const dur = ((s.end - s.start) / 60).toFixed(1).replace(".0", "");
          return `${POSTES[s.pos]} : ${playerLabel(pl)} (${dur}')`;
        })
        .filter(Boolean) as string[];
      rows.push({ qt, mins: rotation.durations?.[qt] ?? 10, items });
    }
    return rows;
  }, [rotation, team]);

  const selectTeam = async (id: string) => {
    await runPlanAction(async () => {
      await flushSave();
      const next = await readGP(supabase, id);
      planRevision.current++;
      teamIdRef.current = id;
      setTeamId(id);
      lsSet(K_SEL, id);
      gpRef.current = next;
      dirtyRef.current = false;
      setGp(next);
      setSavedPlans(null);
    }, "Impossible de changer d’équipe.");
  };

  const ensureCalendarMatchEvent = useCallback(
    async (base: GamePlan = gpRef.current, attachmentUrl = ""): Promise<GamePlan> => {
      if (!teamIdRef.current || !base.date) return base;

      const eventId = base.calendarEventId || newId();
      const title = `Match vs ${base.opponent?.trim() || "Adversaire"}`;
      const eventPayload: Record<string, any> = {
        id: eventId,
        type: "match",
        eventType: "match",
        event_type: "match",
        title,
        titre: title,
        opponent: base.opponent || "",
        adversaire: base.opponent || "",
        date: base.date,
        eventDate: base.date,
        event_date: base.date,
        time: base.matchTime || "",
        heure: base.matchTime || "",
        start_time: base.matchTime || "",
        teamId: teamIdRef.current,
        team_id: teamIdRef.current,
        equipe: team?.name || "",
        teamName: team?.name || "",
        location: "",
        lieu: "",
        players: [] as string[],
        joueurs: [] as string[],
        notes: `Game Plan — ${team?.name || ""}`,
        description: `Game Plan — ${team?.name || ""}`,
        attachment: attachmentUrl || "",
        attachment_url: attachmentUrl || null,
        game_plan_id: teamIdRef.current,
        gamePlanTeamId: teamIdRef.current,
        source: "gameplan",
        updatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      const arr = lsGet<any[]>(K_CAL);
      const current = Array.isArray(arr) ? arr : [];
      const idx = current.findIndex((ev) => String(ev?.id) === String(eventId));
      const nextEvents =
        idx >= 0
          ? current.map((ev, i) => (i === idx ? { ...ev, ...eventPayload, createdAt: ev.createdAt || eventPayload.createdAt } : ev))
          : [eventPayload, ...current];

      lsSet(K_CAL, nextEvents);

      // Synchronisation Supabase : le match et le PDF du Game Plan deviennent
      // consultables depuis Mon Calendrier sur tous les appareils.
      try {
        const { data: auth } = await supabase.auth.getUser();
        const user = auth.user;
        if (user) {
          const dbPayload: Record<string, any> = {
            id: eventId,
            user_id: user.id,
            title,
            description: `Game Plan — ${team?.name || ""}`,
            event_type: "game",
            event_date: base.date,
            start_time: base.matchTime || null,
            team_id: teamIdRef.current,
            opponent: base.opponent || null,
            attachment_url: attachmentUrl || null,
          };
          let { error } = await supabase.from("calendar_events").upsert(dbPayload, { onConflict: "id" });
          if (error) {
            // Compatibilité avec les anciens schémas calendar_events.
            const fallback = {
              id: eventId, user_id: user.id, title, event_date: base.date,
              start_time: base.matchTime || null, event_type: "game",
              attachment_url: attachmentUrl || null,
            };
            ({ error } = await supabase.from("calendar_events").upsert(fallback, { onConflict: "id" }));
          }
          if (error) console.error("Synchronisation calendrier Game Plan:", error);
        }
      } catch (error) {
        console.error("Synchronisation calendrier Game Plan:", error);
      }

      try {
        window.dispatchEvent(new CustomEvent("mybasket:calendar-updated"));
      } catch {}

      return { ...base, calendarEventId: eventId };
    },
    [team]
  );

  const saveNow = async (keepCopy = false) => {
    await runPlanAction(async () => {
      const id = teamIdRef.current;
      if (!id) return;
      const current = gpRef.current;
      let next = current.date ? await ensureCalendarMatchEvent(current) : current;
      if (keepCopy) {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) throw new Error("Connexion requise.");
        next = { ...next, savedPlanId: next.savedPlanId || crypto.randomUUID() };
        const opponent = next.opponent.trim() || teams.find(t => t.id === next.scouting.scoutTeamId)?.name;
        const { error } = await supabase.from("management_saved_gameplans").upsert({
          id: next.savedPlanId,
          user_id: user.id,
          team_id: id,
          title: opponent || "Game Plan sans adversaire",
          match_date: next.date || null,
          snapshot: next,
          updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        gpRef.current = next;
        setGp(next);
        dirtyRef.current = true;
        setSavedPlans(null);
      }
      await writeCurrentPlan(id, next);
      gpRef.current = next;
      setGp(next);
      dirtyRef.current = false;
      flash();
    }, "Impossible de sauvegarder le Game Plan.");
  };

  const showSavedPlans = async () => {
    if (savedPlans !== null) {
      setSavedPlans(null);
      return;
    }
    await runPlanAction(async () => {
      const { data, error } = await supabase.from("management_saved_gameplans")
        .select("id,title,match_date,updated_at")
        .eq("team_id", teamId)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      setSavedPlans(data ?? []);
    }, "Impossible de charger les Game Plans sauvegardés.");
  };

  const replaceCurrentPlan = async (next: GamePlan) => {
    planRevision.current++;
    await writeCurrentPlan(teamId, next);
    try {
      const pending = lsGet<{ teamId?: string }>(K_PENDING);
      const selectedSystem = lsGet<{ teamId?: string }>(K_SELECTED_SYSTEM);
      if (!pending?.teamId || pending.teamId === teamId) {
        localStorage.removeItem(K_PLQ_RESULT);
        localStorage.removeItem(K_PENDING);
        localStorage.removeItem("mybasket_scouting_pending");
      }
      if (!selectedSystem?.teamId || selectedSystem.teamId === teamId) localStorage.removeItem(K_SELECTED_SYSTEM);
      localStorage.removeItem(`mybasket_gameplan_backup_${teamId}`);
    } catch {}
    gpRef.current = next;
    dirtyRef.current = false;
    setGp(next);
    setSavedPlans(null);
    setPendingDraw(null);
    setAddSysFor(null);
    setDrawingFor(null);
    setShowScoutDataPicker(false);
    setActiveTab("match");
  };

  const resumeSavedPlan = async (id: string) => {
    if (!window.confirm("Reprendre cette sauvegarde ? Elle remplacera le plan de travail en cours. Sauvegarde-le d’abord si tu veux le conserver.")) return;
    await runPlanAction(async () => {
      const { data, error } = await supabase.from("management_saved_gameplans")
        .select("snapshot").eq("team_id", teamId).eq("id", id).single();
      if (error || !data?.snapshot) throw error || new Error("Sauvegarde indisponible.");
      await replaceCurrentPlan({ ...data.snapshot, savedPlanId: id });
    }, "Impossible de reprendre le Game Plan.");
  };

  const resetGamePlan = async () => {
    if (!window.confirm("Vider le Game Plan en cours ? Les informations du match, le scouting, les systèmes et les dessins seront réinitialisés. Les Game Plans sauvegardés seront conservés.")) return;
    await runPlanAction(() => replaceCurrentPlan(EMPTY_GP), "Impossible de réinitialiser le Game Plan.");
  };

  /* --- Mon Calendrier (localStorage) : ajout robuste, sans erreur --- */
  const createMatchEvent = async () => {
    if (!gpRef.current.date) {
      window.alert("Renseigne d'abord une date pour créer le match.");
      return;
    }

    try {
      const pdf = await exportGamePlanPdf(team!, gpRef.current, rotation, { download: false });
      const next = await ensureCalendarMatchEvent(gpRef.current, pdf?.dataUrl || "");
      gpRef.current = next;
      setGp(next);
      dirtyRef.current = true;
      await writeCurrentPlan(teamIdRef.current, next);
      dirtyRef.current = false;
      flash();
      window.alert("Match ajouté au calendrier et lié au Game Plan.");
    } catch (e) {
      console.error("Erreur ajout calendrier:", e);
      window.alert("Impossible d'ajouter le match au calendrier.");
    }
  };

  const navAfterSave = async (url: string) => {
    await flushSave();
    router.push(url);
  };
  const linkExistingEvent = () => navAfterSave(`/mon-compte?tab=calendrier&linkGamePlanTeam=${teamId}`);

  /* --- ajout de systèmes --- */
  const openAddSystem = (section: SystemSection) => setAddSysFor(section);

  // attache un système complet (titre + éventuels catégorie / schéma) à une section
  const addSystemFull = (
    section: SystemSection,
    p: { title: string; category?: string; objectif?: string; schemaImage?: string; schemaImages?: string[]; schemaDataList?: any[]; source?: LibrarySystem["source"] }
  ) => {
    const s: LibrarySystem = {
      id: newId(),
      source: p.source || (section === "scout" ? "scouting" : "quick"),
      section,
      title: p.title.trim() || "Système",
      category: p.category || SECTION_LABEL[section],
      objectif: p.objectif || "",
      schemaImage: p.schemaImage || "",
      schemaImages: p.schemaImages || (p.schemaImage ? [p.schemaImage] : []),
      schemaDataList: p.schemaDataList || [],
    };
    patch({ librarySystems: [...gp.librarySystems, s] });
  };
  const quickAddSystem = (section: SystemSection, title: string, objectif?: string) => {
    addSystemFull(section, { title: title || "Nouveau système", objectif });
    setAddSysFor(null);
  };

  // aller dessiner dans la plaquette : on mémorise la section pour proposer l'ajout au retour
  const goPlaquette = (section: SystemSection) => {
    try {
      localStorage.removeItem(K_PLQ_RESULT);
    } catch {}
    lsSet(K_PENDING, { section, teamId, title: `Système ${SECTION_LABEL[section]}` });
    try {
      localStorage.setItem(
        "mb_plaquette_return_to",
        section === "scout"
          ? "/mon-compte?tab=management&module=gameplan&gamePlanTab=scout"
          : "/mon-compte?tab=management&module=gameplan&gamePlanTab=systems",
      );
      localStorage.removeItem("mybasket_scouting_pending");
    } catch {}
    setAddSysFor(null);
    navAfterSave(`/plaquette?type=systeme&return=game-plan&teamId=${teamId}&section=${section}`);
  };
  const goPlaquetteScout = () => goPlaquette("scout");

  // repli : ouvrir la page complète (Bibliothèque / Playbook) si la liste inline est vide
  const browse = (origin: "bibliotheque" | "playbook", section: SystemSection) => {
    lsSet(K_PENDING, { section, teamId, mode: "select-system" });
    const url =
      origin === "bibliotheque"
        ? `/systemes?selectForGamePlan=1&selectForGamePlanTeam=${teamId}&section=${section}`
        : `/mon-compte/playbook?selectForGamePlan=1&selectForGamePlanTeam=${teamId}&section=${section}`;
    setAddSysFor(null);
    navAfterSave(url);
  };

  const removeSystem = (id: string) => patch({ librarySystems: gp.librarySystems.filter((s) => s.id !== id) });

  const acceptPendingDraw = () => {
    if (!pendingDraw) return;
    const sys = {
      title: `Système ${SECTION_LABEL[pendingDraw.section]}`,
      schemaImage: pendingDraw.image,
      schemaImages: [pendingDraw.image],
      source: "plaquette" as const,
    };
    addSystemFull(pendingDraw.section, sys);
    saveSystemToLocalLibrary({ id: newId(), section: pendingDraw.section, category: SECTION_LABEL[pendingDraw.section], objectif: "", ...sys });
    try {
      localStorage.removeItem(K_PLQ_RESULT);
      localStorage.removeItem(K_PENDING);
    } catch {}
    setActiveTab(pendingDraw.section === "scout" ? "scout" : "systems");
    setPendingDraw(null);
  };
  const dismissPendingDraw = () => {
    try {
      localStorage.removeItem(K_PLQ_RESULT);
      localStorage.removeItem(K_PENDING);
    } catch {}
    setPendingDraw(null);
  };

  /* --- joueurs clés structurés (FIX #5) --- */
  const setKP = (i: number, field: keyof ScoutPlayer, val: string) =>
    patchScout({ keyPlayers: gp.scouting.keyPlayers.map((p, idx) => (idx === i ? { ...p, [field]: val } : p)) });
  const addKP = () => patchScout({ keyPlayers: [...gp.scouting.keyPlayers, { name: "", role: "" }] });
  const delKP = (i: number) => patchScout({ keyPlayers: gp.scouting.keyPlayers.filter((_, idx) => idx !== i) });

  /* --- dessins (autosave via patch) --- */
  const addDrawing = (section: Section, d: Drawing) =>
    patch({ drawings: { ...gp.drawings, [section]: [...gp.drawings[section], d] } });
  const removeDrawing = (section: Section, idx: number) => {
    if (!window.confirm("Retirer ce dessin ?")) return;
    patch({ drawings: { ...gp.drawings, [section]: gp.drawings[section].filter((_, i) => i !== idx) } });
  };
  const renameDrawing = (section: Section, idx: number, name: string) =>
    patch({ drawings: { ...gp.drawings, [section]: gp.drawings[section].map((d, i) => (i === idx ? { ...d, name } : d)) } });

  /* =============================== Rendu =============================== */

  if (loading) {
    return (
      <div className="gp">
        <div className="gp-empty">Chargement du Game Plan…</div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  if (!team) {
    return (
      <div className="gp">
        <TeamBar teams={teams.filter((t) => !isScoutTeam(t))} teamId={teamId} onSelect={selectTeam} />
        <div className="gp-empty">Crée d'abord une équipe dans « Mes Équipes » pour préparer un Game Plan.</div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  const scoutTeams = teams.filter(isScoutTeam);

  const endSections: [Section, string, keyof GamePlan, string, number][] = [
    ["blob", "🎯 BLOB", "blob", "Remise en jeu ligne de fond…", 3],
    ["slob", "↔ SLOB", "slob", "Remise en jeu côté…", 3],
    ["end", "⏱ Fin de match", "endGameSystems", "Dernier tir, score serré…", 4],
  ];

  return (
    <div className="gp" inert={planAction} aria-busy={planAction}>
      <TeamBar teams={teams.filter((t) => !isScoutTeam(t))} teamId={teamId} onSelect={selectTeam} />

      <div className="gp-hero">
        <div>
          <p className="gp-kicker">Management</p>
          <h2>
            Game <span>Plan</span>
          </h2>
          <p>Choisis le match, construis ton scouting à partir des données codées, puis prépare notre plan.</p>
        </div>
        <div className="gp-heroactions">
          <button type="button" className="gp-reset" aria-expanded={savedPlans !== null} onClick={showSavedPlans}>
            Reprendre un Game Plan
          </button>
          <button type="button" className="gp-reset gp-trash" onClick={resetGamePlan}
            aria-label="Réinitialiser le Game Plan en cours" title="Réinitialiser le Game Plan en cours">
            <Trash2 size={18} aria-hidden="true" />
          </button>
          <button
            type="button"
            className="gp-mainexport"
            onClick={async () => {
              await saveNow();
              exportGamePlanPdf(team, gp, gp.includeRotation ? rotation : null);
            }}
          >
            📄 Export PDF
          </button>
        </div>
      </div>

      {savedPlans !== null && (
        <section className="gp-card gp-saved-plans" aria-label="Game Plans sauvegardés">
          <h3>Game Plans sauvegardés</h3>
          {savedPlans.length ? <ul>
            {savedPlans.map(plan => (
              <li key={plan.id}>
                <div><strong>{plan.title}</strong><small>
                  {plan.match_date ? fmtDateLong(plan.match_date) : "Sans date de match"} · enregistré le {new Date(plan.updated_at).toLocaleDateString("fr-FR")}
                </small></div>
                <button type="button" className="gp-btn ghost" aria-label={`Reprendre ${plan.title}`} onClick={() => resumeSavedPlan(plan.id)}>Reprendre</button>
              </li>
            ))}
          </ul> : <p>Aucun Game Plan sauvegardé pour cette équipe.</p>}
        </section>
      )}

      {pendingDraw && (
        <div className="gp-drawbanner">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {pendingDraw.image ? <img src={pendingDraw.image} alt="Système dessiné" /> : <span className="gp-drawph">🎨</span>}
          <div className="gp-drawtxt">
            <b>Système dessiné prêt</b>
            <span>Tu reviens de la plaquette — ajoute-le à la section {SECTION_LABEL[pendingDraw.section]}.</span>
          </div>
          <div className="gp-drawactions">
            <button type="button" className="gp-add" onClick={dismissPendingDraw}>
              Ignorer
            </button>
            <button type="button" className="gp-btn black" onClick={acceptPendingDraw}>
              ＋ Ajouter au game plan
            </button>
          </div>
        </div>
      )}

      <div className="gp-tabs gp-mainsteps">
        {(["match", "scout", "systems"] as const).map((k, index) => (
          <button key={k} type="button" className={activeTab === k ? "active" : ""} onClick={() => setActiveTab(k)}>
            <span>{index + 1}</span>{k === "match" ? "Match" : k === "scout" ? "Scouting adverse" : "Notre plan"}
          </button>
        ))}
      </div>
      <div className="gp-tools">
        <span>Outils</span>
        <button type="button" className={activeTab === "montage" ? "active" : ""} onClick={() => setActiveTab("montage")}>🎬 Montage</button>
        <button type="button" className={activeTab === "rotation" ? "active" : ""} onClick={() => setActiveTab("rotation")}>🔁 Rotation</button>
      </div>

      <div className="gp-layout">
        <main>
          {activeTab === "match" && (<>
          <section className="gp-matchbar">
            <div className="gp-matchsummary">
              <span className="gp-matchlogo">🏀</span>
              <div>
                <small>GAME PLAN · {team?.name || "Mon équipe"}</small>
                <strong>{gp.opponent ? `vs ${gp.opponent}` : "Préparer le prochain match"}</strong>
                <span>{[gp.date ? fmtDateLong(gp.date) : "", gp.matchTime, gp.competition].filter(Boolean).join(" · ") || "Ajoute l’adversaire, la date et la compétition"}</span>
              </div>
            </div>
            <div className="gp-matchcontrols">
              <label><span>Adversaire</span><input value={gp.opponent} placeholder="Nom de l’équipe" onChange={(e) => patch({ opponent: e.target.value })} /></label>
              <label><span>Date</span><input type="date" value={gp.date} onChange={(e) => patch({ date: e.target.value })} /></label>
              <label><span>Heure</span><input type="time" value={gp.matchTime} onChange={(e) => patch({ matchTime: e.target.value })} /></label>
              <label><span>Compétition</span><input value={gp.competition} placeholder="Championnat…" onChange={(e) => patch({ competition: e.target.value })} /></label>
              <div className="gp-calendar-actions">
                <button type="button" className={gp.calendarEventId ? "linked" : ""} onClick={linkExistingEvent}>{gp.calendarEventId ? "✓ Calendrier lié" : "Lier au calendrier"}</button>
                {!gp.calendarEventId && <button type="button" className="primary" onClick={createMatchEvent}>Créer</button>}
              </div>
            </div>
          </section>
          <div className="gp-match-next"><div><b>Choisis ton adversaire scouté dans l'étape 2</b><span>Le roster, les matchs codés, les stats et les clips seront disponibles automatiquement.</span></div><button type="button" onClick={() => setActiveTab("scout")}>Continuer →</button></div>
          </>)}

          {activeTab === "systems" && (
            <>
              <div className="gp-plan-toolbar">
                <div><small>PRÉPARATION</small><b>Ce qu’on veut jouer</b><span>Sélectionne tes systèmes ou dessine directement une situation.</span></div>
                <div>
                  <button type="button" onClick={() => openAddSystem("offensive")}>＋ Ajouter un système</button>
                  <button type="button" className="soft" onClick={() => setDrawingFor("blob")}>✏️ Dessiner</button>
                </div>
              </div>

              <div className="gp-card">
                <div className="gp-cardhead">
                  <h3>⚔ Systèmes offensifs</h3>
                  <button type="button" className="gp-add" onClick={() => openAddSystem("offensive")}>
                    + Ajouter un système
                  </button>
                </div>
                {offensiveSystems.length > 0 ? (
                  <div className="gp-systemgrid">
                    {offensiveSystems.map((s, i) => (
                      <article key={s.id} className="gp-system">
                        <span className="gp-priority">{i + 1}</span>
                        {s.schemaImage ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={s.schemaImage} alt={s.title} />
                        ) : (
                          <div className="gp-schema">Schéma</div>
                        )}
                        <h4>{s.title}</h4>
                        <p>
                          {s.category || "Système"} · Priorité {i + 1}
                        </p>
                        <strong>Objectif</strong>
                        <span>{s.objectif || "—"}</span>
                        <div className="gp-systemactions">
                          <button type="button" onClick={() => navAfterSave(`/plaquette?editSystem=${s.id}`)}>
                            Modifier
                          </button>
                          <button type="button" onClick={() => removeSystem(s.id)}>
                            Supprimer
                          </button>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="gp-muted">Aucun système ajouté pour le moment.</p>
                )}
              </div>


              <div className="gp-keys-inline">
                <div className="gp-cardhead"><h3>🔑 Clés du match</h3><span className="gp-sub">Tes décisions de coach · une idée par ligne</span></div>
                <div className="gp-key-grid">
                  <KeyCard icon="🔑" title="Priorités" value={gp.keyPoints} placeholder={"Contrôler le rebond\nCourir après chaque stop\nNe pas aider depuis #7"} onChange={(value) => patch({ keyPoints: value })} />
                  <KeyCard icon="⚔️" title="Attaque" value={gp.attackSchemes} placeholder={"Jouer vite après stop\nCibler leur #12 sur P&R\nPunir le drop"} onChange={(value) => patch({ attackSchemes: value })} />
                  <KeyCard icon="🛡️" title="Défense" value={gp.defenseSchemes} placeholder={"Fermer l'axe\nICE sur side P&R\nBloquer le rebond"} onChange={(value) => patch({ defenseSchemes: value })} />
                </div>
                <label className="gp-thread"><span>Fil conducteur</span><input value={gp.objective} placeholder="Ex : imposer notre rythme et gagner la bataille du rebond." onChange={(e) => patch({ objective: e.target.value })} /></label>
              </div>

              <div className="gp-card gp-special-card">
                <div className="gp-cardhead">
                  <h3>🏁 Situations spéciales</h3>
                  <span className="gp-sub">BLOB · SLOB · Fin de match</span>
                </div>
                <div className="gp-special-grid">
                  {endSections.map(([section, label]) => {
                    const secSys = systemsBySection[section as SystemSection] || [];
                    const secDrawings = gp.drawings[section] || [];
                    return (
                      <section key={section} className="gp-special-zone">
                        <div className="gp-special-zone-head">
                          <b>{label}</b>
                          <span>{secSys.length + secDrawings.length} schéma{secSys.length + secDrawings.length > 1 ? "s" : ""}</span>
                        </div>

                        {secSys.length > 0 && (
                          <div className="gp-special-schemas">
                            {secSys.map((s, i) => (
                              <article key={s.id} className="gp-special-schema">
                                <span className="gp-priority">{i + 1}</span>
                                {s.schemaImage ? (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img src={s.schemaImage} alt={s.title} />
                                ) : (
                                  <div className="gp-schema">Schéma</div>
                                )}
                                <div className="gp-special-schema-foot">
                                  <b>{s.title}</b>
                                  <button type="button" onClick={() => removeSystem(s.id)} aria-label={`Retirer ${s.title}`}>×</button>
                                </div>
                              </article>
                            ))}
                          </div>
                        )}

                        <DrawingList drawings={secDrawings} section={section} renameDrawing={renameDrawing} removeDrawing={removeDrawing} />

                        {secSys.length === 0 && secDrawings.length === 0 && (
                          <div className="gp-special-empty">Aucun schéma</div>
                        )}

                        <div className="gp-special-actions">
                          <button type="button" className="gp-add" onClick={() => openAddSystem(section as SystemSection)}>
                            ＋ Ajouter un schéma
                          </button>
                          <button type="button" className="gp-add ghost" onClick={() => setDrawingFor(section)}>
                            ✏️ Dessiner
                          </button>
                        </div>
                      </section>
                    );
                  })}
                </div>
              </div>
            </>
          )}

          {activeTab === "scout" && (
            <GamePlanScoutingBoard
              value={gp.scouting as ScoutBoardValue}
              onChange={(next) => {
                patchScout(next as Partial<Scouting>);
                if (next.scoutTeamId) {
                  const selectedScout = scoutTeams.find((item) => item.id === next.scoutTeamId);
                  if (selectedScout?.name && selectedScout.name !== gp.opponent) patch({ opponent: selectedScout.name });
                }
              }}
              scoutTeams={scoutTeams}
              myTeam={team}
              date={gp.date}
              systems={gp.librarySystems.filter((system) => sysSection(system) === "scout")}
              onAddSystem={() => openAddSystem("scout")}
            />
          )}

          {activeTab === "montage" && <GamePlanMontage teamName={team?.name || "Mon équipe"} opponent={gp.opponent} items={gp.scouting.montage || []} onChange={(montage) => patchScout({ montage })} imports={gp.scouting.imports || []} systems={gp.librarySystems.map((system) => ({ id: system.id, title: system.title, schemaImage: system.schemaImage, section: SECTION_LABEL[sysSection(system)] }))} />}

          {activeTab === "rotation" && (
            <div className="gp-card">
              <div className="gp-cardhead">
                <h3>🔄 Rotation</h3>
                <span className={`gp-badge ${hasRotation ? "ok" : "off"}`}>{hasRotation ? "Rotation configurée" : "Aucune rotation"}</span>
              </div>
              {hasRotation ? (
                <>
                  <label className="gp-toggle">
                    <input type="checkbox" checked={gp.includeRotation} onChange={(e) => patch({ includeRotation: e.target.checked })} />
                    <span>Inclure ma rotation dans le PDF</span>
                  </label>
                  <div className="gp-rotrecap">
                    {rotationRows.map((r) => (
                      <div key={r.qt}>
                        <b>QT{r.qt + 1}</b> ({r.mins} min) · {r.items.join(" · ")}
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <p className="gp-muted">Aucune rotation pour cette équipe. Va dans l'onglet Rotation pour la créer.</p>
              )}
              <button type="button" className="gp-btn black" onClick={() => navAfterSave("/mon-compte?tab=management&module=rotation")}>
                Ouvrir le module rotation
              </button>
            </div>
          )}

        </main>

      </div>

      <div className="gp-actions">
        {savedFlash && <span className="gp-saved">✓ Enregistré</span>}
        <button type="button" className="gp-btn ghost" onClick={() => saveNow(true)}>
          💾 Sauvegarder le Game Plan
        </button>
        <button
          type="button"
          className="gp-btn black"
          onClick={async () => {
            await saveNow();
            exportGamePlanPdf(team, gp, gp.includeRotation ? rotation : null);
          }}
        >
          📄 Télécharger le PDF
        </button>
      </div>

      <GamePlanScoutingDataPicker
        open={showScoutDataPicker}
        onClose={() => setShowScoutDataPicker(false)}
        allowedTeams={scoutTeams.map((t) => ({ id: t.id, name: t.name || "Équipe scoutée" }))}
        existingItems={gp.scouting.imports || []}
        onAdd={(item) => {
          const current = gpRef.current.scouting.imports || [];
          const key = scoutImportKey(item);
          if (current.some((existing) => scoutImportKey(existing) === key)) return;
          patchScout({ imports: [...current, item] });
        }}
      />

      {drawingFor && (
        <DrawingEditor
          onClose={() => setDrawingFor(null)}
          onSave={(d) => {
            addDrawing(drawingFor, d);
            setDrawingFor(null);
          }}
        />
      )}

      {addSysFor && (
        <AddSystemModal
          section={addSysFor}
          supabase={supabase}
          onClose={() => setAddSysFor(null)}
          onAddItem={(item) =>
            addSystemFull(addSysFor, {
              title: item.title,
              category: item.category || item.type,
              objectif: item.objectif,
              schemaImage: item.schemaImage,
              schemaImages: item.schemaImages,
              schemaDataList: item.schemaDataList,
              source: "bibliotheque",
            })
          }
          onQuickAdd={(title, objectif) => quickAddSystem(addSysFor, title, objectif)}
          onGoPlaquette={() => goPlaquette(addSysFor)}
          onBrowse={(origin) => browse(origin, addSysFor)}
        />
      )}

      <style jsx>{styles}</style>
    </div>
  );
}

/* ============================ Sous-composants ========================== */

function DrawingList({
  drawings,
  section,
  renameDrawing,
  removeDrawing,
}: {
  drawings: Drawing[];
  section: Section;
  renameDrawing: (section: Section, idx: number, name: string) => void;
  removeDrawing: (section: Section, idx: number) => void;
}) {
  if (!drawings.length) return null;
  return (
    <div className="gp-drawings">
      {drawings.map((d, i) => (
        <div key={i} className="gp-drawing">
          <div className="gp-drawing__top">
            <span>✏️</span>
            <input type="text" value={d.name} onChange={(e) => renameDrawing(section, i, e.target.value)} />
            <button type="button" className="gp-x" onClick={() => removeDrawing(section, i)}>
              🗑
            </button>
          </div>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={d.dataUrl} alt={d.name} />
        </div>
      ))}
    </div>
  );
}

function TeamBar({ teams, teamId, onSelect }: { teams: Team[]; teamId: string; onSelect: (id: string) => void }) {
  if (teams.length <= 1) return null;
  return (
    <div className="gp-teambar">
      <label>Équipe</label>
      <select value={teamId} onChange={(e) => onSelect(e.target.value)}>
        {teams.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name || "Sans nom"} {t.cat ? `· ${t.cat}` : ""}
          </option>
        ))}
      </select>
    </div>
  );
}

function Field({ label, children, block }: { label: string; children: ReactNode; block?: boolean }) {
  return (
    <div className={`gp-field${block ? " block" : ""}`}>
      <label>{label}</label>
      {children}
    </div>
  );
}

function DrawingEditor({ onClose, onSave }: { onClose: () => void; onSave: (d: Drawing) => void }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [name, setName] = useState("");
  const [color, setColor] = useState("#0F0F12");
  const [size, setSize] = useState(3);
  const drawing = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext("2d");
    if (ctx) drawHalfCourt(ctx, canvas.width, canvas.height);
  }, []);

  const xy = (e: ReactMouseEvent | ReactTouchEvent) => {
    const canvas = canvasRef.current!;
    const r = canvas.getBoundingClientRect();
    const t = "touches" in e ? e.touches[0] : (e as ReactMouseEvent);
    return { x: (t.clientX - r.left) * (canvas.width / r.width), y: (t.clientY - r.top) * (canvas.height / r.height) };
  };
  const start = (e: ReactMouseEvent | ReactTouchEvent) => {
    drawing.current = true;
    last.current = xy(e);
  };
  const move = (e: ReactMouseEvent | ReactTouchEvent) => {
    if (!drawing.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = xy(e);
    ctx.strokeStyle = color;
    ctx.lineWidth = size;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current.x, last.current.y);
    ctx.lineTo(x, y);
    ctx.stroke();
    last.current = { x, y };
  };
  const stop = () => {
    drawing.current = false;
  };
  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) drawHalfCourt(ctx, canvas.width, canvas.height);
  };
  const save = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onSave({ name: name.trim() || "Dessin", dataUrl: canvas.toDataURL("image/png") });
  };

  return (
    <div className="de-bg" onClick={onClose}>
      <div className="de" onClick={(e) => e.stopPropagation()}>
        <h3>✏️ Nouveau dessin</h3>
        <div className="de-tools">
          <input type="text" placeholder="Nom du dessin" value={name} onChange={(e) => setName(e.target.value)} />
          <label>
            Couleur
            <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
          </label>
          <label>
            Taille
            <input type="range" min={1} max={8} value={size} onChange={(e) => setSize(Number(e.target.value))} />
          </label>
          <button type="button" onClick={clear}>
            Effacer
          </button>
        </div>
        <div className="de-canvaswrap" ref={wrapRef}>
          <canvas
            ref={canvasRef}
            onMouseDown={start}
            onMouseMove={move}
            onMouseUp={stop}
            onMouseLeave={stop}
            onTouchStart={start}
            onTouchMove={move}
            onTouchEnd={stop}
          />
        </div>
        <div className="de-actions">
          <button type="button" className="de-ghost" onClick={onClose}>
            Annuler
          </button>
          <button type="button" className="de-black" onClick={save}>
            Enregistrer
          </button>
        </div>
      </div>
    </div>
  );
}

/* -------------------- Choix d'ajout d'un système ---------------------- */

const SECTION_TITLE: Record<SystemSection, string> = {
  offensive: "système offensif",
  scout: "système adverse",
  blob: "système BLOB",
  slob: "système SLOB",
  end: "système de fin de match",
};

function AddSystemModal({
  section,
  supabase,
  onClose,
  onAddItem,
  onQuickAdd,
  onGoPlaquette,
  onBrowse,
}: {
  section: SystemSection;
  supabase: ReturnType<typeof createClient>;
  onClose: () => void;
  onAddItem: (item: LibItem) => void;
  onQuickAdd: (title: string, objectif?: string) => void;
  onGoPlaquette: () => void;
  onBrowse: (origin: "bibliotheque" | "playbook") => void;
}) {
  const [tab, setTab] = useState<"playbook" | "bibliotheque" | "plaquette" | "rapide">("bibliotheque");
  const [items, setItems] = useState<LibItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const [added, setAdded] = useState<Record<string, number>>({});
  const [title, setTitle] = useState("");
  const [objectif, setObjectif] = useState("");

  // charge la source quand on ouvre l'onglet playbook/bibliothèque
  useEffect(() => {
    if (tab !== "playbook" && tab !== "bibliotheque") return;
    let alive = true;
    setLoading(true);
    setItems([]);
    loadSystems(supabase, tab)
      .then((rows) => {
        if (alive) setItems(rows);
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [tab, supabase]);

  const filtered = items.filter((it) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return it.title.toLowerCase().includes(q) || (it.category || "").toLowerCase().includes(q) || (it.type || "").toLowerCase().includes(q);
  });

  const add = (it: LibItem) => {
    onAddItem(it);
    setAdded((a) => ({ ...a, [it.id]: (a[it.id] || 0) + 1 }));
  };

  return (
    <div className="as-bg" onClick={onClose}>
      <div className="as" onClick={(e) => e.stopPropagation()}>
        <div className="as-head">
          <h3>Ajouter un {SECTION_TITLE[section]}</h3>
          <button type="button" className="as-close" onClick={onClose} aria-label="Fermer">
            ✕
          </button>
        </div>

        <div className="as-tabs">
          {([
            ["bibliotheque", "🏀 Bibliothèque"],
            ["playbook", "📕 Mon Playbook"],
            ["plaquette", "✏️ Plaquette"],
            ["rapide", "⚡ Rapide"],
          ] as [typeof tab, string][]).map(([k, label]) => (
            <button key={k} type="button" className={tab === k ? "on" : ""} onClick={() => setTab(k)}>
              {label}
            </button>
          ))}
        </div>

        {(tab === "bibliotheque" || tab === "playbook") && (
          <div className="as-list-wrap">
            <input className="as-search" placeholder="Rechercher un système…" value={query} onChange={(e) => setQuery(e.target.value)} />
            {loading ? (
              <div className="as-empty">Chargement…</div>
            ) : filtered.length > 0 ? (
              <div className="as-list">
                {filtered.map((it) => (
                  <div className="as-item" key={it.id}>
                    <div className="as-thumb">
                      {it.schemaImage ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={it.schemaImage} alt={it.title} />
                      ) : (
                        <span>🏀</span>
                      )}
                    </div>
                    <div className="as-meta">
                      <b>{it.title}</b>
                      <i>{[it.type, it.category].filter(Boolean).join(" · ") || "Système"}</i>
                    </div>
                    <button type="button" className="as-add" onClick={() => add(it)}>
                      {added[it.id] ? `✓ Ajouté${added[it.id] > 1 ? ` ×${added[it.id]}` : ""}` : "＋ Ajouter"}
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="as-empty">
                <p>Aucun système trouvé ici.</p>
                <button type="button" className="as-link" onClick={() => onBrowse(tab)}>
                  Ouvrir {tab === "bibliotheque" ? "la Bibliothèque" : "mon Playbook"} →
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "plaquette" && (
          <div className="as-plaq">
            <p>Dessine un système sur la plaquette. En revenant, un bouton te proposera de l'ajouter ici.</p>
            <button type="button" className="as-add big" onClick={onGoPlaquette}>
              ✏️ Dessiner dans la plaquette
            </button>
          </div>
        )}

        {tab === "rapide" && (
          <div className="as-quick">
            <input placeholder="Nom du système (ex : Box BLOB)" value={title} onChange={(e) => setTitle(e.target.value)} />
            <textarea rows={2} placeholder="Objectif / notes (facultatif)" value={objectif} onChange={(e) => setObjectif(e.target.value)} />
            <div className="as-quickactions">
              <button type="button" className="as-ghost" onClick={onClose}>
                Fermer
              </button>
              <button type="button" className="as-add" onClick={() => onQuickAdd(title, objectif)} disabled={!title.trim()}>
                Ajouter
              </button>
            </div>
          </div>
        )}

        <div className="as-foot">
          <button type="button" className="as-ghost" onClick={onClose}>
            Terminé
          </button>
        </div>
      </div>
      <style jsx>{`
        .as-bg { position:fixed; inset:0; background:rgba(0,0,0,.6); z-index:6000; display:flex; align-items:center; justify-content:center; padding:1.5rem 1rem; overflow:auto; }
        .as { background:#fff; border-radius:18px; width:100%; max-width:620px; padding:1.2rem 1.3rem 1rem; box-shadow:0 25px 80px rgba(0,0,0,.35); }
        .as-head { display:flex; align-items:center; justify-content:space-between; }
        .as h3 { margin:0; color:#6B1A2C; text-transform:uppercase; font-weight:900; font-size:1.05rem; }
        .as-close { border:none; background:none; cursor:pointer; font-size:1rem; color:#888; }
        .as-tabs { display:flex; gap:.4rem; margin:.9rem 0; flex-wrap:wrap; }
        .as-tabs button { border:1px solid #ece3d6; background:#fff; border-radius:999px; padding:.4rem .8rem; font-weight:800; font-size:.82rem; cursor:pointer; color:#6B1A2C; }
        .as-tabs button.on { background:#6B1A2C; color:#fff; border-color:#6B1A2C; }
        .as-search { width:100%; border:1px solid #e1d8cc; border-radius:10px; padding:.6rem .75rem; font-size:.9rem; margin-bottom:.7rem; box-sizing:border-box; }
        .as-list { display:flex; flex-direction:column; gap:.5rem; max-height:46vh; overflow:auto; }
        .as-item { display:flex; align-items:center; gap:.7rem; border:1px solid #eee; border-radius:12px; padding:.5rem .6rem; }
        .as-thumb { width:56px; height:40px; flex:0 0 auto; border-radius:8px; background:linear-gradient(135deg,#D4A24C,#F3D89B); display:grid; place-items:center; overflow:hidden; }
        .as-thumb img { width:100%; height:100%; object-fit:cover; }
        .as-meta { flex:1; min-width:0; }
        .as-meta b { display:block; font-size:.9rem; color:#1a1a1a; }
        .as-meta i { font-style:normal; color:#888; font-size:.76rem; }
        .as-empty { text-align:center; color:#8a7b73; padding:1.4rem 1rem; }
        .as-empty p { margin:0 0 .6rem; }
        .as-link { border:1px solid #6B1A2C; background:#fff; color:#6B1A2C; border-radius:10px; padding:.5rem .9rem; font-weight:800; cursor:pointer; }
        .as-plaq { text-align:center; padding:1.2rem .5rem; }
        .as-plaq p { color:#8a7b73; margin:0 0 1rem; }
        .as-quick { padding-top:.4rem; }
        .as-quick input, .as-quick textarea { width:100%; border:1px solid #e1d8cc; border-radius:10px; padding:.65rem .75rem; font-size:.9rem; font-family:inherit; margin-bottom:.5rem; box-sizing:border-box; resize:vertical; min-height:auto; }
        .as-quick textarea { min-height:64px; }
        .as-quick input:focus, .as-quick textarea:focus { outline:none; border-color:#6B1A2C; box-shadow:0 0 0 3px rgba(107,26,44,.1); }
        .as-quickactions { display:flex; justify-content:flex-end; gap:.6rem; }
        .as-foot { display:flex; justify-content:flex-end; margin-top:.9rem; border-top:1px solid #f0f0f0; padding-top:.8rem; }
        .as-ghost, .as-add { border-radius:10px; padding:.55rem 1rem; font-weight:900; cursor:pointer; font-family:inherit; font-size:.85rem; }
        .as-ghost { border:1px solid #ddd; background:#fff; color:#444; }
        .as-add { border:none; background:#6B1A2C; color:#fff; white-space:nowrap; }
        .as-add.big { padding:.8rem 1.4rem; }
        .as-add:disabled { opacity:.5; cursor:default; }
        @media (max-width:560px){ .as-tabs button{ flex:1; } }
      `}</style>
    </div>
  );
}

function KeyCard({ icon, title, value, placeholder, onChange }: { icon: string; title: string; value: string; placeholder: string; onChange: (value: string) => void }) {
  const count = value.split("\n").filter((line) => line.trim()).length;
  return <article className="gp-keycard"><div className="gp-keycard-head"><span>{icon}</span><div><b>{title}</b><small>{count ? `${count} point${count > 1 ? "s" : ""}` : "À compléter"}</small></div></div><textarea rows={8} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} /><p>Une idée par ligne.</p></article>;
}

/* ============================== Export PDF ============================= */

async function loadPdfJs(): Promise<any> {
  const w = window as any;
  if (w.jspdf?.jsPDF) return w.jspdf.jsPDF;

  await new Promise<void>((resolve, reject) => {
    const existing = document.getElementById("jspdf-cdn") as HTMLScriptElement | null;
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Chargement jsPDF impossible")), { once: true });
      return;
    }

    const script = document.createElement("script");
    script.id = "jspdf-cdn";
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Chargement jsPDF impossible"));
    document.body.appendChild(script);
  });

  return (window as any).jspdf.jsPDF;
}

function hasText(value: unknown) {
  return typeof value === "string" && value.trim().length > 0;
}

function hasScoutData(gp: GamePlan) {
  const sc = gp.scouting;
  return [sc.team, sc.style, sc.strengths, sc.weaknesses, sc.watch, sc.defensivePlan].some(hasText) || sc.keyPlayers.length > 0;
}

async function imageToDataUrl(src: string): Promise<string | null> {
  if (!src) return null;
  if (src.startsWith("data:image")) return src;
  try {
    const url = new URL(src, window.location.origin);
    const target = url.origin === "https://assets.altrstat.xyz"
      ? `/api/lnb/report-image?path=${encodeURIComponent(url.pathname)}`
      : src;
    const res = await fetch(target, { mode: "cors" });
    if (!res.ok || !res.headers.get("content-type")?.startsWith("image/")) return null;
    const blob = await res.blob();
    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

async function circularScoutingPhoto(src: string) {
  const data = await imageToDataUrl(src);
  if (!data) return null;
  try {
    const image = new Image();
    image.src = data;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = 96;
    const context = canvas.getContext("2d");
    if (!context) return null;
    const size = Math.min(image.width, image.height);
    context.beginPath();
    context.arc(48, 48, 48, 0, 2 * Math.PI);
    context.clip();
    context.drawImage(image, (image.width - size) / 2, (image.height - size) / 2, size, size, 0, 0, 96, 96);
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

async function exportGamePlanPdf(team: Team, gp: GamePlan, rotation: Rotation | null, options: { download?: boolean } = {}) {
  try {
    const jsPDF = await loadPdfJs();
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 12;
    let y = M;

    const palette = scoutingColors(gp.scouting.scoutTeamId ? team.couleurs : undefined);
    const burgundy = palette.inkRgb;
    const gold = palette.secondaryRgb;
    const black = [15, 15, 18];
    const muted = [95, 95, 95];

    const startPdfPage = () => {
      doc.addPage();
      y = M;
    };

    const ensure = (need = 24) => {
      if (y + need > H - M) startPdfPage();
    };

    const textLines = (txt: string, width = W - M * 2) => doc.splitTextToSize(String(txt || ""), width);

    const title = (txt: string) => {
      ensure(16);
      doc.setTextColor(...burgundy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.text(txt.toUpperCase(), M, y);
      doc.setDrawColor(...gold);
      doc.line(M, y + 2.5, W - M, y + 2.5);
      y += 8;
    };

    const boxLines = (value: string): string[] => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      return hasText(value) ? textLines(value, W - M * 2 - 8) : [];
    };

    const box = (label: string, value: string) => {
      const lines = boxLines(value);
      if (!lines.length) return;
      ensure(12 + lines.length * 4.2);
      doc.setFillColor(250, 247, 240);
      doc.setDrawColor(235, 220, 195);
      doc.roundedRect(M, y, W - M * 2, 8 + lines.length * 4.2, 2, 2, "FD");
      doc.setTextColor(...burgundy);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.text(label.toUpperCase(), M + 4, y + 5);
      doc.setTextColor(...black);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.text(lines, M + 4, y + 10);
      y += 11 + lines.length * 4.2;
    };

    const scoutTeam = gp.scouting.scoutTeamId
      ? (await readTeams()).find(team => team.id === gp.scouting.scoutTeamId)
      : undefined;
    const opponentLogo = scoutTeam?.logo ? await imageToDataUrl(scoutTeam.logo) : null;
    const header = async () => {
      doc.setFillColor(...palette.primaryRgb);
      doc.rect(0, 0, W, 24, "F");
      doc.setTextColor(palette.onPrimary);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      if (opponentLogo) doc.addImage(opponentLogo, "PNG", M, 3, 18, 18);
      const titleX = opponentLogo ? M + 22 : M;
      doc.text(scoutTeam ? "SCOUTING ADVERSE" : "GAME PLAN", titleX, 13);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(scoutTeam?.name || `${team.name || "Équipe"}${team.cat ? " · " + team.cat : ""}`, titleX, 20, { maxWidth: W - titleX - M - 20 });
      if (team.logo) {
        const logo = await imageToDataUrl(team.logo);
        if (logo) doc.addImage(logo, "PNG", W - M - 16, 4, 16, 16);
      }
      y = 32;
    };

    await header();

    const meta = [
      ["Adversaire", scoutTeam ? "" : gp.opponent],
      ["Date", gp.date ? fmtDateLong(gp.date) : ""],
      ["Heure", gp.matchTime],
      ["Compétition", gp.competition],
    ].filter(([, v]) => hasText(v));

    if (meta.length) {
      title("Informations match");
      const colW = (W - M * 2) / Math.min(4, meta.length);
      meta.forEach(([label, value], i) => {
        const x = M + (i % 4) * colW;
        if (i > 0 && i % 4 === 0) y += 14;
        doc.setFillColor(250, 247, 240);
        doc.roundedRect(x, y, colW - 3, 12, 2, 2, "F");
        doc.setTextColor(...burgundy);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(7);
        doc.text(String(label).toUpperCase(), x + 3, y + 4);
        doc.setTextColor(...black);
        doc.setFontSize(8.5);
        doc.text(String(value), x + 3, y + 9);
      });
      y += 18;
    }

    if ([gp.keyPoints, gp.attackSchemes, gp.defenseSchemes, gp.objective].some(hasText)) title("Clés du match");
    box("Clé du match", gp.keyPoints);
    box("Clé offensive", gp.attackSchemes);
    box("Clé défensive", gp.defenseSchemes);
    box("Objectif", gp.objective);

    const systemSections: [SystemSection, string][] = [
      ["offensive", "Systèmes offensifs"],
      ["blob", "BLOB"],
      ["slob", "SLOB"],
      ["end", "Fin de match"],
    ];

    for (const [section, label] of systemSections) {
      const items = gp.librarySystems.filter((s) => sysSection(s) === section);
      if (!items.length) continue;
      title(label);
      for (const s of items.slice(0, 8)) {
        ensure(42);
        const x = M;
        const cardH = 38;
        doc.setDrawColor(225, 225, 225);
        doc.roundedRect(x, y, W - M * 2, cardH, 2, 2);
        if (s.schemaImage) {
          const img = await imageToDataUrl(s.schemaImage);
          if (img) doc.addImage(img, "PNG", x + 3, y + 3, 44, 32);
        }
        doc.setTextColor(...burgundy);
        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(s.title || "Système", x + 52, y + 9);
        doc.setTextColor(...muted);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        if (s.category) doc.text(s.category, x + 52, y + 15);
        if (s.objectif) doc.text(textLines(s.objectif, W - M * 2 - 58).slice(0, 4), x + 52, y + 22);
        y += cardH + 5;
      }
    }

    if (rotation && rotation.segments.length) {
      title("Rotation");
      const mins: Record<string, number> = {};
      (team.players || []).forEach((p) => (mins[p.id] = 0));
      rotation.segments.forEach((s) => (mins[s.playerId] = (mins[s.playerId] || 0) + (s.end - s.start) / 60));
      const rows = (team.players || [])
        .filter((p) => (mins[p.id] || 0) > 0)
        .sort((a, b) => (mins[b.id] || 0) - (mins[a.id] || 0))
        .slice(0, 14);
      rows.forEach((p) => {
        ensure(7);
        doc.setTextColor(...black);
        doc.setFontSize(9);
        doc.text(`${playerLabel(p)} — ${p.poste || "—"} — ${(mins[p.id] || 0).toFixed(1).replace(".0", "")}'`, M, y);
        y += 5;
      });
      y += 3;
    }

    if (gp.scouting.scoutTeamId || hasScoutData(gp)) {
      const db = createClient();
      const [official, coded, fixtures] = scoutTeam ? await Promise.all([
        scoutTeam.competitionSource === "lnb" ? loadLnbTeamStatistics(scoutTeam.id).catch(() => null) : null,
        loadMatchAnalysis(db, scoutTeam.id).catch(() => ({ matches: [], rows: [], actions: [] })),
        loadOfficialTeamMatches(db, scoutTeam.id).catch(() => []),
      ]) : [null, { matches: [], rows: [], actions: [] }, []] as const;
      const { matches, rows, actions } = coded;
      const { autoStats, uniqueMatches } = scoutingTeamStats({ matches, rows }, fixtures, official);
      const { splits, recent } = scoutingTeamForm(uniqueMatches);
      const localPlayers = codedPlayerStats({ matches, rows });
      const selected = gp.scouting.printPlayerIds == null ? null : new Set(gp.scouting.printPlayerIds);
      const scoutPlayers = scoutTeam?.players || [];
      const cards = new Map((gp.scouting.playerCards || []).map(card => [card.playerId, card]));
      const officialPlayers = new Map<string, any>((official?.players || []).map((row: any) => [row.playerId, row]));
      const teamStat = (key: string) => Object.prototype.hasOwnProperty.call(gp.scouting.teamStats || {}, key)
        ? gp.scouting.teamStats?.[key] : autoStats[key];

      const sector = (x: number, yy: number, radius: number, start: number, share: number, color: string) => {
        if (share <= 0) return;
        doc.setFillColor(color);
        if (share >= 1) { doc.circle(x, yy, radius, "F"); return; }
        const segments = Math.max(1, Math.ceil(share * 64));
        const points = Array.from({ length: segments + 1 }, (_, index) => {
          const angle = -Math.PI / 2 + (start + index / segments * share) * 2 * Math.PI;
          return [Math.cos(angle) * radius, Math.sin(angle) * radius];
        });
        const edges = [points[0], ...points.slice(1).map(([px, py], index) => [px - points[index][0], py - points[index][1]])];
        doc.lines(edges, x, yy, [1, 1], "F", true);
      };
      const pie = (x: number, yy: number, radius: number, two: unknown, three: unknown) => {
        const split = shotSplit(two, three);
        if (!split) return;
        sector(x, yy, radius, 0, split.share2, palette.primary);
        sector(x, yy, radius, split.share2, 1 - split.share2, palette.secondary);
        doc.setFont("helvetica", "normal"); doc.setFontSize(7);
        doc.setTextColor(...black);
        doc.text("Tirs tentés", x + radius + 3, yy - 3);
        doc.text(`2 pts · ${formatScoutingStat(split.p2)} (${formatScoutingStat(split.share2 * 100)} %)`, x + radius + 3, yy + 1);
        doc.text(`3 pts · ${formatScoutingStat(split.p3)} (${formatScoutingStat((1 - split.share2) * 100)} %)`, x + radius + 3, yy + 5);
      };

      const includedTeamMetrics = teamMetrics.filter(([key]) => !gp.scouting.hiddenPdfTeamStats?.includes(key));
      const includeTeamSection = (key: string) => !gp.scouting.hiddenPdfTeamSections?.includes(key);
      const showRanking = includeTeamSection("ranking") && Boolean(official?.ranking);
      const showShotChart = includeTeamSection("shotChart") &&
        !gp.scouting.hiddenPdfTeamStats?.some(key => key === "p2a" || key === "p3a") &&
        Boolean(shotSplit(teamStat("p2a"), teamStat("p3a")));
      const metricsHeight = includedTeamMetrics.length ? Math.ceil(includedTeamMetrics.length / 4) * 9 + 4 : 0;
      if (metricsHeight || showRanking || showShotChart) {
      ensure(8 + metricsHeight + (showRanking ? 6 : 0) + (showShotChart ? 20 : 0));
      title("Statistiques collectives");
      if (showRanking && official) {
        doc.setTextColor(...burgundy); doc.setFontSize(10);
        doc.text(`${official.ranking}e · ${official.competition}`, M, y);
        y += 6;
      }
      const metricWidth = (W - 2 * M) / 4;
      includedTeamMetrics.forEach(([key, label], index) => {
        const x = M + (index % 4) * metricWidth;
        const yy = y + Math.floor(index / 4) * 9;
        const n = teamStat(key);
        const color = gp.scouting.teamStatColors?.[key];
        doc.setFillColor(...(color === "green" ? [222, 241, 228] : color === "red" ? [250, 224, 227] : [249, 245, 241]));
        doc.rect(x, yy, metricWidth - 1, 8, "F");
        doc.setTextColor(...muted); doc.setFontSize(6.5); doc.text(label, x + 2, yy + 3);
        doc.setTextColor(...black); doc.setFontSize(9); doc.text(n == null ? "—" : formatScoutingStat(n), x + 2, yy + 7);
        const rank = gp.scouting.printCompetitionRanks ? official?.teamRanks?.[key] : undefined;
        if (rank) {
          const rankLabel = rank === 1 ? "1er" : `${rank}e`;
          const right = x + metricWidth - 3;
          doc.setFontSize(7);
          doc.setTextColor(103, 73, 19);
          doc.text(rankLabel, right, yy + 7, { align: "right" });
          if (rank === 1) {
            const crownX = right - doc.getTextWidth(rankLabel) - 5;
            doc.setFillColor(181, 129, 34);
            doc.lines([[0.5, 2.5], [3, 0], [0.5, -2.5], [-1.1, 0.9], [-0.9, -1.4], [-0.9, 1.4], [-1.1, -0.9]], crownX, yy + 4.5, [1, 1], "F", true);
          }
        }
      });
      y += metricsHeight;
      if (showShotChart) {
        pie(M + 8, y + 8, 8, teamStat("p2a"), teamStat("p3a"));
        y += 20;
      }
      }

      const summaryTable = (heading: string, columns: string[], values: string[][], widths: number[]) => {
        ensure(20 + values.length * 8);
        title(heading);
        const drawRow = (cells: string[], header: boolean, index: number) => {
          doc.setFillColor(header ? "#eee9e7" : index % 2 ? "#ffffff" : "#f9f5f1");
          doc.rect(M, y, W - 2 * M, 8, "F");
          doc.setFont("helvetica", header ? "bold" : "normal");
          doc.setTextColor(...(header ? burgundy : black)); doc.setFontSize(8);
          let x = M;
          cells.forEach((cell, column) => {
            const lines = doc.splitTextToSize(cell, widths[column] - 4).slice(0, 2);
            doc.text(lines, x + 2, y + (lines.length === 2 ? 3 : 5));
            x += widths[column];
          });
          y += 8;
        };
        drawRow(columns, true, 0);
        values.forEach((row, index) => drawRow(row, false, index));
        y += 5;
      };
      const tableWidth = W - 2 * M;
      const showStat = (value: number | null) => value == null ? "—" : formatScoutingStat(value);
      if (includeTeamSection("points") && !gp.scouting.hiddenPdfTeamStats?.some(key => key === "pointsFor" || key === "pointsAgainst")) summaryTable("Points par match", ["Situation", "MJ", "Marqués", "Encaissés"],
        splits.map(row => [row.label, String(row.games), showStat(row.forPoints), showStat(row.against)]),
        [0.4, 0.15, 0.225, 0.225].map(part => part * tableWidth));
      if (recent.length && includeTeamSection("form")) summaryTable("Forme du moment", ["Date", "Adversaire", "Lieu", "Score", "Résultat"],
        recent.map(match => [match.date.split("-").reverse().join("/"), match.opponent, match.venue,
          `${match.forPoints}–${match.against}`, match.outcome === "V" ? "Victoire" : match.outcome === "D" ? "Défaite" : "Nul"]),
        [0.16, 0.38, 0.18, 0.14, 0.14].map(part => part * tableWidth));

      const side = gp.scouting.highlightSide ?? "attaque";
      const highlights = scoutingHighlights(actions, side, gp.scouting.highlightMatchIds);
      if (highlights.length && includeTeamSection("highlights")) {
        ensure(62);
        title(`Temps forts · ${side === "attaque" ? "attaque" : "défense"}`);
        const colors = [palette.primary, palette.secondary, ...highlightColors.slice(2)];
        let offset = 0;
        highlights.forEach((row, index) => {
          sector(M + 14, y + 16, 13, offset, row.share, colors[index % colors.length]);
          offset += row.share;
        });
        const headings = () => {
          doc.setFont("helvetica", "bold"); doc.setFontSize(7); doc.setTextColor(...burgundy);
          doc.text("Temps fort", M + 37, y);
          doc.text("Poss.", M + 118, y);
          doc.text("Part", M + 135, y);
          doc.text(side === "attaque" ? "Pts" : "Pts encaissés", M + 151, y);
          doc.text("Pts / poss.", M + 170, y);
          y += 5;
        };
        const startY = y;
        const chartPage = doc.getNumberOfPages();
        headings();
        highlights.forEach((row, index) => {
          if (y + 6 > H - M) { ensure(6); headings(); }
          const color = colors[index % colors.length];
          doc.setFillColor(color); doc.circle(M + 34, y - 1, 1, "F");
          doc.setFont("helvetica", "normal"); doc.setFontSize(7); doc.setTextColor(...black);
          doc.text(row.label, M + 37, y, { maxWidth: 78 });
          doc.text(String(row.possessions), M + 118, y);
          doc.text(`${formatScoutingStat(row.share * 100)} %`, M + 135, y);
          doc.text(String(row.points), M + 151, y);
          doc.text(row.ppp.toLocaleString("fr-FR", { maximumFractionDigits: 2 }), M + 170, y);
          y += 6;
        });
        if (doc.getNumberOfPages() === chartPage && y < startY + 32) y = startY + 32;
        y += 4;
      }
      box("Ce qu’on retient des temps forts", gp.scouting.highlightNotes || "");

      const depthIds = Array.from({ length: 5 }, (_, i) => [...new Set(gp.scouting.depthChart?.[String(i + 1)] || [])]
        .map(id => scoutPlayers.find(player => player.id === id)).filter(Boolean).slice(0, 3));
      const depthRows = Math.max(...depthIds.map(column => column.length));
      if (depthRows) {
        ensure(18 + depthRows * 10);
        title("Répartition par poste");
        const width = (W - M * 2) / 5;
        for (const [index, column] of depthIds.entries()) {
          const x = M + index * width;
          doc.setFillColor(245, 235, 233); doc.rect(x, y, width - 1, 5, "F");
          doc.setTextColor(...burgundy); doc.setFontSize(7);
          doc.text(String(index + 1), x + 2, y + 3.5);
          for (const [r, player] of column.entries()) {
            if (!player) continue;
            const rowY = y + 6 + r * 10;
            const photo = cards.get(player.id)?.photo || player.photo || officialPlayers.get(player.id)?.person?.photo?.md;
            const avatar = photo && await circularScoutingPhoto(photo);
            if (avatar) doc.addImage(avatar, "PNG", x + 1, rowY, 7, 7);
            doc.setTextColor(...black); doc.setFont("helvetica", "normal"); doc.setFontSize(7);
            doc.text(doc.splitTextToSize(playerLabel(player), width - (avatar ? 11 : 4)).slice(0, 2), x + (avatar ? 9 : 2), rowY + 3);
          }
        }
        y += 8 + depthRows * 10;
      }

      const pair = (offLabel: string, off: string, defLabel: string, def: string, accent: boolean) => {
        if (!hasText(off) && !hasText(def)) return;
        const width = (W - 2 * M - 3) / 2;
        doc.setFont("helvetica", "normal"); doc.setFontSize(8.5);
        const columns = [[offLabel, off], [defLabel, def]].map(([label, txt]) => ({
          label, lines: hasText(txt) ? doc.splitTextToSize(txt, width - 8) as string[] : [],
        }));
        const count = Math.max(...columns.map(column => column.lines.length));
        for (let start = 0; start < count; start += 45) {
          const height = 9 + Math.min(45, count - start) * 3.6;
          ensure(height + 4);
          columns.forEach(({ label, lines }, index) => {
            if (lines.length <= start) return;
            const x = M + index * (width + 3);
            doc.setFillColor(249, 245, 241); doc.roundedRect(x, y, width, height, 2, 2, "F");
            doc.setFillColor(...(accent ? burgundy : gold)); doc.rect(x, y + 2, 1, height - 4, "F");
            doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...burgundy);
            doc.text(label, x + 4, y + 5);
            doc.setFont("helvetica", "normal"); doc.setFontSize(8.5); doc.setTextColor(...black);
            doc.text(lines.slice(start, start + 45), x + 4, y + 9);
          });
          y += height + 4;
        }
      };
      pair("Tendances offensives", gp.scouting.offense || gp.scouting.style, "Tendances défensives", gp.scouting.defense || gp.scouting.defensivePlan, false);
      pair("Nos clés offensives", gp.scouting.offensiveKeys || "", "Nos clés défensives", gp.scouting.defensiveKeys || "", true);

      const scoutSystems = [...new Map(gp.librarySystems.filter(system => sysSection(system) === "scout").map(system => [system.id, system])).values()];
      if (scoutSystems.length) {
        startPdfPage();
        const perRow = scoutingCourtsPerRow(gp.scouting.topPlaysCourtsPerRow);
        const layout = courtDiagramLayout(W - 2 * M, perRow, true);
        const { width, gap, height } = layout;
        const rowHeight = height + 10;
        const systemHeading = (label: string) => {
          doc.setTextColor(...burgundy);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(10);
          doc.text(label, M, y);
          y += 5;
        };

        for (const [systemIndex, system] of scoutSystems.entries()) {
          const phases = system.schemaImages?.filter(Boolean);
          const images = phases?.length ? phases : [system.schemaImage].filter(Boolean);
          const response = gp.scouting.playNotes?.[system.id] || "";
          const responseLines = boxLines(response);
          const responseSpace = responseLines.length ? 12 + responseLines.length * 4.2 : 0;
          const rowCount = Math.ceil(images.length / perRow);
          const lastRowSpace = rowHeight + responseSpace <= H - 2 * M - 13 ? rowHeight + responseSpace : rowHeight;
          const firstRowSpace = 5 + (rowCount === 1 ? lastRowSpace : rowCount ? rowHeight : responseSpace);
          if (systemIndex === 0 || y + firstRowSpace > H - M) {
            if (systemIndex > 0) startPdfPage();
            title("Top plays");
          }
          systemHeading(system.title);

          for (let start = 0; start < images.length; start += perRow) {
            const row = images.slice(start, start + perRow);
            const space = start + perRow >= images.length ? lastRowSpace : rowHeight;
            if (start > 0 && y + space > H - M) {
              ensure(13 + space);
              title("Top plays");
              systemHeading(`${system.title} (suite)`);
            }
            for (const [column, src] of row.entries()) {
              const image = src ? await imageToDataUrl(src) : null;
              const x = M + column * (width + gap);
              drawCourtDiagram(doc, image, x, y, layout, start + column + 1);
            }
            y += rowHeight;
          }
          box("Notre réponse", response);
          y += 3;
        }
      }
      const selectedPlayers = scoutPlayers.filter(player => !selected || selected.has(player.id));
      if (selectedPlayers.length) {
        startPdfPage();
        let playerHeadingPending = true;
        const shotsByPlayer = scoutingShotsByPlayer(actions);
        let shotCourt: string | null | undefined;
        for (const player of selectedPlayers) {
          const card = cards.get(player.id);
          const row = officialPlayers.get(player.id);
          const p = row ? fillLnbIdentity(player, row) : player;
          const stats = card?.liveStats ?? officialPlayerStats(row) ?? localPlayers.get(p.id);
          const x = M + 30;
          const width = W - M - x - 4;
          const profiles = [card?.profile, card?.profile2].flatMap(profile => {
            const label = scoutingProfileLabel(profile);
            return label ? [{ label, src: scoutingProfileIcon(profile) }] : [];
          });
          const profileWidth = 24;
          const identityWidth = width - profiles.length * profileWidth - (profiles.length ? 3 : 0);
          doc.setFont("helvetica", "bold"); doc.setFontSize(11);
          const nameLines: string[] = doc.splitTextToSize(playerLabel(p), identityWidth);
          const details = [p.poste || p.postePrincipal, (card?.taille || p.taille) ? `${card?.taille || p.taille} cm` : "", p.age ? `${p.age} ans` : "", row?.person?.nationality, card?.mainDominante || p.mainDominante].filter(Boolean).join(" · ");
          doc.setFont("helvetica", "normal"); doc.setFontSize(8);
          const detailLines: string[] = details ? doc.splitTextToSize(details, identityWidth) : [];
          const detailsY = 6 + nameLines.length * 4.5;
          doc.setFontSize(7);
          const profileLabels: string[][] = profiles.map(({ label }) => doc.splitTextToSize(label, profileWidth - 2));
          const statsY = Math.max(16, detailsY + detailLines.length * 3.4, ...profileLabels.map(lines => 15.5 + lines.length * 3));
          doc.setFontSize(8);
          const noteGap = 2;
          const noteWidth = (W - 2 * M - 6 - 2 * noteGap) / 3;
          const noteBlocks = scoutingPlayerNoteFields.map(({ key, label, legacy }) => {
            const value = (card?.[key] ?? (legacy ? card?.[legacy] : "") ?? "").trim();
            return { label, lines: value ? doc.splitTextToSize(value, noteWidth - 6) as string[] : [] };
          });
          const includedPlayerMetrics = compactPlayerMetrics.filter(key => !card?.hiddenPdfStats?.includes(key));
          const showPlayerChart = !card?.hidePdfShotChart && Boolean(shotSplit(stats?.["2T"], stats?.["3T"]));
          const afterStats = statsY + (includedPlayerMetrics.length ? 6 : 0);
          const shotZones = card?.printShotMap && !card.shotMapImage ? scoutingPlayerShotZones(shotsByPlayer, p) : [];
          if (shotZones.length && shotCourt === undefined) shotCourt = await imageToDataUrl(SCOUTING_SHOT_COURT);
          const shotImage = card?.printShotMap ? card.shotMapImage || (shotZones.length ? shotCourt : null) : null;
          const shotMapWidth = 72;
          let shotMapHeight = 0;
          let shotMapDrawWidth = shotMapWidth;
          if (shotImage) {
            const ratio = card?.shotMapImage ? (() => {
              try {
                const image = doc.getImageProperties(shotImage);
                return image.height / image.width;
              } catch { return 0; }
            })() : COURT_H / COURT_W;
            if (ratio > 0) {
              shotMapHeight = Math.min(65, shotMapWidth * ratio);
              shotMapDrawWidth = shotMapHeight / ratio;
            }
          }
          const shotMapY = afterStats + 5;
          const shotMapX = x + width - shotMapDrawWidth;
          const notesY = Math.max(36, afterStats + (showPlayerChart ? 17 : 5),
            shotMapHeight ? shotMapY + shotMapHeight + 5 : 0);
          const noteLineCount = Math.max(...noteBlocks.map(block => block.lines.length));
          const noteHeight = noteLineCount ? 9 + noteLineCount * 3.6 : 0;
          const firstNoteHeight = Math.min(noteHeight, H - 2 * M - 8 - notesY - 3);
          const height = notesY + (firstNoteHeight ? firstNoteHeight + 3 : 0);
          if (playerHeadingPending || y + height > H - M) {
            if (!playerHeadingPending) startPdfPage();
            title("Fiches joueurs");
            playerHeadingPending = false;
          }
          doc.setDrawColor(215, 200, 199); doc.setFillColor(252, 249, 246);
          doc.roundedRect(M, y, W - 2 * M, height, 2, 2, "FD");
          const photoUrl = card?.photo || p.photo;
          const photo = photoUrl ? await imageToDataUrl(photoUrl) : null;
          if (photo) doc.addImage(photo, "JPEG", M + 3, y + 4, 23, 28);
          doc.setTextColor(...burgundy); doc.setFont("helvetica", "bold"); doc.setFontSize(11);
          nameLines.forEach((line, index) => doc.text(line, x, y + 6 + index * 4.5));
          doc.setTextColor(...black); doc.setFont("helvetica", "normal"); doc.setFontSize(8);
          detailLines.forEach((line, index) => doc.text(line, x, y + detailsY + index * 3.4));
          for (const [index, { src }] of profiles.entries()) {
            const center = x + width - (profiles.length - index - 0.5) * profileWidth;
            const icon = src && await imageToDataUrl(src);
            if (icon) doc.addImage(icon, "PNG", center - 5, y + 3, 10, 10);
            doc.setFontSize(7);
            profileLabels[index].forEach((line, row) => doc.text(line, center, y + 15.5 + row * 3, { align: "center" }));
          }
          const cellWidth = width / Math.max(1, includedPlayerMetrics.length);
          includedPlayerMetrics.forEach((key, index) => {
            const value = stats?.[key];
            const dx = x + index * cellWidth;
            const dy = y + statsY;
            const color = card?.statColors?.[key];
            doc.setFillColor(...(color === "green" ? [222, 241, 228] : color === "red" ? [250, 224, 227] : [241, 232, 228]));
            doc.rect(dx, dy, cellWidth - 1, 6, "F");
            doc.setTextColor(...muted); doc.setFontSize(6.4); doc.text(key, dx + 1.2, dy + 2.2);
            doc.setTextColor(...black); doc.setFontSize(8); doc.text(value == null ? "—" : formatScoutingStat(value), dx + 1.2, dy + 5.3);
          });
          if (showPlayerChart) pie(x + 6, y + afterStats + 7, 6, stats?.["2T"], stats?.["3T"]);
          if (shotImage && shotMapHeight) {
            const top = y + shotMapY;
            doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...burgundy);
            doc.text(card?.shotMapImage ? "Carte de tirs · source externe" : "Carte de tirs · réussis / tentés", shotMapX, top - 1);
            doc.addImage(shotImage, card?.shotMapImage ? "JPEG" : "PNG", shotMapX, top, shotMapDrawWidth, shotMapHeight);
            shotZones.forEach(({ zone, made, attempts }) => {
              const cx = shotMapX + zone.px / COURT_W * shotMapDrawWidth;
              const cy = top + zone.py / COURT_H * shotMapHeight;
              doc.setFillColor(107, 26, 44);
              doc.roundedRect(cx - 2.9, cy - 1.15, 5.8, 2.3, .6, .6, "F");
              doc.setFont("helvetica", "bold"); doc.setFontSize(5.5); doc.setTextColor(255);
              doc.text(`${made}/${attempts}`, cx, cy + .65, { align: "center" });
            });
          }
          const drawNotes = (top: number, start: number, count: number) => {
            const blockHeight = 9 + count * 3.6;
            noteBlocks.forEach(({ label, lines }, index) => {
              const left = M + 3 + index * (noteWidth + noteGap);
              doc.setFillColor(245, 235, 233);
              doc.roundedRect(left, top, noteWidth, blockHeight, 2, 2, "F");
              doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...burgundy);
              doc.text(label, left + 3, top + 5);
              doc.setFont("helvetica", "normal"); doc.setTextColor(...black);
              lines.slice(start, start + count).forEach((line, row) => doc.text(line, left + 3, top + 9 + row * 3.6));
            });
          };
          const firstCount = noteHeight ? Math.max(0, Math.floor((firstNoteHeight - 9 + 0.001) / 3.6)) : 0;
          if (firstCount) drawNotes(y + notesY, 0, firstCount);
          y += height + 4;
          for (let start = firstCount; start < noteLineCount;) {
            startPdfPage();
            title("Fiches joueurs");
            doc.setFont("helvetica", "bold"); doc.setFontSize(10); doc.setTextColor(...burgundy);
            doc.text(`${playerLabel(p)} (suite)`, M, y, { maxWidth: W - 2 * M });
            y += 9;
            const count = Math.min(noteLineCount - start, Math.floor((H - M - y - 13) / 3.6));
            drawNotes(y, start, count);
            start += count;
            y += 13 + count * 3.6;
          }
        }
      }
    }

    const safeName = `${team.name || "game-plan"}-${gp.opponent || "match"}`.replace(/[^a-z0-9_-]+/gi, "-").replace(/-+/g, "-");
    const fileName = `${safeName}.pdf`;
    const dataUrl = doc.output("datauristring");
    if (options.download !== false) doc.save(fileName);
    return { dataUrl, fileName };
  } catch (error) {
    console.error("Export PDF impossible:", error);
    window.alert("Impossible de télécharger le PDF. Vérifie ta connexion puis réessaie.");
    return null;
  }
}

/** Imprime un document HTML sans dépendre des popups : iframe caché, fallback fenêtre. */
function printHtml(html: string) {
  try {
    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) throw new Error("iframe doc indisponible");
    doc.open();
    doc.write(html);
    doc.close();
    const done = () => {
      try {
        iframe.contentWindow?.focus();
        iframe.contentWindow?.print();
      } catch {}
      window.setTimeout(() => {
        try {
          document.body.removeChild(iframe);
        } catch {}
      }, 1000);
    };
    // laisse le temps aux images (logo / schémas) de se charger
    if (iframe.contentWindow) iframe.contentWindow.onload = done;
    window.setTimeout(done, 600);
  } catch {
    const w = window.open("", "_blank");
    if (!w) {
      window.alert("Autorise les popups pour imprimer/enregistrer le PDF.");
      return;
    }
    w.document.write(html + "<script>setTimeout(function(){window.print();},400)<\/script>");
    w.document.close();
  }
}

/* =============================== Styles =============================== */

const styles = `
  .gp { font-family:'Roboto',system-ui,sans-serif; color:#0F0F12; width:100%; min-width:0; }
  .gp-empty { background:#FFF8EF; border:1px dashed #D4A24C; border-radius:14px; padding:2rem; text-align:center; color:#6B1A2C; font-weight:800; }
  .gp-teambar { display:flex; align-items:center; gap:.6rem; margin-bottom:1rem; }
  .gp-teambar label { font-size:.72rem; font-weight:900; text-transform:uppercase; letter-spacing:.05em; color:#6B1A2C; }
  .gp-teambar select { padding:.55rem .85rem; border:1px solid #e1d8cc; border-radius:10px; background:#fff; color:#0f0f12; }
  .gp-hero { background:radial-gradient(circle at top left,#8A2038,#19070C 70%); color:#fff; border-radius:22px; padding:1.5rem; display:flex; justify-content:space-between; align-items:center; gap:1rem; margin-bottom:1rem; box-shadow:0 18px 50px rgba(107,26,44,.25); }
  .gp-kicker { margin:0 0 .2rem; color:#D4A24C; text-transform:uppercase; font-weight:900; letter-spacing:.08em; font-size:.75rem; }
  .gp-hero h2 { margin:0; font-size:2.3rem; text-transform:uppercase; letter-spacing:-.05em; }
  .gp-hero h2 span { color:#D4A24C; }
  .gp-hero p { margin:.35rem 0 0; color:rgba(255,255,255,.78); }
  .gp-drawbanner { display:flex; align-items:center; gap:.9rem; background:#FFF8E7; border:1px solid #D4A24C; border-radius:14px; padding:.7rem .9rem; margin-bottom:1rem; }
  .gp-drawbanner img { width:84px; height:54px; object-fit:cover; border-radius:8px; border:1px solid #e1d8cc; flex:0 0 auto; }
  .gp-drawph { width:54px; height:54px; display:grid; place-items:center; font-size:1.6rem; flex:0 0 auto; }
  .gp-drawtxt { flex:1; min-width:0; }
  .gp-drawtxt b { display:block; color:#6B1A2C; }
  .gp-drawtxt span { font-size:.82rem; color:#8a7b73; }
  .gp-drawactions { display:flex; gap:.5rem; flex-wrap:wrap; }
  .gp-heroactions { display:flex; align-items:center; justify-content:flex-end; gap:.55rem; flex-wrap:wrap; }
  .gp-mainexport,.gp-reset,.gp-btn.black { border:none; background:#6B1A2C; color:#fff; border-radius:12px; padding:.75rem 1rem; font-weight:900; cursor:pointer; }
  .gp-mainexport { background:#D4A24C; color:#1A0F12; }
  .gp-reset { background:rgba(255,255,255,.11); color:#fff; border:1px solid rgba(255,255,255,.25); }
  .gp-trash { display:grid; place-items:center; }
  .gp-saved-plans { margin-bottom:1rem; }
  .gp-saved-plans ul { list-style:none; padding:0; margin:0; }
  .gp-saved-plans li { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:.5rem; padding:.65rem 0; border-bottom:1px solid #eadfe1; }
  .gp-saved-plans small { display:block; margin-top:.25rem; }
  .gp-reset:hover { background:rgba(255,255,255,.18); }
  .gp-mainsteps{display:grid!important;grid-template-columns:repeat(3,1fr)!important;gap:8px!important;border:0!important;background:#f7f1eb!important;padding:6px!important;border-radius:14px!important}.gp-mainsteps button{display:flex!important;align-items:center!important;justify-content:center!important;gap:8px!important;border:0!important;border-radius:10px!important;padding:11px!important}.gp-mainsteps button>span{width:23px;height:23px;display:grid;place-items:center;border-radius:50%;background:#eadfd5;color:#6B1A2C;font-size:.7rem;font-weight:950}.gp-mainsteps button.active{background:#6B1A2C!important;color:#fff!important;border:0!important}.gp-mainsteps button.active>span{background:#D4A24C;color:#fff}.gp-tools{display:flex;align-items:center;justify-content:flex-end;gap:6px;margin:-6px 0 12px}.gp-tools>span{font-size:.6rem;text-transform:uppercase;color:#9a8d85;font-weight:900;margin-right:3px}.gp-tools button{border:1px solid #e1d6cc;background:#fff;color:#6B1A2C;border-radius:8px;padding:6px 9px;font-size:.65rem;font-weight:850;cursor:pointer}.gp-tools button.active{background:#fff4dc;border-color:#D4A24C}.gp-match-next{display:flex;align-items:center;justify-content:space-between;gap:15px;border:1px solid #eadfce;background:#fffaf2;border-radius:14px;padding:13px 15px;margin-bottom:14px}.gp-match-next b,.gp-match-next span{display:block}.gp-match-next b{color:#6B1A2C}.gp-match-next span{font-size:.7rem;color:#877a72;margin-top:2px}.gp-match-next button{border:0;background:#6B1A2C;color:#fff;border-radius:9px;padding:9px 12px;font-weight:900;cursor:pointer}@media(max-width:650px){.gp-mainsteps{grid-template-columns:1fr!important}.gp-tools{justify-content:flex-start;margin-top:0}.gp-match-next{align-items:flex-start;flex-direction:column}}
  .gp-tabs { display:flex; gap:.55rem; margin-bottom:1rem; padding:.35rem; background:#FFF9F0; border:1px solid #eadfce; border-radius:16px; overflow-x:auto; }
  .gp-tabs button { border:none; background:transparent; padding:.75rem 1rem; cursor:pointer; font-weight:900; color:#7b6f69; border-radius:12px; transition:.18s ease; }
  .gp-tabs button:hover { background:#fff; color:#6B1A2C; }
  .gp-tabs button.active { color:#fff; background:#6B1A2C; box-shadow:0 10px 24px rgba(107,26,44,.18); }
  .gp-layout { display:grid; grid-template-columns:minmax(0,1fr) 390px; gap:1.15rem; align-items:start; }
  .gp-card,.gp-preview { background:#fff; border:1px solid #ece3d6; border-radius:18px; padding:1.05rem; margin-bottom:1rem; box-shadow:0 14px 38px rgba(60,30,20,.07); }
  .gp-card.dark { background:#111; color:#fff; border-color:rgba(255,255,255,.12); }
  .gp-cardhead { display:flex; align-items:center; justify-content:space-between; gap:1rem; border-bottom:1.5px solid #D4A24C; padding-bottom:.6rem; margin-bottom:.8rem; }
  .gp-cardhead.soft { margin-top:1rem; }
  .gp-cardhead h3 { margin:0; color:#6B1A2C; font-weight:900; text-transform:uppercase; font-size:1rem; }
  .gp-card.dark .gp-cardhead h3 { color:#D4A24C; }
  .gp-sub { color:#8a7b73; font-size:.78rem; font-style:italic; }
  .gp-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:.8rem; }
  .gp-grid4 { display:grid; grid-template-columns:2fr 1.15fr 1fr 1.7fr; gap:.85rem; align-items:end; }
  .gp-field { margin-bottom:.85rem; }
  .gp-field label { display:block; font-size:.72rem; font-weight:900; color:#6B1A2C; text-transform:uppercase; letter-spacing:.04em; margin-bottom:.35rem; }
  .gp-card.dark .gp-field label { color:#D4A24C; }
  .gp :global(input),.gp :global(textarea),.gp :global(select) { width:100%; border:1px solid #e1d8cc; border-radius:10px; padding:.7rem .85rem; font-size:.95rem; line-height:1.5; font-family:inherit; color:#0F0F12; background:#fff; resize:vertical; box-sizing:border-box; }
  .gp :global(textarea) { min-height:130px; display:block; width:100% !important; max-width:100% !important; box-sizing:border-box; cursor:text; }
  .gp-endblock :global(textarea) { min-height:150px; }
  .gp-card.dark :global(input),.gp-card.dark :global(textarea) { background:#fff; color:#201a1c; border:2px solid #d9d3d0; box-shadow:none; }
  .gp :global(input:focus),.gp :global(textarea:focus) { outline:none; border-color:#6B1A2C; box-shadow:0 0 0 3px rgba(107,26,44,.1); }
  .gp-syschips { display:flex; flex-wrap:wrap; gap:.4rem; margin:.2rem 0 .6rem; }
  .gp-syschip { display:inline-flex; align-items:center; gap:.4rem; background:#FFF1F2; border:1px solid #e8c9cf; color:#6B1A2C; border-radius:999px; padding:.3rem .65rem; font-size:.8rem; font-weight:700; }
  .gp-syschip button { border:none; background:none; cursor:pointer; color:#a44; font-weight:900; }
  .gp-endactions { display:flex; gap:.5rem; flex-wrap:wrap; }
  .gp-actionline,.gp-actions { display:flex; justify-content:flex-end; gap:.6rem; flex-wrap:wrap; }
  .gp-actionline button,.gp-add,.gp-btn { border-radius:10px; padding:.6rem .85rem; font-weight:900; cursor:pointer; font-family:inherit; }
  .gp-actionline button,.gp-add { border:1px solid #6B1A2C; background:#fff; color:#6B1A2C; }
  .gp-card.dark .gp-actionline button { background:#D4A24C; color:#1A0F12; border:none; }
  .gp-actioncards { display:grid; grid-template-columns:repeat(3,1fr); gap:.9rem; margin-bottom:1rem; }
  .gp-actioncards button { min-height:118px; text-align:left; border-radius:20px; border:1px solid #ece3d6; background:linear-gradient(180deg,#fff,#fffaf4); padding:1rem; cursor:pointer; box-shadow:0 14px 34px rgba(60,30,20,.07); transition:.18s ease; }
  .gp-actioncards button:hover { transform:translateY(-2px); box-shadow:0 18px 42px rgba(60,30,20,.12); border-color:#D4A24C; }
  .gp-actioncards button.red { background:linear-gradient(135deg,#6B1A2C,#2B0B13); color:#fff; border-color:transparent; }
  .gp-actioncards button.ghost { border-style:dashed; background:#fff; }
  .gp-actioncards b { display:block; font-size:1rem; margin-bottom:.45rem; }
  .gp-actioncards span { color:inherit; opacity:.72; line-height:1.35; }
  .gp-systemgrid { display:grid; grid-template-columns:repeat(3,1fr); gap:.8rem; }
  .gp-systemgrid.small { grid-template-columns:repeat(2,1fr); }
  .gp-systemgrid.special { margin:.65rem 0 .75rem; }
  .gp-system.mini-card { min-height:auto; }
  .gp-system.mini-card img,.gp-system.mini-card .gp-schema { height:130px; }
  .gp-system { position:relative; background:linear-gradient(180deg,#fff,#FBF7F1); border:1px solid #eadfce; border-radius:16px; padding:.85rem; box-shadow:0 8px 22px rgba(60,30,20,.05); }
  .gp-system img { width:100%; border-radius:10px; display:block; margin-bottom:.6rem; }
  .gp-schema { height:110px; background:linear-gradient(135deg,#D4A24C,#F3D89B); color:#412400; border-radius:10px; display:grid; place-items:center; font-weight:900; margin-bottom:.6rem; }
  .gp-priority { position:absolute; top:.75rem; left:.75rem; background:#6B1A2C; color:#fff; border-radius:8px; padding:.35rem .55rem; font-weight:900; }
  .gp-system h4 { margin:0; color:#6B1A2C; }
  .gp-system p { margin:.2rem 0 .45rem; color:#777; font-size:.82rem; }
  .gp-system strong { display:block; font-size:.75rem; color:#111; }
  .gp-systemactions { display:flex; gap:.5rem; margin-top:.7rem; }
  .gp-systemactions button,.gp-system > button { flex:1; border:1px solid #ddd; background:#fff; border-radius:8px; padding:.45rem; cursor:pointer; }
  .gp-match-notes { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:.85rem; margin-top:1rem; padding-top:1rem; border-top:1px solid rgba(255,255,255,.12); }
  .gp-match-notes :global(textarea) { min-height:145px; line-height:1.5; }
  .gp-plan-card { background:linear-gradient(180deg,#fff,#fffaf4); }
  .gp-plan-objectives { display:grid; grid-template-columns:1.1fr 1fr 1fr; gap:.85rem; }
  .gp-plan-box { background:#fff; border:1px solid #eadfce; border-radius:16px; padding:.85rem; box-shadow:inset 0 0 0 1px rgba(255,255,255,.45); }
  .gp-plan-box.main { background:#FFF7E8; border-color:#E8C77F; }
  .gp-plan-box :global(textarea) { min-height:150px; }
  .gp-endblock { background:linear-gradient(180deg,#fff,#FAF7F2); border:1px solid #eadfce; border-radius:18px; padding:1rem; margin-bottom:.9rem; box-shadow:0 8px 24px rgba(60,30,20,.045); }
  .gp-endblock .gp-field { margin-bottom:.65rem; }
  .gp-endblock :global(textarea) { min-height:120px; background:#fff; }
  .gp-endblock:hover { border-color:#D4A24C; }
  .gp-kplist { display:flex; flex-direction:column; gap:.5rem; }
  .gp-kprow { display:grid; grid-template-columns:1.3fr 1fr auto; gap:.5rem; align-items:center; }
  .gp-drawings { display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:.7rem; margin:.7rem 0; }
  .gp-drawing { background:#fff; border:1px solid #eadfce; border-radius:12px; padding:.55rem; }
  .gp-drawing__top { display:flex; align-items:center; gap:.4rem; margin-bottom:.45rem; }
  .gp-drawing__top input { flex:1; min-width:0; padding:.35rem .45rem; font-size:.78rem; }
  .gp-drawing img { width:100%; border-radius:8px; display:block; }
  .gp-x { border:none; background:none; cursor:pointer; }
  .gp-badge { font-size:.72rem; font-weight:900; padding:.25rem .55rem; border-radius:999px; color:#fff; }
  .gp-badge.ok { background:#16a34a; }
  .gp-badge.off { background:#9ca3af; }
  .gp-muted { color:#8a7b73; font-size:.9rem; }
  .gp-toggle { display:flex; align-items:center; gap:.5rem; background:#FAF7F0; padding:.65rem; border-radius:10px; cursor:pointer; }
  .gp-toggle input { width:18px; height:18px; accent-color:#6B1A2C; }
  .gp-rotrecap { margin-top:.7rem; background:#FAFAFA; padding:.7rem; border-radius:10px; font-size:.82rem; line-height:1.7; }
  .gp-rotrecap b { color:#6B1A2C; }
  .gp-preview { position:sticky; top:1rem; padding:1.2rem; }
  .gp-preview h3 { margin:0 0 .75rem; color:#6B1A2C; text-transform:uppercase; }
  .gp-a4 { background:#fff; border:1px solid #ddd; box-shadow:0 15px 35px rgba(0,0,0,.10); min-height:620px; padding:1.2rem; }
  .gp-a4 h4 { margin:0; color:#6B1A2C; font-size:1.8rem; }
  .gp-a4 p { margin:.25rem 0; }
  .gp-a4 ul { padding-left:1.1rem; font-size:.82rem; }
  .gp-minirow { display:grid; grid-template-columns:repeat(3,1fr); gap:.4rem; margin:.5rem 0; }
  .gp-minirow span { display:block; height:48px; background:#E6BE7C; border-radius:6px; margin-bottom:.25rem; }
  .gp-minirow small,.mini { font-size:.75rem; }
  .gp-actions { margin-top:1rem; }
  .gp-saved { color:#16a34a; font-weight:900; margin-right:auto; }
  .gp-btn.ghost { border:1px solid #6B1A2C; background:#fff; color:#6B1A2C; }
  .de-bg { position:fixed; inset:0; background:rgba(0,0,0,.65); z-index:6000; display:flex; align-items:flex-start; justify-content:center; padding:2rem 1rem; overflow:auto; }
  .de { background:#fff; border-radius:18px; width:100%; max-width:680px; padding:1.4rem; box-shadow:0 25px 80px rgba(0,0,0,.35); }
  .de h3 { margin:0 0 1rem; color:#6B1A2C; text-transform:uppercase; }
  .de-tools { display:flex; align-items:center; gap:.7rem; flex-wrap:wrap; margin-bottom:.8rem; }
  .de-tools > input[type="text"] { flex:1; min-width:220px; }
  .de-tools label { display:flex; align-items:center; gap:.35rem; font-size:.8rem; color:#555; }
  .de-tools button { border:1px solid #c5283d; color:#c5283d; background:#fff; border-radius:9px; padding:.45rem .75rem; cursor:pointer; }
  .de-canvaswrap { width:100%; aspect-ratio:9/7; border:1px solid #e1d8cc; border-radius:12px; overflow:hidden; position:relative; }
  .de-canvaswrap canvas { position:absolute; inset:0; width:100%; height:100%; cursor:crosshair; touch-action:none; }
  .de-actions { display:flex; justify-content:flex-end; gap:.6rem; margin-top:1rem; }
  .de-ghost,.de-black { border-radius:10px; padding:.7rem 1.15rem; font-weight:900; cursor:pointer; }
  .de-ghost { border:1px solid #ddd; background:#fff; }
  .de-black { border:none; background:#6B1A2C; color:#fff; }
  .gp-matchstrip{display:grid;grid-template-columns:minmax(250px,.9fr) minmax(420px,1.45fr) auto;gap:12px;align-items:center;background:linear-gradient(180deg,#fff,#fffaf5);border:1px solid #eadfce;border-radius:18px;padding:12px 14px;margin-bottom:1rem;box-shadow:0 10px 26px rgba(60,30,20,.055)}
  .gp-matchidentity{display:flex;align-items:center;gap:10px;min-width:0}.gp-matchdot{width:42px;height:42px;display:grid;place-items:center;border-radius:12px;background:#6B1A2C;color:#fff;flex:0 0 auto}.gp-matchidentity small,.gp-matchidentity strong,.gp-matchidentity span{display:block}.gp-matchidentity small{color:#D4A24C;font-size:.62rem;font-weight:950;letter-spacing:.08em}.gp-matchidentity strong{color:#2b1d22;font-size:.92rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gp-matchidentity strong i{color:#a08f88;font-style:normal;font-weight:500;padding:0 3px}.gp-matchidentity span{color:#8a7b73;font-size:.68rem;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.gp-matchfields{display:grid;grid-template-columns:1.25fr 1fr .8fr 1.25fr;gap:6px}.gp-matchfields input{padding:.55rem .62rem!important;min-width:0;font-size:.78rem!important}.gp-matchactions{display:flex;align-items:center;justify-content:flex-end;gap:5px}.gp-matchactions button{border:1px solid #d7c9bc;background:#fff;color:#6B1A2C;border-radius:9px;padding:7px 9px;font-size:.68rem;font-weight:900;cursor:pointer;white-space:nowrap}.gp-matchactions button.main{border-color:#6B1A2C;background:#6B1A2C;color:#fff}
  .gp-scout-intro{display:flex;justify-content:space-between;align-items:center;gap:16px;background:linear-gradient(135deg,#6B1A2C,#2b0b13);color:#fff;border-radius:18px;padding:17px 18px;margin-bottom:12px}.gp-scout-intro small{color:#D4A24C;font-size:.66rem;font-weight:950;letter-spacing:.08em}.gp-scout-intro h3{margin:3px 0;font-size:1.05rem}.gp-scout-intro p{margin:0;max-width:650px;color:rgba(255,255,255,.72);font-size:.78rem}.gp-scout-intro button{border:0;background:#D4A24C;color:#241217;border-radius:10px;padding:10px 12px;font-weight:950;cursor:pointer;white-space:nowrap}.gp-import-board{background:#fff;border:1px solid #eadfce;border-radius:18px;padding:14px;margin-bottom:12px}.gp-import-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.gp-import{display:grid;grid-template-columns:40px minmax(0,1fr);gap:9px;border:1px solid #eee3d6;border-radius:13px;padding:11px;background:#fffaf4;min-width:0}.gp-import.clip{border-color:#dbc7cd;background:#fff7f8}.gp-import-icon{width:40px;height:40px;border-radius:10px;background:#fff;display:grid;place-items:center;font-size:1.15rem;border:1px solid #eee3d6}.gp-import-content small{color:#a18f86;font-size:.63rem;text-transform:uppercase;font-weight:900}.gp-import-content h4{margin:2px 0 4px;color:#6B1A2C;font-size:.88rem}.gp-import-content ul{margin:0;padding-left:15px;color:#5e5652;font-size:.7rem;line-height:1.5}.gp-import-actions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:5px}.gp-import-actions button{border:1px solid #d8ccc0;background:#fff;color:#6B1A2C;border-radius:8px;padding:5px 8px;font-size:.63rem;font-weight:900;cursor:pointer}.gp-import-actions .remove{color:#9e2940}.gp-manual-note{display:flex;gap:10px;align-items:center;padding:10px 12px;border:1px solid #eadfce;border-radius:12px;margin-bottom:12px;background:#fffdf9;color:#6d625d;font-size:.75rem}.gp-manual-note b{color:#6B1A2C;white-space:nowrap}
  .gp-manual-details{border:1px solid #eadfce;border-radius:16px;background:#fff;overflow:hidden}.gp-manual-details>summary{list-style:none;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px;background:#fffaf4}.gp-manual-details>summary::-webkit-details-marker{display:none}.gp-manual-details>summary b,.gp-manual-details>summary span{display:block}.gp-manual-details>summary b{color:#6B1A2C}.gp-manual-details>summary span{color:#8a7b73;font-size:.7rem;margin-top:2px}.gp-manual-details>summary strong{color:#6B1A2C;font-size:.7rem;white-space:nowrap}.gp-manual-inside{padding:12px;background:#fff}
  .gp-keys-head{display:flex;justify-content:space-between;gap:14px;align-items:center;margin-bottom:10px}.gp-keys-head small{color:#D4A24C;font-weight:950;letter-spacing:.08em}.gp-keys-head h3{margin:2px 0;color:#6B1A2C;font-size:1.2rem}.gp-keys-head p{margin:0;color:#8a7b73;font-size:.78rem}.gp-keys-head>span{color:#16a34a;font-size:.7rem;font-weight:900}.gp-key-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-bottom:12px}.gp-keycard{background:linear-gradient(180deg,#fff,#fffaf4);border:1px solid #eadfce;border-radius:17px;padding:13px;box-shadow:0 9px 24px rgba(60,30,20,.05)}.gp-keycard-head{display:flex;align-items:center;gap:8px;margin-bottom:8px}.gp-keycard-head>span{width:36px;height:36px;display:grid;place-items:center;background:#fff4de;border-radius:10px}.gp-keycard-head b,.gp-keycard-head small{display:block}.gp-keycard-head b{color:#6B1A2C}.gp-keycard-head small{color:#998a82;font-size:.65rem;margin-top:2px}.gp-keycard textarea{min-height:185px!important;background:#fff!important}.gp-keycard p{margin:5px 0 0;color:#a08f86;font-size:.64rem}.gp-objective-light{background:#fffdf9}

.sb{display:grid;gap:12px}.sb-head{display:grid;grid-template-columns:1fr 1.3fr 1fr;align-items:center;background:#101012;color:#fff;border-radius:14px;overflow:hidden;min-height:78px;border-bottom:6px solid #d4a24c}.sb-club{display:flex;align-items:center;gap:10px;padding:12px 16px;font-size:.85rem}.sb-club.right{justify-content:flex-end}.sb-club img,.sb-club>span{width:48px;height:48px;object-fit:contain;border-radius:50%;background:#fff;display:grid;place-items:center}.sb-title{text-align:center}.sb-title strong,.sb-title small{display:block}.sb-title strong{font-size:1.18rem;letter-spacing:.05em}.sb-title small{color:#d4a24c;margin-top:4px}.sb-team-select{display:grid;grid-template-columns:120px minmax(220px,380px) 1fr;gap:9px;align-items:center;background:#fff7e8;border:1px solid #ead6ad;padding:10px 13px;border-radius:12px}.sb-team-select label{font-weight:950;color:#6b1a2c}.sb-team-select small{color:#8b7a70}.sb select,.sb textarea{border:1px solid #d9cec5;border-radius:8px;background:#fff;padding:8px;font:inherit}.sb-section{border:1px solid #d9d2cb;background:#fff;border-radius:12px;overflow:hidden}.sb-section>h3,.sb-section-head{margin:0;background:#171719;color:#fff;padding:8px 12px;font-size:.82rem;letter-spacing:.04em}.sb-section-head{display:flex;justify-content:space-between;align-items:center}.sb-section-head h3{margin:0;font-size:.82rem}.sb-section-head button,.sb-section-head select{background:#d4a24c;color:#171719;border:0;border-radius:7px;padding:6px 9px;font-weight:900}.sb-depth{display:grid;grid-template-columns:repeat(5,1fr)}.sb-depth>div{min-height:90px;border-right:1px solid #ddd;text-align:center}.sb-depth>div:last-child{border:0}.sb-depth b{display:block;background:#f0f0f0;padding:5px;font-size:.67rem}.sb-depth span{display:block;padding:5px 4px;font-size:.7rem;font-weight:800}.sb-depth select{width:calc(100% - 10px);margin:5px;font-size:.67rem}.sb-two{display:grid;grid-template-columns:1fr 1fr}.sb-three{display:grid;grid-template-columns:repeat(3,1fr)}.sb-two label,.sb-three label{padding:10px}.sb-two label+label,.sb-three label+label{border-left:1px solid #bbb}.sb-two b,.sb-three b{display:block;color:#6b1a2c;margin-bottom:5px}.sb-two textarea,.sb-three textarea{width:100%;min-height:160px;resize:vertical;box-sizing:border-box}.sb-statgrid{display:grid;grid-template-columns:repeat(3,1fr);gap:0;padding:10px}.sb-statgrid article{border-right:1px solid #bbb;padding:0 10px}.sb-statgrid article:last-child{border:0}.sb-statgrid article>div{display:grid;grid-template-columns:minmax(0,1fr) 82px 28px;gap:4px}.sb-statgrid article select{min-width:0;font-weight:900}.sb-statgrid article button{border:0;background:none;font-size:1.2rem}.sb-statgrid table{width:100%;border-collapse:collapse;font-size:.68rem;margin-top:5px}.sb-statgrid td{padding:4px;border-bottom:1px solid #eee}.sb-statgrid td:last-child{text-align:right}.sb-addstat{grid-column:1/-1;padding:16px;border:1px dashed #d4a24c;background:#fff8e8;border-radius:10px;font-weight:900;color:#6b1a2c}.sb-plays{padding:12px;display:grid;gap:14px}.sb-plays article>b{display:block;text-align:center;margin-bottom:6px}.sb-plays article>div{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}.sb-plays img{width:100%;aspect-ratio:4/3;object-fit:contain;border:1px solid #bbb;background:#fafafa}.sb-plays p{text-align:center;color:#888}.sb-player{display:grid;grid-template-columns:105px minmax(0,1fr) 190px;border-bottom:3px solid #171719;min-height:190px}.sb-player:last-child{border-bottom:0}.sb-player-photo{background:#eee;display:grid;place-items:center;overflow:hidden}.sb-player-photo img{width:100%;height:100%;object-fit:cover}.sb-player-photo span{font-size:2rem;font-weight:950;color:#6b1a2c}.sb-player-main{border-left:1px solid #aaa;border-right:1px solid #aaa}.sb-player-id{display:flex;justify-content:space-between;background:#4b4b4d;color:#fff;padding:6px 8px}.sb-player-id span{font-size:.68rem}.sb-player-stats{display:grid;grid-template-columns:repeat(9,1fr);background:#eee;border-bottom:1px solid #aaa}.sb-player-stats>div{text-align:center;padding:5px 2px;border-right:1px solid #ccc}.sb-player-stats small,.sb-player-stats b{display:block}.sb-player-stats small{font-size:.55rem}.sb-player-stats b{font-size:.72rem}.sb-player-edit{display:grid;grid-template-columns:230px 1fr auto;gap:7px;padding:8px}.sb-profiles{display:grid;gap:5px}.sb-player-edit textarea{min-height:78px}.sb-player-edit button{border:0;background:#fff0f0;color:#9b1c2d;font-weight:900}.sb-shot{padding:8px}.sb-shot>b{display:block;text-align:center;font-size:.7rem}.sb-shot>div{display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:6px}.sb-shot span{border:1px solid #ddd;border-radius:6px;padding:4px;text-align:center}.sb-shot small,.sb-shot strong,.sb-shot i{display:block;font-size:.55rem}.sb-shot strong{font-size:.78rem;color:#6b1a2c}.sb-shot i{font-style:normal;color:#888}@media(max-width:900px){.sb-head{grid-template-columns:1fr}.sb-club.right{justify-content:flex-start}.sb-title{order:-1;padding-top:10px}.sb-team-select,.sb-two,.sb-three,.sb-statgrid{grid-template-columns:1fr}.sb-depth{grid-template-columns:1fr 1fr}.sb-player{grid-template-columns:80px 1fr}.sb-shot{grid-column:1/-1}.sb-player-stats{grid-template-columns:repeat(5,1fr)}.sb-player-edit{grid-template-columns:1fr}}

  /* ===== Game Plan 2026 — version légère ===== */
  .gp-hero{background:#fff;color:#1f171a;border:1px solid #eadfce;border-left:5px solid #6B1A2C;border-radius:16px;padding:1rem 1.15rem;box-shadow:none}
  .gp-hero h2{font-size:1.8rem;color:#6B1A2C}.gp-hero p{color:#81736e;font-size:.82rem}.gp-reset{background:#fff!important;color:#6B1A2C!important;border:1px solid #d9c8c0!important}.gp-mainexport{box-shadow:none}
  .gp-tabs{background:#fff;border:0;border-bottom:1px solid #eadfce;border-radius:0;padding:0;gap:1.25rem}
  .gp-tabs button{border-radius:0;padding:.72rem .1rem;border-bottom:3px solid transparent}.gp-tabs button.active{background:transparent;color:#6B1A2C;box-shadow:none;border-bottom-color:#D4A24C}
  .gp-layout{display:block}.gp-layout>main{width:100%}
  .gp-card{box-shadow:none;border-radius:14px;padding:.9rem 1rem}
  .gp-matchbar{background:#fff;border:1px solid #eadfce;border-radius:16px;padding:14px 16px;margin-bottom:14px}
  .gp-matchsummary{display:flex;align-items:center;gap:10px;padding-bottom:12px;margin-bottom:12px;border-bottom:1px solid #f0e8df}.gp-matchlogo{width:40px;height:40px;display:grid;place-items:center;border-radius:12px;background:#fff4dc}.gp-matchsummary small,.gp-matchsummary strong,.gp-matchsummary span{display:block}.gp-matchsummary small{font-size:.62rem;color:#D4A24C;font-weight:950;letter-spacing:.07em}.gp-matchsummary strong{font-size:1rem;color:#6B1A2C;margin:1px 0}.gp-matchsummary span{font-size:.7rem;color:#8a7b73}
  .gp-matchcontrols{display:grid;grid-template-columns:1.35fr 1fr .8fr 1.25fr auto;gap:9px;align-items:end}.gp-matchcontrols label>span{display:block;font-size:.6rem;font-weight:900;text-transform:uppercase;color:#8d7e77;margin:0 0 4px}.gp-matchcontrols input{min-height:38px!important;padding:.5rem .65rem!important;font-size:.76rem!important}.gp-calendar-actions{display:flex;gap:6px}.gp-calendar-actions button{height:38px;border:1px solid #d9cec4;background:#fff;color:#6B1A2C;border-radius:9px;padding:0 10px;font-size:.67rem;font-weight:900;white-space:nowrap;cursor:pointer}.gp-calendar-actions button.primary,.gp-calendar-actions button.linked{background:#6B1A2C;color:#fff;border-color:#6B1A2C}
  .gp-plan-toolbar{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;padding:12px 14px;background:#fff8ec;border:1px solid #ead9bc;border-radius:14px}.gp-plan-toolbar small,.gp-plan-toolbar b,.gp-plan-toolbar span{display:block}.gp-plan-toolbar small{font-size:.58rem;color:#D4A24C;font-weight:950;letter-spacing:.08em}.gp-plan-toolbar b{color:#6B1A2C}.gp-plan-toolbar span{font-size:.68rem;color:#8a7b73}.gp-plan-toolbar>div:last-child{display:flex;gap:7px}.gp-plan-toolbar button{border:0;background:#6B1A2C;color:#fff;border-radius:9px;padding:8px 11px;font-weight:900;cursor:pointer}.gp-plan-toolbar button.soft{background:#fff;color:#6B1A2C;border:1px solid #d9c8c0}
  .gp-keys-inline{background:#fff;border:1px solid #eadfce;border-radius:14px;padding:1rem;margin-bottom:1rem}.gp-key-grid{gap:8px}.gp-keycard{box-shadow:none;border-radius:12px;padding:10px}.gp-keycard textarea{min-height:120px!important}.gp-thread{display:grid;grid-template-columns:130px minmax(0,1fr);align-items:center;gap:10px;margin-top:9px}.gp-thread span{font-size:.68rem;font-weight:900;color:#6B1A2C;text-transform:uppercase}.gp-thread input{min-height:38px!important}
  .gp-scout-head{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:2px 0 14px;border-bottom:1px solid #eadfce;margin-bottom:12px}.gp-scout-head small{font-size:.6rem;color:#D4A24C;font-weight:950;letter-spacing:.08em}.gp-scout-head h3{margin:2px 0;color:#6B1A2C;font-size:1.08rem}.gp-scout-head p{margin:0;color:#81736e;font-size:.75rem}.gp-scout-head button,.gp-section-title button{border:0;background:#6B1A2C;color:#fff;border-radius:9px;padding:8px 11px;font-weight:900;cursor:pointer;white-space:nowrap}
  .gp-scout-empty{display:flex;align-items:center;gap:12px;border:1px dashed #d9c8c0;background:#fffaf4;border-radius:14px;padding:18px;margin-bottom:12px}.gp-scout-empty>span{font-size:1.5rem}.gp-scout-empty b,.gp-scout-empty p{display:block;margin:0}.gp-scout-empty b{color:#6B1A2C}.gp-scout-empty p{color:#81736e;font-size:.72rem;margin-top:3px}
  .gp-first-import{width:100%;display:flex;align-items:center;gap:12px;text-align:left;border:1px dashed #D4A24C;background:#fffaf0;border-radius:14px;padding:18px;margin-bottom:12px;cursor:pointer}.gp-first-import>span{width:38px;height:38px;display:grid;place-items:center;background:#D4A24C;color:#fff;border-radius:11px;font-size:1.3rem}.gp-first-import b,.gp-first-import small{display:block}.gp-first-import b{color:#6B1A2C}.gp-first-import small{color:#8a7b73;margin-top:2px}
  .gp-scout-section,.gp-coach-analysis,.gp-player-notes{background:#fff;border:1px solid #eadfce;border-radius:14px;padding:13px;margin-bottom:12px}.gp-section-title{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}.gp-section-title small{display:block;font-size:.58rem;color:#D4A24C;font-weight:950;letter-spacing:.08em}.gp-section-title h4{margin:1px 0;color:#6B1A2C;font-size:.92rem}.gp-section-title>span{font-size:.64rem;color:#8a7b73}
  .gp-import-grid{grid-template-columns:repeat(3,minmax(0,1fr));gap:7px}.gp-import{background:#fff;border-radius:11px;padding:9px;grid-template-columns:34px minmax(0,1fr)}.gp-import-icon{width:34px;height:34px;border-radius:9px}.gp-import-content h4{font-size:.8rem}.gp-import-content ul{font-size:.65rem}.gp-import-actions button{font-size:.6rem}
  .gp-analysis-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.gp-analysis-grid label>span{display:block;font-size:.64rem;font-weight:900;color:#6B1A2C;text-transform:uppercase;margin-bottom:4px}.gp-analysis-grid textarea{min-height:92px!important;padding:.6rem .7rem!important;font-size:.78rem!important}
  .gp-player-note-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.gp-player-note-grid article{border:1px solid #eee3d6;border-radius:12px;padding:10px}.gp-player-note-grid article>div{display:flex;align-items:center;gap:8px;margin-bottom:7px}.gp-player-note-grid article>div>span{width:34px;height:34px;display:grid;place-items:center;background:#fff4dc;border-radius:9px}.gp-player-note-grid b,.gp-player-note-grid small{display:block}.gp-player-note-grid b{color:#6B1A2C;font-size:.82rem}.gp-player-note-grid small{color:#8a7b73;font-size:.62rem}.gp-player-note-grid textarea{min-height:78px!important;font-size:.75rem!important}
  .gp-actions{position:sticky;bottom:10px;z-index:20;background:rgba(255,255,255,.94);backdrop-filter:blur(8px);border:1px solid #eadfce;border-radius:13px;padding:8px 10px;box-shadow:0 8px 25px rgba(60,30,20,.08)}
  @media(max-width:1050px){.gp-matchcontrols{grid-template-columns:1fr 1fr}.gp-calendar-actions{grid-column:1/-1}.gp-import-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:720px){.gp-matchcontrols,.gp-analysis-grid,.gp-player-note-grid,.gp-import-grid{grid-template-columns:1fr}.gp-plan-toolbar,.gp-scout-head,.gp-section-title{align-items:flex-start;flex-direction:column}.gp-plan-toolbar>div:last-child{width:100%}.gp-plan-toolbar button{flex:1}.gp-thread{grid-template-columns:1fr}.gp-key-grid{grid-template-columns:1fr}}

  @media (max-width:1200px){ .gp-layout{ grid-template-columns:1fr; } .gp-preview{ position:static; } .gp-match-notes{grid-template-columns:1fr 1fr;} .gp-matchstrip{grid-template-columns:1fr;} .gp-matchactions{justify-content:flex-start;} }
  
  /* 2026-08-24 · champs Game Plan pleine largeur */
  .gp-field,.gp-field.block,.gp-endblock .gp-field{width:100%;min-width:0}
  .gp-key-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:stretch}
  .gp-keycard{min-width:0;width:100%;display:flex;flex-direction:column;box-sizing:border-box}
  .gp-keycard :global(textarea){display:block!important;width:100%!important;max-width:none!important;min-width:0!important;min-height:160px!important;flex:1;box-sizing:border-box!important}
  .gp-endblock{width:100%;box-sizing:border-box}
  .gp-endblock :global(textarea),.gp-field.block :global(textarea){display:block!important;width:100%!important;max-width:none!important;min-width:0!important;box-sizing:border-box!important}
  .gp-thread{width:100%}
  .gp-thread :global(input){width:100%!important;max-width:none!important;box-sizing:border-box!important}
  .gp-match-notes>*,.gp-plan-objectives>*,.gp-analysis-grid>*{min-width:0}
  .gp-match-notes :global(textarea),.gp-plan-box :global(textarea),.gp-analysis-grid :global(textarea),.gp-player-note-grid :global(textarea){
    display:block!important;width:100%!important;max-width:none!important;min-width:0!important;box-sizing:border-box!important;
  }
  @media(max-width:900px){.gp-key-grid{grid-template-columns:1fr}}

  
  /* 2026-08-24 · Situations spéciales compactes : schémas uniquement */
  .gp-special-card{padding:.9rem!important}
  .gp-special-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
  .gp-special-zone{min-width:0;border:1px solid #eadfce;border-radius:13px;background:#fffaf4;padding:10px;display:flex;flex-direction:column;gap:8px}
  .gp-special-zone-head{display:flex;align-items:center;justify-content:space-between;gap:8px}.gp-special-zone-head>b{font-size:.76rem;color:#6B1A2C;text-transform:uppercase}.gp-special-zone-head>span{font-size:.6rem;color:#95867f;font-weight:800}
  .gp-special-schemas{display:grid;grid-template-columns:1fr;gap:7px}.gp-special-schema{position:relative;min-width:0;border:1px solid #eadfd5;border-radius:10px;background:#fff;overflow:hidden}.gp-special-schema>img,.gp-special-schema>.gp-schema{width:100%;height:105px;object-fit:cover;margin:0;border-radius:0}.gp-special-schema .gp-priority{top:6px;left:6px;padding:.2rem .38rem;font-size:.65rem}.gp-special-schema-foot{display:flex;align-items:center;justify-content:space-between;gap:6px;padding:6px 7px}.gp-special-schema-foot>b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:.69rem;color:#6B1A2C}.gp-special-schema-foot>button{border:0;background:transparent;color:#a43b4d;font-size:1rem;font-weight:900;cursor:pointer}
  .gp-special-zone .gp-drawings{grid-template-columns:1fr;margin:0}.gp-special-zone .gp-drawing{padding:5px}.gp-special-zone .gp-drawing img{max-height:105px;object-fit:cover}.gp-special-empty{min-height:105px;display:grid;place-items:center;border:1px dashed #dbcfc4;border-radius:10px;color:#a09289;font-size:.68rem;background:#fff}
  .gp-special-actions{display:grid;grid-template-columns:1fr auto;gap:6px;margin-top:auto}.gp-special-actions .gp-add{width:100%;padding:.52rem .65rem;font-size:.68rem}.gp-special-actions .ghost{background:#fffaf4}
  @media(max-width:900px){.gp-special-grid{grid-template-columns:1fr}.gp-special-schemas{grid-template-columns:repeat(2,minmax(0,1fr))}}

  @media (max-width:760px){
    .gp-hero,.gp-grid2,.gp-grid4,.gp-actioncards,.gp-systemgrid,.gp-systemgrid.small { grid-template-columns:1fr; display:grid; }
    .gp-hero { display:grid; }
    .gp-actions,.gp-actionline { justify-content:stretch; }
    .gp-actions button,.gp-actionline button { width:100%; }
    .gp-kprow { grid-template-columns:1fr; } .gp-matchfields,.gp-key-grid,.gp-import-grid{grid-template-columns:1fr;} .gp-scout-intro,.gp-keys-head{align-items:flex-start;flex-direction:column;}
  }
`;