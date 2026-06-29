import { createClient } from "@/lib/supabase/client";

export type Playbook = {
  id: string;
  owner_id: string;
  title: string;
  description: string | null;
  category: string | null;
  level: string | null;
  season: string | null;
  team_id: string | null;
  created_at: string | null;
  updated_at: string | null;
};

export type PlaybookCategory = "Système demi-terrain" | "SLOB" | "BLOB" | "ATO";

export type PlaybookSystem = {
  id: string;
  owner_id: string;
  playbook_id: string;
  title: string;
  category: PlaybookCategory | string | null;
  description: string | null;
  system_id: string | null;
  schema_images: string[] | null;
  schema_data_list: unknown[] | null;
  tags: string[] | null;
  created_at: string | null;
  updated_at: string | null;
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

async function getUserId(): Promise<string> {
  const supabase = createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    throw new Error("Non connecté");
  }

  return user.id;
}

export async function listPlaybooks(): Promise<Playbook[]> {
  const supabase = createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("playbooks")
    .select("*")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;

  return (data ?? []) as Playbook[];
}

export async function getPlaybook(id: string): Promise<Playbook | null> {
  if (!id) return null;

  const supabase = createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("playbooks")
    .select("*")
    .eq("id", id)
    .eq("owner_id", userId)
    .maybeSingle();

  if (error) throw error;

  return data as Playbook | null;
}

export async function createPlaybook(payload: {
  title: string;
  description?: string;
  category?: string | null;
  level?: string | null;
  season?: string | null;
  team_id?: string | null;
}): Promise<Playbook> {
  const title = payload.title.trim();

  if (!title) {
    throw new Error("Le titre du playbook est obligatoire");
  }

  const supabase = createClient();
  const userId = await getUserId();

  const now = new Date().toISOString();

  const { data, error } = await supabase
    .from("playbooks")
    .insert({
      owner_id: userId,
      title,
      description: payload.description ?? "",
      category: payload.category ?? null,
      level: payload.level ?? null,
      season: payload.season ?? null,
      team_id: payload.team_id ?? null,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) throw error;

  return data as Playbook;
}

export async function updatePlaybook(
  id: string,
  patch: Partial<
    Pick<
      Playbook,
      "title" | "description" | "category" | "level" | "season" | "team_id"
    >
  >
): Promise<Playbook> {
  const supabase = createClient();
  const userId = await getUserId();

  const nextPatch: Record<string, unknown> = {
    ...patch,
    updated_at: new Date().toISOString(),
  };

  if (typeof patch.title === "string") {
    nextPatch.title = patch.title.trim();
  }

  const { data, error } = await supabase
    .from("playbooks")
    .update(nextPatch)
    .eq("id", id)
    .eq("owner_id", userId)
    .select("*")
    .single();

  if (error) throw error;

  return data as Playbook;
}

export async function deletePlaybook(id: string): Promise<void> {
  const supabase = createClient();
  const userId = await getUserId();

  const systemsDelete = await supabase
    .from("playbook_systems")
    .delete()
    .eq("playbook_id", id)
    .eq("owner_id", userId);

  if (systemsDelete.error) throw systemsDelete.error;

  const { error } = await supabase
    .from("playbooks")
    .delete()
    .eq("id", id)
    .eq("owner_id", userId);

  if (error) throw error;
}

export async function listPlaybookSystems(
  playbookId: string
): Promise<PlaybookSystem[]> {
  if (!playbookId) return [];

  const supabase = createClient();
  const userId = await getUserId();

  const { data, error } = await supabase
    .from("playbook_systems")
    .select("*")
    .eq("owner_id", userId)
    .eq("playbook_id", playbookId)
    .order("created_at", { ascending: true });

  if (error) throw error;

  return (data ?? []) as PlaybookSystem[];
}

export async function addSystemToPlaybook(payload: {
  playbook_id: string;
  title: string;
  category: PlaybookCategory;
  description?: string;
  system_id?: string | null;
  schema_images?: string[] | null;
  schema_data_list?: unknown[] | null;
  tags?: string[] | null;
}): Promise<PlaybookSystem> {
  const title = payload.title.trim();

  if (!title) {
    throw new Error("Le titre du système est obligatoire");
  }

  const supabase = createClient();
  const userId = await getUserId();

  const now = new Date().toISOString();

  const schemaImages = cleanStringArray(payload.schema_images);
  const schemaDataList = cleanUnknownArray(payload.schema_data_list);
  const tags = cleanStringArray(payload.tags);

  console.log("ADD SYSTEM TO PLAYBOOK", {
    title,
    schemaImages,
    schemaImagesCount: schemaImages.length,
    schemaDataListCount: schemaDataList.length,
  });

  const { data, error } = await supabase
    .from("playbook_systems")
    .insert({
      owner_id: userId,
      playbook_id: payload.playbook_id,
      title,
      category: payload.category,
      description: payload.description ?? "",
      system_id: payload.system_id ?? null,
      schema_images: schemaImages,
      schema_data_list: schemaDataList,
      tags,
      created_at: now,
      updated_at: now,
    })
    .select("*")
    .single();

  if (error) throw error;

  return data as PlaybookSystem;
}

export async function updatePlaybookSystem(
  id: string,
  patch: Partial<PlaybookSystem>
): Promise<PlaybookSystem> {
  const supabase = createClient();
  const userId = await getUserId();

  const nextPatch: Record<string, unknown> = {
    ...patch,
    updated_at: new Date().toISOString(),
  };

  if (typeof patch.title === "string") {
    nextPatch.title = patch.title.trim();
  }

  if ("schema_images" in patch) {
    nextPatch.schema_images = cleanStringArray(patch.schema_images);
  }

  if ("schema_data_list" in patch) {
    nextPatch.schema_data_list = cleanUnknownArray(patch.schema_data_list);
  }

  if ("tags" in patch) {
    nextPatch.tags = cleanStringArray(patch.tags);
  }

  const { data, error } = await supabase
    .from("playbook_systems")
    .update(nextPatch)
    .eq("id", id)
    .eq("owner_id", userId)
    .select("*")
    .single();

  if (error) throw error;

  return data as PlaybookSystem;
}

export async function deletePlaybookSystem(id: string): Promise<void> {
  const supabase = createClient();
  const userId = await getUserId();

  const { error } = await supabase
    .from("playbook_systems")
    .delete()
    .eq("id", id)
    .eq("owner_id", userId);

  if (error) throw error;
}

export async function duplicatePlaybookSystem(
  system: PlaybookSystem
): Promise<PlaybookSystem> {
  return addSystemToPlaybook({
    playbook_id: system.playbook_id,
    title: `${system.title} copie`,
    category: (system.category || "Système demi-terrain") as PlaybookCategory,
    description: system.description || "",
    system_id: system.system_id,
    schema_images: cleanStringArray(system.schema_images),
    schema_data_list: cleanUnknownArray(system.schema_data_list),
    tags: cleanStringArray(system.tags),
  });
}