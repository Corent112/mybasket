import { createClient } from "@/lib/supabase/client";

export const newSystemId = () => crypto.randomUUID();

const isBrowser = () => typeof window !== "undefined";

const isUuid = (value: string | null | undefined) =>
  !!value &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{12}$/i.test(
    value
  );

type PlatformRole = "user" | "ceo" | "superadmin" | string | null;
type ReviewStatus = "draft" | "submitted" | "approved" | "rejected";
type Visibility = "private" | "public";

export type SystemItem = {
  id: string;
  title: string;
  objectif?: string;
  organisation?: string;
  deroulement?: string;
  consignes?: string;
  variantes?: string;
  famille?: string;
  categorie?: string;
  type?: string;
  tempsForts?: string[];
  tags?: string[];
  images?: string[];
  videos?: string[];
  schemaImage?: string;
  schemaImages?: string[];
  schemaVideo?: string;
  schemaData?: any;
  schemaDataList?: any[];
  playIds?: string[];
  play_ids?: string[];
  owner_id?: string | null;
  user_id?: string | null;
  visibility?: Visibility;
  review_status?: ReviewStatus;
  submitted_at?: string | null;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  rejection_reason?: string | null;
  original_system_id?: string | null;
  createdAt?: string | number;
  updatedAt?: string | number;
};

export type PlayItem = {
  id: string;
  user_id?: string | null;
  title: string;
  type: string;
  court_type?: string | null;
  thumbnail_url?: string | null;
  play_json: any;
  created_at?: string | null;
  updated_at?: string | null;
};

function cleanStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (item): item is string => typeof item === "string" && item.trim().length > 0
  );
}

function cleanUnknownArray(value: unknown): unknown[] {
  if (!Array.isArray(value)) return [];
  return value;
}

function normalizePlayIds(source: any): string[] {
  const fromCamel = cleanStringArray(source?.playIds);
  const fromSnake = cleanStringArray(source?.play_ids);
  return Array.from(new Set([...fromCamel, ...fromSnake].filter(isUuid)));
}

function normalizeSchemaImages(source: any): string[] {
  const fromSchemaImages = cleanStringArray(source?.schemaImages);
  const fromSnakeSchemaImages = cleanStringArray(source?.schema_images);
  const fromImages = cleanStringArray(source?.images);

  const singleSchemaImage =
    typeof source?.schemaImage === "string" && source.schemaImage.trim()
      ? source.schemaImage.trim()
      : "";

  const singleSnakeSchemaImage =
    typeof source?.schema_image === "string" && source.schema_image.trim()
      ? source.schema_image.trim()
      : "";

  const merged = [
    ...fromSchemaImages,
    ...fromSnakeSchemaImages,
    singleSchemaImage,
    singleSnakeSchemaImage,
    ...fromImages,
  ].filter(Boolean);

  return Array.from(new Set(merged));
}

function normalizeSchemaDataList(source: any): unknown[] {
  const fromSchemaDataList = cleanUnknownArray(source?.schemaDataList);
  const fromSnakeSchemaDataList = cleanUnknownArray(source?.schema_data_list);

  const hasSchemaData = source?.schemaData !== undefined && source.schemaData !== null;
  const hasSnakeSchemaData =
    source?.schema_data !== undefined && source?.schema_data !== null;

  return [
    ...fromSchemaDataList,
    ...fromSnakeSchemaDataList,
    ...(hasSchemaData ? [source.schemaData] : []),
    ...(hasSnakeSchemaData ? [source.schema_data] : []),
  ];
}

