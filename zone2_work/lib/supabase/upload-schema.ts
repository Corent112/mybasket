import { createClient } from "@/lib/supabase/client";

export async function uploadSchemaImage(
  base64: string,
  folder = "plaquette",
  fileName?: string
): Promise<string> {
  const supabase = createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError) {
    throw userError;
  }

  if (!user) {
    throw new Error("Utilisateur non connecté");
  }

  if (!base64.startsWith("data:image")) {
    return base64;
  }

  const response = await fetch(base64);
  const blob = await response.blob();

  const cleanFileName = fileName
    ? `${Date.now()}-${crypto.randomUUID()}-${fileName}`
    : `${Date.now()}-${crypto.randomUUID()}.png`;

  const filePath = `${folder}/${cleanFileName}`;

  console.log("📤 Upload schéma :", filePath);

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("exercise-schemas")
    .upload(filePath, blob, {
      contentType: "image/png",
      upsert: false,
    });

  if (uploadError) {
    console.error("❌ Erreur upload schema :", uploadError);
    throw uploadError;
  }

  console.log("✅ Upload réussi :", uploadData?.path);

  const { data: publicUrlData } = supabase.storage
    .from("exercise-schemas")
    .getPublicUrl(filePath);

  if (!publicUrlData?.publicUrl) {
    throw new Error("Impossible de récupérer l'URL publique du schéma");
  }

  return publicUrlData.publicUrl;
}