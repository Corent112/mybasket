import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

type Ctx = {
  user: any;
  db: any;
  structure: {
    id: string;
    name: string;
    short_name?: string | null;
    structure_type: string;
    season_label?: string | null;
  };
};

async function getCtx(structureId: string): Promise<Ctx | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const db = createAdminClient() || supabase;
  const [membership, structure] = await Promise.all([
    db
      .from("institutional_members")
      .select("id,role,permissions")
      .eq("structure_id", structureId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle(),
    db
      .from("institutional_structures")
      .select("id,name,short_name,structure_type,season_label")
      .eq("id", structureId)
      .maybeSingle(),
  ]);

  if (!membership.data || !structure.data) return null;
  if (!["league", "pole"].includes(String(structure.data.structure_type))) return null;

  return { user, db, structure: structure.data };
}

function poleTeamName(structure: Ctx["structure"]) {
  const raw = String(structure.name || structure.short_name || "Institution").trim();
  if (/^p[oô]le\b/i.test(raw)) return raw;
  return `Pôle ${raw}`;
}

async function ensurePoleTeam(ctx: Ctx) {
  const season = String(ctx.structure.season_label || "2026-2027");
  const expectedName = poleTeamName(ctx.structure);

  // 1. Priorité à l'ancien moteur Pôle / Performance s'il existe déjà.
  const oldLink = await ctx.db
    .from("institutional_pole_teams")
    .select("id,team_id,season_label")
    .eq("structure_id", ctx.structure.id)
    .eq("team_kind", "pole")
    .eq("active", true)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  let teamId = oldLink.data?.team_id ? String(oldLink.data.team_id) : "";

  // 2. Sinon on réutilise l'équipe principale du lot Institution.
  if (!teamId) {
    const primary = await ctx.db
      .from("institutional_team_links")
      .select("id,team_id,season_label")
      .eq("structure_id", ctx.structure.id)
      .eq("kind", "primary")
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    teamId = primary.data?.team_id ? String(primary.data.team_id) : "";
  }

  // 3. Aucune équipe : création automatique d'UNE équipe Pôle.
  if (!teamId) {
    const created = await ctx.db
      .from("teams")
      .insert({
        user_id: ctx.user.id,
        team_type: "coached",
        name: expectedName,
        club_name: expectedName,
        category: null,
        coach_name: ctx.structure.name,
        metadata: {
          institutionManaged: true,
          institutionalStructureId: ctx.structure.id,
          institutionalTeamKind: "pole",
          institutionKind: "primary",
          institutionAllAccess: true,
          seasonLabel: season,
          createdFrom: "institution_pole_roster_v3",
        },
      })
      .select("id")
      .single();

    if (created.error) throw new Error(created.error.message);
    teamId = String(created.data.id);

    // Les deux tables de liaison sont alimentées pour rester compatibles
    // avec les écrans historiques sans créer une deuxième équipe.
    await ctx.db.from("institutional_pole_teams").insert({
      structure_id: ctx.structure.id,
      team_id: teamId,
      team_kind: "pole",
      season_label: season,
      active: true,
      created_by: ctx.user.id,
    });

    await ctx.db.from("institutional_team_links").insert({
      structure_id: ctx.structure.id,
      team_id: teamId,
      kind: "primary",
      label: expectedName,
      season_label: season,
      created_by: ctx.user.id,
    });
  }

  // Le nom n'est plus libre : Pôle + nom de l'Institution.
  const current = await ctx.db
    .from("teams")
    .select("id,name,club_name,category,coach_name,metadata")
    .eq("id", teamId)
    .single();

  if (current.error) throw new Error(current.error.message);

  const metadata =
    current.data.metadata && typeof current.data.metadata === "object"
      ? current.data.metadata
      : {};

  if (
    current.data.name !== expectedName ||
    current.data.club_name !== expectedName
  ) {
    await ctx.db
      .from("teams")
      .update({
        name: expectedName,
        club_name: expectedName,
        metadata: {
          ...metadata,
          institutionManaged: true,
          institutionalStructureId: ctx.structure.id,
          institutionalTeamKind: "pole",
          institutionKind: "primary",
          institutionAllAccess: true,
        },
        updated_at: new Date().toISOString(),
      })
      .eq("id", teamId);
  }

  return {
    ...current.data,
    id: teamId,
    name: expectedName,
    club_name: expectedName,
  };
}

export async function GET(req: Request) {
  const structureId =
    new URL(req.url).searchParams.get("structureId") || "";
  if (!structureId) {
    return NextResponse.json({ error: "structureId manquant" }, { status: 400 });
  }

  const ctx = await getCtx(structureId);
  if (!ctx) {
    return NextResponse.json(
      { error: "Accès Pôle non autorisé." },
      { status: 403 }
    );
  }

  try {
    const poleTeam = await ensurePoleTeam(ctx);

    // SOURCE UNIQUE DES POLISTES :
    // l'effectif réel de l'équipe Pôle. Aucun institutional_players nécessaire
    // pour décider si quelqu'un est ou non poliste.
    const playersQuery = await ctx.db
      .from("players")
      .select(
        "id,team_id,first_name,last_name,number,photo_url,position_primary,position_secondary,birth_date,height,weight,dominant_hand,status,license_number,metadata,updated_at"
      )
      .eq("team_id", poleTeam.id)
      .order("last_name", { ascending: true });

    if (playersQuery.error) throw new Error(playersQuery.error.message);

    // Les partenaires historiques restent visibles, mais l'Institution
    // ne reçoit ici aucun droit d'administration.
    const partnerLinks = await ctx.db
      .from("institutional_pole_teams")
      .select("id,team_id,season_label,created_at")
      .eq("structure_id", structureId)
      .eq("team_kind", "partner")
      .eq("active", true)
      .order("created_at", { ascending: false });

    const partnerIds = (partnerLinks.data || [])
      .map((x: any) => String(x.team_id || ""))
      .filter(Boolean);

    const partners = partnerIds.length
      ? await ctx.db
          .from("teams")
          .select("id,name,club_name,category,coach_name,club_logo_url,metadata")
          .in("id", partnerIds)
      : { data: [], error: null };

    if (partners.error) throw new Error(partners.error.message);

    const partnerById = new Map(
      (partners.data || []).map((team: any) => [String(team.id), team])
    );

    return NextResponse.json({
      structure: ctx.structure,
      poleTeam,
      players: playersQuery.data || [],
      partners: (partnerLinks.data || []).map((link: any) => ({
        ...link,
        team: partnerById.get(String(link.team_id)) || null,
        access: "consultation",
      })),
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || "Chargement impossible." },
      { status: 400 }
    );
  }
}
