import { createClient } from "@/lib/supabase/client";

export const newSystemId = () => crypto.randomUUID();

const isBrowser = () => typeof window !== "undefined";

const isUuid = (value: string | null | undefined) =>
  !!value &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );

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
  createdAt?: string | number;
  updatedAt?: string | number;
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
    source?.schema_data !== undefined && source.schema_data !== null;

  return [
    ...fromSchemaDataList,
    ...fromSnakeSchemaDataList,
    ...(hasSchemaData ? [source.schemaData] : []),
    ...(hasSnakeSchemaData ? [source.schema_data] : []),
  ];
}

export function rowToSystem(row: any): SystemItem {
  const schemaImages = normalizeSchemaImages(row);
  const schemaDataList = normalizeSchemaDataList(row);

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
    createdAt: row.created_at ?? Date.now(),
    updatedAt: row.updated_at ?? Date.now(),
  };
}

function systemToRow(system: any, userId: string) {
  const schemaImages = normalizeSchemaImages(system);
  const schemaDataList = normalizeSchemaDataList(system);

  return {
    id: isUuid(system?.id) ? system.id : crypto.randomUUID(),
    user_id: userId,
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
    updated_at: new Date().toISOString(),
  };
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
    alert(`${label}\n${error?.message || error?.details || error?.hint || JSON.stringify(error)}`);
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

export async function listSystems(): Promise<SystemItem[]> {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("systems")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    showSupabaseError("Erreur Supabase listSystems:", error);
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

  const { data, error } = await supabase
    .from("systems")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    showSupabaseError("Erreur Supabase getSystem:", error);
    return null;
  }

  return data ? rowToSystem(data) : null;
}

export async function saveSystem(system: any): Promise<SystemItem | null> {
  const supabase = createClient();
  const user = await getCurrentUser();

  if (!user) {
    if (isBrowser()) alert("Tu dois être connecté pour sauvegarder le système.");
    return null;
  }

  const row = systemToRow(system, user.id);

  // Cas corrigé : si la page a déjà préparé un id, on vérifie s'il existe.
  // S'il existe, on met à jour. Sinon, on insère. Plus de doublon systems_pkey.
  const existing = await getSystem(row.id);

  if (existing) {
    const { data, error } = await supabase
      .from("systems")
      .update(row)
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
    .insert(row)
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

  const current = await getSystem(id);
  const row = systemToRow({ ...(current ?? {}), ...patch, id }, user.id);

  // updateSystem devient un vrai upsert intelligent : si le système n'existe pas encore,
  // on le crée. C'est indispensable pour les flux plaquette / brouillon.
  if (current) {
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

  const { data, error } = await supabase
    .from("systems")
    .insert(row)
    .select("*")
    .maybeSingle();

  if (error || !data) {
    showSupabaseError("Erreur Supabase updateSystem insert:", error);
    return null;
  }

  return rowToSystem(data);
}

export async function deleteSystem(id: string): Promise<void> {
  if (!isUuid(id)) return;

  const supabase = createClient();

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
  });
}
