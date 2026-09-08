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

  const { data: links, error } = await ctx.admin
    .from("institutional_team_links")
    .select("*")
    .eq("structure_id", structureId)
    .order("created_at", { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const teamIds = (links || []).map((row: any) => row.team_id).filter(Boolean);

  const [{ data: teams }, { data: staff }] = await Promise.all([
    teamIds.length
      ? ctx.admin
          .from("teams")
          .select("id,name,category,coach_name,team_type,metadata")
          .in("id", teamIds)
      : Promise.resolve({ data: [] as any[] }),
    teamIds.length
      ? ctx.admin
          .from("institutional_team_staff")
          .select("id,team_id,email,user_id,role,access_level,status")
          .in("team_id", teamIds)
          .eq("status", "active")
      : Promise.resolve({ data: [] as any[] }),
  ]);

  const teamById = new Map(
    (teams || []).map((team: any) => [String(team.id), team])
  );

  const staffByTeam = new Map<string, any[]>();
  for (const member of staff || []) {
    const key = String(member.team_id);
    staffByTeam.set(key, [...(staffByTeam.get(key) || []), member]);
  }

  return NextResponse.json({
    teams: (links || []).map((link: any) => ({
      ...link,
      team: teamById.get(String(link.team_id)) || null,
      staff: staffByTeam.get(String(link.team_id)) || [],
    })),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const structureId = String(body.structureId || "");
  const name = String(body.name || "").trim();
  const category = String(body.category || "").trim();
  const seasonLabel = String(body.seasonLabel || "").trim();
  const kind =
    body.kind === "secondary" ? "secondary" : "primary";

  if (!structureId || !name) {
    return NextResponse.json(
      { error: "Institution ou nom d’équipe manquant" },
      { status: 400 }
    );
  }

  const ctx = await institutionalSportActor(structureId);
  if ("error" in ctx) return ctx.error;

  if (!canManageSport(ctx.member)) {
    return NextResponse.json({ error: "Droits insuffisants" }, { status: 403 });
  }

  const teamId = crypto.randomUUID();
  const now = new Date().toISOString();

  const teamInsert = await ctx.admin.from("teams").insert({
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
      institutionKind: kind,
      institutionAllAccess: true,
      season: seasonLabel,
      cat: category,
      category,
      name,
    },
    updated_at: now,
  });

  if (teamInsert.error) {
    return NextResponse.json(
      { error: teamInsert.error.message },
      { status: 400 }
    );
  }

  const linkInsert = await ctx.admin.from("institutional_team_links").insert({
    structure_id: structureId,
    team_id: teamId,
    kind,
    label: name,
    season_label: seasonLabel || null,
    created_by: ctx.user.id,
  });

  if (linkInsert.error) {
    await ctx.admin.from("teams").delete().eq("id", teamId);
    return NextResponse.json(
      { error: linkInsert.error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true, teamId });
}
