import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

type Ctx = { user: any; db: any; structure: any };

async function getCtx(structureId: string): Promise<Ctx | null> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const db = createAdminClient() || supabase;
  const [membership, structure] = await Promise.all([
    db.from("institutional_members").select("id,role,permissions").eq("structure_id", structureId).eq("user_id", user.id).eq("status", "active").maybeSingle(),
    db.from("institutional_structures").select("id,name,structure_type,season_label").eq("id", structureId).maybeSingle(),
  ]);
  if (!membership.data || !structure.data || structure.data.structure_type !== "league") return null;
  return { user, db, structure: structure.data };
}

async function ensureSeason(db: any, structureId: string, seasonLabel: string, userId: string) {
  const existing = await db.from("institutional_player_tracking_seasons").select("id,season_label").eq("structure_id", structureId).eq("season_label", seasonLabel).maybeSingle();
  if (existing.data) return existing.data;
  const created = await db.from("institutional_player_tracking_seasons").insert({ structure_id: structureId, season_label: seasonLabel, created_by: userId }).select("id,season_label").single();
  if (created.error) throw new Error(created.error.message);
  return created.data;
}

async function teamRowsForLinks(db: any, links: any[]) {
  const ids = Array.from(new Set((links || []).map((x: any) => String(x.team_id || "")).filter(Boolean)));
  if (!ids.length) return [];
  const q = await db.from("teams").select("id,name,club_name,category,coach_name,user_id,club_logo_url,metadata,created_at").in("id", ids).order("created_at", { ascending: false });
  if (q.error) throw new Error(q.error.message);
  return q.data || [];
}

