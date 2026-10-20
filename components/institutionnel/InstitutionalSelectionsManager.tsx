"use client";

import {categoryMatches,withPlayerCategory} from "@/lib/institutionnel/player-category";
import { useEffect, useMemo, useState } from "react";
import InstitutionalDayRosterImport from "./InstitutionalDayRosterImport";
import InstitutionalSelectionDocuments from "./InstitutionalSelectionDocuments";
import InstitutionalSelectionTraining from "@/components/institutionnel/InstitutionalSelectionTraining";
import InstitutionalSelectionOperations from "@/components/institutionnel/InstitutionalSelectionOperations";

type InstitutionalPlayer = {
  id: string;
  first_name: string;
  last_name: string;
  birthdate: string | null;
  club_name: string | null;
  category: string | null;
  linked_user_id: string | null;
  sex?: string | null;
  photo_url?: string | null;
  profile_data?: Record<string, unknown> | null;
  archived?:boolean;
  workflow_status?:string;
  email?: string | null;
  tutor1_email?: string | null;
  tutor2_email?: string | null;
};

type SecondaryTeam = {
  id: string;
  team_id: string;
  kind: string;
  team?: { id: string; name: string; category: string | null } | null;
};

type SelectionPlayer = {
  id: string;
  player_id: string;
  team_player_id: string | null;
  secondary_team_id: string | null;
  secondary_team_player_id: string | null;
  player?: InstitutionalPlayer | null;
};

type Selection = {
  preparation_target_id?:string|null;
  max_players?:number|null;
  roster_kind?:string;
  id: string;
  team_id: string;
  name: string;
  category: string | null;
  season_label: string | null;
  gender: string | null;
  staff?: Array<{
    id: string;
    email: string;
    role: string;
    access_level: string;
    status: string;
  }>;
  players?: SelectionPlayer[];
};

type Props = {
  structureId: string;
  structureType: "committee" | "league" | "federation" | "pole";
  onPrepareSelection?:(id:string)=>void;
  onOpenBase?: () => void;
  onCreateDetection?: (playerIds:string[])=>void;
  initialSelectionId?:string;
  onOpenDetection?:(eventId?:string)=>void;
};

type ShareState = {
  playerId: string;
  playerName: string;
  email: string;
  label: string;
  message: string;
  accessLevel: "viewer" | "editor" | "manager";
} | null;

