import type { SupabaseClient } from "@supabase/supabase-js";

const BUCKET = "profile-assets";

function safeExtension(file: File): string {
  const fromName = file.name.split(".").pop()?.toLowerCase();
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  return "jpg";
}

export async function uploadProfileAsset(
  supabase: SupabaseClient,
  userId: string,
  kind: "avatar" | "club-logo",
  file: File,
): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("Le fichier sélectionné doit être une image.");
  }
  if (file.size > 8 * 1024 * 1024) {
    throw new Error("L’image ne doit pas dépasser 8 Mo.");
  }

  const extension = safeExtension(file);
  const path = `${userId}/${kind}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    contentType: file.type || undefined,
    upsert: false,
  });

  if (error) throw new Error(`Upload ${kind} impossible : ${error.message}`);

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!data.publicUrl) throw new Error("URL publique de l’image introuvable.");
  return data.publicUrl;
}
