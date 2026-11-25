import type { SupabaseClient } from "@supabase/supabase-js";
import { SESSION_CART_TYPES, reorderedSessionCart } from "./session-cart-summary";

export async function moveCartSessionRow(
  supabase: SupabaseClient, userId: string, id: string, direction: "up" | "down"
) {
  const { data, error } = await supabase.from("cart_items")
    .select("id,sort_order").eq("user_id", userId)
    .in("item_type", [...SESSION_CART_TYPES])
    .order("sort_order", { ascending: true }).order("created_at", { ascending: true }).order("id");
  if (error) throw error;
  const ordered = reorderedSessionCart(data ?? [], id, direction);
  if (!ordered) return null;
  // The same row IDs remain in place; only their rank changes.
  const original = new Map((data ?? []).map(row => [row.id, row.sort_order]));
  const changed = ordered.filter(row => original.get(row.id) !== row.sort_order);
  for (const row of changed) {
    const { error: updateError } = await supabase.from("cart_items")
      .update({ sort_order: row.sort_order }).eq("user_id", userId).eq("id", row.id);
    if (updateError) throw updateError;
  }
  return ordered;
}
