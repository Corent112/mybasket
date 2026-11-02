import { NextResponse } from "next/server";
import {
  canManageSport,
  institutionalSportActor,
  resolveOrInviteUser,
} from "@/lib/institutionnel/sport-access-server";

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const structureId = String(body.structureId || "");
  const scope = String(body.scope || "");

  if (!structureId || !scope) {
    return NextResponse.json({ error: "Données manquantes" }, { status: 400 });
  }

  const ctx = await institutionalSportActor(structureId);
  if ("error" in ctx) return ctx.error;

  if (!canManageSport(ctx.member)) {
    return NextResponse.json({ error: "Droits insuffisants" }, { status: 403 });
  }

  const origin = new URL(req.url).origin;

  if (scope === "team" || scope === "selection" || scope === "partner") {
    const email = String(body.email || "").trim().toLowerCase();
    const role = String(body.role || "Coach").trim() || "Coach";
    const accessLevel = String(body.accessLevel || "premium");

    if (!email.includes("@")) {
      return NextResponse.json({ error: "Email invalide" }, { status: 400 });
    }

    let teamId = String(body.teamId || "");

    if (scope === "selection") {
      const selectionId = String(body.selectionId || "");
      const { data: selection } = await ctx.admin
        .from("institutional_selections")
        .select("team_id")
        .eq("id", selectionId)
        .eq("structure_id", structureId)
        .maybeSingle();

      teamId = String(selection?.team_id || "");
    }

    if (!teamId) {
      return NextResponse.json(
        { error: "Équipe ou sélection introuvable" },
        { status: 404 }
      );
    }

    // A structure member must never grant access to an arbitrary team UUID.
    const link=scope==="partner"
      ? await ctx.admin.from("institutional_pole_teams").select("id").eq("structure_id",structureId).eq("team_id",teamId).eq("team_kind","partner").eq("active",true).maybeSingle()
      : await ctx.admin.from("institutional_team_links").select("id").eq("structure_id",structureId).eq("team_id",teamId).maybeSingle();
    if(link.error||!link.data)return NextResponse.json({error:"Cette équipe n’appartient pas à cette institution."},{status:403});
    if(scope==="partner"){
      const team=await ctx.admin.from("teams").select("metadata").eq("id",teamId).single();
      if(team.error||!team.data.metadata?.institutionPartnerStaff?.some((s:any)=>s.email===email&&s.role===role))return NextResponse.json({error:"Choisis un membre du staff enregistré pour cette équipe."},{status:400});
    }
    try {
      const { userId, invited } = await resolveOrInviteUser(
        ctx.admin,
        email,
        `${origin}/equipes/${teamId}`
      );

      const write = await ctx.admin
        .from("institutional_team_staff")
        .upsert(
          {
            structure_id: structureId,
            team_id: teamId,
            email,
            user_id: userId,
            role,
            access_level: accessLevel,
            status: "active",
            created_by: ctx.user.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "team_id,email" }
        );

      if (write.error) {
        return NextResponse.json({ error: write.error.message }, { status: 400 });
      }

      if(scope==="partner") {
        const membership=await ctx.admin.from("team_members").upsert({team_id:teamId,user_id:userId,role,status:"active",permissions:{view_team:true,players:true,sessions:true,livestats:true,media:true,rpe:true,rpe_individual:true,rpe_group:true},invited_by:ctx.user.id,updated_at:new Date().toISOString()},{onConflict:"team_id,user_id"});
        if(membership.error)return NextResponse.json({error:"Le staff est enregistré mais l’accès équipe n’a pas pu être activé. Réessaie."},{status:400});
        // Only a newly created institution partner can be handed to its registered head coach.
        // Existing partner club ownership is never reassigned by this activation flow.
        if(role==="Coach principal"){
          const pending=await ctx.admin.from("teams").select("metadata,user_id").eq("id",teamId).single();
          if(pending.error)return NextResponse.json({error:"Accès activé, finalisation du responsable impossible. Réessaie."},{status:400});
          if(pending.data.metadata?.institutionPartnerOwnerPending===true){
            const handover=await ctx.admin.from("teams").update({user_id:userId,metadata:{...pending.data.metadata,institutionPartnerOwnerPending:false},updated_at:new Date().toISOString()}).eq("id",teamId).eq("user_id",pending.data.user_id);
            if(handover.error)return NextResponse.json({error:"Accès activé, finalisation du responsable impossible. Réessaie."},{status:400});
          }
        }
      }
      return NextResponse.json({ ok: true, invited, userId });
    } catch (error: any) {
      return NextResponse.json(
        { error: error?.message || "Invitation impossible" },
        { status: 400 }
      );
    }
  }

  if (scope === "player_account") {
    const playerId = String(body.playerId || "");
    const email = String(body.email || "").trim().toLowerCase();

    if (!playerId || !email.includes("@")) {
      return NextResponse.json(
        { error: "Joueur ou email invalide" },
        { status: 400 }
      );
    }

    const { data: player } = await ctx.admin
      .from("institutional_players")
      .select("id")
      .eq("id", playerId)
      .eq("structure_id", structureId)
      .maybeSingle();

    if (!player) {
      return NextResponse.json({ error: "Joueur introuvable" }, { status: 404 });
    }

    try {
      const { userId, invited } = await resolveOrInviteUser(
        ctx.admin,
        email,
        `${origin}/mon-compte`
      );

      const write = await ctx.admin
        .from("institutional_players")
        .update({
          linked_user_id: userId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", playerId)
        .eq("structure_id", structureId);

      if (write.error) {
        return NextResponse.json({ error: write.error.message }, { status: 400 });
      }

      return NextResponse.json({ ok: true, invited, userId });
    } catch (error: any) {
      return NextResponse.json(
        { error: error?.message || "Association impossible" },
        { status: 400 }
      );
    }
  }

  return NextResponse.json({ error: "Type d’accès inconnu" }, { status: 400 });
}
