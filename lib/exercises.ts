import { createClient } from "@/lib/supabase/client";
import type {
  Exercise,
  ExerciseDiagram,
  ExerciseDraftFromPlaybook,
} from "@/types/exercise";

const DRAFT_KEY = "exerciseDraftFromPlaybook";
const WORKING_KEY = "exerciseWorkingDraft";

const isBrowser = () => typeof window !== "undefined";

export const newId = () => crypto.randomUUID();

type PlatformRole = "user" | "ceo" | "superadmin" | string | null;
type ReviewStatus = "draft" | "submitted" | "approved" | "rejected";
type Visibility = "private" | "public";

function showSupabaseError(label: string, error: any) {
  const message =
    error?.message ||
    error?.details ||
    error?.hint ||
    error?.code ||
    JSON.stringify(error, null, 2) ||
    "Erreur Supabase inconnue";

  console.error(label, error);

  if (isBrowser()) {
    alert(`${label}\n${message}`);
  }
}

async function getCurrentUser() {
  const supabase = createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error) {
    showSupabaseError("Erreur Supabase auth.getUser:", error);
    return null;
  }

  return user;
}

export async function getCurrentUserRole(): Promise<PlatformRole> {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) return null;

  const { data, error } = await supabase
    .from("profiles")
    .select("platform_role")
    .eq("id", user.id)
    .maybeSingle();

  if (error) {
    showSupabaseError("Erreur récupération rôle :", error);
    return "user";
  }

  return data?.platform_role ?? "user";
}

export async function isCeoUser(): Promise<boolean> {
  const role = await getCurrentUserRole();
  return role === "ceo" || role === "superadmin";
}

function toArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }

  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }

  return [];
}

function rowToExercise(row: any): Exercise {
  const schemaImages = Array.isArray(row.schema_images)
    ? row.schema_images
    : [];

  const schemaDataList = Array.isArray(row.schema_data_list)
    ? row.schema_data_list
    : [];

  return {
    id: row.id,
    title: row.title ?? "",

    theme: row.themes?.[0] ?? row.theme ?? "",
    themes: row.themes ?? [],

    type: row.type ?? "",
    category: row.categorie ?? row.category ?? "",
    categorie: row.categorie ?? row.category ?? "",

    level: row.niveau ?? row.level ?? "",
    niveau: row.niveau ?? row.level ?? "",

    description: row.description ?? row.organisation ?? "",
    organisation: row.organisation ?? "",

    instructions: row.consignes ?? "",
    consignes: row.consignes ?? "",

    deroulement: row.deroulement ?? "",
    variantes: row.variantes ?? "",

    material: Array.isArray(row.materiel)
      ? row.materiel.join(", ")
      : Array.isArray(row.equipment)
      ? row.equipment.join(", ")
      : row.materiel ?? row.equipment ?? "",
    equipment: Array.isArray(row.equipment)
      ? row.equipment.join(", ")
      : Array.isArray(row.materiel)
      ? row.materiel.join(", ")
      : row.equipment ?? row.materiel ?? "",

    duration: String(row.temps ?? ""),
    temps: row.temps ?? "",

    schemaImage: row.schema_image ?? schemaImages[0] ?? "",
    schemaImages,
    schemaVideo: row.schema_video ?? "",
    schemaData: row.schema_data ?? null,
    schemaDataList,

    images: Array.isArray(row.images) ? row.images : [],
    videos: Array.isArray(row.videos) ? row.videos : [],

    plots: row.plots ?? "",
    ballons: row.ballons ?? "",
    paniers: row.paniers ?? "",
    joueurs: row.joueurs ?? "",

    tags: Array.isArray(row.tags)
      ? row.tags
      : Array.isArray(row.themes)
      ? row.themes
      : [],

    diagrams: schemaImages.map((img: string, index: number) => ({
      id: `schema_phase_${index + 1}`,
      title: `Phase ${index + 1}`,
      imageUrl: img,
      phases: schemaDataList[index]?.phases ?? row.schema_data?.phases ?? [],
      createdAt: row.created_at
        ? new Date(row.created_at).getTime()
        : Date.now(),
      order: index,
    })),

    owner_id: row.owner_id ?? row.user_id ?? null,
    user_id: row.user_id ?? row.owner_id ?? null,

    visibility: row.visibility ?? "private",
    review_status: row.review_status ?? "draft",

    submitted_at: row.submitted_at ?? null,
    reviewed_at: row.reviewed_at ?? null,
    reviewed_by: row.reviewed_by ?? null,
    rejection_reason: row.rejection_reason ?? null,
    original_exercise_id: row.original_exercise_id ?? null,

    createdAt: row.created_at ? new Date(row.created_at).getTime() : Date.now(),
    updatedAt: row.updated_at ? new Date(row.updated_at).getTime() : Date.now(),
  };
}

