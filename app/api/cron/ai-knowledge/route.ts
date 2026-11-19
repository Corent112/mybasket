import { INDEX_LEASE_MS, indexSource } from "@/lib/ai/knowledge/indexer";
import { createAdminClient } from "@/lib/supabase/admin-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return Response.json({ error: "Non autorisé." }, { status: 401 });
  }

  const db = createAdminClient();
  if (!db) return Response.json({ error: "Serveur indisponible." }, { status: 503 });

  const cutoff = new Date(Date.now() - INDEX_LEASE_MS).toISOString();
  const { data: sources, error } = await db
    .from("ai_knowledge_sources")
    .select("id,updated_at")
    .eq("scope", "global")
    .eq("is_active", true)
    .neq("status", "archived")
    .not("storage_path", "is", null)
    .in("index_status", ["pending", "failed", "running"])
    .or("metadata->>automatic_index_exhausted.is.null,metadata->>automatic_index_exhausted.eq.false")
    .lt("updated_at", cutoff)
    .order("updated_at")
    .order("id")
    .limit(4);

  if (error) {
    console.error("[AI][daily-index] Lecture de la file impossible", error.code);
    return Response.json({ error: "File d’indexation indisponible." }, { status: 503 });
  }

  const results = await Promise.allSettled(
    sources.map((source) => indexSource(db, db, source.id, { scheduledVersion: source.updated_at })),
  );
  const indexed = results.filter((result) => result.status === "fulfilled" && result.value.ok && result.value.chunkCount > 0).length;
  const storedOnly = results.filter((result) => result.status === "fulfilled" && result.value.ok && result.value.chunkCount === 0).length;
  const summary = { processed: results.length, indexed, storedOnly, failed: results.length - indexed - storedOnly };
  console.info("[AI][daily-index]", summary);
  return Response.json(summary);
}
