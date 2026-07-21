"use client";

import { createClient } from "@/lib/supabase/client";
import type { Product } from "@/types/shop";

type AddProductOptions = {
  quantity?: number;
  size?: string | null;
};

export async function addProductToCart(
  product: Product,
  options: AddProductOptions = {},
) {
  const supabase = createClient();
  const quantity = Math.max(1, Number(options.quantity || 1));
  const size = String(options.size || "").trim();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const next = `/boutique/${product.slug || product.id}`;
    window.location.href = `/connexion?next=${encodeURIComponent(next)}`;
    return { ok: false as const, reason: "auth" as const };
  }

  let query = supabase
    .from("cart_items")
    .select("id, quantity")
    .eq("user_id", user.id)
    .eq("item_type", "product")
    .eq("item_id", product.id);

  query = size ? query.eq("assigned_to", size) : query.is("assigned_to", null);

  const { data: existing, error: existingError } = await query.maybeSingle();

  if (existingError) {
    throw new Error(existingError.message || "Vérification du panier impossible.");
  }

  if (existing) {
    const { error } = await supabase
      .from("cart_items")
      .update({ quantity: Number(existing.quantity || 1) + quantity })
      .eq("id", existing.id);

    if (error) throw new Error(error.message || "Mise à jour du panier impossible.");
  } else {
    const { error } = await supabase.from("cart_items").insert({
      user_id: user.id,
      item_type: "product",
      item_id: product.id,
      title: product.name || product.title || "Produit MyBasket",
      description:
        product.description ||
        product.description_short ||
        "Produit disponible dans la boutique MyBasket.",
      image_url: product.image_url || product.images?.[0] || null,
      price: Number(product.price_cents || 0) / 100,
      quantity,
      duration_minutes: null,
      assigned_to: size || null,
      sort_order: Math.floor(Date.now() / 1000),
      metadata: {
        source: "shop",
        product_id: product.id,
        product_slug: product.slug,
        size: size || null,
        category: product.category,
      },
    });

    if (error) throw new Error(error.message || "Ajout au panier impossible.");
  }

  window.dispatchEvent(new Event("cart-updated"));
  return { ok: true as const };
}