function showSupabaseError(label: string, error: any) {
  console.error(label, {
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    code: error?.code,
    full: error,
  });

  if (isBrowser() && error) {
    alert(
      `${label}\n${
        error?.message || error?.details || error?.hint || JSON.stringify(error)
      }`
    );
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

async function getSystemRaw(id: string | null | undefined) {
  if (!isUuid(id)) return null;

  const supabase = createClient();

  const { data, error } = await supabase
    .from("systems")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    showSupabaseError("Erreur Supabase getSystemRaw:", error);
    return null;
  }

  return data;
}

export function rowToSystem(row: any): SystemItem {
  const schemaImages = normalizeSchemaImages(row);
  const schemaDataList = normalizeSchemaDataList(row);
  const playIds = normalizePlayIds(row);

  return {
    id: row.id,
    title: row.title ?? "",
    objectif: row.objectif ?? "",
    organisation: row.organisation ?? "",
    deroulement: row.deroulement ?? "",
    consignes: row.consignes ?? "",
    variantes: row.variantes ?? "",
    famille: row.famille ?? "",
    categorie: row.categorie ?? "",
    type: row.type ?? "",
    tempsForts: row.temps_forts ?? [],
    tags: cleanStringArray(row.tags),
    images: cleanStringArray(row.images),
    videos: cleanStringArray(row.videos),
    schemaImage: schemaImages[0] ?? "",
    schemaImages,
    schemaVideo: row.schema_video ?? "",
    schemaData: schemaDataList[0] ?? null,
    schemaDataList,
    playIds,
    play_ids: playIds,

    // Compatibilité côté front uniquement.
    // La table Supabase systems utilise user_id.
    owner_id: row.user_id ?? null,
    user_id: row.user_id ?? null,

    visibility: row.visibility ?? "private",
    review_status: row.review_status ?? "draft",
    submitted_at: row.submitted_at ?? null,
    reviewed_at: row.reviewed_at ?? null,
    reviewed_by: row.reviewed_by ?? null,
    rejection_reason: row.rejection_reason ?? null,
    original_system_id: row.original_system_id ?? null,
    createdAt: row.created_at ?? Date.now(),
    updatedAt: row.updated_at ?? Date.now(),
  };
}

function systemToRow(system: any, userId: string) {
  const schemaImages = normalizeSchemaImages(system);
  const schemaDataList = normalizeSchemaDataList(system);
  const playIds = normalizePlayIds(system);

  return {
    id: isUuid(system?.id) ? system.id : crypto.randomUUID(),
    user_id: system?.user_id ?? userId,
    visibility: (system?.visibility ?? "private") as Visibility,
    review_status: (system?.review_status ?? "draft") as ReviewStatus,
    original_system_id: system?.original_system_id ?? null,
    title: system?.title ?? "",
    objectif: system?.objectif ?? "",
    organisation: system?.organisation ?? "",
    deroulement: system?.deroulement ?? "",
    consignes: system?.consignes ?? "",
    variantes: system?.variantes ?? "",
    famille: system?.famille ?? "",
    categorie: system?.categorie ?? "",
    type: system?.type ?? "",
    temps_forts: cleanStringArray(system?.tempsForts ?? system?.temps_forts),
    tags: cleanStringArray(system?.tags),
    images: cleanStringArray(system?.images),
    videos: cleanStringArray(system?.videos),
    schema_image: schemaImages[0] ?? "",
    schema_images: schemaImages,
    schema_video: system?.schemaVideo ?? system?.schema_video ?? "",
    schema_data: schemaDataList[0] ?? null,
    schema_data_list: schemaDataList,
    play_ids: playIds,
    updated_at: new Date().toISOString(),
  };
}

function playRowToClient(row: any): PlayItem {
  return {
    id: row.id,
    user_id: row.user_id,
    title: row.title ?? "Schéma sans titre",
    type: row.type ?? "systeme",
    court_type: row.court_type ?? null,
    thumbnail_url: row.thumbnail_url ?? null,
    play_json: row.play_json ?? {},
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

export async function listSystems(): Promise<SystemItem[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("systems")
    .select("*")
    .eq("visibility", "public")
    .eq("review_status", "approved")
    .order("created_at", { ascending: false });

  if (error) {
    showSupabaseError("Erreur Supabase listSystems:", error);
    return [];
  }

  return (data ?? []).map(rowToSystem);
}

export async function listMySystems(): Promise<SystemItem[]> {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("systems")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    showSupabaseError("Erreur Supabase listMySystems:", error);
    return [];
  }

  return (data ?? []).map(rowToSystem);
}

export async function listSubmittedSystemsForCeo(): Promise<SystemItem[]> {
  const supabase = createClient();
  const ceo = await isCeoUser();

  if (!ceo) return [];

  const { data, error } = await supabase
    .from("systems")
    .select("*")
    .eq("visibility", "private")
    .eq("review_status", "submitted")
    .order("submitted_at", { ascending: false });

  if (error) {
    showSupabaseError("Erreur Supabase listSubmittedSystemsForCeo:", error);
    return [];
  }

  return (data ?? []).map(rowToSystem);
}

export async function getSystem(
  id: string | null | undefined
): Promise<SystemItem | null> {
  if (!isUuid(id)) {
    console.warn("getSystem ignoré, id invalide :", id);
    return null;
  }

  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const role = user ? await getCurrentUserRole() : null;
  const ceo = role === "ceo" || role === "superadmin";

  const existing = await getSystemRaw(id);

  if (!existing) return null;

  const isOfficialPublic =
    existing.visibility === "public" && existing.review_status === "approved";

  const isOwner = !!user && existing.user_id === user.id;

  if (!isOfficialPublic && !isOwner && !ceo) {
    return null;
  }

  return rowToSystem(existing);
}

export async function listSystemPlays(systemId: string): Promise<PlayItem[]> {
  const system = await getSystem(systemId);
  const playIds = normalizePlayIds(system);

  if (!playIds.length) return [];

  const supabase = createClient();

  const { data, error } = await supabase
    .from("plays")
    .select("*")
    .in("id", playIds);

  if (error) {
    showSupabaseError("Erreur Supabase listSystemPlays:", error);
    return [];
  }

  const rows: PlayItem[] = (data ?? []).map(playRowToClient);

  const byId = new Map<string, PlayItem>(
    rows.map((play: PlayItem) => [play.id, play])
  );

  return playIds
    .map((id: string) => byId.get(id))
    .filter((play): play is PlayItem => Boolean(play));
}

export async function upsertSystemPlay({
  playId,
  systemId,
  title,
  thumbnailUrl,
  playJson,
  courtType,
}: {
  playId?: string | null;
  systemId: string;
  title?: string;
  thumbnailUrl?: string;
  playJson: any;
  courtType?: string | null;
}): Promise<PlayItem | null> {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    if (isBrowser()) alert("Tu dois être connecté pour sauvegarder le schéma.");
    return null;
  }

  const system = await getSystemRaw(systemId);

  if (!system) {
    if (isBrowser()) alert("Système introuvable.");
    return null;
  }

  const ceo = await isCeoUser();
  const isMine = system.user_id === user.id;

  if (!ceo && !isMine) {
    if (isBrowser()) alert("Tu ne peux modifier que tes systèmes.");
    return null;
  }

  const id = isUuid(playId) ? playId : crypto.randomUUID();

  const row = {
    id,
    user_id: user.id,
    title: title || "Schéma système",
    type: "systeme",
    court_type: courtType ?? null,
    thumbnail_url: thumbnailUrl ?? null,
    play_json: playJson ?? {},
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("plays")
    .upsert(row, { onConflict: "id" })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    showSupabaseError("Erreur Supabase upsertSystemPlay:", error);
    return null;
  }

  const currentPlayIds = normalizePlayIds(system);
  const nextPlayIds = Array.from(new Set([...currentPlayIds, data.id]));

  await updateSystem(systemId, {
    playIds: nextPlayIds,
    play_ids: nextPlayIds,
  });

  return playRowToClient(data);
}

export async function deleteSystemPlay(
  systemId: string,
  playId: string
): Promise<void> {
  if (!isUuid(systemId) || !isUuid(playId)) return;

  const system = await getSystem(systemId);
  const currentPlayIds = normalizePlayIds(system);
  const nextPlayIds = currentPlayIds.filter((id) => id !== playId);

  await updateSystem(systemId, {
    playIds: nextPlayIds,
    play_ids: nextPlayIds,
  });

  const supabase = createClient();

  const { error } = await supabase.from("plays").delete().eq("id", playId);

  if (error) showSupabaseError("Erreur Supabase deleteSystemPlay:", error);
}

export async function saveSystem(system: any): Promise<SystemItem | null> {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    if (isBrowser()) alert("Tu dois être connecté pour sauvegarder le système.");
    return null;
  }

  const ceo = await isCeoUser();

  const prepared = {
    ...system,
    user_id: user.id,
    visibility: ceo ? system.visibility ?? "public" : "private",
    review_status: ceo ? system.review_status ?? "approved" : "draft",
    original_system_id: system.original_system_id ?? null,
  };

  const row = systemToRow(prepared, user.id);
  const existing = await getSystemRaw(row.id);

  if (existing) {
    const isMine = existing.user_id === user.id;

    if (!ceo && !isMine) {
      if (isBrowser()) alert("Tu ne peux modifier que tes systèmes.");
      return null;
    }

    const updateRow = systemToRow(
      {
        ...existing,
        ...prepared,
        user_id: existing.user_id ?? user.id,
        visibility: ceo ? prepared.visibility ?? "public" : "private",
        review_status: ceo
          ? prepared.review_status ?? "approved"
          : existing.review_status === "submitted"
          ? "draft"
          : prepared.review_status ?? existing.review_status ?? "draft",
      },
      user.id
    );

    const { data, error } = await supabase
      .from("systems")
      .update(updateRow)
      .eq("id", row.id)
      .select("*")
      .maybeSingle();

    if (error || !data) {
      showSupabaseError("Erreur Supabase saveSystem update:", error);
      return null;
    }

    return rowToSystem(data);
  }

  const { data, error } = await supabase
    .from("systems")
    .insert({ ...row, created_at: new Date().toISOString() })
    .select("*")
    .maybeSingle();

  if (error || !data) {
    showSupabaseError("Erreur Supabase saveSystem insert:", error);
    return null;
  }

  return rowToSystem(data);
}