export default function InstitutionalSelectionsManager({
  structureId,
  structureType,
  onPrepareSelection,
  onOpenBase,
  onCreateDetection,
  initialSelectionId,
  onOpenDetection,
}: Props) {
  const [rows, setRows] = useState<Selection[]>([]);
  const [baseSeason,setBaseSeason]=useState<string|undefined>();
  const [allPlayers, setAllPlayers] = useState<InstitutionalPlayer[]>([]);
  const [secondaryTeams, setSecondaryTeams] = useState<SecondaryTeam[]>([]);
  const [opened, setOpened] = useState(initialSelectionId||"");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [detailTab, setDetailTab] = useState<"roster"|"training"|"documents">("roster");
  const [creationPlayerIds, setCreationPlayerIds] = useState<string[]>([]);
  const [creationSearch, setCreationSearch] = useState("");
  const [checkedMemberIds,setCheckedMemberIds]=useState<string[]>([]);
  const [docScope,setDocScope]=useState<"all"|"checked">("all");
  const [docAction,setDocAction]=useState<"info"|"note"|"trombinoscope"|null>(null);
  const [share, setShare] = useState<ShareState>(null);
  const [form, setForm] = useState({
    name: structureType === "federation" ? "Équipe de France U16" : "Sélection U13",
    category: structureType === "federation" ? "U16" : "U13",
    seasonLabel: `${new Date().getFullYear()-(new Date().getMonth()<6?1:0)}-${new Date().getFullYear()+(new Date().getMonth()<6?0:1)}`,
    gender: "",
    maxPlayers:12,
    rosterKind:"selection",
  });
  const [chosenPlayers, setChosenPlayers] = useState<string[]>([]);
  const [playerSearch, setPlayerSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [genderFilter, setGenderFilter] = useState("");
  const [seasonFilter, setSeasonFilter] = useState("");

  const [staffEmail, setStaffEmail] = useState("");
  const [staffRole, setStaffRole] = useState("Responsable sélection");
  const [linkUserEmail, setLinkUserEmail] = useState<Record<string, string>>({});
  const [teamChoice, setTeamChoice] = useState<Record<string, string>>({});

  const current = useMemo(
    () => rows.find((row) => row.id === opened) || null,
    [rows, opened]
  );

  const memberIds = new Set(current?.players?.map(entry => entry.player_id) || []);
  const eligibleBasePlayers=allPlayers.filter(player=>!player.archived&&player.workflow_status!=="reviewing"&&player.workflow_status!=="archived");
  const availablePlayers = eligibleBasePlayers.map(player=>withPlayerCategory(player,current?.season_label||baseSeason)).filter(player => categoryMatches(player.category,categoryFilter) && (!genderFilter || (genderFilter === "M" ? ["m","masculin","male","garcon","garçon","homme"] : ["f","féminin","feminin","female","fille","femme"]).includes((player.sex || "").trim().toLowerCase())) && `${player.first_name} ${player.last_name} ${player.club_name || ""}`.toLowerCase().includes(playerSearch.trim().toLowerCase()));
  useEffect(()=>{if(!current)return;setGenderFilter(current.gender==="M"||current.gender==="F"?current.gender:"");const age=current.category?.match(/U\d+/i)?.[0].toUpperCase();setCategoryFilter(age==="U13"?"group:u13":age||"");},[opened,current?.gender,current?.category]);
  const memberSignature=(current?.players||[]).map(entry=>entry.player_id).join(',');
  useEffect(()=>{setCheckedMemberIds([]);setDocAction(null);setDocScope("all");},[opened]);
  useEffect(()=>{const valid=new Set(memberSignature.split(','));setCheckedMemberIds(previous=>previous.filter(id=>valid.has(id)));},[memberSignature]);
  const documentPlayers=(current?.players||[]).filter(entry=>entry.player&&(docScope==="all"||checkedMemberIds.includes(entry.player_id))).map(entry=>({...allPlayers.find(player=>player.id===entry.player_id),...entry.player!}));
  async function removeCheckedMembers(){
    if(!current||busy||!checkedMemberIds.length||!window.confirm(`Retirer ${checkedMemberIds.length} joueur(s) de ${current.name} ?\n\nLes fiches, statistiques et présences aux entraînements seront conservées.`))return;
    setBusy(true);try{const response=await fetch('/api/institutionnel/roster-actions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({structureId,selectionId:current.id,action:'remove_from_selection',playerIds:checkedMemberIds})}),result=await response.json();const removed=new Set<string>(result.removedPlayerIds||[]);setCheckedMemberIds(previous=>previous.filter(id=>!removed.has(id)));await load();if(!response.ok)throw new Error(result.error||'Retrait impossible');setMessage(`${removed.size} joueur(s) retiré(s) de la sélection.`);}catch(error){setMessage(error instanceof Error?error.message:'Connexion interrompue. Réessaie.');}finally{setBusy(false)}
  }
  const seasonOptions = Array.from(new Set(rows.map(row => row.season_label).filter(Boolean)));

  async function load() {
    const [selectionRes, playerRes, teamRes] = await Promise.all([
      fetch(
        `/api/institutionnel/sport/selections?structureId=${encodeURIComponent(
          structureId
        )}`,
        { cache: "no-store" }
      ),
      fetch(
        `/api/institutionnel/players?structureId=${encodeURIComponent(
          structureId
        )}`,
        { cache: "no-store" }
      ),
      fetch(
        `/api/institutionnel/sport/teams?structureId=${encodeURIComponent(
          structureId
        )}`,
        { cache: "no-store" }
      ),
    ]);

    const [selectionJson, playerJson, teamJson] = await Promise.all([
      selectionRes.json().catch(() => ({})),
      playerRes.json().catch(() => ({})),
      teamRes.json().catch(() => ({})),
    ]);

    if (!selectionRes.ok) {
      setMessage(selectionJson.error || "Chargement impossible.");
      return;
    }

    setRows(selectionJson.selections || []);
    setBaseSeason(playerJson.seasonLabel);
    setAllPlayers((playerJson.players || []).map((player:InstitutionalPlayer)=>withPlayerCategory(player,current?.season_label||playerJson.seasonLabel)));
    setSecondaryTeams(
      (teamJson.teams || []).filter(
        (row: SecondaryTeam) => row.kind === "secondary"
      )
    );
  }

  useEffect(() => {
    void load();
  }, [structureId]);

  async function createSelection() {
    if (!form.name.trim() || !form.category.trim() || !form.seasonLabel.trim()) return alert("Renseigne le nom, la catégorie et la saison.");
    if(form.rosterKind!=="preselection"&&creationPlayerIds.length>form.maxPlayers)return alert(`Choisis au maximum ${form.maxPlayers} joueurs pour cette sélection.`);
    setBusy(true);setMessage("");
    let selectionId="";const added:string[]=[];
    try {
      const response=await fetch("/api/institutionnel/sport/selections",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({structureId,...form})});
      const json=await response.json();if(!response.ok)throw new Error(json.error||"Création impossible");
      selectionId=json.selection.id;setOpened(selectionId);setDetailTab("roster");setShowCreate(false);
      for(const playerId of creationPlayerIds){
        const attached=await fetch("/api/institutionnel/sport/players",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({structureId,mode:"attach",selectionId,playerId})});
        const result=await attached.json();if(!attached.ok)throw new Error(result.error||"Ajout du joueur impossible");added.push(playerId);
      }
      setCreationPlayerIds([]);setMessage(`Sélection créée avec ${added.length} joueur(s) de la base.`);
    } catch(error) {
      if(selectionId){setChosenPlayers(creationPlayerIds.filter(id=>!added.includes(id)));setCreationPlayerIds([]);}
      alert(error instanceof Error?error.message:"Création impossible");
    } finally {try{await load();}catch{setMessage("Actualise pour recharger les sélections enregistrées.");}finally{setBusy(false)}}
  }

  async function addExistingPlayers(requestedIds = chosenPlayers): Promise<string[]> {
    const playerIds=[...new Set(requestedIds)].filter(id=>!memberIds.has(id)&&eligibleBasePlayers.some(player=>player.id===id));
    if (!current || !playerIds.length || busy) return [];
    if(current.roster_kind!=="preselection"&&(current.players?.length||0)+playerIds.length>(current.max_players||12)){alert(`Cette sélection est limitée à ${current.max_players||12} joueurs. Retire des coches ou des membres avant de valider.`);return [];}
    setBusy(true);setMessage("");
    const added: string[] = [];
    try {
      for (const playerId of playerIds) {
        const response = await fetch("/api/institutionnel/sport/players", {method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({structureId,mode:"attach",selectionId:current.id,playerId})});
        const json = await response.json();
        if (!response.ok) throw new Error(json.error || "Ajout impossible");
        added.push(playerId);
      }
      setMessage(`${added.length} joueur(s) ajouté(s) à ${current.name}.`);
    } catch (error) { alert(`${error instanceof Error ? error.message : "Ajout impossible"}. ${added.length} ajout(s) enregistré(s) ; les autres restent cochés pour réessayer.`); }
    finally { setChosenPlayers(previous => previous.filter(id => !added.includes(id)));try { await load(); } catch { setMessage("Les ajouts enregistrés sont conservés. Actualise la page pour recharger l’effectif."); } finally { setBusy(false); } }
    return added;
  }
  async function removeMember(playerId:string, name:string) {
    if (!current || busy || !window.confirm(`Retirer ${name} de ${current.name} ?\n\nLa fiche joueur, les autres sélections et les statistiques seront conservées.`)) return;
    setBusy(true);
    try {
      const response = await fetch("/api/institutionnel/sport/players",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({structureId,mode:"detach",selectionId:current.id,playerId})});
      const json = await response.json();if (!response.ok) throw new Error(json.error || "Retrait impossible");
      await load();setMessage("Joueur retiré de cet effectif.");
    } catch (error) { alert(error instanceof Error ? error.message : "Retrait impossible"); }
    finally { setBusy(false); }
  }

  async function addSelectionStaff() {
    if (!current || !staffEmail.includes("@")) return alert("Email invalide.");

    setBusy(true);
    const response = await fetch("/api/institutionnel/sport/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structureId,
        scope: "selection",
        selectionId: current.id,
        email: staffEmail.trim().toLowerCase(),
        role: staffRole.trim() || "Responsable sélection",
        accessLevel: "premium",
      }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) return alert(json.error || "Accès impossible.");

    setStaffEmail("");
    setMessage(
      json.invited
        ? "Responsable invité par email. La sélection apparaîtra dans Mes équipes après activation."
        : "Responsable ajouté à la sélection."
    );
    await load();
  }

  async function associateSecondary(playerId: string) {
    if (!current) return;

    const secondaryTeamId = teamChoice[playerId];
    if (!secondaryTeamId) return alert("Choisis une équipe secondaire.");

    setBusy(true);
    const response = await fetch("/api/institutionnel/sport/players", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structureId,
        mode: "associate_secondary",
        selectionId: current.id,
        playerId,
        secondaryTeamId,
      }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) return alert(json.error || "Association impossible.");

    setMessage(
      "Joueur associé à l’équipe secondaire. La même identité institutionnelle relie maintenant les deux contextes."
    );
    await load();
  }

  async function linkUser(playerId: string) {
    const email = (linkUserEmail[playerId] || "").trim().toLowerCase();
    if (!email.includes("@")) return alert("Email utilisateur invalide.");

    setBusy(true);
    const response = await fetch("/api/institutionnel/sport/access", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structureId,
        scope: "player_account",
        playerId,
        email,
      }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) return alert(json.error || "Association impossible.");

    setLinkUserEmail((v) => ({ ...v, [playerId]: "" }));
    setMessage(
      json.invited
        ? "Compte utilisateur invité et associé à la fiche joueur."
        : "Compte utilisateur associé à la fiche joueur."
    );
    await load();
  }

  async function sendShare() {
    if (!share) return;
    if (!share.email.includes("@")) return alert("Email destinataire invalide.");

    setBusy(true);
    const response = await fetch("/api/institutionnel/player-transfers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        structureId,
        playerIds: [share.playerId],
        target_email: share.email.trim().toLowerCase(),
        target_label: share.label.trim() || "Club / Institution destinataire",
        access_level: share.accessLevel,
        message: share.message.trim(),
      }),
    });
    const json = await response.json().catch(() => ({}));
    setBusy(false);

    if (!response.ok) {
      alert(json.error || "Envoi impossible.");
      return;
    }

    setShare(null);
    setMessage(
      "Fiche envoyée par email. Le destinataire reçoit un lien sécurisé MyBasket pour consulter ou reprendre le suivi selon le droit choisi."
    );
  }

  return (
    <div className="selections">
      {message && <div className="notice">✓ {message}</div>}

      <div className="head">
        <div>
          <small>SÉLECTIONS</small>
          <h3>Équipes de sélection</h3>
          <p>
            Retrouve les équipes finales, les fiches des joueurs, les matchs et les statistiques. Les journées se préparent dans l’onglet Préparation.
          </p>
        </div>
        <button className="primary" onClick={() => setShowCreate((v) => !v)}>
          + Créer une sélection
        </button>
      </div>

      {showCreate && (
        <div className="createSelection">
          <input
            aria-label="Nom de la sélection" placeholder="Nom de la sélection"
            value={form.name}
            onChange={(e) => setForm((v) => ({ ...v, name: e.target.value }))}
          />
          <input
            aria-label="Catégorie de la sélection" list="selection-age-categories" placeholder="Catégorie (U11, U12…)"
            value={form.category}
            onChange={(e) =>
              setForm((v) => ({ ...v, category: e.target.value }))
            }
          />
          <input
            aria-label="Saison de la sélection" placeholder="Saison"
            value={form.seasonLabel}
            onChange={(e) =>
              setForm((v) => ({ ...v, seasonLabel: e.target.value }))
            }
          />
          <datalist id="selection-age-categories">{["U9","U10","U11","U12","U13","U14","U15","U16","U17","U18"].map(category=><option key={category}>{category}</option>)}</datalist>
          <select aria-label="Sexe de la sélection"
            value={form.gender}
            onChange={(e) => setForm((v) => ({ ...v, gender: e.target.value }))}
          >
            <option value="">Mixte / non défini</option>
            <option value="M">Masculin</option>
            <option value="F">Féminin</option>
          </select>
          <label>Nombre maximum de joueurs<select value={form.maxPlayers} onChange={event=>setForm(previous=>({...previous,maxPlayers:Number(event.target.value)}))}><option value={10}>10 joueurs maximum</option><option value={12}>12 joueurs maximum</option></select></label>
          <div className="creationRoster"><h4>Joueurs de la base à intégrer</h4><p>Choisis les joueurs déjà enregistrés. Si un joueur manque, crée d’abord sa fiche dans la base.</p><input aria-label="Rechercher dans la base à la création" placeholder="Nom, prénom ou club" value={creationSearch} onChange={event=>setCreationSearch(event.target.value)}/><div className="inline"><button type="button" disabled={busy} onClick={()=>setCreationPlayerIds(eligibleBasePlayers.filter(player=>`${player.first_name} ${player.last_name} ${player.club_name||""}`.toLowerCase().includes(creationSearch.toLowerCase())).map(player=>player.id))}>Tout cocher dans cette recherche</button><button type="button" disabled={busy} onClick={()=>setCreationPlayerIds([])}>Tout décocher</button></div><div className="rosterChecks">{eligibleBasePlayers.filter(player=>`${player.first_name} ${player.last_name} ${player.club_name||""}`.toLowerCase().includes(creationSearch.toLowerCase())).map(player=><label key={player.id}><input type="checkbox" disabled={busy} checked={creationPlayerIds.includes(player.id)} onChange={()=>setCreationPlayerIds(previous=>previous.includes(player.id)?previous.filter(id=>id!==player.id):[...previous,player.id])}/><span><b>{player.last_name} {player.first_name}</b><small>{player.category||"Catégorie non renseignée"} · {player.club_name||"Club non renseigné"}</small></span></label>)}</div><small>{creationPlayerIds.length} / {form.rosterKind==="preselection"?"sans limite":form.maxPlayers} joueurs choisis{form.rosterKind!=="preselection"&&creationPlayerIds.length>form.maxPlayers?" — retire des joueurs avant de créer":""}</small></div>
          <button className="primary" disabled={busy} onClick={createSelection}>
            {busy ? "Création…" : "Créer"}
          </button>
        </div>
      )}

      <label className="seasonFilter">Saison des sélections <select value={seasonFilter} onChange={event=>setSeasonFilter(event.target.value)}><option value="">Toutes les saisons</option>{seasonOptions.map(season=><option key={season!} value={season!}>{season}</option>)}</select></label>
      <div className="selectionGrid">
        {rows.filter(row=>(row.roster_kind!=="preselection"||row.id===opened)&&(!seasonFilter || row.season_label===seasonFilter)).map((row) => (
          <button
            className={opened === row.id ? "selectionCard on" : "selectionCard"}
            key={row.id}
            disabled={busy} onClick={() => {setOpened(row.id);setChosenPlayers([]);}}
          >
            <b>{row.roster_kind==="preselection"?"Présélection · ":"Sélection finale · "}{row.name}</b>
            <span>
              {row.category || "—"} · {row.gender === "M" ? "Masculin" : row.gender === "F" ? "Féminin" : "Mixte"} · {row.season_label || "—"}
            </span>
            <small>
              {row.players?.length || 0} joueur(s) · {row.staff?.length || 0} responsable(s)
            </small>
          </button>
        ))}
        {!rows.length && <div className="empty">Aucune sélection créée.</div>}
      </div>

      {current && (
        <section className="detail">
          <div className="detailHead">
            <div>
              <small>{current.roster_kind==="preselection"?"PRÉSÉLECTION · SANS LIMITE":"SÉLECTION FINALE"}</small>
              <h3>{current.name}</h3>
              <p>
                {current.category || "—"} · {current.season_label || "—"}
              </p>
            </div>
            <div className="detailActions">
              <button className="primary" onClick={()=>setDetailTab("training")}>Créer un événement avec cet effectif</button>
              <button className="primary" onClick={()=>onOpenBase?onOpenBase():window.location.assign(`/institutionnel/${structureId}?tab=Joueurs`)}>Ajouter un joueur dans la base</button>
              <div className="teamActions">{onPrepareSelection&&<button type="button" className="primary" onClick={()=>onPrepareSelection(current.preparation_target_id||current.id)}>Préparer les détections & entraînements</button>}<a href={`/equipes/${current.team_id}`}>Équipe complète · Matchs & statistiques →</a></div>
            </div>
          </div>

          <nav className="detailTabs" aria-label="Onglets de la sélection"><button type="button" className={detailTab==="roster"?"active":""} onClick={()=>setDetailTab("roster")}>Effectif</button><button type="button" className={detailTab==="training"?"active":""} onClick={()=>setDetailTab("training")}>Séances & documents liés</button><button type="button" className={detailTab==="documents"?"active":""} onClick={()=>setDetailTab("documents")}>Documents</button></nav>
          {detailTab==="roster"&&<>
          <div className="twoCols">
            <details className="panel staffPanel">
              <summary>Responsables de la sélection ({current.staff?.length||0})</summary>
              <p>
                Ils obtiennent un accès Premium à cette sélection et la voient
                dans leur espace Mes équipes.
              </p>
              <div className="inline">
                <input
                  type="email"
                  placeholder="bernard@email.fr"
                  value={staffEmail}
                  onChange={(e) => setStaffEmail(e.target.value)}
                />
                <input
                  placeholder="Responsable sélection"
                  value={staffRole}
                  onChange={(e) => setStaffRole(e.target.value)}
                />
                <button className="primary" disabled={busy} onClick={addSelectionStaff}>
                  Ajouter
                </button>
              </div>
              <div className="chips">
                {current.staff?.map((member) => (
                  <span key={member.id}>
                    {member.email} · {member.role}
                  </span>
                ))}
              </div>
            </details>

            <InstitutionalDayRosterImport key={current.id} structureId={structureId} players={eligibleBasePlayers} memberIds={[...memberIds]} maxPlayers={current.roster_kind==="preselection"?null:current.max_players||12} busy={busy} onAdd={ids=>addExistingPlayers(ids)}/>
            <details className="panel rosterComposer" open={!current.players?.length?true:undefined}>
              <summary>＋ Ajouter des joueurs depuis la base</summary>
              <p>{current.roster_kind==="preselection"?"Présélection sans limite. Reprends cet effectif dans les entraînements ; les décisions Retenu / Non retenu le feront évoluer.":`Sélection finale : ${current.max_players||12} joueurs maximum. Pour les entraînements, crée une présélection sans limite.`}</p>
              <div className="rosterFilters"><input aria-label="Rechercher des joueurs" placeholder="Nom, prénom ou club" value={playerSearch} onChange={e=>setPlayerSearch(e.target.value)}/><select aria-label="Catégorie des joueurs" value={categoryFilter} onChange={e=>setCategoryFilter(e.target.value)}><option value="">Tous les âges</option><option value="group:u13">Groupe U13 — U12 + U13</option>{Array.from(new Set(allPlayers.map(player=>player.category).filter(Boolean))).sort().map(category=><option key={category!} value={category!}>{category}</option>)}</select><select aria-label="Sexe des joueurs" value={genderFilter} onChange={e=>setGenderFilter(e.target.value)}><option value="">Tous</option><option value="M">Garçons</option><option value="F">Filles</option></select></div>
              <div className="selectionActionBar"><button type="button" disabled={busy} onClick={()=>setChosenPlayers(availablePlayers.filter(player=>!memberIds.has(player.id)).map(player=>player.id))}>Tout cocher ({availablePlayers.length})</button><button type="button" disabled={busy} onClick={()=>setChosenPlayers([])}>Tout décocher</button><button className="primary" disabled={busy || !chosenPlayers.length || (current.roster_kind!=="preselection"&&(current.players?.length||0)+chosenPlayers.length>(current.max_players||12))} onClick={()=>void addExistingPlayers()}>{busy?"Enregistrement…":`Ajouter à la ${current.roster_kind==="preselection"?"présélection":"sélection finale"} (${chosenPlayers.length})`}</button>{onCreateDetection && (chosenPlayers.length>0 || memberIds.size>0) && <button type="button" className="groupAction" disabled={busy} onClick={()=>onCreateDetection([...new Set([...memberIds,...chosenPlayers])])}>Créer une détection / entraînement ({new Set([...memberIds,...chosenPlayers]).size})</button>}<span>{chosenPlayers.length} nouveau(x) coché(s) · {current.roster_kind==="preselection"?"sans limite":`${Math.max(0,(current.max_players||12)-(current.players?.length||0))} places en sélection finale`}</span></div>
              <div className="rosterChecks">{availablePlayers.map(player=><label key={player.id} style={{background:memberIds.has(player.id)?"#e9e5e3":chosenPlayers.includes(player.id)?"#faf0f3":"white"}}><input type="checkbox" disabled={busy || memberIds.has(player.id)} checked={memberIds.has(player.id) || chosenPlayers.includes(player.id)} onChange={()=>setChosenPlayers(previous=>previous.includes(player.id)?previous.filter(id=>id!==player.id):[...previous,player.id])}/><span><b>{player.last_name} {player.first_name}</b><small>{player.category || "Catégorie non renseignée"} · {player.club_name || "Club non renseigné"}{memberIds.has(player.id)?" · Déjà ajouté":""}</small></span></label>)}</div>
              {!availablePlayers.length && <p>Aucun joueur à ajouter avec ces filtres.</p>}

            </details>
          </div>

          <div className="panel"><label>Type et plafond du groupe<select disabled={busy} value={current.roster_kind==="preselection"?"preselection":current.max_players||12} onChange={async event=>{setBusy(true);try{const response=await fetch("/api/institutionnel/sport/selections",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({structureId,action:"set_capacity",selectionId:current.id,rosterKind:event.target.value==="preselection"?"preselection":"selection",maxPlayers:event.target.value==="preselection"?12:Number(event.target.value)})});const result=await response.json();if(!response.ok)throw new Error(result.error);await load();}catch(error){alert(error instanceof Error?error.message:"Modification impossible");}finally{setBusy(false)}}}><option value="preselection">Présélection — sans limite</option><option value={10}>Sélection finale — 10 maximum</option><option value={12}>Sélection finale — 12 maximum</option></select></label>{current.roster_kind!=="preselection"&&(current.players?.length||0)>(current.max_players||12)&&<p role="alert">Cet effectif dépasse le plafond. Les joueurs existants sont conservés : retire ceux qui ne font pas partie de la sélection finale.</p>}</div>
          <div className="roster">
            <div className="rosterHead">
              <b>Effectif : {current.players?.length||0} / {current.roster_kind==="preselection"?"sans limite":current.max_players||12} joueurs</b>
              <span>
                Chaque ligne ouvre la vraie fiche MyBasket complète.
              </span>
            </div>

            <div className="memberBulk"><button type="button" disabled={busy||!current.players?.length} onClick={()=>setCheckedMemberIds(checkedMemberIds.length===(current.players?.length||0)?[]:(current.players||[]).map(entry=>entry.player_id))}>{checkedMemberIds.length===(current.players?.length||0)&&checkedMemberIds.length?"Tout décocher":"Tout cocher"}</button><b>{checkedMemberIds.length} coché(s)</b><button type="button" disabled={busy||!checkedMemberIds.length} onClick={()=>{setDocScope("checked");setDocAction(null);setDetailTab("documents");}}>Documents des joueurs cochés</button><button type="button" className="removeBulk" disabled={busy||!checkedMemberIds.length} onClick={()=>void removeCheckedMembers()}>Retirer de la sélection</button></div>
            {current.players?.map((entry) => {
              const player = entry.player;
              if (!player) return null;

              return (
                <article key={entry.id} className={checkedMemberIds.includes(player.id)?"memberChecked":""}>
                  <input type="checkbox" className="memberCheck" aria-label={`Cocher ${player.first_name} ${player.last_name}`} disabled={busy} checked={checkedMemberIds.includes(player.id)} onChange={()=>setCheckedMemberIds(previous=>previous.includes(player.id)?previous.filter(id=>id!==player.id):[...previous,player.id])}/>
                  <div className="avatar">
                    {player.photo_url ? (
                      <img src={player.photo_url} alt="" />
                    ) : (
                      <>
                        {player.first_name?.[0]}
                        {player.last_name?.[0]}
                      </>
                    )}
                  </div>

                  <div className="identity">
                    <b>
                      {player.first_name} {player.last_name}
                    </b>
                    <span>
                      {player.club_name || "Club non renseigné"} ·{" "}
                      {player.category || current.category || "—"}
                    </span>
                    <small>
                      {player.linked_user_id
                        ? "Compte utilisateur associé"
                        : "Aucun compte utilisateur associé"}
                    </small>
                  </div>

                  <details className="memberSettings"><summary>Options de la fiche</summary><div>
                  <div className="context">
                    <label>Équipe secondaire / club suivi</label>
                    <select
                      value={
                        teamChoice[player.id] ||
                        entry.secondary_team_id ||
                        ""
                      }
                      onChange={(e) =>
                        setTeamChoice((v) => ({
                          ...v,
                          [player.id]: e.target.value,
                        }))
                      }
                    >
                      <option value="">Aucune</option>
                      {secondaryTeams.map((team) => (
                        <option key={team.team_id} value={team.team_id}>
                          {team.team?.name || "Équipe secondaire"}
                        </option>
                      ))}
                    </select>
                    <button disabled={busy} onClick={() => associateSecondary(player.id)}>
                      Associer
                    </button>
                  </div>

                  <div className="userLink">
                    <label>Associer au compte du joueur</label>
                    <input
                      type="email"
                      placeholder="joueur@email.fr"
                      value={linkUserEmail[player.id] || ""}
                      onChange={(e) =>
                        setLinkUserEmail((v) => ({
                          ...v,
                          [player.id]: e.target.value,
                        }))
                      }
                    />
                    <button disabled={busy} onClick={() => linkUser(player.id)}>
                      Associer
                    </button>
                  </div>

                  </div></details>
                  <div className="openLinks">
                    <button type="button" className="removeFromSelection" aria-label={`Retirer ${player.first_name} ${player.last_name} de la sélection`} disabled={busy} onClick={()=>void removeMember(player.id,`${player.first_name} ${player.last_name}`)}>× Retirer de la sélection</button>
                    {entry.team_player_id && (
                      <a href={`/equipes/${current.team_id}/${entry.team_player_id}`}>
                        Ouvrir la fiche complète
                      </a>
                    )}
                    <button
                      onClick={() =>
                        setShare({
                          playerId: player.id,
                          playerName: `${player.first_name} ${player.last_name}`,
                          email: "",
                          label: player.club_name || "",
                          message: "",
                          accessLevel: "editor",
                        })
                      }
                    >
                      ✉ Envoyer / partager
                    </button>
                  </div>
                </article>
              );
            })}

            {!current.players?.length && (
              <div className="empty">Aucun joueur dans cette sélection.</div>
            )}
          </div>

          </>}
          {detailTab==="documents"&&<section className="selectionDocuments"><div className="documentsHead"><div><h3>Documents · {current.name}</h3><p>Prépare les documents de l’effectif ou des joueurs cochés.</p></div><label>Destinataires<select value={docScope} onChange={event=>{setDocScope(event.target.value as "all"|"checked");setDocAction(null);}}><option value="all">Tout l’effectif ({current.players?.length||0})</option><option value="checked" disabled={!checkedMemberIds.length}>Joueurs cochés ({checkedMemberIds.length})</option></select></label></div><div className="documentChoices">{([{action:"trombinoscope",title:"Trombinoscope",description:"Photos, noms et catégories · PDF"},{action:"note",title:"Convocation",description:"Date, lieu, horaires et liste des joueurs"},{action:"info",title:"Fiche de renseignements",description:"Identités et coordonnées déjà enregistrées"}] as const).map(item=><button key={item.action} disabled={!documentPlayers.length&&item.action!=="info"} className={docAction===item.action?"active":""} onClick={()=>setDocAction(item.action)}><small>DOCUMENT</small><b>{item.title}</b><span>{item.description}</span><em>Préparer pour {documentPlayers.length} joueur(s) →</em></button>)}</div>{!documentPlayers.length&&<p>Ajoute des joueurs à l’effectif ou coche les destinataires depuis l’onglet Effectif.</p>}{docAction&&(docAction==="info"||documentPlayers.length>0)&&<InstitutionalSelectionDocuments key={`${current.id}:${docAction}:${docScope}`} structureId={structureId} selectionId={current.id} selectionName={current.name} players={documentPlayers} initialAction={docAction} onClose={()=>setDocAction(null)}/>}</section>}
          {detailTab==="training"&&<div id="selection-event-tools">{onPrepareSelection&&<button type="button" className="primary" onClick={()=>onPrepareSelection(current.preparation_target_id||current.id)}>Ouvrir la préparation de cette sélection</button>}<InstitutionalSelectionTraining structureId={structureId} selectionId={current.id} preparationSelectionIds={rows.filter(row=>row.preparation_target_id===current.id).map(row=>row.id)} onManageDay={onOpenDetection} onOpenSelection={id=>{void load();setOpened(id);setDetailTab("roster");}}/></div>}
        </section>
      )}

      {share && (
        <div className="shareOverlay" onClick={() => setShare(null)}>
          <div className="shareModal" onClick={(e) => e.stopPropagation()}>
            <small>PARTAGER UNE FICHE JOUEUR</small>
            <h3>{share.playerName}</h3>
            <p>
              Envoie la fiche à une autre Institution, un club ou un coach par
              email. Le destinataire reçoit un lien sécurisé MyBasket.
            </p>

            <label>
              Destinataire / organisation
              <input
                placeholder="AS Monaco, Dijon, Ligue..."
                value={share.label}
                onChange={(e) =>
                  setShare((s) => (s ? { ...s, label: e.target.value } : s))
                }
              />
            </label>

            <label>
              Email
              <input
                type="email"
                placeholder="coach@club.fr"
                value={share.email}
                onChange={(e) =>
                  setShare((s) => (s ? { ...s, email: e.target.value } : s))
                }
              />
            </label>

            <label>
              Droit accordé
              <select
                value={share.accessLevel}
                onChange={(e) =>
                  setShare((s) =>
                    s
                      ? {
                          ...s,
                          accessLevel: e.target.value as
                            | "viewer"
                            | "editor"
                            | "manager",
                        }
                      : s
                  )
                }
              >
                <option value="viewer">Lecture</option>
                <option value="editor">Contribuer / remplir les informations</option>
                <option value="manager">Responsable du suivi</option>
              </select>
            </label>

            <label>
              Message
              <textarea
                rows={4}
                placeholder="Message accompagnant le partage..."
                value={share.message}
                onChange={(e) =>
                  setShare((s) => (s ? { ...s, message: e.target.value } : s))
                }
              />
            </label>

            <div className="shareActions">
              <button onClick={() => setShare(null)}>Annuler</button>
              <button className="primary" disabled={busy} onClick={sendShare}>
                {busy ? "Envoi…" : "Envoyer la fiche"}
              </button>
            </div>

            <div className="pdfNote">
              <b>PDF</b>
              <span>
                L’export PDF complet restera branché ici ensuite : fiche unique
                ou sélection multiple, logo/couleurs de l’Institution et envoi email.
              </span>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        .creationRoster{grid-column:1/-1;width:100%;padding-top:12px;border-top:1px solid #e7deda}.creationRoster h4{margin:0 0 6px;color:#6b1a2c}.detailTabs{display:flex;gap:8px;margin:16px 0}.detailTabs button{border:1px solid #ddcfc8;background:white;color:#6b1a2c;border-radius:999px;padding:10px 16px;font-weight:800}.detailTabs button.active{background:#6b1a2c;color:white}
        .seasonFilter{display:flex;align-items:center;gap:10px;font-weight:800;color:#6b1a2c}.seasonFilter select,.rosterFilters input,.rosterFilters select{border:1px solid #ddcfc8;border-radius:8px;padding:9px;background:white;min-width:0}.rosterFilters{display:flex;flex-wrap:wrap;gap:8px}.rosterFilters input{flex:1}.rosterChecks{display:grid;gap:6px;margin:12px 0;grid-template-columns:repeat(auto-fit,minmax(200px,1fr))}.rosterChecks label{display:flex;gap:8px;align-items:center;border:1px solid #eadfd8;border-radius:9px;padding:9px}.rosterChecks span{display:grid;gap:3px}.rosterChecks small{font-size:.7rem;color:#80716a}.rosterChecks input{width:16px;height:16px;flex:0 0 auto}

        .selections{display:grid;gap:14px}
        .notice{padding:10px 12px;border-radius:10px;border:1px solid #c9e2cf;background:#eef8f1;color:#27623a;font-weight:900}
        .head,.detailHead{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}
        .head small,.detailHead small,.shareModal small{color:#b17a21;font-weight:1000;letter-spacing:.12em}
        .head h3,.detailHead h3,.shareModal h3{margin:4px 0;color:#4d1420}
        .head p,.detailHead p,.panel p,.shareModal p{margin:0;color:#7d6e66;line-height:1.45}
        button,input,select,textarea{font:inherit}
        button{cursor:pointer}
        .primary{border:0;border-radius:10px;background:#6b1a2c;color:#fff;font-weight:900;padding:10px 14px}
        .createSelection{display:grid;grid-template-columns:2fr 120px 140px 150px auto;gap:7px;border:1px solid #ead7b2;background:#fffaf0;border-radius:13px;padding:12px}
        input,select,textarea{min-width:0;border:1px solid #ddcfc8;border-radius:9px;padding:9px 10px;background:#fff}
        .selectionGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px}
        .selectionCard{border:1px solid #e5d9d3;border-radius:12px;background:#fff;text-align:left;padding:13px;display:grid;gap:3px}
        .selectionCard b{color:#3c292d}.selectionCard span{color:#786b65;font-size:.76rem}.selectionCard small{color:#b17a21;font-weight:900}
        .selectionCard.on{border-color:#6b1a2c;box-shadow:inset 0 0 0 1px #6b1a2c;background:#fff8fa}
        .detail{display:grid;gap:12px;border-top:1px solid #eadfd8;padding-top:14px}
        .detailActions{display:flex;gap:7px;flex-wrap:wrap}
        .detailActions a{border-radius:9px;background:#fff;color:#6b1a2c;border:1px solid #d9cbc5;text-decoration:none;font-weight:900;padding:9px 12px}
        .featureStrip{display:grid;grid-template-columns:repeat(6,1fr);gap:6px}
        .featureStrip span{border:1px solid #eadfd8;border-radius:10px;padding:9px;background:#fff;color:#796a64;font-size:.67rem}
        .featureStrip b{display:block;color:#6b1a2c;font-size:.72rem}
        .twoCols{display:grid;grid-template-columns:1fr 1fr;gap:9px}
        .panel{border:1px solid #eadfd8;border-radius:12px;padding:13px;background:#fff}
        .panel h4{margin:0 0 4px;color:#4d1420}.panel p{font-size:.76rem;margin-bottom:9px}
        .inline{display:flex;gap:7px}.inline>input,.inline>select{flex:1}
        .chips{display:flex;flex-wrap:wrap;gap:5px;margin-top:8px}.chips span{border-radius:999px;background:#f7edda;color:#6b1a2c;padding:5px 8px;font-size:.68rem;font-weight:900}
        .roster{display:grid;gap:7px}.rosterHead{display:flex;justify-content:space-between;gap:12px;color:#6b1a2c}.rosterHead span{color:#7a6c66;font-size:.72rem}
        .roster article{display:grid;grid-template-columns:52px minmax(150px,1fr) minmax(220px,1fr) minmax(220px,1fr) auto;gap:10px;align-items:center;border:1px solid #eadfd8;border-radius:12px;padding:11px;background:#fff}
        .avatar{width:52px;height:52px;border-radius:50%;background:#6b1a2c;color:#fff;display:grid;place-items:center;font-weight:1000;overflow:hidden}.avatar img{width:100%;height:100%;object-fit:cover}
        .identity{display:grid;gap:2px}.identity b{color:#35272a}.identity span{color:#796c66;font-size:.72rem}.identity small{color:#b17a21;font-weight:900}
        .context,.userLink{display:grid;grid-template-columns:1fr auto;gap:5px}.context label,.userLink label{grid-column:1/-1;color:#7d6d66;font-size:.64rem;font-weight:900}
        .context button,.userLink button,.openLinks button{border:1px solid #d9cbc5;border-radius:8px;background:#fff;color:#6b1a2c;font-weight:900}
        .openLinks{display:grid;gap:5px}.openLinks a{white-space:nowrap;text-decoration:none;border-radius:8px;background:#6b1a2c;color:#fff;padding:7px 9px;font-size:.7rem;font-weight:900;text-align:center}.openLinks button{padding:7px 9px;font-size:.7rem}
        .empty{border:1px dashed #ddcfc8;border-radius:12px;padding:20px;text-align:center;color:#897a73}
        .shareOverlay{position:fixed;inset:0;background:rgba(30,18,21,.48);z-index:200;display:grid;place-items:center;padding:20px}
        .shareModal{width:min(560px,100%);background:#fff;border-radius:16px;padding:20px;box-shadow:0 24px 70px rgba(0,0,0,.25);display:grid;gap:10px}
        .shareModal label{display:grid;gap:5px;color:#6f6059;font-size:.74rem;font-weight:900}
        .shareActions{display:flex;justify-content:flex-end;gap:7px}.shareActions>button:not(.primary){border:1px solid #ddcfc8;border-radius:9px;background:#fff;color:#6b1a2c;font-weight:900;padding:9px 12px}
        .pdfNote{border-left:4px solid #d4a24c;background:#fff9ec;border-radius:8px;padding:10px 12px;display:grid;gap:2px}.pdfNote b{color:#6b1a2c}.pdfNote span{font-size:.72rem;color:#766961}
        @media(max-width:1100px){.featureStrip{grid-template-columns:repeat(3,1fr)}.removeFromSelection{color:#a32d49!important;border:1px solid #dfbdc7!important;background:#fff!important;border-radius:6px;padding:7px 9px;cursor:pointer}.teamActions{display:flex;gap:12px;align-items:center;flex-wrap:wrap}.selectionGrid{grid-template-columns:repeat(2,minmax(0,1fr))}.roster article{grid-template-columns:52px 1fr 1fr}.userLink,.openLinks{grid-column:2/-1}}
        @media(max-width:800px){.head,.detailHead{flex-direction:column}.createSelection,.selectionGrid,.twoCols{grid-template-columns:1fr}.featureStrip{grid-template-columns:repeat(2,1fr)}.inline{flex-direction:column}.roster article{grid-template-columns:52px 1fr}.context,.userLink,.openLinks{grid-column:1/-1}}

        .twoCols{grid-template-columns:minmax(0,1fr);align-items:start}.staffPanel{padding:9px 12px;background:#faf9f8}.staffPanel summary{cursor:pointer;color:#6b1a2c;font-weight:700;font-size:.8rem}.staffPanel[open] summary{margin-bottom:12px}.panel.rosterComposer{padding:12px}.rosterFilters{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0}.rosterFilters input{flex:1;min-width:180px}.rosterChecks{display:grid;grid-template-columns:1fr;gap:0;max-height:none;overflow:visible}.rosterChecks label{display:flex;align-items:center;gap:10px;min-height:36px;padding:6px 10px;border:0;border-bottom:1px solid #eee8e4;border-radius:0;font-size:.8rem}.rosterChecks label>input{width:16px;height:16px;flex:none;accent-color:#6b1a2c}.rosterChecks label>span{display:grid;grid-template-columns:minmax(170px,1fr) minmax(140px,1fr);align-items:center;gap:12px;width:100%;min-width:0}.rosterChecks b{font-size:.8rem;font-weight:650;line-height:1.35}.rosterChecks small{font-size:.72rem;line-height:1.35;color:#84756f}.selectionActionBar{display:flex;gap:7px;flex-wrap:wrap;align-items:center;padding:9px 0;background:#fff;position:sticky;top:70px;z-index:2;border-bottom:1px solid #e7ddd7}.selectionActionBar button{padding:7px 10px;border:1px solid #e0d4cd;border-radius:7px;background:white;color:#6b1a2c;font-size:.75rem}.selectionActionBar .primary{background:#6b1a2c;color:white}.selectionActionBar button:disabled{opacity:.45;cursor:default}.selectionActionBar .groupAction{background:#f4f0eb}.selectionActionBar span{font-size:.7rem;color:#87766f}.detailActions button,.detailActions a{font-size:.75rem;padding:7px 10px}.selectionCard{padding:10px;border-radius:8px}.selectionCard b{font-size:.85rem}.head p,.detailHead p{font-size:.8rem}.roster article{padding:8px;border-radius:8px}.avatar{width:38px;height:38px}.roster article{grid-template-columns:38px minmax(140px,1fr) minmax(200px,1fr) minmax(200px,1fr) auto}@media(max-width:800px){.roster article{grid-template-columns:38px 1fr}.rosterChecks label>span{grid-template-columns:1fr;gap:2px}.selectionActionBar{top:56px}.twoCols{grid-template-columns:1fr}}

        .selectionGrid{grid-template-columns:repeat(auto-fit,minmax(230px,1fr))}.memberBulk{display:flex;gap:8px;flex-wrap:wrap;align-items:center;border-bottom:1px solid #e5d9d3;padding:9px 0;position:sticky;top:65px;background:white;z-index:2}.memberBulk button{border:1px solid #e0d5ce;background:white;border-radius:7px;padding:7px 10px;color:#6b1a2c;font-size:.75rem}.memberBulk b{font-size:.72rem;color:#9a8176}.memberBulk .removeBulk{color:#a3424d;border-color:#ead0d4}.memberBulk button:disabled{opacity:.4;cursor:default}.roster article{grid-template-columns:22px 38px minmax(140px,1fr) 165px 170px;gap:10px;padding:10px 6px;border:0;border-bottom:1px solid #eee5de;border-radius:0}.roster article.memberChecked{background:#fcf3f6}.memberCheck{width:16px;height:16px;accent-color:#6b1a2c;cursor:pointer}.memberSettings summary{font-size:.72rem;color:#968075;cursor:pointer}.memberSettings>div{display:grid;gap:12px;margin-top:10px;min-width:0}.identity b{font-size:.83rem;font-weight:650}.identity small{font-size:.64rem}.rosterComposer summary{color:#6b1a2c;font-weight:750;font-size:.8rem;cursor:pointer}.rosterComposer[open] summary{margin-bottom:12px}.selectionDocuments{display:grid;gap:16px}.documentsHead{display:flex;justify-content:space-between;gap:16px;flex-wrap:wrap}.documentsHead h3{font-size:1rem;margin:0 0 5px;color:#6b1a2c}.documentsHead p{font-size:.78rem;color:#9b867d;margin:0}.documentsHead label{display:grid;gap:5px;font-size:.7rem;color:#90786d}.documentChoices{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.documentChoices button{display:grid;gap:9px;text-align:left;padding:18px;background:white;border:1px solid #e7dcd3;border-radius:10px;color:#6b1a2c;cursor:pointer}.documentChoices button.active{background:#fcf6f8;border-color:#a57382}.documentChoices small{font-size:.58rem;letter-spacing:.14em;color:#b69881}.documentChoices b{font-size:.95rem}.documentChoices span{font-size:.73rem;line-height:1.5;color:#9b887e}.documentChoices em{font-style:normal;font-size:.72rem;font-weight:700;margin-top:7px}.detailTabs{border-bottom:1px solid #e9ddd5;gap:18px;margin:8px 0}.detailTabs button{padding:10px 3px;border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:#a0877b;font-size:.8rem}.detailTabs button.active{background:transparent;color:#6b1a2c;border-color:#6b1a2c}.selectionCard{box-shadow:none}.asm button:disabled{cursor:default}.selectionDocuments :global(.selectionDocs){border-radius:10px}@media(max-width:900px){.roster article{grid-template-columns:22px 38px minmax(0,1fr)}.memberSettings{grid-column:3}.openLinks{grid-column:3;display:flex;flex-wrap:wrap}.documentChoices{grid-template-columns:1fr}.memberBulk{top:56px}}
      `}</style>
    </div>
  );
}
