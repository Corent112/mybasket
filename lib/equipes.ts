import { createClient } from "@/lib/supabase/client";
import type { Exercise } from "@/types/exercise";

/**
 * lib/equipes.ts
 *
 * Ce fichier garde la compatibilité avec les anciens composants "équipes"
 * tout en conservant les fonctions Supabase utilisées pour les exercices.
 * Important : pas de doublons d'exports.
 */

export const newId = () => crypto.randomUUID();

type ProfileRole = "user" | "superadmin" | "ceo" | string | null;

type SupabaseExerciseRow = Record<string, any>;

function asArray<T = unknown>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function mapRowToExercise(row: SupabaseExerciseRow): Exercise {
  return {
    id: row.id,
    title: row.title ?? "",

    theme: row.themes?.[0] ?? row.theme ?? "",
    type: row.type ?? "",
    category: row.category ?? row.categorie ?? "",
    level: row.level ?? row.niveau ?? "",

    description: row.organisation ?? row.description ?? "",
    instructions: row.consignes ?? row.instructions ?? "",

    duration: row.duration ?? row.temps ?? "",
    tags: asArray<string>(row.tags ?? row.themes),

    images: asArray<string>(row.images),
    videos: asArray<string>(row.videos),

    schemaImages: asArray<string>(row.schemaImages ?? row.schema_images),
    schemaDataList: asArray(row.schemaDataList ?? row.schema_data_list),

    diagrams: asArray(row.diagrams),
  } as Exercise;
}

function cleanPayload(payload: Record<string, any>) {
  const themes = asArray<string>(payload.themes ?? payload.tags);
  const tags = asArray<string>(payload.tags ?? payload.themes);
  const schemaImages = asArray<string>(
    payload.schemaImages ?? payload.schema_images
  );
  const schemaDataList = asArray(
    payload.schemaDataList ?? payload.schema_data_list
  );

  return {
    title: payload.title ?? "",

    organisation: payload.organisation ?? payload.description ?? "",
    description: payload.organisation ?? payload.description ?? "",

    deroulement: asArray(payload.deroulement),
    consignes: asArray(payload.consignes ?? payload.instructions),
    instructions: asArray(payload.consignes ?? payload.instructions),

    variantes: asArray(payload.variantes),

    plots: payload.plots ?? null,
    ballons: payload.ballons ?? null,
    paniers: payload.paniers ?? null,
    joueurs: payload.joueurs ?? null,

    categorie: payload.categorie ?? payload.category ?? "",
    category: payload.categorie ?? payload.category ?? "",

    type: payload.type ?? "",

    niveau: payload.niveau ?? payload.level ?? "",
    level: payload.niveau ?? payload.level ?? "",

    temps: payload.temps ?? null,
    duration: payload.duration ?? payload.temps ?? "",

    themes,
    tags,

    images: asArray<string>(payload.images),
    videos: asArray<string>(payload.videos),

    schemaImages,
    schema_images: schemaImages,

    schemaDataList,
    schema_data_list: schemaDataList,

    owner_id: payload.owner_id ?? null,
    visibility: payload.visibility ?? "private",
    original_exercise_id: payload.original_exercise_id ?? null,

    updated_at: new Date().toISOString(),
  };
}

export async function getCurrentUserRole(): Promise<ProfileRole> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("platform_role")
    .eq("id", user.id)
    .maybeSingle();

  return data?.platform_role ?? "user";
}

export async function isCeoUser() {
  const role = await getCurrentUserRole();
  return role === "ceo" || role === "superadmin";
}

export async function listExercises(): Promise<Exercise[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("exercises")
    .select("*")
    .eq("visibility", "public")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erreur listExercises:", error);
    return [];
  }

  return (data ?? []).map(mapRowToExercise);
}

export async function listMyExercises(): Promise<Exercise[]> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("exercises")
    .select("*")
    .eq("owner_id", user.id)
    .eq("visibility", "private")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Erreur listMyExercises:", error);
    return [];
  }

  return (data ?? []).map(mapRowToExercise);
}

export async function getExercise(id: string): Promise<Exercise | null> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("exercises")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data) {
    if (error) console.error("Erreur getExercise:", error);
    return null;
  }

  return mapRowToExercise(data);
}

export async function getExerciseRaw(id: string) {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("exercises")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    console.error("Erreur getExerciseRaw:", error);
    return null;
  }

  return data;
}

