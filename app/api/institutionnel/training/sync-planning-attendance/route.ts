import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

const MORNING_END = 13 * 60;
const AUTO_TITLES = new Set(["Matin", "Après-midi"]);

function toMinutes(value: string | null | undefined) {
  const [h, m] = String(value || "00:00")
    .slice(0, 5)
    .split(":")
    .map(Number);
  return (h || 0) * 60 + (m || 0);
}

function toTime(value: number) {
  const h = Math.floor(value / 60);
  const m = value % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

async function canManage(
  db: any,
  userId: string,
  cohortId: string,
) {
  const [{ data: instructor }, { data: profile }, { data: cohort }] =
    await Promise.all([
      db
        .from("training_instructors")
        .select("id")
        .eq("cohort_id", cohortId)
        .eq("user_id", userId)
        .maybeSingle(),
      db
        .from("profiles")
        .select("platform_role")
        .eq("id", userId)
        .maybeSingle(),
      db
        .from("training_cohorts")
        .select("institution_id")
        .eq("id", cohortId)
        .maybeSingle(),
    ]);

  if (
    instructor ||
    ["ceo", "superadmin"].includes(String(profile?.platform_role || ""))
  ) {
    return true;
  }

  if (!cohort?.institution_id) return false;

  const { data: member } = await db
    .from("institutional_members")
    .select("id")
    .eq("structure_id", cohort.institution_id)
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  return !!member;
}

type DesiredSession = {
  key: string;
  session_date: string;
  title: "Matin" | "Après-midi";
  start_time: string;
  end_time: string;
  location: string | null;
};

export async function POST(request: Request) {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const cohortId = String(body.cohortId || "");

  if (!cohortId) {
    return NextResponse.json(
      { error: "Formation manquante" },
      { status: 400 },
    );
  }

  const admin = createAdminClient() || sb;

  if (!(await canManage(admin, user.id, cohortId))) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const { data: blocks, error: blocksError } = await admin
    .from("training_schedule_blocks")
    .select(
      "id,training_day,start_time,end_time,block_type,room_name,location_type",
    )
    .eq("cohort_id", cohortId)
    .order("training_day")
    .order("start_time");

  if (blocksError) {
    return NextResponse.json(
      { error: blocksError.message },
      { status: 400 },
    );
  }

  const usefulBlocks = (blocks || []).filter(
    (block: any) =>
      !["meal", "break"].includes(String(block.block_type || "")) &&
      toMinutes(block.end_time) > toMinutes(block.start_time),
  );

  const byDay = new Map<string, any[]>();
  for (const block of usefulBlocks) {
    const day = String(block.training_day || "");
    if (!day) continue;
    const items = byDay.get(day) || [];
    items.push(block);
    byDay.set(day, items);
  }

  const desired: DesiredSession[] = [];

  for (const [day, dayBlocks] of byDay.entries()) {
    const morning = dayBlocks
      .map((block) => ({
        ...block,
        clippedStart: toMinutes(block.start_time),
        clippedEnd: Math.min(toMinutes(block.end_time), MORNING_END),
      }))
      .filter((block) => block.clippedStart < MORNING_END && block.clippedEnd > block.clippedStart);

    const afternoon = dayBlocks
      .map((block) => ({
        ...block,
        clippedStart: Math.max(toMinutes(block.start_time), MORNING_END),
        clippedEnd: toMinutes(block.end_time),
      }))
      .filter((block) => block.clippedEnd > MORNING_END && block.clippedEnd > block.clippedStart);

    const makeSession = (
      title: "Matin" | "Après-midi",
      items: any[],
    ) => {
      if (!items.length) return;

      const start = Math.min(...items.map((item) => item.clippedStart));
      const end = Math.max(...items.map((item) => item.clippedEnd));
      const locations = Array.from(
        new Set(
          items
            .map((item) => String(item.room_name || "").trim())
            .filter(Boolean),
        ),
      );

      desired.push({
        key: `${day}|${title}`,
        session_date: day,
        title,
        start_time: toTime(start),
        end_time: toTime(end),
        location: locations.length ? locations.join(" / ") : null,
      });
    };

    makeSession("Matin", morning);
    makeSession("Après-midi", afternoon);
  }

  const { data: existing, error: existingError } = await admin
    .from("training_attendance_sessions")
    .select("id,title,session_date,start_time,end_time,location")
    .eq("cohort_id", cohortId);

  if (existingError) {
    return NextResponse.json(
      { error: existingError.message },
      { status: 400 },
    );
  }

  const existingAuto = (existing || []).filter((session: any) =>
    AUTO_TITLES.has(String(session.title || "")),
  );

  const existingByKey = new Map(
    existingAuto.map((session: any) => [
      `${session.session_date}|${session.title}`,
      session,
    ]),
  );

  for (const session of desired) {
    const current: any = existingByKey.get(session.key);

    if (current) {
      const { error } = await admin
        .from("training_attendance_sessions")
        .update({
          title: session.title,
          session_date: session.session_date,
          start_time: session.start_time,
          end_time: session.end_time,
          location: session.location,
          is_required: true,
        })
        .eq("id", current.id);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    } else {
      const { error } = await admin
        .from("training_attendance_sessions")
        .insert({
          cohort_id: cohortId,
          title: session.title,
          session_date: session.session_date,
          start_time: session.start_time,
          end_time: session.end_time,
          location: session.location,
          is_required: true,
          created_by: user.id,
        });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
    }
  }

  const desiredKeys = new Set(desired.map((session) => session.key));
  const obsoleteIds = existingAuto
    .filter(
      (session: any) =>
        !desiredKeys.has(`${session.session_date}|${session.title}`),
    )
    .map((session: any) => session.id);

  if (obsoleteIds.length) {
    const attendanceDelete = await admin
      .from("training_candidate_attendance")
      .delete()
      .in("session_id", obsoleteIds);

    if (attendanceDelete.error) {
      return NextResponse.json(
        { error: attendanceDelete.error.message },
        { status: 400 },
      );
    }

    const sessionDelete = await admin
      .from("training_attendance_sessions")
      .delete()
      .in("id", obsoleteIds);

    if (sessionDelete.error) {
      return NextResponse.json(
        { error: sessionDelete.error.message },
        { status: 400 },
      );
    }
  }

  return NextResponse.json({
    ok: true,
    sessions: desired.length,
    days: byDay.size,
  });
}
