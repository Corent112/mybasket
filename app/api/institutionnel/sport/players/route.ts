import { NextResponse } from "next/server";
import {
  canManageSport,
  institutionalSportActor,
} from "@/lib/institutionnel/sport-access-server";

async function createTeamPlayer(
  admin: any,
  {
    teamId,
    ownerId,
    player,
  }: {
    teamId: string;
    ownerId: string;
    player: any;
  }
) {
  const row = {
    id: crypto.randomUUID(),
    user_id: ownerId,
    team_id: teamId,
    first_name: player.first_name || "",
    last_name: player.last_name || "",
    birth_date: player.birthdate || null,
    photo_url: player.photo_url || null,
    status: "Disponible",
    metadata: {
      institutionCentralPlayerId: player.id,
      institutionManaged: true,
      clubName: player.club_name || null,
      category: player.category || null,
    },
    updated_at: new Date().toISOString(),
  };

  const write = await admin.from("players").insert(row).select("id").single();
  if (write.error) throw new Error(write.error.message);
  return String(write.data.id);
}

async function getTeamOwner(admin: any, teamId: string, fallback: string) {
  const { data } = await admin
    .from("teams")
    .select("user_id")
    .eq("id", teamId)
    .maybeSingle();

  return String(data?.user_id || fallback);
}

