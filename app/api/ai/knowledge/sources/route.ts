import {
  AI_ALLOWED_MIME_TYPES,
  AI_INDEX_RATE_LIMIT,
  AI_INDEX_RATE_WINDOW_MS,
  AI_MAX_FILE_SIZE,
  AI_STORAGE_BUCKET,
} from "@/lib/ai/config";
import {
  getWriterClient,
  indexSource,
  resolveAdminActor,
  resolveSourceType,
} from "@/lib/ai/knowledge";
import {
  apiError,
  apiOk,
  apiServerError,
  enforceRateLimit,
  intInRange,
  optionalStr,
  str,
} from "@/lib/ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/* --------------------------------------------------------------------- */
/* GET — liste paginée + filtres                                          */
/* --------------------------------------------------------------------- */

export async function GET(request: Request) {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  const url = new URL(request.url);
  const search = str(url.searchParams.get("q"), 120);
  const category = str(url.searchParams.get("category"), 60);
  const status = str(url.searchParams.get("status"), 30);
  const page = intInRange(url.searchParams.get("page"), 1, 1000, 1);
  const perPage = intInRange(url.searchParams.get("perPage"), 1, 100, 25);

  try {
    let query = result.actor.supabase
      .from("ai_knowledge_sources")
      .select("*", { count: "exact" })
      .eq("scope", "global")
      .order("created_at", { ascending: false })
      .range((page - 1) * perPage, page * perPage - 1);

    if (search) query = query.or(`title.ilike.%${search}%,description.ilike.%${search}%`);
    if (category) query = query.eq("category_slug", category);
    if (status) query = query.eq("status", status);

    const { data, error, count } = await query;
    if (error) return apiError(error.message, 500);

    return apiOk({ sources: data || [], total: count ?? 0, page, perPage });
  } catch (error) {
    return apiServerError("sources.get", error);
  }
}

/* --------------------------------------------------------------------- */
/* POST — upload d'un document + indexation                               */
/* --------------------------------------------------------------------- */

export async function POST(request: Request) {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  const { actor } = result;

  const limited = enforceRateLimit(
    request,
    "ai-index",
    actor.userId,
    AI_INDEX_RATE_LIMIT,
    AI_INDEX_RATE_WINDOW_MS
  );
  if (limited) return limited;

  const writer = getWriterClient(actor.supabase);
  let uploadedPath: string | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) return apiError("Aucun fichier reçu.");
    if (file.size === 0) return apiError("Le fichier est vide.");
    if (file.size > AI_MAX_FILE_SIZE) {
      return apiError(
        `Fichier trop volumineux (${Math.round(file.size / 1024 / 1024)} Mo). Limite : ${Math.round(AI_MAX_FILE_SIZE / 1024 / 1024)} Mo.`
      );
    }

    const mimeType = file.type || "application/octet-stream";
    const extension = (file.name.split(".").pop() || "").toLowerCase();

    const allowed =
      AI_ALLOWED_MIME_TYPES[mimeType] ||
      Object.values(AI_ALLOWED_MIME_TYPES).find((entry) =>
        entry.extensions.includes(extension)
      );

    if (!allowed) {
      return apiError(
        `Type de fichier non autorisé (${mimeType || extension || "inconnu"}). ` +
          "Formats acceptés : PDF, DOCX, TXT, Markdown, CSV, PPTX, PNG, JPEG, WebP."
      );
    }

    const title = str(formData.get("title"), 200) || file.name.replace(/\.[^.]+$/, "");
    const sourceType = resolveSourceType(mimeType, file.name);

    /* --- 1. Upload dans le bucket privé --------------------------- */
    const safeName = file.name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(-120);

    const storagePath = `global/${crypto.randomUUID()}/${safeName}`;

    const { error: uploadError } = await writer.storage
      .from(AI_STORAGE_BUCKET)
      .upload(storagePath, await file.arrayBuffer(), {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      return apiError(`Envoi du fichier impossible : ${uploadError.message}`, 500);
    }
    uploadedPath = storagePath;

    /* --- 2. Création de la source --------------------------------- */
    const { data: source, error: insertError } = await writer
      .from("ai_knowledge_sources")
      .insert({
        title,
        description: optionalStr(formData.get("description"), 2000),
        source_type: sourceType,
        category_slug: optionalStr(formData.get("category"), 60),
        storage_bucket: AI_STORAGE_BUCKET,
        storage_path: storagePath,
        original_filename: file.name.slice(0, 250),
        mime_type: mimeType,
        file_size: file.size,
        provenance: optionalStr(formData.get("provenance"), 300) || title,
        source_url: optionalStr(formData.get("sourceUrl"), 500),
        author: optionalStr(formData.get("author"), 200),
        status: "uploaded",
        index_status: "pending",
        scope: "global",
        created_by: actor.userId,
        updated_by: actor.userId,
      })
      .select("*")
      .single();

    if (insertError) {
      await writer.storage.from(AI_STORAGE_BUCKET).remove([storagePath]);
      return apiError(`Enregistrement impossible : ${insertError.message}`, 500);
    }

    /* --- 3. Indexation ------------------------------------------- */
    const indexation = await indexSource(actor.supabase, writer, source.id);

    const { data: refreshed } = await actor.supabase
      .from("ai_knowledge_sources")
      .select("*")
      .eq("id", source.id)
      .maybeSingle();

    return apiOk({ source: refreshed || source, indexation }, 201);
  } catch (error) {
    if (uploadedPath) {
      await writer.storage.from(AI_STORAGE_BUCKET).remove([uploadedPath]).catch(() => {});
    }
    return apiServerError("sources.post", error);
  }
}
