import type { SupabaseClient } from "@supabase/supabase-js";
import { safeQuantity } from "@/lib/payments/checkout-integrity";
export type PostalAddress = {
  name: string;
  line1: string;
  line2: string;
  postalCode: string;
  city: string;
  country: string;
};
export const emptyAddress = (): PostalAddress => ({
  name: "",
  line1: "",
  line2: "",
  postalCode: "",
  city: "",
  country: "FR",
});
export const SHIPPING_SOURCE = "https://www.laposte.fr/tarif-colissimo";
// Public Colissimo domicile tariffs, verified 19 Nov 2026. Prices in euro cents.
const WEIGHTS = [250, 500, 750, 1000, 2000, 5000, 10000, 15000, 30000];
const TARIFFS: Record<number, number[]> = {
  2026: [549, 759, 929, 959, 1119, 1739, 2529, 3199, 3959],
  2027: [579, 799, 979, 1009, 1179, 1829, 2669, 3379, 4179],
};
export function colissimoDomicile(
  weight: number,
  country: string,
  postalCode: string,
  now = new Date(),
) {
  const year = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Europe/Paris",
      year: "numeric",
    }).format(now),
  );
  if (!TARIFFS[year])
    throw new Error(
      "Le tarif transporteur doit être actualisé avant de payer.",
    );
  const supported =
    (country === "FR" && /^(?:0[1-9]|[1-8]\d|9[0-5])\d{3}$/.test(postalCode)) ||
    (country === "MC" && postalCode === "98000") ||
    (country === "AD" && /^AD[1-7]00$/i.test(postalCode));
  if (!supported)
    throw new Error(
      "Livraison disponible en France métropolitaine, à Monaco et en Andorre. Vérifie le code postal.",
    );
  const bracket = WEIGHTS.findIndex((limit) => weight <= limit);
  if (!Number.isFinite(weight) || weight <= 0 || bracket < 0)
    throw new Error("Le poids du colis doit être compris entre 1 g et 30 kg.");
  return {
    cents: TARIFFS[year][bracket],
    year,
    weightGrams: weight,
    bracketGrams: WEIGHTS[bracket],
    service: "Colissimo à domicile",
    source: SHIPPING_SOURCE,
  };
}
export function validateAddress(value: unknown): PostalAddress {
  const raw = value as Partial<PostalAddress> | null;
  const address = Object.fromEntries(
    ["name", "line1", "line2", "postalCode", "city", "country"].map((key) => [
      key,
      String(raw?.[key as keyof PostalAddress] || "")
        .trim()
        .slice(0, 200),
    ]),
  ) as PostalAddress;
  address.country = address.country.toUpperCase();
  address.postalCode = address.postalCode.toUpperCase();
  if (
    !address.name ||
    !address.line1 ||
    !address.city ||
    !/^[A-Z]{2}$/.test(address.country) ||
    !address.postalCode
  )
    throw new Error(
      "Complète le nom, l’adresse, le code postal, la ville et le pays.",
    );
  return address;
}
export async function resolveShippingQuote(
  db: SupabaseClient,
  items: {
    item_type: string;
    item_id?: string | null;
    quantity?: number | null;
  }[],
  country: string,
  postalCode: string,
) {
  const physical = items.filter((item) => item.item_type === "product");
  if (!physical.length)
    return {
      cents: 0,
      weightGrams: 0,
      required: false,
      service: "Aucune expédition",
      year: 0,
      source: SHIPPING_SOURCE,
    };
  const { data: products, error } = await db
    .from("products")
    .select("id,name,category,metadata,status")
    .in(
      "id",
      physical.map((item) => String(item.item_id)),
    );
  if (error)
    throw new Error("Les poids des produits ne peuvent pas être vérifiés.");
  let weight = 0;
  for (const item of physical) {
    const product = products?.find((p) => p.id === item.item_id);
    if (!product || product.status !== "active")
      throw new Error("Un produit du panier n’est plus disponible.");
    if (product.metadata?.requires_shipping === false) continue;
    const configured = product.metadata?.weight_g;
    const grams =
      configured == null &&
      /cahier|notebook/i.test(`${product.name} ${product.category}`)
        ? 250
        : Number(configured);
    if (!Number.isFinite(grams) || grams <= 0 || grams > 30000)
      throw new Error(
        `Le poids du produit « ${product.name} » doit être renseigné par la boutique.`,
      );
    weight += Math.ceil(grams) * safeQuantity(item.quantity);
  }
  if (!weight)
    return {
      cents: 0,
      weightGrams: 0,
      required: false,
      service: "Aucune expédition",
      year: 0,
      source: SHIPPING_SOURCE,
    };
  return { ...colissimoDomicile(weight, country, postalCode), required: true };
}
