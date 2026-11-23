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

const QUESTION_WORDS = new Set((
  "aux avec ces cette comment dans des donc elle elles encore entre est etre faut font les leur leurs lui mais meme nous " +
  "par parce pas peux peut pour pourquoi quand quel quelle quelles quels que qui quoi sans sera sont " +
  "suis sur tous tout toute toutes une vos vous veux explique expliquer difference exemple exemples"
).split(" "));

function keywords(text: string): string[] {
  return [...new Set(words(text).filter((word) => (word.length > 2 || /^\d+$/.test(word)) && !QUESTION_WORDS.has(word)))];
}

/** PostgreSQL websearch syntax. Tokens are words only, so user punctuation cannot become operators. */
export function relaxedDocumentQuery(question: string): string | null {
  const terms = keywords(question).slice(0, 12);
  if (terms.some((term) => term === "protect" || term === "drop")) terms.push("protect", "drop");
  const uniqueTerms = [...new Set(terms)];
  return uniqueTerms.length > 1 ? uniqueTerms.join(" OR ") : null;
}

function comparable(word: string): string {
  if (word === "drop") return "protect";
  return word.length >= 5 ? word.replace(/[sx]$/, "") : word;
}

/** Rank supported passages using topic coverage and the context around a matching heading. */
export function relevantExcerpt(content: string, query: string): { text: string; score: number } | null {
  const terms = [...new Set(keywords(query).map(comparable))];
  if (!terms.length) return null;
  const requiredHits = Math.min(2, terms.length);
  const queryPhrase = ` ${words(query).map(comparable).join(" ")} `;
  const lines = content.split(/\n+|(?<=\p{L}[.!?])\s+(?=\p{Lu})/u).map((line) => line.trim()).filter(Boolean);
  let best: { text: string; score: number } | null = null;

  for (const [index, line] of lines.entries()) {
    const definition = line.split(/\s*(?:→|\s+–\s+)\s*/u, 1)[0];
    const label = [...new Set(words(definition).map(comparable))];
    if (!label.length) continue;
    const labelMatches = terms.filter((term) => label.includes(term)).length;
    const matchesTopic = labelMatches > 0 && (label.length >= requiredHits || (label.length === 1 && label[0] === "protect")) && label.length <= 8 && queryPhrase.includes(` ${label.join(" ")} `);
    const following = lines[index + 1];
    const isHeading = matchesTopic && definition === line && !!following;
    if (matchesTopic && definition === line && !following) continue;

    const limit = isHeading ? 2400 : 1000;
    const nextHeading = isHeading ? lines.findIndex((candidate, position) =>
      position > index + 1 && /^[\p{Lu}][^.!?;:]{2,64}$/u.test(candidate)
        && /^\s*[•–-]/u.test(lines[position + 1] ?? "")
    ) : -1;
    const passage = isHeading
      ? lines.slice(index, nextHeading === -1 ? undefined : nextHeading).join("\n")
      : [line, following].filter(Boolean).join("\n");
    const end = passage.length > limit ? passage.lastIndexOf(isHeading ? "\n" : " ", limit) : passage.length;
    const text = passage.length > limit ? passage.slice(0, end >= limit / 2 ? end : limit).trimEnd() + "…" : passage;
    const passageWords = new Set(words(text).map(comparable));
    const hits = terms.filter((term) => passageWords.has(term)).length;
    if (!labelMatches || (hits < requiredHits && !matchesTopic)) continue;
    const score = hits + labelMatches + (matchesTopic ? 5 : 0)
      + (isHeading ? 2 + Math.min(text.length, limit) / limit : 0);
    if (!best || score > best.score) best = { text, score };
  }
  return best;
}

/** Select complementary extracts without reporting the same evidence twice. */
export function documentaryPassages<T extends { content: string; id?: string }>(
  chunks: T[], query: string, sharedUsage?: ReadonlyMap<string, number>,
) {
  const ranked = chunks.flatMap((chunk) => {
    const excerpt = relevantExcerpt(chunk.content, query);
    return excerpt ? [{ chunk, excerpt }] : [];
  }).sort((a, b) => b.excerpt.score - a.excerpt.score
    || (sharedUsage?.get(b.chunk.id ?? "") ?? 0) - (sharedUsage?.get(a.chunk.id ?? "") ?? 0));

  const passages: typeof ranked = [];
  const included = new Set<string>();
  const minimumScore = (ranked[0]?.excerpt.score ?? 0) * 0.35;

  for (const result of ranked) {
    if (result.excerpt.score < minimumScore) break;
    const fingerprint = words(result.excerpt.text).join(" ");
    if ([...included].some((previous) => previous.includes(fingerprint) || fingerprint.includes(previous))) continue;
    included.add(fingerprint);
    passages.push(result);
  }

  return passages;
}

/** Extract named options from the answer evidence before looking for more detail. */
export function documentaryTopics(excerpts: string[], query: string): string[] {
  const original = ` ${words(query).join(" ")} `;
  const topics = new Set<string>();
  for (const excerpt of excerpts) {
    const labels = excerpt.matchAll(/(?:^|\n)\s*(?:[•–-]\s*)?([^\n:]{3,55})\s*:|\b(?:en|avec un|avec une)\s+([\p{L}-]+(?:\s+[\p{L}-]+){1,3})(?=,)/giu);
    for (const match of labels) {
      const label = (match[1] ?? match[2]).trim();
      const tokens = words(label);
      if (!tokens.length || tokens.length > 5 || !keywords(label).length) continue;
      const key = tokens.join(" ");
      if (!original.includes(` ${key} `)) topics.add(key);
      if (topics.size === 8) return [...topics];
    }
  }
  return [...topics];
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

type PreviousChatMessage = {
  conversation_id: string;
  role: string;
  content: string;
  error: string | null;
};

/** Reuse vocabulary from related exchanges without carrying over old answers. */
export function learnedDocumentQuery(question: string, newestFirst: PreviousChatMessage[]): string | null {
  const requested = new Set(keywords(question).map(comparable));
  if (requested.size < 2) return null;

  const answers = new Map<string, string>();
  let best: { score: number; additions: string[] } | undefined;

  for (const entry of newestFirst) {
    if (entry.role === "assistant") {
      answers.set(entry.conversation_id, entry.error ? "" : entry.content);
      continue;
    }

    const answer = answers.get(entry.conversation_id);
    answers.delete(entry.conversation_id);
    if (!answer || answer.startsWith("Je n’ai pas trouvé")) continue;

    const asked = keywords(entry.content);
    const matches = asked.filter((word) => requested.has(comparable(word)));
    const score = new Set(matches.map(comparable)).size;
    if (score < Math.max(2, requested.size - 1) || score <= (best?.score ?? 0)) continue;

    const used = new Set(keywords(answer).map(comparable));
    const additions = asked.filter((word) => !requested.has(comparable(word)) && used.has(comparable(word)));
    if (additions.length) best = { score, additions: additions.slice(0, 3) };
  }

  return best ? [question, ...best.additions].join(" ") : null;
}
