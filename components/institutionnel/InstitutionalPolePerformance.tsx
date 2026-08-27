"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import PolePerformanceOverview from "@/components/institutionnel/PolePerformanceOverview";
import PoleSeasonTransition from "@/components/institutionnel/PoleSeasonTransition";
import PoleFollowupManager from "@/components/institutionnel/PoleFollowupManager";

type TeamKind = "pole" | "partner";
type Data = {
  structure?: any;
  links: any[];
  teams: any[];
  seasons: any[];
  memberships: any[];
  playerLinks: any[];
  grants: any[];
  invitations: any[];
};

const EMPTY_PLAYER = {
  firstName:"",lastName:"",birthdate:"",sex:"",email:"",phone:"",photoUrl:"",clubName:"",category:"",
  yearsBasket:"",heightCm:"",weightKg:"",wingspanCm:"",fatherHeightCm:"",motherHeightCm:"",
  positionPrimary:"",positionSecondary:"",dominantHand:"Droite",licenseNumber:"",school:"",className:"",
  address:"",postalCode:"",city:"",tutor1Name:"",tutor1Email:"",tutor1Phone:"",tutor2Name:"",tutor2Email:"",tutor2Phone:"",
  measuredAt:new Date().toISOString().slice(0,10),
};

export default function InstitutionalPolePerformance({ structureId }: { structureId: string }) {
  const [data,setData]=useState<Data>({links:[],teams:[],seasons:[],memberships:[],playerLinks:[],grants:[],invitations:[]});
  const [season,setSeason]=useState("2026-2027");
  const [loading,setLoading]=useState(true);
  const [message,setMessage]=useState("");
  const [createKind,setCreateKind]=useState<TeamKind|null>(null);
  const [teamForm,setTeamForm]=useState({name:"",clubName:"",category:"",coachFirstName:"",coachLastName:"",coachEmail:""});
  const [selectedPoleTeam,setSelectedPoleTeam]=useState("");
  const [playerForm,setPlayerForm]=useState({...EMPTY_PLAYER});
  const [showPlayerForm,setShowPlayerForm]=useState(false);
  const [secondaryByMembership,setSecondaryByMembership]=useState<Record<string,string>>({});
  const [inviteTeamId,setInviteTeamId]=useState("");
  const [invite,setInvite]=useState({firstName:"",lastName:"",email:""});
  const [importSource,setImportSource]=useState("");
  const [importIds,setImportIds]=useState<string[]>([]);
  const [view,setView]=useState<"pole"|"partners"|"players"|"followup"|"seasons">("pole");

  async function load() {
    setLoading(true);
    const r=await fetch(`/api/institutionnel/pole-performance?structureId=${encodeURIComponent(structureId)}`,{cache:"no-store"});
    const j=await r.json(); setLoading(false);
    if(!r.ok){alert(j.error||"Chargement impossible");return}
    setData(j);
    if(j.seasons?.length && !j.seasons.some((s:any)=>s.season_label===season)) setSeason(j.seasons[0].season_label);
  }
  useEffect(()=>{void load()},[structureId]); // eslint-disable-line

  const teamMap=useMemo<Map<string, any>>(()=>new Map<string, any>(data.teams.map((t:any)=>[String(t.id),t])),[data.teams]);
  const poleLinks=data.links.filter(x=>x.team_kind==="pole"&&x.season_label===season);
  const partnerLinks=data.links.filter(x=>x.team_kind==="partner"&&x.season_label===season);
  const poleTeamIds=new Set(poleLinks.map(x=>String(x.team_id)));
  const currentMemberships=data.memberships.filter(m=>poleTeamIds.has(String(m.pole_team_id)));
  const selectedMemberships=currentMemberships.filter(m=>!selectedPoleTeam||String(m.pole_team_id)===selectedPoleTeam);
  const sourceTeams=data.links.filter(x=>x.team_kind==="pole"&&x.season_label!==season);
  const sourceMemberships=data.memberships.filter(m=>String(m.pole_team_id)===importSource);

  async function post(body:any){
    const r=await fetch("/api/institutionnel/pole-performance",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({structureId,...body})});
    const j=await r.json(); if(!r.ok)throw new Error(j.error||"Opération impossible");
    setMessage("Enregistré ✓");setTimeout(()=>setMessage(""),1800);await load();return j;
  }

  async function createTeam(){
    try{
      const res=await post({action:"createTeam",teamKind:createKind,name:teamForm.name,clubName:teamForm.clubName,category:teamForm.category,seasonLabel:season});
      if(createKind==="pole")setSelectedPoleTeam(res.teamId);
      if(createKind==="partner"&&teamForm.coachEmail){await sendInvite(res.teamId,teamForm.coachEmail,teamForm.coachFirstName,teamForm.coachLastName)}
      setTeamForm({name:"",clubName:"",category:"",coachFirstName:"",coachLastName:"",coachEmail:""});setCreateKind(null);
    }catch(e:any){alert(e.message)}
  }

  async function sendInvite(teamId:string,email=invite.email,firstName=invite.firstName,lastName=invite.lastName){
    const r=await fetch("/api/institutionnel/pole-performance/invitations",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({structureId,teamId,email,firstName,lastName})});
    const j=await r.json();if(!r.ok)return alert(j.error||"Invitation impossible");
    alert("Invitation envoyée. Le coach recevra le Premium et deviendra coach principal à l'acceptation.");setInvite({firstName:"",lastName:"",email:""});setInviteTeamId("");await load();
  }

  async function createPlayer(){
    if(!selectedPoleTeam)return alert("Choisis d'abord une équipe Pôle.");
    try{const j=await post({action:"createPlayer",poleTeamId:selectedPoleTeam,seasonLabel:season,...playerForm});setPlayerForm({...EMPTY_PLAYER});setShowPlayerForm(false);if(j.playerId)window.location.href=`/equipes/${selectedPoleTeam}/${j.playerId}`}
    catch(e:any){alert(e.message)}
  }

  async function assignSecondary(membershipId:string){
    const partnerTeamId=secondaryByMembership[membershipId];if(!partnerTeamId)return;
    try{await post({action:"assignPlayer",membershipId,partnerTeamId});}catch(e:any){alert(e.message)}
  }

  async function importPlayers(){
    if(!selectedPoleTeam||!importSource||!importIds.length)return alert("Choisis l'équipe source, l'équipe Pôle actuelle et au moins un joueur.");
    try{const j=await post({action:"importPlayers",sourcePoleTeamId:importSource,targetPoleTeamId:selectedPoleTeam,institutionalPlayerIds:importIds});alert(`${j.imported||0} joueur(s) repris sans recréer leur identité.`);setImportIds([])}catch(e:any){alert(e.message)}
  }

  if(loading)return <div className="empty">Chargement du Pôle / Performance…</div>;

  const activePolePlayers=currentMemberships.length;
  const pendingInvites=data.invitations.filter(i=>i.status==="pending").length;

  return <div className="pole">
    {message&&<div className="toast">{message}</div>}

    <header className="hero">
      <div className="heroCopy">
        <p className="eyebrow">PÔLE / PERFORMANCE · LIGUE</p>
        <h2>Le cockpit de votre Pôle</h2>
        <span>Équipes, polistes, clubs partenaires et suivi longitudinal dans un seul espace.</span>
      </div>
      <div className="season">
        <label>Saison sportive</label>
        <input value={season} onChange={e=>setSeason(e.target.value)} placeholder="2026-2027"/>
      </div>
    </header>

    <div className="kpis">
      <button onClick={()=>setView("pole")}><strong>{poleLinks.length}</strong><span>Équipes Pôle</span></button>
      <button onClick={()=>setView("partners")}><strong>{partnerLinks.length}</strong><span>Partenaires</span></button>
      <button onClick={()=>setView("players")}><strong>{activePolePlayers}</strong><span>Polistes</span></button>
      <button onClick={()=>setView("partners")}><strong>{pendingInvites}</strong><span>Invitations</span></button>
    </div>

    <nav className="tabs" aria-label="Navigation Pôle Performance">
      <button className={view==="pole"?"active":""} onClick={()=>setView("pole")}>Équipes Pôle</button>
      <button className={view==="partners"?"active":""} onClick={()=>setView("partners")}>Partenaires</button>
      <button className={view==="players"?"active":""} onClick={()=>setView("players")}>Polistes</button>
      <button className={view==="followup"?"active":""} onClick={()=>setView("followup")}>Suivi</button>
      <button className={view==="seasons"?"active":""} onClick={()=>setView("seasons")}>Saisons</button>
    </nav>

    {view==="pole"&&<section className="workspace">
      <div className="workspaceHead">
        <div>
          <p className="eyebrow">ÉQUIPES PÔLE</p>
          <h3>Vos équipes de performance</h3>
          <span>Chaque carte ouvre la vraie fiche équipe MyBasket.</span>
        </div>
        <button onClick={()=>setCreateKind("pole")}>+ Créer une équipe Pôle</button>
      </div>
      <div className="teamGrid">
        {poleLinks.map(x=>{
          const t=teamMap.get(String(x.team_id));
          const count=data.memberships.filter(m=>String(m.pole_team_id)===String(x.team_id)).length;
          return <article className="teamCard" key={x.id}>
            <div className="teamMark">P</div>
            <div className="teamInfo">
              <small>{season}</small>
              <h4>{t?.name||"Équipe Pôle"}</h4>
              <p>{t?.category||"Catégorie non renseignée"}</p>
              <div className="meta"><span>{count} poliste(s)</span><span>Équipe Pôle</span></div>
            </div>
            <div className="cardActions">
              <button className="ghost" onClick={()=>{setSelectedPoleTeam(String(x.team_id));setView("players")}}>Effectif</button>
              <Link href={`/equipes/${x.team_id}`}>Ouvrir →</Link>
            </div>
          </article>
        })}
        {!poleLinks.length&&<EmptyState title={`Aucune équipe Pôle en ${season}`} text="Créez votre première équipe pour commencer à constituer l'effectif." action={<button onClick={()=>setCreateKind("pole")}>+ Créer une équipe Pôle</button>}/>}
      </div>
    </section>}

    {view==="partners"&&<section className="workspace">
      <div className="workspaceHead">
        <div>
          <p className="eyebrow">CLUBS PARTENAIRES</p>
          <h3>Équipes & collaborations</h3>
          <span>La Ligue supervise ; le coach invité garde la main sur son équipe.</span>
        </div>
        <button onClick={()=>setCreateKind("partner")}>+ Créer une équipe partenaire</button>
      </div>
      <div className="teamGrid">
        {partnerLinks.map(x=>{
          const t=teamMap.get(String(x.team_id));
          const inv=data.invitations.find(i=>String(i.team_id)===String(x.team_id)&&i.status==="pending");
          const linked=data.playerLinks.filter(l=>String(l.partner_team_id)===String(x.team_id)).length;
          return <article className="teamCard partner" key={x.id}>
            <div className="teamMark">C</div>
            <div className="teamInfo">
              <small>{t?.club_name||"CLUB PARTENAIRE"}</small>
              <h4>{t?.name||"Équipe partenaire"}</h4>
              <p>{t?.category||"Catégorie non renseignée"}</p>
              <div className="meta"><span>{linked} poliste(s)</span><span>{t?.coach_name?`Coach : ${t.coach_name}`:"Coach à inviter"}</span></div>
              {inv&&<div className="pending">Invitation en attente · {inv.coach_email}</div>}
            </div>
            <div className="cardActions">
              <button className="ghost" onClick={()=>setInviteTeamId(String(x.team_id))}>Inviter coach</button>
              <Link href={`/equipes/${x.team_id}`}>Superviser →</Link>
            </div>
          </article>
        })}
        {!partnerLinks.length&&<EmptyState title="Aucun partenaire" text="Créez une équipe partenaire puis invitez son coach principal." action={<button onClick={()=>setCreateKind("partner")}>+ Ajouter un partenaire</button>}/>}
      </div>
    </section>}

    {view==="players"&&<section className="workspace">
      <div className="workspaceHead">
        <div>
          <p className="eyebrow">POLISTES</p>
          <h3>Effectif & rattachements</h3>
          <span>Une seule identité joueur, reliée au Pôle et à son club.</span>
        </div>
        <button onClick={()=>{if(!selectedPoleTeam&&poleLinks[0])setSelectedPoleTeam(String(poleLinks[0].team_id));setShowPlayerForm(true)}}>+ Créer un poliste</button>
      </div>
      <div className="filterRow">
        <label>Équipe Pôle
          <select value={selectedPoleTeam} onChange={e=>setSelectedPoleTeam(e.target.value)}>
            <option value="">Toutes les équipes</option>
            {poleLinks.map(x=><option key={x.id} value={x.team_id}>{teamMap.get(String(x.team_id))?.name||"Équipe Pôle"}</option>)}
          </select>
        </label>
      </div>
      <div className="playerGrid">
        {selectedMemberships.map(m=>{
          const p=m.institutional_players||{};
          const link=data.playerLinks.find(l=>String(l.institutional_player_id)===String(m.institutional_player_id)&&String(l.pole_team_id)===String(m.pole_team_id));
          const secondary=link?teamMap.get(String(link.partner_team_id)):null;
          return <article className="playerCard" key={m.id}>
            <div className="playerTop">
              <span className="avatar">{p.photo_url?<img src={p.photo_url} alt=""/>:(p.first_name?.[0]||"?")}</span>
              <div>
                <h4>{p.first_name} {p.last_name}</h4>
                <p>{p.sex==="F"?"Fille":p.sex==="M"?"Garçon":"—"} · {p.category||"—"} · {p.height_cm?`${p.height_cm} cm`:"taille —"}</p>
                <small>{p.club_name||"Club non renseigné"}</small>
              </div>
            </div>
            <div className="playerLink">
              {secondary?<><small>ÉQUIPE SECONDAIRE</small><strong>{secondary.name}</strong></>:<>
                <small>ÉQUIPE SECONDAIRE</small>
                <div className="assign">
                  <select value={secondaryByMembership[m.id]||""} onChange={e=>setSecondaryByMembership(v=>({...v,[m.id]:e.target.value}))}>
                    <option value="">Choisir…</option>
                    {partnerLinks.map(x=><option key={x.id} value={x.team_id}>{teamMap.get(String(x.team_id))?.name}</option>)}
                  </select>
                  <button onClick={()=>assignSecondary(m.id)}>Rattacher</button>
                </div>
              </>}
            </div>
            <Link className="playerOpen" href={`/equipes/${m.pole_team_id}/${m.pole_player_id}`}>Ouvrir la fiche joueur →</Link>
          </article>
        })}
        {!selectedMemberships.length&&<EmptyState title="Aucun poliste à afficher" text={poleLinks.length?"Créez un joueur ou sélectionnez une autre équipe.":"Créez d'abord une équipe Pôle."}/>}
      </div>
    </section>}

    {view==="followup"&&<div className="moduleStack">
      <PolePerformanceOverview structureId={structureId} season={season}/>
      <PoleFollowupManager structureId={structureId} season={season}/>
    </div>}

    {view==="seasons"&&<div className="moduleStack">
      <PoleSeasonTransition structureId={structureId} currentSeason={season}/>
      {sourceTeams.length>0&&selectedPoleTeam&&<section className="workspace compact">
        <div className="workspaceHead">
          <div>
            <p className="eyebrow">REPRISE MANUELLE</p>
            <h3>Reprendre des polistes</h3>
            <span>Le joueur conserve son identité et tout son historique.</span>
          </div>
        </div>
        <div className="importBar">
          <select value={importSource} onChange={e=>{setImportSource(e.target.value);setImportIds([])}}>
            <option value="">Équipe Pôle précédente…</option>
            {sourceTeams.map(x=><option key={x.id} value={x.team_id}>{teamMap.get(String(x.team_id))?.name||"Équipe Pôle"} · {x.season_label}</option>)}
          </select>
          <button disabled={!importIds.length} onClick={importPlayers}>Importer {importIds.length?`(${importIds.length})`:""}</button>
        </div>
        {importSource&&<div className="checks">{sourceMemberships.map(m=>{const p=m.institutional_players||{};return <label key={m.id}><input type="checkbox" checked={importIds.includes(String(m.institutional_player_id))} onChange={e=>setImportIds(v=>e.target.checked?[...v,String(m.institutional_player_id)]:v.filter(id=>id!==String(m.institutional_player_id)))}/><span>{p.first_name} {p.last_name}</span></label>})}</div>}
      </section>}
    </div>}

    {createKind&&<Modal title={createKind==="pole"?"Créer une équipe Pôle":"Créer une équipe partenaire"} onClose={()=>setCreateKind(null)}><div className="formgrid"><Field label="Nom de l'équipe"><input value={teamForm.name} onChange={e=>setTeamForm({...teamForm,name:e.target.value})} placeholder={createKind==="pole"?"Pôle Espoir Masculin":"Paris Basketball U15 France"}/></Field><Field label="Club / structure"><input value={teamForm.clubName} onChange={e=>setTeamForm({...teamForm,clubName:e.target.value})}/></Field><Field label="Catégorie / championnat"><input value={teamForm.category} onChange={e=>setTeamForm({...teamForm,category:e.target.value})} placeholder="U15 France"/></Field><Field label="Saison"><input value={season} disabled/></Field>{createKind==="partner"&&<><Field label="Prénom coach"><input value={teamForm.coachFirstName} onChange={e=>setTeamForm({...teamForm,coachFirstName:e.target.value})}/></Field><Field label="Nom coach"><input value={teamForm.coachLastName} onChange={e=>setTeamForm({...teamForm,coachLastName:e.target.value})}/></Field><Field label="Email coach"><input type="email" value={teamForm.coachEmail} onChange={e=>setTeamForm({...teamForm,coachEmail:e.target.value})} placeholder="coach@club.fr"/></Field></>}</div><div className="modalActions"><button className="ghost" onClick={()=>setCreateKind(null)}>Annuler</button><button onClick={createTeam}>{createKind==="partner"?"Créer et inviter le coach":"Créer l'équipe Pôle"}</button></div></Modal>}

    {showPlayerForm&&<Modal title="Créer un poliste" onClose={()=>setShowPlayerForm(false)}><PlayerForm value={playerForm} onChange={setPlayerForm}/><div className="modalActions"><button className="ghost" onClick={()=>setShowPlayerForm(false)}>Annuler</button><button onClick={createPlayer}>Créer la fiche joueur</button></div></Modal>}

    {inviteTeamId&&<Modal title="Inviter le coach principal" onClose={()=>setInviteTeamId("")}><div className="formgrid"><Field label="Prénom"><input value={invite.firstName} onChange={e=>setInvite({...invite,firstName:e.target.value})}/></Field><Field label="Nom"><input value={invite.lastName} onChange={e=>setInvite({...invite,lastName:e.target.value})}/></Field><Field label="Email"><input type="email" value={invite.email} onChange={e=>setInvite({...invite,email:e.target.value})}/></Field></div><p className="hint">À l'acceptation, le coach devient propriétaire opérationnel de l'équipe. La Ligue reste superviseur et le Premium est offert pendant un an.</p><div className="modalActions"><button className="ghost" onClick={()=>setInviteTeamId("")}>Annuler</button><button onClick={()=>sendInvite(inviteTeamId)}>Envoyer l'invitation</button></div></Modal>}

    <style jsx>{css}</style>
  </div>;
}

