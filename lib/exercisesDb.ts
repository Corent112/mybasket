import { createClient } from "@/lib/supabase/client";

export type ExerciseRow = {
  id: string;
  user_id: string;
  title: string;
  organisation: string | null;
  deroulement: string | null;
  consignes: string | null;
  variantes: string | null;
  plots: string | null;
  ballons: string | null;
  paniers: string | null;
  joueurs: string | null;
  categorie: string | null;
  type: string | null;
  niveau: string | null;
  temps: string | null;
  themes: string[] | null;
  images: string[] | null;
  videos: string[] | null;
  schema_image: string | null;
  schema_data: any;
  visibility: "private" | "public" | "mybasket";
  created_at: string;
  updated_at: string;
};

export async function loadExercises() {
  const supabase = createClient();

  return supabase
    .from("exercises")
    .select("*")
    .order("created_at", { ascending: false });
}

export async function loadExercise(id: string) {
  const supabase = createClient();

  return supabase
    .from("exercises")
    .select("*")
    .eq("id", id)
    .single();
}

export async function deleteExercise(id: string) {
  const supabase = createClient();

  return supabase
    .from("exercises")
    .delete()
    .eq("id", id);
}