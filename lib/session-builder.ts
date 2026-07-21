import { createClient } from "@/lib/supabase/client";

export type SessionBuilderItem = {
  id: string;
  item_type: "exercise" | "system" | "session" | "product";
  item_id: string | null;
  title: string;
  description: string | null;
  image_url: string | null;
  duration_minutes: number | null;
  assigned_to: string | null;
  sort_order: number;
  metadata?: Record<string, unknown> | null;
};

export async function loadSessionBuilderItems(): Promise<SessionBuilderItem[]> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("cart_items")
    .select("*")
    .eq("user_id", user.id)
    .eq("item_type", "exercise")
    .order("sort_order", { ascending: true });

  if (error) {
    console.error(error);
    return [];
  }

  return (data ?? []) as SessionBuilderItem[];
}

export async function clearSessionBuilderItems() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return;

  await supabase
    .from("cart_items")
    .delete()
    .eq("user_id", user.id)
    .eq("item_type", "exercise");
}