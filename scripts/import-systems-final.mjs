#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const BATCH_SIZE = 25;
const BUCKET = process.env.SYSTEM_SCHEMA_BUCKET || "system-schemas";

async function readEnvFile() {
  const envPath = path.join(ROOT, ".env.local");
  const txt = await fs.readFile(envPath, "utf8").catch(() => "");
  for (const line of txt.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    if (!process.env[key]) process.env[key] = rest.join("=").replace(/^[ '\"]|[ '\"]$/g, "");
  }
}

function required(name) {
  const value = process.env[name];
  if (!value || value.includes("xxxx") || value.includes("...")) throw new Error(`Variable ${name} absente ou invalide dans .env.local`);
  return value;
}
function arr(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}
async function uploadSchema(supabase, localRel) {
  if (!localRel) return "";
  const localPath = path.join(ROOT, localRel);
  const fileName = path.basename(localPath);
  const storagePath = `imports/repertoire-systemes/${fileName}`;
  try {
    const file = await fs.readFile(localPath);
    const contentType = fileName.toLowerCase().endsWith(".jpg") || fileName.toLowerCase().endsWith(".jpeg") ? "image/jpeg" : "image/png";
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, { contentType, upsert: true });
    if (error) {
      console.warn(`Upload impossible ${fileName}: ${error.message}`);
      return `/${localRel}`;
    }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    return data?.publicUrl || `/${localRel}`;
  } catch (error) {
    console.warn(`Fichier schéma introuvable ${localRel}:`, error?.message || error);
    return `/${localRel}`;
  }
}
function buildRow(systeme, urls) {
  const now = new Date().toISOString();
  return {
    id: systeme.id || randomUUID(),
    user_id: systeme.user_id || null,
    title: systeme.title || "Système MyBasket",
    objectif: systeme.objectif || "",
    organisation: systeme.organisation || "",
    deroulement: systeme.deroulement || "",
    consignes: systeme.consignes || "",
    variantes: systeme.variantes || "",
    famille: systeme.famille || "Attaque placée",
    categorie: systeme.categorie || systeme.type || "Système demi-terrain",
    type: systeme.type || "Système demi-terrain",
    temps_forts: arr(systeme.temps_forts),
    tags: arr(systeme.tags),
    images: [],
    videos: [],
    schema_image: urls[0] || "",
    schema_images: urls,
    schema_video: "",
    schema_data: systeme.schema_data || null,
    schema_data_list: Array.isArray(systeme.schema_data_list) ? systeme.schema_data_list : [],
    status: systeme.status || "published",
    review_status: systeme.review_status || "pending",
    created_at: now,
    updated_at: now,
  };
}
async function main() {
  await readEnvFile();
  const url = required("NEXT_PUBLIC_SUPABASE_URL");
  const key = required("SUPABASE_SERVICE_ROLE_KEY");
  console.log("🔗 Supabase:", url);
  console.log("🔐 Service role:", key.slice(0, 32) + "...");
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const systems = JSON.parse(await fs.readFile(path.join(ROOT, "systems_import.json"), "utf8"));
  if (!Array.isArray(systems) || systems.length === 0) throw new Error("systems_import.json vide ou invalide");
  console.log(`📚 Systèmes à importer: ${systems.length}`);
  const { error: testError } = await supabase.from("systems").select("id", { count: "exact", head: true });
  if (testError) throw testError;
  console.log("🧹 Suppression des anciens systèmes...");
  const { error: deleteError } = await supabase.from("systems").delete().neq("id", "00000000-0000-0000-0000-000000000000");
  if (deleteError) throw deleteError;
  await supabase.storage.createBucket(BUCKET, { public: true }).catch(() => {});
  const rows = [];
  for (let i = 0; i < systems.length; i++) {
    const urls = [];
    for (const localRel of systems[i].schema_images || []) {
      const schemaUrl = await uploadSchema(supabase, localRel);
      if (schemaUrl) urls.push(schemaUrl);
    }
    rows.push(buildRow(systems[i], urls));
    if ((i + 1) % 25 === 0 || i + 1 === systems.length) console.log(`🖼️ Schémas préparés: ${i + 1}/${systems.length}`);
  }
  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.from("systems").insert(batch).select("id,title");
    if (error) throw error;
    inserted += data?.length || 0;
    console.log(`✅ Insert: ${inserted}/${rows.length}`, data?.[0]);
  }
  const { count, error: countError } = await supabase.from("systems").select("*", { count: "exact", head: true });
  if (countError) throw countError;
  console.log("\n✅ Import systèmes terminé");
  console.log(`Systèmes réellement en base: ${count ?? 0}`);
}
main().catch((error) => { console.error("\n❌ Import systèmes échoué:"); console.error(error); process.exit(1); });
