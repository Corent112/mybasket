#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const txt = await fs.readFile(path.join(ROOT, ".env.local"), "utf8").catch(() => "");
for (const line of txt.split(/\r?\n/)) {
  const t = line.trim();
  if (!t || t.startsWith("#") || !t.includes("=")) continue;
  const [k, ...v] = t.split("=");
  process.env[k] = v.join("=").replace(/^[ '\"]|[ '\"]$/g, "");
}
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false }});
const { count, error } = await supabase.from("systems").select("*", { count: "exact", head: true });
console.log({ count, error });
const { data, error: e2 } = await supabase.from("systems").select("id,title,famille,categorie,type,status,review_status,schema_image").limit(10);
console.table(data || []);
if (e2) console.error(e2);
