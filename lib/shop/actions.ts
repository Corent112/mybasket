"use server";

import { revalidatePath } from "next/cache";
import type { ProductDraft } from "@/types/shop";
import { requireAdmin } from "@/lib/admin/guard";
import { slugify } from "@/lib/shop/format";

type ProductRow = Record<string, unknown> & {
  id: string;
  name?: string | null;
  title?: string | null;
  slug?: string | null;
  description?: string | null;
  description_short?: string | null;
  description_long?: string | null;
  category?: string | null;
  image_url?: string | null;
  images?: string[] | null;
  price_cents?: number | null;
  price?: number | null;
  compare_at_price_cents?: number | null;
  promo_price?: number | null;
  stock_quantity?: number | null;
  stock?: number | null;
  status?: string | null;
  active?: boolean | null;
  is_featured?: boolean | null;
  featured?: boolean | null;
  metadata?: Record<string, unknown> | null;
};

function now() {
  return new Date().toISOString();
}

function cleanText(value: unknown) {
  const result = String(value ?? "").trim();
  return result || null;
}

function buildCompatiblePayload(draft: ProductDraft) {
  const name = String(draft.name || draft.title || "").trim();
  const slug = String(draft.slug || "").trim() || slugify(name);
  const description = cleanText(
    draft.description || draft.description_long || draft.description_short,
  );
  const imageUrl = cleanText(draft.image_url || draft.images?.[0]);
  const priceCents = Math.max(0, Number(draft.price_cents || 0));
  const compareAtPriceCents =
    draft.compare_at_price_cents == null
      ? null
      : Math.max(0, Number(draft.compare_at_price_cents));
  const stockQuantity =
    draft.stock_quantity == null
      ? 0
      : Math.max(0, Number(draft.stock_quantity));
  const status = String(draft.status || "draft");
  const published = status === "active" || status === "published";
  const featured = Boolean(draft.is_featured ?? draft.featured);

  return {
    // Colonnes obligatoires de l'ancien modèle.
    title: name,
    slug,
    price: priceCents / 100,
    images: imageUrl ? [imageUrl] : [],
    tags: Array.isArray(draft.tags) ? draft.tags : [],
    featured,
    premium: Boolean(draft.premium),
    active: published,

    // Colonnes de l'ancien modèle optionnelles.
    description_short: description || "",
    description_long: description || "",
    promo_price:
      compareAtPriceCents != null ? compareAtPriceCents / 100 : null,
    stock: stockQuantity,

    // Colonnes du modèle moderne.
    name,
    description,
    category: cleanText(draft.category),
    image_url: imageUrl,
    price_cents: priceCents,
    compare_at_price_cents: compareAtPriceCents,
    stock_quantity: stockQuantity,
    status: published ? "active" : status,
    is_featured: featured,
    metadata: draft.metadata || {},
    updated_at: now(),
  };
}

function revalidateShop(productSlug?: string | null) {
  revalidatePath("/admin");
  revalidatePath("/admin/boutique");
  revalidatePath("/admin/boutique/filtres");
  revalidatePath("/boutique", "page");
  revalidatePath("/boutique", "layout");

  if (productSlug) {
    revalidatePath(`/boutique/${productSlug}`, "page");
  }
}

export async function upsertProduct(id: string | null, draft: ProductDraft) {
  const { supabase } = await requireAdmin();
  const payload = buildCompatiblePayload(draft);

  if (!payload.name || !payload.title) {
    throw new Error("Le nom du produit est obligatoire.");
  }

  const query = id
    ? supabase.from("products").update(payload).eq("id", id)
    : supabase.from("products").insert({ ...payload, created_at: now() });

  const { error } = await query;

  if (error) {
    console.error("Erreur upsertProduct:", error);
    throw new Error(error.message || "Enregistrement du produit impossible.");
  }

  revalidateShop(payload.slug);
}

export async function deleteProduct(id: string) {
  const { supabase } = await requireAdmin();
  if (!id) return;

  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateShop();
}

