"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import PolePerformanceOverview from "@/components/institutionnel/PolePerformanceOverview";

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

  async function load() {
    setLoading(true);
    const r=await fetch(`/api/institutionnel/pole-performance?structureId=${encodeURIComponent(structureId)}`,{cache:"no-store"});
    const j=await r.json(); setLoading(false);
    if(!r.ok){alert(j.error||"Chargement impossible");return}
    setData(j);
    if(j.seasons?.length && !j.seasons.some((s:any)=>s.season_label===season)) setSeason(j.seasons[0].season_label);
  }
  useEffect(()=>{void load()},[structureId]); // eslint-disable-line

  const teamMap=useMemo(()=>new Map(data.teams.map(t=>[String(t.id),t])),[data.teams]);
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
  return <div className="pole">{message&&<div className="toast">{message}</div>}
    <div className="top"><div><p>PÔLE / PERFORMANCE · LIGUE</p><h2>Équipes Pôle, polistes & clubs partenaires</h2><span>Les équipes et joueurs sont créés ici. Aucune équipe privée d'un autre utilisateur n'est affichée.</span></div><div className="season"><label>Saison</label><input value={season} onChange={e=>setSeason(e.target.value)} placeholder="2026-2027"/></div></div>

    <PolePerformanceOverview structureId={structureId} season={season} />

    <section className="section"><div className="sectionHead"><div><h3>⭐ Équipes Pôle</h3><p>Vraies équipes MyBasket gérées par la Ligue.</p></div><button onClick={()=>setCreateKind("pole")}>+ Créer une équipe Pôle</button></div>
      <div className="cards">{poleLinks.map(x=>{const t=teamMap.get(String(x.team_id));const count=data.memberships.filter(m=>String(m.pole_team_id)===String(x.team_id)).length;return <article key={x.id}><div><b>{t?.name||"Équipe Pôle"}</b><span>{t?.category||"—"} · {count} poliste(s)</span></div><div className="actions"><button className="ghost" onClick={()=>setSelectedPoleTeam(String(x.team_id))}>Effectif</button><Link href={`/equipes/${x.team_id}`}>Ouvrir l'équipe →</Link></div></article>})}{!poleLinks.length&&<div className="empty">Aucune équipe Pôle pour {season}.</div>}</div>
    </section>

    <section className="section"><div className="sectionHead"><div><h3>🤝 Équipes partenaires</h3><p>Créées par la Ligue puis confiées au coach principal par invitation.</p></div><button onClick={()=>setCreateKind("partner")}>+ Créer une équipe partenaire</button></div>
      <div className="cards">{partnerLinks.map(x=>{const t=teamMap.get(String(x.team_id));const inv=data.invitations.find(i=>String(i.team_id)===String(x.team_id)&&i.status==="pending");const linked=data.playerLinks.filter(l=>String(l.partner_team_id)===String(x.team_id)).length;return <article key={x.id}><div><b>{t?.name||"Équipe partenaire"}</b><span>{t?.category||"—"} · {linked} poliste(s) · Coach : {t?.coach_name||"à inviter"}</span>{inv&&<small>Invitation en attente · {inv.coach_email}</small>}</div><div className="actions"><Link href={`/equipes/${x.team_id}`}>Superviser →</Link><button className="ghost" onClick={()=>setInviteTeamId(String(x.team_id))}>Inviter coach</button></div></article>})}{!partnerLinks.length&&<div className="empty">Aucune équipe partenaire pour {season}.</div>}</div>
    </section>

    <section className="section"><div className="sectionHead"><div><h3>🏀 Effectif du Pôle</h3><p>Créer les polistes et leur vraie fiche joueur MyBasket.</p></div><button onClick={()=>{if(!selectedPoleTeam&&poleLinks[0])setSelectedPoleTeam(String(poleLinks[0].team_id));setShowPlayerForm(true)}}>+ Créer un joueur</button></div>
      <div className="teamSelect"><label>Équipe Pôle</label><select value={selectedPoleTeam} onChange={e=>setSelectedPoleTeam(e.target.value)}><option value="">Choisir…</option>{poleLinks.map(x=><option key={x.id} value={x.team_id}>{teamMap.get(String(x.team_id))?.name||"Équipe Pôle"}</option>)}</select></div>
      <div className="roster">{selectedMemberships.map(m=>{const p=m.institutional_players||{};const link=data.playerLinks.find(l=>String(l.institutional_player_id)===String(m.institutional_player_id)&&String(l.pole_team_id)===String(m.pole_team_id));const secondary=link?teamMap.get(String(link.partner_team_id)):null;return <article key={m.id}><div className="player"><span className="avatar">{p.photo_url?<img src={p.photo_url} alt=""/>:(p.first_name?.[0]||"?")}</span><div><b>{p.first_name} {p.last_name}</b><small>{p.sex==="F"?"Fille":p.sex==="M"?"Garçon":"—"} · {p.category||"—"} · {p.height_cm?`${p.height_cm} cm`:"taille —"}</small><small>Club : {p.club_name||"non renseigné"}</small></div></div><div className="secondary">{secondary?<span>Équipe secondaire : <b>{secondary.name}</b></span>:<><select value={secondaryByMembership[m.id]||""} onChange={e=>setSecondaryByMembership(v=>({...v,[m.id]:e.target.value}))}><option value="">Équipe secondaire…</option>{partnerLinks.map(x=><option key={x.id} value={x.team_id}>{teamMap.get(String(x.team_id))?.name}</option>)}</select><button onClick={()=>assignSecondary(m.id)}>Rattacher</button></>}<Link href={`/equipes/${m.pole_team_id}/${m.pole_player_id}`}>Ouvrir la fiche joueur →</Link></div></article>})}{selectedPoleTeam&&!selectedMemberships.length&&<div className="empty">Aucun poliste dans cette équipe.</div>}</div>
    </section>

    {sourceTeams.length>0&&selectedPoleTeam&&<section className="section"><div className="sectionHead"><div><h3>↻ Reprendre les polistes d'une saison précédente</h3><p>Le même joueur est réutilisé : aucune nouvelle identité n'est créée.</p></div></div><div className="importBar"><select value={importSource} onChange={e=>{setImportSource(e.target.value);setImportIds([])}}><option value="">Équipe Pôle précédente…</option>{sourceTeams.map(x=><option key={x.id} value={x.team_id}>{teamMap.get(String(x.team_id))?.name||"Équipe Pôle"} · {x.season_label}</option>)}</select><button disabled={!importIds.length} onClick={importPlayers}>Importer {importIds.length?`(${importIds.length})`:""}</button></div>{importSource&&<div className="checks">{sourceMemberships.map(m=>{const p=m.institutional_players||{};return <label key={m.id}><input type="checkbox" checked={importIds.includes(String(m.institutional_player_id))} onChange={e=>setImportIds(v=>e.target.checked?[...v,String(m.institutional_player_id)]:v.filter(id=>id!==String(m.institutional_player_id)))}/><span>{p.first_name} {p.last_name}</span></label>})}</div>}</section>}

    {createKind&&<Modal title={createKind==="pole"?"Créer une équipe Pôle":"Créer une équipe partenaire"} onClose={()=>setCreateKind(null)}><div className="formgrid"><Field label="Nom de l'équipe"><input value={teamForm.name} onChange={e=>setTeamForm({...teamForm,name:e.target.value})} placeholder={createKind==="pole"?"Pôle Espoir Masculin":"Paris Basketball U15 France"}/></Field><Field label="Club / structure"><input value={teamForm.clubName} onChange={e=>setTeamForm({...teamForm,clubName:e.target.value})}/></Field><Field label="Catégorie / championnat"><input value={teamForm.category} onChange={e=>setTeamForm({...teamForm,category:e.target.value})} placeholder="U15 France"/></Field><Field label="Saison"><input value={season} disabled/></Field>{createKind==="partner"&&<><Field label="Prénom coach"><input value={teamForm.coachFirstName} onChange={e=>setTeamForm({...teamForm,coachFirstName:e.target.value})}/></Field><Field label="Nom coach"><input value={teamForm.coachLastName} onChange={e=>setTeamForm({...teamForm,coachLastName:e.target.value})}/></Field><Field label="Email coach"><input type="email" value={teamForm.coachEmail} onChange={e=>setTeamForm({...teamForm,coachEmail:e.target.value})} placeholder="coach@club.fr"/></Field></>}</div><div className="modalActions"><button className="ghost" onClick={()=>setCreateKind(null)}>Annuler</button><button onClick={createTeam}>{createKind==="partner"?"Créer et inviter le coach":"Créer l'équipe Pôle"}</button></div></Modal>}

    {showPlayerForm&&<Modal title="Créer un poliste" onClose={()=>setShowPlayerForm(false)}><PlayerForm value={playerForm} onChange={setPlayerForm}/><div className="modalActions"><button className="ghost" onClick={()=>setShowPlayerForm(false)}>Annuler</button><button onClick={createPlayer}>Créer la fiche joueur</button></div></Modal>}

    {inviteTeamId&&<Modal title="Inviter le coach principal" onClose={()=>setInviteTeamId("")}><div className="formgrid"><Field label="Prénom"><input value={invite.firstName} onChange={e=>setInvite({...invite,firstName:e.target.value})}/></Field><Field label="Nom"><input value={invite.lastName} onChange={e=>setInvite({...invite,lastName:e.target.value})}/></Field><Field label="Email"><input type="email" value={invite.email} onChange={e=>setInvite({...invite,email:e.target.value})}/></Field></div><p className="hint">À l'acceptation, le coach devient propriétaire opérationnel de l'équipe. La Ligue reste superviseur et le Premium est offert pendant un an.</p><div className="modalActions"><button className="ghost" onClick={()=>setInviteTeamId("")}>Annuler</button><button onClick={()=>sendInvite(inviteTeamId)}>Envoyer l'invitation</button></div></Modal>}

    <style jsx>{css}</style>
  </div>;
}

function PlayerForm({value,onChange}:{value:any;onChange:(v:any)=>void}){const set=(k:string,v:any)=>onChange({...value,[k]:v});return <div className="playerForm"><h4>Identité</h4><div className="formgrid"><Field label="Prénom *"><input value={value.firstName} onChange={e=>set("firstName",e.target.value)}/></Field><Field label="Nom *"><input value={value.lastName} onChange={e=>set("lastName",e.target.value)}/></Field><Field label="Date de naissance"><input type="date" value={value.birthdate} onChange={e=>set("birthdate",e.target.value)}/></Field><Field label="Sexe"><select value={value.sex} onChange={e=>set("sex",e.target.value)}><option value="">—</option><option value="M">Garçon</option><option value="F">Fille</option></select></Field><Field label="Photo URL"><input value={value.photoUrl} onChange={e=>set("photoUrl",e.target.value)}/></Field><Field label="N° licence"><input value={value.licenseNumber} onChange={e=>set("licenseNumber",e.target.value)}/></Field></div><h4>Basket</h4><div className="formgrid"><Field label="Club actuel"><input value={value.clubName} onChange={e=>set("clubName",e.target.value)}/></Field><Field label="Catégorie"><input value={value.category} onChange={e=>set("category",e.target.value)}/></Field><Field label="Poste principal"><input value={value.positionPrimary} onChange={e=>set("positionPrimary",e.target.value)}/></Field><Field label="Poste secondaire"><input value={value.positionSecondary} onChange={e=>set("positionSecondary",e.target.value)}/></Field><Field label="Main dominante"><select value={value.dominantHand} onChange={e=>set("dominantHand",e.target.value)}><option>Droite</option><option>Gauche</option><option>Ambidextre</option></select></Field><Field label="Années basket"><input type="number" value={value.yearsBasket} onChange={e=>set("yearsBasket",e.target.value)}/></Field></div><h4>Mesures initiales</h4><div className="formgrid"><Field label="Date mesure"><input type="date" value={value.measuredAt} onChange={e=>set("measuredAt",e.target.value)}/></Field><Field label="Taille cm"><input type="number" step="0.1" value={value.heightCm} onChange={e=>set("heightCm",e.target.value)}/></Field><Field label="Poids kg"><input type="number" step="0.1" value={value.weightKg} onChange={e=>set("weightKg",e.target.value)}/></Field><Field label="Envergure cm"><input type="number" step="0.1" value={value.wingspanCm} onChange={e=>set("wingspanCm",e.target.value)}/></Field><Field label="Taille mère"><input type="number" step="0.1" value={value.motherHeightCm} onChange={e=>set("motherHeightCm",e.target.value)}/></Field><Field label="Taille père"><input type="number" step="0.1" value={value.fatherHeightCm} onChange={e=>set("fatherHeightCm",e.target.value)}/></Field></div><h4>Scolarité & coordonnées</h4><div className="formgrid"><Field label="Email joueur"><input type="email" value={value.email} onChange={e=>set("email",e.target.value)}/></Field><Field label="Téléphone"><input value={value.phone} onChange={e=>set("phone",e.target.value)}/></Field><Field label="Établissement scolaire"><input value={value.school} onChange={e=>set("school",e.target.value)}/></Field><Field label="Classe"><input value={value.className} onChange={e=>set("className",e.target.value)}/></Field><Field label="Adresse"><input value={value.address} onChange={e=>set("address",e.target.value)}/></Field><Field label="Code postal"><input value={value.postalCode} onChange={e=>set("postalCode",e.target.value)}/></Field><Field label="Ville"><input value={value.city} onChange={e=>set("city",e.target.value)}/></Field></div><h4>Responsables</h4><div className="formgrid"><Field label="Responsable 1"><input value={value.tutor1Name} onChange={e=>set("tutor1Name",e.target.value)}/></Field><Field label="Email responsable 1"><input type="email" value={value.tutor1Email} onChange={e=>set("tutor1Email",e.target.value)}/></Field><Field label="Téléphone responsable 1"><input value={value.tutor1Phone} onChange={e=>set("tutor1Phone",e.target.value)}/></Field><Field label="Responsable 2"><input value={value.tutor2Name} onChange={e=>set("tutor2Name",e.target.value)}/></Field><Field label="Email responsable 2"><input type="email" value={value.tutor2Email} onChange={e=>set("tutor2Email",e.target.value)}/></Field><Field label="Téléphone responsable 2"><input value={value.tutor2Phone} onChange={e=>set("tutor2Phone",e.target.value)}/></Field></div></div>}
function Modal({title,onClose,children}:{title:string;onClose:()=>void;children:ReactNode}){return <div className="overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose()}}><div className="modal"><div className="modalHead"><h3>{title}</h3><button className="close" onClick={onClose}>×</button></div>{children}</div></div>}
function Field({label,children}:{label:string;children:ReactNode}){return <label className="field"><span>{label}</span>{children}</label>}

const css=`.pole{display:grid;gap:12px}.top{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.top p{margin:0;color:#d4a24c;font-size:.68rem;font-weight:1000;letter-spacing:.12em}.top h2{margin:3px 0;color:#251a1d}.top span,.sectionHead p,.hint{color:#7f7169;font-size:.78rem}.season{display:grid;gap:3px;min-width:150px}.season label,.teamSelect label{font-size:.68rem;font-weight:900;color:#6b1a2c}.season input,.teamSelect select{border:1px solid #ddd1ca;border-radius:8px;padding:8px}.section{border:1px solid #eadfd8;border-radius:14px;padding:12px;background:#fff}.sectionHead{display:flex;justify-content:space-between;gap:10px;align-items:center}.sectionHead h3{margin:0;color:#6b1a2c}.sectionHead p{margin:3px 0}.pole button,.actions a,.secondary a{border:0;border-radius:8px;padding:8px 10px;background:#6b1a2c;color:#fff;font-weight:900;text-decoration:none;cursor:pointer}.ghost{background:#fff!important;color:#6b1a2c!important;border:1px solid #d9cac2!important}.cards{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:9px}.cards article,.roster article{border:1px solid #e9ded8;border-radius:10px;padding:10px;display:flex;justify-content:space-between;gap:10px;align-items:center}.cards b,.cards span,.cards small{display:block}.cards span,.cards small{color:#7c6e67;font-size:.73rem}.actions{display:flex;gap:5px;align-items:center}.teamSelect{display:flex;gap:7px;align-items:center;margin:9px 0}.roster{display:grid;gap:6px}.roster article{display:grid;grid-template-columns:1fr 1fr}.player{display:flex;gap:9px;align-items:center}.avatar{width:42px;height:42px;border-radius:50%;display:grid;place-items:center;background:#f0e8e4;color:#6b1a2c;font-weight:1000;overflow:hidden}.avatar img{width:100%;height:100%;object-fit:cover}.player b,.player small{display:block}.player small{color:#7d7069;font-size:.72rem}.secondary{display:flex;gap:6px;align-items:center;justify-content:flex-end;flex-wrap:wrap}.secondary select,.importBar select{border:1px solid #ddd1ca;border-radius:8px;padding:8px;min-width:220px}.importBar{display:flex;gap:7px;margin-top:8px}.checks{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-top:8px}.checks label{display:flex;gap:6px;border:1px solid #eee4df;border-radius:8px;padding:8px}.empty{border:1px dashed #d9ccc5;border-radius:9px;padding:13px;color:#81736c;text-align:center}.toast{position:fixed;top:15px;left:50%;transform:translateX(-50%);background:#251c1e;color:#fff;border-radius:999px;padding:9px 14px;z-index:200}.overlay{position:fixed;inset:0;background:rgba(22,13,16,.55);display:grid;place-items:center;padding:20px;z-index:300;overflow:auto}.modal{width:min(980px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:18px;padding:16px}.modalHead{display:flex;justify-content:space-between;align-items:center}.modalHead h3{color:#6b1a2c}.close{background:#fff!important;color:#6b1a2c!important;font-size:20px}.formgrid{display:grid;grid-template-columns:repeat(4,1fr);gap:7px}.field{display:grid;gap:4px}.field span{font-size:.7rem;font-weight:900;color:#71635c}.field input,.field select{width:100%;box-sizing:border-box;border:1px solid #ddd1ca;border-radius:8px;padding:8px;font:inherit}.playerForm h4{color:#6b1a2c;border-top:1px solid #eee4df;padding-top:10px;margin:13px 0 7px}.playerForm h4:first-child{border:0;padding-top:0}.modalActions{display:flex;justify-content:flex-end;gap:7px;margin-top:14px}@media(max-width:900px){.cards,.roster article{grid-template-columns:1fr}.cards article{display:grid}.secondary{justify-content:flex-start}.formgrid{grid-template-columns:1fr 1fr}.checks{grid-template-columns:1fr 1fr}.top{display:grid}}@media(max-width:560px){.cards,.formgrid,.checks{grid-template-columns:1fr}.sectionHead{align-items:flex-start}.actions{flex-wrap:wrap}}`;
