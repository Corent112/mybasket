import type { AiCitation } from "@/lib/ai/knowledge/types";

export async function searchCoachWeb(question: string, apiKey: string) {
  const params = new URLSearchParams({
    q: `basketball ${question.slice(0, 530)}`, country: "FR", search_lang: "fr", count: "6",
  });
  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, {
    headers: { Accept: "application/json", "X-Subscription-Token": apiKey },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(7_000),
  });
  if (!response.ok) throw new Error(`Recherche web indisponible (${response.status})`);
  const body = await response.json();
  const results: { url?: string; title?: string; description?: string }[] = Array.isArray(body?.web?.results) ? body.web.results : [];
  const citations: AiCitation[] = [];
  let answer = "";
  const seen = new Set<string>();
  for (const result of results.slice(0, 6)) {
    if (!result || typeof result.url !== "string" || !/^https?:\/\//i.test(result.url) || seen.has(result.url) || typeof result.description !== "string") continue;
    const label = typeof result.title === "string" ? result.title.replace(/<[^>]+>/g, "").slice(0, 160) : result.url;
    seen.add(result.url);
    answer += `${label}\n${result.description.replace(/<[^>]+>/g, "").slice(0, 550)}`;
    citations.push({ id: result.url, kind: "web", label, url: result.url, endIndex: answer.length });
    answer += "\n\n";
  }
  return { answer, citations };
}
