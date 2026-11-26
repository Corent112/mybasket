import { isSameOriginMutation } from "@/lib/security/request-origin";
import {
  AI_ALLOWED_MIME_TYPES,
  AI_MAX_FILE_SIZE,
  AI_STORAGE_BUCKET,
} from "@/lib/ai/config";
import {
  resolveAdminActor,
  getWriterClient,
} from "@/lib/ai/knowledge";
import { apiError, apiOk, enforceRateLimit, str } from "@/lib/ai/http";
export async function POST(request: Request) {
  if (!isSameOriginMutation(request)) return apiError("Origine invalide", 403);
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);
  const limited = enforceRateLimit(
    request,
    "ai-upload-prepare",
    result.actor.userId,
    30,
    60000,
  );
  if (limited) return limited;
  const body = await request.json().catch(() => ({}));
  const name = str(body.name, 250);
  const size = Number(body.size);
  const extension = name.split(".").pop()?.toLowerCase() || "";
  const format = Object.entries(AI_ALLOWED_MIME_TYPES).find(([, entry]) =>
    entry.extensions.includes(extension),
  );
  if (!name || !Number.isSafeInteger(size) || size <= 0) {
    return apiError("Le fichier est vide ou illisible.");
  }
  if (size > AI_MAX_FILE_SIZE) {
    return apiError(`« ${name} » fait ${(size / 1024 / 1024).toFixed(1)} Mo. La limite d’envoi est de 50 Mo.`, 413);
  }
  if (!format) return apiError("Format non pris en charge. Choisis un PDF, DOCX, PPTX, TXT, Markdown, CSV ou une image acceptée.", 415);
  const [mimeType, { sourceType }] = format;
  const actor = result.actor,
    writer = getWriterClient(actor.supabase);
  const safeName =
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(-120)
      .replace(/^\.+/, "") || "document";
  const path = `global/${crypto.randomUUID()}/${safeName}`;
  const bucket = await writer.storage.getBucket(AI_STORAGE_BUCKET);
  if (bucket.data?.public)
    return apiError("Le stockage des ressources doit être privé.", 503);
  if (!bucket.data) {
    const created = await writer.storage.createBucket(AI_STORAGE_BUCKET, {
      public: false,
      fileSizeLimit: AI_MAX_FILE_SIZE,
    });
    if (created.error && !/exists/i.test(created.error.message))
      return apiError("Le stockage documentaire n’est pas disponible.", 503);
  }
  const { data: signed, error: signError } = await writer.storage
    .from(AI_STORAGE_BUCKET)
    .createSignedUploadUrl(path);
  if (signError || !signed)
    return apiError("Préparation de l’envoi impossible.", 503);
  const { data: source, error } = await writer
    .from("ai_knowledge_sources")
    .insert({
      title: str(body.title, 200) || name.replace(/\.[^.]+$/, ""),
      description: str(body.description, 2000) || null,
      category_slug: str(body.category, 60) || null,
      provenance: str(body.provenance, 300) || name,
      author: str(body.author, 200) || null,
      source_type: sourceType,
      storage_bucket: AI_STORAGE_BUCKET,
      storage_path: path,
      original_filename: name,
      mime_type: mimeType,
      file_size: size,
      status: "uploaded",
      index_status: "pending",
      scope: "global",
      created_by: actor.userId,
      updated_by: actor.userId,
    })
    .select("id")
    .single();
  if (error || !source)
    return apiError("Enregistrement du document impossible.", 503);
  return apiOk({
    sourceId: source.id,
    path: signed.path,
    token: signed.token,
    bucket: AI_STORAGE_BUCKET,
    mimeType,
  });
}
