"use client";

/**
 * ScoutingModule — onglet SCOUTING (Mon compte → Management → Game Plan → Scouting).
 *
 * Contenu fusionné :
 *  1) Cahier de scouting ÉQUIPE : CHIFFRES CLÉS (encart dédié), Last 4, tableau
 *     Championnat/Domicile/Extérieur/Victoire/Défaite × ATT/DEF/V/D, meilleurs
 *     joueurs (3pts/LF/Rbd Off/Int/Drive), résumé Dom/Ext. PAS de nom de coach.
 *  2) PLAN DE JEU adverse : Général, Attaque, Défense (Picks 45°, Zone, Picks Axe,
 *     Presse, Post-up), Forces/Faiblesses — TOUS en blocs pleine largeur (carte).
 *  3) PLAYBOOK ADVERSE dessinable via le VRAI outil de dessin (la plaquette) :
 *     « Dessiner un système » ouvre /plaquette, on dessine (phases, animation,
 *     export vidéo…), on revient et le schéma s'affiche en carte. Option
 *     « enregistrer comme nouveau système ». Les SITUATIONS SPÉCIALES (BLOB/SLOB/
 *     ATO) sont affichées comme des systèmes offensifs, avec leurs SCHÉMAS visibles.
 *  4) EFFECTIF + fiche joueur détaillée (identité, stats, %3PT/2PT/LF, tendances
 *     off/déf, zones de tir interactives, notes).
 *
 * Autonome : équipe (mybasket_management_team), charge/sauvegarde la colonne
 * `scouting` (jsonb) de `management_gameplans` (n'écrit QUE cette colonne).
 * Export PDF du dossier scouting.
 *
 * Handoff plaquette (déjà géré par app/plaquette/page.tsx) :
 *  - on pose `mb_plaquette_return_to` (URL de retour) + `mybasket_scouting_pending`
 *    (contexte : équipe, id du système, type, titre) + éventuellement
 *    `mybasket_plaquette_load` (schéma à rééditer), puis on navigue.
 *  - au retour, la plaquette a uploadé les images dans Supabase Storage et écrit
 *    `mybasket_plaquette_result` (schemaImages[] = URLs, schemaDataList[] = phases).
 *    On lit ce résultat et on ajoute/met à jour le système dans le playbook.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode, MouseEvent as RME, TouchEvent as RTE } from "react";
import { createClient } from "@/lib/supabase/client";
import { getTeams } from "@/lib/equipes-store";

const K_SEL = "mybasket_management_team";
const K_SYS = "mybasket_systemes"; // « enregistrer comme nouveau système »
const K_PENDING = "mybasket_scouting_pending"; // contexte de retour plaquette
const PLAQUETTE_URL = "/plaquette";

function lsGet<T = unknown>(k: string): T | null { if (typeof window === "undefined") return null; try { const r = localStorage.getItem(k); return r ? (JSON.parse(r) as T) : null; } catch { return null; } }
function lsSet(k: string, v: unknown) { if (typeof window === "undefined") return; try { localStorage.setItem(k, JSON.stringify(v)); } catch {} }
function lsDel(k: string) { if (typeof window === "undefined") return; try { localStorage.removeItem(k); } catch {} }
function newId() { try { if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID(); } catch {} return `id_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`; }

/* ============================== Types ============================== */
type Player = { id: string; firstName?: string; lastName?: string; num?: string | number; poste?: string; photo?: string };
type Team = { id: string; name?: string; cat?: string; logo?: string; players?: Player[] };

type ScoutPlayer = {
  id: string; num: string; name: string; poste: string; taille: string; age: string;
  role: "Majeur" | "Rotation"; strongHand: "Droite" | "Gauche" | ""; photo?: string; club?: string;
  games?: string; pts?: string; reb?: string; ast?: string; stl?: string; to?: string;
  fg3m?: string; fg3a?: string; fg2m?: string; fg2a?: string; ftm?: string; fta?: string;
  off: Record<string, boolean>; def: Record<string, boolean>;
  shotZones?: string; notesOff?: string; notesDef?: string; profil?: string;
};
type Row3 = { att: string; def: string; vd: string };
type TeamSheet = {
  last4: string; attaqueRank: string; defenseRank: string;
  table: Record<string, Row3>;
  best: { tirs3: string; lf: string; rbdOff: string; int: string; drive: string };
  resumeDom: string; resumeExt: string;
  general: string; attaque: string;
  defense: { picks45: string; zone: string; picksAxe: string; presse: string; postup: string };
};
// schemaImages/schemaDataList renseignés quand le système vient de la plaquette
type OppPlay = { id: string; title: string; kind: string; category: string; schemaImage: string; description: string; schemaImages?: string[]; schemaDataList?: any[] };
type Scouting = {
  team: string; classement: string; bilan: string; serie: string; ptsFor: string; ptsAgainst: string; ortg: string; drtg: string; pace: string;
  mode: "manuel" | "auto"; strengths: string; weaknesses: string;
  sheet: TeamSheet; oppPlays: OppPlay[]; players: ScoutPlayer[];
};

const TABLE_ROWS = ["Championnat", "Domicile", "Extérieur", "Victoire", "Défaite"];
const OFF_TENDENCIES = ["Tireur", "Créateur", "Poste bas", "Transition", "PnR porteur", "PnR poseur", "Coupeur", "Rebond offensif"];
const DEF_TENDENCIES = ["Change", "Switch", "Hedge", "Drop", "Interceptions", "Contres", "Agressif"];
const PROFILS = ["Pnr handler", "Driver", "Shooter", "All around", "Physique", "Slasher", "Stretch big", "Glue guy"];
const PLAY_KINDS = ["Attaque", "Défense", "Transition", "BLOB", "SLOB", "ATO"];
const SPECIAL_KINDS = ["BLOB", "SLOB", "ATO"]; // situations spéciales

const EMPTY_SHEET: TeamSheet = {
  last4: "", attaqueRank: "", defenseRank: "",
  table: TABLE_ROWS.reduce((a, r) => ({ ...a, [r]: { att: "", def: "", vd: "" } }), {} as Record<string, Row3>),
  best: { tirs3: "", lf: "", rbdOff: "", int: "", drive: "" },
  resumeDom: "", resumeExt: "", general: "", attaque: "",
  defense: { picks45: "", zone: "", picksAxe: "", presse: "", postup: "" },
};
const EMPTY: Scouting = {
  team: "", classement: "", bilan: "", serie: "", ptsFor: "", ptsAgainst: "", ortg: "", drtg: "", pace: "",
  mode: "manuel", strengths: "", weaknesses: "", sheet: EMPTY_SHEET, oppPlays: [], players: [],
};

/* ============================== Helpers ============================== */
function normalizeTeam(row: any): Team {
  return {
    id: String(row?.id ?? ""), name: String(row?.name ?? row?.nom ?? row?.teamName ?? "Équipe"),
    cat: String(row?.cat ?? row?.category ?? row?.categorie ?? ""), logo: row?.logo ?? row?.logo_url ?? "",
    players: ((row?.players ?? row?.joueurs ?? row?.effectif ?? row?.roster ?? []) as any[]).map((p) => ({
      id: String(p?.id ?? p?.playerId ?? ""), firstName: p?.firstName ?? p?.prenom ?? "", lastName: p?.lastName ?? p?.nom ?? "",
      num: p?.num ?? p?.numero ?? p?.number ?? "", poste: p?.poste ?? p?.position ?? "", photo: p?.photo ?? p?.photo_url ?? "",
    })),
  };
}
async function readTeams(): Promise<Team[]> { try { const r = await getTeams(); return ((r ?? []) as any[]).map(normalizeTeam).filter((t) => t.id); } catch { return []; } }
function normalizeScout(sc: any): Scouting {
  const s = sc && typeof sc === "object" ? sc : {};
  const sheet: TeamSheet = { ...EMPTY_SHEET, ...(s.sheet || {}), table: { ...EMPTY_SHEET.table, ...((s.sheet || {}).table || {}) }, best: { ...EMPTY_SHEET.best, ...((s.sheet || {}).best || {}) }, defense: { ...EMPTY_SHEET.defense, ...((s.sheet || {}).defense || {}) } };
  return {
    ...EMPTY, ...s, sheet,
    mode: s.mode === "auto" ? "auto" : "manuel",
    oppPlays: Array.isArray(s.oppPlays) ? s.oppPlays : [],
    players: Array.isArray(s.players) ? s.players.map((p: any) => ({ off: {}, def: {}, role: "Rotation", ...p })) : [],
  };
}
async function readScout(supabase: ReturnType<typeof createClient>, teamId: string): Promise<Scouting> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !teamId) return EMPTY;
  const { data, error } = await supabase.from("management_gameplans").select("scouting").eq("user_id", user.id).eq("team_id", teamId).limit(1);
  if (error) { console.error("Chargement scouting:", error); return EMPTY; }
  return data?.[0]?.scouting ? normalizeScout(data[0].scouting) : EMPTY;
}
async function writeScout(supabase: ReturnType<typeof createClient>, teamId: string, sc: Scouting) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !teamId) throw new Error("Non connecté");
  const { error } = await supabase.from("management_gameplans").upsert({ user_id: user.id, team_id: teamId, scouting: sc, updated_at: new Date().toISOString() }, { onConflict: "user_id,team_id" });
  if (error) { console.error("Sauvegarde scouting:", error); throw error; }
}
function pct(m?: string, a?: string) { const mm = Number(m), aa = Number(a); if (!aa) return "—"; return `${Math.round((mm / aa) * 1000) / 10}%`; }
function escapeHtml(s: string) { return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string)); }
function drawHalfCourt(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#F3E2C0"; ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "#BE9355"; ctx.lineWidth = 2; ctx.strokeRect(8, 8, w - 16, h - 16);
  const kw = w * 0.26, kh = h * 0.42, kx = (w - kw) / 2, ky = 8;
  ctx.strokeRect(kx, ky, kw, kh);
  ctx.beginPath(); ctx.arc(w / 2, ky + kh, kw * 0.5, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(w / 2, ky + 18, 7, 0, Math.PI * 2); ctx.stroke();
  ctx.beginPath(); ctx.arc(w / 2, ky + 18, w * 0.42, 0.12 * Math.PI, 0.88 * Math.PI); ctx.stroke();
}

/* ========================= UI réutilisables ========================= */
function AutoTextarea({ value, onChange, placeholder, minRows = 3 }: { value: string; onChange: (v: string) => void; placeholder?: string; minRows?: number }) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const resize = useCallback(() => { const el = ref.current; if (!el) return; el.style.height = "auto"; el.style.height = Math.max(el.scrollHeight, minRows * 22 + 18) + "px"; }, [minRows]);
  useEffect(() => { resize(); }, [value, resize]);
  return <textarea ref={ref} className="sm-ta" value={value} placeholder={placeholder} onChange={(e) => { onChange(e.target.value); resize(); }} onInput={resize} rows={minRows} />;
}
function Field({ label, children }: { label: string; children: ReactNode }) { return <div className="sm-field"><label>{label}</label>{children}</div>; }
function Checks({ title, list, value, onToggle }: { title: string; list: string[]; value: Record<string, boolean>; onToggle: (k: string) => void }) {
  return <div className="pf-checks"><h5>{title}</h5><div className="pf-chgrid">{list.map((k) => <label key={k} className={value[k] ? "on" : ""}><input type="checkbox" checked={!!value[k]} onChange={() => onToggle(k)} /> {k}</label>)}</div></div>;
}
function ShotZones({ value, onChange }: { value?: string; onChange: (d: string) => void }) {
  const cRef = useRef<HTMLCanvasElement | null>(null); const wrapRef = useRef<HTMLDivElement | null>(null);
  const drawing = useRef(false); const last = useRef({ x: 0, y: 0 });
  const [color, setColor] = useState("#16a34a"); const [size, setSize] = useState(14);
  const redraw = useCallback((withV?: string) => {
    const c = cRef.current, wrap = wrapRef.current; if (!c || !wrap) return;
    const r = wrap.getBoundingClientRect(); c.width = r.width; c.height = r.height;
    const ctx = c.getContext("2d"); if (!ctx) return; drawHalfCourt(ctx, c.width, c.height);
    const v = withV ?? value; if (v) { const img = new Image(); img.onload = () => ctx.drawImage(img, 0, 0, c.width, c.height); img.src = v; }
  }, [value]);
  useEffect(() => { redraw(); /* eslint-disable-next-line */ }, []);
  const xy = (e: RME | RTE) => { const c = cRef.current!; const r = c.getBoundingClientRect(); const t = "touches" in e ? e.touches[0] : (e as RME); return { x: (t.clientX - r.left) * (c.width / r.width), y: (t.clientY - r.top) * (c.height / r.height) }; };
  const start = (e: RME | RTE) => { drawing.current = true; last.current = xy(e); };
  const move = (e: RME | RTE) => { if (!drawing.current) return; const ctx = cRef.current?.getContext("2d"); if (!ctx) return; const { x, y } = xy(e); ctx.strokeStyle = color; ctx.globalAlpha = .5; ctx.lineWidth = size; ctx.lineCap = "round"; ctx.lineJoin = "round"; ctx.beginPath(); ctx.moveTo(last.current.x, last.current.y); ctx.lineTo(x, y); ctx.stroke(); ctx.globalAlpha = 1; last.current = { x, y }; };
  const stop = () => { if (!drawing.current) return; drawing.current = false; const c = cRef.current; if (c) onChange(c.toDataURL("image/png")); };
  const clear = () => { redraw(""); onChange(""); };
  return (
    <div className="sz">
      <div className="sz-tools">
        <button type="button" style={{ background: "#16a34a", opacity: color === "#16a34a" ? 1 : .55 }} onClick={() => setColor("#16a34a")}>Fort</button>
        <button type="button" style={{ background: "#dc2626", opacity: color === "#dc2626" ? 1 : .55 }} onClick={() => setColor("#dc2626")}>Faible</button>
        <button type="button" style={{ background: "#f59e0b", opacity: color === "#f59e0b" ? 1 : .55 }} onClick={() => setColor("#f59e0b")}>Préféré</button>
        <input type="range" min={6} max={30} value={size} onChange={(e) => setSize(Number(e.target.value))} />
        <button type="button" className="sz-clear" onClick={clear}>Effacer</button>
      </div>
      <div className="sz-wrap" ref={wrapRef}><canvas ref={cRef} onMouseDown={start} onMouseMove={move} onMouseUp={stop} onMouseLeave={stop} onTouchStart={start} onTouchMove={move} onTouchEnd={stop} /></div>
    </div>
  );
}