export async function toggleProductActive(id: string, active: boolean) {
  const { supabase } = await requireAdmin();
  if (!id) return;

  const { error } = await supabase
    .from("products")
    .update({
      status: active ? "active" : "draft",
      active,
      updated_at: now(),
    })
    .eq("id", id);

  if (error) throw new Error(error.message);
  revalidateShop();
}

export async function duplicateProduct(id: string) {
  const { supabase } = await requireAdmin();
  if (!id) return;

  const { data, error } = await supabase
    .from("products")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(error.message);
  const product = data as ProductRow | null;
  if (!product) return;

  const name = String(product.name || product.title || "Produit");
  const imageUrl = String(product.image_url || product.images?.[0] || "") || null;
  const priceCents = Number(
    product.price_cents ?? Math.round(Number(product.price || 0) * 100),
  );

  const copyDraft = {
    name: `${name} copie`,
    title: `${name} copie`,
    slug: `${String(product.slug || slugify(name))}-copie-${Date.now()}`,
    description:
      product.description ||
      product.description_long ||
      product.description_short ||
      null,
    category: product.category || null,
    image_url: imageUrl,
    images: imageUrl ? [imageUrl] : [],
    price_cents: priceCents,
    compare_at_price_cents:
      product.compare_at_price_cents ??
      (product.promo_price != null
        ? Math.round(Number(product.promo_price) * 100)
        : null),
    stock_quantity: Number(product.stock_quantity ?? product.stock ?? 0),
    status: "draft",
    active: false,
    is_featured: false,
    featured: false,
    metadata: product.metadata || {},
    tags: [],
    premium: false,
  } as ProductDraft;

  const payload = buildCompatiblePayload(copyDraft);
  const { error: insertError } = await supabase.from("products").insert({
    ...payload,
    created_at: now(),
  });

  if (insertError) throw new Error(insertError.message);
  revalidateShop();
}

function makeFilterPayload(filterGroup: string, label: string, value?: string, sort = 0) {
  const finalLabel = String(label || "").trim();
  return {
    filter_group: String(filterGroup || "").trim(),
    label: finalLabel,
    value: String(value || "").trim() || slugify(finalLabel),
    sort: Number(sort || 0),
  };
}

export async function addFilter(formData: FormData): Promise<void>;
export async function addFilter(filterGroup: string, label: string): Promise<void>;
export async function addFilter(input: FormData | string, labelArg?: string) {
  const { supabase } = await requireAdmin();
  const payload = input instanceof FormData
    ? makeFilterPayload(String(input.get("filter_group") || ""), String(input.get("label") || ""), String(input.get("value") || ""), Number(input.get("sort") || 0))
    : makeFilterPayload(input, labelArg || "");
  if (!payload.filter_group || !payload.label) return;
  const { error } = await supabase.from("product_filters").insert({ ...payload, active: true, created_at: now() });
  if (error) throw new Error(error.message);
  revalidateShop();
}

export async function updateFilter(formData: FormData): Promise<void>;
export async function updateFilter(id: string, label: string): Promise<void>;
export async function updateFilter(input: FormData | string, labelArg?: string) {
  const { supabase } = await requireAdmin();
  const id = input instanceof FormData ? String(input.get("id") || "") : input;
  const payload = input instanceof FormData
    ? makeFilterPayload(String(input.get("filter_group") || ""), String(input.get("label") || ""), String(input.get("value") || ""), Number(input.get("sort") || 0))
    : { label: String(labelArg || "").trim(), value: slugify(labelArg || "") };
  if (!id || !payload.label) return;
  const { error } = await supabase.from("product_filters").update(payload).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateShop();
}

export async function toggleFilter(id: string, active: boolean) {
  const { supabase } = await requireAdmin();
  if (!id) return;
  const { error } = await supabase.from("product_filters").update({ active }).eq("id", id);
  if (error) throw new Error(error.message);
  revalidateShop();
}

export async function deleteFilter(id: string) {
  const { supabase } = await requireAdmin();
  if (!id) return;
  const { error } = await supabase.from("product_filters").delete().eq("id", id);
  if (error) throw new Error(error.message);
  revalidateShop();
}