function exerciseToRow(ex: any, userId: string) {
  const schemaImages = Array.isArray(ex.schemaImages)
    ? ex.schemaImages
    : Array.isArray(ex.schema_images)
    ? ex.schema_images
    : [];

  const schemaDataList = Array.isArray(ex.schemaDataList)
    ? ex.schemaDataList
    : Array.isArray(ex.schema_data_list)
    ? ex.schema_data_list
    : [];

  return {
    user_id: ex.user_id ?? userId,
    owner_id: ex.owner_id ?? userId,

    visibility: (ex.visibility ?? "private") as Visibility,
    review_status: (ex.review_status ?? "draft") as ReviewStatus,

    original_exercise_id: ex.original_exercise_id ?? null,

    title: ex.title ?? "",

    description: ex.description ?? ex.organisation ?? "",
    organisation: ex.organisation ?? ex.description ?? "",

    consignes: ex.consignes ?? ex.instructions ?? "",
    deroulement: ex.deroulement ?? "",
    variantes: ex.variantes ?? "",

    plots: ex.plots ?? null,
    ballons: ex.ballons ?? null,
    paniers: ex.paniers ?? null,
    joueurs: ex.joueurs ?? null,

    categorie: ex.categorie ?? ex.category ?? "",
    type: ex.type ?? "",
    niveau: ex.niveau ?? ex.level ?? "",
    temps: ex.temps ?? ex.duration ?? null,

    themes: toArray(ex.themes ?? ex.tags ?? ex.theme),
    images: Array.isArray(ex.images) ? ex.images : [],
    videos: Array.isArray(ex.videos) ? ex.videos : [],

    schema_image: schemaImages[0] ?? ex.schemaImage ?? "",
    schema_images: schemaImages,
    schema_video: ex.schemaVideo ?? "",
    schema_data: schemaDataList[0] ?? ex.schemaData ?? null,
    schema_data_list: schemaDataList,

    updated_at: new Date().toISOString(),
  };
}

function isUuid(value: string | null | undefined) {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)
  );
}

function exerciseToInsertRow(ex: any, userId: string) {
  const row: any = {
    ...exerciseToRow(ex, userId),
    created_at: new Date().toISOString(),
  };

  // Pour une création classique, on laisse Supabase générer l'id.
  // Si la page a préparé un vrai UUID de brouillon, on peut le garder,
  // mais saveExercise vérifiera d'abord s'il existe déjà avant d'insérer.
  if (isUuid(ex.id)) row.id = ex.id;

  return row;
}

async function getExerciseRaw(id: string | null | undefined) {
  if (!id) return null;

  const supabase = createClient();

  const { data, error } = await supabase
    .from("exercises")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    showSupabaseError("Erreur Supabase getExerciseRaw:", error);
    return null;
  }

  return data;
}

export async function listExercises(): Promise<Exercise[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("exercises")
    .select("*")
    .or(
      "visibility.eq.public,is_public.eq.true,review_status.eq.approved,status.eq.approved,status.eq.published,status.eq.active"
    )
    .order("created_at", { ascending: false });

  if (error) {
    showSupabaseError("Erreur Supabase listExercises:", error);
    return [];
  }

  return (data ?? []).map(rowToExercise);
}

export async function listMyExercises(): Promise<Exercise[]> {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) return [];

  const ceo = await isCeoUser();

  let query = supabase
    .from("exercises")
    .select("*")
    .order("created_at", { ascending: false });

  if (!ceo) {
    query = query.or(`owner_id.eq.${user.id},user_id.eq.${user.id}`);
  }

  const { data, error } = await query;

  if (error) {
    showSupabaseError("Erreur Supabase listMyExercises:", error);
    return [];
  }

  return (data ?? []).map(rowToExercise);
}

export async function listSubmittedExercisesForCeo(): Promise<Exercise[]> {
  const supabase = createClient();
  const ceo = await isCeoUser();

  if (!ceo) return [];

  const { data, error } = await supabase
    .from("exercises")
    .select("*")
    .eq("review_status", "submitted")
    .order("submitted_at", { ascending: false });

  if (error) {
    showSupabaseError("Erreur Supabase listSubmittedExercisesForCeo:", error);
    return [];
  }

  return (data ?? []).map(rowToExercise);
}

