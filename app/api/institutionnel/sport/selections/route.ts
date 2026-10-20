import {withPlayerCategory} from "@/lib/institutionnel/player-category";
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
          "id,first_name,last_name,birthdate,club_name,category,linked_user_id,photo_url,position_primary"
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

  const capacities=teamIds.length?await ctx.admin.from("teams").select("id,metadata").in("id",teamIds):{data:[]};
  if("error" in capacities && capacities.error)return NextResponse.json({error:capacities.error.message},{status:400});
  const kindByTeam=new Map((capacities.data||[]).map((team:any)=>[team.id,team.metadata?.institutionRosterKind]));
  const targetByTeam=new Map((capacities.data||[]).map((team:any)=>[team.id,team.metadata?.institutionPreparationTargetId||null]));
  const capByTeam=new Map((capacities.data||[]).map((team:any)=>[team.id,Number(team.metadata?.institutionSelectionMaxPlayers)===10?10:12]));
  return NextResponse.json({
    selections: (selections || []).map((selection: any) => ({
      ...selection,
      preparation_target_id:targetByTeam.get(selection.team_id)||null,
      roster_kind:kindByTeam.get(selection.team_id)==="preselection"?"preselection":"selection",
      max_players:kindByTeam.get(selection.team_id)==="preselection"?null:capByTeam.get(selection.team_id)||12,
      players: (playersBySelection.get(String(selection.id)) || []).map(entry=>({...entry,player:entry.player?withPlayerCategory(entry.player,selection.season_label):null})),
      staff: staffByTeam.get(String(selection.team_id)) || [],
    })),
  });
}