export async function saveExercise(payload: Record<string, any>) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Utilisateur non connecté");

  const ceo = await isCeoUser();

  const finalPayload = cleanPayload({
    ...payload,
    owner_id: user.id,
    visibility: ceo ? payload.visibility ?? "public" : "private",
  });

  const { data, error } = await supabase
    .from("exercises")
    .insert({
      id: payload.id ?? crypto.randomUUID(),
      ...finalPayload,
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  return mapRowToExercise(data);
}

export async function updateExercise(id: string, payload: Record<string, any>) {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) throw new Error("Utilisateur non connecté");

  const existing = await getExerciseRaw(id);
  if (!existing) throw new Error("Exercice introuvable");

  const ceo = await isCeoUser();
  const isPublic = existing.visibility === "public";
  const isMine = existing.owner_id === user.id;

  if (ceo && (isPublic || isMine)) {
    const { data, error } = await supabase
      .from("exercises")
      .update(
        cleanPayload({
          ...payload,
          owner_id: existing.owner_id ?? user.id,
          visibility: existing.visibility ?? "public",
          original_exercise_id: existing.original_exercise_id ?? null,
        })
      )
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return mapRowToExercise(data);
  }

  if (!ceo && isMine && existing.visibility === "private") {
    const { data, error } = await supabase
      .from("exercises")
      .update(
        cleanPayload({
          ...payload,
          owner_id: user.id,
          visibility: "private",
          original_exercise_id: existing.original_exercise_id ?? null,
        })
      )
      .eq("id", id)
      .select()
      .single();

    if (error) throw error;
    return mapRowToExercise(data);
  }

  const { data, error } = await supabase
    .from("exercises")
    .insert({
      id: crypto.randomUUID(),
      ...cleanPayload({
        ...existing,
        ...payload,
        owner_id: user.id,
        visibility: "private",
        original_exercise_id: existing.id,
      }),
      created_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;

  return mapRowToExercise(data);
}

export async function deleteExercise(id: string) {
  const supabase = createClient();

  const { error } = await supabase.from("exercises").delete().eq("id", id);

  if (error) throw error;
}

// -----------------------------------------------------------------------------
// Compatibilité avec les anciens composants équipes.
// -----------------------------------------------------------------------------

export const THEME = {
  bordeaux: "#6b1a2c",
  bordeauxDark: "#210913",
  gold: "#d4a24c",
  dark: "#111827",
  noir: "#111827",
  grey: "#6b7280",
  primary: "#6b1a2c",
  secondary: "#d4a24c",
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
  text: "#111827",
  light: "#f8f8f8",
};

export type EventType =
  | "match"
  | "entrainement"
  | "entraînement"
  | "reunion"
  | "réunion"
  | "tournoi"
  | "stage"
  | "autre"
  | string;

export type EvenementResultat = {
  pour: number;
  contre: number;
};

export type Evenement = {
  id: string;
  title?: string;
  titre?: string;
  type?: EventType;
  date?: string | number | Date | null;
  heure?: string | null;
  lieu?: string | null;
  location?: string | null;
  start?: string | null;
  resultat?: EvenementResultat | null;
  [key: string]: unknown;
};

export type Equipe = {
  id: string;
  nom: string;
  name?: string;
  sexe?: string;
  genre?: string;
  saison?: string;
  banniere?: string | null;
  logo?: string | null;
  categorie?: string;
  niveau?: string;
  club?: string;
  archived?: boolean;
  joueurs: any[];
  players?: any[];
  evenements?: Evenement[];
  events?: Evenement[];
  victoires?: number;
  wins?: number;
  defaites?: number;
  losses?: number;
  presence?: number;
  attendance?: number;
  [key: string]: unknown;
};

export function initiales(value?: string | null, secondValue?: string | null) {
  const fullName = secondValue
    ? `${value ?? ""} ${secondValue ?? ""}`
    : String(value || "");

  return (
    fullName
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() || "")
      .join("") || "MB"
  );
}

export function avatarColor(value?: string | null) {
  const colors = [
    "#6b1a2c",
    "#d4a24c",
    "#1f6fb2",
    "#22a06b",
    "#f47b20",
    "#9333ea",
    "#0891b2",
    "#dc2626",
  ];

  const str = String(value || "mybasket");

  const score = Array.from(str).reduce(
    (sum, char) => sum + char.charCodeAt(0),
    0
  );

  return colors[score % colors.length];
}

export function formatDateFr(value?: string | number | Date | null) {
  if (!value) return "—";

  return new Date(value).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export function labelSexe(value?: string | null) {
  if (!value) return "Mixte";

  const normalized = value.toLowerCase();

  if (["m", "masculin", "homme", "garcon", "garçon"].includes(normalized)) {
    return "Masculin";
  }

  if (["f", "feminin", "féminin", "femme", "fille"].includes(normalized)) {
    return "Féminin";
  }

  return value;
}

export function statsEquipe(equipe: Equipe) {
  const joueurs = (equipe.joueurs ?? equipe.players ?? []) as any[];
  const events = (equipe.evenements ?? equipe.events ?? []) as Evenement[];

  const matchs = events.filter((event) => event.type === "match").length;

  const entrainements = events.filter((event) =>
    ["entrainement", "entraînement"].includes(String(event.type || ""))
  ).length;

  const victoires = Number(equipe.victoires ?? equipe.wins ?? 0);
  const defaites = Number(equipe.defaites ?? equipe.losses ?? 0);
  const presence = Number(equipe.presence ?? equipe.attendance ?? 0);

  return {
    joueurs: joueurs.length,
    players: joueurs.length,
    actifs: joueurs.filter(
      (joueur) =>
        joueur?.status !== "inactive" &&
        joueur?.status !== "suspended" &&
        joueur?.status !== "archived"
    ).length,
    matchs,
    entrainements,
    victoires,
    defaites,
    presence,
  };
}

export function prochainsEvenements(equipe: Equipe, limit = 3): Evenement[] {
  const events = ((equipe.evenements ?? equipe.events ?? []) as Evenement[]).filter(
    Boolean
  );

  const now = Date.now();

  return [...events]
    .filter((event) => {
      const time = event.date ? new Date(event.date).getTime() : 0;
      return !time || time >= now - 24 * 60 * 60 * 1000;
    })
    .sort(
      (a, b) =>
        new Date(a.date || 0).getTime() - new Date(b.date || 0).getTime()
    )
    .slice(0, limit);
}
