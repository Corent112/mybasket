import { createClient } from "@/lib/supabase/client";

export type PracticeSession = {
  id: string;
  title: string;
  theme: string | null;
  session_date: string | null;
  start_time: string | null;
  end_time: string | null;
  location: string | null;
  pdf_url: string | null;
  visibility: "public" | "private";
  user_id: string | null;
};

export async function listPublicSessions() {
  const supabase = createClient();

  const { data, error } = await supabase
    .from("practice_sessions")
    .select("*")
    .eq("visibility", "public")
    .order("session_date", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return (data ?? []) as PracticeSession[];
}

export async function listMySessions() {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return [];

  const { data, error } = await supabase
    .from("practice_sessions")
    .select("*")
    .eq("user_id", user.id)
    .eq("visibility", "private")
    .order("session_date", { ascending: false });

  if (error) {
    console.error(error);
    return [];
  }

  return (data ?? []) as PracticeSession[];
}

export async function deleteSession(id: string) {
  const supabase = createClient();

  const { error } = await supabase
    .from("practice_sessions")
    .delete()
    .eq("id", id);

  if (error) throw error;
}