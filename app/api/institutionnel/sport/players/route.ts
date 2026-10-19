import {loadInstitutionSeason,withPlayerCategory} from "@/lib/institutionnel/player-category";
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
  const existing = await admin.from("players").select("id").eq("team_id",teamId).eq("metadata->>institutionCentralPlayerId",canonicalPlayerId).maybeSingle();
  if(existing.error)throw new Error(existing.error.message);
  if(existing.data?.id)return String(existing.data.id);
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
      "id,first_name,last_name,birthdate,sex,email,phone,photo_url,club_name,category,status,linked_user_id,tutor1_email,tutor2_email,profile_data"
    )
    .eq("structure_id", structureId)
    .eq("archived", false)
    .order("last_name");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const seasonLabel=await loadInstitutionSeason(ctx.admin,structureId);
  return NextResponse.json({ players: (data||[]).map(player=>withPlayerCategory(player,seasonLabel)),seasonLabel });
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
    return NextResponse.json({error:"Crée d’abord la fiche du joueur dans la base de l’institution, puis ajoute-la à une sélection."},{status:400});
  }

  if (mode === "detach") {
    const selectionId = String(body.selectionId || ""), playerId = String(body.playerId || "");
    if (!selectionId || !playerId) return NextResponse.json({error:"Sélection ou joueur manquant"},{status:400});
    const selection = await ctx.admin.from("institutional_selections").select("id").eq("id",selectionId).eq("structure_id",structureId).maybeSingle();
    if (selection.error || !selection.data) return NextResponse.json({error:"Sélection introuvable dans cette institution"},{status:404});
    const removed = await ctx.admin.from("institutional_selection_players").delete().eq("selection_id",selectionId).eq("player_id",playerId).select("id");
    if (removed.error) return NextResponse.json({error:removed.error.message},{status:400});
    return NextResponse.json({ok:true});
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

    const [teamCapacity,rosterCount]=await Promise.all([
      ctx.admin.from("teams").select("metadata").eq("id",selection.team_id).maybeSingle(),
      ctx.admin.from("institutional_selection_players").select("id",{count:"exact",head:true}).eq("selection_id",selectionId).eq("status","active")
    ]);
    if(teamCapacity.error||rosterCount.error)return NextResponse.json({error:"Vérification de l’effectif impossible"},{status:400});
    if(teamCapacity.data?.metadata?.institutionRosterKind==='preselection'){
      const write=await ctx.admin.from('institutional_selection_players').upsert({selection_id:selectionId,player_id:playerId,team_player_id:null,status:'active',created_by:ctx.user.id},{onConflict:'selection_id,player_id',ignoreDuplicates:true});
      if(write.error)return NextResponse.json({error:write.error.message},{status:400});
      return NextResponse.json({ok:true,preselection:true});
    }
    const maxPlayers=Number(teamCapacity.data?.metadata?.institutionSelectionMaxPlayers)===10?10:12;
    if((rosterCount.count||0)>=maxPlayers)return NextResponse.json({error:`Sélection complète : ${maxPlayers} joueurs maximum. Les détections et entraînements restent sans limite.`},{status:409});
    try {
      const ownerId = await getTeamOwner(
        ctx.admin,
        String(selection.team_id),
        ctx.user.id
      );

      const playerData = {
        ...(player.profile_data || {}),
        firstName: player.first_name,
        lastName: player.last_name,
        dob: player.birthdate || player.profile_data?.dob || "",
        photo: player.photo_url || player.profile_data?.photo || null,
        club: player.club_name || player.profile_data?.club || "",
        categorie: player.category || player.profile_data?.categorie || "",
      };

      const teamPlayerId = await createTeamPlayer(ctx.admin, {
        teamId: String(selection.team_id),
        ownerId,
        player: playerData,
        canonicalPlayerId: playerId,
      });

      const previousLink = await ctx.admin.from("institutional_player_team_links").select("id").eq("structure_id",structureId).eq("player_id",playerId).eq("team_id",selection.team_id).maybeSingle();
      if(previousLink.error)throw new Error(previousLink.error.message);
      const linkWrite = previousLink.data ? {error:null} : await ctx.admin
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

      // Recheck after insertion as another coach can add at the same time. Undo only this new membership if full.
      const finalCount=await ctx.admin.from("institutional_selection_players").select("id",{count:"exact",head:true}).eq("selection_id",selectionId).eq("status","active");
      if(finalCount.error || (finalCount.count||0)>maxPlayers){
        const undo=await ctx.admin.from("institutional_selection_players").delete().eq("selection_id",selectionId).eq("player_id",playerId);
        if(undo.error)throw new Error(undo.error.message);
        return NextResponse.json({error:finalCount.error?.message||`Sélection complète : ${maxPlayers} joueurs maximum. Cet ajout n’a pas été conservé.`},{status:409});
      }
      return NextResponse.json({
        ok: true,
        teamId: selection.team_id,
        teamPlayerId,
      });
    } catch (error: any) {
      return NextResponse.json(
        { error: String(error?.message||"").includes("TEAM_PLAYER_LIMIT_REACHED") ? "La limite de l’équipe est atteinte. Pour un groupe de détection ou d’entraînement, utilise le bouton dédié : les joueurs restent dans la base, sans création d’un effectif d’équipe." : error?.message || "Ajout impossible" },
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
