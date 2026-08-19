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
  games?: string; min?: string; pts?: string; reb?: string; orb?: string; ast?: string; stl?: string; to?: string; blk?: string;
  fg3m?: string; fg3a?: string; fg2m?: string; fg2a?: string; ftm?: string; fta?: string;
  off: Record<string, boolean>; def: Record<string, boolean>;
  shotZones?: string; notesOff?: string; notesDef?: string; profil?: string;
  profileTitle?: string; profileSubtitle?: string;
  tendency1?: string; tendency2?: string; tendency3?: string;
  priority?: string;
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
type ImportantStatRow = { id: string; number: string; player: string; stat: string };
type ImportantStatTable = { id: string; title: string; rows: ImportantStatRow[] };

type Scouting = {
  team: string; classement: string; bilan: string; serie: string; ptsFor: string; ptsAgainst: string; ortg: string; drtg: string; pace: string;
  opponentLogo?: string;
  attackSummary?: string;
  defenseSummary?: string;
  importantStats?: ImportantStatTable[];
  mode: "manuel" | "auto"; strengths: string; weaknesses: string;
  sheet: TeamSheet; oppPlays: OppPlay[]; players: ScoutPlayer[];
};

const TABLE_ROWS = ["Championnat", "Domicile", "Extérieur", "Victoire", "Défaite"];
const OFF_TENDENCIES = ["Tireur", "Créateur", "Poste bas", "Transition", "PnR porteur", "PnR poseur", "Coupeur", "Rebond offensif"];
const DEF_TENDENCIES = ["Change", "Switch", "Hedge", "Drop", "Interceptions", "Contres", "Agressif"];
type ScoutProfileOption = {
  key: string;
  label: string;
  image?: string;
};

const PROFILE_OPTIONS: ScoutProfileOption[] = [
  { key: "Energizer", label: "Energizer", image: "/scouting-profiles/energizer.png" },
  { key: "Floor General", label: "Floor General", image: "/scouting-profiles/floor-general.png" },
  { key: "Low Post Player", label: "Low Post", image: "/scouting-profiles/low-post-player.png" },
  { key: "Rebounder", label: "Rebounder", image: "/scouting-profiles/rebounder.png" },
  { key: "Scorer", label: "Scorer", image: "/scouting-profiles/scorer.png" },
  { key: "Shooter", label: "Shooter", image: "/scouting-profiles/shooter.png" },
  { key: "Slasher", label: "Slasher", image: "/scouting-profiles/slasher.png" },
  { key: "Pnr handler", label: "PNR Handler" },
  { key: "Driver", label: "Driver" },
  { key: "All around", label: "All Around" },
  { key: "Physique", label: "Physique" },
  { key: "Stretch big", label: "Stretch Big" },
  { key: "Glue guy", label: "Glue Guy" },
];
const PROFILS = PROFILE_OPTIONS.map((p) => p.key);
const PLAY_KINDS = ["Attaque", "Défense", "Transition", "BLOB", "SLOB", "ATO"];
const SPECIAL_KINDS = ["BLOB", "SLOB", "ATO"]; // situations spéciales

const EMPTY_SHEET: TeamSheet = {
  last4: "", attaqueRank: "", defenseRank: "",
  table: TABLE_ROWS.reduce((a, r) => ({ ...a, [r]: { att: "", def: "", vd: "" } }), {} as Record<string, Row3>),
  best: { tirs3: "", lf: "", rbdOff: "", int: "", drive: "" },
  resumeDom: "", resumeExt: "", general: "", attaque: "",
  defense: { picks45: "", zone: "", picksAxe: "", presse: "", postup: "" },
};
const EMPTY_IMPORTANT_STATS: ImportantStatTable[] = [
  { id: "offreb", title: "Meilleurs rebondeurs offensifs", rows: Array.from({ length: 5 }, (_, index) => ({ id: `offreb_${index}`, number: "", player: "", stat: "" })) },
  { id: "shooters", title: "Meilleurs shooteurs à 3pts", rows: Array.from({ length: 5 }, (_, index) => ({ id: `shooters_${index}`, number: "", player: "", stat: "" })) },
  { id: "latefoul", title: "Fautes fin de match", rows: Array.from({ length: 5 }, (_, index) => ({ id: `latefoul_${index}`, number: "", player: "", stat: "" })) },
];

