import type { DataRow } from "@/lib/analytics/matches";
import {
  playerCanSeeCalendarEvent,
  verifiedPlayerMemberships,
  linkedPlayerCanSeeCalendarEvent,
} from "@/lib/calendar-access";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";
import { teamMessagingContacts } from "@/lib/messaging/team-contacts";
export async function GET(request: Request) {
  const db = await createClient();
  const {
    data: { user },
  } = await db.auth.getUser();
  if (!user)
    return NextResponse.json({ error: "Non connecté" }, { status: 401 });
  const url = new URL(request.url);
  const teamId = url.searchParams.get("teamId"),
    playerId = url.searchParams.get("playerId");
  const start = url.searchParams.get("start"),
    end = url.searchParams.get("end");
  if (
    (teamId && !/^[\w-]{1,80}$/.test(teamId)) ||
    (playerId && !/^[\w-]{1,80}$/.test(playerId))
  )
    return NextResponse.json(
      { error: "Identifiant invalide" },
      { status: 400 },
    );
  const admin = createAdminClient();
  if (!admin)
    return NextResponse.json(
      { error: "Calendrier partagé indisponible" },
      { status: 503 },
    );
  const { data: linked, error: linkError } = await admin
    .from("players")
    .select("id,team_id,metadata")
    .contains("metadata", { messagingUserId: user.id })
    .limit(100);
  if (linkError)
    return NextResponse.json(
      { error: "Calendrier indisponible" },
      { status: 503 },
    );
  let linkedMemberships: { id: string; team_id: string }[];
  try {
    linkedMemberships = await verifiedPlayerMemberships(admin, linked || []);
  } catch {
    return NextResponse.json(
      { error: "Équipes liées indisponibles" },
      { status: 503 },
    );
  }
  let targetTeamIds = teamId ? [teamId] : [];
  let coach = false;
  if (
    teamId &&
    playerId &&
    !linkedMemberships.some((p) => p.id === playerId && p.team_id === teamId)
  ) {
    try {
      const access = await teamMessagingContacts(db, user.id, teamId);
      coach = access.canLinkPlayers;
    } catch {}
    if (!coach)
      return NextResponse.json(
        { error: "Accès au joueur requis" },
        { status: 403 },
      );
    const { data: player } = await admin
      .from("players")
      .select("id,team_id,metadata")
      .eq("id", playerId)
      .maybeSingle();
    if (player)
      targetTeamIds = (await verifiedPlayerMemberships(admin, [player])).map(
        (p) => p.team_id,
      );
    if (!player || !targetTeamIds.includes(teamId))
      return NextResponse.json(
        { error: "Joueur introuvable" },
        { status: 404 },
      );
  }
  if (
    teamId &&
    playerId &&
    linkedMemberships.some((p) => p.id === playerId && p.team_id === teamId)
  )
    targetTeamIds = linkedMemberships
      .filter((p) => p.id === playerId)
      .map((p) => p.team_id);
  if ((teamId && !playerId) || (!teamId && playerId))
    return NextResponse.json(
      { error: "Équipe et joueur requis ensemble" },
      { status: 400 },
    );
  async function collect(kind: "own" | "assigned") {
    const all: DataRow[] = [];
    let offset = 0;
    while (true) {
      let q = admin!
        .from("calendar_events")
        .select("*")
        .order("event_date")
        .order("id")
        .range(offset, offset + 499);
      if (kind === "own")
        q = q.or(`user_id.eq.${user!.id},owner_id.eq.${user!.id}`);
      else if (teamId) q = q.in("team_id", targetTeamIds);
      else
        q = q.in("team_id", [
          ...new Set(linkedMemberships.map((p) => p.team_id).filter(Boolean)),
        ]);
      if (start && /^\d{4}-\d{2}-\d{2}$/.test(start))
        q = q.gte("event_date", start);
      if (end && /^\d{4}-\d{2}-\d{2}$/.test(end)) q = q.lte("event_date", end);
      const { data, error } = await q;
      if (error) throw error;
      if (!data?.length) break;
      all.push(...data);
      offset += data.length;
    }
    return all;
  }
  try {
    const rows = teamId
      ? await collect("assigned")
      : [
          ...(await collect("own")),
          ...(linked?.length ? await collect("assigned") : []),
        ];
    const visible = rows.filter((row) =>
      teamId
        ? playerCanSeeCalendarEvent(row, playerId!)
        : linkedPlayerCanSeeCalendarEvent(row, user.id, linkedMemberships),
    );
    return NextResponse.json({
      events: [
        ...new Map(
          visible.map((row) => [
            row.id,
            {
              ...row,
              can_edit: row.user_id === user.id || row.owner_id === user.id,
            },
          ]),
        ).values(),
      ],
    });
  } catch {
    return NextResponse.json(
      { error: "Chargement du calendrier impossible" },
      { status: 503 },
    );
  }
}
