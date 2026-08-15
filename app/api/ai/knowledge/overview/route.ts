import { getKnowledgeOverview, resolveAdminActor } from "@/lib/ai/knowledge";
import { apiError, apiOk, apiServerError } from "@/lib/ai/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const result = await resolveAdminActor();
  if (!result.ok) return apiError(result.error, result.status);

  try {
    const overview = await getKnowledgeOverview(result.actor.supabase);
    return apiOk({ overview });
  } catch (error) {
    return apiServerError("overview", error);
  }
}