/* ===================== Carte « système » (schéma visible) =================== */
function PlayCard({ play, onPreview, onEdit, onRemove, onSaveSystem }: { play: OppPlay; onPreview: () => void; onEdit: () => void; onRemove: () => void; onSaveSystem: () => void }) {
  const phases = play.schemaImages?.length || 0;
  return (
    <article className="sc">
      <div className="sc-thumb">
        {play.schemaImage ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={play.schemaImage} alt={play.title} /> : <span className="sc-ph">🏀<i>Schéma</i></span>}
        <span className="sc-kind">{play.kind}</span>
        {phases > 1 && <span className="sc-phases">{phases} phases</span>}
      </div>
      <div className="sc-body">
        <h4>{play.title}</h4>
        {play.description && <p className="sc-desc">{play.description}</p>}
        <div className="sc-act">
          <button onClick={onPreview} title="Aperçu">👁</button>
          <button onClick={onEdit} title="Modifier le dessin">✏️</button>
          <button onClick={onSaveSystem} title="Enregistrer comme nouveau système">➕</button>
          <button className="sc-del" onClick={onRemove} title="Supprimer">🗑</button>
        </div>
      </div>
    </article>
  );
}

/* ============================== Composant ============================ */
export default function ScoutingModule() {
  const supabase = useMemo(() => createClient(), []);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [sc, setSc] = useState<Scouting>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [autoInfo, setAutoInfo] = useState("");
  const [saved, setSaved] = useState(false);
  const [openPlayer, setOpenPlayer] = useState<string | null>(null);
  const [previewPlay, setPreviewPlay] = useState<OppPlay | null>(null);
  // mini-modale « Dessiner un système » : choix du type + titre avant d'ouvrir la plaquette
  const [draftSys, setDraftSys] = useState<{ id?: string; title: string; kind: string; play?: OppPlay } | null>(null);
  const dirty = useRef(false); const teamRef = useRef(""); teamRef.current = teamId; const scRef = useRef(sc); scRef.current = sc;
  const consumedRef = useRef(false);
  const flash = useCallback(() => { setSaved(true); window.setTimeout(() => setSaved(false), 1600); }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try { const t = await readTeams(); setTeams(t); let id = lsGet<string>(K_SEL) || ""; if (typeof id !== "string" || !t.some((x) => x.id === id)) { id = t[0]?.id ?? ""; lsSet(K_SEL, id); } setTeamId(id); dirty.current = false; setSc(id ? await readScout(supabase, id) : EMPTY); }
    catch (e) { console.error(e); } finally { setLoading(false); }
  }, [supabase]);
  useEffect(() => { load(); }, [load]);

  // Retour de la plaquette : on récupère le schéma dessiné et on l'ajoute/met à jour dans le playbook.
  useEffect(() => {
    if (loading || consumedRef.current) return;
    const raw = lsGet<any>("mybasket_plaquette_result");
    const pending = lsGet<any>(K_PENDING);
    if (!raw || !pending) return;
    consumedRef.current = true;
    lsDel("mybasket_plaquette_result");
    lsDel(K_PENDING);
    const imgs: string[] = Array.isArray(raw.schemaImages) ? raw.schemaImages : [];
    const dataList: any[] = Array.isArray(raw.schemaDataList) ? raw.schemaDataList : [];
    const cover = imgs[0] || "";
    if (!cover) return; // rien d'exploitable
    (async () => {
      const targetTeam = pending.teamId || teamRef.current;
      let base = scRef.current;
      if (targetTeam && targetTeam !== teamRef.current) { base = await readScout(supabase, targetTeam); setTeamId(targetTeam); lsSet(K_SEL, targetTeam); }
      const play: OppPlay = {
        id: pending.playId || newId(),
        title: pending.title || "Système adverse",
        kind: pending.kind || "Attaque",
        category: pending.kind || "Attaque",
        schemaImage: cover, schemaImages: imgs, schemaDataList: dataList,
        description: pending.description || "",
      };
      const exists = base.oppPlays.some((p) => p.id === play.id);
      const nextPlays = exists ? base.oppPlays.map((p) => (p.id === play.id ? { ...p, ...play } : p)) : [...base.oppPlays, play];
      const next = { ...base, oppPlays: nextPlays };
      setSc(next); dirty.current = true;
      try { await writeScout(supabase, targetTeam, next); dirty.current = false; flash(); } catch {}
      if (pending.asSystem) saveAsSystem(play);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading]);

  useEffect(() => {
    const onF = async () => { const id = teamRef.current; if (id && !dirty.current) setSc(await readScout(supabase, id)); };
    window.addEventListener("focus", onF); document.addEventListener("visibilitychange", onF);
    return () => { window.removeEventListener("focus", onF); document.removeEventListener("visibilitychange", onF); };
  }, [supabase]);
  useEffect(() => {
    if (loading || !teamId || !dirty.current) return;
    const t = window.setTimeout(async () => { try { await writeScout(supabase, teamId, scRef.current); dirty.current = false; flash(); } catch {} }, 800);
    return () => window.clearTimeout(t);
  }, [sc, teamId, loading, supabase, flash]);

  const team = useMemo(() => teams.find((t) => t.id === teamId) || null, [teams, teamId]);
  const patch = useCallback((p: Partial<Scouting>) => { dirty.current = true; setSc((s) => ({ ...s, ...p })); }, []);
  const patchSheet = useCallback((p: Partial<TeamSheet>) => { dirty.current = true; setSc((s) => ({ ...s, sheet: { ...s.sheet, ...p } })); }, []);
  const setTableCell = (row: string, col: keyof Row3, v: string) => { dirty.current = true; setSc((s) => ({ ...s, sheet: { ...s.sheet, table: { ...s.sheet.table, [row]: { ...s.sheet.table[row], [col]: v } } } })); };
  const setBest = (k: keyof TeamSheet["best"], v: string) => { dirty.current = true; setSc((s) => ({ ...s, sheet: { ...s.sheet, best: { ...s.sheet.best, [k]: v } } })); };
  const setDef = (k: keyof TeamSheet["defense"], v: string) => { dirty.current = true; setSc((s) => ({ ...s, sheet: { ...s.sheet, defense: { ...s.sheet.defense, [k]: v } } })); };

  const selectTeam = async (id: string) => { if (dirty.current && teamId) { try { await writeScout(supabase, teamId, scRef.current); } catch {} } setTeamId(id); lsSet(K_SEL, id); dirty.current = false; setSc(await readScout(supabase, id)); };
  const saveNow = async () => { try { if (teamId) { await writeScout(supabase, teamId, scRef.current); dirty.current = false; } flash(); } catch { window.alert("Sauvegarde impossible."); } };

  // ---------- Effectif ----------
  const addPlayer = () => { const p: ScoutPlayer = { id: newId(), num: "", name: "", poste: "", taille: "", age: "", role: "Rotation", strongHand: "", off: {}, def: {} }; patch({ players: [...sc.players, p] }); setOpenPlayer(p.id); };
  const updatePlayer = (p: ScoutPlayer) => patch({ players: sc.players.map((x) => (x.id === p.id ? p : x)) });
  const removePlayer = (id: string) => patch({ players: sc.players.filter((x) => x.id !== id) });
  const importRoster = () => {
    const roster = (team?.players || []).map<ScoutPlayer>((pl) => ({ id: newId(), num: String(pl.num ?? ""), name: `${pl.firstName || ""} ${pl.lastName || ""}`.trim(), poste: pl.poste || "", taille: "", age: "", role: "Rotation", strongHand: "", photo: pl.photo, off: {}, def: {} }));
    if (!roster.length) { window.alert("Aucun effectif trouvé pour cette équipe."); return; }
    patch({ players: [...sc.players, ...roster] });
  };
  const autoFill = () => setAutoInfo("Le mode automatique nécessite un connecteur serveur vers une source de données. Tu peux continuer en mode manuel ; aucune donnée saisie ne sera perdue.");

  // ---------- Playbook adverse (via la VRAIE plaquette) ----------
  const openPlaquette = (opts: { id?: string; title: string; kind: string; asSystem?: boolean; play?: OppPlay }) => {
    // sauvegarde le scouting courant avant de quitter (les non-enregistrés ne sont pas perdus)
    if (teamId) { writeScout(supabase, teamId, scRef.current).catch(() => {}); }
    lsSet(K_PENDING, { teamId, playId: opts.id || null, title: opts.title || "Système adverse", kind: opts.kind || "Attaque", asSystem: !!opts.asSystem });
    // contexte de retour pour la plaquette (affiche le bouton « Insérer » et nous renvoie ici)
    try { localStorage.setItem("mb_plaquette_return_to", "/mon-compte?tab=management&module=gameplan&gamePlanTab=scout"); } catch {}
    // on repart propre : pas d'ids exercice/système hérités → la plaquette génère un dossier dédié
    ["mybasket_edit_exercise_id", "mybasket_current_exercise_id", "mybasket_edit_system_id", "mybasket_current_system_id", "mybasket_edit_schema_index", "mybasket_edit_schema_group_id"].forEach(lsDel);
    // réédition : on charge les phases existantes du système
    const load = opts.play?.schemaDataList?.[0];
    if (load) { try { localStorage.setItem("mybasket_plaquette_load", JSON.stringify(load)); } catch {} } else { lsDel("mybasket_plaquette_load"); }
    consumedRef.current = false;
    window.location.href = `${PLAQUETTE_URL}?type=systeme&scouting=1`;
  };

  // « enregistrer comme nouveau système » → dépose dans mes systèmes (localStorage, best-effort)
  const saveAsSystem = (play: OppPlay) => {
    try {
      const arr = lsGet<any[]>(K_SYS) || [];
      arr.push({ id: newId(), title: play.title, name: play.title, category: play.kind, type: play.kind, schemaImage: play.schemaImage, schemaImages: play.schemaImages || [], schemaDataList: play.schemaDataList || [], description: play.description, source: "scouting-playbook", createdAt: new Date().toISOString() });
      lsSet(K_SYS, arr);
      window.alert("Système ajouté à « Mes systèmes ».");
    } catch { window.alert("Impossible d'enregistrer le système."); }
  };
  const removePlay = (id: string) => patch({ oppPlays: sc.oppPlays.filter((p) => p.id !== id) });

  // confirme le brouillon de la mini-modale et part dessiner
  const confirmDraft = () => { if (!draftSys) return; const d = draftSys; setDraftSys(null); openPlaquette({ id: d.id, title: d.title.trim() || "Système adverse", kind: d.kind, play: d.play }); };

  if (loading) return <div className="sm"><div className="sm-empty">Chargement du scouting…</div><style jsx global>{css}</style></div>;
  if (!team) return <div className="sm"><div className="sm-empty">Crée d'abord une équipe dans « Mes Équipes ».</div><style jsx global>{css}</style></div>;
  const editingPlayer = sc.players.find((p) => p.id === openPlayer) || null;
  const sh = sc.sheet;
  const systems = sc.oppPlays.filter((p) => !SPECIAL_KINDS.includes(p.kind));
  const specials = sc.oppPlays.filter((p) => SPECIAL_KINDS.includes(p.kind));

  return (
    <div className="sm">
      <div className="sm-bar">
        <h2>🔎 Scouting adverse</h2>
        <div className="sm-barr">
          {teams.length > 1 && <select value={teamId} onChange={(e) => selectTeam(e.target.value)}>{teams.map((t) => <option key={t.id} value={t.id}>{t.name} {t.cat ? `· ${t.cat}` : ""}</option>)}</select>}
          {saved && <span className="sm-saved">✓ Enregistré</span>}
          <button className="sm-btn ghost" onClick={saveNow}>💾 Sauvegarder</button>
          <button className="sm-btn dark" onClick={async () => {
            await saveNow();
            await exportScoutPdf(team, scRef.current, supabase, teamId);
          }}>📥 Télécharger le scouting</button>
        </div>
      </div>

      {/* ====== Identité + Chiffres clés ====== */}
      <div className="sm-card">
        <div className="sm-cardh">
          <h3>Équipe — cahier de scouting</h3>
          <div className="sm-mode"><button className={sc.mode === "manuel" ? "on" : ""} onClick={() => patch({ mode: "manuel" })}>Manuel</button><button className={sc.mode === "auto" ? "on" : ""} onClick={() => patch({ mode: "auto" })}>Auto</button></div>
        </div>
        {sc.mode === "auto" && <><div className="sm-auto"><span>Renseigne équipe + compétition, puis récupère les données publiques.</span><button className="sm-btn dark sm" onClick={autoFill}>⟳ Récupérer</button></div>{autoInfo && <div className="sm-inline-info">{autoInfo}<button type="button" onClick={() => setAutoInfo("")}>Fermer</button></div>}</>}

        <Field label="Équipe adverse"><input value={sc.team} onChange={(e) => patch({ team: e.target.value })} placeholder="Ex : Blois" /></Field>

        {/* Chiffres clés : encart pleine largeur */}
        <div className="sm-keyswrap">
          <div className="sm-keystitle">Chiffres clés</div>
          <div className="sm-keys">
            <div className="sm-key"><label>Classement</label><input value={sc.classement} onChange={(e) => patch({ classement: e.target.value })} placeholder="3e" /></div>
            <div className="sm-key"><label>Bilan</label><input value={sc.bilan} onChange={(e) => patch({ bilan: e.target.value })} placeholder="12-4" /></div>
            <div className="sm-key"><label>Série</label><input value={sc.serie} onChange={(e) => patch({ serie: e.target.value })} placeholder="WWLW" /></div>
            <div className="sm-key"><label>Last 4</label><input value={sh.last4} onChange={(e) => patchSheet({ last4: e.target.value })} placeholder="V / D" /></div>
            <div className="sm-key"><label>Pts pour</label><input value={sc.ptsFor} onChange={(e) => patch({ ptsFor: e.target.value })} placeholder="78.4" /></div>
            <div className="sm-key"><label>Pts contre</label><input value={sc.ptsAgainst} onChange={(e) => patch({ ptsAgainst: e.target.value })} placeholder="71.2" /></div>
            <div className="sm-key"><label>ORTG</label><input value={sc.ortg} onChange={(e) => patch({ ortg: e.target.value })} /></div>
            <div className="sm-key"><label>DRTG</label><input value={sc.drtg} onChange={(e) => patch({ drtg: e.target.value })} /></div>
            <div className="sm-key"><label>Pace</label><input value={sc.pace} onChange={(e) => patch({ pace: e.target.value })} /></div>
            <div className="sm-key"><label>Rang ATT</label><input value={sh.attaqueRank} onChange={(e) => patchSheet({ attaqueRank: e.target.value })} placeholder="2e" /></div>
            <div className="sm-key"><label>Rang DEF</label><input value={sh.defenseRank} onChange={(e) => patchSheet({ defenseRank: e.target.value })} placeholder="5e" /></div>
          </div>
        </div>

        <div className="sm-grid2">
          {/* Bloc gauche : meilleurs joueurs */}
          <div className="sm-sub">
            <table className="sm-tbl best"><thead><tr><th colSpan={2}>Meilleurs joueurs</th></tr></thead><tbody>
              <tr><td>3pts</td><td><input value={sh.best.tirs3} onChange={(e) => setBest("tirs3", e.target.value)} /></td></tr>
              <tr><td>LF</td><td><input value={sh.best.lf} onChange={(e) => setBest("lf", e.target.value)} /></td></tr>
              <tr><td>Rbd Off</td><td><input value={sh.best.rbdOff} onChange={(e) => setBest("rbdOff", e.target.value)} /></td></tr>
              <tr><td>Int</td><td><input value={sh.best.int} onChange={(e) => setBest("int", e.target.value)} /></td></tr>
              <tr><td>Drive</td><td><input value={sh.best.drive} onChange={(e) => setBest("drive", e.target.value)} /></td></tr>
            </tbody></table>
          </div>
          {/* Bloc droit : tableau ATT/DEF/V/D */}
          <div className="sm-sub">
            <table className="sm-tbl"><thead><tr><th></th><th>ATT</th><th>DEF</th><th>V/D</th></tr></thead><tbody>
              {TABLE_ROWS.map((row) => (
                <tr key={row}><td className="rl">{row}</td>
                  <td><input value={sh.table[row]?.att || ""} onChange={(e) => setTableCell(row, "att", e.target.value)} /></td>
                  <td><input value={sh.table[row]?.def || ""} onChange={(e) => setTableCell(row, "def", e.target.value)} /></td>
                  <td><input value={sh.table[row]?.vd || ""} onChange={(e) => setTableCell(row, "vd", e.target.value)} /></td>
                </tr>
              ))}
            </tbody></table>
          </div>
        </div>

        {/* résumés Dom/Ext : pleine largeur */}
        <Field label="Résumé — Domicile"><AutoTextarea value={sh.resumeDom} onChange={(v) => patchSheet({ resumeDom: v })} minRows={2} /></Field>
        <Field label="Résumé — Extérieur"><AutoTextarea value={sh.resumeExt} onChange={(v) => patchSheet({ resumeExt: v })} minRows={2} /></Field>
      </div>

      {/* ====== Plan de jeu adverse — tout en blocs pleine largeur ====== */}
      <div className="sm-card">
        <div className="sm-cardh"><h3>Plan de jeu adverse</h3></div>
        <Field label="Général"><AutoTextarea value={sh.general} onChange={(v) => patchSheet({ general: v })} placeholder="Style, rythme, identité, tendances clés…" minRows={3} /></Field>
        <Field label="Attaque"><AutoTextarea value={sh.attaque} onChange={(v) => patchSheet({ attaque: v })} placeholder="Systèmes principaux, PnR, options, joueurs à la finition…" minRows={4} /></Field>
        <div className="sm-defhead">Défense</div>
        <Field label="Picks 45°"><AutoTextarea value={sh.defense.picks45} onChange={(v) => setDef("picks45", v)} minRows={2} /></Field>
        <Field label="Zone"><AutoTextarea value={sh.defense.zone} onChange={(v) => setDef("zone", v)} minRows={2} /></Field>
        <Field label="Picks Axe"><AutoTextarea value={sh.defense.picksAxe} onChange={(v) => setDef("picksAxe", v)} minRows={2} /></Field>
        <Field label="Presse"><AutoTextarea value={sh.defense.presse} onChange={(v) => setDef("presse", v)} minRows={2} /></Field>
        <Field label="Post-up"><AutoTextarea value={sh.defense.postup} onChange={(v) => setDef("postup", v)} minRows={2} /></Field>
        <Field label="Forces"><AutoTextarea value={sc.strengths} onChange={(v) => patch({ strengths: v })} placeholder={"Tir à 3 pts\nTransition"} minRows={3} /></Field>
        <Field label="Faiblesses"><AutoTextarea value={sc.weaknesses} onChange={(v) => patch({ weaknesses: v })} placeholder={"Défense PnR\nPertes de balle"} minRows={3} /></Field>
      </div>

      {/* ====== Playbook adverse (dessiné avec l'outil de dessin) ====== */}
      <div className="sm-card">
        <div className="sm-cardh"><h3>📋 Playbook adverse</h3><button className="sm-btn dark sm" onClick={() => setDraftSys({ title: "", kind: "Attaque" })}>✏️ Dessiner un système</button></div>
        {systems.length ? (
          <div className="sm-sysgrid">
            {systems.map((p) => <PlayCard key={p.id} play={p} onPreview={() => setPreviewPlay(p)} onEdit={() => setDraftSys({ id: p.id, title: p.title, kind: p.kind, play: p })} onRemove={() => removePlay(p.id)} onSaveSystem={() => saveAsSystem(p)} />)}
          </div>
        ) : <div className="sm-sysempty"><p>Aucun système adverse. Dessine leurs systèmes avec l'outil de dessin — ils apparaîtront en schémas, comme tes systèmes offensifs.</p><button className="sm-add" onClick={() => setDraftSys({ title: "", kind: "Attaque" })}>✏️ Dessiner un système adverse</button></div>}
      </div>

      {/* ====== Situations spéciales (BLOB / SLOB) — comme des systèmes, schémas visibles ====== */}
      <div className="sm-card">
        <div className="sm-cardh"><h3>🎯 Situations spéciales</h3><button className="sm-btn dark sm" onClick={() => setDraftSys({ title: "", kind: "BLOB" })}>✏️ Dessiner une situation</button></div>
        {specials.length ? (
          <div className="sm-sysgrid">
            {specials.map((p) => <PlayCard key={p.id} play={p} onPreview={() => setPreviewPlay(p)} onEdit={() => setDraftSys({ id: p.id, title: p.title, kind: p.kind, play: p })} onRemove={() => removePlay(p.id)} onSaveSystem={() => saveAsSystem(p)} />)}
          </div>
        ) : <div className="sm-sysempty"><p>Remises en jeu (BLOB / SLOB) et sorties de temps-mort (ATO) de l'adversaire. Dessine-les comme des systèmes — schéma à l'appui.</p><button className="sm-add" onClick={() => setDraftSys({ title: "", kind: "BLOB" })}>✏️ Dessiner une situation spéciale</button></div>}
      </div>

      {/* ====== Effectif + fiches ====== */}
      <div className="sm-card">
        <div className="sm-cardh"><h3>👥 Effectif adverse</h3><div className="sm-row"><button className="sm-add" onClick={importRoster}>⬇ Importer mon effectif</button><button className="sm-btn dark sm" onClick={addPlayer}>＋ Joueur</button></div></div>
        {sc.players.length ? (
          <div className="sm-roster">
            {sc.players.map((p) => (
              <button key={p.id} className="sm-pl" onClick={() => setOpenPlayer(p.id)}>
                <span className="sm-av">{p.photo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={p.photo} alt="" /> : <i>{p.num ? `#${p.num}` : "?"}</i>}</span>
                <span className="sm-pln"><b>{p.name || "Joueur"}</b><i>{[p.num ? `#${p.num}` : "", p.poste, p.taille, p.role].filter(Boolean).join(" · ")}</i></span>
                {p.profil && <span className="sm-tag">{p.profil}</span>}
              </button>
            ))}
          </div>
        ) : <p className="sm-muted">Aucun joueur. Importe l'effectif ou ajoute-les un par un.</p>}
      </div>

      {editingPlayer && <PlayerFiche player={editingPlayer} onClose={() => setOpenPlayer(null)} onChange={updatePlayer} onRemove={() => { removePlayer(editingPlayer.id); setOpenPlayer(null); }} />}

      {/* mini-modale : type + nom avant d'ouvrir l'outil de dessin */}
      {draftSys && (
        <div className="md-bg" onClick={() => setDraftSys(null)}>
          <div className="md" onClick={(e) => e.stopPropagation()}>
            <div className="md-h"><h3>{draftSys.id ? "Modifier le système" : "Nouveau système"}</h3><button onClick={() => setDraftSys(null)}>✕</button></div>
            <p className="md-cat">L'outil de dessin (plaquette) s'ouvre. Dessine le système, puis clique « Insérer » pour le ramener ici.</p>
            <div className="sm-2">
              <Field label="Nom du système"><input value={draftSys.title} onChange={(e) => setDraftSys((d) => d && { ...d, title: e.target.value })} placeholder="Ex : Horns adverse" /></Field>
              <Field label="Type"><select value={draftSys.kind} onChange={(e) => setDraftSys((d) => d && { ...d, kind: e.target.value })}>{PLAY_KINDS.map((k) => <option key={k}>{k}</option>)}</select></Field>
            </div>
            <div className="md-act end"><button className="sm-add" onClick={() => setDraftSys(null)}>Annuler</button><button className="sm-btn dark" onClick={confirmDraft}>✏️ Ouvrir l'outil de dessin</button></div>
          </div>
        </div>
      )}

      {/* aperçu d'un système */}
      {previewPlay && (
        <div className="md-bg" onClick={() => setPreviewPlay(null)}>
          <div className="md wide" onClick={(e) => e.stopPropagation()}>
            <div className="md-h"><h3>{previewPlay.title}</h3><button onClick={() => setPreviewPlay(null)}>✕</button></div>
            <div className="md-prev">{previewPlay.schemaImage ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={previewPlay.schemaImage} alt="" /> : <div className="md-ph">Aucun schéma</div>}</div>
            {previewPlay.schemaImages && previewPlay.schemaImages.length > 1 && (
              <div className="md-strip">{previewPlay.schemaImages.map((u, i) => /* eslint-disable-next-line @next/next/no-img-element */ <img key={i} src={u} alt={`Phase ${i + 1}`} />)}</div>
            )}
            <p className="md-cat">{previewPlay.kind}{previewPlay.description ? ` · ${previewPlay.description}` : ""}</p>
            <div className="md-act end"><button className="sm-add" onClick={() => setPreviewPlay(null)}>Fermer</button><button className="sm-btn dark" onClick={() => { const p = previewPlay; setPreviewPlay(null); setDraftSys({ id: p.id, title: p.title, kind: p.kind, play: p }); }}>✏️ Modifier le dessin</button></div>
          </div>
        </div>
      )}

      <style jsx global>{css}</style>
    </div>
  );
}

/* ============================ Fiche joueur ========================== */
function PlayerFiche({ player, onClose, onChange, onRemove }: { player: ScoutPlayer; onClose: () => void; onChange: (p: ScoutPlayer) => void; onRemove: () => void }) {
  const up = (p: Partial<ScoutPlayer>) => onChange({ ...player, ...p });
  const tOff = (k: string) => up({ off: { ...player.off, [k]: !player.off[k] } });
  const tDef = (k: string) => up({ def: { ...player.def, [k]: !player.def[k] } });
  const onPhoto = (file?: File) => { if (!file) return; const r = new FileReader(); r.onload = () => up({ photo: String(r.result) }); r.readAsDataURL(file); };
  return (
    <div className="md-bg" onClick={onClose}>
      <div className="md wide" onClick={(e) => e.stopPropagation()}>
        <div className="md-h"><h3>Fiche joueur</h3><button onClick={onClose}>✕</button></div>
        <div className="pf-top">
          <label className="pf-photo">{player.photo ? /* eslint-disable-next-line @next/next/no-img-element */ <img src={player.photo} alt="" /> : <span>＋ Photo</span>}<input type="file" accept="image/*" onChange={(e) => onPhoto(e.target.files?.[0])} hidden /></label>
          <div className="pf-id">
            <div className="sm-4"><Field label="N°"><input value={player.num} onChange={(e) => up({ num: e.target.value })} /></Field><Field label="Poste"><input value={player.poste} onChange={(e) => up({ poste: e.target.value })} placeholder="1-5" /></Field><Field label="Taille"><input value={player.taille} onChange={(e) => up({ taille: e.target.value })} placeholder="193 cm" /></Field><Field label="Âge"><input value={player.age} onChange={(e) => up({ age: e.target.value })} /></Field></div>
            <div className="sm-3"><Field label="Nom"><input value={player.name} onChange={(e) => up({ name: e.target.value })} /></Field><Field label="Rôle"><select value={player.role} onChange={(e) => up({ role: e.target.value as any })}><option>Majeur</option><option>Rotation</option></select></Field><Field label="Main forte"><select value={player.strongHand} onChange={(e) => up({ strongHand: e.target.value as any })}><option value="">—</option><option>Droite</option><option>Gauche</option></select></Field></div>
            <div className="sm-2"><Field label="Club"><input value={player.club || ""} onChange={(e) => up({ club: e.target.value })} placeholder="Blois (espoirs Pro B)" /></Field><Field label="Profil"><select value={player.profil || ""} onChange={(e) => up({ profil: e.target.value })}><option value="">—</option>{PROFILS.map((x) => <option key={x}>{x}</option>)}</select></Field></div>
          </div>
        </div>
        <h5 className="pf-sec">Statistiques (par match)</h5>
        <div className="pf-stats">
          <Field label="Matchs"><input value={player.games || ""} onChange={(e) => up({ games: e.target.value })} /></Field>
          <Field label="PTS"><input value={player.pts || ""} onChange={(e) => up({ pts: e.target.value })} /></Field>
          <Field label="REB"><input value={player.reb || ""} onChange={(e) => up({ reb: e.target.value })} /></Field>
          <Field label="AST"><input value={player.ast || ""} onChange={(e) => up({ ast: e.target.value })} /></Field>
          <Field label="STL"><input value={player.stl || ""} onChange={(e) => up({ stl: e.target.value })} /></Field>
          <Field label="TO"><input value={player.to || ""} onChange={(e) => up({ to: e.target.value })} /></Field>
        </div>
        <div className="pf-shoot">
          <div><label>3PT (réussis / tentés)</label><div className="pf-ma"><input value={player.fg3m || ""} onChange={(e) => up({ fg3m: e.target.value })} placeholder="m" /><span>/</span><input value={player.fg3a || ""} onChange={(e) => up({ fg3a: e.target.value })} placeholder="a" /><b>{pct(player.fg3m, player.fg3a)}</b></div></div>
          <div><label>2PT</label><div className="pf-ma"><input value={player.fg2m || ""} onChange={(e) => up({ fg2m: e.target.value })} placeholder="m" /><span>/</span><input value={player.fg2a || ""} onChange={(e) => up({ fg2a: e.target.value })} placeholder="a" /><b>{pct(player.fg2m, player.fg2a)}</b></div></div>
          <div><label>LF</label><div className="pf-ma"><input value={player.ftm || ""} onChange={(e) => up({ ftm: e.target.value })} placeholder="m" /><span>/</span><input value={player.fta || ""} onChange={(e) => up({ fta: e.target.value })} placeholder="a" /><b>{pct(player.ftm, player.fta)}</b></div></div>
        </div>
        <div className="sm-2"><Checks title="Tendances offensives" list={OFF_TENDENCIES} value={player.off} onToggle={tOff} /><Checks title="Tendances défensives" list={DEF_TENDENCIES} value={player.def} onToggle={tDef} /></div>
        <h5 className="pf-sec">Zones de tir</h5>
        <p className="sm-muted sm">Vert = zones fortes · Rouge = faibles · Orange = préférées.</p>
        <ShotZones value={player.shotZones} onChange={(d) => up({ shotZones: d })} />
        <div className="sm-2"><Field label="Notes offensives"><AutoTextarea value={player.notesOff || ""} onChange={(v) => up({ notesOff: v })} placeholder="Arrière scoreur, bon créateur, drive…" minRows={3} /></Field><Field label="Notes défensives / à exploiter"><AutoTextarea value={player.notesDef || ""} onChange={(v) => up({ notesDef: v })} placeholder="Ne pas lui laisser 3m, faible aux LF…" minRows={3} /></Field></div>
        <div className="md-act"><button className="sm-del" onClick={onRemove}>🗑 Supprimer</button><button className="sm-btn dark" onClick={onClose}>Fermer</button></div>
      </div>
    </div>
  );
}

/* ============================ Export PDF ============================ */
async function exportScoutPdf(
  team: Team,
  sc: Scouting,
  supabase: ReturnType<typeof createClient>,
  teamId: string,
) {
  const esc = escapeHtml; const sh = sc.sheet;
  const list = (t: string) => esc(t || "—").split("\n").filter(Boolean).map((x) => `<li>${x}</li>`).join("") || "<li>—</li>";
  const tableRows = TABLE_ROWS.map((r) => `<tr><td class="rl">${esc(r)}</td><td>${esc(sh.table[r]?.att || "")}</td><td>${esc(sh.table[r]?.def || "")}</td><td>${esc(sh.table[r]?.vd || "")}</td></tr>`).join("");
  const playCard = (p: OppPlay) => `<div class="sys">${p.schemaImage ? `<img src="${p.schemaImage}"/>` : `<div class="court">SCHÉMA</div>`}<b>${esc(p.title)}</b><span>${esc(p.kind || "")}</span>${p.description ? `<p>${esc(p.description)}</p>` : ""}</div>`;
  const systems = sc.oppPlays.filter((p) => !SPECIAL_KINDS.includes(p.kind));
  const specials = sc.oppPlays.filter((p) => SPECIAL_KINDS.includes(p.kind));
  const playsHtml = systems.map(playCard).join("") || "<div class='box'>—</div>";
  const specialsHtml = specials.map(playCard).join("") || "<div class='box'>—</div>";
  const pages = sc.players.map((p) => `
    <div class="page">
      <div class="phead"><div class="pphoto">${p.photo ? `<img src="${p.photo}"/>` : ""}</div>
        <div><h1>${p.num ? "#" + esc(p.num) + " " : ""}${esc(p.name || "Joueur")}</h1>
        <div class="sub">${[p.poste, p.taille, p.age ? p.age + " ans" : "", p.role, p.profil].filter((v): v is string => Boolean(v)).map(esc).join(" · ")}</div>
        <div class="sub">${esc(p.club || "")}</div></div></div>
      <table class="st"><thead><tr><th>Matchs</th><th>PTS</th><th>REB</th><th>AST</th><th>STL</th><th>TO</th><th>3PT</th><th>2PT</th><th>LF</th></tr></thead>
      <tbody><tr><td>${esc(p.games || "—")}</td><td>${esc(p.pts || "—")}</td><td>${esc(p.reb || "—")}</td><td>${esc(p.ast || "—")}</td><td>${esc(p.stl || "—")}</td><td>${esc(p.to || "—")}</td><td>${pct(p.fg3m, p.fg3a)}</td><td>${pct(p.fg2m, p.fg2a)}</td><td>${pct(p.ftm, p.fta)}</td></tr></tbody></table>
      <div class="grid2"><div class="box"><b>Tendances offensives</b><p>${Object.keys(p.off || {}).filter((k) => p.off[k]).map(esc).join(", ") || "—"}</p></div><div class="box"><b>Tendances défensives</b><p>${Object.keys(p.def || {}).filter((k) => p.def[k]).map(esc).join(", ") || "—"}</p></div></div>
      ${p.shotZones ? `<div class="zones"><b>Zones de tir</b><br/><img src="${p.shotZones}"/></div>` : ""}
      <div class="grid2"><div class="box red"><b>Offensif</b><p>${esc(p.notesOff || "—")}</p></div><div class="box green"><b>À exploiter</b><p>${esc(p.notesDef || "—")}</p></div></div>
    </div>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"/><title>Scouting — ${esc(sc.team || team.name || "")}</title><style>
  @page{size:A4;margin:10mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;margin:0;color:#1A0F12;font-size:10px;line-height:1.3}
  .page{min-height:277mm;page-break-after:always}h1{margin:0;color:#6B1A2C;font-size:20px}h2{color:#6B1A2C;font-size:13px;margin:10px 0 5px;border-bottom:1px solid #D4A24C;padding-bottom:2px;text-transform:uppercase}
  .meta{display:grid;grid-template-columns:repeat(4,1fr);gap:6px;margin-bottom:8px}.meta div,.box{background:#FAF7F0;border-left:3px solid #D4A24C;padding:6px;border-radius:4px}.meta b{display:block;color:#6B1A2C;font-size:8px;text-transform:uppercase}
  .grid2{display:grid;grid-template-columns:1fr 1fr;gap:8px}.box.red{border-left-color:#dc2626}.box.green{border-left-color:#16a34a}.box b{color:#6B1A2C}
  table{width:100%;border-collapse:collapse;margin-bottom:8px}th,td{border:1px solid #ccc;padding:3px;text-align:center;font-size:9px}th{background:#111;color:#fff}.rl{background:#f2f2f2;font-weight:700;text-align:left}
  .systems{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}.sys{border:1px solid #ddd;border-radius:6px;padding:5px}.sys img{width:100%;border-radius:4px}.court{height:60px;background:#E6BE7C;border-radius:4px;display:grid;place-items:center;color:#5a2f00;font-weight:900;font-size:9px;margin-bottom:4px}.sys b{display:block;color:#6B1A2C}.sys span{color:#666;font-size:8px}.sys p{margin:3px 0 0;font-size:8.5px}
  .st th{background:#6B1A2C}.phead{display:flex;gap:12px;align-items:center;border-bottom:2px solid #6B1A2C;padding-bottom:8px;margin-bottom:8px}.pphoto{width:64px;height:74px;border-radius:6px;overflow:hidden;background:#eee;flex:0 0 auto}.pphoto img{width:100%;height:100%;object-fit:cover}.sub{color:#666;font-size:9px}
  .zones{margin:8px 0}.zones img{max-width:60%;border:1px solid #ddd;border-radius:6px}ul{margin:4px 0 0 14px;padding:0}
  </style></head><body>
  <div class="page"><h1>SCOUTING — ${esc(sc.team || team.name || "Adversaire")}</h1>
    <h2>Chiffres clés</h2>
    <div class="meta"><div><b>Classement</b>${esc(sc.classement || "—")}</div><div><b>Bilan</b>${esc(sc.bilan || "—")}</div><div><b>Série</b>${esc(sc.serie || "—")}</div><div><b>Last 4</b>${esc(sh.last4 || "—")}</div></div>
    <div class="meta"><div><b>Pts pour</b>${esc(sc.ptsFor || "—")}</div><div><b>Pts contre</b>${esc(sc.ptsAgainst || "—")}</div><div><b>Rang ATT</b>${esc(sh.attaqueRank || "—")}</div><div><b>Rang DEF</b>${esc(sh.defenseRank || "—")}</div></div>
    <div class="meta"><div><b>Pace</b>${esc(sc.pace || "—")}</div><div><b>ORTG</b>${esc(sc.ortg || "—")}</div><div><b>DRTG</b>${esc(sc.drtg || "—")}</div><div></div></div>
    <table><thead><tr><th></th><th>ATT</th><th>DEF</th><th>V/D</th></tr></thead><tbody>${tableRows}</tbody></table>
    <table><thead><tr><th colspan="2">Meilleurs joueurs</th></tr></thead><tbody>
      <tr><td class="rl">3pts</td><td>${esc(sh.best.tirs3 || "—")}</td></tr><tr><td class="rl">LF</td><td>${esc(sh.best.lf || "—")}</td></tr><tr><td class="rl">Rbd Off</td><td>${esc(sh.best.rbdOff || "—")}</td></tr><tr><td class="rl">Int</td><td>${esc(sh.best.int || "—")}</td></tr><tr><td class="rl">Drive</td><td>${esc(sh.best.drive || "—")}</td></tr>
    </tbody></table>
    <div class="grid2"><div class="box"><b>Résumé domicile</b><p>${esc(sh.resumeDom || "—")}</p></div><div class="box"><b>Résumé extérieur</b><p>${esc(sh.resumeExt || "—")}</p></div></div>
    <h2>Général</h2><div class="box">${esc(sh.general || "—")}</div>
    <h2>Attaque</h2><div class="box">${esc(sh.attaque || "—")}</div>
    <h2>Défense</h2><div class="meta"><div><b>Picks 45°</b>${esc(sh.defense.picks45 || "—")}</div><div><b>Zone</b>${esc(sh.defense.zone || "—")}</div><div><b>Picks Axe</b>${esc(sh.defense.picksAxe || "—")}</div><div><b>Presse</b>${esc(sh.defense.presse || "—")}</div></div><div class="box"><b>Post-up</b>${esc(sh.defense.postup || "—")}</div>
    <div class="grid2"><div class="box green"><b>Forces</b><ul>${list(sc.strengths)}</ul></div><div class="box red"><b>Faiblesses</b><ul>${list(sc.weaknesses)}</ul></div></div>
  </div>
  ${systems.length ? `<div class="page"><h2>Playbook adverse</h2><div class="systems">${playsHtml}</div></div>` : ""}
  ${specials.length ? `<div class="page"><h2>Situations spéciales (BLOB / SLOB / ATO)</h2><div class="systems">${specialsHtml}</div></div>` : ""}
  ${pages}</body></html>`;
  const host = document.createElement("div");
  host.setAttribute("aria-hidden", "true");
  Object.assign(host.style, {
    position: "fixed",
    left: "-100000px",
    top: "0",
    width: "794px",
    background: "#ffffff",
    zIndex: "-1",
  });

  try {
    const styleMatch = html.match(/<style>([\s\S]*?)<\/style>/i);
    const bodyMatch = html.match(/<body>([\s\S]*?)<\/body>/i);
    host.innerHTML = `${styleMatch ? `<style>${styleMatch[1]}</style>` : ""}${bodyMatch ? bodyMatch[1] : html}`;
    document.body.appendChild(host);

    const images = Array.from(host.querySelectorAll("img"));
    await Promise.all(images.map((img) => new Promise<void>((resolve) => {
      if (img.complete) return resolve();
      img.onload = () => resolve();
      img.onerror = () => resolve();
    })));

    const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
      import("html2canvas"),
      import("jspdf"),
    ]);

    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4", compress: true });
    const pages = Array.from(host.querySelectorAll<HTMLElement>(".page"));

    for (let index = 0; index < pages.length; index += 1) {
      const page = pages[index];
      page.style.width = "794px";
      page.style.minHeight = "1123px";
      page.style.padding = "38px";
      page.style.background = "#ffffff";
      page.style.pageBreakAfter = "auto";

      const canvas = await html2canvas(page, {
        scale: 1.8,
        useCORS: true,
        allowTaint: false,
        backgroundColor: "#ffffff",
        logging: false,
      });

      if (index > 0) pdf.addPage();
      const image = canvas.toDataURL("image/jpeg", 0.92);
      const ratio = Math.min(190 / canvas.width, 277 / canvas.height);
      const width = canvas.width * ratio;
      const height = canvas.height * ratio;
      pdf.addImage(image, "JPEG", (210 - width) / 2, 10, width, height, undefined, "FAST");
    }

    const safeName = (sc.team || team.name || "adversaire")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .toLowerCase() || "adversaire";
    const filename = `scouting-${safeName}-${new Date().toISOString().slice(0, 10)}.pdf`;
    const blob = pdf.output("blob");

    // Copie durable dans Supabase Storage pour consultation sur un autre appareil.
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user && teamId) {
        const path = `${user.id}/${teamId}/${Date.now()}-${filename}`;
        const { error: uploadError } = await supabase.storage
          .from("scouting-exports")
          .upload(path, blob, { contentType: "application/pdf", upsert: true });

        if (!uploadError) {
          const { data: publicData } = supabase.storage.from("scouting-exports").getPublicUrl(path);
          await supabase
            .from("management_gameplans")
            .update({ scouting_pdf_url: publicData.publicUrl, updated_at: new Date().toISOString() })
            .eq("user_id", user.id)
            .eq("team_id", teamId);
        } else {
          console.warn("Archivage du scouting dans Supabase impossible:", uploadError.message);
        }
      }
    } catch (storageError) {
      console.warn("Archivage du PDF scouting indisponible:", storageError);
    }

    pdf.save(filename);
  } catch (error) {
    console.error("Export scouting:", error);
    window.alert("Impossible de générer le PDF du scouting. Vérifie les images puis réessaie.");
  } finally {
    host.remove();
  }
}

