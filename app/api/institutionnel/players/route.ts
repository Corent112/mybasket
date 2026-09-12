import { NextResponse } from "next/server";
import {
  canManageSport,
  institutionalSportActor,
} from "@/lib/institutionnel/sport-access-server";

const PLAYER_SELECT =
  "id,structure_id,first_name,last_name,birthdate,sex,email,phone,photo_url,club_name,category,status,archived,height_cm,weight_kg,wingspan_cm,father_height_cm,mother_height_cm,school,class_name,position_primary,position_secondary,dominant_hand,license_number,tutor1_phone,tutor1_email,tutor2_phone,tutor2_email,profile_data,updated_at";

function clean(value: unknown) {
  const text = String(value ?? "").trim();
  return text || null;
}

function numberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(String(value).replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

function lifecycle(profileData: any, archived: boolean) {
  const raw = String(profileData?.lifecycle?.workflowStatus || "");
  if (raw === "reviewing" || raw === "validated" || raw === "archived") return raw;
  return archived ? "archived" : "validated";
}

async function actor(structureId: string) {
  const ctx = await institutionalSportActor(structureId);
  if ("error" in ctx) return ctx;
  if (!canManageSport(ctx.member)) {
    return {
      error: NextResponse.json({ error: "Droits insuffisants" }, { status: 403 }),
    } as const;
  }
  return ctx;
}

export async function GET(req: Request) {
  const structureId = new URL(req.url).searchParams.get("structureId") || "";
  if (!structureId) {
    return NextResponse.json({ error: "structureId manquant" }, { status: 400 });
  }

  const ctx = await actor(structureId);
  if ("error" in ctx) return ctx.error;

  const [{ data: players, error: pe }, { data: referrals, error: re }] =
    await Promise.all([
      ctx.admin
        .from("institutional_players")
        .select(PLAYER_SELECT)
        .eq("structure_id", structureId)
        .order("last_name"),
      ctx.admin
        .from("institutional_player_referrals")
        .select("*")
        .eq("structure_id", structureId)
        .order("created_at", { ascending: false }),
    ]);

  if (pe || re) {
    return NextResponse.json(
      { error: pe?.message || re?.message || "Lecture impossible" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    players: (players || []).map((p: any) => ({
      ...p,
      workflow_status: lifecycle(p.profile_data, Boolean(p.archived)),
    })),
    referrals: referrals || [],
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const structureId = String(body.structureId || "");
  const action = String(body.action || "");

  if (!structureId || !action) {
    return NextResponse.json({ error: "Données manquantes" }, { status: 400 });
  }

  const ctx = await actor(structureId);
  if ("error" in ctx) return ctx.error;

  if (action === "mark_referral_reviewing") {
    const referralId = String(body.referralId || "");
    const q = await ctx.admin
      .from("institutional_player_referrals")
      .update({ status: "reviewing", updated_at: new Date().toISOString() })
      .eq("id", referralId)
      .eq("structure_id", structureId)
      .is("converted_player_id", null);
    if (q.error) return NextResponse.json({ error: q.error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "reject_referral" || action === "dismiss_referral") {
    const referralId = String(body.referralId || "");
    const q = await ctx.admin
      .from("institutional_player_referrals")
      .update({ status: "rejected", updated_at: new Date().toISOString() })
      .eq("id", referralId)
      .eq("structure_id", structureId)
      .is("converted_player_id", null);
    if (q.error) return NextResponse.json({ error: q.error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "restore_referral") {
    const referralId = String(body.referralId || "");
    const q = await ctx.admin
      .from("institutional_player_referrals")
      .update({ status: "reviewing", updated_at: new Date().toISOString() })
      .eq("id", referralId)
      .eq("structure_id", structureId)
      .is("converted_player_id", null);
    if (q.error) return NextResponse.json({ error: q.error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "validate_referral" || action === "convert_referral") {
    const referralId = String(body.referralId || "");
    if (!referralId) return NextResponse.json({ error: "Signalement manquant" }, { status: 400 });

    const { data: referral, error: referralError } = await ctx.admin
      .from("institutional_player_referrals")
      .select("*")
      .eq("id", referralId)
      .eq("structure_id", structureId)
      .maybeSingle();

    if (referralError || !referral) {
      return NextResponse.json({ error: referralError?.message || "Signalement introuvable" }, { status: 404 });
    }

    // Un signalement validé ne crée jamais deux fiches.
    if (referral.converted_player_id) {
      const existing = await ctx.admin
        .from("institutional_players")
        .select(PLAYER_SELECT)
        .eq("id", referral.converted_player_id)
        .eq("structure_id", structureId)
        .maybeSingle();
      if (existing.data) return NextResponse.json({ ok: true, player: existing.data, reused: true });
    }

    const duplicate = await ctx.admin
      .from("institutional_players")
      .select(PLAYER_SELECT)
      .eq("structure_id", structureId)
      .contains("profile_data", { sourceReferralId: referralId })
      .limit(1)
      .maybeSingle();

    if (duplicate.data) {
      await ctx.admin
        .from("institutional_player_referrals")
        .update({ status: "validated", converted_player_id: duplicate.data.id, updated_at: new Date().toISOString() })
        .eq("id", referralId);
      return NextResponse.json({ ok: true, player: duplicate.data, reused: true });
    }

    const firstName = clean(referral.first_name) || "À identifier";
    const lastName = clean(referral.last_name) || (clean(referral.jersey_number) ? `Joueur #${clean(referral.jersey_number)}` : "Joueur signalé");
    const profileData = {
      sourceReferralId: referral.id,
      origin: "referral",
      lifecycle: {
        workflowStatus: "validated",
        validatedAt: new Date().toISOString(),
        validatedBy: ctx.user.id,
      },
      // Même socle d'informations que la création d'un joueur dans Mes équipes.
      position: null,
      secondaryPosition: null,
      jerseyNumber: referral.jersey_number || null,
      jerseyColor: referral.jersey_color || null,
      licenseNumber: null,
      nationality: null,
      school: null,
      className: null,
      weight: null,
      dominantHand: null,
      guardian1Phone: null,
      guardian1Email: null,
      guardian2Phone: null,
      guardian2Email: null,
      observations: referral.reason || null,
      provenance: `Signalement du ${new Date(referral.created_at).toLocaleDateString("fr-FR")}`,
      referralSnapshot: referral,
    };

    const created = await ctx.admin
      .from("institutional_players")
      .insert({
        structure_id: structureId,
        first_name: firstName,
        last_name: lastName,
        birthdate: referral.birthdate || null,
        club_name: referral.club_name || null,
        category: referral.category || null,
        status: "followed",
        archived: false,
        position_primary: null,
        position_secondary: null,
        dominant_hand: null,
        license_number: null,
        school: null,
        class_name: null,
        tutor1_phone: null,
        tutor1_email: null,
        tutor2_phone: null,
        tutor2_email: null,
        profile_data: profileData,
        created_by: ctx.user.id,
      })
      .select(PLAYER_SELECT)
      .single();

    if (created.error) return NextResponse.json({ error: created.error.message }, { status: 400 });

    const linked = await ctx.admin
      .from("institutional_player_referrals")
      .update({ status: "validated", converted_player_id: created.data.id, updated_at: new Date().toISOString() })
      .eq("id", referral.id);

    if (linked.error) {
      await ctx.admin.from("institutional_players").delete().eq("id", created.data.id);
      return NextResponse.json({ error: linked.error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, player: created.data });
  }

  const playerId = String(body.playerId || "");
  if (!playerId) {
    return NextResponse.json({ error: "Joueur manquant" }, { status: 400 });
  }

  const current = await ctx.admin
    .from("institutional_players")
    .select(PLAYER_SELECT)
    .eq("id", playerId)
    .eq("structure_id", structureId)
    .maybeSingle();

  if (current.error || !current.data) {
    return NextResponse.json(
      { error: current.error?.message || "Joueur introuvable" },
      { status: 404 }
    );
  }

  const oldProfile = current.data.profile_data || {};

  if (action === "save_player" || action === "validate_player") {
    const patch = body.player || {};
    const previousStatus = lifecycle(oldProfile, Boolean(current.data.archived));
    const nextStatus = action === "validate_player" ? "validated" : previousStatus;
    const profileExtra = patch.profile_extra && typeof patch.profile_extra === "object" ? patch.profile_extra : {};
    const nextProfile = {
      ...oldProfile,
      ...profileExtra,
      position: clean(patch.position) ?? oldProfile.position ?? null,
      secondaryPosition: clean(patch.secondary_position) ?? oldProfile.secondaryPosition ?? null,
      jerseyNumber: clean(patch.jersey_number) ?? oldProfile.jerseyNumber ?? null,
      jerseyColor: clean(patch.jersey_color) ?? oldProfile.jerseyColor ?? null,
      licenseNumber: clean(patch.license_number) ?? oldProfile.licenseNumber ?? null,
      nationality: clean(patch.nationality) ?? oldProfile.nationality ?? null,
      school: clean(patch.school) ?? oldProfile.school ?? null,
      className: clean(patch.class_name) ?? oldProfile.className ?? null,
      weight: clean(patch.weight_kg ?? patch.weight) ?? oldProfile.weight ?? null,
      dominantHand: clean(patch.dominant_hand) ?? oldProfile.dominantHand ?? null,
      guardian1Phone: clean(patch.tutor1_phone ?? patch.guardian1_phone) ?? oldProfile.guardian1Phone ?? null,
      guardian1Email: clean(patch.tutor1_email ?? patch.guardian1_email) ?? oldProfile.guardian1Email ?? null,
      guardian2Phone: clean(patch.tutor2_phone ?? patch.guardian2_phone) ?? oldProfile.guardian2Phone ?? null,
      guardian2Email: clean(patch.tutor2_email ?? patch.guardian2_email) ?? oldProfile.guardian2Email ?? null,
      observations: clean(patch.observations) ?? oldProfile.observations ?? null,
      provenance: clean(patch.provenance) || oldProfile.provenance || null,
      lifecycle: {
        ...(oldProfile.lifecycle || {}),
        workflowStatus: nextStatus,
        lastSavedAt: new Date().toISOString(),
        ...(action === "validate_player"
          ? { validatedAt: new Date().toISOString(), validatedBy: ctx.user.id }
          : {}),
      },
    };

    const firstName = clean(patch.first_name) || "À identifier";
    const lastName = clean(patch.last_name) || "Joueur signalé";

    const updated = await ctx.admin
      .from("institutional_players")
      .update({
        first_name: firstName,
        last_name: lastName,
        birthdate: clean(patch.birthdate),
        club_name: clean(patch.club_name),
        category: clean(patch.category),
        email: clean(patch.email),
        phone: clean(patch.phone),
        sex: clean(patch.sex),
        photo_url: clean(patch.photo_url),
        height_cm: numberOrNull(patch.height_cm),
        weight_kg: numberOrNull(patch.weight_kg ?? patch.weight),
        wingspan_cm: numberOrNull(patch.wingspan_cm),
        father_height_cm: numberOrNull(patch.father_height_cm),
        mother_height_cm: numberOrNull(patch.mother_height_cm),
        school: clean(patch.school),
        class_name: clean(patch.class_name),
        position_primary: clean(patch.position),
        position_secondary: clean(patch.secondary_position),
        dominant_hand: clean(patch.dominant_hand),
        license_number: clean(patch.license_number),
        tutor1_phone: clean(patch.tutor1_phone ?? patch.guardian1_phone),
        tutor1_email: clean(patch.tutor1_email ?? patch.guardian1_email),
        tutor2_phone: clean(patch.tutor2_phone ?? patch.guardian2_phone),
        tutor2_email: clean(patch.tutor2_email ?? patch.guardian2_email),
        profile_data: nextProfile,
        archived: action === "validate_player" ? false : current.data.archived,
        updated_at: new Date().toISOString(),
      })
      .eq("id", playerId)
      .select(PLAYER_SELECT)
      .single();

    if (updated.error) {
      return NextResponse.json({ error: updated.error.message }, { status: 400 });
    }
    return NextResponse.json({ ok: true, player: updated.data });
  }

  if (action === "archive_player") {
    const nextProfile = {
      ...oldProfile,
      lifecycle: {
        ...(oldProfile.lifecycle || {}),
        workflowStatus: "archived",
        archivedAt: new Date().toISOString(),
        archivedBy: ctx.user.id,
      },
    };
    const q = await ctx.admin
      .from("institutional_players")
      .update({ archived: true, profile_data: nextProfile, updated_at: new Date().toISOString() })
      .eq("id", playerId);
    if (q.error) return NextResponse.json({ error: q.error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "restore_player") {
    const nextProfile = {
      ...oldProfile,
      lifecycle: {
        ...(oldProfile.lifecycle || {}),
        workflowStatus: "validated",
        restoredAt: new Date().toISOString(),
        restoredBy: ctx.user.id,
      },
    };
    const q = await ctx.admin
      .from("institutional_players")
      .update({ archived: false, profile_data: nextProfile, updated_at: new Date().toISOString() })
      .eq("id", playerId);
    if (q.error) return NextResponse.json({ error: q.error.message }, { status: 400 });
    return NextResponse.json({ ok: true });
  }

  if (action === "delete_player") {
    const linkedReferrals = await ctx.admin
      .from("institutional_player_referrals")
      .select("id,status")
      .eq("structure_id", structureId)
      .eq("converted_player_id", playerId);

    if (linkedReferrals.error) {
      return NextResponse.json({ error: linkedReferrals.error.message }, { status: 400 });
    }

    if ((linkedReferrals.data || []).length) {
      const unlink = await ctx.admin
        .from("institutional_player_referrals")
        .update({
          converted_player_id: null,
          status: "dismissed",
          updated_at: new Date().toISOString(),
        })
        .eq("structure_id", structureId)
        .eq("converted_player_id", playerId);
      if (unlink.error) {
        return NextResponse.json({ error: unlink.error.message }, { status: 400 });
      }
    }

    const deleted = await ctx.admin
      .from("institutional_players")
      .delete()
      .eq("id", playerId)
      .eq("structure_id", structureId);

    if (deleted.error) {
      // On restaure le rattachement du signalement si une contrainte historique empêche
      // la suppression. L'utilisateur pourra alors archiver sans perdre l'historique.
      for (const ref of linkedReferrals.data || []) {
        await ctx.admin
          .from("institutional_player_referrals")
          .update({
            converted_player_id: playerId,
            status: ref.status || "converted",
            updated_at: new Date().toISOString(),
          })
          .eq("id", ref.id);
      }
      return NextResponse.json(
        {
          error:
            "Cette fiche possède déjà un historique lié et ne peut pas être supprimée proprement. Archive-la pour conserver les données.",
          detail: deleted.error.message,
        },
        { status: 409 }
      );
    }
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
}