function cleanNumber(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const structureId = url.searchParams.get("structureId") || "";
  const ctx = await getCtx(structureId);
  if (!ctx) return NextResponse.json({ error: "Pôle / Performance est réservé aux Ligues." }, { status: 403 });

  try {
    const [links, seasons, memberships, playerLinks, grants, invitations] = await Promise.all([
      ctx.db.from("institutional_pole_teams").select("*").eq("structure_id", structureId).eq("active", true).order("created_at", { ascending: false }),
      ctx.db.from("institutional_player_tracking_seasons").select("id,season_label,start_date,end_date").eq("structure_id", structureId).eq("archived", false).order("season_label", { ascending: false }),
      ctx.db.from("institutional_pole_player_memberships").select("*,institutional_players(*)").eq("structure_id", structureId).eq("active", true).order("created_at"),
      ctx.db.from("institutional_pole_player_team_links").select("*").eq("structure_id", structureId).eq("active", true),
      ctx.db.from("institutional_pole_partner_grants").select("*").eq("structure_id", structureId).order("created_at", { ascending: false }),
      ctx.db.from("institutional_pole_partner_invitations").select("id,team_id,coach_email,coach_first_name,coach_last_name,status,expires_at,created_at").eq("structure_id", structureId).order("created_at", { ascending: false }),
    ]);
    const err = links.error || seasons.error || memberships.error || playerLinks.error || grants.error || invitations.error;
    if (err) throw new Error(err.message);
    const teams = await teamRowsForLinks(ctx.db, links.data || []);
    return NextResponse.json({
      structure: ctx.structure,
      links: links.data || [],
      teams,
      seasons: seasons.data || [],
      memberships: memberships.data || [],
      playerLinks: playerLinks.data || [],
      grants: grants.data || [],
      invitations: invitations.data || [],
    });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Chargement impossible." }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const structureId = String(body.structureId || "");
  const ctx = await getCtx(structureId);
  if (!ctx) return NextResponse.json({ error: "Pôle / Performance est réservé aux Ligues." }, { status: 403 });

  try {
    if (body.action === "createTeam") {
      const teamKind = String(body.teamKind || "");
      const name = String(body.name || "").trim();
      const clubName = String(body.clubName || name).trim();
      const category = String(body.category || "").trim();
      const seasonLabel = String(body.seasonLabel || ctx.structure.season_label || "").trim();
      if (!name || !seasonLabel || !["pole", "partner"].includes(teamKind)) throw new Error("Nom, saison et type d'équipe obligatoires.");
      await ensureSeason(ctx.db, structureId, seasonLabel, ctx.user.id);

      const created = await ctx.db.from("teams").insert({
        user_id: ctx.user.id,
        team_type: "coached",
        name,
        club_name: clubName || name,
        category: category || null,
        coach_name: teamKind === "pole" ? ctx.structure.name : "Coach principal à inviter",
        metadata: {
          institutionalStructureId: structureId,
          institutionalTeamKind: teamKind,
          institutionalSupervisor: ctx.user.id,
          seasonLabel,
          createdFrom: "league_pole_performance",
        },
      }).select("id,name,category").single();
      if (created.error) throw new Error(created.error.message);

      const link = await ctx.db.from("institutional_pole_teams").insert({
        structure_id: structureId,
        team_id: created.data.id,
        team_kind: teamKind,
        season_label: seasonLabel,
        active: true,
        created_by: ctx.user.id,
      });
      if (link.error) {
        await ctx.db.from("teams").delete().eq("id", created.data.id);
        throw new Error(link.error.message);
      }

      if (teamKind === "partner") {
        await ctx.db.from("team_members").upsert({
          team_id: created.data.id,
          user_id: ctx.user.id,
          role: "institution_supervisor",
          status: "active",
          permissions: {
            view_team: true,
            players: false,
            sessions: false,
            livestats: false,
            media: false,
            rpe: false,
            rpe_individual: true,
            rpe_group: true,
            institution_supervisor: true,
          },
          invited_by: ctx.user.id,
          updated_at: new Date().toISOString(),
        }, { onConflict: "team_id,user_id" });
      }
      return NextResponse.json({ ok: true, teamId: created.data.id });
    }

    if (body.action === "createPlayer") {
      const poleTeamId = String(body.poleTeamId || "");
      const seasonLabel = String(body.seasonLabel || ctx.structure.season_label || "").trim();
      const firstName = String(body.firstName || "").trim();
      const lastName = String(body.lastName || "").trim();
      if (!poleTeamId || !seasonLabel || !firstName || !lastName) throw new Error("Équipe Pôle, saison, prénom et nom sont obligatoires.");
      const poleLink = await ctx.db.from("institutional_pole_teams").select("id").eq("structure_id", structureId).eq("team_id", poleTeamId).eq("team_kind", "pole").eq("active", true).maybeSingle();
      if (!poleLink.data) throw new Error("Équipe Pôle invalide.");
      const season = await ensureSeason(ctx.db, structureId, seasonLabel, ctx.user.id);
      const team = await ctx.db.from("teams").select("id,user_id").eq("id", poleTeamId).single();
      if (team.error) throw new Error(team.error.message);

      const playerPayload: any = {
        structure_id: structureId,
        first_name: firstName,
        last_name: lastName,
        birthdate: body.birthdate || null,
        sex: body.sex || null,
        email: body.email || null,
        phone: body.phone || null,
        photo_url: body.photoUrl || null,
        club_name: body.clubName || null,
        category: body.category || null,
        years_basket: cleanNumber(body.yearsBasket),
        height_cm: cleanNumber(body.heightCm),
        weight_kg: cleanNumber(body.weightKg),
        wingspan_cm: cleanNumber(body.wingspanCm),
        father_height_cm: cleanNumber(body.fatherHeightCm),
        mother_height_cm: cleanNumber(body.motherHeightCm),
        position_primary: body.positionPrimary || null,
        position_secondary: body.positionSecondary || null,
        dominant_hand: body.dominantHand || null,
        license_number: body.licenseNumber || null,
        school: body.school || null,
        class_name: body.className || null,
        address: body.address || null,
        postal_code: body.postalCode || null,
        city: body.city || null,
        tutor1_name: body.tutor1Name || null,
        tutor1_email: body.tutor1Email || null,
        tutor1_phone: body.tutor1Phone || null,
        tutor2_name: body.tutor2Name || null,
        tutor2_email: body.tutor2Email || null,
        tutor2_phone: body.tutor2Phone || null,
        status: "followed",
        archived: false,
        created_by: ctx.user.id,
      };
      const ip = await ctx.db.from("institutional_players").insert(playerPayload).select("*").single();
      if (ip.error) throw new Error(ip.error.message);

      const roster = await ctx.db.from("players").insert({
        user_id: team.data.user_id,
        team_id: poleTeamId,
        first_name: firstName,
        last_name: lastName,
        birth_date: body.birthdate || null,
        photo_url: body.photoUrl || null,
        position_primary: body.positionPrimary || "",
        position_secondary: body.positionSecondary || "",
        height: body.heightCm ? String(body.heightCm) : "",
        weight: body.weightKg ? String(body.weightKg) : "",
        dominant_hand: body.dominantHand || "",
        status: "Disponible",
        license_number: body.licenseNumber || null,
        tutor1_phone: body.tutor1Phone || null,
        tutor1_email: body.tutor1Email || null,
        tutor2_phone: body.tutor2Phone || null,
        tutor2_email: body.tutor2Email || null,
        presence_pct: 0,
        punctuality_pct: 0,
        metadata: {
          institutionalPolePlayerId: ip.data.id,
          polePlayer: true,
          poleProtected: true,
          sex: body.sex || null,
          school: body.school || "",
          className: body.className || "",
          club: body.clubName || "",
          category: body.category || "",
          wingspanCm: cleanNumber(body.wingspanCm),
        },
      }).select("id").single();
      if (roster.error) {
        await ctx.db.from("institutional_players").delete().eq("id", ip.data.id);
        throw new Error(roster.error.message);
      }

      const membership = await ctx.db.from("institutional_pole_player_memberships").insert({
        structure_id: structureId,
        institutional_player_id: ip.data.id,
        season_id: season.id,
        pole_team_id: poleTeamId,
        pole_player_id: roster.data.id,
        active: true,
        created_by: ctx.user.id,
      });
      if (membership.error) throw new Error(membership.error.message);

      if (cleanNumber(body.heightCm) || cleanNumber(body.weightKg) || cleanNumber(body.wingspanCm)) {
        await ctx.db.from("institutional_player_measurements").insert({
          structure_id: structureId,
          player_id: ip.data.id,
          season_id: season.id,
          measured_at: body.measuredAt || new Date().toISOString().slice(0, 10),
          height_cm: cleanNumber(body.heightCm),
          weight_kg: cleanNumber(body.weightKg),
          wingspan_cm: cleanNumber(body.wingspanCm),
          created_by: ctx.user.id,
        });
      }
      return NextResponse.json({ ok: true, institutionalPlayerId: ip.data.id, playerId: roster.data.id });
    }

    if (body.action === "assignPlayer") {
      const membershipId = String(body.membershipId || "");
      const partnerTeamId = String(body.partnerTeamId || "");
      const membership = await ctx.db.from("institutional_pole_player_memberships").select("*,institutional_players(*)").eq("id", membershipId).eq("structure_id", structureId).eq("active", true).single();
      if (membership.error) throw new Error(membership.error.message);
      const partnerLink = await ctx.db.from("institutional_pole_teams").select("id,season_label").eq("structure_id", structureId).eq("team_id", partnerTeamId).eq("team_kind", "partner").eq("active", true).maybeSingle();
      if (!partnerLink.data) throw new Error("Équipe partenaire invalide.");
      const team = await ctx.db.from("teams").select("id,user_id").eq("id", partnerTeamId).single();
      if (team.error) throw new Error(team.error.message);
      const x: any = membership.data.institutional_players;
      let existing = await ctx.db.from("institutional_pole_player_team_links").select("id,partner_player_id").eq("institutional_player_id", x.id).eq("partner_team_id", partnerTeamId).eq("season_id", membership.data.season_id).maybeSingle();
      let partnerPlayerId = existing.data?.partner_player_id as string | undefined;
      if (!partnerPlayerId) {
        const pp = await ctx.db.from("players").insert({
          user_id: team.data.user_id,
          team_id: partnerTeamId,
          first_name: x.first_name,
          last_name: x.last_name,
          birth_date: x.birthdate,
          photo_url: x.photo_url,
          position_primary: x.position_primary || "",
          position_secondary: x.position_secondary || "",
          height: x.height_cm ? String(x.height_cm) : "",
          weight: x.weight_kg ? String(x.weight_kg) : "",
          dominant_hand: x.dominant_hand || "",
          status: "Disponible",
          license_number: x.license_number || null,
          tutor1_phone: x.tutor1_phone || null,
          tutor1_email: x.tutor1_email || null,
          tutor2_phone: x.tutor2_phone || null,
          tutor2_email: x.tutor2_email || null,
          presence_pct: 0,
          punctuality_pct: 0,
          metadata: {
            institutionalPolePlayerId: x.id,
            poleProtected: true,
            secondaryTeam: true,
            sex: x.sex || null,
            school: x.school || "",
            className: x.class_name || "",
            club: x.club_name || "",
            category: x.category || "",
            wingspanCm: x.wingspan_cm || null,
          },
        }).select("id").single();
        if (pp.error) throw new Error(pp.error.message);
        partnerPlayerId = pp.data.id;
        const link = await ctx.db.from("institutional_pole_player_team_links").insert({
          structure_id: structureId,
          institutional_player_id: x.id,
          season_id: membership.data.season_id,
          pole_team_id: membership.data.pole_team_id,
          pole_player_id: membership.data.pole_player_id,
          partner_team_id: partnerTeamId,
          partner_player_id: partnerPlayerId,
          active: true,
          created_by: ctx.user.id,
        });
        if (link.error) throw new Error(link.error.message);
      }
      return NextResponse.json({ ok: true, partnerPlayerId });
    }

    if (body.action === "importPlayers") {
      const sourcePoleTeamId = String(body.sourcePoleTeamId || "");
      const targetPoleTeamId = String(body.targetPoleTeamId || "");
      const ids = Array.isArray(body.institutionalPlayerIds) ? body.institutionalPlayerIds.map(String) : [];
      const targetLink = await ctx.db.from("institutional_pole_teams").select("season_label").eq("structure_id", structureId).eq("team_id", targetPoleTeamId).eq("team_kind", "pole").single();
      if (targetLink.error) throw new Error(targetLink.error.message);
      const season = await ensureSeason(ctx.db, structureId, targetLink.data.season_label, ctx.user.id);
      const targetTeam = await ctx.db.from("teams").select("id,user_id").eq("id", targetPoleTeamId).single();
      if (targetTeam.error) throw new Error(targetTeam.error.message);
      const source = await ctx.db.from("institutional_pole_player_memberships").select("institutional_player_id,institutional_players(*)").eq("structure_id", structureId).eq("pole_team_id", sourcePoleTeamId).eq("active", true).in("institutional_player_id", ids);
      if (source.error) throw new Error(source.error.message);
      let imported = 0;
      for (const row of source.data || []) {
        const x: any = row.institutional_players;
        const already = await ctx.db.from("institutional_pole_player_memberships").select("id").eq("institutional_player_id", x.id).eq("pole_team_id", targetPoleTeamId).eq("season_id", season.id).maybeSingle();
        if (already.data) continue;
        const roster = await ctx.db.from("players").insert({
          user_id: targetTeam.data.user_id, team_id: targetPoleTeamId,
          first_name: x.first_name, last_name: x.last_name, birth_date: x.birthdate, photo_url: x.photo_url,
          position_primary: x.position_primary || "", position_secondary: x.position_secondary || "",
          height: x.height_cm ? String(x.height_cm) : "", weight: x.weight_kg ? String(x.weight_kg) : "",
          dominant_hand: x.dominant_hand || "", status: "Disponible", license_number: x.license_number || null,
          tutor1_phone: x.tutor1_phone || null, tutor1_email: x.tutor1_email || null,
          tutor2_phone: x.tutor2_phone || null, tutor2_email: x.tutor2_email || null,
          presence_pct: 0, punctuality_pct: 0,
          metadata: { institutionalPolePlayerId: x.id, polePlayer: true, poleProtected: true, sex: x.sex || null, school: x.school || "", className: x.class_name || "", club: x.club_name || "", category: x.category || "", wingspanCm: x.wingspan_cm || null },
        }).select("id").single();
        if (roster.error) throw new Error(roster.error.message);
        const mem = await ctx.db.from("institutional_pole_player_memberships").insert({ structure_id: structureId, institutional_player_id: x.id, season_id: season.id, pole_team_id: targetPoleTeamId, pole_player_id: roster.data.id, active: true, created_by: ctx.user.id });
        if (mem.error) throw new Error(mem.error.message);
        imported += 1;
      }
      return NextResponse.json({ ok: true, imported });
    }

    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error?.message || "Opération impossible." }, { status: 400 });
  }
}