function PlayerForm({value,onChange}:{value:any;onChange:(v:any)=>void}){const set=(k:string,v:any)=>onChange({...value,[k]:v});return <div className="playerForm"><h4>Identité</h4><div className="formgrid"><Field label="Prénom *"><input value={value.firstName} onChange={e=>set("firstName",e.target.value)}/></Field><Field label="Nom *"><input value={value.lastName} onChange={e=>set("lastName",e.target.value)}/></Field><Field label="Date de naissance"><input type="date" value={value.birthdate} onChange={e=>set("birthdate",e.target.value)}/></Field><Field label="Sexe"><select value={value.sex} onChange={e=>set("sex",e.target.value)}><option value="">—</option><option value="M">Garçon</option><option value="F">Fille</option></select></Field><Field label="Photo URL"><input value={value.photoUrl} onChange={e=>set("photoUrl",e.target.value)}/></Field><Field label="N° licence"><input value={value.licenseNumber} onChange={e=>set("licenseNumber",e.target.value)}/></Field></div><h4>Basket</h4><div className="formgrid"><Field label="Club actuel"><input value={value.clubName} onChange={e=>set("clubName",e.target.value)}/></Field><Field label="Catégorie"><input value={value.category} onChange={e=>set("category",e.target.value)}/></Field><Field label="Poste principal"><input value={value.positionPrimary} onChange={e=>set("positionPrimary",e.target.value)}/></Field><Field label="Poste secondaire"><input value={value.positionSecondary} onChange={e=>set("positionSecondary",e.target.value)}/></Field><Field label="Main dominante"><select value={value.dominantHand} onChange={e=>set("dominantHand",e.target.value)}><option>Droite</option><option>Gauche</option><option>Ambidextre</option></select></Field><Field label="Années basket"><input type="number" value={value.yearsBasket} onChange={e=>set("yearsBasket",e.target.value)}/></Field></div><h4>Mesures initiales</h4><div className="formgrid"><Field label="Date mesure"><input type="date" value={value.measuredAt} onChange={e=>set("measuredAt",e.target.value)}/></Field><Field label="Taille cm"><input type="number" step="0.1" value={value.heightCm} onChange={e=>set("heightCm",e.target.value)}/></Field><Field label="Poids kg"><input type="number" step="0.1" value={value.weightKg} onChange={e=>set("weightKg",e.target.value)}/></Field><Field label="Envergure cm"><input type="number" step="0.1" value={value.wingspanCm} onChange={e=>set("wingspanCm",e.target.value)}/></Field><Field label="Taille mère"><input type="number" step="0.1" value={value.motherHeightCm} onChange={e=>set("motherHeightCm",e.target.value)}/></Field><Field label="Taille père"><input type="number" step="0.1" value={value.fatherHeightCm} onChange={e=>set("fatherHeightCm",e.target.value)}/></Field></div><h4>Scolarité & coordonnées</h4><div className="formgrid"><Field label="Email joueur"><input type="email" value={value.email} onChange={e=>set("email",e.target.value)}/></Field><Field label="Téléphone"><input value={value.phone} onChange={e=>set("phone",e.target.value)}/></Field><Field label="Établissement scolaire"><input value={value.school} onChange={e=>set("school",e.target.value)}/></Field><Field label="Classe"><input value={value.className} onChange={e=>set("className",e.target.value)}/></Field><Field label="Adresse"><input value={value.address} onChange={e=>set("address",e.target.value)}/></Field><Field label="Code postal"><input value={value.postalCode} onChange={e=>set("postalCode",e.target.value)}/></Field><Field label="Ville"><input value={value.city} onChange={e=>set("city",e.target.value)}/></Field></div><h4>Responsables</h4><div className="formgrid"><Field label="Responsable 1"><input value={value.tutor1Name} onChange={e=>set("tutor1Name",e.target.value)}/></Field><Field label="Email responsable 1"><input type="email" value={value.tutor1Email} onChange={e=>set("tutor1Email",e.target.value)}/></Field><Field label="Téléphone responsable 1"><input value={value.tutor1Phone} onChange={e=>set("tutor1Phone",e.target.value)}/></Field><Field label="Responsable 2"><input value={value.tutor2Name} onChange={e=>set("tutor2Name",e.target.value)}/></Field><Field label="Email responsable 2"><input type="email" value={value.tutor2Email} onChange={e=>set("tutor2Email",e.target.value)}/></Field><Field label="Téléphone responsable 2"><input value={value.tutor2Phone} onChange={e=>set("tutor2Phone",e.target.value)}/></Field></div></div>}
function EmptyState({title,text,action}:{title:string;text:string;action?:ReactNode}){return <div className="emptyState"><div className="emptyIcon">◎</div><h4>{title}</h4><p>{text}</p>{action&&<div>{action}</div>}</div>}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal"><div className="modalHead"><h3>{title}</h3><button className="close" onClick={onClose}>×</button></div>{children}</div></div>}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="field"><span>{label}</span>{children}</label>}

