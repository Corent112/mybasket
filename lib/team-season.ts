/** Basket seasons in MyBasket start in July; official dated calendars take priority. */
export function currentBasketballSeason(date = new Date()): string {
  const year = date.getFullYear() - (date.getMonth() < 6 ? 1 : 0);
  return `${year}-${year + 1}`;
}
export function competitionSeason(matches: Array<{ date?: string | null }>): string | undefined {
  const seasons = new Set<string>();
  for (const match of matches) {
    const value = String(match.date || "");
    const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!parts) continue;
    const [year, month, day] = parts.slice(1).map(Number);
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.toISOString().slice(0,10) !== value) continue;
    const start = year - (month < 7 ? 1 : 0);
    seasons.add(`${start}-${start + 1}`);
  }
  return seasons.size === 1 ? [...seasons][0] : undefined;
}
export function linkedCompetitionSeason(parsed: { seasonLabel?: string; season?: unknown; matches?: Array<{date?: string | null}> }, sourceUrl: string): string | undefined {
  const explicit = /^(\d{4})[\s/–-]+(\d{4})$/.exec(String(parsed.seasonLabel || parsed.season || ""));
  if (explicit && Number(explicit[2]) === Number(explicit[1]) + 1) return `${explicit[1]}-${explicit[2]}`;
  try {
    const url = new URL(sourceUrl);
    const start = Number(url.searchParams.get("yid"));
    if ((url.hostname === "lnb.fr" || url.hostname === "www.lnb.fr") && Number.isInteger(start) && start >= 1900 && start <= 2200) return `${start}-${start + 1}`;
  } catch { /* Calendar dates remain the fallback. */ }
  return competitionSeason(parsed.matches || []);
}