export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const structureId = String(body.structureId || "");
  let name = String(body.name || "").trim();
  let category = String(body.category || "").trim();
  let seasonLabel = String(body.seasonLabel || "").trim();
  let rosterKind=body.rosterKind==="preselection"?"preselection":"selection";
  const maxPlayers = Number(body.maxPlayers || 12);
  if (![10,12].includes(maxPlayers)) return NextResponse.json({error:"Choisis un maximum de 10 ou 12 joueurs"},{status:400});
  let gender = String(body.gender || "").trim() || null;

  if (!structureId) {
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

  let preparationTargetId=String(body.preparationTargetId||'');
  if(body.action==='ensure_preparation'||body.action==='link_preparation'){
    preparationTargetId=String(body.targetSelectionId||'');
    const target=await ctx.admin.from('institutional_selections').select('id,team_id,name,category,gender,season_label').eq('id',preparationTargetId).eq('structure_id',structureId).neq('status','archived').maybeSingle();
    if(target.error||!target.data)return NextResponse.json({error:'Sélection cible introuvable dans cette institution'},{status:404});
    const targetTeam=await ctx.admin.from('teams').select('metadata').eq('id',target.data.team_id).maybeSingle();
    if(targetTeam.error||!targetTeam.data||targetTeam.data.metadata?.institutionRosterKind==='preselection')return NextResponse.json({error:'Choisis une sélection finale comme équipe cible'},{status:400});
    if(body.action==='link_preparation'){
      const group=await ctx.admin.from('institutional_selections').select('id,team_id,category,gender,season_label').eq('id',String(body.selectionId||'')).eq('structure_id',structureId).neq('status','archived').maybeSingle();
      if(group.error||!group.data)return NextResponse.json({error:'Groupe de préparation introuvable'},{status:404});
      const team=await ctx.admin.from('teams').select('metadata').eq('id',group.data.team_id).maybeSingle();
      if(team.error||!team.data||team.data.metadata?.institutionRosterKind!=='preselection')return NextResponse.json({error:'Ce groupe doit être une présélection'},{status:400});
      const sourceGroup=group.data,targetSelection=target.data;
      const age=(value:string|null)=>value?.match(/U\d+/i)?.[0].toUpperCase()||value?.trim().toUpperCase()||'';
      const sourceAge=age(sourceGroup.category),targetAge=age(targetSelection.category);
      if((sourceAge&&targetAge&&sourceAge!==targetAge&&!(sourceAge==='U12'&&targetAge==='U13'))||(['gender','season_label'] as const).some(key=>sourceGroup[key]&&targetSelection[key]&&sourceGroup[key]!==targetSelection[key]))return NextResponse.json({error:'La catégorie, le sexe et la saison doivent correspondre à la sélection cible'},{status:400});
      if(team.data.metadata.institutionPreparationTargetId&&team.data.metadata.institutionPreparationTargetId!==preparationTargetId)return NextResponse.json({error:'Ce groupe prépare déjà une autre sélection. Aucun historique n’a été déplacé.'},{status:409});
      const write=await ctx.admin.from('teams').update({metadata:{...team.data.metadata,institutionPreparationTargetId:preparationTargetId}}).eq('id',group.data.team_id);
      if(write.error)return NextResponse.json({error:write.error.message},{status:400});return NextResponse.json({ok:true,selection:group.data});
    }
    const groups=await ctx.admin.from('institutional_selections').select('id,team_id').eq('structure_id',structureId).neq('status','archived');if(groups.error)return NextResponse.json({error:groups.error.message},{status:400});
    const ids=(groups.data||[]).map((group:any)=>group.team_id).filter(Boolean);
    const teams=ids.length?await ctx.admin.from('teams').select('id,metadata').in('id',ids):{data:[],error:null};if(teams.error)return NextResponse.json({error:teams.error.message},{status:400});
    const existing=(teams.data||[]).find((team:any)=>team.metadata?.institutionRosterKind==='preselection'&&team.metadata?.institutionPreparationTargetId===preparationTargetId);
    if(existing)return NextResponse.json({ok:true,selection:(groups.data||[]).find((group:any)=>group.team_id===existing.id)});
    name=`Préparation · ${target.data.name}`;category=target.data.category||'';gender=target.data.gender||null;seasonLabel=target.data.season_label||'';rosterKind='preselection';
  }else if(preparationTargetId){return NextResponse.json({error:'Utilise le rattachement de préparation pour choisir une sélection cible'},{status:400});}
  if(!name&&body.action!=='set_capacity')return NextResponse.json({error:'Nom de sélection manquant'},{status:400});
  if(body.action==="set_capacity"){
    const selection=await ctx.admin.from("institutional_selections").select("id,team_id").eq("id",String(body.selectionId||"")).eq("structure_id",structureId).maybeSingle();
    if(selection.error||!selection.data)return NextResponse.json({error:"Sélection introuvable"},{status:404});
    const members=await ctx.admin.from("institutional_selection_players").select("id",{count:"exact",head:true}).eq("selection_id",selection.data.id).eq("status","active");
    if(members.error)return NextResponse.json({error:members.error.message},{status:400});
    if(rosterKind!=="preselection"&&(members.count||0)>maxPlayers)return NextResponse.json({error:"Retire d’abord des joueurs pour respecter ce plafond. Aucun joueur n’a été retiré automatiquement."},{status:409});
    const team=await ctx.admin.from("teams").select("metadata").eq("id",selection.data.team_id).maybeSingle();if(team.error||!team.data)return NextResponse.json({error:"Équipe introuvable"},{status:404});
    if(team.data.metadata?.institutionRosterKind==="preselection"&&rosterKind!=="preselection"&&(members.count||0)>0)return NextResponse.json({error:"Crée une sélection finale distincte, puis ajoute les 10 ou 12 joueurs depuis une journée. La présélection reste disponible pour les entraînements."},{status:409});
    const write=await ctx.admin.from("teams").update({metadata:{...team.data.metadata,institutionRosterKind:rosterKind,institutionSelectionMaxPlayers:maxPlayers}}).eq("id",selection.data.team_id);if(write.error)return NextResponse.json({error:write.error.message},{status:400});return NextResponse.json({ok:true,maxPlayers});
  }
  const teamId = crypto.randomUUID();
  const detectionEventId = String(body.detectionEventId || "");
  if (detectionEventId) {
    const source = await ctx.admin.from("institutional_detection_events").select("id").eq("id",detectionEventId).eq("structure_id",structureId).eq("archived",false).maybeSingle();
    if(source.error||!source.data)return NextResponse.json({error:"Groupe source introuvable"},{status:404});
    const existing = await ctx.admin.from("institutional_selections").select("*").eq("id",detectionEventId).eq("structure_id",structureId).maybeSingle();
    if(existing.error)return NextResponse.json({error:existing.error.message},{status:400});
    if(existing.data)return NextResponse.json({ok:true,selection:existing.data});
  }
  const selectionId = detectionEventId || crypto.randomUUID();
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
      ...(preparationTargetId?{institutionPreparationTargetId:preparationTargetId}:{}),
      institutionRosterKind:rosterKind,
      institutionSelectionMaxPlayers:maxPlayers,
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
    selection: {...selectionWrite.data,roster_kind:rosterKind,preparation_target_id:preparationTargetId||null},
  });
}
