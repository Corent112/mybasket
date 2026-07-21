import React from "react";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { pdf } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import PracticeSessionPdf from "@/components/pdf/PracticeSessionPdf";

const PDF_BUCKET = "session-pdfs";
const PRESENT_STATUSES = new Set(["present", "late"]);

type PlayerRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  position_primary?: string | null;
  position?: string | null;
};

function normalizePosition(position?: string | null): "guard" | "forward" | "center" {
  const value = String(position || "").toLowerCase();
  if (value.includes("pivot") || value.includes("center") || value.includes("poste 5")) return "center";
  if (value.includes("ailier") || value.includes("forward") || value.includes("poste 3") || value.includes("poste 4")) return "forward";
  return "guard";
}

async function localImageDataUri(relativePath: string) {
  try {
    const clean = relativePath.replace(/^\//, "");
    const filePath = path.join(process.cwd(), "public", clean);
    const bytes = await readFile(filePath);
    const ext = path.extname(clean).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return null;
  }
}

async function resolveLogo(value: string | null | undefined, fallback?: string) {
  const candidate = value || fallback || null;
  if (!candidate) return null;
  if (/^https?:\/\//i.test(candidate) || candidate.startsWith("data:")) return candidate;
  return localImageDataUri(candidate);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user }, error: userError } = await supabase.auth.getUser();

  if (userError || !user) return NextResponse.json({ error: "Non connecté" }, { status: 401 });

  const { data: session, error: sessionError } = await supabase
    .from("practice_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (sessionError || !session) return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });

  const [{ data: directRows }, { data: attendanceRows }, { data: exercises }] = await Promise.all([
    supabase.from("practice_session_players").select("*").eq("session_id", id),
    supabase.from("practice_session_attendance").select("*").eq("session_id", id),
    supabase.from("practice_session_exercises").select("*").eq("session_id", id).order("sort_order", { ascending: true }),
  ]);

  let selectedIds: string[] = [];
  const directPresent = (directRows ?? []).filter((row: any) => row.selected !== false && (!row.status || PRESENT_STATUSES.has(String(row.status))));
  if (directPresent.length) {
    selectedIds = directPresent.map((row: any) => String(row.player_id || row.id || "")).filter(Boolean);
  } else {
    const attendancePresent = (attendanceRows ?? []).filter((row: any) => PRESENT_STATUSES.has(String(row.status || "present")));
    selectedIds = attendancePresent.map((row: any) => String(row.player_id || "")).filter(Boolean);
  }

  let rosterRows: PlayerRow[] = [];
  if (selectedIds.length) {
    const { data } = await supabase
      .from("players")
      .select("id, first_name, last_name, position_primary, position")
      .in("id", Array.from(new Set(selectedIds)));
    rosterRows = (data ?? []) as PlayerRow[];
  } else if (session.team_id) {
    const { data } = await supabase
      .from("players")
      .select("id, first_name, last_name, position_primary, position")
      .eq("team_id", session.team_id)
      .order("last_name", { ascending: true });
    rosterRows = (data ?? []) as PlayerRow[];
  }

  const directById = new Map<string, any>(directPresent.map((row: any) => [String(row.player_id || row.id), row]));
  const attendanceById = new Map<string, any>((attendanceRows ?? []).map((row: any) => [String(row.player_id), row]));
  const players = rosterRows.map((player) => {
    const snapshot = directById.get(player.id) || attendanceById.get(player.id);
    return {
      id: player.id,
      player_id: player.id,
      first_name: player.first_name ?? snapshot?.first_name ?? "",
      last_name: player.last_name ?? snapshot?.last_name ?? "",
      position: normalizePosition(player.position_primary ?? player.position),
    };
  });

  const myBasketLogo = await resolveLogo(session.mybasket_logo_url, "/logo-mybasket02.png");
  const clubLogo = await resolveLogo(session.club_logo_url);

  const document = React.createElement(PracticeSessionPdf, {
    session: {
      ...session,
      mybasket_logo_url: myBasketLogo,
      club_logo_url: clubLogo,
    },
    players,
    exercises: exercises ?? [],
  });

  const blob = await pdf(document as any).toBlob();
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante" }, { status: 500 });

  const { data: buckets } = await admin.storage.listBuckets();
  if (!(buckets ?? []).some((bucket) => bucket.id === PDF_BUCKET)) {
    const { error } = await admin.storage.createBucket(PDF_BUCKET, {
      public: true,
      fileSizeLimit: 20 * 1024 * 1024,
      allowedMimeTypes: ["application/pdf"],
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const filePath = `${user.id}/seances/${id}/fiche-seance.pdf`;
  const buffer = Buffer.from(await blob.arrayBuffer());
  const { error: uploadError } = await admin.storage.from(PDF_BUCKET).upload(filePath, buffer, {
    contentType: "application/pdf",
    upsert: true,
  });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: publicUrlData } = admin.storage.from(PDF_BUCKET).getPublicUrl(filePath);
  const pdfUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  await admin.from("practice_sessions").update({
    pdf_url: pdfUrl,
    pdf_generated: true,
    pdf_generated_at: new Date().toISOString(),
  }).eq("id", id).eq("user_id", user.id);

  await admin.from("calendar_events").update({ attachment_url: pdfUrl }).eq("session_id", id).eq("user_id", user.id);
  return NextResponse.json({ pdfUrl });
}
