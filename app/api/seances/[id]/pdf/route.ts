import React from "react";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import { pdf } from "@react-pdf/renderer";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import PracticeSessionPdf from "@/components/pdf/PracticeSessionPdf";

const PDF_BUCKET = "session-pdfs";
const EXCLUDED_STATUSES = new Set(["absent", "injured", "excused"]);

type GenericRow = Record<string, any>;

type PdfExercise = {
  title: string;
  who: string | null;
  duration_minutes: number | null;
  situation_image_url?: string | null;
  schema_urls?: string[] | null;
  explanation: string | null;
  instructions: string | null;
  variants?: string | null;
};

function normalizePosition(position?: string | null): "guard" | "forward" | "center" {
  const value = String(position || "").toLowerCase();
  if (value.includes("pivot") || value.includes("center") || value.includes("poste 5") || value === "c") return "center";
  if (
    value.includes("ailier") ||
    value.includes("forward") ||
    value.includes("poste 3") ||
    value.includes("poste 4") ||
    value === "sf" ||
    value === "pf"
  ) return "forward";
  return "guard";
}

function firstString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

async function imageDataUri(source?: string | null) {
  if (!source) return null;

  try {
    if (/^https?:\/\//i.test(source)) {
      const response = await fetch(source, { cache: "no-store" });
      if (!response.ok) return source;
      const bytes = Buffer.from(await response.arrayBuffer());
      const mime = response.headers.get("content-type") || "image/png";
      return `data:${mime};base64,${bytes.toString("base64")}`;
    }

    const clean = source.replace(/^\//, "");
    const filePath = path.join(process.cwd(), "public", clean);
    const bytes = await readFile(filePath);
    const ext = path.extname(clean).toLowerCase();
    const mime = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
    return `data:${mime};base64,${bytes.toString("base64")}`;
  } catch {
    return /^https?:\/\//i.test(source) ? source : null;
  }
}

function normalizeExerciseImages(exercise: GenericRow) {
  const candidates = [
    exercise.situation_image_url,
    exercise.image_url,
    exercise.schema_url,
    exercise.diagram_url,
  ];

  const arrays = [
    exercise.situation_image_urls,
    exercise.images,
    exercise.schema_urls,
    exercise.diagram_urls,
  ];

  for (const value of arrays) {
    if (Array.isArray(value)) candidates.push(...value);
  }

  return Array.from(
    new Set(candidates.filter((value): value is string => typeof value === "string" && Boolean(value.trim())))
  );
}

async function loadPresentPlayers(
  supabase: Awaited<ReturnType<typeof createClient>>,
  session: GenericRow,
  sessionId: string,
) {
  const { data: directRows } = await supabase
    .from("practice_session_players")
    .select("*")
    .eq("session_id", sessionId);

  let sourceRows = (directRows ?? []).filter((row: GenericRow) => {
    const status = String(row.status || "present").toLowerCase();
    return row.selected !== false && !EXCLUDED_STATUSES.has(status);
  });

  if (sourceRows.length === 0) {
    const { data: attendanceRows } = await supabase
      .from("practice_session_attendance")
      .select("*")
      .eq("session_id", sessionId);

    sourceRows = (attendanceRows ?? []).filter((row: GenericRow) => {
      const status = String(row.status || "present").toLowerCase();
      return row.selected !== false && !EXCLUDED_STATUSES.has(status);
    });
  }

  if (sourceRows.length === 0 && session.team_id) {
    const { data: rosterRows } = await supabase
      .from("players")
      .select("*")
      .eq("team_id", session.team_id)
      .order("last_name", { ascending: true });
    sourceRows = rosterRows ?? [];
  }

  const playerIds = Array.from(
    new Set(
      sourceRows
        .map((row: GenericRow) => String(row.player_id || row.id || ""))
        .filter(Boolean),
    ),
  );

  const { data: rosterDetails } = playerIds.length
    ? await supabase.from("players").select("*").in("id", playerIds)
    : { data: [] as GenericRow[] };

  const detailById = new Map((rosterDetails ?? []).map((row: GenericRow) => [String(row.id), row]));

  return sourceRows
    .map((row: GenericRow) => {
      const id = String(row.player_id || row.id || "");
      const detail = detailById.get(id) || {};
      return {
        id,
        player_id: id,
        first_name: firstString(detail.first_name, row.first_name) || "",
        last_name: firstString(detail.last_name, row.last_name) || "",
        position: normalizePosition(
          firstString(row.position, row.position_primary, detail.position, detail.position_primary),
        ),
      };
    })
    .filter((player, index, list) => player.id && list.findIndex((item) => item.id === player.id) === index)
    .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "fr"));
}

