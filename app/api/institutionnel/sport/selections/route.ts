import { NextResponse } from "next/server";
import {
  canManageSport,
  institutionalSportActor,
} from "@/lib/institutionnel/sport-access-server";

export async function GET(req: Request) {
  const structureId =
    new URL(req.url).searchParams.get("structureId") || "";

  if (!structureId) {
    return NextResponse.json({ error: "structureId manquant" }, { status: 400 });
  }

  const ctx = await institutionalSportActor(structureId);
  if ("error" in ctx) return ctx.error;

  const { data: selections, error } = await ctx.admin
    .from("institutional_selections")
    .select("*")
    .eq("structure_id", structureId)
    .neq("status", "archived")
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const selectionIds = (selections || []).map((row: any) => row.id);
  const teamIds = (selections || []).map((row: any) => row.team_id).filter(Boolean);

  const [{ data: memberships }, { data: staff }] = await Promise.all([
    selectionIds.length
      ? ctx.admin
          .from("institutional_selection_players")
          .select("*")
          .in("selection_id", selectionIds)
          .eq("status", "active")
      : Promise.resolve({ data: [] as any[] }),
    teamIds.length
      ? ctx.admin
          .from("institutional_team_staff")
          .select("id,team_id,email,user_id,role,access_level,status")
          .in("team_id", teamIds)
          .eq("status", "active")
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const playerIds = Array.from(
    new Set((memberships || []).map((row: any) => row.player_id).filter(Boolean))
  );

  const { data: players } = playerIds.length
    ? await ctx.admin
        .from("institutional_players")
        .select(
          "id,first_name,last_name,birthdate,club_name,category,linked_user_id,photo_url"
        )
        .in("id", playerIds)
    : { data: [] as any[] };

  const playerById = new Map(
    (players || []).map((player: any) => [String(player.id), player])
  );

  const playersBySelection = new Map<string, any[]>();
  for (const membership of memberships || []) {
    const key = String(membership.selection_id);
    playersBySelection.set(key, [
      ...(playersBySelection.get(key) || []),
      {
        ...membership,
        player: playerById.get(String(membership.player_id)) || null,
      },
    ]);
  }

  const staffByTeam = new Map<string, any[]>();
  for (const member of staff || []) {
    const key = String(member.team_id);
    staffByTeam.set(key, [...(staffByTeam.get(key) || []), member]);
  }

  return NextResponse.json({
    selections: (selections || []).map((selection: any) => ({
      ...selection,
      players: playersBySelection.get(String(selection.id)) || [],
      staff: staffByTeam.get(String(selection.team_id)) || [],
    })),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const structureId = String(body.structureId || "");
  const name = String(body.name || "").trim();
  const category = String(body.category || "").trim();
  const seasonLabel = String(body.seasonLabel || "").trim();
  const gender = String(body.gender || "").trim() || null;

  if (!structureId || !name) {
    return NextResponse.json(
      { error: "Institution ou nom de sélection manquant" },
      { status: 400 }
    );
  }

  const ctx = await institutionalSportActor(structureId);
  if ("error" in ctx) return ctx.error;

  if (!canManageSport(ctx.member)) {
    return NextResponse.json({ error: "Droits insuffisants" }, { status: 403 });
  }

  const teamId = crypto.randomUUID();
  const selectionId = crypto.randomUUID();
  const now = new Date().toISOString();

  const teamWrite = await ctx.admin.from("teams").insert({
    id: teamId,
    user_id: ctx.user.id,
    team_type: "coached",
    name,
    club_name: name,
    category,
    coach_name: "",
    metadata: {
      institutionManaged: true,
      institutionStructureId: structureId,
      institutionKind: "selection",
      institutionSelectionId: selectionId,
      institutionAllAccess: true,
      season: seasonLabel,
      category,
      cat: category,
      name,
    },
    updated_at: now,
  });

  if (teamWrite.error) {
    return NextResponse.json({ error: teamWrite.error.message }, { status: 400 });
  }

  const selectionWrite = await ctx.admin
    .from("institutional_selections")
    .insert({
      id: selectionId,
      structure_id: structureId,
      team_id: teamId,
      name,
      category: category || null,
      season_label: seasonLabel || null,
      gender,
      status: "active",
      created_by: ctx.user.id,
    })
    .select("*")
    .single();

  if (selectionWrite.error) {
    await ctx.admin.from("teams").delete().eq("id", teamId);
    return NextResponse.json(
      { error: selectionWrite.error.message },
      { status: 400 }
    );
  }

  const linkWrite = await ctx.admin.from("institutional_team_links").insert({
    structure_id: structureId,
    team_id: teamId,
    kind: "selection",
    label: name,
    season_label: seasonLabel || null,
    created_by: ctx.user.id,
  });

  if (linkWrite.error) {
    await ctx.admin.from("institutional_selections").delete().eq("id", selectionId);
    await ctx.admin.from("teams").delete().eq("id", teamId);
    return NextResponse.json(
      { error: linkWrite.error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({
    ok: true,
    selection: selectionWrite.data,
  });
}
