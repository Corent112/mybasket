"use server";

import { revalidatePath } from "next/cache";
import type { ProductDraft } from "@/types/shop";
import { requireAdmin } from "@/lib/admin/guard";
import { slugify } from "@/lib/shop/format";

type ProductRow = {
  id: string;
  name: string | null;
  slug: string | null;
  description: string | null;
  category: string | null;
  image_url: string | null;
  price_cents: number | null;
  compare_at_price_cents: number | null;
  stock_quantity: number | null;
  status: string | null;
  is_featured: boolean | null;
  metadata: Record<string, unknown> | null;
  created_at: string | null;
  updated_at: string | null;
};

function now() {
  return new Date().toISOString();
}

function cleanProductDraft(draft: ProductDraft) {
  const name = String(draft.name || "").trim();
  const slug = String(draft.slug || "").trim() || slugify(name);

  return {
    name,
    slug,
    description: draft.description || null,
    category: draft.category || null,
    image_url: draft.image_url || null,
    price_cents: Number(draft.price_cents || 0),
    compare_at_price_cents:
      draft.compare_at_price_cents === null ||
      draft.compare_at_price_cents === undefined
        ? null
        : Number(draft.compare_at_price_cents),
    stock_quantity:
      draft.stock_quantity === null || draft.stock_quantity === undefined
        ? null
        : Number(draft.stock_quantity),
    status: draft.status || "draft",
    is_featured: Boolean(draft.is_featured),
    metadata: draft.metadata || {},
    updated_at: now(),
  };
}

function revalidateShop() {
  revalidatePath("/admin");
  revalidatePath("/admin/boutique");
  revalidatePath("/admin/boutique/filtres");
  revalidatePath("/boutique");
}

export async function upsertProduct(id: string | null, draft: ProductDraft) {
  const { supabase } = await requireAdmin();
  const payload = cleanProductDraft(draft);

  if (!payload.name) {
    throw new Error("Le nom du produit est obligatoire.");
  }

  const query = id
    ? supabase.from("products").update(payload).eq("id", id)
    : supabase.from("products").insert({ ...payload, created_at: now() });

  const { error } = await query;

  if (error) {
    console.error("Erreur upsertProduct:", error);
    throw error;
  }

  revalidateShop();
}

export async function deleteProduct(id: string) {
  const { supabase } = await requireAdmin();
  if (!id) return;

  const { error } = await supabase.from("products").delete().eq("id", id);

  if (error) {
    console.error("Erreur deleteProduct:", error);
    throw error;
  }

  revalidateShop();
}

export async function toggleProductActive(id: string, active: boolean) {
  const { supabase } = await requireAdmin();
  if (!id) return;

  const { error } = await supabase
    .from("products")
    .update({ status: active ? "active" : "draft", updated_at: now() })
    .eq("id", id);

  if (error) {
    console.error("Erreur toggleProductActive:", error);
    throw error;
  }

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

  if (error) {
    console.error("Erreur fetch duplicateProduct:", error);
    throw error;
  }

  const product = data as ProductRow | null;
  if (!product) return;

  const baseName = product.name || "Produit";
  const baseSlug = product.slug || slugify(baseName);

  const copy = {
    name: `${baseName} copie`,
    slug: `${baseSlug}-copie-${Date.now()}`,
    description: product.description,
    category: product.category,
    image_url: product.image_url,
    price_cents: product.price_cents ?? 0,
    compare_at_price_cents: product.compare_at_price_cents,
    stock_quantity: product.stock_quantity,
    status: "draft",
    is_featured: false,
    metadata: product.metadata || {},
    created_at: now(),
    updated_at: now(),
  };

  const { error: insertError } = await supabase.from("products").insert(copy);

  if (insertError) {
    console.error("Erreur duplicateProduct:", insertError);
    throw insertError;
  }

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

  const payload =
    input instanceof FormData
      ? makeFilterPayload(
          String(input.get("filter_group") || ""),
          String(input.get("label") || ""),
          String(input.get("value") || ""),
          Number(input.get("sort") || 0)
        )
      : makeFilterPayload(input, labelArg || "");

  if (!payload.filter_group || !payload.label) return;

  const { error } = await supabase.from("product_filters").insert({
    ...payload,
    active: true,
    created_at: now(),
  });

  if (error) {
    console.error("Erreur addFilter:", error);
    throw error;
  }

  revalidateShop();
}

export async function updateFilter(formData: FormData): Promise<void>;
export async function updateFilter(id: string, label: string): Promise<void>;
export async function updateFilter(input: FormData | string, labelArg?: string) {
  const { supabase } = await requireAdmin();

  const id = input instanceof FormData ? String(input.get("id") || "") : input;
  const payload =
    input instanceof FormData
      ? makeFilterPayload(
          String(input.get("filter_group") || ""),
          String(input.get("label") || ""),
          String(input.get("value") || ""),
          Number(input.get("sort") || 0)
        )
      : { label: String(labelArg || "").trim(), value: slugify(labelArg || "") };

  if (!id || !payload.label) return;

  const { error } = await supabase
    .from("product_filters")
    .update(payload)
    .eq("id", id);

  if (error) {
    console.error("Erreur updateFilter:", error);
    throw error;
  }

  revalidateShop();
}

export async function toggleFilter(id: string, active: boolean) {
  const { supabase } = await requireAdmin();
  if (!id) return;

  const { error } = await supabase
    .from("product_filters")
    .update({ active })
    .eq("id", id);

  if (error) {
    console.error("Erreur toggleFilter:", error);
    throw error;
  }

  revalidateShop();
}

export async function deleteFilter(id: string) {
  const { supabase } = await requireAdmin();
  if (!id) return;

  const { error } = await supabase.from("product_filters").delete().eq("id", id);

  if (error) {
    console.error("Erreur deleteFilter:", error);
    throw error;
  }

  revalidateShop();
}