async function resolveClubLogo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  session: GenericRow,
) {
  let logo = firstString(session.club_logo_url, session.team_logo_url);
  if (logo || !session.team_id) return logo;

  const { data: team } = await supabase.from("teams").select("*").eq("id", session.team_id).maybeSingle();
  logo = firstString(team?.club_logo_url, team?.logo_url, team?.image_url);
  if (logo) return logo;

  const clubId = firstString(team?.club_id, session.club_id);
  if (!clubId) return null;

  const { data: club } = await supabase.from("clubs").select("*").eq("id", clubId).maybeSingle();
  return firstString(club?.logo_url, club?.club_logo_url, club?.image_url);
}

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const { data: session, error: sessionError } = await supabase
    .from("practice_sessions")
    .select("*")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (sessionError || !session) {
    return NextResponse.json({ error: "Séance introuvable" }, { status: 404 });
  }

  const [{ data: exercises }] = await Promise.all([
    supabase
      .from("practice_session_exercises")
      .select("*")
      .eq("session_id", id)
      .order("sort_order", { ascending: true }),
  ]);

  const players = await loadPresentPlayers(supabase, session, id);
  const clubLogoSource = await resolveClubLogo(supabase, session);
  const myBasketLogo = await imageDataUri("/logo-mybasket02.png");
  const clubLogo = await imageDataUri(clubLogoSource);

  const normalizedExercises: PdfExercise[] = await Promise.all(
    ((exercises ?? []) as GenericRow[]).map(
      async (exercise): Promise<PdfExercise> => ({
        title: String(exercise.title || "Exercice"),
        who: exercise.who ? String(exercise.who) : null,
        duration_minutes:
          exercise.duration_minutes == null
            ? null
            : Number(exercise.duration_minutes),
        situation_image_url: firstString(
          exercise.situation_image_url,
          exercise.image_url,
          exercise.schema_url,
          exercise.diagram_url,
        ),
        schema_urls: await Promise.all(
          normalizeExerciseImages(exercise).map(
            async (url) => (await imageDataUri(url)) || url,
          ),
        ),
        explanation: exercise.explanation
          ? String(exercise.explanation)
          : null,
        instructions: exercise.instructions
          ? String(exercise.instructions)
          : null,
        variants: exercise.variants ? String(exercise.variants) : null,
      }),
    ),
  );

  const document = React.createElement(PracticeSessionPdf, {
    session: {
      ...session,
      mybasket_logo_url: myBasketLogo,
      club_logo_url: clubLogo,
    },
    players,
    exercises: normalizedExercises,
  });

  const blob = await pdf(document as any).toBlob();
  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ error: "SUPABASE_SERVICE_ROLE_KEY manquante" }, { status: 500 });
  }

  const { data: buckets } = await admin.storage.listBuckets();
  if (!(buckets ?? []).some((bucket) => bucket.id === PDF_BUCKET)) {
    const { error: createBucketError } = await admin.storage.createBucket(PDF_BUCKET, {
      public: true,
      fileSizeLimit: 20 * 1024 * 1024,
      allowedMimeTypes: ["application/pdf"],
    });
    if (createBucketError) {
      return NextResponse.json({ error: createBucketError.message }, { status: 500 });
    }
  }

  const filePath = `${user.id}/seances/${id}/fiche-seance.pdf`;
  const buffer = Buffer.from(await blob.arrayBuffer());
  const { error: uploadError } = await admin.storage
    .from(PDF_BUCKET)
    .upload(filePath, buffer, { contentType: "application/pdf", upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { data: publicUrlData } = admin.storage.from(PDF_BUCKET).getPublicUrl(filePath);
  const pdfUrl = `${publicUrlData.publicUrl}?v=${Date.now()}`;

  await admin
    .from("practice_sessions")
    .update({
      pdf_url: pdfUrl,
      pdf_generated: true,
      pdf_generated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .eq("user_id", user.id);

  await admin
    .from("calendar_events")
    .update({ attachment_url: pdfUrl })
    .eq("session_id", id)
    .eq("user_id", user.id);

  return NextResponse.json({ pdfUrl });
}