export async function getExercise(
  id: string | null | undefined
): Promise<Exercise | null> {
  if (!id) return null;

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = user ? await getCurrentUserRole() : null;
  const ceo = role === "ceo" || role === "superadmin";

  const existing = await getExerciseRaw(id);

  if (!existing) return null;

  const isPublic = existing.visibility === "public";
  const isOwner =
    !!user && (existing.owner_id === user.id || existing.user_id === user.id);

  if (!isPublic && !isOwner && !ceo) {
    return null;
  }

  return rowToExercise(existing);
}

export async function saveExercise(ex: any): Promise<Exercise | null> {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    if (isBrowser()) alert("Tu dois être connecté pour sauvegarder l’exercice.");
    return null;
  }

  const ceo = await isCeoUser();

  const prepared = {
    ...ex,
    owner_id: user.id,
    user_id: user.id,
    visibility: ceo ? ex.visibility ?? "public" : "private",
    review_status: ceo ? ex.review_status ?? "approved" : "draft",
    original_exercise_id: ex.original_exercise_id ?? null,
  };

  const row = exerciseToInsertRow(prepared, user.id);
  const requestedId = isUuid(prepared.id) ? prepared.id : null;

  // Cas critique corrigé : les pages de création gardent parfois un id de brouillon
  // dans le localStorage. Si cet id existe déjà, on met à jour au lieu de refaire
  // un insert qui casse sur exercises_pkey.
  if (requestedId) {
    const existing = await getExerciseRaw(requestedId);

    if (existing) {
      const updateRow = exerciseToRow(
        {
          ...existing,
          ...prepared,
          owner_id: existing.owner_id ?? user.id,
          user_id: existing.user_id ?? user.id,
          visibility: ceo ? prepared.visibility ?? "public" : existing.visibility ?? "private",
          review_status: ceo
            ? prepared.review_status ?? "approved"
            : existing.review_status === "submitted"
            ? "draft"
            : prepared.review_status ?? existing.review_status ?? "draft",
        },
        user.id
      );

      const { data, error } = await supabase
        .from("exercises")
        .update(updateRow)
        .eq("id", requestedId)
        .select("*")
        .maybeSingle();

      if (error) {
        showSupabaseError("Erreur Supabase saveExercise update:", error);
        return null;
      }

      return data ? rowToExercise(data) : null;
    }
  }

  // Création neuve : si aucun id valable n'est demandé, Supabase génère l'id.
  const { data, error } = await supabase
    .from("exercises")
    .insert(row)
    .select("*")
    .maybeSingle();

  if (error) {
    showSupabaseError("Erreur Supabase saveExercise insert:", error);
    return null;
  }

  return data ? rowToExercise(data) : null;
}

export async function updateExercise(
  id: string | null | undefined,
  patch: Partial<Exercise>
): Promise<Exercise | null> {
  if (!id) return null;

  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    if (isBrowser()) alert("Tu dois être connecté pour modifier l’exercice.");
    return null;
  }

  const existing = await getExerciseRaw(id);

  if (!existing) {
    if (isBrowser()) alert("Exercice introuvable.");
    return null;
  }

  const ceo = await isCeoUser();
  const isMine = existing.owner_id === user.id || existing.user_id === user.id;

  if (!ceo && !isMine) {
    if (isBrowser()) alert("Tu ne peux modifier que tes exercices.");
    return null;
  }

  const row = exerciseToRow(
    {
      ...existing,
      ...patch,
      owner_id: existing.owner_id ?? user.id,
      user_id: existing.user_id ?? user.id,
      visibility: ceo ? "public" : existing.visibility ?? "private",
      review_status: ceo
        ? "approved"
        : existing.review_status === "submitted"
        ? "draft"
        : existing.review_status ?? "draft",
    },
    user.id
  );

  const { data, error } = await supabase
    .from("exercises")
    .update(row)
    .eq("id", existing.id)
    .select("*")
    .maybeSingle();

  if (error) {
    showSupabaseError("Erreur Supabase updateExercise:", error);
    return null;
  }

  return data ? rowToExercise(data) : null;
}

