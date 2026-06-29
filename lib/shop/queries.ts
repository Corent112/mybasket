import { createClient } from "@/lib/supabase/server";
import type {
  GroupedFilters,
  Product,
  ProductFilter,
  ProductReview,
  ReviewStat,
} from "@/types/shop";

export async function getActiveProducts(): Promise<Product[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq("status", "active")
    .order("is_featured", { ascending: false })
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Erreur getActiveProducts:", error.message);
    return [];
  }

  return (data ?? []) as Product[];
}

export async function getAllProducts(): Promise<Product[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from("products")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Erreur getAllProducts:", error.message);
    return [];
  }

  return (data ?? []) as Product[];
}

export async function getProduct(idOrSlug: string): Promise<Product | null> {
  const sb = await createClient();

  const byId = /^[0-9a-f-]{36}$/i.test(idOrSlug);

  const { data, error } = await sb
    .from("products")
    .select("*")
    .eq(byId ? "id" : "slug", idOrSlug)
    .maybeSingle();

  if (error) {
    console.warn("Erreur getProduct:", error.message);
    return null;
  }

  return (data as Product) ?? null;
}

export async function getSimilar(
  product: Product,
  limit = 4
): Promise<Product[]> {
  const sb = await createClient();

  let query = sb
    .from("products")
    .select("*")
    .eq("status", "active")
    .neq("id", product.id)
    .limit(limit);

  if (product.category) {
    query = query.eq("category", product.category);
  }

  const { data, error } = await query;

  if (error) {
    console.warn("Erreur getSimilar:", error.message);
    return [];
  }

  return (data ?? []) as Product[];
}

export async function getReviews(productId: string): Promise<ProductReview[]> {
  const sb = await createClient();

  const { data, error } = await sb
    .from("product_reviews")
    .select("*")
    .eq("product_id", productId)
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("Erreur getReviews:", error.message);
    return [];
  }

  return (data ?? []) as ProductReview[];
}

export async function getReviewStat(
  productId: string
): Promise<ReviewStat | null> {
  const sb = await createClient();

  const { data, error } = await sb
    .from("product_review_stats")
    .select("*")
    .eq("product_id", productId)
    .maybeSingle();

  if (error) {
    console.warn("Erreur getReviewStat:", error.message);
    return null;
  }

  return (data as ReviewStat) ?? null;
}

export async function getFilters(
  includeInactive = false
): Promise<GroupedFilters> {
  const sb = await createClient();

  let query = sb
    .from("product_filters")
    .select("*")
    .order("filter_group")
    .order("sort");

  if (!includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;

  if (error) {
    console.warn("Erreur getFilters:", error.message);
    return {};
  }

  const grouped: GroupedFilters = {};

  (data ?? []).forEach((filter) => {
    const row = filter as ProductFilter;
    (grouped[row.filter_group] ||= []).push(row);
  });

  return grouped;
}