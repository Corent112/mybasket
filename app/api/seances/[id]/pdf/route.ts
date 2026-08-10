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

function parseSessionNotes(session: GenericRow): GenericRow {
  if (!session?.notes) return {};
  if (typeof session.notes === "object") return session.notes as GenericRow;

  try {
    const parsed = JSON.parse(String(session.notes));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function savedPlayerPositionMap(session: GenericRow): Record<string, string> {
  const notes = parseSessionNotes(session);
  const fromNotes = notes.player_positions;
  const fromContent = session?.session_content?.player_positions;

  const candidate =
    fromNotes && typeof fromNotes === "object"
      ? fromNotes
      : fromContent && typeof fromContent === "object"
        ? fromContent
        : {};

  return Object.fromEntries(
    Object.entries(candidate).map(([id, position]) => [
      String(id),
      String(position || ""),
    ]),
  );
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

function cleanDatabaseText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map(String).filter(Boolean).join("\n");
  }

  if (typeof value === "string") {
    const trimmed = value.trim();

    if (
      (trimmed.startsWith("[") && trimmed.endsWith("]")) ||
      (trimmed.startsWith("{") && trimmed.endsWith("}"))
    ) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) {
          return parsed.map(String).filter(Boolean).join("\n");
        }
      } catch {
        // Le texte n'est pas du JSON : on le conserve tel quel.
      }
    }

    return trimmed;
  }

  return value == null ? "" : String(value);
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

  const exactPositions = savedPlayerPositionMap(session);

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
        // Ordre strict :
        // 1. plan exact sauvegardé lors de la génération ;
        // 2. snapshot practice_session_players ;
        // 3. poste habituel de la fiche joueur.
        position: normalizePosition(
          firstString(
            exactPositions[id],
            row.position,
            row.position_primary,
            row.session_position,
            detail.position_primary,
            detail.position,
          ),
        ),
      };
    })
    .filter((player, index, list) => player.id && list.findIndex((item) => item.id === player.id) === index)
    .sort((a, b) => `${a.last_name} ${a.first_name}`.localeCompare(`${b.last_name} ${b.first_name}`, "fr"));
}

