#!/usr/bin/env node
import fs from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const env = await fs.readFile(".env.local", "utf8");
for (const line of env.split(/\r?\n/)) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
  const [key, ...rest] = trimmed.split("=");
  process.env[key] = rest.join("=").trim().replace(/^['\"]|['\"]$/g, "");
}

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } }
);

const { count, error } = await supabase
  .from("exercises")
  .select("*", { count: "exact", head: true });

console.log({ count, error });

const { data, error: listError } = await supabase
  .from("exercises")
  .select("id,title,visibility,review_status,status,schema_image")
  .order("created_at", { ascending: true })
  .limit(10);

console.table(data || []);
if (listError) console.error(listError);