export async function submitExerciseForReview(id: string): Promise<boolean> {
  if (!id) return false;

  const user = await getCurrentUser();

  if (!user) return false;

  const existing = await getExerciseRaw(id);

  if (!existing) return false;

  const isMine = existing.owner_id === user.id || existing.user_id === user.id;

  if (!isMine) {
    if (isBrowser()) alert("Tu ne peux proposer que tes propres exercices.");
    return false;
  }

  const supabase = createClient();

  const { error } = await supabase
    .from("exercises")
    .update({
      visibility: "private",
      review_status: "submitted",
      submitted_at: new Date().toISOString(),
      reviewed_at: null,
      reviewed_by: null,
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  if (error) {
    showSupabaseError("Erreur Supabase submitExerciseForReview:", error);
    return false;
  }

  return true;
}

export async function approveExerciseForLibrary(id: string): Promise<boolean> {
  if (!id) return false;

  const supabase = createClient();
  const user = await getCurrentUser();
  const ceo = await isCeoUser();

  if (!user || !ceo) {
    if (isBrowser()) alert("Action réservée au CEO.");
    return false;
  }

  const { error } = await supabase
    .from("exercises")
    .update({
      visibility: "public",
      review_status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    showSupabaseError("Erreur Supabase approveExerciseForLibrary:", error);
    return false;
  }

  return true;
}

export async function rejectExerciseForLibrary(
  id: string,
  reason = ""
): Promise<boolean> {
  if (!id) return false;

  const supabase = createClient();
  const user = await getCurrentUser();
  const ceo = await isCeoUser();

  if (!user || !ceo) {
    if (isBrowser()) alert("Action réservée au CEO.");
    return false;
  }

  const { error } = await supabase
    .from("exercises")
    .update({
      visibility: "private",
      review_status: "rejected",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      rejection_reason: reason.trim() || null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    showSupabaseError("Erreur Supabase rejectExerciseForLibrary:", error);
    return false;
  }

  return true;
}

export async function deleteExercise(id: string): Promise<boolean> {
  if (!id) return false;

  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) return false;

  const existing = await getExerciseRaw(id);

  if (!existing) return false;

  const ceo = await isCeoUser();
  const isMine = existing.owner_id === user.id || existing.user_id === user.id;

  if (!ceo && !isMine) {
    if (isBrowser()) alert("Tu ne peux supprimer que tes exercices.");
    return false;
  }

  const { error } = await supabase
    .from("exercises")
    .delete()
    .eq("id", existing.id);

  if (error) {
    showSupabaseError("Erreur Supabase deleteExercise:", error);
    return false;
  }

  return true;
}

export async function duplicateExercise(id: string): Promise<Exercise | null> {
  const ex = await getExercise(id);

  if (!ex) return null;

  return saveExercise({
    ...ex,
    id: crypto.randomUUID(),
    title: `${ex.title || "Exercice"} (copie)`,
    visibility: "private",
    review_status: "draft",
    original_exercise_id: ex.id,
  });
}

export function emptyExercise(): Exercise {
  const now = Date.now();

  return {
    id: crypto.randomUUID(),

    title: "",

    theme: "",
    themes: [],

    type: "",
    category: "",
    categorie: "",

    level: "",
    niveau: "",

    description: "",
    organisation: "",

    instructions: "",
    consignes: "",

    deroulement: "",
    variantes: "",

    material: "",
    equipment: "",

    duration: "",
    temps: "",

    plots: "",
    ballons: "",
    paniers: "",
    joueurs: "",

    tags: [],

    images: [],
    videos: [],

    schemaImage: "",
    schemaImages: [],
    schemaVideo: "",
    schemaData: null,
    schemaDataList: [],

    diagrams: [],

    visibility: "private",
    review_status: "draft",

    createdAt: now,
    updatedAt: now,
  };
}

export function readDraftFromPlaybook(): ExerciseDraftFromPlaybook | null {
  if (!isBrowser()) return null;

  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearDraftFromPlaybook(): void {
  if (!isBrowser()) return;
  sessionStorage.removeItem(DRAFT_KEY);
}

export function consumeHandoff(): ExerciseDiagram | null {
  if (!isBrowser()) return null;

  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);

    if (!raw) return null;

    sessionStorage.removeItem(DRAFT_KEY);

    const parsed = JSON.parse(raw) as ExerciseDraftFromPlaybook;
    return parsed.diagram || null;
  } catch {
    return null;
  }
}

export function saveWorkingDraft(data: unknown): void {
  if (!isBrowser()) return;
  sessionStorage.setItem(WORKING_KEY, JSON.stringify(data));
}

export function readWorkingDraft<T = any>(): T | null {
  if (!isBrowser()) return null;

  try {
    const raw = sessionStorage.getItem(WORKING_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function clearWorkingDraft(): void {
  if (!isBrowser()) return;
  sessionStorage.removeItem(WORKING_KEY);
}