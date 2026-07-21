export function eur(cents: number | null | undefined) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format((cents || 0) / 100);
}

export function slugify(value: string) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function discountPct(compareAtCents: number | null | undefined, priceCents: number | null | undefined) {
  const compareAt = compareAtCents || 0;
  const price = priceCents || 0;
  if (!compareAt || !price || compareAt <= price) return 0;
  return Math.round(((compareAt - price) / compareAt) * 100);
}

export function effectivePriceCents(priceCents: number | null | undefined) {
  return priceCents || 0;
}

export function priceMatches(value: string, priceCents: number) {
  if (value === "under-20") return priceCents < 2000;
  if (value === "20-50") return priceCents >= 2000 && priceCents <= 5000;
  if (value === "over-50") return priceCents > 5000;
  return true;
}
