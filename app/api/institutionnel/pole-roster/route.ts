import {playerAgeCategory} from "@/lib/institutionnel/player-category";
import {canManageSport, institutionalSportActor} from "@/lib/institutionnel/sport-access-server";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin-server";

type Ctx = {
  user: any;
  db: any;
  canManage: boolean;
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

  return { user, db, structure: structure.data, canManage: canManageSport(membership.data) };
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
          .select("id,name,club_name,category,coach_name,club_logo_url,user_id,metadata")
          .in("id", partnerIds)
      : { data: [], error: null };

    if (partners.error) throw new Error(partners.error.message);

    const assignments = await ctx.db.from("institutional_pole_partner_assignments").select("id,pole_player_id,partner_team_id,season_label").eq("structure_id",structureId).eq("active",true);
    if(assignments.error)throw Error(assignments.error.message);
    const staff = partnerIds.length ? await ctx.db.from("institutional_team_staff").select("id,team_id,email,user_id,role,status").eq("structure_id",structureId).in("team_id",partnerIds).eq("status","active") : {data:[],error:null};
    if(staff.error)throw Error(staff.error.message);
    const staffMembers=partnerIds.length?await ctx.db.from("team_members").select("team_id,user_id").in("team_id",partnerIds).eq("status","active"):{data:[],error:null};
    if(staffMembers.error)throw Error(staffMembers.error.message);
    const activeStaff=new Set((staffMembers.data||[]).map((m:any)=>`${m.team_id}:${m.user_id}`));
    const canonicalIds=(playersQuery.data||[]).map((p:any)=>p.metadata?.institutionCentralPlayerId).filter(Boolean);
    const selections=await ctx.db.from("institutional_selections").select("id,name").eq("structure_id",structureId).neq("status","archived");
    if(selections.error)throw Error(selections.error.message);
    const memberships=canonicalIds.length?await ctx.db.from("institutional_selection_players").select("selection_id,player_id").in("player_id",canonicalIds).eq("status","active"):{data:[],error:null};
    if(memberships.error)throw Error(memberships.error.message);
    const partnerById = new Map<string,any>(
      (partners.data || []).map((team: any) => [String(team.id), team])
    );

    return NextResponse.json({
      structure: ctx.structure,
      canManage: ctx.canManage,
      assignments: assignments.data || [],
      poleTeam,
      selections: selections.data||[],
      players: (playersQuery.data||[]).map((p:any)=>({...p,selections:(memberships.data||[]).filter((m:any)=>m.player_id===p.metadata?.institutionCentralPlayerId).map((m:any)=>(selections.data||[]).find((s:any)=>s.id===m.selection_id)).filter(Boolean)})),
      partners: (partnerLinks.data || []).map((link: any) => ({
        ...link,
        team: partnerById.get(String(link.team_id)) || null,
        staff:(staff.data||[]).filter((member:any)=>member.team_id===link.team_id).map((member:any)=>({...member,access_ready:activeStaff.has(`${member.team_id}:${member.user_id}`)})),
        can_configure:ctx.canManage&&partnerById.get(String(link.team_id))?.user_id===ctx.user.id,
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


export async function POST(req: Request) {
  const body=await req.json().catch(()=>({}));
  const structureId=String(body.structureId||"");
  const ctx=await institutionalSportActor(structureId);if("error" in ctx)return ctx.error;
  if(!canManageSport(ctx.member))return NextResponse.json({error:"Droits insuffisants"},{status:403});
  const roster=await getCtx(structureId);if(!roster)return NextResponse.json({error:"Accès Pôle refusé"},{status:403});
  try {
    if(body.action==="create_partner"||body.action==="update_partner") {
      const name=String(body.name||"").trim(),clubName=String(body.clubName||"").trim(),category=String(body.category||"").trim();
      if(!name||name.length>160||!clubName||!category)return NextResponse.json({error:"Renseigne le nom de l’équipe, le club et la catégorie."},{status:400});
      const staff=(Array.isArray(body.staff)?body.staff:[]).map((m:any)=>({name:String(m.name||"").trim(),email:String(m.email||"").trim().toLowerCase(),role:m.role==="Assistant"?"Assistant":"Coach principal"}));
      if(staff.length>2||!staff.some((m:any)=>m.role==="Coach principal"&&m.name&&m.email)||staff.some((m:any)=>!m.name||!/^\S+@\S+\.\S+$/.test(m.email))||new Set(staff.map((m:any)=>m.email)).size!==staff.length)return NextResponse.json({error:"Renseigne le nom et une adresse mail valide pour chaque membre du staff. Le coach principal est obligatoire."},{status:400});
      if(body.action==="update_partner") {
        const id=String(body.teamId||'');
        const link=await ctx.admin.from('institutional_pole_teams').select('id').eq('structure_id',structureId).eq('team_id',id).eq('team_kind','partner').eq('active',true).maybeSingle();
        const team=await ctx.admin.from('teams').select('id,user_id,metadata').eq('id',id).maybeSingle();
        if(link.error||!link.data||team.error||!team.data)return NextResponse.json({error:'Équipe partenaire introuvable'},{status:404});
        if(team.data.user_id!==ctx.user.id)return NextResponse.json({error:'Seul le responsable actuel peut modifier le staff de cette équipe.'},{status:403});
        const write=await ctx.admin.from('teams').update({metadata:{...team.data.metadata,institutionPartnerStaff:staff,institutionPartnerOwnerPending:true},updated_at:new Date().toISOString()}).eq('id',id).eq('user_id',ctx.user.id);
        if(write.error)throw Error(write.error.message);return NextResponse.json({ok:true,teamId:id});
      }
      const season=roster.structure.season_label||"2026-2027";
      // Refuse an accidental double submission without changing any existing club.
      const links=await ctx.admin.from("institutional_pole_teams").select("team_id").eq("structure_id",structureId).eq("team_kind","partner").eq("season_label",season).eq("active",true);
      if(links.error)throw Error(links.error.message);
      const ids=(links.data||[]).map((l:any)=>l.team_id);
      if(ids.length){const same=await ctx.admin.from("teams").select("id,name,category").in("id",ids);if(same.error)throw Error(same.error.message);if(same.data?.some((t:any)=>t.name?.toLocaleLowerCase("fr")===name.toLocaleLowerCase("fr")&&t.category===category))return NextResponse.json({error:"Cette équipe partenaire existe déjà pour cette saison."},{status:409});}
      const id=crypto.randomUUID();
      const team=await ctx.admin.from("teams").insert({id,user_id:ctx.user.id,team_type:"coached",name,club_name:clubName,category,coach_name:staff.find((m:any)=>m.role==="Coach principal").name,metadata:{institutionManaged:true,institutionStructureId:structureId,institutionKind:"partner",institutionPartnerOwnerPending:true,institutionPartnerCreatorId:ctx.user.id,institutionAllAccess:true,season,name,category,institutionPartnerStaff:staff}});
      if(team.error)throw Error(team.error.message);
      const link=await ctx.admin.from("institutional_pole_teams").insert({structure_id:structureId,team_id:id,team_kind:"partner",season_label:season,active:true,created_by:ctx.user.id});
      if(link.error){await ctx.admin.from("teams").delete().eq("id",id).eq("user_id",ctx.user.id);throw Error(link.error.message);}
      return NextResponse.json({ok:true,teamId:id});
    }
    if(body.action==="register_player") {
      const team=await ensurePoleTeam(roster);
      const source=await ctx.admin.from('players').select('*').eq('id',String(body.playerId||'')).eq('team_id',team.id).single();
      if(source.error||!source.data)return NextResponse.json({error:'Poliste introuvable'},{status:404});
      const p=source.data;if(!p.birth_date||!p.first_name||!p.last_name)return NextResponse.json({error:'Complète le nom, le prénom et la naissance dans la fiche avant de rattacher une sélection.'},{status:400});
      let id=p.metadata?.institutionCentralPlayerId,created=false;
      if(id){const known=await ctx.admin.from('institutional_players').select('id').eq('id',id).eq('structure_id',structureId).eq('archived',false).maybeSingle();if(known.error||!known.data)return NextResponse.json({error:'La fiche institution liée est indisponible. Aucun doublon n’a été créé.'},{status:409});return NextResponse.json({ok:true,canonicalId:id});}
      const base=await ctx.admin.from('institutional_players').select('id,first_name,last_name').eq('structure_id',structureId).eq('birthdate',p.birth_date).eq('archived',false);if(base.error)throw Error(base.error.message);
      const norm=(v:string)=>v.trim().normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
      const matching=(base.data||[]).filter((x:any)=>norm(x.first_name)===norm(p.first_name)&&norm(x.last_name)===norm(p.last_name));if(matching.length>1)return NextResponse.json({error:'Plusieurs fiches correspondent. Vérifie la base avant de continuer.'},{status:409});
      id=matching[0]?.id;
      if(!id){const insert=await ctx.admin.from('institutional_players').insert({structure_id:structureId,first_name:p.first_name,last_name:p.last_name,birthdate:p.birth_date,sex:p.metadata?.sex||null,category:playerAgeCategory(p.birth_date,roster.structure.season_label),license_number:p.license_number||null,photo_url:p.photo_url||null,position_primary:p.position_primary||null,tutor1_phone:p.tutor1_phone||null,tutor1_email:p.tutor1_email||null,tutor2_phone:p.tutor2_phone||null,tutor2_email:p.tutor2_email||null,status:'followed',archived:false,profile_data:{origin:'pole',lifecycle:{workflowStatus:'validated'}},created_by:ctx.user.id}).select('id').single();if(insert.error)throw Error(insert.error.message);id=insert.data.id;created=true;}
      let update=ctx.admin.from('players').update({metadata:{...p.metadata,institutionCentralPlayerId:id},updated_at:new Date().toISOString()}).eq('id',p.id);
      update=p.updated_at?update.eq('updated_at',p.updated_at):update.is('updated_at',null);
      const write=await update.select('id').maybeSingle();if(write.error||!write.data){if(created)await ctx.admin.from('institutional_players').delete().eq('id',id).eq('structure_id',structureId);throw Error('La fiche a changé. Recharge puis réessaie.');}
      return NextResponse.json({ok:true,canonicalId:id});
    }
    if(body.action==="create_player") {
      const p=body.player||{},first=String(p.first_name||"").trim(),last=String(p.last_name||"").trim(),birth=String(p.birthdate||"").slice(0,10);
      const extra=Object.fromEntries(['address','postal_code','city','external_license_id','import_source'].filter(k=>typeof p.profile_extra?.[k]==='string').map(k=>[k,p.profile_extra[k].slice(0,2000)]));
      const sexRaw=String(p.sex||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'');const sex=['m','masculin','garcon','male'].includes(sexRaw)?'M':['f','feminin','fille','female'].includes(sexRaw)?'F':'';
      if(!first||!last||!/^\d{4}-\d{2}-\d{2}$/.test(birth)||(String(p.sex||'').trim()&&!sex))return NextResponse.json({error:"Renseigne nom, prénom, date de naissance et sexe."},{status:400});
      const team=await ensurePoleTeam(roster);
      const old=await ctx.admin.from("players").select("id,first_name,last_name,birth_date").eq("team_id",team.id).eq("birth_date",birth);
      if(old.error)throw Error(old.error.message);
      const norm=(v:string)=>v.trim().normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase();
      if(old.data?.some((x:any)=>norm(x.first_name||"")===norm(first)&&norm(x.last_name||"")===norm(last)))return NextResponse.json({error:"Ce poliste existe déjà. Ouvre sa fiche."},{status:409});
      const owner=await ctx.admin.from("teams").select("user_id").eq("id",team.id).single();if(owner.error)throw Error(owner.error.message);
      const base=await ctx.admin.from("institutional_players").select("id,first_name,last_name").eq("structure_id",structureId).eq("birthdate",birth).eq("archived",false);
      if(base.error)throw Error(base.error.message);
      const matched=(base.data||[]).filter((x:any)=>norm(x.first_name||'')===norm(first)&&norm(x.last_name||'')===norm(last));
      if(matched.length>1)throw Error('Plusieurs fiches correspondent à cette identité. Vérifie les doublons dans la base avant de continuer.');
      let canonicalId=matched[0]?.id,createdCanonical=false;
      if(!canonicalId){const baseWrite=await ctx.admin.from("institutional_players").insert({structure_id:structureId,first_name:first,last_name:last,birthdate:birth,sex,category:playerAgeCategory(birth,roster.structure.season_label),license_number:String(p.license_number||'').trim()||null,club_name:String(p.club_name||'')||null,height_cm:p.height_cm?Number(String(p.height_cm).replace(',','.')):null,email:p.email||null,phone:p.phone||null,tutor1_phone:p.guardian1_phone||null,tutor1_email:p.guardian1_email||null,tutor2_phone:p.guardian2_phone||null,tutor2_email:p.guardian2_email||null,status:'followed',archived:false,profile_data:{origin:'pole',guardian1Name:p.guardian1_name||null,guardian2Name:p.guardian2_name||null,...extra,lifecycle:{workflowStatus:'validated'}},created_by:ctx.user.id}).select('id').single();if(baseWrite.error)throw Error(baseWrite.error.message);canonicalId=baseWrite.data.id;createdCanonical=true;}
      const result=await ctx.admin.from("players").insert({team_id:team.id,user_id:owner.data.user_id,first_name:first,last_name:last,birth_date:birth,photo_url:null,license_number:String(p.license_number||"").trim()||null,height:String(p.height_cm||"").trim(),tutor1_phone:String(p.guardian1_phone||'')||null,tutor1_email:String(p.guardian1_email||'')||null,tutor2_phone:String(p.guardian2_phone||'')||null,tutor2_email:String(p.guardian2_email||'')||null,metadata:{sex,institutionCentralPlayerId:canonicalId,guardian1Name:p.guardian1_name||null,guardian2Name:p.guardian2_name||null,...extra},status:"Disponible"}).select("id").single();
      if(result.error){if(createdCanonical)await ctx.admin.from("institutional_players").delete().eq("id",canonicalId).eq("structure_id",structureId);throw Error(result.error.message);}return NextResponse.json({ok:true,player:{id:result.data.id},teamId:team.id});
    }
    return NextResponse.json({error:"Action inconnue"},{status:400});
  }catch(error){return NextResponse.json({error:error instanceof Error?error.message:"Enregistrement impossible"},{status:400});}
}
