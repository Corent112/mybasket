"use client";

import { createClient } from "@/lib/supabase/client";

export async function saveUserAppState(key: string, value: unknown) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("user_app_state").upsert({
    user_id: user.id, state_key: key, state_value: value, updated_at: new Date().toISOString(),
  }, { onConflict: "user_id,state_key" });
}

export async function loadUserAppState<T>(key: string): Promise<T | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("user_app_state").select("state_value").eq("user_id", user.id).eq("state_key", key).maybeSingle();
  return (data?.state_value as T | undefined) ?? null;
}

export async function deleteUserAppState(key: string) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase.from("user_app_state").delete().eq("user_id", user.id).eq("state_key", key);
}
