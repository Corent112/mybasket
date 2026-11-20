/** Keep the subject of a definition question for full-text search. */
export function documentaryQuery(question: string): string {
  return question.trim()
    .replace(/^(?:c['’]est quoi|qu['’]est-ce que|que signifie|que veut dire|définis|définition (?:de|du|des))\s+/iu, "")
    .replace(/^(?:(?:un|une|le|la|les|du|des)\s+|l['’])/iu, "")
    .replace(/[?!.]+$/, "").trim() || question;
}

function words(text: string): string[] {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Pick one definition or a short passage centered on the searched words. */
export function relevantExcerpt(content: string, query: string): { text: string; score: number } | null {
  const terms = [...new Set(words(query).filter((word) => word.length > 2))];
  if (!terms.length) return null;
  const lines = content.split(/\n+|(?<=\p{L}[.!?])\s+(?=\p{Lu})/u).map((line) => line.trim()).filter(Boolean);
  let best: { text: string; score: number } | null = null;
  for (const [index, line] of lines.entries()) {
    const label = line.split(/\s*(?:→|\s+–\s+)\s*/u, 1)[0];
    const tokens = words(line);
    const labelTokens = words(label);
    const hits = terms.filter((word) => tokens.includes(word));
    if (!hits.length) continue;
    const score = hits.length + (label !== line ? terms.filter((word) => labelTokens.includes(word)).length * 2 : 0);
    if (best && best.score >= score) continue;
    const following = lines[index + 1];
    const excerpt = label !== line && following && /^[\p{Ll}]/u.test(following) && !following.includes("→")
      ? `${line} ${following}` : line;
    if (excerpt.length <= 420) {
      best = { text: excerpt, score };
      continue;
    }
    const tokensWithOffsets = Array.from(excerpt.matchAll(/[\p{L}\p{M}\p{N}]+/gu));
    const offset = tokensWithOffsets.find((token) => hits.includes(words(token[0])[0] ?? ""))?.index ?? 0;
    const start = Math.max(0, offset - 100);
    const space = start ? excerpt.indexOf(" ", start) + 1 : 0;
    const from = space > 0 && space <= offset ? space : start;
    const end = excerpt.lastIndexOf(" ", from + 420);
    best = { text: (from ? "…" : "") + excerpt.slice(from, end > from ? end : from + 420).trim() + "…", score };
  }
  return best;
}

export function diagramImageUrl(value?: string | null): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, "https://mybasket.invalid");
    if (url.protocol !== "https:" || url.username || url.password) return undefined;
    if (value.startsWith("/") && !value.startsWith("//") && url.origin === "https://mybasket.invalid") return url.pathname + url.search;
    return /^https:\/\//i.test(value) ? url.href : undefined;
  } catch { return undefined; }
}
