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
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { getTeams } from "@/lib/equipes-store";
import ScoutingModule from "./ScoutingModule";

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
};
type Team = { id: string; name?: string; cat?: string; logo?: string; players?: Player[] };

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

type GamePlan = {
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
  scouting: { team: "", coach: "", style: "", strengths: "", weaknesses: "", keyPlayers: [], watch: "", defensivePlan: "" },
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
    players: ((row?.players ?? row?.joueurs ?? row?.effectif ?? row?.roster ?? []) as any[]).map((p) => ({
      id: String(p?.id ?? p?.playerId ?? ""),
      firstName: p?.firstName ?? p?.prenom ?? (typeof p?.name === "string" ? p.name.split(" ")[0] : "") ?? "",
      lastName: p?.lastName ?? p?.nom ?? (typeof p?.name === "string" ? p.name.split(" ").slice(1).join(" ") : "") ?? "",
      num: p?.num ?? p?.numero ?? p?.number ?? "",
      poste: p?.poste ?? p?.postePrincipal ?? p?.position ?? "",
      photo: p?.photo ?? p?.photo_url ?? p?.avatar ?? "",
    })),
  };
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
    drawings: gp.drawings ?? EMPTY_GP.drawings,
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
  const supabase = useMemo(() => createClient(), []); // FIX #2 : client stable

  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [gp, setGp] = useState<GamePlan>(EMPTY_GP);
  const [drawingFor, setDrawingFor] = useState<Section | null>(null);
  const [addSysFor, setAddSysFor] = useState<SystemSection | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [loading, setLoading] = useState(true);
  const [rotationTick, setRotationTick] = useState(0);
  const [activeTab, setActiveTab] = useState<"systems" | "scout" | "rotation">("systems");
  const [pendingDraw, setPendingDraw] = useState<{ section: SystemSection; image: string } | null>(null);

  const dirtyRef = useRef(false); // FIX #1 : édition en cours non sauvegardée
  const teamIdRef = useRef("");
  const gpRef = useRef(gp);
  gpRef.current = gp;
  teamIdRef.current = teamId;

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
      let id = lsGet<string>(K_SEL) || "";
      if (typeof id !== "string") id = "";
      if (!id || !t.some((x) => String(x.id) === String(id))) {
        id = t[0]?.id ?? "";
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
        await writeGP(supabase, saveTeamId, next);
        dirtyRef.current = false;
        flash();
        return true;
      } catch (error) {
        console.error("Sauvegarde Game Plan impossible :", error);
        // On garde dirty=true pour que le prochain autosave retente.
        return false;
      }
    },
    [supabase, flash]
  );

  /* --- détecte un système dessiné ou sélectionné renvoyé par la Plaquette / page Systèmes --- */
  const checkPendingDraw = useCallback(async () => {
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
    checkPendingDraw();
    const id = teamIdRef.current;
    if (id && !dirtyRef.current) {
      const next = await readGP(supabase, id);
      if (!dirtyRef.current) {
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
    if (loading || !teamId || !dirtyRef.current) return;
    const t = window.setTimeout(async () => {
      try {
        await writeGP(supabase, teamId, gpRef.current);
        dirtyRef.current = false;
        flash();
      } catch {
        /* échec silencieux : on retentera au prochain changement / save manuel */
      }
    }, 800);
    return () => window.clearTimeout(t);
  }, [gp, teamId, loading, supabase, flash]);

  const flushSave = useCallback(async () => {
    if (dirtyRef.current && teamIdRef.current) {
      try {
        await writeGP(supabase, teamIdRef.current, gpRef.current);
        dirtyRef.current = false;
      } catch {}
    }
  }, [supabase]);

  /* --- dérivés --- */
  const team = useMemo(() => teams.find((t) => t.id === teamId) || null, [teams, teamId]);
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
    await flushSave();
    teamIdRef.current = id;
    setTeamId(id);
    lsSet(K_SEL, id);
    const next = await readGP(supabase, id);
    gpRef.current = next;
    dirtyRef.current = false;
    setGp(next);
  };

  const ensureCalendarMatchEvent = useCallback(
    async (base: GamePlan = gpRef.current): Promise<GamePlan> => {
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
      try {
        window.dispatchEvent(new CustomEvent("mybasket:calendar-updated"));
      } catch {}

      return { ...base, calendarEventId: eventId };
    },
    [team]
  );

  const saveNow = async () => {
    try {
      let next = gpRef.current;
      if (teamIdRef.current && next.date) {
        next = await ensureCalendarMatchEvent(next);
        gpRef.current = next;
        setGp(next);
      }

      if (teamIdRef.current) {
        await writeGP(supabase, teamIdRef.current, next);
        dirtyRef.current = false;
      }
      flash();
    } catch (error) {
      console.error("Impossible de sauvegarder le Game Plan:", error);
      window.alert("Impossible de sauvegarder le Game Plan.");
    }
  };

  const resetGamePlan = async () => {
    if (!teamId) return;

    const ok = window.confirm(
      [
        "Créer un nouveau Game Plan ?",
        "",
        "Cette action remettra à zéro le Game Plan de cette équipe :",
        "• informations du match",
        "• systèmes offensifs / BLOB / SLOB / fin de match",
        "• scouting adverse",
        "• dessins",
        "• points clés",
        "• lien calendrier",
        "",
        "Cette action ne supprime pas ton équipe ni ta rotation."
      ].join("\n")
    );

    if (!ok) return;

    const clean: GamePlan = JSON.parse(JSON.stringify(EMPTY_GP));

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.alert("Impossible de réinitialiser : utilisateur non connecté.");
        return;
      }

      const { error } = await supabase.from("management_gameplans").upsert(
        {
          user_id: user.id,
          team_id: teamId,
          opponent: null,
          date: null,
          match_time: null,
          competition: null,
          calendar_event_id: null,
          objective: null,
          key_players: null,
          attack_schemes: null,
          defense_schemes: null,
          key_points: null,
          include_rotation: false,
          blob: null,
          slob: null,
          end_game_systems: null,
          scouting: EMPTY_GP.scouting,
          library_systems: [],
          drawings: EMPTY_GP.drawings,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id,team_id" }
      );

      if (error) throw error;

      try {
        localStorage.removeItem(K_PLQ_RESULT);
        localStorage.removeItem(K_PENDING);
      } catch {}

      dirtyRef.current = false;
      setGp(clean);
      setPendingDraw(null);
      setAddSysFor(null);
      setDrawingFor(null);
      setActiveTab("systems");
      flash();
    } catch (e) {
      console.error("Erreur reset Game Plan:", e);
      window.alert("Impossible de réinitialiser le Game Plan.");
    }
  };

  /* --- Mon Calendrier (localStorage) : ajout robuste, sans erreur --- */
  const createMatchEvent = async () => {
    if (!gpRef.current.date) {
      window.alert("Renseigne d'abord une date pour créer le match.");
      return;
    }

    try {
      const next = await ensureCalendarMatchEvent(gpRef.current);
      gpRef.current = next;
      setGp(next);
      dirtyRef.current = true;
      await writeGP(supabase, teamIdRef.current, next);
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
      localStorage.setItem("mb_plaquette_return_to", "/mon-compte?tab=management&module=gameplan");
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
        <TeamBar teams={teams} teamId={teamId} onSelect={selectTeam} />
        <div className="gp-empty">Crée d'abord une équipe dans « Mes Équipes » pour préparer un Game Plan.</div>
        <style jsx>{styles}</style>
      </div>
    );
  }

  const endSections: [Section, string, keyof GamePlan, string, number][] = [
    ["blob", "🎯 BLOB", "blob", "Remise en jeu ligne de fond…", 3],
    ["slob", "↔ SLOB", "slob", "Remise en jeu côté…", 3],
    ["end", "⏱ Fin de match", "endGameSystems", "Dernier tir, score serré…", 4],
  ];

  return (
    <div className="gp">
      <TeamBar teams={teams} teamId={teamId} onSelect={selectTeam} />

      <div className="gp-hero">
        <div>
          <p className="gp-kicker">Management</p>
          <h2>
            Game <span>Plan</span>
          </h2>
          <p>Prépare ton match, lie-le au calendrier, ajoute tes systèmes et ton scouting adverse.</p>
        </div>
        <div className="gp-heroactions">
          <button
            type="button"
            className="gp-reset"
            onClick={resetGamePlan}
          >
            🔄 Nouveau Game Plan
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

      <div className="gp-tabs">
        {(["systems", "scout", "rotation"] as const).map((k) => (
          <button key={k} type="button" className={activeTab === k ? "active" : ""} onClick={() => setActiveTab(k)}>
            {k === "systems" ? "🎯 Systèmes" : k === "scout" ? "🔎 Scout adverse" : "🔁 Rotation"}
          </button>
        ))}
      </div>

      <div className="gp-layout">
        <main>
          {/* Match / calendrier */}
          <div className="gp-card dark">
            <div className="gp-cardhead">
              <h3>📅 Match / calendrier</h3>
              <span className={`gp-badge ${gp.calendarEventId ? "ok" : "off"}`}>
                {gp.calendarEventId ? "Lié au calendrier" : "Non lié"}
              </span>
            </div>
            <div className="gp-grid4">
              <Field label="Adversaire">
                <input value={gp.opponent} placeholder="Ex : Cholet Basket" onChange={(e) => patch({ opponent: e.target.value })} />
              </Field>
              <Field label="Date">
                <input type="date" value={gp.date} onChange={(e) => patch({ date: e.target.value })} />
              </Field>
              <Field label="Heure">
                <input type="time" value={gp.matchTime} onChange={(e) => patch({ matchTime: e.target.value })} />
              </Field>
              <Field label="Compétition">
                <input value={gp.competition} placeholder="Championnat U18 Élite" onChange={(e) => patch({ competition: e.target.value })} />
              </Field>
            </div>
            <div className="gp-actionline">
              <button type="button" onClick={linkExistingEvent}>
                Lier à un événement existant
              </button>
              <button type="button" onClick={createMatchEvent}>
                Créer un nouveau match
              </button>
            </div>
            <div className="gp-match-notes">
              <Field label="Clé du match" block>
                <textarea
                  rows={4}
                  value={gp.keyPoints}
                  placeholder={`Contrôler le rebond défensif\nCourir après chaque stop\nLimiter le PNR central adverse`}
                  onChange={(e) => patch({ keyPoints: e.target.value })}
                />
              </Field>
              <Field label="Clé offensive" block>
                <textarea
                  rows={4}
                  value={gp.attackSchemes}
                  placeholder="Ex : jouer vite après stop, cibler le mismatch, punir le drop…"
                  onChange={(e) => patch({ attackSchemes: e.target.value })}
                />
              </Field>
              <Field label="Clé défensive" block>
                <textarea
                  rows={4}
                  value={gp.defenseSchemes}
                  placeholder="Ex : fermer axe, protéger peinture, switch sur main forte, bloquer rebond…"
                  onChange={(e) => patch({ defenseSchemes: e.target.value })}
                />
              </Field>
            </div>
          </div>

          {activeTab === "systems" && (
            <>
              <div className="gp-actioncards">
                <button type="button" className="red" onClick={() => openAddSystem("offensive")}>
                  <b>📚 Mon Playbook</b>
                  <span>Choisis un système et clique « Ajouter ».</span>
                </button>
                <button type="button" onClick={() => openAddSystem("offensive")}>
                  <b>🏀 Bibliothèque</b>
                  <span>Choisis un système et clique « Ajouter ».</span>
                </button>
                <button type="button" className="ghost" onClick={() => openAddSystem("offensive")}>
                  <b>✏️ Ajouter un système</b>
                  <span>Playbook, bibliothèque, plaquette ou rapide.</span>
                </button>
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

              <div className="gp-card gp-plan-card">
                <div className="gp-cardhead">
                  <h3>🧭 Plan de match</h3>
                  <span className="gp-sub">Cadre de jeu et intentions principales</span>
                </div>
                <div className="gp-plan-objectives">
                  <div className="gp-plan-box main">
                    <Field label="Cadre général" block>
                      <textarea
                        rows={5}
                        value={gp.objective}
                        placeholder="Ex : imposer notre rythme, contrôler le rebond, courir après chaque stop…"
                        onChange={(e) => patch({ objective: e.target.value })}
                      />
                    </Field>
                  </div>
                  <div className="gp-plan-box">
                    <Field label="Notes offensives complémentaires" block>
                      <textarea
                        rows={5}
                        value={gp.keyPlayers}
                        placeholder="Ex : lectures, joueurs à responsabiliser, séquences à provoquer…"
                        onChange={(e) => patch({ keyPlayers: e.target.value })}
                      />
                    </Field>
                  </div>
                  <div className="gp-plan-box">
                    <Field label="Notes défensives complémentaires" block>
                      <textarea
                        rows={5}
                        value={gp.defenseSchemes}
                        placeholder="Ex : homme-homme, switch, zone, trap, pression tout terrain…"
                        onChange={(e) => patch({ defenseSchemes: e.target.value })}
                      />
                    </Field>
                  </div>
                </div>
              </div>

              <div className="gp-card">
                <div className="gp-cardhead">
                  <h3>🏁 Situations spéciales</h3>
                  <span className="gp-sub">BLOB · SLOB · Fin de match</span>
                </div>
                {endSections.map(([section, label, key, ph, rows]) => {
                  const secSys = systemsBySection[section as SystemSection] || [];
                  return (
                    <div key={section} className="gp-endblock">
                      <Field label={label} block>
                        <textarea
                          rows={rows}
                          value={(gp[key] as string) || ""}
                          placeholder={ph}
                          onChange={(e) => patch({ [key]: e.target.value } as Partial<GamePlan>)}
                        />
                      </Field>

                      {secSys.length > 0 && (
                        <div className="gp-systemgrid small special">
                          {secSys.map((s, i) => (
                            <article key={s.id} className="gp-system mini-card">
                              <span className="gp-priority">{i + 1}</span>
                              {s.schemaImage ? (
                                // eslint-disable-next-line @next/next/no-img-element
                                <img src={s.schemaImage} alt={s.title} />
                              ) : (
                                <div className="gp-schema">Schéma</div>
                              )}
                              <h4>{s.title}</h4>
                              <p>{s.category || SECTION_LABEL[section as SystemSection]}</p>
                              <div className="gp-systemactions">
                                <button type="button" onClick={() => navAfterSave(`/systemes/${s.id}`)}>
                                  Ouvrir
                                </button>
                                <button type="button" onClick={() => removeSystem(s.id)}>
                                  Retirer
                                </button>
                              </div>
                            </article>
                          ))}
                        </div>
                      )}

                      <DrawingList drawings={gp.drawings[section]} section={section} renameDrawing={renameDrawing} removeDrawing={removeDrawing} />
                      <div className="gp-endactions">
                        <button type="button" className="gp-add" onClick={() => openAddSystem(section as SystemSection)}>
                          ＋ Ajouter un système
                        </button>
                        <button type="button" className="gp-add" onClick={() => setDrawingFor(section)}>
                          ✏️ + Ajouter un dessin
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {activeTab === "scout" && (
            <ScoutingModule />
          )}

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

        {/* Aperçu */}
        <aside className="gp-preview">
          <h3>Aperçu PDF</h3>
          <div className="gp-a4">
            <h4>GAME PLAN</h4>
            <p>vs {gp.opponent || "Adversaire"}</p>
            <small>
              {gp.date || "Date"} · {gp.matchTime || "Heure"} · {gp.competition || "Compétition"}
            </small>
            <hr />
            <b>Points clés</b>
            <ul>
              {(gp.keyPoints || "")
                .split("\n")
                .filter(Boolean)
                .slice(0, 4)
                .map((p, i) => (
                  <li key={i}>{p}</li>
                ))}
            </ul>
            <b>Nos systèmes</b>
            <div className="gp-minirow">
              {offensiveSystems.slice(0, 3).map((s) => (
                <div key={s.id}>
                  <span />
                  <small>{s.title}</small>
                </div>
              ))}
            </div>
            <b>Scout adverse</b>
            <p className="mini">{gp.scouting.style || "Style de jeu, forces, faiblesses, joueurs clés et plan défensif."}</p>
            {gp.scouting.keyPlayers.length > 0 && (
              <ul>
                {gp.scouting.keyPlayers.slice(0, 3).map((p, i) => (
                  <li key={i}>
                    {p.name} {p.role ? `— ${p.role}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>

      <div className="gp-actions">
        {savedFlash && <span className="gp-saved">✓ Enregistré</span>}
        <button type="button" className="gp-btn ghost" onClick={saveNow}>
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
    const res = await fetch(src, { mode: "cors" });
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

async function exportGamePlanPdf(team: Team, gp: GamePlan, rotation: Rotation | null) {
  try {
    const jsPDF = await loadPdfJs();
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const M = 12;
    let y = M;

    const burgundy = [107, 26, 44];
    const gold = [212, 162, 76];
    const black = [15, 15, 18];
    const muted = [95, 95, 95];

    const ensure = (need = 24) => {
      if (y + need <= H - M) return;
      doc.addPage();
      y = M;
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

    const box = (label: string, value: string) => {
      if (!hasText(value)) return;
      const lines = textLines(value, W - M * 2 - 8);
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

    const header = async () => {
      doc.setFillColor(...burgundy);
      doc.rect(0, 0, W, 24, "F");
      doc.setTextColor(255, 255, 255);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(20);
      doc.text("GAME PLAN", M, 15);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(`${team.name || "Équipe"}${team.cat ? " · " + team.cat : ""}`, M, 20);
      if (team.logo) {
        const logo = await imageToDataUrl(team.logo);
        if (logo) doc.addImage(logo, "PNG", W - M - 16, 4, 16, 16);
      }
      y = 32;
    };

    await header();

    const meta = [
      ["Adversaire", gp.opponent],
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

    title("Clés du match");
    box("Clé du match", gp.keyPoints);
    box("Clé offensive", gp.attackSchemes);
    box("Clé défensive", gp.defenseSchemes);
    box("Objectif", gp.objective);

    const systemSections: [SystemSection, string][] = [
      ["offensive", "Systèmes offensifs"],
      ["blob", "BLOB"],
      ["slob", "SLOB"],
      ["end", "Fin de match"],
      ["scout", "Systèmes adverses"],
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

    if (hasScoutData(gp)) {
      doc.addPage();
      y = M;
      title("Scouting adverse");
      box("Équipe adverse", gp.scouting.team || gp.opponent);
      box("Style de jeu", gp.scouting.style);
      box("À surveiller", gp.scouting.watch);
      box("Forces", gp.scouting.strengths);
      box("Faiblesses", gp.scouting.weaknesses);
      if (gp.scouting.keyPlayers.length) {
        title("Joueurs clés");
        box("Joueurs", gp.scouting.keyPlayers.map((p) => `${p.name}${p.role ? " — " + p.role : ""}`).join("\n"));
      }
      box("Plan défensif", gp.scouting.defensivePlan);
    }

    const safeName = `${team.name || "game-plan"}-${gp.opponent || "match"}`.replace(/[^a-z0-9_-]+/gi, "-").replace(/-+/g, "-");
    doc.save(`${safeName}.pdf`);
  } catch (error) {
    console.error("Export PDF impossible:", error);
    window.alert("Impossible de télécharger le PDF. Vérifie ta connexion puis réessaie.");
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
  .gp-reset:hover { background:rgba(255,255,255,.18); }
  .gp-tabs { display:flex; gap:.55rem; margin-bottom:1rem; padding:.35rem; background:#FFF9F0; border:1px solid #eadfce; border-radius:16px; overflow-x:auto; }
  .gp-tabs button { border:none; background:transparent; padding:.75rem 1rem; cursor:pointer; font-weight:900; color:#7b6f69; border-radius:12px; transition:.18s ease; }
  .gp-tabs button:hover { background:#fff; color:#6B1A2C; }
  .gp-tabs button.active { color:#fff; background:#6B1A2C; box-shadow:0 10px 24px rgba(107,26,44,.18); }
  .gp-layout { display:grid; grid-template-columns:minmax(0,1.25fr) 360px; gap:1rem; align-items:start; }
  .gp-card,.gp-preview { background:#fff; border:1px solid #ece3d6; border-radius:18px; padding:1.05rem; margin-bottom:1rem; box-shadow:0 14px 38px rgba(60,30,20,.07); }
  .gp-card.dark { background:#111; color:#fff; border-color:rgba(255,255,255,.12); }
  .gp-cardhead { display:flex; align-items:center; justify-content:space-between; gap:1rem; border-bottom:1.5px solid #D4A24C; padding-bottom:.6rem; margin-bottom:.8rem; }
  .gp-cardhead.soft { margin-top:1rem; }
  .gp-cardhead h3 { margin:0; color:#6B1A2C; font-weight:900; text-transform:uppercase; font-size:1rem; }
  .gp-card.dark .gp-cardhead h3 { color:#D4A24C; }
  .gp-sub { color:#8a7b73; font-size:.78rem; font-style:italic; }
  .gp-grid2 { display:grid; grid-template-columns:1fr 1fr; gap:.8rem; }
  .gp-grid4 { display:grid; grid-template-columns:repeat(4,1fr); gap:.8rem; }
  .gp-field { margin-bottom:.85rem; }
  .gp-field label { display:block; font-size:.72rem; font-weight:900; color:#6B1A2C; text-transform:uppercase; letter-spacing:.04em; margin-bottom:.35rem; }
  .gp-card.dark .gp-field label { color:#D4A24C; }
  .gp :global(input),.gp :global(textarea),.gp :global(select) { width:100%; border:1px solid #e1d8cc; border-radius:10px; padding:.7rem .85rem; font-size:.95rem; line-height:1.5; font-family:inherit; color:#0F0F12; background:#fff; resize:vertical; box-sizing:border-box; }
  .gp :global(textarea) { min-height:130px; display:block; width:100% !important; max-width:100% !important; box-sizing:border-box; cursor:text; }
  .gp-endblock :global(textarea) { min-height:150px; }
  .gp-card.dark :global(input) { background:#191919; color:#fff; border-color:rgba(255,255,255,.15); }
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
  .gp-match-notes { display:grid; grid-template-columns:1fr 1fr; gap:.8rem; margin-top:1rem; padding-top:.9rem; border-top:1px solid rgba(255,255,255,.12); }
  .gp-match-notes :global(textarea) { min-height:112px; }
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
  .gp-preview { position:sticky; top:1rem; }
  .gp-preview h3 { margin:0 0 .75rem; color:#6B1A2C; text-transform:uppercase; }
  .gp-a4 { background:#fff; border:1px solid #ddd; box-shadow:0 15px 35px rgba(0,0,0,.12); min-height:520px; padding:1rem; }
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
  @media (max-width:1100px){ .gp-layout{ grid-template-columns:1fr; } .gp-preview{ position:static; } }
  @media (max-width:760px){
    .gp-hero,.gp-grid2,.gp-grid4,.gp-actioncards,.gp-systemgrid,.gp-systemgrid.small { grid-template-columns:1fr; display:grid; }
    .gp-hero { display:grid; }
    .gp-actions,.gp-actionline { justify-content:stretch; }
    .gp-actions button,.gp-actionline button { width:100%; }
    .gp-kprow { grid-template-columns:1fr; }
  }
`;