export async function GET(req: Request) {
  const structureId =
    new URL(req.url).searchParams.get("structureId") || "";

  if (!structureId) {
    return NextResponse.json({ error: "structureId manquant" }, { status: 400 });
  }

  const ctx = await institutionalSportActor(structureId);
  if ("error" in ctx) return ctx.error;

  const { data, error } = await ctx.admin
    .from("institutional_players")
    .select(
      "id,first_name,last_name,birthdate,sex,email,phone,photo_url,club_name,category,status,linked_user_id"
    )
    .eq("structure_id", structureId)
    .eq("archived", false)
    .order("last_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ players: data || [] });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const structureId = String(body.structureId || "");
  const mode = String(body.mode || "");

  if (!structureId || !mode) {
    return NextResponse.json({ error: "Données manquantes" }, { status: 400 });
  }

  const ctx = await institutionalSportActor(structureId);
  if ("error" in ctx) return ctx.error;

  if (!canManageSport(ctx.member)) {
    return NextResponse.json({ error: "Droits insuffisants" }, { status: 403 });
  }

  if (mode === "create") {
    const firstName = String(body.firstName || "").trim();
    const lastName = String(body.lastName || "").trim();

    if (!firstName || !lastName) {
      return NextResponse.json(
        { error: "Prénom et nom obligatoires" },
        { status: 400 }
      );
    }

    const playerWrite = await ctx.admin
      .from("institutional_players")
      .insert({
        structure_id: structureId,
        first_name: firstName,
        last_name: lastName,
        birthdate: body.birthdate || null,
        sex: body.sex || null,
        club_name: body.clubName || null,
        category: body.category || null,
        status: "followed",
        archived: false,
        created_by: ctx.user.id,
      })
      .select("*")
      .single();

    if (playerWrite.error) {
      return NextResponse.json(
        { error: playerWrite.error.message },
        { status: 400 }
      );
    }

    const player = playerWrite.data;

    if (body.selectionId) {
      const { data: selection } = await ctx.admin
        .from("institutional_selections")
        .select("id,team_id")
        .eq("id", String(body.selectionId))
        .eq("structure_id", structureId)
        .maybeSingle();

      if (!selection?.team_id) {
        return NextResponse.json(
          { error: "Sélection introuvable" },
          { status: 404 }
        );
      }

      try {
        const ownerId = await getTeamOwner(
          ctx.admin,
          String(selection.team_id),
          ctx.user.id
        );
        const teamPlayerId = await createTeamPlayer(ctx.admin, {
          teamId: String(selection.team_id),
          ownerId,
          player,
        });

        await ctx.admin.from("institutional_player_team_links").insert({
          structure_id: structureId,
          player_id: player.id,
          team_id: selection.team_id,
          team_player_id: teamPlayerId,
          relation_type: "selection",
          created_by: ctx.user.id,
        });

        const memberWrite = await ctx.admin
          .from("institutional_selection_players")
          .insert({
            selection_id: selection.id,
            player_id: player.id,
            team_player_id: teamPlayerId,
            status: "active",
            created_by: ctx.user.id,
          });

        if (memberWrite.error) throw new Error(memberWrite.error.message);
      } catch (error: any) {
        return NextResponse.json(
          { error: error?.message || "Association à la sélection impossible" },
          { status: 400 }
        );
      }
    }

    return NextResponse.json({ ok: true, player });
  }

  if (mode === "attach") {
    const playerId = String(body.playerId || "");
    const selectionId = String(body.selectionId || "");

    const [{ data: player }, { data: selection }] = await Promise.all([
      ctx.admin
        .from("institutional_players")
        .select("*")
        .eq("id", playerId)
        .eq("structure_id", structureId)
        .maybeSingle(),
      ctx.admin
        .from("institutional_selections")
        .select("id,team_id")
        .eq("id", selectionId)
        .eq("structure_id", structureId)
        .maybeSingle(),
    ]);

    if (!player || !selection?.team_id) {
      return NextResponse.json(
        { error: "Joueur ou sélection introuvable" },
        { status: 404 }
      );
    }

    const existing = await ctx.admin
      .from("institutional_selection_players")
      .select("id")
      .eq("selection_id", selectionId)
      .eq("player_id", playerId)
      .maybeSingle();

    if (existing.data?.id) {
      return NextResponse.json({ ok: true, alreadyExists: true });
    }

    try {
      const ownerId = await getTeamOwner(
        ctx.admin,
        String(selection.team_id),
        ctx.user.id
      );
      const teamPlayerId = await createTeamPlayer(ctx.admin, {
        teamId: String(selection.team_id),
        ownerId,
        player,
      });

      await ctx.admin.from("institutional_player_team_links").insert({
        structure_id: structureId,
        player_id: playerId,
        team_id: selection.team_id,
        team_player_id: teamPlayerId,
        relation_type: "selection",
        created_by: ctx.user.id,
      });

      const write = await ctx.admin.from("institutional_selection_players").insert({
        selection_id: selectionId,
        player_id: playerId,
        team_player_id: teamPlayerId,
        status: "active",
        created_by: ctx.user.id,
      });

      if (write.error) throw new Error(write.error.message);

      return NextResponse.json({ ok: true, teamPlayerId });
    } catch (error: any) {
      return NextResponse.json(
        { error: error?.message || "Ajout impossible" },
        { status: 400 }
      );
    }
  }

  if (mode === "associate_secondary") {
    const playerId = String(body.playerId || "");
    const selectionId = String(body.selectionId || "");
    const secondaryTeamId = String(body.secondaryTeamId || "");

    const [{ data: player }, { data: link }, { data: membership }] =
      await Promise.all([
        ctx.admin
          .from("institutional_players")
          .select("*")
          .eq("id", playerId)
          .eq("structure_id", structureId)
          .maybeSingle(),
        ctx.admin
          .from("institutional_team_links")
          .select("team_id,kind")
          .eq("structure_id", structureId)
          .eq("team_id", secondaryTeamId)
          .eq("kind", "secondary")
          .maybeSingle(),
        ctx.admin
          .from("institutional_selection_players")
          .select("id")
          .eq("selection_id", selectionId)
          .eq("player_id", playerId)
          .maybeSingle(),
      ]);

    if (!player || !link || !membership?.id) {
      return NextResponse.json(
        { error: "Joueur, sélection ou équipe secondaire introuvable" },
        { status: 404 }
      );
    }

    const existingLink = await ctx.admin
      .from("institutional_player_team_links")
      .select("id,team_player_id")
      .eq("structure_id", structureId)
      .eq("player_id", playerId)
      .eq("team_id", secondaryTeamId)
      .maybeSingle();

    let secondaryTeamPlayerId = existingLink.data?.team_player_id || null;

    if (!secondaryTeamPlayerId) {
      try {
        const ownerId = await getTeamOwner(
          ctx.admin,
          secondaryTeamId,
          ctx.user.id
        );
        secondaryTeamPlayerId = await createTeamPlayer(ctx.admin, {
          teamId: secondaryTeamId,
          ownerId,
          player,
        });

        const linkWrite = await ctx.admin
          .from("institutional_player_team_links")
          .upsert(
            {
              structure_id: structureId,
              player_id: playerId,
              team_id: secondaryTeamId,
              team_player_id: secondaryTeamPlayerId,
              relation_type: "secondary",
              created_by: ctx.user.id,
            },
            { onConflict: "player_id,team_id" }
          );

        if (linkWrite.error) throw new Error(linkWrite.error.message);
      } catch (error: any) {
        return NextResponse.json(
          { error: error?.message || "Création du joueur équipe impossible" },
          { status: 400 }
        );
      }
    }

    const update = await ctx.admin
      .from("institutional_selection_players")
      .update({
        secondary_team_id: secondaryTeamId,
        secondary_team_player_id: secondaryTeamPlayerId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", membership.id);

    if (update.error) {
      return NextResponse.json({ error: update.error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, secondaryTeamPlayerId });
  }

  return NextResponse.json({ error: "Mode inconnu" }, { status: 400 });
}
