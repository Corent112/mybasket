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
  return terms.length > 1 ? terms.join(" OR ") : null;
}

function comparable(word: string): string {
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
    const label = words(definition).map(comparable);
    if (!label.length) continue;
    const labelMatches = terms.filter((term) => label.includes(term)).length;
    const matchesTopic = labelMatches > 0 && label.length >= requiredHits && label.length <= 8 && queryPhrase.includes(` ${label.join(" ")} `);
    const following = lines[index + 1];
    const isHeading = matchesTopic && definition === line && !!following;
    if (matchesTopic && definition === line && !following) continue;

    const limit = isHeading ? 1600 : 750;
    const passage = isHeading ? lines.slice(index).join("\n") : [line, following].filter(Boolean).join("\n");
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
export function documentaryPassages<T extends { content: string }>(chunks: T[], query: string) {
  const ranked = chunks.flatMap((chunk) => {
    const excerpt = relevantExcerpt(chunk.content, query);
    return excerpt ? [{ chunk, excerpt }] : [];
  }).sort((a, b) => b.excerpt.score - a.excerpt.score);

  const passages: typeof ranked = [];
  const included = new Set<string>();
  const minimumScore = (ranked[0]?.excerpt.score ?? 0) * 0.55;

  for (const result of ranked) {
    if (passages.length === 5 || result.excerpt.score < minimumScore) break;
    const fingerprint = words(result.excerpt.text).join(" ");
    if ([...included].some((previous) => previous.includes(fingerprint) || fingerprint.includes(previous))) continue;
    included.add(fingerprint);
    passages.push(result);
  }

  return passages;
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
