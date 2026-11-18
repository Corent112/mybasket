import { createClient as createSupabaseClient } from "@supabase/supabase-js";

export function createAdminClient(options?: { noStore?: boolean }) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) return null;

  return createSupabaseClient(url, serviceRoleKey, {
    ...(options?.noStore ? { global: { fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, { ...init, cache: "no-store" }) } } : {}),
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}