const css=`.pole{display:grid;gap:18px;min-width:0}.hero{position:relative;overflow:hidden;display:flex;justify-content:space-between;align-items:flex-end;gap:24px;padding:26px 28px;border-radius:24px;background:linear-gradient(125deg,#511321 0%,#6b1a2c 58%,#8a2d42 100%);box-shadow:0 14px 38px rgba(64,16,29,.14);color:#fff}.hero:after{content:"";position:absolute;width:260px;height:260px;border-radius:50%;right:110px;top:-185px;border:42px solid rgba(212,162,76,.16)}.heroCopy{position:relative;z-index:1}.eyebrow{margin:0 0 6px;color:#d4a24c;font-size:.68rem;font-weight:1000;letter-spacing:.14em}.hero h2{margin:0 0 6px;font-size:1.65rem;letter-spacing:-.03em}.hero span{color:#f2dfe4;font-size:.84rem}.season{position:relative;z-index:1;display:grid;gap:5px;min-width:170px}.season label{font-size:.68rem;font-weight:900;color:#f2dfe4}.season input{border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.1);color:#fff;border-radius:12px;padding:10px 12px;outline:none}.kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px}.kpis button{display:grid;text-align:left;gap:2px;padding:15px 17px!important;background:#fff!important;color:#2a1d20!important;border:1px solid #eadfda!important;border-radius:16px!important;box-shadow:0 4px 16px rgba(47,28,34,.04)}.kpis strong{font-size:1.45rem;color:#6b1a2c}.kpis span{font-size:.73rem;color:#82736d;font-weight:800}.tabs{display:flex;gap:5px;padding:5px;background:#f4efec;border-radius:14px;overflow-x:auto}.tabs button{white-space:nowrap;background:transparent!important;color:#6f6064!important;border:0!important;padding:9px 14px!important}.tabs button.active{background:#fff!important;color:#6b1a2c!important;box-shadow:0 2px 10px rgba(51,31,36,.08)}.workspace{min-width:0;border:1px solid #eadfda;border-radius:22px;padding:20px;background:#fff}.workspace.compact{margin-top:12px}.workspaceHead{display:flex;justify-content:space-between;gap:20px;align-items:flex-start;margin-bottom:17px}.workspaceHead h3{margin:0;color:#2b1e21;font-size:1.18rem}.workspaceHead span{display:block;margin-top:4px;color:#857670;font-size:.77rem}.pole button,.cardActions a,.playerOpen{border:0;border-radius:10px;padding:9px 12px;background:#6b1a2c;color:#fff;font-weight:900;text-decoration:none;cursor:pointer;font-size:.75rem}.ghost{background:#fff!important;color:#6b1a2c!important;border:1px solid #dccdc8!important}.teamGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.teamCard{min-width:0;display:grid;grid-template-columns:auto minmax(0,1fr);gap:13px;padding:17px;border:1px solid #eadfda;border-radius:18px;background:linear-gradient(180deg,#fff,#fdfafa);transition:.15s ease}.teamCard:hover{transform:translateY(-1px);box-shadow:0 9px 25px rgba(54,29,36,.07)}.teamMark{width:46px;height:46px;border-radius:14px;display:grid;place-items:center;background:#f5e8eb;color:#6b1a2c;font-weight:1000;font-size:1rem}.partner .teamMark{background:#fbf3e4;color:#9a6d20}.teamInfo{min-width:0}.teamInfo small{font-size:.62rem;font-weight:900;letter-spacing:.08em;color:#9b8c86}.teamInfo h4{margin:3px 0 2px;color:#2c2023;font-size:.98rem}.teamInfo p{margin:0;color:#82736d;font-size:.74rem}.meta{display:flex;gap:6px;flex-wrap:wrap;margin-top:10px}.meta span,.pending{padding:5px 8px;border-radius:999px;background:#f4efec;color:#776761;font-size:.64rem;font-weight:800}.pending{display:inline-block;margin-top:7px;background:#fff6df;color:#8a611b}.cardActions{grid-column:1/-1;display:flex;justify-content:flex-end;gap:6px;border-top:1px solid #f0e8e4;padding-top:11px}.filterRow{display:flex;margin-bottom:14px}.filterRow label{display:grid;gap:5px;font-size:.67rem;font-weight:900;color:#6b1a2c}.filterRow select,.assign select,.importBar select{min-width:220px;border:1px solid #ddd1ca;border-radius:10px;padding:9px;background:#fff}.playerGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.playerCard{min-width:0;border:1px solid #eadfda;border-radius:18px;padding:15px;display:grid;gap:13px;background:#fff}.playerTop{display:flex;gap:11px;align-items:center}.avatar{width:48px;height:48px;flex:0 0 48px;border-radius:50%;display:grid;place-items:center;background:#f2e7e9;color:#6b1a2c;font-weight:1000;overflow:hidden}.avatar img{width:100%;height:100%;object-fit:cover}.playerTop h4{margin:0;color:#2d2023}.playerTop p,.playerTop small{display:block;margin:2px 0 0;color:#81716c;font-size:.7rem}.playerLink{padding:10px 11px;border-radius:12px;background:#faf7f5;display:grid;gap:4px}.playerLink small{font-size:.58rem;color:#9a8984;font-weight:1000;letter-spacing:.08em}.playerLink strong{font-size:.76rem;color:#5e1726}.assign{display:flex;gap:6px}.assign select{min-width:0;flex:1}.playerOpen{text-align:center}.moduleStack{display:grid;gap:14px;min-width:0}.importBar{display:flex;gap:7px}.checks{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin-top:10px}.checks label{display:flex;gap:7px;border:1px solid #eee4df;border-radius:10px;padding:9px;font-size:.74rem}.emptyState{grid-column:1/-1;text-align:center;padding:35px 20px;border:1px dashed #d9ccc5;border-radius:16px;background:#fdfbfa}.emptyState .emptyIcon{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;margin:0 auto 8px;background:#f3e9eb;color:#6b1a2c;font-size:1.2rem}.emptyState h4{margin:0;color:#3a292e}.emptyState p{margin:5px auto 12px;max-width:440px;color:#887872;font-size:.76rem}.empty{border:1px dashed #d9ccc5;border-radius:12px;padding:14px;color:#81736c;text-align:center}.toast{position:fixed;top:15px;left:50%;transform:translateX(-50%);background:#251c1e;color:#fff;border-radius:999px;padding:9px 14px;z-index:200}.overlay{position:fixed;inset:0;background:rgba(22,13,16,.55);display:grid;place-items:center;padding:20px;z-index:300;overflow:auto}.modal{width:min(980px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:20px;padding:18px;box-shadow:0 24px 80px rgba(31,13,18,.25)}.modalHead{display:flex;justify-content:space-between;align-items:center}.modalHead h3{color:#6b1a2c}.close{background:#fff!important;color:#6b1a2c!important;font-size:20px}.formgrid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.field{display:grid;gap:4px}.field span{font-size:.68rem;font-weight:900;color:#71635c}.field input,.field select{width:100%;box-sizing:border-box;border:1px solid #ddd1ca;border-radius:9px;padding:9px;font:inherit}.playerForm h4{color:#6b1a2c;border-top:1px solid #eee4df;padding-top:10px;margin:13px 0 7px}.playerForm h4:first-child{border:0;padding-top:0}.modalActions{display:flex;justify-content:flex-end;gap:7px;margin-top:14px}.hint{color:#7f7169;font-size:.78rem}@media(max-width:980px){.kpis{grid-template-columns:repeat(2,1fr)}.teamGrid,.playerGrid{grid-template-columns:1fr}.formgrid{grid-template-columns:1fr 1fr}.checks{grid-template-columns:1fr 1fr}}@media(max-width:650px){.hero,.workspaceHead{display:grid}.season{min-width:0}.kpis{grid-template-columns:1fr 1fr}.formgrid,.checks{grid-template-columns:1fr}.assign,.importBar{display:grid}.filterRow select,.importBar select{min-width:0;width:100%}}`;