async function resolveClubLogo(
  supabase:
    | Awaited<ReturnType<typeof createClient>>
    | NonNullable<ReturnType<typeof createAdminClient>>,
  session: GenericRow,
) {
  const notes = parseSessionNotes(session);

  const directLogo = firstString(
    session.club_logo_url,
    session.team_logo_url,
    session.logo_url,
    session.clubLogoUrl,
    session.teamLogoUrl,
    notes.club_logo_url,
    notes.team_logo_url,
    session?.session_content?.team?.club_logo_url,
    session?.session_content?.team?.logo_url,
    session?.session_content?.club?.logo_url,
  );

  if (directLogo) return directLogo;

  const teamReferences = Array.from(
    new Set(
      [
        session.team_id,
        session.team_reference_id,
        notes.team_reference_id,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

  let team: GenericRow | null = null;

  for (const reference of teamReferences) {
    const { data } = await supabase
      .from("teams")
      .select("*")
      .eq("id", reference)
      .maybeSingle();

    if (data) {
      team = data;
      break;
    }
  }

  const teamNames = Array.from(
    new Set(
      [
        session.team_name,
        session.location,
        session?.session_content?.team?.name,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

  if (!team) {
    for (const name of teamNames) {
      const { data } = await supabase
        .from("teams")
        .select("*")
        .or(`name.eq.${name},nom.eq.${name}`)
        .limit(1)
        .maybeSingle();

      if (data) {
        team = data;
        break;
      }
    }
  }

  const teamLogo = firstString(
    team?.club_logo_url,
    team?.team_logo_url,
    team?.logo_url,
    team?.logo,
    team?.image_url,
    team?.avatar_url,
    team?.metadata?.logo,
    team?.metadata?.logo_url,
    team?.metadata?.club_logo_url,
  );

  if (teamLogo) return teamLogo;

  const clubReferences = Array.from(
    new Set(
      [
        team?.club_id,
        session.club_id,
        notes.club_id,
      ]
        .map((value) => String(value || "").trim())
        .filter(Boolean),
    ),
  );

  for (const clubId of clubReferences) {
    const { data: club } = await supabase
      .from("clubs")
      .select("*")
      .eq("id", clubId)
      .maybeSingle();

    const clubLogo = firstString(
      club?.logo_url,
      club?.club_logo_url,
      club?.logo,
      club?.image_url,
      club?.avatar_url,
    );

    if (clubLogo) return clubLogo;
  }

  // Fallback fiable : le logo du club enregistré dans le profil du créateur.
  // Les anciennes séances n'avaient pas toujours club_id / team logo persistés.
  const ownerId = firstString(session.user_id, session.created_by, session.owner_id);
  if (ownerId) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", ownerId)
      .maybeSingle();

    const profileLogo = firstString(
      profile?.club_logo_url,
      profile?.logo_url,
    );

    if (profileLogo) return profileLogo;
  }

  // Dernier recours : le nom de club peut avoir été enregistré comme lieu
  // ou comme nom d'équipe lors de la création de la séance.
  for (const name of teamNames) {
    const { data: club } = await supabase
      .from("clubs")
      .select("*")
      .or(`name.eq.${name},nom.eq.${name}`)
      .limit(1)
      .maybeSingle();

    const clubLogo = firstString(
      club?.logo_url,
      club?.club_logo_url,
      club?.logo,
      club?.image_url,
      club?.avatar_url,
    );

    if (clubLogo) return clubLogo;
  }

  return null;
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

  const exerciseRows = (exercises ?? []) as GenericRow[];
  const sourceExerciseIds = Array.from(
    new Set(
      exerciseRows
        .map((exercise) => String(exercise.exercise_id || ""))
        .filter(Boolean),
    ),
  );

  const { data: sourceExercises } = sourceExerciseIds.length
    ? await supabase.from("exercises").select("*").in("id", sourceExerciseIds)
    : { data: [] as GenericRow[] };

  const sourceExerciseById = new Map(
    (sourceExercises ?? []).map((exercise: GenericRow) => [
      String(exercise.id),
      exercise,
    ]),
  );

  const players = await loadPresentPlayers(supabase, session, id);
  const logoAdmin = createAdminClient();

  let clubLogoSource = logoAdmin
    ? await resolveClubLogo(logoAdmin as any, session)
    : null;

  if (!clubLogoSource) {
    clubLogoSource = await resolveClubLogo(supabase, session);
  }

  const myBasketLogo = await imageDataUri("/logo-mybasket02.png");
  const clubLogo = await imageDataUri(clubLogoSource);

  const normalizedExercises: PdfExercise[] = await Promise.all(
    exerciseRows.map(
      async (exercise): Promise<PdfExercise> => {
        const source =
          sourceExerciseById.get(String(exercise.exercise_id || "")) || {};

        const imageUrls = Array.from(
          new Set([
            ...normalizeExerciseImages(source),
            ...normalizeExerciseImages(exercise),
          ]),
        );

        const sourceDeroulement =
          source.deroulement ??
          source.description ??
          source.explanation ??
          exercise.explanation ??
          null;

        const sourceConsignes =
          source.consignes ??
          source.instructions ??
          exercise.instructions ??
          null;

        const sourceVariantes =
          source.variantes ??
          source.variants ??
          exercise.variants ??
          null;

        return {
          title: String(source.title || exercise.title || "Exercice"),
          who: exercise.who ? String(exercise.who) : null,
          duration_minutes:
            exercise.duration_minutes == null
              ? null
              : Number(exercise.duration_minutes),
          situation_image_url: imageUrls[0] || null,
          schema_urls: await Promise.all(
            imageUrls.map(async (url) => (await imageDataUri(url)) || url),
          ),
          explanation: sourceDeroulement
            ? cleanDatabaseText(sourceDeroulement)
            : null,
          instructions: sourceConsignes
            ? cleanDatabaseText(sourceConsignes)
            : null,
          variants: sourceVariantes
            ? cleanDatabaseText(sourceVariantes)
            : null,
        };
      },
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
    .update({
      attachment_url: pdfUrl,
      updated_at: new Date().toISOString(),
    })
    .eq("session_id", id)
    .or(`user_id.eq.${user.id},owner_id.eq.${user.id}`);

  return NextResponse.json({ pdfUrl });
}