export async function updateSystem(
  id: string | null | undefined,
  patch: Partial<SystemItem>
): Promise<SystemItem | null> {
  if (!isUuid(id)) {
    console.warn("updateSystem ignoré, id invalide :", id);
    return null;
  }

  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) return null;

  const existing = await getSystemRaw(id);

  if (!existing) {
    if (isBrowser()) alert("Système introuvable.");
    return null;
  }

  const ceo = await isCeoUser();
  const isMine = existing.user_id === user.id;

  if (!ceo && !isMine) {
    if (isBrowser()) alert("Tu ne peux modifier que tes systèmes.");
    return null;
  }

  const row = systemToRow(
    {
      ...existing,
      ...patch,
      id,
      user_id: existing.user_id ?? user.id,
      visibility: ceo ? existing.visibility ?? "public" : "private",
      review_status: ceo
        ? existing.review_status ?? "approved"
        : existing.review_status === "submitted"
        ? "draft"
        : existing.review_status ?? "draft",
    },
    user.id
  );

  const { data, error } = await supabase
    .from("systems")
    .update(row)
    .eq("id", id)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    showSupabaseError("Erreur Supabase updateSystem:", error);
    return null;
  }

  return rowToSystem(data);
}

export async function submitSystemForReview(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;

  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) return false;

  const existing = await getSystemRaw(id);

  if (!existing) return false;

  const isMine = existing.user_id === user.id;

  if (!isMine) {
    if (isBrowser()) alert("Tu ne peux proposer que tes propres systèmes.");
    return false;
  }

  const { error } = await supabase
    .from("systems")
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
    showSupabaseError("Erreur Supabase submitSystemForReview:", error);
    return false;
  }

  return true;
}

