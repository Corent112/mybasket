import { createClient } from "@/lib/supabase/server";
import type {
  GroupedFilters,
  Product,
  ProductFilter,
  ProductReview,
  ReviewStat,
} from "@/types/shop";

type ProductRow = Record<string, unknown>;

export function normalizeProduct(row: ProductRow): Product {
  const images = Array.isArray(row.images)
    ? row.images.filter((value): value is string => typeof value === "string")
    : [];

  const name = String(row.name || row.title || "Produit MyBasket");
  const description = String(
    row.description || row.description_long || row.description_short || "",
  ) || null;
  const imageUrl = String(row.image_url || images[0] || "") || null;
  const priceCents = Number(
    row.price_cents ?? Math.round(Number(row.price || 0) * 100),
  );
  const compareAtPriceCents =
    row.compare_at_price_cents != null
      ? Number(row.compare_at_price_cents)
      : row.promo_price != null
        ? Math.round(Number(row.promo_price) * 100)
        : null;
  const status = String(
    row.status || (row.active === true ? "active" : "draft"),
  );

  return {
    ...(row as Product),
    id: String(row.id),
    name,
    slug: row.slug ? String(row.slug) : null,
    description,
    category: row.category ? String(row.category) : null,
    image_url: imageUrl,
    price_cents: Number.isFinite(priceCents) ? priceCents : 0,
    compare_at_price_cents: compareAtPriceCents,
    stock_quantity: Number(row.stock_quantity ?? row.stock ?? 0),
    status,
    is_featured: Boolean(row.is_featured ?? row.featured),
    metadata:
      row.metadata && typeof row.metadata === "object"
        ? (row.metadata as Record<string, unknown>)
        : {},
    created_at: row.created_at ? String(row.created_at) : null,
    updated_at: row.updated_at ? String(row.updated_at) : null,
    title: row.title ? String(row.title) : name,
    active: Boolean(row.active ?? ["active", "published"].includes(status)),
  };
}

export async function getActiveProducts(): Promise<Product[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from("products")
    .select("*")
    .or("active.eq.true,status.eq.active,status.eq.published")
    .order("featured", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Erreur getActiveProducts:", error.message);
    return [];
  }

  return (data ?? []).map((row) => normalizeProduct(row as ProductRow));
}

export async function getAllProducts(): Promise<Product[]> {
  const sb = await createClient();
  const { data, error } = await sb
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []).map((row) => normalizeProduct(row as ProductRow));
}

export async function getProduct(idOrSlug: string): Promise<Product | null> {
  const sb = await createClient();
  const byId = /^[0-9a-f-]{36}$/i.test(idOrSlug);
  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq(byId ? "id" : "slug", idOrSlug)
    .maybeSingle();
  if (error || !data) return null;
  return normalizeProduct(data as ProductRow);
}

export async function getSimilar(product: Product, limit = 4): Promise<Product[]> {
  const sb = await createClient();
  let query = sb
    .from("products")
    .select("*")
    .or("active.eq.true,status.eq.active,status.eq.published")
    .neq("id", product.id)
    .limit(limit);
  if (product.category) query = query.eq("category", product.category);
  const { data, error } = await query;
  if (error) return [];
  return (data ?? []).map((row) => normalizeProduct(row as ProductRow));
}

export async function getReviews(productId: string): Promise<ProductReview[]> {
  const sb = await createClient();
  const { data, error } = await sb.from("product_reviews").select("*").eq("product_id", productId).order("created_at", { ascending: false });
  if (error) return [];
  return (data ?? []) as ProductReview[];
}

export async function getReviewStat(productId: string): Promise<ReviewStat | null> {
  const sb = await createClient();
  const { data, error } = await sb.from("product_review_stats").select("*").eq("product_id", productId).maybeSingle();
  if (error) return null;
  return (data as ReviewStat) ?? null;
}

export async function getFilters(includeInactive = false): Promise<GroupedFilters> {
  const sb = await createClient();
  let query = sb.from("product_filters").select("*").order("filter_group").order("sort");
  if (!includeInactive) query = query.eq("active", true);
  const { data, error } = await query;
  if (error) return {};
  const grouped: GroupedFilters = {};
  (data ?? []).forEach((filter) => {
    const row = filter as ProductFilter;
    (grouped[row.filter_group] ||= []).push(row);
  });
  return grouped;
}