/* =============================== Styles ============================== */
const modalCss = `
  .md-bg{position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:6000;display:flex;align-items:flex-start;justify-content:center;padding:2rem 1rem;overflow:auto}
  .md{background:#fff;border-radius:18px;width:100%;max-width:560px;padding:1.2rem 1.3rem;box-shadow:0 25px 80px rgba(0,0,0,.35)}.md.wide{max-width:780px}
  .md-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem}.md-h h3{margin:0;color:#6B1A2C;text-transform:uppercase;font-weight:900;font-size:1.05rem}.md-h button{border:none;background:none;cursor:pointer;font-size:1rem;color:#888}
  .md-prev{aspect-ratio:16/10;border-radius:10px;overflow:hidden;background:linear-gradient(135deg,#D4A24C,#F3D89B);display:grid;place-items:center;margin-bottom:.6rem}.md-prev img{width:100%;height:100%;object-fit:cover}.md-ph{color:#5a2f00;font-weight:800}
  .md-strip{display:flex;gap:.5rem;overflow-x:auto;margin-bottom:.6rem;padding-bottom:.2rem}.md-strip img{height:74px;border-radius:8px;border:1px solid #e6ddcf;flex:0 0 auto}
  .md-cat{color:#888;font-size:.82rem;margin:.2rem 0 .5rem}
  .md-act{display:flex;justify-content:space-between;gap:.6rem;margin-top:1rem}.md-act.end{justify-content:flex-end}
  .sm-del{border:1px solid #eee;background:#fff;color:#c0392b;border-radius:8px;cursor:pointer;padding:.45rem .7rem;font-weight:800}
`;
const css = `
  .sm{font-family:'Roboto',system-ui,sans-serif;color:#0F0F12;width:100%;min-width:0}
  .sm-empty{background:#FFF8EF;border:1px dashed #D4A24C;border-radius:14px;padding:2rem;text-align:center;color:#6B1A2C;font-weight:800}
  .sm-bar{display:flex;justify-content:space-between;align-items:center;gap:1rem;margin-bottom:1rem;flex-wrap:wrap}
  .sm-bar h2{margin:0;color:#6B1A2C;font-family:'Oswald',sans-serif;text-transform:uppercase;font-size:1.2rem}
  .sm-barr{display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}.sm-barr select{padding:.5rem .7rem;border:1px solid #e1d8cc;border-radius:9px;font-size:.82rem}
  .sm-saved{color:#16a34a;font-weight:800;font-size:.82rem}
  .sm-btn{border:none;border-radius:10px;padding:.6rem .95rem;font-weight:800;cursor:pointer;font-family:inherit;font-size:.85rem}
  .sm-btn.dark{background:#6B1A2C;color:#fff}.sm-btn.ghost{background:#fff;color:#6B1A2C;border:1px solid #6B1A2C}.sm-btn.dark.sm{padding:.4rem .7rem;font-size:.78rem}
  .sm-card{background:#fff;border:1px solid #ece3d6;border-radius:16px;padding:1rem;margin-bottom:1rem;box-shadow:0 8px 24px rgba(60,30,20,.05)}
  .sm-cardh{display:flex;align-items:center;justify-content:space-between;gap:.6rem;border-bottom:1.5px solid #D4A24C;padding-bottom:.55rem;margin-bottom:.8rem;flex-wrap:wrap}
  .sm-cardh h3{margin:0;color:#6B1A2C;font-weight:900;text-transform:uppercase;font-size:.95rem}
  .sm-mode{display:flex;gap:.4rem}.sm-mode button{border:1px solid #e1d8cc;background:#fff;border-radius:999px;padding:.3rem .7rem;font-size:.78rem;font-weight:800;cursor:pointer;color:#6B1A2C}.sm-mode button.on{background:#6B1A2C;color:#fff;border-color:#6B1A2C}
  .sm-auto{display:flex;justify-content:space-between;align-items:center;background:#FFF8E7;border:1px solid #D4A24C;border-radius:10px;padding:.5rem .7rem;margin-bottom:.8rem;font-size:.82rem;color:#6B1A2C}
  .sm-field{margin-bottom:.7rem}.sm-field label{display:block;font-size:.72rem;font-weight:800;color:#6B1A2C;text-transform:uppercase;letter-spacing:.03em;margin-bottom:.3rem}
  .sm :global(input),.sm :global(select){width:100%;border:1px solid #e1d8cc;border-radius:10px;padding:.6rem .7rem;font-size:.9rem;font-family:inherit;color:#0F0F12;background:#fff;box-sizing:border-box}
  .sm :global(input:focus),.sm :global(select:focus){outline:none;border-color:#6B1A2C;box-shadow:0 0 0 3px rgba(107,26,44,.1)}
  .sm-2{display:grid;grid-template-columns:1fr 1fr;gap:.6rem}.sm-3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.6rem}.sm-4{display:grid;grid-template-columns:repeat(4,1fr);gap:.5rem}
  @media(max-width:560px){.sm-2,.sm-3,.sm-4{grid-template-columns:1fr 1fr}}
  /* ---- Chiffres clés : encart pleine largeur ---- */
  .sm-keyswrap{border:1px solid #ead9bf;background:#FFFCF5;border-radius:12px;padding:.8rem;margin:.2rem 0 .9rem}
  .sm-keystitle{font-size:.74rem;font-weight:900;color:#6B1A2C;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.6rem}
  .sm-keys{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:.55rem}
  .sm-key{background:#fff;border:1px solid #efe4d2;border-radius:10px;padding:.45rem .55rem}
  .sm-key label{display:block;font-size:.64rem;font-weight:800;color:#6B1A2C;text-transform:uppercase;letter-spacing:.03em;margin-bottom:.25rem}
  .sm-key :global(input){padding:.4rem .5rem;font-size:.92rem;font-weight:700;text-align:center}
  .sm-grid2{display:grid;grid-template-columns:1fr 1.2fr;gap:1rem;margin-bottom:.4rem}@media(max-width:760px){.sm-grid2{grid-template-columns:1fr}}
  .sm-sub{min-width:0}
  .sm-tbl{width:100%;border-collapse:collapse;margin-bottom:.6rem}
  .sm-tbl th{background:#111;color:#fff;font-size:.7rem;padding:.3rem;text-transform:uppercase}
  .sm-tbl td{border:1px solid #e6ddcf;padding:0}.sm-tbl td.rl{background:#faf3e6;font-weight:800;font-size:.74rem;padding:.3rem .5rem;color:#6B1A2C;border-color:#e6ddcf}
  .sm-tbl input{border:none!important;border-radius:0!important;text-align:center;padding:.35rem!important;background:transparent!important}
  .sm-tbl input:focus{box-shadow:inset 0 0 0 2px #6B1A2C!important}
  .sm-tbl.best td:first-child{background:#faf3e6;font-weight:800;font-size:.74rem;padding:.3rem .5rem;color:#6B1A2C;width:38%}
  .sm-defhead{background:#111;color:#fff;text-align:center;font-weight:800;text-transform:uppercase;border-radius:8px;padding:.3rem;margin:.4rem 0 .6rem;font-size:.8rem;letter-spacing:.05em}
  .sm-row{display:flex;gap:.5rem;flex-wrap:wrap}
  .sm-add{border:1px solid #6B1A2C;background:#fff;color:#6B1A2C;border-radius:10px;padding:.5rem .8rem;font-weight:800;cursor:pointer;font-family:inherit;font-size:.82rem}
  .sm-muted{color:#8a7b73;font-size:.88rem}.sm-muted.sm{font-size:.78rem}
  .sm-sysgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:.8rem}
  .sm-sysempty{text-align:center;color:#8a7b73;padding:1.2rem 1rem}.sm-sysempty p{margin:0 0 .8rem}
  .sc{border:1px solid #eee;border-radius:14px;overflow:hidden;background:#fff;display:flex;flex-direction:column}
  .sc-thumb{position:relative;aspect-ratio:16/10;background:linear-gradient(135deg,#D4A24C,#F3D89B);display:grid;place-items:center;overflow:hidden}
  .sc-thumb img{width:100%;height:100%;object-fit:cover}.sc-ph{display:flex;flex-direction:column;align-items:center;color:#5a2f00;font-size:1.4rem}.sc-ph i{font-style:normal;font-size:.7rem;font-weight:800}
  .sc-kind{position:absolute;top:6px;right:6px;background:rgba(0,0,0,.7);color:#fff;border-radius:6px;padding:.1rem .4rem;font-size:.66rem;font-weight:800}
  .sc-phases{position:absolute;top:6px;left:6px;background:#6B1A2C;color:#fff;border-radius:6px;padding:.1rem .4rem;font-size:.62rem;font-weight:800}
  .sc-body{padding:.7rem}.sc-body h4{margin:0 0 .2rem;color:#6B1A2C;font-size:.92rem}
  .sc-desc{margin:.2rem 0;color:#555;font-size:.8rem;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .sc-act{display:flex;gap:.35rem;margin-top:.5rem}.sc-act button{flex:1;border:1px solid #ddd;background:#fafafa;border-radius:8px;padding:.4rem;cursor:pointer;font-size:.8rem;font-weight:700;color:#444}.sc-act .sc-del{flex:0 0 auto;color:#c0392b}
  .sm-roster{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:.6rem}
  .sm-pl{display:flex;align-items:center;gap:.6rem;border:1px solid #eee;border-radius:12px;padding:.5rem;text-align:left;cursor:pointer;background:#fff}.sm-pl:hover{border-color:#6B1A2C}
  .sm-av{width:42px;height:42px;border-radius:50%;overflow:hidden;flex:0 0 auto;background:linear-gradient(135deg,#3a3a3a,#1b1b1b);display:grid;place-items:center;color:#D4A24C;font-weight:800;font-size:.8rem}.sm-av img{width:100%;height:100%;object-fit:cover}
  .sm-pln{flex:1;min-width:0}.sm-pln b{display:block;font-size:.88rem}.sm-pln i{font-style:normal;color:#888;font-size:.74rem}
  .sm-tag{background:#6B1A2C;color:#fff;border-radius:6px;padding:.15rem .45rem;font-size:.66rem;font-weight:800}
  .sz-tools{display:flex;align-items:center;gap:.4rem;margin-bottom:.5rem;flex-wrap:wrap}
  .sz-tools button{border:none;color:#fff;border-radius:8px;padding:.35rem .7rem;font-weight:800;font-size:.76rem;cursor:pointer}
  .sz-tools .sz-clear{background:#fff!important;color:#c0392b;border:1px solid #e1c0c0;opacity:1!important}
  .sz-wrap{position:relative;width:100%;aspect-ratio:16/9;border:1px solid #e1d8cc;border-radius:12px;overflow:hidden}
  .sz-wrap canvas{position:absolute;inset:0;width:100%;height:100%;cursor:crosshair;touch-action:none}

  /* textarea pleine largeur */
  :global(.sm .sm-ta){width:100%!important;max-width:100%!important;display:block;box-sizing:border-box;border:1px solid #e1d8cc;border-radius:10px;padding:.7rem .85rem;font-size:.95rem;line-height:1.5;font-family:inherit;color:#0F0F12;background:#fff;resize:none;overflow:hidden;cursor:text}
  :global(.sm .sm-ta:focus){outline:none;border-color:#6B1A2C;box-shadow:0 0 0 3px rgba(107,26,44,.1)}

  /* styles globaux nécessaires aux modales enfants */
  :global(.md-bg){position:fixed;inset:0;background:rgba(0,0,0,.6);z-index:6000;display:flex;align-items:flex-start;justify-content:center;padding:2rem 1rem;overflow:auto}
  :global(.md){background:#fff;border-radius:18px;width:100%;max-width:560px;padding:1.2rem 1.3rem;box-shadow:0 25px 80px rgba(0,0,0,.35)}
  :global(.md.wide){max-width:780px}
  :global(.md-h){display:flex;align-items:center;justify-content:space-between;margin-bottom:.6rem}
  :global(.md-h h3){margin:0;color:#6B1A2C;text-transform:uppercase;font-weight:900;font-size:1.05rem}
  :global(.md-h button){border:none;background:none;cursor:pointer;font-size:1rem;color:#888}
  :global(.md-prev){aspect-ratio:16/10;border-radius:10px;overflow:hidden;background:linear-gradient(135deg,#D4A24C,#F3D89B);display:grid;place-items:center;margin-bottom:.6rem}
  :global(.md-prev img){width:100%;height:100%;object-fit:cover}
  :global(.md-ph){color:#5a2f00;font-weight:800}
  :global(.md-strip){display:flex;gap:.5rem;overflow-x:auto;margin-bottom:.6rem;padding-bottom:.2rem}
  :global(.md-strip img){height:74px;border-radius:8px;border:1px solid #e6ddcf;flex:0 0 auto}
  :global(.md-cat){color:#888;font-size:.82rem;margin:.2rem 0 .5rem}
  :global(.md-act){display:flex;justify-content:space-between;gap:.6rem;margin-top:1rem}
  :global(.md-act.end){justify-content:flex-end}

  :global(.pf-top){display:flex;gap:1rem;align-items:flex-start}
  :global(.pf-photo){width:120px;height:140px;flex:0 0 auto;border:1px dashed #d8cdbe;border-radius:12px;display:grid;place-items:center;overflow:hidden;cursor:pointer;background:#faf7f0;color:#8a7b73;font-weight:800;font-size:.8rem}
  :global(.pf-photo img){width:100%;height:100%;object-fit:cover}
  :global(.pf-id){flex:1;min-width:0}
  :global(.pf-sec){margin:1rem 0 .4rem;color:#6B1A2C;text-transform:uppercase;font-size:.78rem;letter-spacing:.04em;border-bottom:1px solid #eadfce;padding-bottom:.3rem}
  :global(.pf-stats){display:grid;grid-template-columns:repeat(6,1fr);gap:.5rem}
  :global(.pf-shoot){display:grid;grid-template-columns:repeat(3,1fr);gap:.6rem;margin-top:.5rem}
  :global(.pf-shoot label){font-size:.72rem;font-weight:800;color:#6B1A2C;text-transform:uppercase}
  :global(.pf-ma){display:flex;align-items:center;gap:.3rem;margin-top:.2rem}
  :global(.pf-ma input){width:48px;text-align:center}
  :global(.pf-ma b){margin-left:auto;color:#6B1A2C}
  :global(.pf-checks h5){margin:.2rem 0 .4rem;font-size:.78rem;color:#6B1A2C;text-transform:uppercase}
  :global(.pf-chgrid){display:grid;grid-template-columns:1fr 1fr;gap:.3rem}
  :global(.pf-chgrid label){display:flex;align-items:center;gap:.35rem;font-size:.8rem;border:1px solid #eee;border-radius:8px;padding:.3rem .45rem;cursor:pointer}
  :global(.pf-chgrid label.on){background:#FBEEF0;border-color:#6B1A2C;color:#6B1A2C;font-weight:700}


  /* ===== DESIGN PREMIUM MYBASKET — correction scoped-jsx + mise en page pro ===== */
  .sm{--mb-bordeaux:#6B1A2C;--mb-gold:#D4A24C;--mb-ink:#111217;--mb-soft:#FBF7EF;--mb-line:#E8DDCE;--mb-muted:#746B64;max-width:1180px;margin:0 auto;padding:1rem 0 2rem;font-family:Roboto,system-ui,-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;color:var(--mb-ink)}
  .sm *{box-sizing:border-box}
  .sm-bar{position:sticky;top:0;z-index:30;display:flex;align-items:center;justify-content:space-between;gap:1rem;padding:1rem 1.1rem;margin:0 0 1rem;background:rgba(255,255,255,.92);backdrop-filter:blur(12px);border:1px solid rgba(232,221,206,.9);border-radius:22px;box-shadow:0 18px 45px rgba(50,30,20,.08)}
  .sm-bar h2{margin:0;font-size:1.45rem;line-height:1;color:var(--mb-bordeaux);font-weight:950;letter-spacing:-.04em;text-transform:none}
  .sm-barr{display:flex;align-items:center;gap:.55rem;flex-wrap:wrap;justify-content:flex-end}
  .sm-barr select{min-width:170px;height:40px;border-radius:999px;border:1px solid var(--mb-line);padding:0 .9rem;background:#fff;font-weight:800;color:var(--mb-bordeaux)}
  .sm-saved{display:inline-flex;align-items:center;height:32px;padding:0 .7rem;border-radius:999px;background:#ECFDF3;color:#128044;font-weight:900;font-size:.78rem}
  .sm-btn{height:40px;border-radius:999px;border:1px solid transparent;padding:0 .95rem;font-weight:950;letter-spacing:-.01em;cursor:pointer;transition:transform .15s ease,box-shadow .15s ease,background .15s ease;white-space:nowrap}
  .sm-btn:hover{transform:translateY(-1px);box-shadow:0 12px 24px rgba(0,0,0,.10)}
  .sm-btn.dark{background:linear-gradient(135deg,var(--mb-bordeaux),#43101B);color:#fff;border-color:#4d1220}
  .sm-btn.ghost{background:#fff;color:var(--mb-bordeaux);border-color:rgba(107,26,44,.22)}
  .sm-btn.dark.sm{height:34px;padding:0 .8rem;font-size:.78rem}
  .sm-card{background:#fff;border:1px solid rgba(232,221,206,.95);border-radius:24px;padding:1.15rem;margin:0 0 1rem;box-shadow:0 18px 50px rgba(60,30,20,.075);overflow:hidden}
  .sm-cardh{display:flex;align-items:center;justify-content:space-between;gap:.75rem;padding-bottom:.8rem;margin-bottom:1rem;border-bottom:1px solid rgba(212,162,76,.35)}
  .sm-cardh h3{margin:0;color:var(--mb-bordeaux);font-size:1rem;font-weight:950;letter-spacing:-.02em;text-transform:none}
  .sm-mode{display:flex;align-items:center;gap:.35rem;padding:.25rem;background:#F6EFE4;border:1px solid #EEE0CB;border-radius:999px}
  .sm-mode button{height:30px;border:0;border-radius:999px;background:transparent;padding:0 .85rem;font-weight:950;color:#8A6750;cursor:pointer}
  .sm-mode button.on{background:#fff;color:var(--mb-bordeaux);box-shadow:0 8px 18px rgba(107,26,44,.10)}
  .sm-auto{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin-bottom:1rem;padding:.8rem .9rem;border-radius:18px;background:linear-gradient(135deg,#FFF6DF,#FFFDF7);border:1px solid rgba(212,162,76,.45);color:#5B3117;font-weight:750}
  .sm-field{display:flex;flex-direction:column;gap:.35rem;margin-bottom:.85rem;min-width:0}
  .sm-field label{font-size:.72rem;font-weight:950;color:var(--mb-bordeaux);text-transform:uppercase;letter-spacing:.055em}
  .sm input,.sm select,.sm textarea,.sm .sm-ta{width:100%;border:1px solid #E6D9C8;border-radius:14px;background:#FFFDF9;color:var(--mb-ink);padding:.72rem .82rem;font:inherit;font-size:.92rem;line-height:1.35;transition:border-color .15s ease,box-shadow .15s ease,background .15s ease;outline:none}
  .sm textarea,.sm .sm-ta{min-height:92px;resize:vertical}
  .sm input:focus,.sm select:focus,.sm textarea:focus,.sm .sm-ta:focus{border-color:rgba(107,26,44,.6);background:#fff;box-shadow:0 0 0 4px rgba(107,26,44,.09)}
  .sm input::placeholder,.sm textarea::placeholder{color:#B2A59A}
  .sm-2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.75rem}
  .sm-3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.75rem}
  .sm-4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:.75rem}
  .sm-keyswrap{position:relative;margin:1rem 0 1.1rem;padding:1rem;border-radius:22px;background:radial-gradient(circle at top right,rgba(212,162,76,.18),transparent 36%),linear-gradient(135deg,#FFFCF5,#F8EFE0);border:1px solid rgba(212,162,76,.36)}
  .sm-keystitle{display:inline-flex;align-items:center;height:30px;padding:0 .75rem;margin:0 0 .85rem;border-radius:999px;background:var(--mb-bordeaux);color:#fff;font-size:.72rem;font-weight:950;letter-spacing:.06em;text-transform:uppercase}
  .sm-keys{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:.7rem}
  .sm-key{min-width:0;background:rgba(255,255,255,.82);border:1px solid rgba(232,221,206,.9);border-radius:16px;padding:.62rem;box-shadow:0 10px 24px rgba(60,30,20,.045)}
  .sm-key label{display:block;margin:0 0 .35rem;color:#7D5545;font-size:.62rem;font-weight:950;letter-spacing:.055em;text-transform:uppercase;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
  .sm-key input{height:38px;text-align:center;padding:.4rem .5rem;border-radius:12px;background:#fff;font-weight:900;color:var(--mb-bordeaux)}
  .sm-grid2{display:grid;grid-template-columns:minmax(280px,.9fr) minmax(420px,1.25fr);gap:1rem;align-items:start}
  .sm-sub{min-width:0;background:#FFFDF9;border:1px solid #EEE4D7;border-radius:20px;padding:1rem}
  .sm-sub h4{margin:.1rem 0 .8rem;color:var(--mb-bordeaux);font-size:.95rem;font-weight:950;letter-spacing:-.02em}
  .sm-tbl{width:100%;border-collapse:separate;border-spacing:0;border:1px solid #E7DCCF;border-radius:16px;overflow:hidden;background:#fff;margin:.2rem 0 .85rem}
  .sm-tbl th{height:34px;background:#171216;color:#fff;font-size:.68rem;font-weight:950;text-transform:uppercase;letter-spacing:.06em;padding:.35rem}
  .sm-tbl td{border-right:1px solid #EFE5DA;border-top:1px solid #EFE5DA;padding:0;background:#fff}
  .sm-tbl td:last-child{border-right:0}
  .sm-tbl td.rl,.sm-tbl.best td:first-child{background:#FBF1E3;color:var(--mb-bordeaux);font-weight:950;font-size:.72rem;padding:.5rem .65rem;white-space:nowrap}
  .sm-tbl input{height:34px;border:0!important;border-radius:0!important;background:transparent!important;text-align:center;padding:.3rem!important;box-shadow:none!important}
  .sm-tbl input:focus{box-shadow:inset 0 0 0 2px rgba(107,26,44,.4)!important}
  .sm-defhead{display:inline-flex;align-items:center;height:32px;padding:0 .75rem;background:#171216;color:#fff;border-radius:999px;font-weight:950;font-size:.76rem;letter-spacing:.06em;text-transform:uppercase;margin:.2rem 0 .8rem}
  .sm-row{display:flex;gap:.6rem;flex-wrap:wrap;align-items:center}
  .sm-add{height:38px;border-radius:999px;padding:0 .9rem;border:1px solid rgba(107,26,44,.22);background:#fff;color:var(--mb-bordeaux);font-weight:950;cursor:pointer}
  .sm-muted{color:var(--mb-muted);font-size:.9rem;line-height:1.45}.sm-muted.sm{font-size:.78rem}
  .sm-sysgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:.9rem}
  .sm-sysempty{padding:1.8rem;border:1px dashed #D9C8B4;border-radius:20px;background:#FFFCF6;text-align:center;color:var(--mb-muted)}
  .sc{border:1px solid #E7DCCF;border-radius:18px;overflow:hidden;background:#fff;display:flex;flex-direction:column;box-shadow:0 12px 30px rgba(60,30,20,.06)}
  .sc-thumb{position:relative;aspect-ratio:16/10;background:linear-gradient(135deg,#E0AD58,#F4DEB2);display:grid;place-items:center;overflow:hidden}.sc-thumb img{width:100%;height:100%;object-fit:cover}
  .sc-ph{display:flex;flex-direction:column;align-items:center;gap:.25rem;color:#5a2f00;font-size:1.7rem}.sc-ph i{font-style:normal;font-size:.75rem;font-weight:950}
  .sc-kind,.sc-phases{position:absolute;top:8px;border-radius:999px;padding:.18rem .55rem;font-size:.64rem;font-weight:950;backdrop-filter:blur(8px)}
  .sc-kind{right:8px;background:rgba(15,15,18,.80);color:#fff}.sc-phases{left:8px;background:rgba(107,26,44,.88);color:#fff}
  .sc-body{padding:.8rem}.sc-body h4{margin:0 0 .25rem;color:var(--mb-bordeaux);font-size:.95rem;font-weight:950}.sc-desc{margin:.2rem 0;color:#5F5752;font-size:.82rem;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .sc-act{display:grid;grid-template-columns:repeat(4,1fr);gap:.38rem;margin-top:.65rem}.sc-act button{height:34px;border:1px solid #E2D8CD;background:#FAF7F0;border-radius:10px;cursor:pointer;font-size:.85rem;font-weight:800;color:#4C4642}.sc-act button:hover{border-color:var(--mb-bordeaux);background:#FFF}.sc-act .sc-del{color:#C0392B;background:#FFF4F4;border-color:#F0D2D2}
  .sm-roster{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:.7rem}.sm-pl{display:flex;align-items:center;gap:.7rem;border:1px solid #E8DED2;border-radius:16px;padding:.65rem;text-align:left;cursor:pointer;background:#fff;box-shadow:0 8px 22px rgba(60,30,20,.045)}.sm-pl:hover{border-color:var(--mb-bordeaux);transform:translateY(-1px)}
  .sm-av{width:48px;height:48px;border-radius:16px;overflow:hidden;flex:0 0 auto;background:linear-gradient(135deg,#2B2B2E,#111);display:grid;place-items:center;color:var(--mb-gold);font-weight:950;font-size:.82rem}.sm-av img{width:100%;height:100%;object-fit:cover}
  .sm-pln{flex:1;min-width:0}.sm-pln b{display:block;font-size:.92rem;color:#171216}.sm-pln i{font-style:normal;color:#887C73;font-size:.75rem}.sm-tag{background:var(--mb-bordeaux);color:#fff;border-radius:999px;padding:.22rem .55rem;font-size:.66rem;font-weight:950}
  .sz-tools{display:flex;align-items:center;gap:.45rem;margin-bottom:.55rem;flex-wrap:wrap}.sz-tools button{border:0;color:#fff;border-radius:999px;height:32px;padding:0 .72rem;font-weight:950;font-size:.74rem;cursor:pointer}.sz-tools .sz-clear{background:#fff!important;color:#c0392b;border:1px solid #e1c0c0;opacity:1!important}.sz-wrap{position:relative;width:100%;aspect-ratio:16/9;border:1px solid #E3D8C8;border-radius:18px;overflow:hidden;background:#fff}.sz-wrap canvas{position:absolute;inset:0;width:100%;height:100%;cursor:crosshair;touch-action:none}
  .md-bg{position:fixed;inset:0;background:rgba(15,12,14,.64);z-index:6000;display:flex;align-items:flex-start;justify-content:center;padding:2rem 1rem;overflow:auto;backdrop-filter:blur(5px)}
  .md{background:#fff;border-radius:24px;width:100%;max-width:560px;padding:1.25rem;box-shadow:0 30px 90px rgba(0,0,0,.35)}.md.wide{max-width:820px}.md-h{display:flex;align-items:center;justify-content:space-between;margin-bottom:.8rem}.md-h h3{margin:0;color:var(--mb-bordeaux);font-weight:950;font-size:1.08rem}.md-h button{border:0;background:#F7F1EA;border-radius:999px;width:34px;height:34px;cursor:pointer;color:#6B1A2C;font-weight:900}
  .pf-top{display:grid;grid-template-columns:130px minmax(0,1fr);gap:1rem;align-items:start}.pf-photo{width:130px;height:150px;flex:0 0 auto;border:1px dashed #D8CDBE;border-radius:18px;display:grid;place-items:center;overflow:hidden;cursor:pointer;background:#FAF7F0;color:#8A7B73;font-weight:900;font-size:.8rem}.pf-photo img{width:100%;height:100%;object-fit:cover}.pf-sec{margin:1.1rem 0 .65rem;color:var(--mb-bordeaux);font-weight:950;text-transform:uppercase;font-size:.78rem;letter-spacing:.05em;border-bottom:1px solid #EADFCE;padding-bottom:.45rem}.pf-stats{display:grid;grid-template-columns:repeat(6,1fr);gap:.55rem}.pf-shoot{display:grid;grid-template-columns:repeat(3,1fr);gap:.7rem;margin-top:.6rem}.pf-chgrid{display:grid;grid-template-columns:1fr 1fr;gap:.4rem}.pf-chgrid label{display:flex;align-items:center;gap:.35rem;font-size:.82rem;border:1px solid #EEE;border-radius:10px;padding:.45rem .55rem;cursor:pointer}.pf-chgrid label.on{background:#FBEEF0;border-color:var(--mb-bordeaux);color:var(--mb-bordeaux);font-weight:800}
  @media(max-width:980px){.sm-keys{grid-template-columns:repeat(3,minmax(0,1fr))}.sm-grid2{grid-template-columns:1fr}.sm-bar{position:relative}.sm-barr{justify-content:flex-start}.sm-4{grid-template-columns:repeat(2,minmax(0,1fr))}}
  @media(max-width:620px){.sm{padding:.5rem 0}.sm-card,.sm-bar{border-radius:18px;padding:.85rem}.sm-keys,.sm-2,.sm-3,.sm-4{grid-template-columns:1fr}.pf-top{grid-template-columns:1fr}.pf-photo{width:100%;height:180px}.pf-stats,.pf-shoot{grid-template-columns:repeat(2,1fr)}}


.sm-inline-info{display:flex;align-items:center;justify-content:space-between;gap:1rem;margin:.75rem 0 1rem;padding:.9rem 1rem;border:1px solid #e5c882;border-radius:12px;background:#fff8e8;color:#6b1a2c;font-weight:750;line-height:1.45}.sm-inline-info button{border:0;background:#6b1a2c;color:#fff;border-radius:9px;padding:.5rem .75rem;font-weight:900;cursor:pointer;white-space:nowrap}
`;