export async function approveSystemForLibrary(id: string): Promise<boolean> {
  if (!isUuid(id)) return false;

  const supabase = createClient();
  const user = await getCurrentUser();
  const ceo = await isCeoUser();

  if (!user || !ceo) {
    if (isBrowser()) alert("Action réservée au CEO.");
    return false;
  }

  const existing = await getSystemRaw(id);

  if (!existing) return false;

  const officialCopy = systemToRow(
    {
      ...existing,
      id: crypto.randomUUID(),
      user_id: user.id,
      visibility: "public",
      review_status: "approved",
      original_system_id: existing.id,
    },
    user.id
  );

  const { error: insertError } = await supabase.from("systems").insert({
    ...officialCopy,
    created_at: new Date().toISOString(),
  });

  if (insertError) {
    showSupabaseError(
      "Erreur Supabase approveSystemForLibrary insert:",
      insertError
    );
    return false;
  }

  const { error: updateError } = await supabase
    .from("systems")
    .update({
      visibility: "private",
      review_status: "approved",
      reviewed_at: new Date().toISOString(),
      reviewed_by: user.id,
      rejection_reason: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", existing.id);

  if (updateError) {
    showSupabaseError(
      "Erreur Supabase approveSystemForLibrary update:",
      updateError
    );
    return false;
  }

  return true;
}

export async function rejectSystemForLibrary(
  id: string,
  reason = ""
): Promise<boolean> {
  if (!isUuid(id)) return false;

  const supabase = createClient();
  const user = await getCurrentUser();
  const ceo = await isCeoUser();

  if (!user || !ceo) {
    if (isBrowser()) alert("Action réservée au CEO.");
    return false;
  }

  const { error } = await supabase
    .from("systems")
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
    showSupabaseError("Erreur Supabase rejectSystemForLibrary:", error);
    return false;
  }

  return true;
}

export async function deleteSystem(id: string): Promise<void> {
  if (!isUuid(id)) return;

  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) return;

  const existing = await getSystemRaw(id);

  if (!existing) return;

  const ceo = await isCeoUser();
  const isMine = existing.user_id === user.id;

  if (!ceo && !isMine) {
    if (isBrowser()) alert("Tu ne peux supprimer que tes systèmes.");
    return;
  }

  const playIds = normalizePlayIds(existing);

  if (playIds.length) {
    await supabase.from("plays").delete().in("id", playIds);
  }

  const { error } = await supabase.from("systems").delete().eq("id", id);

  if (error) showSupabaseError("Erreur Supabase deleteSystem:", error);
}

export async function duplicateSystem(id: string): Promise<SystemItem | null> {
  const system = await getSystem(id);

  if (!system) return null;

  return saveSystem({
    ...system,
    id: crypto.randomUUID(),
    title: `${system.title || "Système"} (copie)`,
    visibility: "private",
    review_status: "draft",
    original_system_id: system.id,
    playIds: [],
    play_ids: [],
  });
}