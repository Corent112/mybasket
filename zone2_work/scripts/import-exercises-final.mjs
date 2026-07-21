#!/usr/bin/env node
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, "..");
const BATCH_SIZE = 25;
const BUCKET = process.env.EXERCISE_SCHEMA_BUCKET || "exercise-schemas";

async function loadEnv() {
  const envPath = path.join(ROOT, ".env.local");
  const txt = await fs.readFile(envPath, "utf8");
  for (const line of txt.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const [key, ...rest] = trimmed.split("=");
    process.env[key] = rest.join("=").trim().replace(/^['\"]|['\"]$/g, "");
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value || value.includes("xxxxx") || value.includes("...")) {
    throw new Error(`Variable ${name} manquante ou invalide dans .env.local`);
  }
  return value;
}

function arr(value) {
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  if (typeof value === "string") {
    return value
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return [];
}

function txt(value) {
  if (Array.isArray(value)) return value.filter(Boolean).join("\n");
  if (value == null) return "";
  return String(value);
}

async function ensureBucket(supabase) {
  const { error } = await supabase.storage.createBucket(BUCKET, { public: true });
  if (error && !String(error.message || "").toLowerCase().includes("already exists")) {
    console.warn("⚠️ Bucket non créé automatiquement:", error.message);
  }
}

async function uploadSchema(supabase, localRel) {
  const normalizedRel = String(localRel).replace(/^\/+/, "");
  const localPath = path.join(ROOT, normalizedRel);
  const fileName = path.basename(localPath);
  const storagePath = `imports/cahier-t1/${fileName}`;

  try {
    const file = await fs.readFile(localPath);
    const { error } = await supabase.storage.from(BUCKET).upload(storagePath, file, {
      contentType: "image/png",
      upsert: true,
    });

    if (error) {
      console.warn(`⚠️ Upload schéma échoué ${fileName}: ${error.message}`);
      return `/${normalizedRel}`;
    }

    const { data } = supabase.storage.from(BUCKET).getPublicUrl(storagePath);
    return data?.publicUrl || `/${normalizedRel}`;
  } catch (error) {
    console.warn(`⚠️ Schéma local absent ${normalizedRel}:`, error instanceof Error ? error.message : error);
    return `/${normalizedRel}`;
  }
}

async function buildRow(supabase, exo) {
  const themes = arr(exo.themes ?? exo.theme);
  const schemaLocal = arr(exo.schema_images);
  const schemaUrls = [];

  for (const rel of schemaLocal) {
    schemaUrls.push(await uploadSchema(supabase, rel));
  }

  const equipment = arr(exo.equipment ?? exo.materiel);
  const now = new Date().toISOString();

  return {
    user_id: null,
    owner_id: null,

    title: txt(exo.title) || "Exercice MyBasket",
    category: txt(exo.category ?? exo.categorie),
    categorie: txt(exo.categorie ?? exo.category),
    type: txt(exo.type) || "Exercice",
    niveau: txt(exo.niveau ?? exo.level) || "Tous niveaux",
    level: txt(exo.level ?? exo.niveau) || "Tous niveaux",
    temps: txt(exo.temps ?? exo.duration) || "8-12 min",
    duration: txt(exo.duration ?? exo.temps) || "8-12 min",

    description: txt(exo.description ?? exo.objectifs ?? exo.objectif),
    organisation: txt(exo.organisation ?? exo.description),
    deroulement: txt(exo.deroulement),
    consignes: txt(exo.consignes),
    variantes: txt(exo.variantes),
    objectif: txt(exo.objectif ?? exo.objectifs ?? exo.description),
    objectifs: txt(exo.objectifs ?? exo.objectif ?? exo.description),

    plots: exo.plots == null ? null : txt(exo.plots),
    ballons: exo.ballons == null ? null : txt(exo.ballons),
    paniers: exo.paniers == null ? null : txt(exo.paniers),
    joueurs: exo.joueurs == null ? null : txt(exo.joueurs),

    themes,
    theme: txt(exo.theme ?? themes[0]),
    tags: arr(exo.tags),
    equipment,
    materiel: arr(exo.materiel ?? exo.equipment),

    images: [],
    videos: [],
    thumbnail_url: schemaUrls[0] ?? null,
    schema_image: schemaUrls[0] ?? null,
    schema_images: schemaUrls, // jsonb in your DB: JS array is stored as JSONB
    schema_data: null,
    schema_data_list: [],
    schema_video: null,
    play_json: null,

    visibility: "public",
    review_status: "approved",
    status: "approved",
    is_public: true,
    original_exercise_id: null,
    submitted_at: null,
    reviewed_at: null,
    reviewed_by: null,
    rejection_reason: null,

    author_name: txt(exo.author_name) || "MyBasket",
    source: txt(exo.source) || "cahier_exercices_mybasket_t1_pdf",
    source_page: Number.isFinite(Number(exo.source_page)) ? Number(exo.source_page) : null,

    created_at: now,
    updated_at: now,
  };
}

async function main() {
  await loadEnv();

  const url = requireEnv("NEXT_PUBLIC_SUPABASE_URL");
  const key = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  console.log("🔗 Supabase:", url);
  console.log("🔐 Service role:", key.slice(0, 28) + "...");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { error: pingError } = await supabase
    .from("exercises")
    .select("id", { count: "exact", head: true });
  if (pingError) throw pingError;

  await ensureBucket(supabase);

  const raw = await fs.readFile(path.join(ROOT, "exercises_import.json"), "utf8");
  const exercises = JSON.parse(raw);
  if (!Array.isArray(exercises) || exercises.length === 0) {
    throw new Error("exercises_import.json est vide ou invalide");
  }

  console.log(`📚 Exercices à importer: ${exercises.length}`);

  console.log("🧹 Suppression des anciens exercices et systèmes...");
  const { error: deleteExercisesError } = await supabase.from("exercises").delete().not("id", "is", null);
  if (deleteExercisesError) throw deleteExercisesError;
  await supabase.from("systems").delete().not("id", "is", null).then(({ error }) => {
    if (error) console.warn("⚠️ Suppression systems ignorée:", error.message);
  });

  const rows = [];
  for (let i = 0; i < exercises.length; i++) {
    rows.push(await buildRow(supabase, exercises[i]));
    if ((i + 1) % 25 === 0 || i + 1 === exercises.length) {
      console.log(`🖼️ Schémas préparés: ${i + 1}/${exercises.length}`);
    }
  }

  let inserted = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const { data, error } = await supabase.from("exercises").insert(batch).select("id,title");
    if (error) {
      console.error("❌ Erreur batch", i, error);
      throw error;
    }
    inserted += data?.length ?? 0;
    console.log(`✅ Insert: ${inserted}/${rows.length}`, data?.[0] || "");
  }

  const { count, error: countError } = await supabase
    .from("exercises")
    .select("*", { count: "exact", head: true });
  if (countError) throw countError;

  console.log("\n✅ Import terminé");
  console.log("Exercices réellement en base:", count);

  if (count !== exercises.length) {
    throw new Error(`Import incomplet: ${count} en base / ${exercises.length} attendus`);
  }

  console.log("🎉 OK: les exercices sont dans Supabase et visibles en public/approved.");
}

main().catch((error) => {
  console.error("\n❌ Import échoué");
  console.error(error);
  process.exit(1);
});