const EMPTY: Scouting = {
  team: "", classement: "", bilan: "", serie: "", ptsFor: "", ptsAgainst: "", ortg: "", drtg: "", pace: "",
  opponentLogo: "", attackSummary: "", defenseSummary: "", importantStats: EMPTY_IMPORTANT_STATS,
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
  const importantStats: ImportantStatTable[] =
    Array.isArray(s.importantStats) && s.importantStats.length
      ? s.importantStats.map((table: any, tableIndex: number) => ({
          id: String(table?.id || `stat_${tableIndex}`),
          title: String(table?.title || `Tableau ${tableIndex + 1}`),
          rows: Array.isArray(table?.rows)
            ? table.rows.map((row: any, rowIndex: number) => ({
                id: String(row?.id || `row_${tableIndex}_${rowIndex}`),
                number: String(row?.number || ""),
                player: String(row?.player || ""),
                stat: String(row?.stat || ""),
              }))
            : [],
        }))
      : EMPTY_IMPORTANT_STATS.map((table: ImportantStatTable) => ({
          ...table,
          rows: table.rows.map((row: ImportantStatRow) => ({ ...row })),
        }));

  return {
    ...EMPTY, ...s, sheet, importantStats,
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

function BlackSectionTitle({ children }: { children: ReactNode }) {
  return <div className="sm-black-title">{children}</div>;
}

/* ============================== Composant ============================ */
export default function ScoutingModule() {
  const supabase = useMemo(() => createClient(), []);
  const [teams, setTeams] = useState<Team[]>([]);
  const [teamId, setTeamId] = useState("");
  const [sc, setSc] = useState<Scouting>(EMPTY);
  const [loading, setLoading] = useState(true);
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

  const onOpponentLogo = (file?: File) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => patch({ opponentLogo: String(reader.result || "") });
    reader.readAsDataURL(file);
  };
  const setTableCell = (row: string, col: keyof Row3, v: string) => { dirty.current = true; setSc((s) => ({ ...s, sheet: { ...s.sheet, table: { ...s.sheet.table, [row]: { ...s.sheet.table[row], [col]: v } } } })); };
  const setBest = (k: keyof TeamSheet["best"], v: string) => { dirty.current = true; setSc((s) => ({ ...s, sheet: { ...s.sheet, best: { ...s.sheet.best, [k]: v } } })); };
  const setDef = (k: keyof TeamSheet["defense"], v: string) => { dirty.current = true; setSc((s) => ({ ...s, sheet: { ...s.sheet, defense: { ...s.sheet.defense, [k]: v } } })); };

  const updateImportantStatTitle = (tableId: string, title: string) => {
    patch({ importantStats: (sc.importantStats || []).map((table) => table.id === tableId ? { ...table, title } : table) });
  };
  const updateImportantStatRow = (tableId: string, rowId: string, field: "number" | "player" | "stat", value: string) => {
    patch({
      importantStats: (sc.importantStats || []).map((table) =>
        table.id === tableId
          ? { ...table, rows: table.rows.map((row: ImportantStatRow) => row.id === rowId ? { ...row, [field]: value } : row) }
          : table
      )
    });
  };
  const addImportantStatRow = (tableId: string) => {
    patch({
      importantStats: (sc.importantStats || []).map((table) =>
        table.id === tableId
          ? { ...table, rows: [...table.rows, { id: newId(), number: "", player: "", stat: "" }] }
          : table
      )
    });
  };
  const removeImportantStatRow = (tableId: string, rowId: string) => {
    patch({
      importantStats: (sc.importantStats || []).map((table) =>
        table.id === tableId
          ? { ...table, rows: table.rows.filter((row: ImportantStatRow) => row.id !== rowId) }
          : table
      )
    });
  };
  const addImportantStatTable = () => {
    if ((sc.importantStats || []).length >= 3) return;
    patch({
      importantStats: [...(sc.importantStats || []), {
        id: newId(),
        title: `Tableau ${(sc.importantStats || []).length + 1}`,
        rows: Array.from({ length: 5 }, () => ({ id: newId(), number: "", player: "", stat: "" })),
      }],
    });
  };

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
  const autoFill = () => window.alert("Mode automatique : la récupération effectif/stats depuis des bases publiques nécessite un connecteur serveur (API/fournisseur). L'interface est prête — branche un endpoint et je pré-remplis le scouting.");

  // ---------- Playbook adverse (via la VRAIE plaquette) ----------
  const openPlaquette = (opts: { id?: string; title: string; kind: string; asSystem?: boolean; play?: OppPlay }) => {
    // sauvegarde le scouting courant avant de quitter (les non-enregistrés ne sont pas perdus)
    if (teamId) { writeScout(supabase, teamId, scRef.current).catch(() => {}); }
    lsSet(K_PENDING, { teamId, playId: opts.id || null, title: opts.title || "Système adverse", kind: opts.kind || "Attaque", asSystem: !!opts.asSystem });
    // contexte de retour pour la plaquette (affiche le bouton « Insérer » et nous renvoie ici)
    try { localStorage.setItem("mb_plaquette_return_to", window.location.pathname + window.location.search); } catch {}
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

  if (loading) return <div className="sm"><div className="sm-empty">Chargement du scouting…</div><style jsx global>{`${css}${scoutingPlayerEditorCss}`}</style></div>;
  if (!team) return <div className="sm"><div className="sm-empty">Crée d'abord une équipe dans « Mes Équipes ».</div><style jsx global>{`${css}${scoutingPlayerEditorCss}`}</style></div>;
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
          <button className="sm-btn dark" onClick={async () => { await saveNow(); exportScoutPdf(team, scRef.current); }}>📄 Export scouting</button>
        </div>
      </div>

      {/* ====== Identité + Chiffres clés ====== */}
      <BlackSectionTitle>Informations de l'équipe</BlackSectionTitle>
      <div className="sm-card">
        <div className="sm-cardh">
          <h3>Équipe — cahier de scouting</h3>
          <div className="sm-mode"><button className={sc.mode === "manuel" ? "on" : ""} onClick={() => patch({ mode: "manuel" })}>Manuel</button><button className={sc.mode === "auto" ? "on" : ""} onClick={() => patch({ mode: "auto" })}>Auto</button></div>
        </div>
        {sc.mode === "auto" && <div className="sm-auto"><span>Renseigne équipe + compétition, puis récupère les données publiques.</span><button className="sm-btn dark sm" onClick={autoFill}>⟳ Récupérer</button></div>}

        <Field label="Équipe adverse"><input value={sc.team} onChange={(e) => patch({ team: e.target.value })} placeholder="Ex : Blois" /></Field>

        <div className="sm-opponent-head">
          <label className="sm-opponent-logo">
            {sc.opponentLogo ? (
              <img src={sc.opponentLogo} alt="Logo adversaire" />
            ) : (
              <span><b>＋</b> Logo adversaire</span>
            )}
            <input
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => onOpponentLogo(e.target.files?.[0])}
            />
          </label>

          <div className="sm-opponent-summaries">
            <Field label="Attaque — synthèse">
              <AutoTextarea
                value={sc.attackSummary || ""}
                onChange={(v) => patch({ attackSummary: v })}
                placeholder="Ex : Beaucoup de transition, PNR axe, recherche rapide du cercle..."
                minRows={3}
              />
            </Field>

            <Field label="Défense — synthèse">
              <AutoTextarea
                value={sc.defenseSummary || ""}
                onChange={(v) => patch({ defenseSummary: v })}
                placeholder="Ex : Drop sur PNR, switch avec le 4, faible repli défensif..."
                minRows={3}
              />
            </Field>
          </div>
        </div>

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


      <BlackSectionTitle>Statistiques importantes</BlackSectionTitle>
      <div className="sm-card sm-important-card">
        <div className="sm-cardh">
          <div>
            <h3>📊 Tableaux importants</h3>
            <p className="sm-muted">3 tableaux maximum · colonnes # / Joueur / Stat</p>
          </div>
          {(sc.importantStats || []).length < 3 && (
            <button className="sm-add" onClick={addImportantStatTable}>＋ Tableau</button>
          )}
        </div>

        <div className="sm-important-grid">
          {(sc.importantStats || []).slice(0, 3).map((table) => (
            <div className="sm-important-table" key={table.id}>
              <input
                className="sm-important-title-input"
                value={table.title}
                onChange={(e) => updateImportantStatTitle(table.id, e.target.value)}
                placeholder="Nom du tableau"
              />
              <div className="sm-important-head">
                <span>#</span><span>Joueur</span><span>Stat</span><span />
              </div>
              <div className="sm-important-rows">
                {table.rows.map((row: ImportantStatRow) => (
                  <div className="sm-important-row" key={row.id}>
                    <input value={row.number} onChange={(e) => updateImportantStatRow(table.id, row.id, "number", e.target.value)} placeholder="#24" />
                    <input value={row.player} onChange={(e) => updateImportantStatRow(table.id, row.id, "player", e.target.value)} placeholder="KAJAMI-KEANE" />
                    <input value={row.stat} onChange={(e) => updateImportantStatRow(table.id, row.id, "stat", e.target.value)} placeholder="33,9%" />
                    <button type="button" onClick={() => removeImportantStatRow(table.id, row.id)} title="Supprimer la ligne">×</button>
                  </div>
                ))}
              </div>
              <button className="sm-add-row" onClick={() => addImportantStatRow(table.id)}>＋ Ligne</button>
            </div>
          ))}
        </div>
      </div>

      <BlackSectionTitle>Systèmes adverses</BlackSectionTitle>
      {/* ====== Playbook adverse (dessiné avec l'outil de dessin) ====== */}
      <div className="sm-card">
        <div className="sm-cardh"><h3>📋 Playbook adverse</h3><button className="sm-btn dark sm" onClick={() => setDraftSys({ title: "", kind: "Attaque" })}>✏️ Dessiner un système</button></div>
        {systems.length ? (
          <div className="sm-sysgrid">
            {systems.map((p) => <PlayCard key={p.id} play={p} onPreview={() => setPreviewPlay(p)} onEdit={() => setDraftSys({ id: p.id, title: p.title, kind: p.kind, play: p })} onRemove={() => removePlay(p.id)} onSaveSystem={() => saveAsSystem(p)} />)}
          </div>
        ) : <div className="sm-sysempty"><p>Aucun système adverse. Dessine leurs systèmes avec l'outil de dessin — ils apparaîtront en schémas, comme tes systèmes offensifs.</p><button className="sm-add" onClick={() => setDraftSys({ title: "", kind: "Attaque" })}>✏️ Dessiner un système adverse</button></div>}
      </div>

      {/* ====== Situations spéciales (BLOB / SLOB / ATO) — comme des systèmes, schémas visibles ====== */}
      <div className="sm-card">
        <div className="sm-cardh"><h3>🎯 Situations spéciales</h3><button className="sm-btn dark sm" onClick={() => setDraftSys({ title: "", kind: "BLOB" })}>✏️ Dessiner une situation</button></div>
        {specials.length ? (
          <div className="sm-sysgrid">
            {specials.map((p) => <PlayCard key={p.id} play={p} onPreview={() => setPreviewPlay(p)} onEdit={() => setDraftSys({ id: p.id, title: p.title, kind: p.kind, play: p })} onRemove={() => removePlay(p.id)} onSaveSystem={() => saveAsSystem(p)} />)}
          </div>
        ) : <div className="sm-sysempty"><p>Remises en jeu (BLOB / SLOB) et sorties de temps-mort (ATO) de l'adversaire. Dessine-les comme des systèmes — schéma à l'appui.</p><button className="sm-add" onClick={() => setDraftSys({ title: "", kind: "BLOB" })}>✏️ Dessiner une situation spéciale</button></div>}
      </div>

      {/* ====== Effectif + fiches ====== */}
      <BlackSectionTitle>Joueurs adverses</BlackSectionTitle>
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

      <style jsx global>{`${css}${scoutingPlayerEditorCss}`}</style>
    </div>
  );
}

/* ============================ Fiche joueur ========================== */
function PlayerFiche({ player, onClose, onChange, onRemove }: { player: ScoutPlayer; onClose: () => void; onChange: (p: ScoutPlayer) => void; onRemove: () => void }) {
  const up = (p: Partial<ScoutPlayer>) => onChange({ ...player, ...p });
  const onPhoto = (file?: File) => {
    if (!file) return;
    const r = new FileReader();
    r.onload = () => up({ photo: String(r.result) });
    r.readAsDataURL(file);
  };
  const pctValue = (m?: string, a?: string) => {
    const mm = Number(String(m || "").replace(",", "."));
    const aa = Number(String(a || "").replace(",", "."));
    return Number.isFinite(mm) && Number.isFinite(aa) && aa > 0 ? `${((mm / aa) * 100).toFixed(1)}%` : "";
  };

  return (
    <div className="md-bg" onClick={onClose}>
      <div className="md wide scout-player-editor" onClick={(e) => e.stopPropagation()}>
        <div className="md-h">
          <div>
            <span className="spe-kicker">SCOUTING ADVERSE</span>
            <h3>{player.name || "Nouveau joueur"}</h3>
          </div>
          <button onClick={onClose}>✕</button>
        </div>

        <div className="spe-top">
          <label className="spe-photo">
            {player.photo ? <img src={player.photo} alt="" /> : <span><b>＋</b> Ajouter<br/>la photo</span>}
            <input type="file" accept="image/*" onChange={(e) => onPhoto(e.target.files?.[0])} hidden />
          </label>

          <div className="spe-identity">
            <div className="spe-grid spe-grid-4">
              <Field label="N°"><input value={player.num} onChange={(e) => up({ num: e.target.value })} placeholder="24" /></Field>
              <Field label="Poste"><input value={player.poste} onChange={(e) => up({ poste: e.target.value })} placeholder="1" /></Field>
              <Field label="Taille"><input value={player.taille} onChange={(e) => up({ taille: e.target.value })} placeholder="1.88m" /></Field>
              <Field label="Statut"><select value={player.role} onChange={(e) => up({ role: e.target.value as "Majeur" | "Rotation" })}><option>Majeur</option><option>Rotation</option></select></Field>
            </div>
            <Field label="Nom du joueur"><input value={player.name} onChange={(e) => up({ name: e.target.value })} placeholder="Kaza Kajami-Keane" /></Field>
          </div>
        </div>

        <section className="spe-section">
          <div className="spe-section-title"><b>1</b><span>Choisir son profil</span><small>Un seul profil</small></div>
          <div className="spe-profiles">
            {PROFILE_OPTIONS.map((profile) => {
              const selected = player.profil === profile.key;
              return (
                <button key={profile.key} type="button" className={`spe-profile ${selected ? "on" : ""}`} onClick={() => up({ profil: selected ? "" : profile.key })}>
                  <span className="spe-profile-icon">
                    {"image" in profile && profile.image ? <img src={profile.image} alt="" /> : <b>{profile.label.slice(0, 2).toUpperCase()}</b>}
                  </span>
                  <span>{profile.label}</span>
                  {selected && <i>✓</i>}
                </button>
              );
            })}
          </div>
        </section>

        <section className="spe-section">
          <div className="spe-section-title"><b>2</b><span>Statistiques</span><small>Ne remplis que ce que tu veux afficher</small></div>
          <div className="spe-stat-grid">
            <Field label="PTS"><input value={player.pts || ""} onChange={(e) => up({ pts: e.target.value })} placeholder="14.1" /></Field>
            <Field label="MIN"><input value={player.min || ""} onChange={(e) => up({ min: e.target.value })} placeholder="29.0" /></Field>
            <Field label="2PM"><input value={player.fg2m || ""} onChange={(e) => up({ fg2m: e.target.value })} placeholder="2.6" /></Field>
            <Field label="2PA"><input value={player.fg2a || ""} onChange={(e) => up({ fg2a: e.target.value })} placeholder="4.4" /></Field>
            <div className="spe-auto"><label>2P%</label><b>{pctValue(player.fg2m, player.fg2a) || "auto"}</b></div>
            <Field label="3PM"><input value={player.fg3m || ""} onChange={(e) => up({ fg3m: e.target.value })} placeholder="2.2" /></Field>
            <Field label="3PA"><input value={player.fg3a || ""} onChange={(e) => up({ fg3a: e.target.value })} placeholder="6.6" /></Field>
            <div className="spe-auto"><label>3P%</label><b>{pctValue(player.fg3m, player.fg3a) || "auto"}</b></div>
            <Field label="FTM"><input value={player.ftm || ""} onChange={(e) => up({ ftm: e.target.value })} placeholder="2.3" /></Field>
            <Field label="FTA"><input value={player.fta || ""} onChange={(e) => up({ fta: e.target.value })} placeholder="3.0" /></Field>
            <div className="spe-auto"><label>FT%</label><b>{pctValue(player.ftm, player.fta) || "auto"}</b></div>
            <Field label="ORB"><input value={player.orb || ""} onChange={(e) => up({ orb: e.target.value })} placeholder="0.7" /></Field>
            <Field label="REB"><input value={player.reb || ""} onChange={(e) => up({ reb: e.target.value })} placeholder="3.0" /></Field>
            <Field label="AST"><input value={player.ast || ""} onChange={(e) => up({ ast: e.target.value })} placeholder="5.3" /></Field>
            <Field label="TO"><input value={player.to || ""} onChange={(e) => up({ to: e.target.value })} placeholder="2.4" /></Field>
            <Field label="STL"><input value={player.stl || ""} onChange={(e) => up({ stl: e.target.value })} placeholder="1.1" /></Field>
            <Field label="BLK"><input value={player.blk || ""} onChange={(e) => up({ blk: e.target.value })} placeholder="0.1" /></Field>
          </div>
        </section>

        <section className="spe-section">
          <div className="spe-section-title"><b>3</b><span>Lecture scouting</span><small>Courte, directe, exploitable</small></div>
          <div className="spe-grid spe-grid-2">
            <Field label="Profil / point fort"><input value={player.profileTitle || ""} onChange={(e) => up({ profileTitle: e.target.value })} placeholder="SCORING POINT GUARD - HOT CLOSEOUT" /></Field>
            <Field label="Complément"><input value={player.profileSubtitle || ""} onChange={(e) => up({ profileSubtitle: e.target.value })} placeholder="Main creator of the team" /></Field>
          </div>
          <div className="spe-tendencies">
            <Field label="Tendance 1"><input value={player.tendency1 || ""} onChange={(e) => up({ tendency1: e.target.value })} placeholder="Très bon pull-up main gauche" /></Field>
            <Field label="Tendance 2"><input value={player.tendency2 || ""} onChange={(e) => up({ tendency2: e.target.value })} placeholder="Main droite : cherche la finition au cercle" /></Field>
            <Field label="Tendance 3"><input value={player.tendency3 || ""} onChange={(e) => up({ tendency3: e.target.value })} placeholder="Closeout : très bon catch & shoot" /></Field>
          </div>
          <Field label="Consigne prioritaire"><input className="spe-priority-input" value={player.priority || ""} onChange={(e) => up({ priority: e.target.value })} placeholder="Pressure him + run him off the line !" /></Field>
        </section>

        <div className="spe-preview-note">Le PDF masque automatiquement chaque information laissée vide.</div>
        <div className="md-act">
          <button className="sm-del" onClick={onRemove}>🗑 Supprimer</button>
          <button className="sm-btn dark" onClick={onClose}>✓ Terminer</button>
        </div>
      </div>
    </div>
  );
}

/* ============================ Export PDF ============================ */
function exportScoutPdf(team: Team, sc: Scouting) {
  const esc = (value: unknown) => escapeHtml(String(value ?? ""));
  const players = [...sc.players]
    .sort((a, b) => (a.role === b.role ? 0 : a.role === "Majeur" ? -1 : 1))
    .slice(0, 16);

  const pctText = (m?: string, a?: string) => {
    const mm = Number(String(m || "").replace(",", "."));
    const aa = Number(String(a || "").replace(",", "."));
    if (!Number.isFinite(mm) || !Number.isFinite(aa) || aa <= 0) return "";
    return `${((mm / aa) * 100).toFixed(1)}%`;
  };
  const madeAttempted = (m?: string, a?: string) => m || a ? `${m || "0"}-${a || "0"}` : "";
  const profileImage = (profil?: string) => PROFILE_OPTIONS.find((p) => p.key === profil)?.image || "";
  const blackTitle = (title: string) => `<div class="black-title">${esc(title)}</div>`;

  const statCells = (p: ScoutPlayer) => {
    const stats: Array<[string, string]> = [];
    const addStat = (label: string, value: unknown) => {
      const normalized = String(value ?? "").trim();
      if (normalized) stats.push([label, normalized]);
    };

    addStat("PTS", p.pts);
    addStat("MIN", p.min);
    addStat("2PM-A", madeAttempted(p.fg2m, p.fg2a));
    addStat("2P%", pctText(p.fg2m, p.fg2a));
    addStat("3PM-A", madeAttempted(p.fg3m, p.fg3a));
    addStat("3P%", pctText(p.fg3m, p.fg3a));
    addStat("FTM-A", madeAttempted(p.ftm, p.fta));
    addStat("FT%", pctText(p.ftm, p.fta));
    addStat("ORB", p.orb);
    addStat("REB", p.reb);
    addStat("AST", p.ast);
    addStat("TO", p.to);
    addStat("STL", p.stl);
    addStat("BLK", p.blk);

    return stats.length
      ? `<div class="player-stats">${stats
          .map(
            ([label, value]) =>
              `<div><b>${esc(label)}</b><span>${esc(value)}</span></div>`,
          )
          .join("")}</div>`
      : "";
  };

  const playerBlock = (p: ScoutPlayer) => {
    const profileImg = profileImage(p.profil);
    const tendencies = [p.tendency1, p.tendency2, p.tendency3].filter((v) => String(v || "").trim());
    return `<article class="player">
      <div class="photo">${p.photo ? `<img src="${esc(p.photo)}"/>` : `<div class="photo-empty">${p.num ? "#" + esc(p.num) : ""}</div>`}</div>
      <div class="player-main">
        <div class="identity">
          <strong>${p.num ? "#" + esc(p.num) + " • " : ""}${esc(p.name || "Joueur")}</strong>
          ${p.poste ? `<span>• ${esc(p.poste)}</span>` : ""}
          ${p.taille ? `<span>• ${esc(p.taille)}</span>` : ""}
          <em class="${p.role === "Majeur" ? "major" : "rotation"}">${esc(p.role)}</em>
          ${p.profil ? `<div class="profile">${profileImg ? `<img src="${profileImg}"/>` : ""}<b>${esc(p.profil)}</b></div>` : ""}
        </div>
        ${statCells(p)}
        <div class="notes">
          ${p.profileTitle ? `<b class="profile-title">${esc(p.profileTitle)}</b>` : ""}
          ${p.profileSubtitle ? `<strong class="profile-subtitle">${esc(p.profileSubtitle)}</strong>` : ""}
          ${tendencies.map((t) => `<p>${esc(String(t))}</p>`).join("")}
          ${p.priority ? `<p class="priority">${esc(p.priority)}</p>` : ""}
        </div>
      </div>
    </article>`;
  };

  const teamInfo = () => {
    const attack = String(sc.attackSummary || "").trim();
    const defense = String(sc.defenseSummary || "").trim();
    if (!attack && !defense) return "";
    return `${blackTitle("Informations de l'équipe")}
      <section class="team-info">
        ${attack ? `<div><h3>ATTAQUE</h3><p>${esc(sc.attackSummary || "")}</p></div>` : ""}
        ${defense ? `<div><h3>DÉFENSE</h3><p>${esc(sc.defenseSummary || "")}</p></div>` : ""}
      </section>`;
  };

  const importantStats = () => {
    const tables: ImportantStatTable[] = (sc.importantStats ?? []).map((table: ImportantStatTable) => ({
      ...table,
      rows: table.rows.filter((row: ImportantStatRow) => String(row.number || "").trim() || String(row.player || "").trim() || String(row.stat || "").trim()),
    })).filter((table: ImportantStatTable) => String(table.title || "").trim() && table.rows.length).slice(0, 3);
    if (!tables.length) return "";
    return `${blackTitle("Statistiques importantes")}
      <section class="important-stats">
        ${tables.map((table: ImportantStatTable) => `<div class="important-table">
          <h4>${esc(table.title)}</h4>
          <div class="important-head"><b>#</b><b>JOUEUR</b><b>STAT</b></div>
          ${table.rows.map((row: ImportantStatRow) => `<div class="important-row"><span>${esc(row.number)}</span><span>${esc(row.player)}</span><span>${esc(row.stat)}</span></div>`).join("")}
        </div>`).join("")}
      </section>`;
  };

  const systemsHtml = () => {
    const plays = sc.oppPlays.filter((play: OppPlay) => (Array.isArray(play.schemaImages) && play.schemaImages.length) || play.schemaImage);
    if (!plays.length) return "";
    return `${blackTitle("Systèmes adverses")}
      <section class="systems">
        ${plays.map((play: OppPlay) => {
          const images = Array.isArray(play.schemaImages) && play.schemaImages.length ? play.schemaImages : [play.schemaImage].filter(Boolean);
          return `<article class="system">
            <div class="system-name"><b>${esc(play.title || "Système adverse")}</b>${play.kind ? `<span>${esc(play.kind)}</span>` : ""}</div>
            <div class="system-schemas">
              ${images.map((image: string, index: number) => `<div class="schema"><small>${index + 1}</small><img src="${esc(image)}"/></div>`).join("")}
            </div>
            ${play.description ? `<p class="system-desc">${esc(play.description)}</p>` : ""}
          </article>`;
        }).join("")}
      </section>`;
  };

  const pages: string[] = [];
  const intro = [teamInfo(), importantStats(), systemsHtml()].filter(Boolean).join("");
  if (intro) pages.push(`<div class="intro">${intro}</div>`);

  for (let i = 0; i < players.length; i += 8) {
    const chunk = players.slice(i, i + 8);
    pages.push(`<section class="players-page">${blackTitle("Joueurs adverses")}<div class="players-list">${chunk.map((player: ScoutPlayer) => playerBlock(player)).join("")}</div></section>`);
  }

  if (!pages.length) {
    window.alert("Ajoute des informations, systèmes ou joueurs avant l'export.");
    return;
  }

  const header = (page: number, total: number) => `<header>
    <div class="pdf-brand">${sc.opponentLogo ? `<img class="opp-logo" src="${esc(sc.opponentLogo)}"/>` : ""}<div><b>MYBASKET</b><span>SCOUTING ADVERSE</span></div></div>
    <div class="opponent">${esc(sc.team || team.name || "Adversaire")}</div>
    <small>${page} / ${total}</small>
  </header>`;

  const htmlPages = pages.map((content, index) => `<section class="page">${header(index + 1, pages.length)}<main>${content}</main></section>`).join("");

  const html = `<!doctype html><html><head><meta charset="utf-8"/>
  <title>Scouting adverse — ${esc(sc.team || team.name || "")}</title>
  <style>
    @page{size:A4 portrait;margin:7mm}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff}
    body{font-size:8px}
    .page{width:196mm;min-height:283mm;page-break-after:always;display:flex;flex-direction:column}
    .page:last-child{page-break-after:auto}
    header{min-height:13mm;border-bottom:2px solid #111;display:grid;grid-template-columns:1fr auto 30px;align-items:center;margin-bottom:2mm;padding:1mm 0}
    .pdf-brand{display:flex;align-items:center;gap:2.5mm}.pdf-brand>div{display:flex;align-items:baseline;gap:7px}
    .opp-logo{width:10mm;height:10mm;object-fit:contain}
    header b{font-size:13px;color:#6B1A2C;letter-spacing:.4px}header span{font-weight:900;font-size:9px}
    header .opponent{font-size:12px;font-weight:900;text-transform:uppercase}header small{text-align:right;color:#777}
    .black-title{background:#000;color:#fff;text-align:center;font-weight:900;font-size:10px;padding:2.1mm 2mm;margin:0 0 1.5mm;letter-spacing:.15px}
    .team-info{display:grid;grid-template-columns:1fr 1fr;border:1px solid #777;margin-bottom:3mm}
    .team-info>div{padding:2mm 2.5mm;min-height:34mm}.team-info>div+div{border-left:1px solid #777}
    .team-info h3{font-size:7.5px;margin:0 0 1mm;text-decoration:underline}.team-info p{margin:0;white-space:pre-wrap;font-size:7.5px;line-height:1.3}
    .important-stats{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #888;margin-bottom:3mm}
    .important-table+.important-table{border-left:1px solid #888}.important-table h4{font-size:7px;margin:0;padding:1.2mm 1mm;text-align:center;min-height:6mm}
    .important-head,.important-row{display:grid;grid-template-columns:11mm 1fr 19mm}.important-head{background:#f0f0f0;font-size:5.8px;font-weight:900}
    .important-head>*{padding:.7mm;border-top:1px solid #aaa}.important-row span{padding:.7mm;border-top:1px solid #ddd;font-size:6.4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .important-row span:first-child,.important-row span:last-child{text-align:center}
    .systems{display:flex;flex-direction:column;gap:2.3mm}.system{border:1px solid #777;break-inside:avoid;padding:1.5mm}
    .system-name{display:flex;align-items:center;justify-content:center;gap:3mm;border-bottom:1px solid #aaa;padding:0 0 1mm;margin-bottom:1.3mm}
    .system-name b{font-size:8px}.system-name span{font-size:6px;color:#666;text-transform:uppercase}
    .system-schemas{display:grid;grid-template-columns:repeat(3,1fr);gap:2mm}.schema{position:relative;min-height:42mm;display:grid;place-items:center;border:1px solid #eee;background:#fff}
    .schema img{width:100%;height:42mm;object-fit:contain}.schema small{position:absolute;left:1mm;top:1mm;background:#111;color:#fff;width:4mm;height:4mm;border-radius:50%;display:grid;place-items:center;font-size:5px}
    .system-desc{font-size:6.8px;margin:1.2mm 0 0;white-space:pre-wrap}
    .players-list{display:flex;flex-direction:column;gap:1.05mm}.player{display:grid;grid-template-columns:29mm 1fr;border:1px solid #555;min-height:29.5mm;break-inside:avoid;background:#fff}
    .photo{border-right:1px solid #777;overflow:hidden;min-height:29.3mm;background:#f4f1ed;display:grid;place-items:center}.photo img{width:100%;height:100%;object-fit:cover;object-position:center top}
    .photo-empty{font-size:18px;font-weight:900;color:#bbb}.player-main{min-width:0;position:relative}
    .identity{height:6.1mm;border-bottom:1px solid #777;display:flex;align-items:center;gap:4px;padding:0 2mm;position:relative;padding-right:29mm;white-space:nowrap}
    .identity strong{font-size:9.2px}.identity span{font-size:8px}.identity em{font-style:normal;text-transform:uppercase;font-size:6.6px;font-weight:900;padding:1px 4px;border-radius:999px}
    .identity em.major{background:#D4A24C;color:#23180b}.identity em.rotation{background:#eee;color:#555}
    .profile{position:absolute;right:1.5mm;top:.5mm;height:5mm;display:flex;align-items:center;gap:2px;max-width:27mm}.profile img{width:5mm;height:5mm;object-fit:contain}.profile b{font-size:6.6px;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis}
    .player-stats{min-height:7.5mm;border-bottom:1px solid #999;display:flex;align-items:stretch;padding:0 1mm;overflow:hidden}.player-stats>div{min-width:10.2mm;flex:1;display:flex;flex-direction:column;text-align:center;justify-content:center;border-right:1px solid #ddd}.player-stats>div:last-child{border-right:0}
    .player-stats b{font-size:5.8px;line-height:1.1}.player-stats span{font-size:6.8px;line-height:1.25;margin-top:1px}
    .notes{padding:1.2mm 2mm 1mm;line-height:1.18;min-height:16mm}.notes .profile-title{display:block;text-transform:uppercase;font-size:7.2px;line-height:1.15}
    .notes .profile-subtitle{display:block;font-size:7.1px;margin-bottom:.6mm}.notes p{margin:.35mm 0;font-size:7px}.notes .priority{color:#d41414;font-weight:900;margin-top:.8mm}
    @media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}
  </style></head><body>${htmlPages}</body></html>`;

  try {
    const iframe = document.createElement("iframe");
    Object.assign(iframe.style, { position: "fixed", right: "0", bottom: "0", width: "0", height: "0", border: "0" } as CSSStyleDeclaration);
    document.body.appendChild(iframe);
    const doc = iframe.contentWindow?.document;
    if (!doc) throw new Error("no doc");
    doc.open(); doc.write(html); doc.close();
    const done = () => {
      try { iframe.contentWindow?.focus(); iframe.contentWindow?.print(); } catch {}
      window.setTimeout(() => { try { document.body.removeChild(iframe); } catch {} }, 1500);
    };
    if (iframe.contentWindow) iframe.contentWindow.onload = done;
    window.setTimeout(done, 900);
  } catch {
    const w = window.open("", "_blank");
    if (!w) { window.alert("Autorise les popups pour imprimer."); return; }
    w.document.write(html + "<script>setTimeout(function(){window.print()},500)<\\/script>");
    w.document.close();
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

const scoutingPlayerEditorCss = `

  .sm-black-title{background:#050505;color:#fff;text-align:center;font-size:.86rem;font-weight:1000;letter-spacing:.03em;padding:.72rem 1rem;border-radius:2px;margin:1.15rem 0 .55rem}
  .sm-important-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:.7rem}
  .sm-important-table{border:1px solid #e6ddd6;border-radius:12px;background:#fff;overflow:hidden;min-width:0}
  .sm-important-title-input{width:100%!important;border:0!important;border-bottom:1px solid #e6ddd6!important;border-radius:0!important;text-align:center!important;font-weight:1000!important;color:#31151c!important;padding:.7rem .5rem!important;background:#fffaf5!important}
  .sm-important-head,.sm-important-row{display:grid;grid-template-columns:54px minmax(0,1fr) 84px 28px;align-items:center}
  .sm-important-head{background:#f4eee9;color:#6B1A2C;font-size:.61rem;font-weight:1000;text-transform:uppercase}
  .sm-important-head span{padding:.42rem .3rem;border-right:1px solid #e6ddd6}
  .sm-important-row{border-top:1px solid #eee6e0}.sm-important-row input{width:100%!important;min-width:0!important;border:0!important;border-radius:0!important;padding:.48rem .36rem!important;font-size:.69rem!important;background:#fff!important}
  .sm-important-row input+input{border-left:1px solid #eee6e0!important}.sm-important-row button{border:0;background:#fff;color:#a92d25;cursor:pointer;height:100%}
  .sm-add-row{width:100%;border:0;border-top:1px dashed #dfd2c9;background:#fff;color:#6B1A2C;font-size:.67rem;font-weight:900;padding:.48rem;cursor:pointer}
  .sm-sysgrid{grid-template-columns:repeat(3,minmax(0,1fr))!important}.sc-img{aspect-ratio:1.28/1!important;object-fit:contain!important;background:#fff!important}
  @media(max-width:950px){.sm-important-grid{grid-template-columns:1fr 1fr}.sm-sysgrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}}
  @media(max-width:650px){.sm-important-grid{grid-template-columns:1fr}.sm-sysgrid{grid-template-columns:1fr!important}}

  .sm-opponent-head{display:grid;grid-template-columns:118px 1fr;gap:.8rem;align-items:stretch;margin:.7rem 0 1rem}
  .sm-opponent-logo{border:1.5px dashed #D4A24C;border-radius:12px;background:#FCFAF7;min-height:120px;display:grid;place-items:center;overflow:hidden;cursor:pointer;color:#806f65;text-align:center;font-size:.7rem;font-weight:900;padding:.5rem}
  .sm-opponent-logo b{display:block;font-size:1.35rem;color:#6B1A2C;margin-bottom:.25rem}
  .sm-opponent-logo img{width:100%;height:100%;object-fit:contain;background:#fff}
  .sm-opponent-summaries{display:grid;grid-template-columns:1fr 1fr;gap:.7rem}
  .sm-opponent-summaries .sm-field{margin:0}
  .sm-opponent-summaries textarea{min-height:120px!important;background:#fff!important}
  @media(max-width:760px){.sm-opponent-head{grid-template-columns:90px 1fr}.sm-opponent-summaries{grid-template-columns:1fr}.sm-opponent-logo{min-height:100px}}
  .scout-player-editor{max-width:920px!important;padding:1.15rem 1.25rem!important}
  .spe-kicker{display:block;color:#D4A24C;font-size:.65rem;font-weight:1000;letter-spacing:.12em;margin-bottom:.15rem}
  .spe-top{display:grid;grid-template-columns:118px 1fr;gap:1rem;padding:.85rem;background:#FCFAF7;border:1px solid #eee3d7;border-radius:14px;margin:.75rem 0}
  .spe-photo{height:132px;border:1.5px dashed #D4A24C;border-radius:12px;overflow:hidden;background:#fff;display:grid;place-items:center;text-align:center;color:#8a7465;font-size:.75rem;font-weight:800;cursor:pointer}
  .spe-photo b{font-size:1.4rem;color:#6B1A2C}.spe-photo img{width:100%;height:100%;object-fit:cover;object-position:center top}
  .spe-identity{min-width:0}.spe-grid{display:grid;gap:.55rem}.spe-grid-4{grid-template-columns:.55fr .7fr .8fr 1fr}.spe-grid-2{grid-template-columns:1fr 1fr}
  .spe-section{border-top:1px solid #eee3d7;padding-top:.9rem;margin-top:.9rem}
  .spe-section-title{display:flex;align-items:center;gap:.5rem;margin-bottom:.7rem}.spe-section-title>b{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;background:#6B1A2C;color:#fff;font-size:.7rem}.spe-section-title>span{font-weight:1000;color:#31151c;text-transform:uppercase;font-size:.8rem}.spe-section-title>small{margin-left:auto;color:#998a81;font-size:.68rem}
  .spe-profiles{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:.45rem}
  .spe-profile{position:relative;border:1px solid #e8ded5;background:#fff;border-radius:11px;min-height:92px;padding:.45rem .25rem;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.25rem;cursor:pointer;font-family:inherit;font-size:.63rem;font-weight:900;color:#3b2a25;transition:.15s}
  .spe-profile:hover{border-color:#D4A24C;transform:translateY(-1px)}.spe-profile.on{border:2px solid #6B1A2C;background:#fff8f0;box-shadow:0 6px 16px rgba(107,26,44,.09)}
  .spe-profile-icon{height:48px;width:54px;display:grid;place-items:center}.spe-profile-icon img{max-width:100%;max-height:100%;object-fit:contain}.spe-profile-icon>b{font-size:1rem;color:#6B1A2C}
  .spe-profile>i{position:absolute;right:5px;top:5px;width:17px;height:17px;border-radius:50%;background:#6B1A2C;color:#fff;display:grid;place-items:center;font-style:normal;font-size:.6rem}
  .spe-stat-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:.45rem}.spe-stat-grid .sm-field{margin:0}.spe-stat-grid input{text-align:center!important;font-weight:800;padding:.5rem .3rem!important}
  .spe-auto{border:1px solid #e1d8cc;border-radius:10px;min-height:57px;padding:.35rem;display:flex;flex-direction:column;align-items:center;justify-content:center;background:#faf7f3}.spe-auto label{font-size:.62rem;font-weight:900;color:#6B1A2C}.spe-auto b{font-size:.85rem}
  .spe-tendencies{display:grid;grid-template-columns:1fr 1fr 1fr;gap:.55rem}.spe-priority-input{color:#c11d2f!important;font-weight:900!important}
  .spe-preview-note{margin-top:.8rem;background:#fff8e8;border:1px solid #eed7a2;color:#6B1A2C;border-radius:9px;padding:.5rem .7rem;font-size:.72rem;font-weight:800}
  @media(max-width:760px){.spe-top{grid-template-columns:90px 1fr}.spe-photo{height:110px}.spe-grid-4{grid-template-columns:1fr 1fr}.spe-grid-2{grid-template-columns:1fr}.spe-profiles{grid-template-columns:repeat(3,1fr)}.spe-stat-grid{grid-template-columns:repeat(3,1fr)}.spe-tendencies{grid-template-columns:1fr}}
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

`;