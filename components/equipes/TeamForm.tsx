// components/equipes/TeamForm.tsx
"use client";

import { useRef, useState } from "react";
import type { StaffMember, Team } from "../../types/player";
import { emptyTeam } from "../../types/player";

function uid() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `staff_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function compress(file: File, max: number, preserveTransparency = false): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale);
        const h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) return reject(new Error("Canvas indisponible"));
        if (!preserveTransparency) { ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, w, h); }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(preserveTransparency ? canvas.toDataURL("image/png") : canvas.toDataURL("image/jpeg", 0.88));
      };
      img.onerror = reject;
      img.src = reader.result as string;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

const BORDEAUX = "#7a1228";
const GOLD = "#e0a82e";
const INK = "#251d1a";
const MUTED = "#766a64";
const LINE = "#eadfd5";
const SOFT = "#fbf8f5";

type StaffDraft = StaffMember & { email?: string };

export default function TeamForm({ team, onSave, onClose }: {
  team?: Team;
  onSave: (t: Team) => void;
  onClose: () => void;
}) {
  const [t, setT] = useState<Team>(() => ({
    ...emptyTeam(), ...(team ?? {}),
    staff: Array.isArray(team?.staff) ? team!.staff : [],
    supabaseTeamId: team?.supabaseTeamId ?? null,
    clubId: team?.clubId ?? null,
    season: team?.season ?? "2025-2026",
    couleurs: team?.couleurs?.length ? team.couleurs : [BORDEAUX, GOLD],
  }));
  const [clubName, setClubName] = useState(() => (team as Team & { clubName?: string })?.clubName || "");
  const [staffDraft, setStaffDraft] = useState<StaffDraft>({ id: "", prenom: "", nom: "", role: "Entraîneur", email: "" });
  const logoRef = useRef<HTMLInputElement>(null);
  const bannerRef = useRef<HTMLInputElement>(null);

  function set<K extends keyof Team>(k: K, v: Team[K]) { setT((prev) => ({ ...prev, [k]: v })); }
  function setColor(i: number, v: string) {
    setT((prev) => { const c = [...(prev.couleurs || [BORDEAUX, GOLD])]; c[i] = v; return { ...prev, couleurs: c }; });
  }
  async function pickLogo(e: React.ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (f) set("logo", await compress(f, 500, true)); }
  async function pickBanner(e: React.ChangeEvent<HTMLInputElement>) { const f = e.target.files?.[0]; if (f) set("banniere", await compress(f, 1600, false)); }

  function addStaff() {
    const prenom = staffDraft.prenom.trim();
    const nom = staffDraft.nom.trim();
    const role = staffDraft.role.trim();
    if (!prenom || !nom || !role) {
      alert("Renseigne le prénom, le nom et le rôle du membre du staff.");
      return;
    }
    const member = { ...staffDraft, id: uid(), prenom, nom, role, email: staffDraft.email?.trim() || "" } as StaffMember;
    setT((prev) => ({ ...prev, staff: [...(prev.staff || []), member] }));
    setStaffDraft({ id: "", prenom: "", nom: "", role: "Entraîneur", email: "" });
  }

  function removeStaff(id: string) {
    setT((prev) => ({ ...prev, staff: (prev.staff || []).filter((s) => s.id !== id) }));
  }

  function submit() {
    if (!clubName.trim()) return alert("Le nom du club est obligatoire.");
    if (!t.cat) return alert("La catégorie est obligatoire.");
    if (!t.niveau) return alert("Le niveau de l'équipe est obligatoire.");

    const generatedName = team?.name?.trim() || t.cat;
    const tags = [t.niveau, t.cat].filter(Boolean);
    const head = (t.staff || []).find((s) => /entra[iî]neur principal|head coach/i.test(s.role))
      || (t.staff || []).find((s) => /entra[iî]neur|coach/i.test(s.role));
    const assistant = (t.staff || []).find((s) => /assistant/i.test(s.role));

    onSave({
      ...t,
      name: generatedName,
      categorieLabel: t.cat,
      tags,
      entraineurPrincipal: head ? `${head.prenom} ${head.nom}`.trim() : t.entraineurPrincipal,
      assistant: assistant ? `${assistant.prenom} ${assistant.nom}`.trim() : t.assistant,
      season: t.season || "2025-2026",
      supabaseTeamId: t.supabaseTeamId ?? null,
      clubId: t.clubId ?? null,
      clubName: clubName.trim(),
    } as Team & { clubName: string });
  }

  const fieldStyle: React.CSSProperties = { width:"100%",minHeight:46,border:`1px solid ${LINE}`,borderRadius:10,background:"#fff",color:INK,padding:"0 13px",fontSize:".92rem",fontWeight:650,boxSizing:"border-box",outline:"none" };
  const labelStyle: React.CSSProperties = { display:"block",marginBottom:6,color:MUTED,fontSize:".68rem",fontWeight:900,letterSpacing:".035em",textTransform:"uppercase" };
  const sectionTitle: React.CSSProperties = { display:"flex",alignItems:"center",gap:8,marginBottom:14,color:INK,fontWeight:950,fontSize:".88rem" };
  const uploadButtonStyle: React.CSSProperties = { minHeight:40,padding:"0 18px",borderRadius:9,border:`1.5px solid ${BORDEAUX}`,background:"#fff",color:BORDEAUX,fontSize:".82rem",fontWeight:900,cursor:"pointer" };

  return (
    <div onClick={onClose} style={{position:"fixed",inset:0,zIndex:9999,display:"flex",alignItems:"center",justifyContent:"center",padding:18,background:"rgba(22,18,16,.58)",backdropFilter:"blur(3px)"}}>
      <div onClick={(e)=>e.stopPropagation()} style={{width:"min(820px,calc(100vw - 36px))",maxHeight:"calc(100vh - 36px)",display:"flex",flexDirection:"column",overflow:"hidden",background:"#fff",borderRadius:20,border:"1px solid rgba(122,18,40,.10)",boxShadow:"0 30px 90px rgba(20,13,10,.32)"}}>
        <div style={{display:"flex",alignItems:"center",gap:14,padding:"18px 24px",borderBottom:`1px solid ${LINE}`}}>
          <div style={{width:42,height:42,borderRadius:12,display:"grid",placeItems:"center",background:"#fff5f6",fontSize:21}}>🛡️</div>
          <div style={{flex:1}}><h3 style={{margin:0,color:INK,fontSize:"1.35rem",fontWeight:950,textTransform:"uppercase"}}>{team ? "Modifier les informations équipe" : "Nouvelle équipe"}</h3><div style={{marginTop:5,color:MUTED,fontSize:".82rem"}}>Informations, identité et staff de l'équipe.</div></div>
          <button type="button" onClick={onClose} style={{width:38,height:38,borderRadius:999,border:`1px solid ${LINE}`,background:"#fff",fontSize:22,cursor:"pointer"}}>×</button>
        </div>

        <div style={{padding:"20px 24px 22px",overflowY:"auto",flex:"1 1 auto"}}>
          <section>
            <div style={sectionTitle}><span>🖼️</span><span>PHOTOS</span></div>
            <div style={{display:"grid",gridTemplateColumns:"200px minmax(0,1fr)",gap:28}}>
              <div style={{textAlign:"center"}}>
                <div style={labelStyle}>Logo du club</div>
                <div style={{width:160,height:150,margin:"0 auto",border:`1px solid ${LINE}`,borderRadius:15,display:"grid",placeItems:"center",overflow:"hidden",background:"#fff"}}>
                  {t.logo ? <img src={t.logo} alt="" style={{width:"100%",height:"100%",objectFit:"contain",padding:15,boxSizing:"border-box"}}/> : <span style={{fontSize:34}}>🏀</span>}
                </div>
                <button type="button" style={{...uploadButtonStyle,marginTop:10}} onClick={()=>logoRef.current?.click()}>Choisir un logo</button>
                <input ref={logoRef} type="file" accept="image/*" hidden onChange={pickLogo}/>
              </div>
              <div style={{textAlign:"center"}}>
                <div style={labelStyle}>Photo de l'équipe</div>
                <div style={{height:150,border:`1px solid ${LINE}`,borderRadius:15,display:"grid",placeItems:"center",overflow:"hidden",background:SOFT}}>
                  {t.banniere ? <img src={t.banniere} alt="" style={{width:"100%",height:"100%",objectFit:"cover"}}/> : <span style={{color:MUTED}}>Aucune photo</span>}
                </div>
                <button type="button" style={{...uploadButtonStyle,marginTop:10}} onClick={()=>bannerRef.current?.click()}>Choisir une photo</button>
                <input ref={bannerRef} type="file" accept="image/*" hidden onChange={pickBanner}/>
              </div>
            </div>
          </section>

          <div style={{height:1,background:LINE,margin:"20px 0"}}/>

          <section>
            <div style={sectionTitle}><span>ⓘ</span><span>INFORMATIONS DE L'ÉQUIPE</span></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"14px 20px"}}>
              <div><label style={labelStyle}>Nom du club</label><input value={clubName} onChange={(e)=>setClubName(e.target.value)} style={fieldStyle}/></div>
              <div><label style={labelStyle}>Catégorie</label><select value={t.cat} onChange={(e)=>{set("cat",e.target.value);set("categorieLabel",e.target.value);}} style={fieldStyle}>
                <option value="">Choisir</option>{["U7","U9","U11","U13","U15","U18","U21","SENIOR"].map((v)=><option key={v} value={v}>{v==="SENIOR"?"Senior":v}</option>)}
              </select></div>
              <div style={{gridColumn:"1 / -1"}}><label style={labelStyle}>Niveau</label><select value={t.niveau} onChange={(e)=>set("niveau",e.target.value)} style={fieldStyle}>
                <option value="">Choisir</option><option>Départemental</option><option>Régional</option><option>National</option>
              </select></div>
            </div>
          </section>

          <div style={{height:1,background:LINE,margin:"20px 0"}}/>

          <section>
            <div style={{...sectionTitle,justifyContent:"space-between"}}>
              <span>👥 STAFF</span>
              <span style={{color:MUTED,fontSize:".75rem"}}>{(t.staff || []).length} membre{(t.staff || []).length > 1 ? "s" : ""}</span>
            </div>

            {(t.staff || []).length > 0 && (
              <div style={{display:"grid",gap:8,marginBottom:16}}>
                {(t.staff || []).map((s) => (
                  <div key={s.id} style={{display:"grid",gridTemplateColumns:"44px 1fr auto",gap:12,alignItems:"center",padding:"10px 12px",border:`1px solid ${LINE}`,borderRadius:12,background:"#fff"}}>
                    <div style={{width:40,height:40,borderRadius:999,display:"grid",placeItems:"center",background:"#f8ecef",color:BORDEAUX,fontWeight:950}}>{(s.prenom?.[0]||"")+(s.nom?.[0]||"")}</div>
                    <div><div style={{fontWeight:900,color:INK}}>{s.prenom} {s.nom}</div><div style={{fontSize:".78rem",color:MUTED}}>{s.role}{(s as StaffDraft).email ? ` • ${(s as StaffDraft).email}` : ""}</div></div>
                    <button type="button" onClick={()=>removeStaff(s.id)} style={{border:0,borderRadius:9,padding:"8px 10px",background:"#ffe8ec",color:"#b4233b",fontWeight:900,cursor:"pointer"}}>Supprimer</button>
                  </div>
                ))}
              </div>
            )}

            <div style={{padding:14,border:`1px solid ${LINE}`,borderRadius:14,background:SOFT}}>
              <div style={{fontWeight:950,color:BORDEAUX,marginBottom:12}}>+ Ajouter un membre du staff</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                <div><label style={labelStyle}>Prénom *</label><input value={staffDraft.prenom} onChange={(e)=>setStaffDraft((p)=>({...p,prenom:e.target.value}))} style={fieldStyle}/></div>
                <div><label style={labelStyle}>Nom *</label><input value={staffDraft.nom} onChange={(e)=>setStaffDraft((p)=>({...p,nom:e.target.value}))} style={fieldStyle}/></div>
                <div><label style={labelStyle}>Rôle *</label><select value={staffDraft.role} onChange={(e)=>setStaffDraft((p)=>({...p,role:e.target.value}))} style={fieldStyle}>
                  <option>Responsable</option><option>Entraîneur principal</option><option>Entraîneur</option><option>Assistant</option><option>Analyste</option><option>Préparateur physique</option><option>Manager</option><option>Kiné</option><option>Autre</option>
                </select></div>
                <div><label style={labelStyle}>E-mail (pour la collaboration)</label><input type="email" value={staffDraft.email || ""} onChange={(e)=>setStaffDraft((p)=>({...p,email:e.target.value}))} placeholder="coach@email.com" style={fieldStyle}/></div>
              </div>
              <button type="button" onClick={addStaff} style={{marginTop:12,minHeight:42,padding:"0 18px",border:0,borderRadius:10,background:BORDEAUX,color:"#fff",fontWeight:950,cursor:"pointer"}}>+ Ajouter au staff</button>
            </div>
          </section>

          <div style={{height:1,background:LINE,margin:"20px 0"}}/>

          <section>
            <div style={sectionTitle}><span>🎨</span><span>COULEURS DU MAILLOT</span></div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:20}}>
              {[0,1].map((i)=><div key={i}><label style={labelStyle}>{i===0?"Couleur principale":"Couleur secondaire"}</label><div style={{display:"grid",gridTemplateColumns:"50px 1fr",gap:10}}>
                <input type="color" value={t.couleurs?.[i] || (i===0?BORDEAUX:GOLD)} onChange={(e)=>setColor(i,e.target.value)} style={{width:50,height:46,border:`1px solid ${LINE}`,borderRadius:9}}/>
                <div style={{...fieldStyle,display:"flex",alignItems:"center"}}>{t.couleurs?.[i] || (i===0?BORDEAUX:GOLD)}</div>
              </div></div>)}
            </div>
          </section>
        </div>

        <div style={{padding:"14px 24px 18px",borderTop:`1px solid ${LINE}`,display:"flex",justifyContent:"flex-end",gap:12}}>
          <button type="button" onClick={onClose} style={{minWidth:150,minHeight:46,borderRadius:10,border:`1.5px solid ${BORDEAUX}`,background:"#fff",color:BORDEAUX,fontWeight:900,cursor:"pointer"}}>Annuler</button>
          <button type="button" onClick={submit} style={{minWidth:178,minHeight:46,borderRadius:10,border:0,background:BORDEAUX,color:"#fff",fontWeight:950,cursor:"pointer"}}>Enregistrer l'équipe ✓</button>
        </div>
      </div>
    </div>
  );
}
