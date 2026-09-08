import { NextResponse } from "next/server";
import {
  canManageSport,
  institutionalSportActor,
} from "@/lib/institutionnel/sport-access-server";

function toIsoDate(value: unknown) {
  const raw = String(value || "").trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const [, day, month, year] = match;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}

async function createTeamPlayer(
  admin: any,
  {
    teamId,
    ownerId,
    player,
    canonicalPlayerId,
  }: {
    teamId: string;
    ownerId: string;
    player: any;
    canonicalPlayerId: string;
  }
) {
  const row = {
    id: crypto.randomUUID(),
    user_id: ownerId,
    team_id: teamId,
    first_name: player.firstName || player.first_name || "",
    last_name: player.lastName || player.last_name || "",
    number: player.num ?? null,
    photo_url: player.photo ?? player.photo_url ?? null,
    position_primary: player.postePrincipal || "",
    position_secondary: player.posteSecondaire || "",
    birth_date: toIsoDate(player.dob || player.birthdate),
    age: player.age ?? null,
    height: player.taille || "",
    weight: player.poids || "",
    dominant_hand: player.mainDominante || "Droite",
    status: player.statut || "Disponible",
    license_number: player.licenceNumber || player.licenseNumber || null,
    tutor1_phone: player.tuteur1Phone || null,
    tutor1_email: player.tuteur1Email || null,
    tutor2_phone: player.tuteur2Phone || null,
    tutor2_email: player.tuteur2Email || null,
    presence_pct: player.presencePct ?? 0,
    punctuality_pct: player.ponctualitePct ?? 0,
    potential: player.potentiel ?? null,
    notes: player.notes || "",
    metadata: {
      ...player,
      institutionCentralPlayerId: canonicalPlayerId,
      institutionManaged: true,
      clubName: player.club || player.club_name || null,
      category: player.categorie || player.category || null,
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
      "id,first_name,last_name,birthdate,sex,email,phone,photo_url,club_name,category,status,linked_user_id,profile_data"
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

  if (mode === "create_full") {
    const playerData = body.playerData || {};
    const firstName = String(playerData.firstName || "").trim();
    const lastName = String(playerData.lastName || "").trim();

    if (!firstName) {
      return NextResponse.json(
        { error: "Prénom obligatoire" },
        { status: 400 }
      );
    }

    const playerWrite = await ctx.admin
      .from("institutional_players")
      .insert({
        structure_id: structureId,
        first_name: firstName,
        last_name: lastName,
        birthdate: toIsoDate(playerData.dob),
        photo_url: playerData.photo || null,
        club_name: playerData.club || null,
        category: playerData.categorie || null,
        status: "followed",
        archived: false,
        profile_data: playerData,
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

    const canonicalPlayer = playerWrite.data;
    const selectionId = String(body.selectionId || "");

    if (!selectionId) {
      return NextResponse.json({ ok: true, player: canonicalPlayer });
    }

    const { data: selection } = await ctx.admin
      .from("institutional_selections")
      .select("id,team_id")
      .eq("id", selectionId)
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
        player: playerData,
        canonicalPlayerId: String(canonicalPlayer.id),
      });

      const linkWrite = await ctx.admin
        .from("institutional_player_team_links")
        .insert({
          structure_id: structureId,
          player_id: canonicalPlayer.id,
          team_id: selection.team_id,
          team_player_id: teamPlayerId,
          relation_type: "selection",
          created_by: ctx.user.id,
        });

      if (linkWrite.error) throw new Error(linkWrite.error.message);

      const memberWrite = await ctx.admin
        .from("institutional_selection_players")
        .insert({
          selection_id: selection.id,
          player_id: canonicalPlayer.id,
          team_player_id: teamPlayerId,
          status: "active",
          created_by: ctx.user.id,
        });

      if (memberWrite.error) throw new Error(memberWrite.error.message);

      return NextResponse.json({
        ok: true,
        player: canonicalPlayer,
        teamId: selection.team_id,
        teamPlayerId,
      });
    } catch (error: any) {
      return NextResponse.json(
        {
          error:
            error?.message ||
            "Création de la fiche sportive MyBasket impossible",
        },
        { status: 400 }
      );
    }
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

      const playerData = player.profile_data || {
        firstName: player.first_name,
        lastName: player.last_name,
        dob: player.birthdate || "",
        photo: player.photo_url || null,
        club: player.club_name || "",
        categorie: player.category || "",
      };

      const teamPlayerId = await createTeamPlayer(ctx.admin, {
        teamId: String(selection.team_id),
        ownerId,
        player: playerData,
        canonicalPlayerId: playerId,
      });

      const linkWrite = await ctx.admin
        .from("institutional_player_team_links")
        .insert({
          structure_id: structureId,
          player_id: playerId,
          team_id: selection.team_id,
          team_player_id: teamPlayerId,
          relation_type: "selection",
          created_by: ctx.user.id,
        });

      if (linkWrite.error) throw new Error(linkWrite.error.message);

      const write = await ctx.admin.from("institutional_selection_players").insert({
        selection_id: selectionId,
        player_id: playerId,
        team_player_id: teamPlayerId,
        status: "active",
        created_by: ctx.user.id,
      });

      if (write.error) throw new Error(write.error.message);

      return NextResponse.json({
        ok: true,
        teamId: selection.team_id,
        teamPlayerId,
      });
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

        const playerData = player.profile_data || {
          firstName: player.first_name,
          lastName: player.last_name,
          dob: player.birthdate || "",
          photo: player.photo_url || null,
          club: player.club_name || "",
          categorie: player.category || "",
        };

        secondaryTeamPlayerId = await createTeamPlayer(ctx.admin, {
          teamId: secondaryTeamId,
          ownerId,
          player: playerData,
          canonicalPlayerId: playerId,
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
