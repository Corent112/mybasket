import { requireAdmin } from "@/lib/admin/guard";
import { getKnowledgeOverview } from "@/lib/ai/knowledge";
import type { AiKnowledgeCategory } from "@/lib/ai/knowledge/types";
import KnowledgeClient from "./KnowledgeClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Connaissances IA — Administration MyBasket",
};

export default async function ConnaissancesIaPage() {
  const { supabase, profile, user } = await requireAdmin();

  const [overview, categoriesResult] = await Promise.all([
    getKnowledgeOverview(supabase),
    supabase
      .from("ai_knowledge_categories")
      .select("*")
      .eq("is_active", true)
      .order("position", { ascending: true }),
  ]);

  const categories = (categoriesResult.data || []) as AiKnowledgeCategory[];

  const adminName =
    (profile as { display_name?: string | null })?.display_name ||
    user.email ||
    "Administration";

  return (
    <KnowledgeClient
      initialOverview={overview}
      initialCategories={categories}
      adminName={adminName}
    />
  );
}
