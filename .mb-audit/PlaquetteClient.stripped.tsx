'use client';

/**
 * app/plaquette/page.tsx
 * MyBasket.fr — PLAQUETTE (clone VISUEL exact du fichier mybasket-app_24.html)
 * --------------------------------------------------------------------------
 * - Mêmes structure DOM, mêmes classes CSS, mêmes couleurs/dimensions que l'original.
 * - Le terrain est affiché depuis TES 2 images (demi + complet), comme dans l'original
 *   (drawImage sur le canvas). Colle leurs URLs ci-dessous (URL http(s) ou data:base64).
 *   Tant qu'elles sont vides, le canvas se remplit en bordeaux #6B1A2C (fallback d'origine).
 * - Interactivité limitée aux ÉTATS VISUELS (onglets, sélection action/outil, demi/complet).
 *   Le moteur fonctionnel (phases, animation, dessin, exports) sera ajouté ensuite.
 *
 * NB : le CSS utilise les classes globales d'origine (.header, .ed-toolbar, …) et règle
 * html{font-size:15px}. Si tu préfères, déplace le bloc CSS dans app/globals.css.
 */

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { getExercise, updateExercise } from "@/lib/exercises";
import { getSystem, updateSystem } from "@/lib/systems";
import { uploadSchemaImage } from "@/lib/supabase/upload-schema";

// ⬇️  COLLE ICI TES 2 IMAGES DE TERRAIN
// <<BASE64 LINE 26 STRIPPED, 69402 chars>>
// <<BASE64 LINE 27 STRIPPED, 74805 chars>>
// <<BASE64 LINE 28 STRIPPED, 16928 chars>>
async function uploadBase64Image(base64: string, folder = "schemas") {
  if (!base64.startsWith("data:image")) return base64;

  const supabase = createClient();

  const res = await fetch(base64);
  const blob = await res.blob();

  const fileName = `${folder}/${Date.now()}-${Math.random()
    .toString(36)
    .slice(2)}.png`;
const {
  data: { user },
} = await supabase.auth.getUser();

console.log("USER =", user);

  const { error } = await supabase.storage
  .from("exercise-schemas")
  .upload(fileName, blob, {
    contentType: "image/png",
    upsert: false,
  });

  if (error) throw error;

  const { data } = supabase.storage
    .from("exercise-schemas")
    .getPublicUrl(fileName);

  return data.publicUrl;
}
export default function PlaquetteClient() {
  const supabase = createClient();
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const demiImgRef = useRef<HTMLImageElement | null>(null);
  const fullImgRef = useRef<HTMLImageElement | null>(null);
  const RETURN_KEY = "mb_plaquette_return_to";
const RESULT_KEY = "mybasket_plaquette_result";
const EDIT_INDEX_KEY = "mybasket_edit_schema_index";
const EDIT_EXERCISE_ID_KEY = "mybasket_edit_exercise_id";

  const readyRef = useRef({
    demi: false,
    full: false,
  });

  // ----------------------- Modèle -----------------------
  type Pt = { x: number; y: number };
  type Player = { id: string; x: number; y: number; label: string; team: 'att' | 'def'; shape: 'circle' | 'square'; coach?: boolean; rotation?: number; name?: string; color?: string; size?: number; photo?: string; hasBall?: boolean; ballCount?: number; linkedPlayerId?: string; linkedPlayerName?: string; linkedTeamId?: string; linkedTeamName?: string };
  type Obj = { id: string; x: number; y: number; kind: string; text?: string; rotation?: number; size?: number; scaleX?: number; scaleY?: number; points?: Pt[]; color?: string; sourcePlayerId?: string; targetPlayerId?: string };
  type Line = { id: string; action: string; from: Pt; to: Pt; ctrls?: Pt[]; ctrl?: Pt; points?: Pt[]; rotation?: number; target?: 'basket'; sourcePlayerId?: string; targetPlayerId?: string; order?: number; startMode?: 'withPrevious' | 'afterPrevious'; duration?: number; targetMode?: 'player' | 'playerCurrentPoint'; createdTargetPoint?: Pt };
  type ActSched = { line: Line; start: number; dur: number; end: number };
  type Sched = { idx: number; start: number; span: number; end: number; actSched: ActSched[] };
  type Phase = { players: Player[]; objects: Obj[]; lines: Line[]; notes: string; duration?: number; startMode?: 'withPrevious' | 'afterPrevious' };
  type Tool =
    | { kind: 'none' }
    | { kind: 'player'; label: string; team: 'att' | 'def'; shape: 'circle' | 'square'; coach?: boolean }
    | { kind: 'action'; action: string }
    | { kind: 'object'; obj: string };
  type Sel = { type: 'player' | 'object' | 'line'; id: string } | null;
  type SelItem = { type: 'player' | 'object' | 'line'; id: string };
  type TeamPlayer = { id: string; name: string; number?: string; photo?: string; position?: string; teamId: string; teamName: string; color?: string };

  // Données mockées — remplacer ensuite par un fetch Supabase (voir loadTeamPlayers)
  const MOCK_TEAM_PLAYERS: TeamPlayer[] = [];

  const emptyPhase = (): Phase => ({ players: [], objects: [], lines: [], notes: '', duration: 1.5, startMode: 'afterPrevious' });
const resetPlaquette = () => {
  localStorage.removeItem("mybasket_plaquette_load");
  localStorage.removeItem("mybasket_plaquette_result");
  localStorage.removeItem("mybasket_plaquette_mode");
  localStorage.removeItem("mybasket_plaquette_return");
  localStorage.removeItem("mb_plaquette_return_to");
  localStorage.removeItem("mybasket_edit_exercise_id");
  localStorage.removeItem("mybasket_edit_schema_index");
  localStorage.removeItem("mybasket_scouting_pending");

  setTitle("Nouveau play");
  setPhases([emptyPhase()]);
  setCurrent(0);
  setCourtType("half");
  setSelection([]);
  setPast([]);
  setFuture([]);
};
  const [phases, setPhases] = useState<Phase[]>([emptyPhase()]);
  const [current, setCurrent] = useState(0);
  const [courtType, setCourtType] = useState<'half' | 'full'>('half');
  const [editorMode, setEditorMode] = useState<'draw' | 'animate'>('draw');
  const [notesOpen, setNotesOpen] = useState(false);

useEffect(() => {
  const loadFromSource = async () => {
    try {
      setExoInsertMode(!!localStorage.getItem(RETURN_KEY));
      setShootingGridPending(!!localStorage.getItem("mybasket_shooting_grid_pending"));
      setScoutingPending(!!localStorage.getItem("mybasket_scouting_pending"));

      const params = new URLSearchParams(window.location.search);
      const plaquetteType = params.get("type") || "exercise";

      const editIndexRaw = localStorage.getItem(EDIT_INDEX_KEY);
      const editIndex =
        editIndexRaw !== null && editIndexRaw !== ""
          ? Number(editIndexRaw)
          : null;

      if (editIndex === null || Number.isNaN(editIndex)) {
        return;
      }

      let schemaData: any = null;

      if (plaquetteType === "systeme") {
  const systemeId = localStorage.getItem("mybasket_edit_systeme_id");

  if (systemeId) {
    const systeme = await getSystem(systemeId);
    schemaData = (systeme as any)?.schemaDataList?.[editIndex];
  }
} else {
  const exerciseId = localStorage.getItem(EDIT_EXERCISE_ID_KEY);

  if (exerciseId) {
    const exercise = await getExercise(exerciseId);
    schemaData = (exercise as any)?.schemaDataList?.[editIndex];
  }
}

      if (!schemaData) {
        return;
      }

      if (schemaData.title) {
        setTitle(schemaData.title);
      }

      if (schemaData.phases) {
        setPhases(schemaData.phases);
        phasesRef.current = schemaData.phases;
      }

      if (schemaData.sheet) {
        setSheet(schemaData.sheet);
      }

      if (typeof schemaData.current === "number") {
        setCurrent(schemaData.current);
        currentRef.current = schemaData.current;
      }

      if (
        schemaData.courtType === "half" ||
        schemaData.courtType === "full"
      ) {
        setCourtType(schemaData.courtType);
      }

      window.setTimeout(() => {
        render();
      }, 80);
    } catch (error) {
      console.error("Erreur chargement schéma :", error);
      setExoInsertMode(false);
    }
  };

  loadFromSource();
}, []);

  const [title, setTitle] = useState('Nouveau play');
  const [tool, setTool] = useState<Tool>({ kind: 'none' });
  const [placeMode, setPlaceMode] = useState<'att' | 'def' | null>(null);
  const [placeIdx, setPlaceIdx] = useState(0);
  const [selection, setSelection] = useState<SelItem[]>([]);
  const [past, setPast] = useState<{ phases: Phase[]; current: number }[]>([]);
  const [future, setFuture] = useState<{ phases: Phase[]; current: number }[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkQuery, setLinkQuery] = useState('');
  const [teamPlayers, setTeamPlayers] = useState<TeamPlayer[]>([]);
  const [saveMsg, setSaveMsg] = useState(false);
  const [exoInsertMode, setExoInsertMode] = useState(false);
  const [shootingGridPending, setShootingGridPending] = useState(false);
  const [scoutingPending, setScoutingPending] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [saving, setSaving] = useState<null | 'systeme' | 'exercice'>(null);

const [hint, setHint] = useState('');
const hintTimer = useRef<number | null>(null);

const showHint = (msg: string) => {
  setHint(msg);

  if (hintTimer.current) {
    window.clearTimeout(hintTimer.current);
  }

  hintTimer.current = window.setTimeout(
    () => setHint(''),
    1800
  );
};

const phasesRef = useRef(phases);
const currentRef = useRef(current);
  const courtRef = useRef(courtType);
  const selectionRef = useRef<SelItem[]>([]);
  const dragRef = useRef<Line | null>(null);
  const drawingRef = useRef(false);
  const rotatingRef = useRef(false);
  const rotCenterRef = useRef<Pt | null>(null);
  const resizingRef = useRef(false);
  const resizeStartRef = useRef<{
    id: string;
    mode: 'vertex' | 'box';
    vertexIndex?: number;
    center?: Pt;
    rotation?: number;
    baseRadius?: number;
  } | null>(null);
  const movingRef = useRef(false);
  const moveStartRef = useRef<{ start: Pt; orig: Map<string, Player | Obj | Line> } | null>(null);
  const lineDragRef = useRef<{ id: string; which: 'from' | 'to' | 'ctrl'; index?: number } | null>(null);
  const pressRef = useRef<{ lineId: string; startN: Pt; startPx: Pt; moved: boolean; longFired: boolean } | null>(null);
  const pressTimerRef = useRef<number | null>(null);
  const histPushedRef = useRef(false);
  // ----- Animation / timeline -----
  const animPosRef = useRef<{
  players: Record<string, Pt>;
  balls: Pt[];
} | null>(null);
  const rafRef = useRef<number | null>(null);
  const playingRef = useRef(false);
  const speedRef = useRef(1);
  const tlBarRef = useRef<HTMLDivElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  // horloge globale + planning des phases (timing parallèle)
  const clockRef = useRef(0);
  const lastNowRef = useRef(0);
  const scheduleRef = useRef<Sched[]>([]);
  const totalMsRef = useRef(0);
  const ballEventsRef = useRef<{ src: string | null; target: string | null; shoot: boolean; wStart: number; wEnd: number; from?: Pt; to?: Pt; tMode?: 'player' | 'playerCurrentPoint'; createdPt?: Pt }[]>([]);
  const carrier0Ref = useRef<string | null>(null);
  const rosterRef = useRef<Player[]>([]);
  const onAnimEndRef = useRef<(() => void) | null>(null); // callback fin d'animation (utilisé par l'export vidéo)
  const [videoOpen, setVideoOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [vidQuality, setVidQuality] = useState<'std' | 'hd' | 'fhd'>('hd');
  const [vidFps, setVidFps] = useState<24 | 30 | 60>(30);
  const [vidFormat, setVidFormat] = useState<'mp4' | 'gif'>('mp4');
  // Fiche coach / export PDF
  const [pdfOpen, setPdfOpen] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);
  const [sheet, setSheet] = useState({ category: '', level: '', theme: '', duration: '', material: '', objectives: '', instructions: '', variants: '', coaching: '' });
  const setSheetField = (k: keyof typeof sheet, v: string) => setSheet((s) => ({ ...s, [k]: v }));
  const photoCache = useRef<Map<string, HTMLImageElement>>(new Map());

  const uid = () => Math.random().toString(36).slice(2, 9);
  const toggleCourt = () => setCourtType((c) => (c === 'half' ? 'full' : 'half'));
  const pick = (t: Tool) => { setPlaceMode(null); setSelection([]); setTool(t); };

  // ----------------------- Historique (undo/redo) -----------------------
  const snap = () => ({ phases: JSON.parse(JSON.stringify(phases)) as Phase[], current });
  const pushHistory = () => { setPast((p) => [...p.slice(-49), snap()]); setFuture([]); };
  const undo = () => {
    setPast((p) => {
      if (!p.length) return p;
      const prev = p[p.length - 1];
      setFuture((f) => [{ phases: JSON.parse(JSON.stringify(phases)) as Phase[], current }, ...f]);
      setPhases(prev.phases); setCurrent(prev.current); setSelection([]);
      return p.slice(0, -1);
    });
  };
  const redo = () => {
    setFuture((f) => {
      if (!f.length) return f;
      const nxt = f[0];
      setPast((p) => [...p, { phases: JSON.parse(JSON.stringify(phases)) as Phase[], current }]);
      setPhases(nxt.phases); setCurrent(nxt.current); setSelection([]);
      return f.slice(1);
    });
  };

  // ----------------------- Dessin : flèche pleine -----------------------
  // Pointe pleine, orientée par la tangente (tan = point amont, tip = extrémité). Plus grosse (~1,7x).
  const arrowHead = (ctx: CanvasRenderingContext2D, tan: Pt, tip: Pt, w: number) => {
    const ang = Math.atan2(tip.y - tan.y, tip.x - tan.x);
    const len = Math.max(16, w * 7);
    const half = len * 0.5;
    ctx.save();
    ctx.translate(tip.x, tip.y);
    ctx.rotate(ang);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-len, -half);
    ctx.lineTo(-len * 0.7, 0);
    ctx.lineTo(-len, half);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const drawBackground = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    const ct = courtRef.current;
    const img = ct === 'half' ? demiImgRef.current : fullImgRef.current;
    const ready = ct === 'half' ? readyRef.current.demi : readyRef.current.full;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (img && ready) {
      if (ct === 'full') {
        // Terrain complet en VERTICAL : on pivote l'image (source paysage) de 90° pour l'afficher
        // en hauteur (panier en haut, panier en bas, ligne médiane horizontale au centre).
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.rotate(Math.PI / 2);
        const spaceW = canvas.height, spaceH = canvas.width;
        const r = img.naturalWidth / img.naturalHeight, sr = spaceW / spaceH;
        let dw: number, dh: number;
        if (r > sr) { dw = spaceW; dh = dw / r; } else { dh = spaceH; dw = dh * r; }
        ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
        ctx.restore();
      } else {
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      }
    } else {
      ctx.fillStyle = '#6B1A2C';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }
  };

  // ----- Tir : position des paniers en repère CANONIQUE (plein terrain) — ajuste si besoin -----
  // Demi-terrain : le panier (haut) s'affiche vers v≈0.2 ; en canonique c'est 0.2 * 0.5 = 0.1.
  const HALF_BASKET: Pt = { x: 0.5, y: 0.1 };
  // Terrain complet VERTICAL → panier en haut (v≈0.09) et en bas (v≈0.91), médiane au centre (v=0.5).
  const FULL_BASKET_TOP: Pt = { x: 0.5, y: 0.09 };
  const FULL_BASKET_BOT: Pt = { x: 0.5, y: 0.91 };
  const basketFor = (ct: 'half' | 'full', from: Pt): Pt =>
    ct === 'half' ? HALF_BASKET : (from.y < 0.5 ? FULL_BASKET_TOP : FULL_BASKET_BOT);

  // ----- Rectangle RÉEL de l'image du terrain dans le canvas (avec marges/centrage) -----
  // Les positions sont stockées relativement au terrain affiché (0..1, centre = 0.5), pas au canvas brut.
  // On convertit vers pixels uniquement au rendu, en tenant compte du rectangle réel du terrain.
  const getCourtDrawRect = (canvas: HTMLCanvasElement): { x: number; y: number; w: number; h: number } => {
    const W = canvas.width, H = canvas.height;
    if (courtRef.current !== 'full') return { x: 0, y: 0, w: W, h: H }; // demi : l'image remplit le canvas
    const img = fullImgRef.current;
    if (!img || !img.naturalWidth) return { x: 0, y: 0, w: W, h: H };
    // mêmes calculs que drawBackground (image pivotée 90° puis ajustée "contain")
    const spaceW = H, spaceH = W;
    const r = img.naturalWidth / img.naturalHeight, sr = spaceW / spaceH;
    let dw: number, dh: number;
    if (r > sr) { dw = spaceW; dh = dw / r; } else { dh = spaceH; dw = dh * r; }
    // après rotation : largeur affichée = dh, hauteur affichée = dw, centré dans le canvas
    const wDisp = dh, hDisp = dw;
    return { x: (W - wDisp) / 2, y: (H - hDisp) / 2, w: wDisp, h: hDisp };
  };
  // Le demi-terrain représente la MOITIÉ HAUTE du plein terrain.
  // On stocke tout en repère CANONIQUE "plein terrain" (u,v ∈ 0..1, centre = 0.5, v=0.5 = ligne médiane).
  //  - en plein terrain : affichage = canonique
  //  - en demi-terrain  : on n'affiche que [0, 0.5] du canonique → displayV = canonV / 0.5 ; canonV = displayV * 0.5
  const HALF_SPAN = 0.5;
  const canonToDisp = (n: Pt): Pt => (courtRef.current === 'full' ? n : { x: n.x, y: n.y / HALF_SPAN });
  const dispToCanon = (n: Pt): Pt => (courtRef.current === 'full' ? n : { x: n.x, y: n.y * HALF_SPAN });
  // terrainToCanvas : coordonnée terrain canonique (u,v) → pixels du canvas, via le rectangle réel de l'image
  const toPx = (canvas: HTMLCanvasElement, n: Pt): Pt => { const r = getCourtDrawRect(canvas); const d = canonToDisp(n); return { x: r.x + d.x * r.w, y: r.y + d.y * r.h }; };
  // canvasToTerrain : pixels → coordonnée terrain canonique (u,v)
  const toNc = (canvas: HTMLCanvasElement, px: Pt): Pt => { const r = getCourtDrawRect(canvas); const d = { x: (px.x - r.x) / r.w, y: (px.y - r.y) / r.h }; return dispToCanon(d); };
  const cs = (canvas: HTMLCanvasElement): number => getCourtDrawRect(canvas).w; // échelle (rayons/épaisseurs) basée sur la largeur du terrain
  // ----- Logique d'ancrage des actions aux joueurs -----
  const MOVE_ACTIONS = ['cut', 'dribble', 'screen']; // actions qui déplacent réellement le joueur source
  // position logique normalisée d'un joueur = fin de sa dernière action de déplacement, sinon son jeton
  const playerLogicalPosN = (ph: Phase, playerId?: string): Pt | null => {
    if (!playerId) return null;
    const pl = ph.players.find((p) => p.id === playerId); if (!pl) return null;
    for (let i = ph.lines.length - 1; i >= 0; i--) { const z = ph.lines[i]; if (z.sourcePlayerId === playerId && MOVE_ACTIONS.includes(z.action)) return z.to; }
    return { x: pl.x, y: pl.y };
  };
  // position de départ d'une trajectoire = fin de la dernière action de déplacement du source AVANT cette ligne
  const lineStartN = (ph: Phase, l: Line): Pt => {
    if (!l.sourcePlayerId) return l.from;
    const pl = ph.players.find((p) => p.id === l.sourcePlayerId); if (!pl) return l.from;
    const idx = ph.lines.findIndex((z) => z.id === l.id);
    const upto = idx < 0 ? ph.lines.length : idx;
    for (let i = upto - 1; i >= 0; i--) { const z = ph.lines[i]; if (z.sourcePlayerId === l.sourcePlayerId && MOVE_ACTIONS.includes(z.action)) return z.to; }
    return { x: pl.x, y: pl.y };
  };
  // joueur le plus proche d'un point (jeton OU fin logique), pour le snap de la passe
  const SNAP_N = 0.05;
  const findPlayerAt = (ph: Phase, Pn: Pt, excludeId?: string): string | null => {
    let best: string | null = null, bestD = SNAP_N;
    for (const pl of ph.players) {
      if (pl.id === excludeId) continue;
      const cand = [{ x: pl.x, y: pl.y }, playerLogicalPosN(ph, pl.id) || { x: pl.x, y: pl.y }];
      for (const q of cand) { const d = Math.hypot(Pn.x - q.x, Pn.y - q.y); if (d < bestD) { bestD = d; best = pl.id; } }
    }
    return best;
  };
  // ----- Possession du ballon & simulation de phase -----
  const ACTION_KINDS = ['cut', 'dribble', 'screen', 'pass', 'shoot'];

  // Ballons attachés à un joueur.
  // Compatibilité : les anciens schémas utilisent hasBall=true.
  // Nouveau : ballCount permet 0, 1 ou 2 ballons sur le même joueur.
  const playerBallCount = (player?: Player | null): number => {
    if (!player) return 0;
    const raw = player.ballCount ?? (player.hasBall ? 1 : 0);
    const n = Number(raw);
    return Math.max(0, Math.min(2, Number.isFinite(n) ? Math.round(n) : 0));
  };

  const ballPatch = (count: number): Partial<Player> => {
    const next = Math.max(0, Math.min(2, Math.round(count || 0)));
    return { hasBall: next > 0, ballCount: next };
  };

  const offsetBallPoint = (pt: Pt, index: number, count: number): Pt => {
    if (count <= 1) return pt;
    const gap = 0.016;
    return {
      x: pt.x + (index - (count - 1) / 2) * gap,
      y: pt.y - 0.012,
    };
  };

  const addOwnerBall = (owners: Map<string, number>, id: string, amount = 1) => {
    owners.set(id, Math.min(2, (owners.get(id) || 0) + amount));
  };

  const removeOwnerBall = (owners: Map<string, number>, id: string, amount = 1) => {
    const next = (owners.get(id) || 0) - amount;
    if (next > 0) owners.set(id, next);
    else owners.delete(id);
  };
  // actions ordonnées d'une phase (par order de création, sinon ordre du tableau)
  const orderedActions = (ph: Phase): Line[] =>
    ph.lines
      .map((l, i) => ({ l, i }))
      .filter((x) => ACTION_KINDS.includes(x.l.action))
      .sort((a, b) => ((a.l.order ?? a.i) - (b.l.order ?? b.i)) || (a.i - b.i))
      .map((x) => x.l);
  // simule la phase action par action : positions des joueurs, porteur et position du ballon
  // (s'arrête AVANT l'action uptoId si fournie)
  const simulatePhase = (ph: Phase, uptoId?: string): { pos: Record<string, Pt>; owner: string | null; ballPt: Pt | null } => {
    const pos: Record<string, Pt> = {};
    ph.players.forEach((p) => { pos[p.id] = { x: p.x, y: p.y }; });
    let owner: string | null = ph.players.find((p) => playerBallCount(p) > 0)?.id ?? null;
    let ballPt: Pt | null = owner && pos[owner] ? { ...pos[owner] } : null;
    for (const l of orderedActions(ph)) {
      if (uptoId && l.id === uptoId) break;
      const sp = l.sourcePlayerId;
      if (l.action === 'cut' || l.action === 'screen') {
        if (sp && pos[sp]) pos[sp] = { ...l.to }; // le joueur bouge, le ballon non
      } else if (l.action === 'dribble') {
        if (sp && pos[sp]) { pos[sp] = { ...l.to }; if (owner === sp) ballPt = { ...l.to }; }
      } else if (l.action === 'pass') {
        const tp = l.targetPlayerId;
        if (tp) { owner = tp; ballPt = pos[tp] ? { ...pos[tp] } : (l.to ? { ...l.to } : ballPt); }
      } else if (l.action === 'shoot') {
        const fromPt = sp && pos[sp] ? pos[sp] : (ballPt || l.from);
        owner = null; ballPt = basketFor(courtRef.current, fromPt);
      }
    }
    return { pos, owner, ballPt };
  };
  // position logique actuelle du joueur (après toutes les actions de la phase courante)
  const getPlayerCurrentPoint = (playerId: string): Pt | null => {
    const ph = phasesRef.current[currentRef.current]; if (!ph) return null;
    const { pos } = simulatePhase(ph);
    return pos[playerId] || null;
  };
  // porteur du ballon à la fin de la phase courante
  const getBallCurrentOwner = (): string | null => {
    const ph = phasesRef.current[currentRef.current]; return ph ? simulatePhase(ph).owner : null;
  };
  // position actuelle du ballon (repère canonique)
  const getBallCurrentPoint = (): Pt | null => {
    const ph = phasesRef.current[currentRef.current]; return ph ? simulatePhase(ph).ballPt : null;
  };

  // Porteurs de balle disponibles pour créer la prochaine action.
  // Règle MyBasket conservée : plusieurs ballons peuvent exister.
  // - Tout joueur avec `hasBall` est porteur, même si un tir existe déjà dans la phase
  //   (cas rebond : tu réassocies un ballon et le joueur peut rejouer).
  // - Une passe transfère le ballon du joueur source vers le receveur.
  // - Un tir enlève le ballon simulé du tireur, mais ne bloque pas un ballon réassocié ensuite.
  const getBallCurrentOwners = (): Set<string> => {
    const ph = phasesRef.current[currentRef.current];
    const owners = new Set<string>();

    if (!ph) return owners;

    const associatedOwners = new Set<string>();

    ph.players.forEach((player) => {
      if (playerBallCount(player) > 0) {
        owners.add(player.id);
        associatedOwners.add(player.id);
      }
    });

    orderedActions(ph).forEach((line) => {
      const sourceId = line.sourcePlayerId || null;

      if (line.action === 'pass') {
        if (sourceId) owners.delete(sourceId);
        if (line.targetPlayerId) owners.add(line.targetPlayerId);
      }

      if (line.action === 'shoot') {
        if (sourceId) owners.delete(sourceId);
      }
    });

    // Le bouton / panneau qui associe un ballon à un joueur doit toujours primer :
    // si un joueur porte visuellement un ballon, il peut dribbler, passer ou tirer.
    associatedOwners.forEach((id) => owners.add(id));

    return owners;
  };

  // Le joueur peut démarrer une action avec ballon s'il est porteur simulé
  // OU si un ballon lui est explicitement associé sur la phase.
  const playerHasBallAtActionStart = (playerId: string): boolean => {
    const ph = phasesRef.current[currentRef.current];
    const hasAssociatedBall = Boolean(
      ph?.players.some((player) => player.id === playerId && playerBallCount(player) > 0)
    );

    return hasAssociatedBall || getBallCurrentOwners().has(playerId);
  };
  // point de départ effectif d'une trajectoire (suit le joueur source / la fin de sa dernière action)
  const resolveFrom = (l: Line): Pt => {
    if (l.sourcePlayerId) { const ph = phasesRef.current[currentRef.current]; const pos = ph ? lineStartN(ph, l) : null; if (pos) return pos; }
    return l.from;
  };
  // position d'un joueur cible à l'instant local (ms) dans une phase (timing-aware, action par action)
  const getPlayerPositionAtTime = (phaseIdx: number, playerId: string, timeMs: number): Pt | null => {
    const actSched = buildPhaseActionSched(phaseIdx);
    const span = phaseSpanMs(phaseIdx, actSched);
    return phasePlayerPosAt({ idx: phaseIdx, start: 0, span, end: span, actSched }, playerId, timeMs);
  };
  // cible effective d'une passe (canonique) — respecte targetMode et NE saute jamais vers une action future
  const passTargetPointN = (l: Line): Pt => {
    if (l.action !== 'pass' || !l.targetPlayerId) return l.to;
    if (l.targetMode === 'playerCurrentPoint') {
      // position du joueur cible AU MOMENT D'ARRIVÉE de la passe (fin de la passe), selon le timing
      const idx = currentRef.current;
      const actSched = buildPhaseActionSched(idx);
      const found = actSched.find((a) => a.line.id === l.id);
      if (found) { const pos = getPlayerPositionAtTime(idx, l.targetPlayerId, found.end); if (pos) return pos; }
    }
    // défaut "player" : la position figée de la cible au moment de la création de la passe
    return l.createdTargetPoint || l.to;
  };
  // point d'arrivée effectif : tir → panier ; passe → cible explicite ; sinon point libre
  const resolveTo = (l: Line): Pt => {
    if (l.action === 'shoot' && l.target === 'basket') return basketFor(courtRef.current, resolveFrom(l));
    if (l.action === 'pass' && l.targetPlayerId) return passTargetPointN(l);
    return l.to;
  };
  // cible / viseur au bout du tir
  const drawTarget = (ctx: CanvasRenderingContext2D, t: Pt, w: number) => {
    const R = Math.max(7, w * 3);
    ctx.lineWidth = w; ctx.strokeStyle = '#0F0F12'; ctx.fillStyle = '#0F0F12';
    ctx.beginPath(); ctx.arc(t.x, t.y, R, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(t.x - R * 1.5, t.y); ctx.lineTo(t.x + R * 1.5, t.y);
    ctx.moveTo(t.x, t.y - R * 1.5); ctx.lineTo(t.x, t.y + R * 1.5);
    ctx.stroke();
    ctx.beginPath(); ctx.arc(t.x, t.y, R * 0.28, 0, Math.PI * 2); ctx.fill();
  };

  // Liste ordonnée des points de contrôle d'une trajectoire (compat. ancien champ `ctrl`).
  const lineCtrls = (l: Line): Pt[] => l.ctrls ?? (l.ctrl ? [l.ctrl] : []);
  // Géométrie en px : f (départ), t (arrivée), ctrls (points de contrôle ordonnés). Rotation appliquée.
  const lineGeom = (canvas: HTMLCanvasElement, l: Line) => {
    const fromN = resolveFrom(l);
    const toN = resolveTo(l);
    // IMPORTANT : on passe par toPx (même mapping canonique → affichage que les joueurs/objets),
    // sinon le départ de la trajectoire ne coïncide plus avec le joueur (surtout en demi-terrain).
    let f = toPx(canvas, fromN);
    let t = toPx(canvas, toN);
    let ctrls = lineCtrls(l).map((c) => toPx(canvas, c));
    const rot = ((l.rotation || 0) * Math.PI) / 180;
    if (rot && !(l.action === 'shoot' && l.target === 'basket')) {
      const mx = (f.x + t.x) / 2, my = (f.y + t.y) / 2;
      const rp = (p: Pt) => { const dx = p.x - mx, dy = p.y - my; return { x: mx + dx * Math.cos(rot) - dy * Math.sin(rot), y: my + dx * Math.sin(rot) + dy * Math.cos(rot) }; };
      f = rp(f); t = rp(t); ctrls = ctrls.map(rp);
    }
    return { f, t, ctrls };
  };
  // Spline Catmull-Rom passant PAR chaque point [f, ...ctrls, t] → polyligne échantillonnée (px).
  const catmullRom = (pts: Pt[], perSeg = 20): Pt[] => {
    if (pts.length <= 1) return pts.slice();
    if (pts.length === 2) {
      const out: Pt[] = []; const a = pts[0], b = pts[1];
      for (let i = 0; i <= perSeg; i++) { const u = i / perSeg; out.push({ x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }); }
      return out;
    }
    const P = pts; const out: Pt[] = [];
    for (let i = 0; i < P.length - 1; i++) {
      const p0 = P[i - 1] || P[i], p1 = P[i], p2 = P[i + 1], p3 = P[i + 2] || P[i + 1];
      for (let j = 0; j <= perSeg; j++) {
        if (i > 0 && j === 0) continue; // évite les doublons aux jonctions
        const u = j / perSeg, u2 = u * u, u3 = u2 * u;
        out.push({
          x: 0.5 * (2 * p1.x + (-p0.x + p2.x) * u + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * u2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * u3),
          y: 0.5 * (2 * p1.y + (-p0.y + p2.y) * u + (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * u2 + (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * u3),
        });
      }
    }
    return out;
  };
  // polyligne échantillonnée d'une trajectoire (du départ à l'arrivée, en passant par les points)
  const linePoly = (canvas: HTMLCanvasElement, l: Line): Pt[] => {
    const g = lineGeom(canvas, l);
    return catmullRom([g.f, ...g.ctrls, g.t]);
  };
  // longueurs cumulées d'une polyligne
  const arcLengths = (poly: Pt[]): number[] => {
    const L = [0];
    for (let i = 1; i < poly.length; i++) L.push(L[i - 1] + Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y));
    return L;
  };
  // point + tangente à une abscisse curviligne s le long de la polyligne
  const pointAtLength = (poly: Pt[], L: number[], s: number): { pt: Pt; tan: Pt } => {
    const total = L[L.length - 1] || 1; s = Math.max(0, Math.min(total, s));
    let i = 1; while (i < L.length && L[i] < s) i++;
    const a = poly[i - 1], b = poly[i] || poly[i - 1];
    const segLen = (L[i] || L[i - 1]) - L[i - 1] || 1;
    const u = (s - L[i - 1]) / segLen;
    return { pt: { x: a.x + (b.x - a.x) * u, y: a.y + (b.y - a.y) * u }, tan: { x: b.x - a.x, y: b.y - a.y } };
  };

  const drawLine = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, l: Line) => {
    const w = Math.max(2, cs(canvas) * 0.0035);
    ctx.lineWidth = w; ctx.strokeStyle = '#0F0F12'; ctx.fillStyle = '#0F0F12'; ctx.setLineDash([]);
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    if (l.action === 'freedraw' && l.points) {
      ctx.beginPath();
      l.points.forEach((p, i) => { const q = toPx(canvas, p); if (i) ctx.lineTo(q.x, q.y); else ctx.moveTo(q.x, q.y); });
      ctx.stroke();
      return;
    }
    const { f, t } = lineGeom(canvas, l);
    const poly = linePoly(canvas, l);
    const L = arcLengths(poly);
    const total = L[L.length - 1] || 1;
    const endTanPt = poly[poly.length - 2] || f; // avant-dernier échantillon → tangente d'arrivée

    if (l.action === 'dribble') {
      const amp = w * 2.2;
      const waves = Math.max(3, Math.round(total / 18));
      const tipBack = Math.min(total * 0.14, 16); // garde la place de la pointe
      const reach = Math.max(1, total - tipBack);
      const M = Math.max(60, waves * 10);
      ctx.beginPath();
      for (let k = 0; k <= M; k++) {
        const s = (k / M) * reach;
        const { pt, tan } = pointAtLength(poly, L, s);
        const dl = Math.hypot(tan.x, tan.y) || 1; const nx = -tan.y / dl, ny = tan.x / dl;
        const off = Math.sin((s / reach) * Math.PI * waves) * amp * (1 - (s / reach) * 0.15);
        const px = pt.x + nx * off, py = pt.y + ny * off;
        if (k) ctx.lineTo(px, py); else ctx.moveTo(px, py);
      }
      ctx.stroke();
      const endBase = pointAtLength(poly, L, reach).pt;
      arrowHead(ctx, endBase, t, w);
      return;
    }

    // tracé de la courbe (lisse) — polyligne Catmull-Rom
    ctx.beginPath();
    if (l.action === 'pass') ctx.setLineDash([w * 3, w * 2.4]);
    poly.forEach((p, i) => { if (i) ctx.lineTo(p.x, p.y); else ctx.moveTo(p.x, p.y); });
    ctx.stroke();
    ctx.setLineDash([]);

    if (l.action === 'screen') {
      const ang = Math.atan2(t.y - endTanPt.y, t.x - endTanPt.x) + Math.PI / 2; const br = w * 4;
      ctx.beginPath();
      ctx.moveTo(t.x - Math.cos(ang) * br, t.y - Math.sin(ang) * br);
      ctx.lineTo(t.x + Math.cos(ang) * br, t.y + Math.sin(ang) * br);
      ctx.stroke();
    } else if (l.action === 'giveball') {
      const m = pointAtLength(poly, L, total / 2).pt;
      ctx.fillStyle = '#E8743C'; ctx.beginPath(); ctx.arc(m.x, m.y, w * 2.4, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#0F0F12'; arrowHead(ctx, endTanPt, t, w);
    } else if (l.action === 'shoot') {
      drawTarget(ctx, t, w); // cible fixée au panier ; seuls les points intermédiaires plient la courbe
    } else {
      arrowHead(ctx, endTanPt, t, w); // cut : pointe orientée par la tangente d'arrivée
    }
  };

  const objectPolygonPointsPx = (
    canvas: HTMLCanvasElement,
    o: Obj
  ): Pt[] | null => {
    if (!['triangle', 'square'].includes(o.kind)) return null;

    if (Array.isArray(o.points) && o.points.length >= 3) {
      return o.points.map((point) => toPx(canvas, point));
    }

    const center = toPx(canvas, { x: o.x, y: o.y });
    const s = cs(canvas) * 0.018 * (o.size || 1);
    const scaleX = o.scaleX || 1;
    const scaleY = o.scaleY || 1;
    const rotation = ((o.rotation || 0) * Math.PI) / 180;

    const local =
      o.kind === 'triangle'
        ? [
            { x: 0, y: -s * 1.2 },
            { x: s, y: s },
            { x: -s, y: s },
          ]
        : [
            { x: -s, y: -s },
            { x: s, y: -s },
            { x: s, y: s },
            { x: -s, y: s },
          ];

    return local.map((point) => {
      const sx = point.x * scaleX;
      const sy = point.y * scaleY;
      return {
        x: center.x + sx * Math.cos(rotation) - sy * Math.sin(rotation),
        y: center.y + sx * Math.sin(rotation) + sy * Math.cos(rotation),
      };
    });
  };

  const drawObject = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, o: Obj) => {
    const polygonPoints = objectPolygonPointsPx(canvas, o);

    if (polygonPoints && Array.isArray(o.points)) {
      const shapeColor = o.color || '#0F0F12';
      ctx.save();
      ctx.strokeStyle = shapeColor;
      ctx.fillStyle = shapeColor;
      ctx.lineWidth = Math.max(2, cs(canvas) * 0.003);
      ctx.beginPath();
      polygonPoints.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fill();
      ctx.restore();
      ctx.stroke();
      ctx.restore();
      return;
    }

    const pos = toPx(canvas, { x: o.x, y: o.y }); const x = pos.x, y = pos.y;
    const s = cs(canvas) * 0.018 * (o.size || 1);
    const scaleX = o.scaleX || 1;
    const scaleY = o.scaleY || 1;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(((o.rotation || 0) * Math.PI) / 180);
    ctx.scale(scaleX, scaleY);
    ctx.lineWidth = Math.max(2, cs(canvas) * 0.003) / Math.max(scaleX, scaleY);
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    switch (o.kind) {
      case 'ball':
        ctx.fillStyle = o.color || '#E8743C'; ctx.strokeStyle = o.color || '#7a3a10';
        ctx.beginPath(); ctx.arc(0, 0, s, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(-s, 0); ctx.lineTo(s, 0); ctx.moveTo(0, -s); ctx.lineTo(0, s); ctx.stroke();
        break;
      case 'cone':
        ctx.fillStyle = o.color || '#E87722';
        ctx.beginPath(); ctx.moveTo(0, -s * 1.2); ctx.lineTo(s, s); ctx.lineTo(-s, s); ctx.closePath(); ctx.fill();
        break;
      case 'triangle': {
        const shapeColor = o.color || '#0F0F12';
        ctx.strokeStyle = shapeColor;
        ctx.fillStyle = shapeColor;
        ctx.beginPath();
        ctx.moveTo(0, -s * 1.2);
        ctx.lineTo(s, s);
        ctx.lineTo(-s, s);
        ctx.closePath();
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fill();
        ctx.restore();
        ctx.stroke();
        break;
      }
      case 'square': {
        const shapeColor = o.color || '#0F0F12';
        ctx.strokeStyle = shapeColor;
        ctx.fillStyle = shapeColor;
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fillRect(-s, -s, 2 * s, 2 * s);
        ctx.restore();
        ctx.strokeRect(-s, -s, 2 * s, 2 * s);
        break;
      }
      case 'circle': {
        const shapeColor = o.color || '#0F0F12';
        ctx.strokeStyle = shapeColor;
        ctx.fillStyle = shapeColor;
        ctx.beginPath();
        ctx.arc(0, 0, s, 0, Math.PI * 2);
        ctx.save();
        ctx.globalAlpha = 0.22;
        ctx.fill();
        ctx.restore();
        ctx.stroke();
        break;
      }
      case 'handoff':
        ctx.fillStyle = o.color || '#0F0F12';
        ctx.font = '700 ' + Math.round(s * 1.9) + "px Arial, sans-serif";
        ctx.fillText('H', 0, 0);
        break;
      case 'text':
        ctx.fillStyle = o.color || '#0F0F12';
        ctx.font = '700 ' + Math.round(cs(canvas) * 0.024 * (o.size || 1)) + "px 'Roboto', sans-serif";
        ctx.fillText(o.text || '', 0, 0);
        break;
    }
    ctx.restore();
  };

  // Défenseur — figure rouge MyBasket : tête, corps blanc cerclé rouge, bras (arcs), label
  const getPhoto = (src: string) => {
    let img = photoCache.current.get(src);
    if (!img) { img = new Image(); img.onload = () => render(); img.src = src; photoCache.current.set(src, img); }
    return img;
  };
  const drawActionNumber = (ctx: CanvasRenderingContext2D, x: number, y: number, num: number) => {
    const r = 9;
    ctx.save();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#D4A24C'; ctx.fill();
    ctx.lineWidth = 2; ctx.strokeStyle = '#6B1A2C'; ctx.stroke();
    ctx.fillStyle = '#0F0F12'; ctx.font = '700 11px system-ui, sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(num), x, y + 0.5);
    ctx.restore();
  };
  const drawBall = (ctx: CanvasRenderingContext2D, bx: number, by: number, br: number) => {
    ctx.fillStyle = '#E8743C'; ctx.strokeStyle = '#7a3a10'; ctx.lineWidth = Math.max(1, br * 0.18);
    ctx.beginPath(); ctx.arc(bx, by, br, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(bx - br, by); ctx.lineTo(bx + br, by); ctx.moveTo(bx, by - br); ctx.lineTo(bx, by + br); ctx.stroke();
  };
  const drawPhotoToken = (ctx: CanvasRenderingContext2D, p: Player, r: number) => {
    const img = getPhoto(p.photo as string);
    const ring = p.color || (p.team === 'def' ? '#D62828' : p.shape === 'square' ? '#0F0F12' : '#D4A24C');
    ctx.save();
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.closePath(); ctx.clip();
    if (img.complete && img.naturalWidth) {
      const s = Math.max((2 * r) / img.naturalWidth, (2 * r) / img.naturalHeight);
      const dw = img.naturalWidth * s, dh = img.naturalHeight * s;
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    } else { ctx.fillStyle = '#cfcfcf'; ctx.fillRect(-r, -r, 2 * r, 2 * r); }
    ctx.restore();
    ctx.lineWidth = Math.max(2, r * 0.13); ctx.strokeStyle = ring;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke();
  };
  const drawDefenderShape = (ctx: CanvasRenderingContext2D, p: Player, r: number) => {
    // Défenseur 100% Canvas : corps rond + numéro, tête, et deux bras courbés larges/ouverts.
    // Dessiné en coordonnées locales (le translate/rotate/scale est géré par drawPlayer),
    // donc toute la silhouette tourne d'un bloc.
    const red = p.color || '#6B1A2C';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // --- BRAS (deux courbes épaisses, longues et ouvertes) — dessinés d'abord (sous le corps) ---
    const armW = Math.max(3, r * 0.52);
    ctx.strokeStyle = red;
    ctx.lineWidth = armW;
    // bras gauche : de l'épaule, sweep large vers l'extérieur puis remontée, main relevée
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, r * 0.05);
    ctx.bezierCurveTo(-r * 1.35, r * 0.55, -r * 2.45, r * 0.15, -r * 2.55, -r * 1.05);
    ctx.stroke();
    // bras droit (miroir)
    ctx.beginPath();
    ctx.moveTo(r * 0.45, r * 0.05);
    ctx.bezierCurveTo(r * 1.35, r * 0.55, r * 2.45, r * 0.15, r * 2.55, -r * 1.05);
    ctx.stroke();
    // petites mains (extrémités arrondies marquées)
    ctx.fillStyle = red;
    ctx.beginPath(); ctx.arc(-r * 2.55, -r * 1.05, armW * 0.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(r * 2.55, -r * 1.05, armW * 0.5, 0, Math.PI * 2); ctx.fill();

    // --- COU + TÊTE ---
    ctx.strokeStyle = red;
    ctx.lineWidth = Math.max(2, r * 0.22);
    ctx.beginPath(); ctx.moveTo(0, -r * 0.55); ctx.lineTo(0, -r * 1.18); ctx.stroke();
    ctx.fillStyle = red;
    ctx.beginPath(); ctx.arc(0, -r * 1.42, r * 0.42, 0, Math.PI * 2); ctx.fill();

    // --- CORPS (cercle plein bordeaux) ---
    ctx.fillStyle = red;
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
    // anneau blanc intérieur (comme la capture)
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = Math.max(1.5, r * 0.1);
    ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2); ctx.stroke();

    // --- NUMÉRO blanc centré ---
    ctx.fillStyle = '#FFFFFF';
    ctx.font = '700 ' + Math.round(r * (p.label.length > 1 ? 0.82 : 1.0)) + "px 'Roboto', sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(p.label, 0, 1);
  };
  const drawAttackerShape = (ctx: CanvasRenderingContext2D, p: Player, r: number) => {
    let fill = '#6B1A2C', stroke = '#D4A24C', textColor = '#D4A24C';
    if (p.coach) { fill = '#FFFFFF'; stroke = '#0F0F12'; textColor = '#0F0F12'; }
    else if (p.shape === 'square') { fill = '#D4A24C'; stroke = '#0F0F12'; textColor = '#0F0F12'; }
    if (p.color) { fill = p.color; stroke = '#0F0F12'; textColor = '#FFFFFF'; }
    ctx.lineWidth = Math.max(2, r * 0.16); ctx.fillStyle = fill; ctx.strokeStyle = stroke;
    ctx.beginPath();
    if (p.shape === 'square') ctx.rect(-r, -r, 2 * r, 2 * r); else ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = textColor; ctx.font = '700 ' + Math.round(r * (p.label.length > 1 ? 0.9 : 1.1)) + "px 'Roboto', sans-serif";
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(p.label, 0, 1);
  };
  const drawPlayer = (ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement, p: Player) => {
    const pos = toPx(canvas, { x: p.x, y: p.y }); const x = pos.x, y = pos.y;
    const r = cs(canvas) * 0.024 * (p.size || 1);
    ctx.save(); ctx.translate(x, y); ctx.rotate(((p.rotation || 0) * Math.PI) / 180);
    if (p.photo) drawPhotoToken(ctx, p, r);
    else if (p.team === 'def') drawDefenderShape(ctx, p, r);
    else drawAttackerShape(ctx, p, r);
    ctx.restore();
    if (p.name) {
      ctx.save(); ctx.fillStyle = '#0F0F12';
      ctx.font = '600 ' + Math.round(cs(canvas) * 0.024 * 0.7) + "px 'Roboto', sans-serif";
      ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillText(p.name, x, y + r + 2); ctx.restore();
    }
    const attachedBallCount = playerBallCount(p);

    if (attachedBallCount >= 1) {
      // 1er ballon : position historique MyBasket.
      // Ne pas modifier : il reste collé au joueur comme avant.
      drawBall(ctx, x + r * 0.78, y - r * 0.78, Math.max(5, r * 0.42));
    }

    if (attachedBallCount >= 2) {
      // 2e ballon : même hauteur, symétrique à gauche du joueur.
      drawBall(ctx, x - r * 0.78, y - r * 0.78, Math.max(5, r * 0.42));
    }
  };

  // géométrie d'un élément (centre + rayon de contour)
  const itemGeom = (canvas: HTMLCanvasElement, item: SelItem) => {
    const ph = phasesRef.current[currentRef.current]; if (!ph) return null;
    const scale = cs(canvas);
    if (item.type === 'player') { const p = ph.players.find((z) => z.id === item.id); if (!p) return null; const base = scale * 0.024 * (p.size || 1); const c = toPx(canvas, { x: p.x, y: p.y }); return { cx: c.x, cy: c.y, ringR: base * (p.team === 'def' ? 2.85 : 1.55), rotDeg: p.rotation || 0 }; }
    if (item.type === 'object') {
      const o = ph.objects.find((z) => z.id === item.id);
      if (!o) return null;
      const c = toPx(canvas, { x: o.x, y: o.y });
      const base = scale * 0.018 * (o.size || 1);
      const halfW = base * (o.scaleX || 1) * 1.25;
      const halfH = base * (o.scaleY || 1) * 1.25;
      return {
        cx: c.x,
        cy: c.y,
        ringR: Math.max(halfW, halfH) * 1.45,
        halfW,
        halfH,
        baseRadius: base,
        scaleX: o.scaleX || 1,
        scaleY: o.scaleY || 1,
        rotDeg: o.rotation || 0,
      };
    }
    const l = ph.lines.find((z) => z.id === item.id); if (!l) return null; const poly = linePoly(canvas, l); const m = poly[Math.floor(poly.length / 2)] || poly[0]; return { cx: m.x, cy: m.y, ringR: 26, rotDeg: l.rotation || 0 };
  };
  // poignée de rotation : uniquement si UNE seule sélection joueur/objet (les lignes utilisent leurs poignées de courbe)
  const getSelGeom = (canvas: HTMLCanvasElement) => {
    const sel = selectionRef.current; if (sel.length !== 1 || sel[0].type === 'line') return null;
    const g = itemGeom(canvas, sel[0]); if (!g) return null;
    const rad = (g.rotDeg * Math.PI) / 180; const hr = g.ringR + 18;
    return { cx: g.cx, cy: g.cy, hx: g.cx + Math.sin(rad) * hr, hy: g.cy - Math.cos(rad) * hr, ringR: g.ringR, rad };
  };
  // vrais sommets indépendants pour le triangle et le carré
  const getResizeHandles = (canvas: HTMLCanvasElement) => {
    const sel = selectionRef.current;
    if (sel.length !== 1 || sel[0].type !== 'object') return null;

    const ph = phasesRef.current[currentRef.current];
    if (!ph) return null;

    const object = ph.objects.find((item) => item.id === sel[0].id);
    if (!object) return null;

    if (object.kind === 'triangle' || object.kind === 'square') {
      const points = objectPolygonPointsPx(canvas, object);
      if (!points) return null;

      return {
        id: object.id,
        mode: 'vertex' as const,
        points,
      };
    }

    // Les autres formes conservent leur redimensionnement classique.
    if (!['circle', 'cone'].includes(object.kind)) return null;

    const geom = itemGeom(canvas, sel[0]) as any;
    if (!geom) return null;

    const rotation = ((object.rotation || 0) * Math.PI) / 180;
    const rotate = (lx: number, ly: number) => ({
      x: geom.cx + lx * Math.cos(rotation) - ly * Math.sin(rotation),
      y: geom.cy + lx * Math.sin(rotation) + ly * Math.cos(rotation),
    });

    const pad = 10;
    const halfW = geom.halfW + pad;
    const halfH = geom.halfH + pad;

    return {
      id: object.id,
      mode: 'box' as const,
      cx: geom.cx,
      cy: geom.cy,
      rotation,
      baseRadius: geom.baseRadius,
      points: [
        rotate(-halfW, -halfH),
        rotate(halfW, -halfH),
        rotate(halfW, halfH),
        rotate(-halfW, halfH),
      ],
    };
  };

  // poignées d'édition d'une trajectoire (départ / arrivée / points de contrôle) si une seule ligne est sélectionnée
  const lineHandles = (canvas: HTMLCanvasElement) => {
    const sel = selectionRef.current; if (sel.length !== 1 || sel[0].type !== 'line') return null;
    const ph = phasesRef.current[currentRef.current]; if (!ph) return null;
    const l = ph.lines.find((z) => z.id === sel[0].id); if (!l || l.action === 'freedraw') return null;
    const g = lineGeom(canvas, l);
    const isShoot = l.action === 'shoot' && l.target === 'basket';
    return { id: l.id, f: g.f, t: g.t, ctrls: g.ctrls, isShoot };
  };

  // Lignes visibles à l'écran.
  // En mode édition : on affiche tout.
  // En animation : on affiche uniquement l'action en cours, puis elle disparaît.
  const lineRenderEntries = (
    ph: Phase
  ): { line: Line; opacity: number; eraseProgress: number }[] => {
    const anim = animPosRef.current;

    if (!anim) {
      return ph.lines.map((line) => ({
        line,
        opacity: 1,
        eraseProgress: 0,
      }));
    }

    const sched = scheduleRef.current;
    const clock = clockRef.current;
    const phaseIdx = currentRef.current;

    let activePhase: Sched | null = null;

    for (const s of sched) {
      if (s.idx !== phaseIdx) continue;
      if (clock < s.start || clock > s.end) continue;

      if (!activePhase || s.start >= activePhase.start) {
        activePhase = s;
      }
    }

    if (!activePhase) return [];

    const local = clock - activePhase.start;

    return activePhase.actSched
      .filter((a) => local >= a.start && local <= a.end)
      .map((a) => {
        const progress = Math.max(
          0,
          Math.min(1, (local - a.start) / Math.max(1, a.dur))
        );

        return {
          line: a.line,
          opacity: 1,
          eraseProgress: progress,
        };
      });
  };

  const drawLineProgressiveErase = (
    ctx: CanvasRenderingContext2D,
    canvas: HTMLCanvasElement,
    line: Line,
    eraseProgress: number
  ) => {
    if (eraseProgress <= 0) {
      drawLine(ctx, canvas, line);
      return;
    }

    if (eraseProgress >= 1) return;

    const poly = linePoly(canvas, line);

    if (poly.length < 2) {
      drawLine(ctx, canvas, line);
      return;
    }

    const total = poly.reduce((sum, point, index) => {
      if (index === 0) return sum;
      const prev = poly[index - 1];
      return sum + Math.hypot(point.x - prev.x, point.y - prev.y);
    }, 0);

    if (total <= 0) return;

    const startDistance = total * eraseProgress;

    let walked = 0;
    const remaining: Pt[] = [];

    for (let i = 1; i < poly.length; i += 1) {
      const prev = poly[i - 1];
      const cur = poly[i];
      const seg = Math.hypot(cur.x - prev.x, cur.y - prev.y);

      if (walked + seg < startDistance) {
        walked += seg;
        continue;
      }

      if (remaining.length === 0) {
        const ratio = seg ? (startDistance - walked) / seg : 0;

        remaining.push({
          x: prev.x + (cur.x - prev.x) * ratio,
          y: prev.y + (cur.y - prev.y) * ratio,
        });
      }

      remaining.push(cur);
      walked += seg;
    }

    if (remaining.length < 2) return;

    const remainingLine: Line = {
      ...line,
      from: toNc(canvas, remaining[0]),
      to: toNc(canvas, remaining[remaining.length - 1]),
      points: remaining.map((point) => toNc(canvas, point)),
      ctrls: [],
      ctrl: undefined,
    };

    drawLine(ctx, canvas, remainingLine);
  };


  // render() — redessine tout
  const render = () => {
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    drawBackground(ctx, canvas);
    const ph = phasesRef.current[currentRef.current]; if (!ph) return;
    const anim = animPosRef.current;

    const lineEntries = lineRenderEntries(ph);
    lineEntries.forEach(({ line, opacity, eraseProgress }) => {
      ctx.save();
      ctx.globalAlpha = opacity;
      drawLineProgressiveErase(ctx, canvas, line, eraseProgress);
      ctx.restore();
    });

    if (!anim && dragRef.current) drawLine(ctx, canvas, dragRef.current);

    // numéros d'actions (rond doré au milieu de la trajectoire)
    // En animation, on numérote uniquement l'action visible.
    const visibleLineIds = new Set(lineEntries.map((entry) => entry.line.id));
    const acts = orderedActions(ph);
    acts.forEach((l, i) => {
      if (anim && !visibleLineIds.has(l.id)) return;
      const poly = linePoly(canvas, l); if (!poly.length) return;
      const m = poly[Math.floor(poly.length / 2)] || poly[0];
      drawActionNumber(ctx, m.x, m.y, i + 1);
    });

    ph.objects.forEach((o) => drawObject(ctx, canvas, o));
    const roster = anim ? rosterRef.current : ph.players;
    roster.forEach((p) => {
  const ap = anim ? anim.players[p.id] : null;
  if (anim && !ap) return;

  drawPlayer(ctx, canvas, {
  ...p,
  hasBall: anim ? false : playerBallCount(p) > 0,
  ballCount: anim ? 0 : playerBallCount(p),
  ...(ap ? { x: ap.x, y: ap.y } : {}),
});
});

// En animation, on garde le ballon animé uniquement pour les passes / tirs.
// Hors animation, les ballons sont directement attachés aux joueurs via hasBall.
if (anim && anim.balls) {
  anim.balls.forEach((ballPt) => {
    const bp = toPx(canvas, ballPt);

    drawBall(
      ctx,
      bp.x,
      bp.y,
      Math.max(6, cs(canvas) * 0.024 * 0.5)
    );
  });
}
    if (anim) return; // pas de poignées/sélection pendant l'animation
    // contour de chaque élément sélectionné
    selectionRef.current.forEach((item) => {
      const g = itemGeom(canvas, item); if (!g) return;
      ctx.save(); ctx.setLineDash([5, 4]); ctx.lineWidth = 2; ctx.strokeStyle = '#1B5E9C';
      ctx.beginPath(); ctx.arc(g.cx, g.cy, g.ringR, 0, Math.PI * 2); ctx.stroke(); ctx.restore();
    });
    // poignée de rotation (sélection unique joueur/objet)
    const g = getSelGeom(canvas);
    if (g) {
      ctx.save();
      ctx.beginPath(); ctx.moveTo(g.cx, g.cy); ctx.lineTo(g.hx, g.hy); ctx.lineWidth = 2; ctx.strokeStyle = '#1B5E9C'; ctx.stroke();
      ctx.fillStyle = '#D4A24C'; ctx.strokeStyle = '#0F0F12'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(g.hx, g.hy, 7, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    // poignées placées directement sur chaque sommet réel
    const resizeHandles = getResizeHandles(canvas);
    if (resizeHandles) {
      ctx.save();
      ctx.setLineDash([5, 4]);
      ctx.strokeStyle = '#1B5E9C';
      ctx.lineWidth = 2;
      ctx.beginPath();
      resizeHandles.points.forEach((point, index) => {
        if (index === 0) ctx.moveTo(point.x, point.y);
        else ctx.lineTo(point.x, point.y);
      });
      ctx.closePath();
      ctx.stroke();
      ctx.setLineDash([]);

      resizeHandles.points.forEach((handle) => {
        ctx.fillStyle = '#1B5E9C';
        ctx.strokeStyle = '#FFFFFF';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(handle.x, handle.y, 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      });
      ctx.restore();
    }

    // poignées d'édition de courbe (une seule trajectoire sélectionnée)
    const lh = lineHandles(canvas);
    if (lh) {
      ctx.save();
      // guide pointillé : départ → points de contrôle → arrivée
      ctx.setLineDash([4, 4]); ctx.lineWidth = 1.5; ctx.strokeStyle = 'rgba(27,94,156,0.7)';
      ctx.beginPath(); ctx.moveTo(lh.f.x, lh.f.y);
      lh.ctrls.forEach((c) => ctx.lineTo(c.x, c.y));
      ctx.lineTo(lh.t.x, lh.t.y); ctx.stroke();
      ctx.setLineDash([]);
      const dot = (x: number, y: number, fill: string, rr = 9) => { ctx.beginPath(); ctx.arc(x, y, rr, 0, Math.PI * 2); ctx.fillStyle = fill; ctx.fill(); ctx.lineWidth = 2.5; ctx.strokeStyle = '#FFFFFF'; ctx.stroke(); };
      // extrémités (arrivée masquée pour le tir, fixée au panier)
      dot(lh.f.x, lh.f.y, '#0F0F12', 8);
      if (!lh.isShoot) dot(lh.t.x, lh.t.y, '#0F0F12', 8);
      // points de contrôle (courbure) — gros cercles bleus faciles à attraper (tablette)
      lh.ctrls.forEach((c) => dot(c.x, c.y, '#1B5E9C', 11));
      ctx.restore();
    }
  };

  // ----------------------- Moteur d'animation (multi-phase, timing parallèle) -----------------------
  const ANIM_DEFAULT_SEC = 1.5;     // durée par défaut d'une phase (secondes)
  const MOVE_KINDS = ['cut', 'dribble', 'screen'];
  const BALL_KINDS = ['pass', 'shoot', 'giveball'];
  const ease = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  const phaseDuration = (ph: Phase) => (typeof ph.duration === 'number' && ph.duration > 0 ? ph.duration : ANIM_DEFAULT_SEC);
  const phaseStartMode = (ph: Phase): 'withPrevious' | 'afterPrevious' => (ph.startMode === 'withPrevious' ? 'withPrevious' : 'afterPrevious');

  // point (canonique) à la fraction t le long de la trajectoire d'une action (courbe respectée)
  const actionPointN = (startN: Pt, line: Line, t: number): Pt => {
    const pts = [startN, ...lineCtrls(line), line.to];
    const poly = catmullRom(pts, 24);
    if (poly.length < 2) return poly[0] || startN;
    let total = 0; const seg: number[] = [];
    for (let i = 1; i < poly.length; i++) { const d = Math.hypot(poly[i].x - poly[i - 1].x, poly[i].y - poly[i - 1].y); seg.push(d); total += d; }
    if (total === 0) return poly[0];
    let target = t * total;
    for (let i = 0; i < seg.length; i++) {
      if (target <= seg[i] || i === seg.length - 1) { const f = seg[i] ? target / seg[i] : 0; return { x: poly[i].x + (poly[i + 1].x - poly[i].x) * f, y: poly[i].y + (poly[i + 1].y - poly[i].y) * f }; }
      target -= seg[i];
    }
    return poly[poly.length - 1];
  };

  const actionDurationMs = (l: Line) => (typeof l.duration === 'number' && l.duration > 0 ? l.duration : 1) * 1000;

  // planning des actions d'une phase (relatif au début de la phase), séquencé action par action.
  // "withPrevious" => même start que l'action précédente ; sinon démarre après la précédente.
  const buildPhaseActionSched = (phaseIdx: number): ActSched[] => {
    const ph = phasesRef.current[phaseIdx]; if (!ph) return [];
    const res: ActSched[] = [];
    let prevStart = 0, prevDur = 0;
    orderedActions(ph).forEach((l, j) => {
      const dur = actionDurationMs(l);
      const start = j === 0 ? 0 : (l.startMode === 'withPrevious' ? prevStart : prevStart + prevDur);
      res.push({ line: l, start, dur, end: start + dur });
      prevStart = start; prevDur = dur;
    });
    return res;
  };
  const phaseSpanMs = (phaseIdx: number, actSched: ActSched[]): number =>
    (actSched.length ? actSched.reduce((mx, a) => Math.max(mx, a.end), 0) : phaseDuration(phasesRef.current[phaseIdx]) * 1000);

  // Planning global (ms, à 1x) depuis startPhase : phases enchaînées, actions séquencées dans chaque phase.
  const buildSchedule = (startPhase: number): Sched[] => {
    const phs = phasesRef.current;
    const sched: Sched[] = [];
    let prevStart = 0, prevSpan = 0;
    for (let i = startPhase; i < phs.length; i++) {
      const actSched = buildPhaseActionSched(i);
      const span = phaseSpanMs(i, actSched);
      const start = i === startPhase ? 0 : (phaseStartMode(phs[i]) === 'withPrevious' ? prevStart : prevStart + prevSpan);
      sched.push({ idx: i, start, span, end: start + span, actSched });
      prevStart = start; prevSpan = span;
    }
    return sched;
  };

  // position d'un joueur DANS une phase à l'instant local (ms) — chaîne ses déplacements action par action.
  // Chaque action part de la position du joueur AU DÉBUT de cette action (jamais sa position finale globale).
  const phasePlayerPosAt = (s: Sched, playerId: string, local: number): Pt | null => {
    const ph = phasesRef.current[s.idx]; if (!ph) return null;
    const pl = ph.players.find((p) => p.id === playerId);
    let pos: Pt | null = pl ? { x: pl.x, y: pl.y } : null;
    const moves = s.actSched.filter((a) => MOVE_KINDS.includes(a.line.action) && a.line.sourcePlayerId === playerId);
    for (const a of moves) {
      if (local >= a.end) { pos = { ...a.line.to }; continue; }   // action terminée
      if (local >= a.start) return actionPointN(pos || a.line.from, a.line, ease((local - a.start) / a.dur)); // action en cours
      break; // action pas encore démarrée
    }
    return pos;
  };

  // joueurs (dédupliqués par id) présents dans les phases planifiées
  const buildRoster = (sched: Sched[]): Player[] => {
    const seen: Record<string, Player> = {};
    sched.forEach((s) => phasesRef.current[s.idx].players.forEach((p) => { if (!seen[p.id]) seen[p.id] = p; }));
    return Object.values(seen);
  };

  // dernière phase démarrée à l'instant clock (pour l'affichage trajectoires/objets + vignette)
  const currentScheduledIdx = (sched: Sched[], clock: number): number => {
    let best = sched.length ? sched[0].idx : currentRef.current; let bestStart = -1;
    sched.forEach((s) => { if (s.start <= clock && s.start >= bestStart) { bestStart = s.start; best = s.idx; } });
    return best;
  };

  // position globale d'un joueur à l'instant clock
  const playerPosAtClock = (sched: Sched[], playerId: string, clock: number): Pt | null => {
    let chosen: Sched | null = null; let chosenStart = -1;
    for (const s of sched) {
      if (!phasesRef.current[s.idx].players.some((p) => p.id === playerId)) continue;
      if (s.start <= clock && s.start >= chosenStart) { chosenStart = s.start; chosen = s; }
    }
    if (!chosen) {
      for (const s of sched) { const pl = phasesRef.current[s.idx].players.find((p) => p.id === playerId); if (pl) return { x: pl.x, y: pl.y }; }
      return null;
    }
    return phasePlayerPosAt(chosen, playerId, clock - chosen.start);
  };

  // évènements ballon (passe/tir) sur la timeline globale, avec fenêtres absolues (action par action)
  const buildBallEvents = (sched: Sched[]) => {
    const evs: {
      src: string | null;
      target: string | null;
      shoot: boolean;
      wStart: number;
      wEnd: number;
      from?: Pt;
      to?: Pt;
      tMode?: 'player' | 'playerCurrentPoint';
      createdPt?: Pt;
    }[] = [];

    sched.forEach((s) =>
      s.actSched.forEach((a) => {
        if (a.line.action !== 'pass' && a.line.action !== 'shoot') return;

        evs.push({
          src: a.line.sourcePlayerId || null,
          target: a.line.targetPlayerId || null,
          shoot: a.line.action === 'shoot',
          wStart: s.start + a.start,
          wEnd: s.start + a.end,
          from: a.line.from,
          to: a.line.to,
          tMode: a.line.targetMode,
          createdPt: a.line.createdTargetPoint,
        });
      })
    );

    evs.sort((a, b) => a.wStart - b.wStart || a.wEnd - b.wEnd);
    return evs;
  };

  const initialCarrier = (sched: Sched[]): string | null => {
    const firstStart = sched.length ? Math.min(...sched.map((s) => s.start)) : 0;

    for (const s of sched) {
      if (s.start !== firstStart) continue;
      const c = phasesRef.current[s.idx].players.find((p) => playerBallCount(p) > 0);
      if (c) return c.id;
    }

    return null;
  };

  const initialBallOwners = (sched: Sched[]): Map<string, number> => {
    const owners = new Map<string, number>();
    if (!sched.length) return owners;

    const firstStart = Math.min(...sched.map((s) => s.start));

    sched.forEach((s) => {
      if (s.start !== firstStart) return;
      phasesRef.current[s.idx].players.forEach((p) => {
        const count = playerBallCount(p);
        if (count > 0) owners.set(p.id, Math.min(2, Math.max(owners.get(p.id) || 0, count)));
      });
    });

    return owners;
  };

  // Position des ballons à l'instant clock.
  // Règle importante :
  // - un joueur qui FAIT une passe perd son ballon dès le départ de la passe ;
  // - le receveur ne récupère le ballon qu'à la fin de la passe ;
  // - on ne se base pas sur `p.hasBall` des phases suivantes, sinon le receveur
  //   affiche déjà un ballon avant de l'avoir reçu.
  const ballsPosAtClock = (
    sched: Sched[],
    evs: typeof ballEventsRef.current,
    clock: number
  ): Pt[] => {
    const balls: Pt[] = [];
    const owners = initialBallOwners(sched);

    const activeEvents = evs.filter((e) => clock >= e.wStart && clock < e.wEnd);
    const endedEvents = evs.filter((e) => e.wEnd <= clock);

    // Applique tous les transferts terminés avant l'instant courant.
    endedEvents.forEach((e) => {
      if (e.src) removeOwnerBall(owners, e.src);

      if (!e.shoot && e.target) {
        addOwnerBall(owners, e.target);
      }
    });

    // Dès qu'une passe/tir démarre, le porteur n'a plus le ballon sur lui.
    activeEvents.forEach((e) => {
      if (e.src) removeOwnerBall(owners, e.src);
    });

    // Ballons attachés aux joueurs réellement porteurs à cet instant.
    owners.forEach((count, ownerId) => {
      const pos = playerPosAtClock(sched, ownerId, clock);
      if (!pos) return;
      for (let i = 0; i < count; i += 1) {
        balls.push(offsetBallPoint(pos, i, count));
      }
    });

    // Ballons en vol : passe ou tir actif.
    activeEvents.forEach((active) => {
      const from = active.src
        ? playerPosAtClock(sched, active.src, clock)
        : active.from || null;

      if (!from) return;

      let target: Pt;

      if (active.shoot) {
        target = basketFor(courtRef.current, from);
      } else if (active.target) {
        target =
          playerPosAtClock(sched, active.target, clock) ||
          active.createdPt ||
          active.to ||
          from;
      } else {
        target = active.to || from;
      }

      const duration = Math.max(1, active.wEnd - active.wStart);
      const te = ease(Math.min(1, Math.max(0, (clock - active.wStart) / duration)));
      const arc = Math.sin(te * Math.PI) * 0.05;

      balls.push({
        x: from.x + (target.x - from.x) * te,
        y: from.y + (target.y - from.y) * te - arc,
      });
    });

    return balls;
  };

  const renderAnimFrame = (clock: number) => {
    const sched = scheduleRef.current;
    const players: Record<string, Pt> = {};
    rosterRef.current.forEach((p) => { const pos = playerPosAtClock(sched, p.id, clock); if (pos) players[p.id] = pos; });
    const balls = ballsPosAtClock(sched, ballEventsRef.current, clock);
animPosRef.current = { players, balls };
    const ci = currentScheduledIdx(sched, clock);
    if (currentRef.current !== ci) setCurrent(ci);
    render();
  };

  const finishAnim = () => {
    playingRef.current = false; setIsPlaying(false);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    renderAnimFrame(totalMsRef.current); // fige les positions finales
    animPosRef.current = null;
    setCurrent(phasesRef.current.length - 1);
    if (tlBarRef.current) tlBarRef.current.style.width = '100%';
    render();
    const cb = onAnimEndRef.current; onAnimEndRef.current = null; if (cb) cb();
  };

  const tick = (now: number) => {
    if (!playingRef.current) return;
    const dt = now - lastNowRef.current; lastNowRef.current = now;
    clockRef.current += dt * speedRef.current;
    const clock = clockRef.current;
    if (clock >= totalMsRef.current) { finishAnim(); return; }
    renderAnimFrame(clock);
    if (tlBarRef.current) tlBarRef.current.style.width = (totalMsRef.current ? (clock / totalMsRef.current) * 100 : 0) + '%';
    rafRef.current = requestAnimationFrame(tick);
  };

  const playAnim = () => {
    const phs = phasesRef.current;
    if (!phs.length) return;
    const hasAction = phs.some((p) => p.lines.some((l) => MOVE_KINDS.includes(l.action) || BALL_KINDS.includes(l.action)));
    if (!hasAction && phs.length < 2) { showHint('Crée des actions ou des phases pour animer'); return; }
    const start = (currentRef.current >= phs.length - 1 && currentRef.current > 0) ? 0 : currentRef.current;
    const sched = buildSchedule(start);
    if (!sched.length) { showHint('Rien à animer'); return; }
    scheduleRef.current = sched;
    totalMsRef.current = sched.reduce((mx, s) => Math.max(mx, s.end), 0);
    rosterRef.current = buildRoster(sched);
    ballEventsRef.current = buildBallEvents(sched);
    carrier0Ref.current = initialCarrier(sched);
    clockRef.current = 0; lastNowRef.current = performance.now();
    setSelection([]); setEditingId(null);
    playingRef.current = true; setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  };
  const pauseAnim = () => {
    playingRef.current = false; setIsPlaying(false);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
  };
  const resumeAnim = () => {
    if (!scheduleRef.current.length || clockRef.current >= totalMsRef.current) { playAnim(); return; }
    lastNowRef.current = performance.now();
    playingRef.current = true; setIsPlaying(true);
    rafRef.current = requestAnimationFrame(tick);
  };
  const togglePlay = () => {
    if (playingRef.current) pauseAnim();
    else if (animPosRef.current) resumeAnim();
    else playAnim();
  };
  const stopAnim = () => {
    playingRef.current = false; setIsPlaying(false);
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    animPosRef.current = null; clockRef.current = 0;
    if (tlBarRef.current) tlBarRef.current.style.width = '0%';
    render();
  };
  const seekPhaseTL = (i: number) => {
    stopAnim();
    setCurrent(Math.max(0, Math.min(phasesRef.current.length - 1, i)));
    setSelection([]);
  };
  // nettoyage de la boucle d'animation
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // ----------------------- Effets : chargement des images de terrain -----------------------
  useEffect(() => {
    const w = window as unknown as { MYBASKET_DEMI_URL?: string; MYBASKET_FULL_URL?: string };
    const demiUrl = MYBASKET_DEMI_URL || w.MYBASKET_DEMI_URL || '';
    const fullUrl = MYBASKET_FULL_URL || w.MYBASKET_FULL_URL || '';
    const demi = new Image();
    demi.onload = () => { readyRef.current.demi = true; render(); };
    demi.src = demiUrl; demiImgRef.current = demi;
    const full = new Image();
    full.onload = () => { readyRef.current.full = true; render(); };
    full.src = fullUrl; fullImgRef.current = full;
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    phasesRef.current = phases; currentRef.current = current; courtRef.current = courtType; selectionRef.current = selection;
    render();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phases, current, courtType, selection]);

  // Raccourcis clavier : Undo/Redo, suppression, rotation (r / Shift+r), z-order ( [ ] et Shift pour 1er/arrière-plan )
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) redo(); else undo(); }
      else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
      else if (e.key === 'Delete' || e.key === 'Backspace') { if (selectionRef.current.length) { e.preventDefault(); deleteSelected(); } }
      else if (selectionRef.current.length && e.key.toLowerCase() === 'r') { e.preventDefault(); rotateSelected(e.shiftKey ? -15 : 15); }
      else if (selectionRef.current.length && e.key === ']') { e.preventDefault(); reorder(e.shiftKey ? 'front' : 'fwd'); }
      else if (selectionRef.current.length && e.key === '[') { e.preventDefault(); reorder(e.shiftKey ? 'back' : 'bwd'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phases, current, selection, past, future]);

  // ----------------------- Pointeur -----------------------
  const getN = (e: React.PointerEvent): Pt => {
    const c = canvasRef.current!; const rect = c.getBoundingClientRect();
    const px = { x: ((e.clientX - rect.left) / rect.width) * c.width, y: ((e.clientY - rect.top) / rect.height) * c.height };
    return toNc(c, px); // coordonnée relative au terrain affiché (0..1, centre = 0.5)
  };
  const getPx = (e: React.PointerEvent): Pt => {
    const c = canvasRef.current!; const rect = c.getBoundingClientRect();
    return { x: ((e.clientX - rect.left) / rect.width) * c.width, y: ((e.clientY - rect.top) / rect.height) * c.height };
  };
  const updatePhase = (mut: (ph: Phase) => Phase) =>
    setPhases((prev) => prev.map((ph, i) => (i === current ? mut(ph) : ph)));

  // ---- édition joueur (modale) ----
  const editingPlayer = editingId ? (phases[current]?.players.find((z) => z.id === editingId) || null) : null;
  const updatePlayer = (id: string, patch: Partial<Player>) =>
    updatePhase((ph) => ({ ...ph, players: ph.players.map((z) => (z.id === id ? { ...z, ...patch } : z)) }));
  const giveBall = (id: string) => {
    pushHistory();

    updatePhase((ph) => ({
      ...ph,
      players: ph.players.map((z) => {
        if (z.id !== id) return z;

        // Cycle au clic : 0 ballon → 1 ballon → 2 ballons → 0 ballon.
        const nextCount = (playerBallCount(z) + 1) % 3;
        return { ...z, ...ballPatch(nextCount) };
      }),
    }));
  };
  const removeBall = (id: string) => { pushHistory(); updatePlayer(id, ballPatch(0)); };
  const deletePlayerById = (id: string) => {
    pushHistory();
    updatePhase((ph) => ({ ...ph, players: ph.players.filter((z) => z.id !== id) }));
    setEditingId(null); setSelection([]);
  };
  const duplicatePlayerById = (id: string) => {
    pushHistory();
    updatePhase((ph) => {
      const o = ph.players.find((z) => z.id === id); if (!o) return ph;
      return { ...ph, players: [...ph.players, { ...o, id: uid(), x: Math.min(0.97, o.x + 0.04), y: Math.min(0.97, o.y + 0.04), hasBall: false, ballCount: 0 }] };
    });
  };
  const onPhotoFile = (id: string, file?: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => { pushHistory(); updatePlayer(id, { photo: String(reader.result) }); };
    reader.readAsDataURL(file);
  };
  const openPlayerAt = (canvas: HTMLCanvasElement, P: Pt) => {
    const ph = phases[current]; if (!ph) return;
    const thr = cs(canvas) * 0.024;
    for (let i = ph.players.length - 1; i >= 0; i--) {
      const p = ph.players[i]; const c = toPx(canvas, { x: p.x, y: p.y });
      if (Math.hypot(P.x - c.x, P.y - c.y) < thr * (p.size || 1) * 1.3) {
        setSelection([{ type: 'player', id: p.id }]); setEditingId(p.id); setLinkOpen(false); return;
      }
    }
  };
  const onDoubleClick = (e: React.MouseEvent) => {
    const canvas = canvasRef.current; if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const P = { x: ((e.clientX - rect.left) / rect.width) * canvas.width, y: ((e.clientY - rect.top) / rect.height) * canvas.height };
    // double-clic sur un point de contrôle d'une trajectoire sélectionnée → suppression du point
    const lh = lineHandles(canvas);
    if (lh) {
      for (let k = 0; k < lh.ctrls.length; k++) {
        if (Math.hypot(P.x - lh.ctrls[k].x, P.y - lh.ctrls[k].y) < 16) {
          pushHistory();
          setPhases((prev) => prev.map((p, i) => {
            if (i !== currentRef.current) return p;
            return { ...p, lines: p.lines.map((z) => { if (z.id !== lh.id) return z; const cur = (z.ctrls ?? (z.ctrl ? [z.ctrl] : [])).slice(); cur.splice(k, 1); return { ...z, ctrls: cur.length ? cur : undefined, ctrl: undefined }; }) };
          }));
          return;
        }
      }
    }
    openPlayerAt(canvas, P);
  };

  // ---- Association à un joueur réel des équipes ----
  // TODO Supabase : remplacer le corps par un fetch des joueurs des équipes de l'utilisateur.
  const getTeamPlayers = (): TeamPlayer[] => {
  try {
    const raw = localStorage.getItem("mybasket_teams");
    if (!raw) return [];

    const data = JSON.parse(raw);
    const teams = Array.isArray(data) ? data : data.teams || data.equipes || [];

    const out: TeamPlayer[] = [];

    for (const tm of teams) {
      const teamId = String(tm.id ?? tm.teamId ?? "");
      const teamName = String(tm.name ?? tm.teamName ?? tm.nom ?? "Équipe");
      const players = tm.players ?? tm.joueurs ?? [];

      for (const pl of players) {
        if (pl.archived || pl.deleted || pl.isDeleted) continue;

        out.push({
          id: String(pl.id ?? `${teamId}-${pl.name ?? pl.nom}`),
          name: String(pl.name ?? pl.nom ?? ""),
          number:
            pl.number != null
              ? String(pl.number)
              : pl.numero != null
                ? String(pl.numero)
                : undefined,
          photo: pl.photo ?? pl.avatar ?? undefined,
          position: pl.position ?? pl.poste ?? undefined,
          teamId,
          teamName,
          color: pl.color ?? tm.color ?? undefined,
        });
      }
    }

    return out.filter((p) => p.name.trim() !== "");
  } catch {
    return [];
  }
};
  const openLinkPanel = () => {
  setTeamPlayers(getTeamPlayers());
  setLinkQuery("");
  setLinkOpen(true);
};
  const applyLink = (tp: TeamPlayer) => {
    if (!editingId) return;
    pushHistory();
    updatePlayer(editingId, {
      name: tp.name || undefined,
      label: tp.number || (editingPlayer ? editingPlayer.label : ''),
      photo: tp.photo || (editingPlayer ? editingPlayer.photo : undefined),
      color: tp.color || (editingPlayer ? editingPlayer.color : undefined),
      linkedPlayerId: tp.id,
      linkedPlayerName: tp.name,
      linkedTeamId: tp.teamId,
      linkedTeamName: tp.teamName,
    });
    setLinkOpen(false);
  };
  const unlinkPlayer = (id: string) => {
    pushHistory();
    updatePlayer(id, { linkedPlayerId: undefined, linkedPlayerName: undefined, linkedTeamId: undefined, linkedTeamName: undefined });
  };


  const hitTest = (canvas: HTMLCanvasElement, P: Pt): Sel => {
    const ph = phasesRef.current[currentRef.current]; if (!ph) return null;
    const scale = cs(canvas);
    const distSeg = (p: Pt, a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y; const L = dx * dx + dy * dy || 1; let tt = ((p.x - a.x) * dx + (p.y - a.y) * dy) / L; tt = Math.max(0, Math.min(1, tt)); return Math.hypot(p.x - (a.x + tt * dx), p.y - (a.y + tt * dy)); };
    for (let i = ph.players.length - 1; i >= 0; i--) { const p = ph.players[i]; const c = toPx(canvas, { x: p.x, y: p.y }); if (Math.hypot(P.x - c.x, P.y - c.y) < scale * 0.024 * 1.25) return { type: 'player', id: p.id }; }
    for (let i = ph.objects.length - 1; i >= 0; i--) {
      const o = ph.objects[i];

      if (
        (o.kind === 'triangle' || o.kind === 'square') &&
        Array.isArray(o.points)
      ) {
        const polygon = o.points.map((point) => toPx(canvas, point));
        let inside = false;

        for (
          let a = 0, b = polygon.length - 1;
          a < polygon.length;
          b = a++
        ) {
          const pa = polygon[a];
          const pb = polygon[b];
          const intersects =
            pa.y > P.y !== pb.y > P.y &&
            P.x <
              ((pb.x - pa.x) * (P.y - pa.y)) /
                ((pb.y - pa.y) || 0.00001) +
                pa.x;
          if (intersects) inside = !inside;
        }

        if (inside) return { type: 'object', id: o.id };

        for (let a = 0; a < polygon.length; a++) {
          const b = (a + 1) % polygon.length;
          if (distSeg(P, polygon[a], polygon[b]) < 12) {
            return { type: 'object', id: o.id };
          }
        }

        continue;
      }

      const c = toPx(canvas, { x: o.x, y: o.y });
      const rotation = -((o.rotation || 0) * Math.PI) / 180;
      const dx = P.x - c.x;
      const dy = P.y - c.y;
      const localX = dx * Math.cos(rotation) - dy * Math.sin(rotation);
      const localY = dx * Math.sin(rotation) + dy * Math.cos(rotation);
      const base = scale * 0.018 * (o.size || 1);
      const halfW = base * (o.scaleX || 1) * 1.55;
      const halfH = base * (o.scaleY || 1) * 1.55;
      if (Math.abs(localX) <= halfW && Math.abs(localY) <= halfH) {
        return { type: 'object', id: o.id };
      }
    }
    for (let i = ph.lines.length - 1; i >= 0; i--) {
      const l = ph.lines[i];
      if (l.action === 'freedraw' && l.points) { for (const q of l.points) { const c = toPx(canvas, q); if (Math.hypot(P.x - c.x, P.y - c.y) < 9) return { type: 'line', id: l.id }; } continue; }
      const poly = linePoly(canvas, l);
      for (let k = 1; k < poly.length; k++) { if (distSeg(P, poly[k - 1], poly[k]) < 9) return { type: 'line', id: l.id }; }
    }
    return null;
  };

  const startMove = (n: Pt, sel: SelItem[]) => {
    const ph = phases[current]; if (!ph) return;
    const orig = new Map<string, Player | Obj | Line>();
    sel.forEach((s) => {
      const arr = s.type === 'player' ? ph.players : s.type === 'object' ? ph.objects : ph.lines;
      const el = (arr as { id: string }[]).find((z) => z.id === s.id);
      if (el) orig.set(s.id, JSON.parse(JSON.stringify(el)));
    });
    if (!orig.size) return;
    moveStartRef.current = { start: n, orig }; movingRef.current = true; histPushedRef.current = false;
  };

  // appui long → ajout d'un point de contrôle (ms ajustable ; >600 pour éviter les ajouts accidentels)
  const LONGPRESS_MS = 700;
  const MOVE_TOL_PX = 10;
  const fireLongPress = () => {
    const pr = pressRef.current; if (!pr || pr.moved || pr.longFired) return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ph = phasesRef.current[currentRef.current]; if (!ph) return;
    const l = ph.lines.find((z) => z.id === pr.lineId); if (!l || l.action === 'freedraw') return;
    const rot = ((l.rotation || 0) * Math.PI) / 180;
    const useRot = !!rot && !(l.action === 'shoot' && l.target === 'basket');
    // index du segment cliqué (sur la chaîne de waypoints affichée, donc en repère pivoté)
    const g = lineGeom(canvas, l);
    const way = [g.f, ...g.ctrls, g.t];
    const mid = { x: (g.f.x + g.t.x) / 2, y: (g.f.y + g.t.y) / 2 };
    const distSeg = (p: Pt, a: Pt, b: Pt) => { const dx = b.x - a.x, dy = b.y - a.y; const Lsq = dx * dx + dy * dy || 1; let tt = ((p.x - a.x) * dx + (p.y - a.y) * dy) / Lsq; tt = Math.max(0, Math.min(1, tt)); return Math.hypot(p.x - (a.x + tt * dx), p.y - (a.y + tt * dy)); };
    let k = 0, best = Infinity;
    for (let i = 0; i < way.length - 1; i++) { const d = distSeg(pr.startPx, way[i], way[i + 1]); if (d < best) { best = d; k = i; } }
    // position du nouveau point en repère NON pivoté (la rotation est ré-appliquée au dessin), puis normalisée au terrain
    const unrot = (p: Pt) => { if (!useRot) return p; const dx = p.x - mid.x, dy = p.y - mid.y; return { x: mid.x + dx * Math.cos(-rot) - dy * Math.sin(-rot), y: mid.y + dx * Math.sin(-rot) + dy * Math.cos(-rot) }; };
    const cN = toNc(canvas, unrot(pr.startPx));
    pushHistory();
    setPhases((prev) => prev.map((p, i) => {
      if (i !== currentRef.current) return p;
      return { ...p, lines: p.lines.map((z) => { if (z.id !== l.id) return z; const cur = z.ctrls ?? (z.ctrl ? [z.ctrl] : []); const next = cur.slice(); next.splice(k, 0, cN); return { ...z, ctrls: next, ctrl: undefined }; }) };
    }));
    setSelection([{ type: 'line', id: l.id }]);
    lineDragRef.current = { id: l.id, which: 'ctrl', index: k };
    pr.longFired = true; histPushedRef.current = true; // historique déjà empilé
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const canvas = canvasRef.current; if (!canvas) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    const n = getN(e);

    // mode placement séquentiel
    if (placeMode) {
      pushHistory();
      const num = (placeIdx % 5) + 1;
      const pl: Player = placeMode === 'att'
        ? { id: uid(), x: n.x, y: n.y, label: String(num), team: 'att', shape: 'circle', rotation: 0 }
        : { id: uid(), x: n.x, y: n.y, label: 'X' + num, team: 'def', shape: 'circle', rotation: 0 };
      updatePhase((ph) => ({ ...ph, players: [...ph.players, pl] }));
      setPlaceIdx((i) => i + 1);
      return;
    }

    // outil Sélection → poignées de courbe / rotation / sélection / multi / déplacement / appui long
    if (tool.kind === 'action' && tool.action === 'select') {
      const P = getPx(e);
      // 1) poignées d'édition de la trajectoire sélectionnée (contrôle indexé / départ / arrivée)
      const lh = lineHandles(canvas);
      if (lh) {
        const near = (pt: Pt) => Math.hypot(P.x - pt.x, P.y - pt.y) < 16;
        for (let k = 0; k < lh.ctrls.length; k++) { if (near(lh.ctrls[k])) { lineDragRef.current = { id: lh.id, which: 'ctrl', index: k }; histPushedRef.current = false; return; } }
        if (!lh.isShoot && near(lh.t)) { lineDragRef.current = { id: lh.id, which: 'to' }; histPushedRef.current = false; return; }
        if (near(lh.f)) { lineDragRef.current = { id: lh.id, which: 'from' }; histPushedRef.current = false; return; }
      }
      // 2) poignées placées sur les vrais sommets
      const resizeHandles = getResizeHandles(canvas);
      if (resizeHandles) {
        const vertexIndex = resizeHandles.points.findIndex(
          (handle) => Math.hypot(P.x - handle.x, P.y - handle.y) < 18
        );

        if (vertexIndex >= 0) {
          resizingRef.current = true;
          resizeStartRef.current = {
            id: resizeHandles.id,
            mode: resizeHandles.mode,
            vertexIndex,
            center:
              resizeHandles.mode === 'box'
                ? { x: resizeHandles.cx, y: resizeHandles.cy }
                : undefined,
            rotation:
              resizeHandles.mode === 'box'
                ? resizeHandles.rotation
                : undefined,
            baseRadius:
              resizeHandles.mode === 'box'
                ? Math.max(1, resizeHandles.baseRadius)
                : undefined,
          };
          histPushedRef.current = false;
          return;
        }
      }

      // 3) poignée de rotation (joueur / objet)
      const g = getSelGeom(canvas);
      if (g && Math.hypot(P.x - g.hx, P.y - g.hy) < 13) { rotatingRef.current = true; rotCenterRef.current = { x: g.cx, y: g.cy }; histPushedRef.current = false; return; }
      const hit = hitTest(canvas, P);
      if (e.shiftKey) {
        if (hit) setSelection((prev) => (prev.some((s) => s.type === hit.type && s.id === hit.id) ? prev.filter((s) => !(s.type === hit.type && s.id === hit.id)) : [...prev, hit]));
        return;
      }
      if (hit && hit.type === 'line') {
        // sélection immédiate + armement appui long (ajout d'un point de contrôle)
        if (!selection.some((s) => s.type === 'line' && s.id === hit.id)) setSelection([hit]);
        pressRef.current = { lineId: hit.id, startN: n, startPx: P, moved: false, longFired: false };
        if (pressTimerRef.current) window.clearTimeout(pressTimerRef.current);
        pressTimerRef.current = window.setTimeout(fireLongPress, LONGPRESS_MS);
        return;
      }
      if (hit) {
        const already = selection.some((s) => s.type === hit.type && s.id === hit.id);
        const sel = already ? selection : [hit];
        if (!already) setSelection(sel);
        startMove(n, sel);
        return;
      }
      setSelection([]);
      return;
    }

    if (tool.kind === 'player') {
      pushHistory();
      updatePhase((ph) => ({ ...ph, players: [...ph.players, { id: uid(), x: n.x, y: n.y, label: tool.label, team: tool.team, shape: tool.shape, coach: tool.coach, rotation: 0 }] }));
      return;
    }
    if (tool.kind === 'object') {
      if (tool.obj === 'text') {
        const v = window.prompt('Texte à afficher :', '');
        if (v && v.trim()) { pushHistory(); updatePhase((ph) => ({ ...ph, objects: [...ph.objects, { id: uid(), x: n.x, y: n.y, kind: 'text', text: v.trim(), rotation: 0 }] })); }
        return;
      }
      if (tool.obj === 'freedraw') {
        dragRef.current = { id: uid(), action: 'freedraw', from: n, to: n, points: [n], rotation: 0 };
        drawingRef.current = true; histPushedRef.current = false; render(); return;
      }
      pushHistory();
      updatePhase((ph) => {
        if (tool.obj !== 'handoff') {
          return { ...ph, objects: [...ph.objects, { id: uid(), x: n.x, y: n.y, kind: tool.obj, rotation: 0, size: 1, color: '#0F0F12' }] };
        }

        // Un H placé entre deux attaquants représente un main à main.
        // On relie automatiquement les deux joueurs les plus proches du symbole et
        // on transfère le ballon du porteur vers son partenaire.
        const nearest = ph.players
          .filter((player) => player.team === 'att' && !player.coach)
          .map((player) => ({ player, distance: Math.hypot(player.x - n.x, player.y - n.y) }))
          .sort((a, b) => a.distance - b.distance)
          .slice(0, 2)
          .map((entry) => entry.player);

        let sourcePlayerId: string | undefined;
        let targetPlayerId: string | undefined;
        let nextPlayers = ph.players;

        if (nearest.length === 2) {
          const [first, second] = nearest;
          const firstHasBall = playerBallCount(first) > 0;
          const secondHasBall = playerBallCount(second) > 0;
          const source = firstHasBall ? first : secondHasBall ? second : first;
          const target = source.id === first.id ? second : first;
          sourcePlayerId = source.id;
          targetPlayerId = target.id;

          nextPlayers = ph.players.map((player) => {
            if (player.id === source.id) return { ...player, hasBall: false, ballCount: 0 };
            if (player.id === target.id) return { ...player, hasBall: true, ballCount: Math.max(1, playerBallCount(player)) };
            return player;
          });

          showHint(`Main à main : ballon transféré de ${source.label} vers ${target.label}`);
        } else {
          showHint('Place le H entre deux attaquants pour créer le main à main');
        }

        return {
          ...ph,
          players: nextPlayers,
          objects: [...ph.objects, { id: uid(), x: n.x, y: n.y, kind: 'handoff', rotation: 0, size: 1, color: '#0F0F12', sourcePlayerId, targetPlayerId }],
        };
      });
      return;
    }
    // « Donner ballon » : cliquer sur un joueur → associe/retire un ballon à ce joueur (multi-ballons)
    if (tool.kind === 'action' && tool.action === 'giveball') {
      const hit = hitTest(canvas, getPx(e));
      if (hit && hit.type === 'player') { giveBall(hit.id); setSelection([hit]); }
      else showHint('Clique sur un joueur pour lui donner le ballon');
      return;
    }
    if (tool.kind === 'action' && tool.action !== 'select') {
      const ph = phases[current]; if (!ph) return;
      // joueur source = joueur sélectionné (unique) sinon joueur sous le curseur
      let sourceId = (selection.length === 1 && selection[0].type === 'player') ? selection[0].id : null;
      if (!sourceId) { const h = hitTest(canvas, getPx(e)); if (h && h.type === 'player') { sourceId = h.id; setSelection([h]); } }
      if (!sourceId) { showHint('Sélectionne d’abord un joueur'); return; }
      // logique ballon : dribble / passe / tir exigent le ballon ; cut / écran exigent de NE PAS l'avoir
      if ((tool.action === 'dribble' || tool.action === 'pass' || tool.action === 'shoot') && !playerHasBallAtActionStart(sourceId)) {
        showHint('Ce joueur n’a pas le ballon'); return;
      }
      // départ ancré au joueur (sa position OU la fin de sa dernière action), jamais le point cliqué
      const startN = getPlayerCurrentPoint(sourceId) || n;
      const isShoot = tool.action === 'shoot';
      const existingActions = orderedActions(ph);
      const hasBallAtPhaseStart = ph.players.some((p) => p.id === sourceId && playerBallCount(p) > 0);
      const isBallAction = tool.action === 'dribble' || tool.action === 'pass' || tool.action === 'shoot';
      // Si le joueur vient de recevoir le ballon dans cette même phase, son action doit s'enchaîner
      // après la passe précédente, sinon elle partirait en même temps que la passe.
      const shouldStartWithPrevious = existingActions.length > 0 && !(isBallAction && !hasBallAtPhaseStart);

      dragRef.current = {
        id: uid(),
        action: tool.action,
        sourcePlayerId: sourceId,
        from: startN,
        to: isShoot ? basketFor(courtType, startN) : n,
        rotation: 0,
        target: isShoot ? 'basket' : undefined,
        order: Date.now(),
        startMode: shouldStartWithPrevious ? 'withPrevious' : 'afterPrevious',
        duration: 1,
      };

      drawingRef.current = true; render();
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    // appui long en attente : si le doigt/souris bouge assez, on annule l'ajout et on passe en déplacement de la trajectoire
    const pr = pressRef.current;
    if (pr && !pr.longFired) {
      const P = getPx(e);
      if (Math.hypot(P.x - pr.startPx.x, P.y - pr.startPx.y) > MOVE_TOL_PX) {
        pr.moved = true;
        if (pressTimerRef.current) { window.clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
        pressRef.current = null;
        startMove(pr.startN, [{ type: 'line', id: pr.lineId }]);
        // on continue vers le bloc de déplacement ci-dessous (movingRef vient d'être armé)
      } else {
        return; // maintenu en place : on attend l'appui long, aucun déplacement
      }
    }
    // édition d'une poignée de trajectoire (départ / arrivée / point de contrôle indexé)
    if (lineDragRef.current) {
      if (!histPushedRef.current) { pushHistory(); histPushedRef.current = true; }
      const n = getN(e); const { id, which, index } = lineDragRef.current;
      setPhases((prev) => prev.map((p, i) => {
        if (i !== currentRef.current) return p;
        return { ...p, lines: p.lines.map((z) => {
          if (z.id !== id) return z;
          if (which === 'from') return { ...z, from: n };
          if (which === 'to') return { ...z, to: n };
          const cur = z.ctrls ?? (z.ctrl ? [z.ctrl] : []);
          const next = cur.slice();
          if (index != null && index < next.length) next[index] = n; else next.push(n);
          return { ...z, ctrls: next, ctrl: undefined };
        }) };
      }));
      return;
    }
    // déplacement libre d'un sommet du triangle/carré
    if (resizingRef.current && resizeStartRef.current) {
      if (!histPushedRef.current) {
        pushHistory();
        histPushedRef.current = true;
      }

      const start = resizeStartRef.current;
      const pointerN = getN(e);

      setPhases((prev) =>
        prev.map((phase, index) => {
          if (index !== currentRef.current) return phase;

          return {
            ...phase,
            objects: phase.objects.map((object) => {
              if (object.id !== start.id) return object;

              if (
                start.mode === 'vertex' &&
                start.vertexIndex != null &&
                (object.kind === 'triangle' || object.kind === 'square')
              ) {
                const canvas = canvasRef.current;
                if (!canvas) return object;

                const existing =
                  Array.isArray(object.points) && object.points.length >= 3
                    ? object.points.map((point) => ({ ...point }))
                    : (objectPolygonPointsPx(canvas, object) || []).map((point) =>
                        toNc(canvas, point)
                      );

                if (!existing[start.vertexIndex]) return object;

                existing[start.vertexIndex] = {
                  x: Math.max(0, Math.min(1, pointerN.x)),
                  y: Math.max(0, Math.min(1, pointerN.y)),
                };

                const center = existing.reduce(
                  (acc, point) => ({
                    x: acc.x + point.x / existing.length,
                    y: acc.y + point.y / existing.length,
                  }),
                  { x: 0, y: 0 }
                );

                return {
                  ...object,
                  x: center.x,
                  y: center.y,
                  points: existing,
                  rotation: 0,
                  scaleX: 1,
                  scaleY: 1,
                };
              }

              if (
                start.mode === 'box' &&
                start.center &&
                start.rotation != null &&
                start.baseRadius
              ) {
                const P = getPx(e);
                const dx = P.x - start.center.x;
                const dy = P.y - start.center.y;
                const localX =
                  dx * Math.cos(-start.rotation) -
                  dy * Math.sin(-start.rotation);
                const localY =
                  dx * Math.sin(-start.rotation) +
                  dy * Math.cos(-start.rotation);

                return {
                  ...object,
                  scaleX: Math.max(0.02, Math.abs(localX) / start.baseRadius),
                  scaleY: Math.max(0.02, Math.abs(localY) / start.baseRadius),
                };
              }

              return object;
            }),
          };
        })
      );
      return;
    }

    // rotation (sélection unique)
    if (rotatingRef.current && rotCenterRef.current && selectionRef.current.length === 1) {
      if (!histPushedRef.current) { pushHistory(); histPushedRef.current = true; }
      const P = getPx(e); const c = rotCenterRef.current;
      const deg = (Math.atan2(P.y - c.y, P.x - c.x) * 180) / Math.PI + 90;
      const sel = selectionRef.current[0];
      setPhases((prev) => prev.map((p, i) => {
        if (i !== currentRef.current) return p;
        if (sel.type === 'player') return { ...p, players: p.players.map((z) => (z.id === sel.id ? { ...z, rotation: deg } : z)) };
        if (sel.type === 'object') return { ...p, objects: p.objects.map((z) => (z.id === sel.id ? { ...z, rotation: deg } : z)) };
        return { ...p, lines: p.lines.map((z) => (z.id === sel.id ? { ...z, rotation: deg } : z)) };
      }));
      return;
    }
    // déplacement (groupé)
    if (movingRef.current && moveStartRef.current) {
      if (!histPushedRef.current) { pushHistory(); histPushedRef.current = true; }
      const n = getN(e); const { start, orig } = moveStartRef.current; const dx = n.x - start.x, dy = n.y - start.y;
      setPhases((prev) => prev.map((p, i) => {
        if (i !== currentRef.current) return p;
        const mvP = (el: Player | Obj) => {
          const o = orig.get(el.id) as Player | Obj | undefined;
          if (!o) return el;

          const moved = {
            ...el,
            x: Math.max(0, Math.min(1, o.x + dx)),
            y: Math.max(0, Math.min(1, o.y + dy)),
          };

          if ('points' in o && Array.isArray(o.points)) {
            return {
              ...moved,
              points: o.points.map((point) => ({
                x: Math.max(0, Math.min(1, point.x + dx)),
                y: Math.max(0, Math.min(1, point.y + dy)),
              })),
            };
          }

          return moved;
        };
        const mvL = (el: Line) => {
          const o = orig.get(el.id) as Line | undefined; if (!o) return el;
          const oc = o.ctrls ?? (o.ctrl ? [o.ctrl] : []);
          return { ...el, from: { x: o.from.x + dx, y: o.from.y + dy }, to: { x: o.to.x + dx, y: o.to.y + dy }, ctrls: oc.length ? oc.map((c) => ({ x: c.x + dx, y: c.y + dy })) : undefined, ctrl: undefined, points: o.points ? o.points.map((q) => ({ x: q.x + dx, y: q.y + dy })) : undefined };
        };
        return { ...p, players: p.players.map(mvP) as Player[], objects: p.objects.map(mvP) as Obj[], lines: p.lines.map(mvL) };
      }));
      return;
    }
    // tracé en cours
    if (!drawingRef.current || !dragRef.current) return;
    const n = getN(e); const d = dragRef.current;
    if (d.action === 'freedraw' && d.points) d.points.push(n); else d.to = n;
    render();
  };

  const onPointerUp = () => {
    if (pressTimerRef.current) { window.clearTimeout(pressTimerRef.current); pressTimerRef.current = null; }
    pressRef.current = null;
    if (lineDragRef.current) { lineDragRef.current = null; return; }
    if (resizingRef.current) {
      resizingRef.current = false;
      resizeStartRef.current = null;
      return;
    }
    if (rotatingRef.current) { rotatingRef.current = false; rotCenterRef.current = null; return; }
    if (movingRef.current) { movingRef.current = false; moveStartRef.current = null; return; }
    if (drawingRef.current && dragRef.current) {
      const d = dragRef.current;
      const ph = phases[current];
      if (d.action === 'pass') {
        // la passe doit arriver sur un joueur (jeton ou fin de sa dernière action existante), sinon elle n'est pas créée
        const targetId = ph ? findPlayerAt(ph, d.to, d.sourcePlayerId) : null;
        if (!targetId) { showHint('La passe doit arriver sur un joueur'); }
        else if (ph) {
          pushHistory();
          // cible figée = position du joueur cible au moment de la création (ses actions futures ne déplaceront pas la passe)
          const tgt = getPlayerCurrentPoint(targetId) || playerLogicalPosN(ph, targetId) || d.to;
          updatePhase((p) => ({ ...p, lines: [...p.lines, { ...d, to: tgt, targetPlayerId: targetId, targetMode: 'player', createdTargetPoint: tgt }] }));
        }
      } else {
        const ok = d.action === 'freedraw' ? (d.points!.length > 1) : d.action === 'shoot' ? true : (Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y) > 0.01);
        if (ok) { pushHistory(); updatePhase((p) => ({ ...p, lines: [...p.lines, d] })); }
      }
    }
    drawingRef.current = false; dragRef.current = null; render();
  };

  // ----------------------- Sélection : rotation / suppr / dup / z-order -----------------------
  const rotateSelected = (delta: number) => {
    if (!selection.length) return;
    pushHistory();
    const has = (t: string, id: string) => selection.some((s) => s.type === t && s.id === id);
    setPhases((prev) => prev.map((p, i) => {
      if (i !== current) return p;
      return {
        ...p,
        players: p.players.map((z) => (has('player', z.id) ? { ...z, rotation: (z.rotation || 0) + delta } : z)),
        objects: p.objects.map((z) => (has('object', z.id) ? { ...z, rotation: (z.rotation || 0) + delta } : z)),
        lines: p.lines.map((z) => (has('line', z.id) ? { ...z, rotation: (z.rotation || 0) + delta } : z)),
      };
    }));
  };
  const deleteSelected = () => {
    if (!selection.length) return;
    pushHistory();
    const has = (t: string, id: string) => selection.some((s) => s.type === t && s.id === id);
    setPhases((prev) => prev.map((p, i) => {
      if (i !== current) return p;
      return {
        ...p,
        players: p.players.filter((z) => !has('player', z.id)),
        objects: p.objects.filter((z) => !has('object', z.id)),
        lines: p.lines.filter((z) => !has('line', z.id)),
      };
    }));
    setSelection([]); setEditingId(null);
  };
  const duplicateSelected = () => {
    if (!selection.length) return;
    pushHistory();
    const has = (t: string, id: string) => selection.some((s) => s.type === t && s.id === id);
    const newSel: SelItem[] = [];
    setPhases((prev) => prev.map((p, i) => {
      if (i !== current) return p;
      const np = [...p.players], no = [...p.objects], nl = [...p.lines];
      p.players.forEach((o) => { if (has('player', o.id)) { const id = uid(); np.push({ ...o, id, x: Math.min(0.97, o.x + 0.04), y: Math.min(0.97, o.y + 0.04), hasBall: false, ballCount: 0 }); newSel.push({ type: 'player', id }); } });
      p.objects.forEach((o) => { if (has('object', o.id)) { const id = uid(); no.push({ ...o, id, x: Math.min(0.97, o.x + 0.04), y: Math.min(0.97, o.y + 0.04) }); newSel.push({ type: 'object', id }); } });
      p.lines.forEach((o) => { if (has('line', o.id)) { const id = uid(); const oc = o.ctrls ?? (o.ctrl ? [o.ctrl] : []); nl.push({ ...o, id, from: { x: o.from.x + 0.04, y: o.from.y + 0.04 }, to: { x: o.to.x + 0.04, y: o.to.y + 0.04 }, ctrls: oc.length ? oc.map((c) => ({ x: c.x + 0.04, y: c.y + 0.04 })) : undefined, ctrl: undefined, points: o.points ? o.points.map((q) => ({ x: q.x + 0.04, y: q.y + 0.04 })) : undefined }); newSel.push({ type: 'line', id }); } });
      return { ...p, players: np, objects: no, lines: nl };
    }));
    setSelection(newSel);
  };
  // z-order : réordonne chaque élément sélectionné dans son tableau (front/back/avant/arrière)
  const reorder = (mode: 'front' | 'back' | 'fwd' | 'bwd') => {
    if (!selection.length) return;
    pushHistory();
    const has = (t: string, id: string) => selection.some((s) => s.type === t && s.id === id);
    const reArr = <T extends { id: string }>(arr: T[], t: string): T[] => {
      let a = [...arr];
      const idxs = a.map((el, i) => (has(t, el.id) ? i : -1)).filter((i) => i >= 0);
      if (!idxs.length) return a;
      if (mode === 'front') { const sel = idxs.map((i) => a[i]); a = a.filter((_, i) => !idxs.includes(i)); a = [...a, ...sel]; }
      else if (mode === 'back') { const sel = idxs.map((i) => a[i]); a = a.filter((_, i) => !idxs.includes(i)); a = [...sel, ...a]; }
      else if (mode === 'fwd') { for (let k = idxs.length - 1; k >= 0; k--) { const i = idxs[k]; if (i < a.length - 1) { [a[i], a[i + 1]] = [a[i + 1], a[i]]; } } }
      else { for (let k = 0; k < idxs.length; k++) { const i = idxs[k]; if (i > 0) { [a[i], a[i - 1]] = [a[i - 1], a[i]]; } } }
      return a;
    };
    setPhases((prev) => prev.map((p, i) => (i === current ? { ...p, players: reArr(p.players, 'player'), objects: reArr(p.objects, 'object'), lines: reArr(p.lines, 'line') } : p)));
  };

// ----------------------- Toolbar -----------------------
const clearTerrain = () => {
  pushHistory();
  updatePhase((ph) => ({ ...ph, players: [], objects: [], lines: [] }));
  setSelection([]);
};
const captureAllPhaseImages = async () => {
  const canvas = canvasRef.current;
  if (!canvas) return [];

  const previous = currentRef.current;
  const images: string[] = [];

  for (let i = 0; i < phasesRef.current.length; i++) {
    currentRef.current = i;
    setCurrent(i);

    render();

    await new Promise((resolve) => requestAnimationFrame(resolve));

    try {
      images.push(canvas.toDataURL("image/png"));
    } catch {
      // ignore
    }
  }

  currentRef.current = previous;
  setCurrent(previous);
  render();

  return images;
};
const exportPng = () => {
  render();

  const c = canvasRef.current;
  if (!c) return;

  const a = document.createElement("a");
  a.download = `${title || "play"}.png`;
  a.href = c.toDataURL("image/png");
  a.click();
};

// ----------------------- Mode "exercice" : Plaquette → fiche exercice -----------------------
const LOAD_KEY = "mybasket_plaquette_load";
const GAMEPLAN_PENDING_KEY = "mybasket_gameplan_pending_system";
const GAMEPLAN_RETURN_URL = "/mon-compte?tab=management&module=gameplan";
const SCOUTING_RETURN_URL = "/mon-compte?tab=management&module=gameplan&gamePlanTab=scout";

const markManagementGamePlanReturn = () => {
  try {
    localStorage.setItem("mybasket_account_tab", "management");
    localStorage.setItem("mybasket_mon_compte_tab", "management");
    localStorage.setItem("mybasket_management_tab", "gameplan");
    localStorage.setItem("mybasket_management_module", "gameplan");
    sessionStorage.setItem("mybasket_account_tab", "management");
    sessionStorage.setItem("mybasket_management_module", "gameplan");
  } catch {}
};

const isScoutingReturnContext = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return params.get("scouting") === "1" || !!localStorage.getItem("mybasket_scouting_pending");
};

const isGamePlanReturnContext = () => {
  if (typeof window === "undefined") return false;
  const params = new URLSearchParams(window.location.search);
  return (
    params.get("return") === "game-plan" ||
    params.get("target") === "gameplan" ||
    !!localStorage.getItem(GAMEPLAN_PENDING_KEY)
  );
};

useEffect(() => {
  try {
    setExoInsertMode(!!localStorage.getItem(RETURN_KEY));
    setShootingGridPending(!!localStorage.getItem("mybasket_shooting_grid_pending"));
    setScoutingPending(!!localStorage.getItem("mybasket_scouting_pending"));

    const savedPlay = localStorage.getItem(LOAD_KEY);
    if (!savedPlay) return;

    const data = JSON.parse(savedPlay);

    const loadedPhases = Array.isArray(data.phases) ? data.phases : [];
    const loadedCurrent =
      typeof data.current === "number"
        ? data.current
        : typeof data.phaseIndex === "number"
        ? data.phaseIndex
        : 0;

    const safeCurrent =
      loadedPhases.length > 0
        ? Math.min(Math.max(loadedCurrent, 0), loadedPhases.length - 1)
        : 0;

    if (data.title) setTitle(data.title);

    if (data.courtType === "half" || data.courtType === "full") {
      setCourtType(data.courtType);
      courtRef.current = data.courtType;
    }

    if (data.sheet) setSheet(data.sheet);

    if (loadedPhases.length > 0) {
      phasesRef.current = loadedPhases;
      setPhases(loadedPhases);
    }

    currentRef.current = safeCurrent;
    setCurrent(safeCurrent);

    setSelection([]);
    selectionRef.current = [];
    setPast([]);
    setFuture([]);

    window.setTimeout(() => {
      phasesRef.current = loadedPhases;
      currentRef.current = safeCurrent;

      if (data.courtType === "half" || data.courtType === "full") {
        courtRef.current = data.courtType;
      }

      render();
    }, 200);

    localStorage.removeItem(LOAD_KEY);
  } catch (error) {
    console.error("Erreur chargement plaquette :", error);
    setExoInsertMode(false);
  }
}, []);

// Capture toutes les phases, les upload dans le bucket Storage et construit
// le payload commun à tous les flux : insertion retour + création directe.
// La plaquette ne sauvegarde plus un play isolé : elle alimente toujours
// une fiche Exercice ou une fiche Système.
const buildPlaquetteResult = async (opts: {
  isSysteme: boolean;
  targetId: string;
  schemaGroupId: string;
  editIndex: number | null;
}) => {
  const { isSysteme, targetId, schemaGroupId, editIndex } = opts;

  const phaseImagesBase64 = await captureAllPhaseImages();
  if (phaseImagesBase64.length === 0) throw new Error("Aucune phase capturée");

  const folder = isSysteme
    ? `exercices/systemes-${targetId}/schemas/${schemaGroupId}`
    : `exercices/${targetId}/schemas/${schemaGroupId}`;

  const uploadedUrls: string[] = [];
  for (let i = 0; i < phaseImagesBase64.length; i += 1) {
    const url = await uploadSchemaImage(
      phaseImagesBase64[i],
      folder,
      `phase-${i + 1}.png`
    );
    uploadedUrls.push(url);
  }

  const fullPhases = Array.isArray(phasesRef.current) ? phasesRef.current : [];

  const schemaDataList = uploadedUrls.map((url, phaseIndex) => ({
    title: `${title || "Schéma"} - Phase ${phaseIndex + 1}`,
    schemaGroupId,
    phaseIndex,
    courtType: courtRef.current,
    phases: fullPhases,
    sheet,
    current: phaseIndex,
    imageData: url,
    phaseImages: uploadedUrls,
    editable: true,
  }));

  const result = {
    targetType: isSysteme ? "systeme" : "exercise",
    targetId,
    editIndex,
    schemaGroupId,
    title: title || "",
    courtType: courtRef.current,
    schemaImages: uploadedUrls,
    schemaDataList,
  };

  localStorage.setItem(RESULT_KEY, JSON.stringify(result));
  return { uploadedUrls, schemaDataList, result };
};

// Flux RETOUR : ouvert depuis /exercices/creer ou /systemes/creer.
// On réutilise l'ID / le type existants puis on revient sur la page de création.
const saveAndInsertToExo = async () => {
  const canvas = canvasRef.current;
  if (!canvas) {
    alert("Canvas introuvable");
    return;
  }

  const previousCurrent = currentRef.current;

  try {
    const returnPath = localStorage.getItem(RETURN_KEY) || "";
    const fromGamePlan = isGamePlanReturnContext();
    const fromScouting = isScoutingReturnContext();

    const isSysteme =
      fromGamePlan || fromScouting ||
      returnPath.includes("/systemes") ||
      !!localStorage.getItem("mybasket_current_system_id") ||
      !!localStorage.getItem("mybasket_edit_system_id") ||
      !!localStorage.getItem("mybasket_edit_systeme_id");

    const targetId = isSysteme
      ? localStorage.getItem("mybasket_current_system_id") ||
        localStorage.getItem("mybasket_edit_system_id") ||
        localStorage.getItem("mybasket_edit_systeme_id") ||
        crypto.randomUUID()
      : localStorage.getItem("mybasket_current_exercise_id") ||
        localStorage.getItem("mybasket_edit_exercise_id") ||
        crypto.randomUUID();

    const editIndexRaw = localStorage.getItem(EDIT_INDEX_KEY);
    const editIndex =
      editIndexRaw !== null && editIndexRaw !== ""
        ? Number(editIndexRaw)
        : null;

    const schemaGroupId =
      localStorage.getItem("mybasket_edit_schema_group_id") ||
      crypto.randomUUID();

    await buildPlaquetteResult({ isSysteme, targetId, schemaGroupId, editIndex });

    localStorage.removeItem(RETURN_KEY);
    localStorage.removeItem("mybasket_edit_exercise_id");
    localStorage.removeItem("mybasket_edit_system_id");
    localStorage.removeItem("mybasket_edit_systeme_id");
    localStorage.removeItem("mybasket_plaquette_load");
    localStorage.removeItem("mybasket_edit_schema_group_id");
    if (!fromScouting) localStorage.removeItem("mybasket_scouting_pending");

    currentRef.current = previousCurrent;

    if (fromGamePlan) {
      markManagementGamePlanReturn();
      // Retour Game Plan : on force l'URL exacte du module.
      // Ne jamais utiliser returnPath ici, car il peut ramener seulement sur /mon-compte
      // sans rouvrir le bon module Game Plan.
      window.location.href = GAMEPLAN_RETURN_URL;
      return;
    }

    if (fromScouting) {
      markManagementGamePlanReturn();
      window.location.href = returnPath || SCOUTING_RETURN_URL;
      return;
    }

    window.location.href =
      returnPath ||
      (isSysteme
        ? `/systemes/creer?id=${targetId}`
        : `/exercices/creer?id=${targetId}`);
  } catch (error: any) {
    console.error("ERREUR saveAndInsertToExo", error);
    alert(error?.message || JSON.stringify(error));
  }
};

// Flux CRÉATION DIRECTE : la plaquette crée un nouvel exercice ou système,
// stocke mybasket_plaquette_result, puis ouvre la page de création concernée.
const saveAndGoCreate = async (kind: "systeme" | "exercice") => {
  if (saving) return;

  const canvas = canvasRef.current;
  if (!canvas) {
    alert("Canvas introuvable");
    return;
  }

  const previousCurrent = currentRef.current;
  setSaving(kind);

  try {
    const fromGamePlan = isGamePlanReturnContext();
    const fromScouting = isScoutingReturnContext();
    const returnPath = localStorage.getItem(RETURN_KEY) || "";
    const isSysteme = fromGamePlan || fromScouting || kind === "systeme";

    // IMPORTANT : ici on est en CRÉATION DIRECTE depuis la plaquette.
    // On génère seulement un id temporaire pour ranger les images dans Supabase Storage.
    // On ne doit PAS envoyer cet id dans l'URL de création, sinon les pages /creer
    // croient qu'elles modifient un exercice/système existant et la sauvegarde bloque.
    const storageTargetId = crypto.randomUUID();
    const schemaGroupId = crypto.randomUUID();

    await buildPlaquetteResult({
      isSysteme,
      targetId: storageTargetId,
      schemaGroupId,
      editIndex: null,
    });

    if (!fromGamePlan && !fromScouting) localStorage.removeItem(RETURN_KEY);
    localStorage.removeItem("mybasket_plaquette_load");
    localStorage.removeItem("mybasket_edit_schema_index");
    localStorage.removeItem("mybasket_edit_schema_group_id");
    localStorage.removeItem("mybasket_edit_exercise_id");
    localStorage.removeItem("mybasket_current_exercise_id");
    localStorage.removeItem("mybasket_edit_system_id");
    localStorage.removeItem("mybasket_edit_systeme_id");
    localStorage.removeItem("mybasket_current_system_id");
    if (!fromScouting) localStorage.removeItem("mybasket_scouting_pending");

    currentRef.current = previousCurrent;
    setSaveOpen(false);
    setSaveMsg(true);
    window.setTimeout(() => setSaveMsg(false), 1500);

    if (fromGamePlan) {
      markManagementGamePlanReturn();
      // Retour Game Plan : ne pas aller vers /systemes/creer.
      // On garde mybasket_gameplan_pending_system pour que GamePlanModule sache
      // dans quelle section ajouter le dessin.
      window.location.href = GAMEPLAN_RETURN_URL;
      return;
    }

    if (fromScouting) {
      markManagementGamePlanReturn();
      window.location.href = returnPath || SCOUTING_RETURN_URL;
      return;
    }

    // Création = pas de ?id=. Les pages de création lisent mybasket_plaquette_result
    // puis Supabase génère l'id au moment du bouton sauvegarder.
    window.location.href = isSysteme ? "/systemes/creer" : "/exercices/creer";
  } catch (error: any) {
    console.error("ERREUR saveAndGoCreate", error);
    alert(error?.message || JSON.stringify(error));
  } finally {
    setSaving(null);
  }
};

const exportJson = () => {
  const data = JSON.stringify({ title, courtType, phases, sheet }, null, 2);
  const blob = new Blob([data], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.download = (title || 'play') + '.json';
  a.href = url;
  a.click();
  URL.revokeObjectURL(url);
};

  // ----------------------- Export PDF / fiche coach -----------------------
  const loadJsPDF = (): Promise<any> => new Promise((resolve, reject) => {
    const w = window as any;
    if (w.jspdf && w.jspdf.jsPDF) { resolve(w.jspdf.jsPDF); return; }
    const ex = document.getElementById('jspdf-cdn') as HTMLScriptElement | null;
    if (ex) { ex.addEventListener('load', () => resolve((window as any).jspdf.jsPDF)); ex.addEventListener('error', () => reject(new Error('load'))); return; }
    const s = document.createElement('script');
    s.id = 'jspdf-cdn';
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
    s.onload = () => resolve((window as any).jspdf.jsPDF);
    s.onerror = () => reject(new Error('load'));
    document.head.appendChild(s);
  });
  // capture une image PNG par phase en réutilisant render() (pointeur de phase temporaire)
  const capturePhaseImages = (): string[] => {
    const imgs: string[] = [];
    const c = canvasRef.current; if (!c) return imgs;
    const saved = currentRef.current;
    for (let i = 0; i < phasesRef.current.length; i++) {
      currentRef.current = i; render();
      try { imgs.push(c.toDataURL('image/png')); } catch { imgs.push(''); }
    }
    currentRef.current = saved; render();
    return imgs;
  };
  const genPdf = async () => {
    setGeneratingPdf(true);
    try {
      const JsPDF = await loadJsPDF();
      const images = capturePhaseImages();
      const doc = new JsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
      const PW = 210, PH = 297, M = 14, CW = PW - 2 * M;
      const bord = [107, 26, 44], gold = [212, 162, 76];
      let y = M; const pageBottom = PH - M;
      const ensure = (h: number) => { if (y + h > pageBottom) { doc.addPage(); y = M; } };
      // En-tête bordeaux + logo
      doc.setFillColor(bord[0], bord[1], bord[2]); doc.rect(0, 0, PW, 26, 'F');
      try { doc.addImage(MYBASKET_LOGO_URL, 'JPEG', M, 5, 16, 16); } catch { /* logo */ }
      doc.setTextColor(255, 255, 255); doc.setFont(undefined, 'bold'); doc.setFontSize(16);
      doc.text('FICHE EXERCICE', M + 20, 13);
      doc.setFontSize(9); doc.setFont(undefined, 'normal'); doc.text('MYBASKET.FR', M + 20, 19);
      doc.text(new Date().toLocaleDateString('fr-FR'), PW - M, 13, { align: 'right' });
      y = 32;
      // Titre
      doc.setTextColor(bord[0], bord[1], bord[2]); doc.setFont(undefined, 'bold'); doc.setFontSize(15);
      doc.text(title || 'Sans titre', M, y); y += 7;
      doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(0.8); doc.line(M, y, PW - M, y); y += 7;
      // Méta
      doc.setFontSize(10);
      ([['Catégorie', sheet.category], ['Niveau', sheet.level], ['Thème', sheet.theme], ['Durée', sheet.duration], ['Matériel', sheet.material]] as [string, string][]).forEach(([k, v]) => {
        if (!v || !v.trim()) return; ensure(6);
        doc.setTextColor(bord[0], bord[1], bord[2]); doc.setFont(undefined, 'bold'); doc.text(k + ' :', M, y);
        doc.setTextColor(40, 40, 40); doc.setFont(undefined, 'normal');
        const ls = doc.splitTextToSize(v, CW - 30); doc.text(ls, M + 28, y); y += Math.max(6, ls.length * 5);
      });
      y += 2;
      const section = (label: string, txt: string) => {
        if (!txt || !txt.trim()) return;
        const ls = doc.splitTextToSize(txt, CW); ensure(8 + ls.length * 5);
        doc.setTextColor(bord[0], bord[1], bord[2]); doc.setFont(undefined, 'bold'); doc.setFontSize(11); doc.text(label, M, y); y += 5;
        doc.setTextColor(40, 40, 40); doc.setFont(undefined, 'normal'); doc.setFontSize(10); doc.text(ls, M, y); y += ls.length * 5 + 3;
      };
      section('Objectifs', sheet.objectives);
      section('Consignes', sheet.instructions);
      section('Variantes', sheet.variants);
      section('Coaching points', sheet.coaching);
      // Phases
      const nameOf = (a: string) => (a === 'pass' ? 'Passe' : a === 'dribble' ? 'Dribble' : a === 'cut' ? 'Cut' : a === 'screen' ? 'Écran' : a === 'shoot' ? 'Tir' : a);
      const labOf = (ph: Phase, id?: string) => { const p = id ? ph.players.find((z) => z.id === id) : null; return p ? p.label : '?'; };
      const aspect = courtType === 'full' ? (1100 / 704) : (704 / 900);
      phasesRef.current.forEach((ph, i) => {
        const acts = orderedActions(ph);
        let imgW = courtType === 'full' ? 96 : 130; let imgH = imgW * aspect;
        if (imgH > 120) { imgH = 120; imgW = imgH / aspect; }
        const sim = i > 0 && phaseStartMode(ph) === 'withPrevious';
        ensure(8 + imgH + 6 + acts.length * 5 + 10);
        doc.setTextColor(bord[0], bord[1], bord[2]); doc.setFont(undefined, 'bold'); doc.setFontSize(12);
        doc.text(`Phase ${i + 1}  •  ${phaseDuration(ph)}s${sim ? '  •  simultanée' : ''}`, M, y); y += 5;
        const imgX = M + (CW - imgW) / 2;
        if (images[i]) { try { doc.addImage(images[i], 'PNG', imgX, y, imgW, imgH); } catch { /* img */ } }
        doc.setDrawColor(gold[0], gold[1], gold[2]); doc.setLineWidth(0.4); doc.rect(imgX, y, imgW, imgH);
        y += imgH + 5;
        doc.setTextColor(40, 40, 40); doc.setFontSize(9);
        if (acts.length === 0) { doc.setFont(undefined, 'italic'); doc.text('Aucune action.', M, y); y += 5; doc.setFont(undefined, 'normal'); }
        acts.forEach((l, j) => {
          ensure(5);
          const who = l.action === 'pass' ? `${labOf(ph, l.sourcePlayerId)}\u2192${labOf(ph, l.targetPlayerId)}` : labOf(ph, l.sourcePlayerId);
          const simA = j > 0 && l.startMode === 'withPrevious' ? '  (simultanée)' : '';
          doc.setFont(undefined, 'bold'); doc.text(`${j + 1}.`, M, y);
          doc.setFont(undefined, 'normal'); doc.text(`${nameOf(l.action)}  ${who}${simA}`, M + 6, y); y += 5;
        });
        if (ph.notes && ph.notes.trim()) {
          const nl = doc.splitTextToSize('Notes : ' + ph.notes, CW); ensure(nl.length * 5 + 2);
          doc.setTextColor(90, 90, 90); doc.setFont(undefined, 'italic'); doc.text(nl, M, y); y += nl.length * 5;
          doc.setFont(undefined, 'normal');
        }
        y += 6;
      });
      doc.save((title || 'fiche') + '.pdf');
      setPdfOpen(false);
    } catch { showHint('Échec de l’export PDF (connexion requise au 1er export)'); }
    finally { setGeneratingPdf(false); }
  };

  // ----------------------- Vers fiche exercice (handoff Plaquette → /exercices/creer) -----------------------
  const toExerciseDraft = () => {
    render();
    const c = canvasRef.current; if (!c) return;
    let imageUrl = '';
    try { imageUrl = c.toDataURL('image/png'); } catch { /* tainted/quota */ }
    const diagram = {
      id: 'dg_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      title: title || 'Schéma',
      imageUrl,
      playData: JSON.stringify({ title, courtType, phases, sheet }),
      phases: JSON.parse(JSON.stringify(phases)),
      courtType,
      notes: (phases[current] && phases[current].notes) || '',
      createdAt: Date.now(),
    };
    const draft = { title: title || '', diagram };
    try { sessionStorage.setItem('exerciseDraftFromPlaybook', JSON.stringify(draft)); } catch { /* quota */ }
    window.location.assign('/exercices/creer?from=plaquette');
  };

  // ----------------------- Export vidéo (MP4 / WebM) -----------------------
  // joue toute l'animation depuis la 1ʳᵉ phase et résout la promesse à la fin
  const playWholeForRecording = () => new Promise<void>((resolve) => {
    if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    playingRef.current = false; animPosRef.current = null;
    currentRef.current = 0; setCurrent(0);
    onAnimEndRef.current = resolve;
    playAnim();
    if (!playingRef.current) { onAnimEndRef.current = null; resolve(); } // rien à animer
  });
  const recordVideo = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const cap = (canvas as HTMLCanvasElement).captureStream;
    if (typeof MediaRecorder === 'undefined' || !cap) { showHint('Vidéo non supportée par ce navigateur'); setVideoOpen(false); return; }
    const bitrate = vidQuality === 'fhd' ? 12000000 : vidQuality === 'hd' ? 6000000 : 3000000;
    const isSupported = (t: string) => { try { return MediaRecorder.isTypeSupported(t); } catch { return false; } };
    const pick = (arr: string[]) => arr.find(isSupported);
    const mp4 = ['video/mp4;codecs=avc1.42E01E', 'video/mp4'];
    const webm = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
    const mime = vidFormat === 'mp4' ? (pick(mp4) || pick(webm)) : (pick(webm) || pick(mp4));
    if (!mime) { showHint('Aucun format vidéo disponible'); setVideoOpen(false); return; }
    setVideoOpen(false); setRecording(true);
    try {
      const stream = (canvas as HTMLCanvasElement).captureStream(vidFps);
      const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: bitrate });
      const chunks: BlobPart[] = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      const stopped = new Promise<void>((res) => { rec.onstop = () => res(); });
      rec.start();
      await playWholeForRecording();
      await new Promise((r) => setTimeout(r, 350)); // laisse capturer la dernière frame
      rec.stop();
      await stopped;
      const ext = mime.startsWith('video/mp4') ? 'mp4' : 'webm';
      const blob = new Blob(chunks, { type: mime });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.download = (title || 'play') + '.' + ext; a.href = url; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 8000);
      if (ext !== 'mp4') showHint('Export ' + ext.toUpperCase() + ' (MP4 non supporté par ce navigateur)');
    } catch { showHint('Échec de l’export vidéo'); }
    finally { setRecording(false); }
  };

  // ----------------------- Phases -----------------------
  // état final temporel d'une phase : positions finales des joueurs + porteur + position du ballon
  const computePhaseFinalState = (
  phaseIdx: number
): { players: Player[]; ballOwnerIds: string[]; ballPositions: Pt[] } => {
  const ph = phasesRef.current[phaseIdx];

  if (!ph) {
    return { players: [], ballOwnerIds: [], ballPositions: [] };
  }

  const actSched = buildPhaseActionSched(phaseIdx);
  const span = phaseSpanMs(phaseIdx, actSched);
  const s: Sched = { idx: phaseIdx, start: 0, span, end: span, actSched };

  const owners = new Map<string, number>();

  ph.players.forEach((p) => {
    const count = playerBallCount(p);
    if (count > 0) owners.set(p.id, count);
  });

  const evs = buildBallEvents([s]).slice().sort((a, b) => a.wEnd - b.wEnd);

  for (const e of evs) {
    if (e.src) removeOwnerBall(owners, e.src);

    if (!e.shoot && e.target) {
      addOwnerBall(owners, e.target);
    }
  }

  const players = ph.players.map((p) => {
    const pos = phasePlayerPosAt(s, p.id, span) || { x: p.x, y: p.y };

    return {
      ...p,
      x: pos.x,
      y: pos.y,
      hasBall: (owners.get(p.id) || 0) > 0,
      ballCount: owners.get(p.id) || 0,
    };
  });

  const ballOwnerIds = Array.from(owners.keys());

  const ballPositions = ballOwnerIds.flatMap((id) => {
    const pos = phasePlayerPosAt(s, id, span);
    const count = owners.get(id) || 0;
    if (!pos || count <= 0) return [];
    return Array.from({ length: count }, (_, index) => offsetBallPoint(pos, index, count));
  });

  return { players, ballOwnerIds, ballPositions };
};
  // Next : nouvelle phase repartant de l'état FINAL de la phase courante (joueurs replacés, bon porteur, actions vides)
  const nextPhase = () => {
    pushHistory();
    const idx = currentRef.current;
    const cur = phasesRef.current[idx];
    const fin = cur ? computePhaseFinalState(idx) : null;
    const newPhase: Phase = fin
      ? { players: fin.players, objects: cur!.objects.map((o) => ({ ...o })), lines: [], notes: '', duration: 1.5, startMode: 'afterPrevious' }
      : emptyPhase();
    setPhases((prev) => { const np = [...prev]; np.splice(idx + 1, 0, newPhase); return np; });
    setCurrent((c) => c + 1); setSelection([]); setEditingId(null);
  };
  const clonePhase = () => { pushHistory(); setPhases((prev) => { const copy = JSON.parse(JSON.stringify(prev[current])) as Phase; const np = [...prev]; np.splice(current + 1, 0, copy); return np; }); setCurrent((c) => c + 1); setSelection([]); };
  const emptyPhaseBtn = () => { pushHistory(); updatePhase(() => emptyPhase()); setSelection([]); };
  const delPhase = () => {
    pushHistory(); setSelection([]);
    setPhases((prev) => {
      if (prev.length <= 1) { setCurrent(0); return [emptyPhase()]; }
      const np = prev.filter((_, i) => i !== current);
      setCurrent((cur) => Math.min(cur, np.length - 1));
      return np;
    });
  };

  // ----------------------- Helpers UI -----------------------
  const isPlayer = (label: string, team: 'att' | 'def', shape: 'circle' | 'square', coach = false) =>
    tool.kind === 'player' && tool.label === label && tool.team === team && tool.shape === shape && !!tool.coach === !!coach;
  const isAction = (a: string) => tool.kind === 'action' && tool.action === a;
  const isObj = (o: string) => tool.kind === 'object' && tool.obj === o;

  const ph = phases[current];
  // actions ordonnées + helpers d'affichage du panneau « Timing Actions »
  const acts = ph ? orderedActions(ph) : [];
  const playerLabelById = (id?: string) => { if (!id || !ph) return '?'; const p = ph.players.find((z) => z.id === id); return p ? p.label : '?'; };
  const actionIcon = (a: string) => (a === 'pass' ? '→' : a === 'dribble' ? '~' : a === 'cut' ? '↗' : a === 'screen' ? '⊥' : a === 'shoot' ? '◎' : '•');
  const actionName = (a: string) => (a === 'pass' ? 'Passe' : a === 'dribble' ? 'Dribble' : a === 'cut' ? 'Cut' : a === 'screen' ? 'Écran' : a === 'shoot' ? 'Tir' : a);
  const actionWho = (l: Line) => (l.action === 'pass' ? `${playerLabelById(l.sourcePlayerId)}→${playerLabelById(l.targetPlayerId)}` : playerLabelById(l.sourcePlayerId));
  const toggleActionWith = (lineId: string) => { pushHistory(); updatePhase((p) => ({ ...p, lines: p.lines.map((l) => (l.id === lineId ? { ...l, startMode: l.startMode === 'withPrevious' ? 'afterPrevious' : 'withPrevious' } : l)) })); };
  // Terrain complet en VERTICAL (portrait) ; demi-terrain conserve son format. Les coordonnées
  // sont normalisées 0..1 avec le CENTRE (0.5,0.5) comme référence commune : le rendu ancre le
  // centre au centre du canvas, donc gauche/droite et haut/bas restent cohérents d'un terrain à l'autre.
  const cw = courtType === 'full' ? 704 : 900;
  const chh = courtType === 'full' ? 1100 : 704;

  const selectedObjectId =
    selection.length === 1 && selection[0].type === 'object'
      ? selection[0].id
      : '';

  const selectedObjectColor = (() => {
    if (!selectedObjectId) return '#0F0F12';
    const phase = phases[current];
    const color = phase?.objects.find(
      (object) => object.id === selectedObjectId
    )?.color;
    return typeof color === 'string' && /^#[0-9a-fA-F]{6}$/.test(color)
      ? color
      : '#0F0F12';
  })();

  return (
    <div className="mb-screen">
      <style>{CSS}</style>


      <main>
   {/* ===================== PLAQUETTE ===================== */}
<section className="page editor-page active" data-page="plaquette">
  <div className="ed-toolbar">
    <div className="toolbar-left">
      {exoInsertMode && (
        <button
          type="button"
          className="ed-tool"
          onClick={saveAndInsertToExo}
          style={{ background: '#D9A441', color: '#1a1208', border: 'none' }}
        >
          <span className="icn">💾</span>
          <span>{shootingGridPending ? 'Insérer dans la grille de tir' : scoutingPending ? 'Insérer au scouting' : 'Insérer'}</span>
        </button>
      )}

      <Link
        href="/"
        className="ed-tool"
        onClick={() => {
          localStorage.removeItem('mybasket_plaquette_return');
          localStorage.removeItem('mybasket_plaquette_load');
          localStorage.removeItem(RETURN_KEY);
        }}
      >
        <span className="icn">✕</span>
        <span>Fermer</span>
      </Link>

      <div
        className={'ed-tool' + (editorMode === 'draw' ? ' active' : '')}
        onClick={() => setEditorMode('draw')}
      >
        <span className="icn">✏️</span>
        <span>Dessin</span>
      </div>

      <div
        className={'ed-tool' + (editorMode === 'animate' ? ' active' : '')}
        id="edAnimateBtn"
        onClick={() => {
          setEditorMode('animate');
          togglePlay();
        }}
      >
        <span className="icn">▶</span>
        <span>Animation</span>
      </div>

      <div
        className={'ed-tool' + (notesOpen ? ' active' : '')}
        id="edNotesBtn"
        onClick={() => setNotesOpen((o) => !o)}
      >
        <span className="icn">📝</span>
        <span>Notes</span>
      </div>
    </div>

    <div className="toolbar-center">
      <input
        type="text"
        className="ed-title"
        id="edTitle"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
    </div>

    <div className="toolbar-right">
      <div
        className="ed-icn-btn"
        id="edUndoBtn"
        title="Annuler"
        onClick={undo}
        style={{ opacity: past.length ? 1 : 0.4 }}
      >
        ↶
      </div>

      <div
        className="ed-icn-btn"
        id="edRedoBtn"
        title="Refaire"
        onClick={redo}
        style={{ opacity: future.length ? 1 : 0.4 }}
      >
        ↷
      </div>

      <div
        className="ed-icn-btn"
        id="edCourtTypeBtn"
        title="Demi/Complet"
        onClick={toggleCourt}
      >
        ⇄
      </div>

      <div
        className="ed-icn-btn"
        id="edClearBtn"
        title="Vider le terrain"
        onClick={clearTerrain}
      >
        🗑
      </div>

      <div style={{ position: 'relative' }}>
        <div className="ed-tool" onClick={() => setExportOpen((v) => !v)}>
          <span className="icn">📤</span>
          <span>Exporter</span>
        </div>
        {exportOpen && (
          <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)', zIndex: 30, width: 170, background: '#fff', border: '1px solid var(--gris-med, #ddd)', borderRadius: 10, boxShadow: '0 12px 30px rgba(0,0,0,.18)', overflow: 'hidden' }}>
            <button type="button" onClick={() => { setExportOpen(false); exportPng(); }} style={{ width: '100%', padding: '.6rem .75rem', background: '#fff', border: 'none', textAlign: 'left', cursor: 'pointer', fontWeight: 700 }}>📤 PNG</button>
            <button type="button" onClick={() => { setExportOpen(false); setPdfOpen(true); }} style={{ width: '100%', padding: '.6rem .75rem', background: '#fff', border: 'none', textAlign: 'left', cursor: 'pointer', fontWeight: 700 }}>📄 PDF coach</button>
            <button type="button" onClick={() => { setExportOpen(false); setVideoOpen(true); }} style={{ width: '100%', padding: '.6rem .75rem', background: '#fff', border: 'none', textAlign: 'left', cursor: 'pointer', fontWeight: 700 }}>🎬 Vidéo</button>
            <button type="button" onClick={() => { setExportOpen(false); exportJson(); }} style={{ width: '100%', padding: '.6rem .75rem', background: '#fff', border: 'none', textAlign: 'left', cursor: 'pointer', fontWeight: 700 }}>📋 JSON</button>
          </div>
        )}
      </div>

      <div className="ed-save" id="edSaveBtn" onClick={() => setSaveOpen(true)}>
        {saveMsg ? '✓ Envoyé' : '💾 Enregistrer'}
      </div>
    </div>
  </div>

  <div className="ed-layout">
            {/* -------- GAUCHE -------- */}
            <aside className="ed-left">
              <div className="ed-tabs">
                <div className="ed-tab active" data-tab="phases">Phases</div>
                
              </div>

              <div id="tabPhases">
                <div className="ph-counter" id="phCounter">PHASE {current + 1}/{phases.length}</div>
                <div className="ph-actions">
                  <div className="ph-act" id="phNext" onClick={nextPhase}><span className="ico">→</span><span>Next</span></div>
                  <div className="ph-act" id="phClone" onClick={clonePhase}><span className="ico">⎘</span><span>Clone</span></div>
                  <div className="ph-act" id="phEmpty" onClick={emptyPhaseBtn}><span className="ico">▢</span><span>Empty</span></div>
                  <div className="ph-act" id="phDel" onClick={delPhase}><span className="ico">🗑</span><span>Del</span></div>
                </div>
                <div className="phases-list" id="phasesList">
                  {phases.map((p, i) => (
                    <div
                      key={i}
                      className={'ph-thumb' + (i === current ? ' active' : '')}
                      onClick={() => { setCurrent(i); setSelection([]); }}
                      style={MYBASKET_DEMI_URL ? { backgroundImage: `url(${MYBASKET_DEMI_URL})` } : undefined}
                    >
                      {p.players.map((pl) => (
                        <span key={pl.id} style={{ position: 'absolute', left: `${pl.x * 100}%`, top: `${(pl.y / 0.5) * 100}%`, width: 7, height: 7, marginLeft: -3.5, marginTop: -3.5, borderRadius: pl.shape === 'square' ? 1 : '50%', background: pl.team === 'def' ? '#D62828' : '#D4A24C', border: '1px solid #0F0F12' }} />
                      ))}
                      {p.objects.map((o) => (
                        <span key={o.id} style={{ position: 'absolute', left: `${o.x * 100}%`, top: `${(o.y / 0.5) * 100}%`, width: 4, height: 4, marginLeft: -2, marginTop: -2, borderRadius: '50%', background: o.kind === 'ball' ? '#E8743C' : '#0F0F12' }} />
                      ))}
                      <span className="pnum">{i + 1}</span>
                      <span style={{ position: 'absolute', bottom: 1, right: 2, fontSize: 8, fontWeight: 700, color: '#0F0F12', background: 'rgba(255,255,255,0.78)', borderRadius: 3, padding: '0 2px', lineHeight: 1.3 }}>{p.duration ?? 1.5}s</span>
                      {i > 0 && p.startMode === 'withPrevious' && (
                        <span title="Démarre en même temps que la précédente" style={{ position: 'absolute', top: 1, left: 2, fontSize: 9, fontWeight: 700, color: '#fff', background: 'var(--or, #D4A24C)', borderRadius: 3, padding: '0 2px', lineHeight: 1.3 }}>⇉</span>
                      )}
                    </div>
                  ))}
                </div>

                {notesOpen && (
                  <div style={{ marginTop: '.7rem' }}>
                    <div className="sec-lab" style={{ marginBottom: '.3rem' }}>NOTES</div>
                    <textarea
                      value={ph ? ph.notes : ''}
                      onFocus={pushHistory}
                      onChange={(e) => { const v = e.target.value; updatePhase((p) => ({ ...p, notes: v })); }}
                      placeholder="Notes de la phase…"
                      style={{ width: '100%', minHeight: 90, resize: 'vertical', border: '1px solid var(--gris-med)', borderRadius: 6, padding: '.5rem', fontSize: '.8rem', fontFamily: 'inherit' }}
                    />
                  </div>
                )}

                <div id="timingPanel" style={{ marginTop: '.85rem', paddingTop: '.85rem', borderTop: '1px solid var(--gris-med)' }}>
                  <div className="sec-lab" style={{ marginBottom: '.45rem' }}>TIMING — PHASE {current + 1}</div>
                  <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '.8rem', marginBottom: '.5rem' }}>
                    Durée (s)
                    <input
                      type="number" min={0.1} step={0.1}
                      value={ph?.duration ?? 1.5}
                      onFocus={pushHistory}
                      onChange={(e) => { const v = Math.max(0.1, Number(e.target.value) || 1.5); updatePhase((p) => ({ ...p, duration: v })); }}
                      style={{ width: 64, padding: '.25rem .35rem', border: '1px solid var(--gris-med)', borderRadius: 6, fontSize: '.8rem' }}
                    />
                  </label>
                  <select
                    value={current === 0 ? 'afterPrevious' : (ph?.startMode ?? 'afterPrevious')}
                    disabled={current === 0}
                    onChange={(e) => { pushHistory(); const v = e.target.value as 'withPrevious' | 'afterPrevious'; updatePhase((p) => ({ ...p, startMode: v })); }}
                    style={{ width: '100%', padding: '.3rem .35rem', border: '1px solid var(--gris-med)', borderRadius: 6, fontSize: '.8rem', background: '#fff' }}
                  >
                    <option value="afterPrevious">Après la précédente</option>
                    <option value="withPrevious">En même temps que la précédente</option>
                  </select>
                  {current === 0 && <div style={{ marginTop: '.4rem', fontSize: '.72rem', color: 'var(--gris-text, #6b6b6b)' }}>La 1ʳᵉ phase démarre toujours au début.</div>}
                  {current > 0 && (ph?.startMode === 'withPrevious') && <div style={{ marginTop: '.4rem', fontSize: '.72rem', color: 'var(--or, #D4A24C)', fontWeight: 600 }}>⇉ démarre en même temps que la phase {current}</div>}

                  {/* ----- TIMING ACTIONS ----- */}
                  <div style={{ marginTop: '.85rem', paddingTop: '.7rem', borderTop: '1px solid var(--gris-med)' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '.2rem' }}>
                      <div className="sec-lab">⏱ TIMING ACTIONS</div>
                      <div style={{ fontSize: '.72rem', color: '#6b6b6b' }}>{acts.length} étape(s)</div>
                    </div>
                    <div style={{ fontSize: '.72rem', color: '#6b6b6b', marginBottom: '.5rem', lineHeight: 1.35 }}>Clique ↔ pour faire démarrer une action en même temps que la précédente.</div>
                    {acts.length === 0 && <div style={{ fontSize: '.75rem', color: '#9a9a9a', fontStyle: 'italic' }}>Aucune action sur cette phase.</div>}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {acts.map((l, i) => {
                        const sel = selection.some((s) => s.type === 'line' && s.id === l.id);
                        const withPrev = i > 0 && l.startMode === 'withPrevious';
                        return (
                          <div key={l.id} style={{ display: 'flex', alignItems: 'center', gap: 6, border: '1px solid ' + (sel ? 'var(--or, #D4A24C)' : 'var(--gris-med)'), background: sel ? 'rgba(212,162,76,0.12)' : '#fff', borderRadius: 6, padding: '.28rem .4rem', cursor: 'pointer' }}>
                            <span
                              onClick={(e) => { e.stopPropagation(); if (i > 0) toggleActionWith(l.id); }}
                              title={i === 0 ? 'La 1ʳᵉ action démarre toujours en premier' : 'En même temps que la précédente'}
                              style={{ flex: '0 0 auto', width: 20, height: 20, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 4, fontSize: 11, fontWeight: 700, border: '1px solid ' + (withPrev ? 'var(--or, #D4A24C)' : 'var(--gris-med)'), background: withPrev ? 'var(--or, #D4A24C)' : '#fff', color: withPrev ? '#fff' : (i === 0 ? '#cfcfcf' : '#6b6b6b'), cursor: i === 0 ? 'default' : 'pointer' }}
                            >↔</span>
                            <span onClick={() => setSelection([{ type: 'line', id: l.id }])} style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 1, minWidth: 0 }}>
                              <span style={{ flex: '0 0 auto', fontWeight: 700, fontSize: '.8rem' }}>{i + 1}</span>
                              <span style={{ flex: '0 0 auto', width: 16, textAlign: 'center', fontWeight: 700 }}>{actionIcon(l.action)}</span>
                              <span style={{ flex: 1, minWidth: 0, fontSize: '.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{actionName(l.action)}</span>
                              <span style={{ flex: '0 0 auto', fontSize: '.75rem', color: '#6b6b6b', fontWeight: 600 }}>{actionWho(l)}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            </aside>

            {/* -------- TERRAIN -------- */}
            <div className="ed-canvas-wrap" style={{ position: 'relative' }}>
              {hint && (
                <div style={{ position: 'absolute', top: 10, left: '50%', transform: 'translateX(-50%)', zIndex: 5, background: 'rgba(15,15,18,0.92)', color: '#fff', padding: '.5rem .85rem', borderRadius: 8, fontSize: '.82rem', fontWeight: 600, pointerEvents: 'none', whiteSpace: 'nowrap' }}>{hint}</div>
              )}
              <canvas
                id="playCanvas"
                ref={canvasRef}
                width={cw}
                height={chh}
                data-court={courtType}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerLeave={onPointerUp}
                onDoubleClick={onDoubleClick}
              ></canvas>
            </div>

            {/* -------- DROITE -------- */}
            <aside className="ed-right">
              <div className="ed-hint">💡 Place joueurs/objets au clic, trace les actions au glisser. Triangle et carré : chaque poignée bleue est un vrai sommet indépendant. Pose chaque coin exactement où tu veux. Un <b>H placé entre deux joueurs</b> signifie main à main et transfère automatiquement le ballon au second joueur.</div>

              <div className="sec-lab">ACTIONS</div>
              <div className="actions-grid">
                <div className={'act-btn' + (isAction('select') ? ' active' : '')} data-action="select" style={isAction('select') ? undefined : { background: 'var(--bordeaux-d)' }} onClick={() => pick({ kind: 'action', action: 'select' })}><span className="icn">↖</span>Sélection</div>
                <div className={'act-btn' + (isAction('dribble') ? ' active' : '')} data-action="dribble" onClick={() => pick({ kind: 'action', action: 'dribble' })}><span className="icn">∿</span>Dribble</div>
                <div className={'act-btn' + (isAction('pass') ? ' active' : '')} data-action="pass" onClick={() => pick({ kind: 'action', action: 'pass' })}><span className="icn">{'-->'}</span>Passe</div>
                <div className={'act-btn' + (isAction('cut') ? ' active' : '')} data-action="cut" onClick={() => pick({ kind: 'action', action: 'cut' })}><span className="icn">→</span>Cut</div>
                <div className={'act-btn' + (isAction('screen') ? ' active' : '')} data-action="screen" onClick={() => pick({ kind: 'action', action: 'screen' })}><span className="icn">⊺</span>Écran</div>
                <div className={'act-btn' + (isAction('shoot') ? ' active' : '')} data-action="shoot" onClick={() => pick({ kind: 'action', action: 'shoot' })}><span className="icn">⊕</span>Tir</div>
                <div className={'act-btn' + (isAction('giveball') ? ' active' : '')} data-action="giveball" style={isAction('giveball') ? undefined : { background: '#C0501A' }} onClick={() => pick({ kind: 'action', action: 'giveball' })}><span className="icn">🏀</span>Donner ballon</div>
              </div>

              <div className="sec-lab">AJOUTER JOUEURS <span className="help" title="Mode att./déf. = chaque clic place le joueur suivant (1→5 ou X1→X5)">?</span></div>
              <div style={{ display: 'flex', gap: '.3rem', marginBottom: '.5rem' }}>
                <button className={'btn btn-outline btn-small' + (placeMode === 'att' ? ' mode-on' : '')} id="placeAttBtn" style={{ flex: 1, fontSize: '.72rem' }} onClick={() => { setTool({ kind: 'none' }); setSelection([]); setPlaceIdx(0); setPlaceMode((m) => (m === 'att' ? null : 'att')); }}>⊕ Mode att.</button>
                <button className={'btn btn-outline btn-small' + (placeMode === 'def' ? ' mode-on' : '')} id="placeDefBtn" style={{ flex: 1, fontSize: '.72rem' }} onClick={() => { setTool({ kind: 'none' }); setSelection([]); setPlaceIdx(0); setPlaceMode((m) => (m === 'def' ? null : 'def')); }}>⊖ Mode déf.</button>
              </div>
              <div className="players-row" id="row-circle">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className={'pl-btn s-circle' + (isPlayer(String(i), 'att', 'circle') ? ' active' : '')} onClick={() => pick({ kind: 'player', label: String(i), team: 'att', shape: 'circle' })}>{i}</div>
                ))}
              </div>
              <div className="players-row" id="row-square">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className={'pl-btn s-square' + (isPlayer(String(i), 'att', 'square') ? ' active' : '')} onClick={() => pick({ kind: 'player', label: String(i), team: 'att', shape: 'square' })}>{i}</div>
                ))}
              </div>
              <div className="players-row" id="row-defense">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className={'pl-btn s-defense' + (isPlayer('X' + i, 'def', 'circle') ? ' active' : '')} onClick={() => pick({ kind: 'player', label: 'X' + i, team: 'def', shape: 'circle' })}>X{i}</div>
                ))}
              </div>
              <div className="players-row" id="row-coach">
                <div className={'pl-btn s-coach' + (isPlayer('C', 'att', 'circle', true) ? ' active' : '')} onClick={() => pick({ kind: 'player', label: 'C', team: 'att', shape: 'circle', coach: true })}>C</div>
              </div>

              <div className="sec-lab" style={{ marginTop: '.85rem' }}>OUTILS</div>
              <div className="misc-grid">
                <div className={'misc-btn' + (isObj('ball') ? ' active' : '')} id="addBallBtn" title="Ballon" onClick={() => pick({ kind: 'object', obj: 'ball' })}>🏀</div>
                <div className={'misc-btn' + (isObj('cone') ? ' active' : '')} data-misc="cone" title="Cône" style={{ color: '#E87722', fontSize: '1.1rem' }} onClick={() => pick({ kind: 'object', obj: 'cone' })}>▲</div>
                <div className={'misc-btn' + (isObj('triangle') ? ' active' : '')} data-misc="triangle" title="Triangle" onClick={() => pick({ kind: 'object', obj: 'triangle' })}>△</div>
                <div className={'misc-btn' + (isObj('square') ? ' active' : '')} data-misc="square" title="Carré" onClick={() => pick({ kind: 'object', obj: 'square' })}>■</div>
                <div className={'misc-btn' + (isObj('circle') ? ' active' : '')} data-misc="circle" title="Rond" onClick={() => pick({ kind: 'object', obj: 'circle' })}>●</div>
                <div className={'misc-btn' + (isObj('text') ? ' active' : '')} data-misc="text" title="Texte" onClick={() => pick({ kind: 'object', obj: 'text' })}>T</div>
                <div className={'misc-btn' + (isObj('handoff') ? ' active' : '')} data-misc="handoff" title="Main à main : place le H entre deux joueurs pour changer le porteur" style={{ fontFamily: 'Arial,sans-serif', fontWeight: 900 }} onClick={() => pick({ kind: 'object', obj: 'handoff' })}>H</div>
                <div className={'misc-btn' + (isObj('freedraw') ? ' active' : '')} data-misc="freedraw" title="Dessin libre" onClick={() => pick({ kind: 'object', obj: 'freedraw' })}>✎</div>
              </div>

              <div style={{ marginTop: '.85rem', display: 'flex', flexDirection: 'column', gap: '.4rem' }}>
                <button className="btn btn-outline btn-block btn-small" id="courtToggleBtn" style={{ textAlign: 'center', fontWeight: 600 }} onClick={toggleCourt}>
                  🏟 Terrain : {courtType === 'half' ? 'Demi' : 'Complet'}
                </button>

                <button className="btn btn-red btn-block btn-small" id="delSelectedBtn" onClick={deleteSelected}>🗑 Supprimer sélection</button>
                <button className="btn btn-outline btn-block btn-small" id="dupSelectedBtn" onClick={duplicateSelected}>⎘ Dupliquer</button>
                <label style={{ fontSize: '.72rem', color: 'var(--gris-text)', textTransform: 'uppercase', letterSpacing: '.04em', marginTop: '.25rem' }}>Couleur de la sélection</label>
                <input
                  key={`shape-color-${current}-${selectedObjectId}-${selectedObjectColor}`}
                  type="color"
                  id="colorPicker"
                  defaultValue={selectedObjectColor}
                  disabled={!selectedObjectId}
                  onChange={(e) => {
                    const c = e.target.value;
                    if (!selection.length) return;
                    pushHistory();
                    const has = (t: string, id: string) => selection.some((s) => s.type === t && s.id === id);
                    setPhases((prev) => prev.map((p, i) => (i === current ? {
                      ...p,
                      players: p.players.map((z) => (has('player', z.id) ? { ...z, color: c } : z)),
                      objects: p.objects.map((z) => (has('object', z.id) ? { ...z, color: c } : z)),
                    } : p)));
                  }}
                  style={{
                    width: '100%',
                    height: 32,
                    cursor: selectedObjectId ? 'pointer' : 'not-allowed',
                    opacity: selectedObjectId ? 1 : 0.45,
                  }}
                />

                <label style={{ fontSize: '.72rem', color: 'var(--gris-text)', textTransform: 'uppercase', letterSpacing: '.04em', marginTop: '.25rem' }}>Taille des formes sélectionnées</label>
                <input
                  type="range"
                  min="0.05"
                  max="10"
                  step="0.05"
                  defaultValue="1"
                  disabled={!selection.some((s) => s.type === 'object')}
                  onChange={(e) => {
                    const size = Number(e.target.value);
                    if (!selection.some((s) => s.type === 'object')) return;
                    const has = (id: string) => selection.some((s) => s.type === 'object' && s.id === id);
                    setPhases((prev) => prev.map((p, i) => (i === current ? {
                      ...p,
                      objects: p.objects.map((z) => (has(z.id) ? { ...z, size } : z)),
                    } : p)));
                  }}
                  onPointerDown={() => pushHistory()}
                  style={{ width: '100%', cursor: selection.some((s) => s.type === 'object') ? 'pointer' : 'not-allowed' }}
                />
                <div style={{ display: 'flex', gap: '.35rem' }}>
                  <button className="btn btn-outline btn-small" style={{ flex: 1 }} onClick={() => rotateSelected(-15)}>↺ -15°</button>
                  <button className="btn btn-outline btn-small" style={{ flex: 1 }} onClick={() => rotateSelected(15)}>↻ +15°</button>
                </div>
              </div>
            </aside>
          </div>

          {/* -------- TIMELINE (étape 4) -------- */}
          <div className="timeline">
            <div className="tl-controls">
              <div className="tl-btn" id="tlPrev" title="Précédent" onClick={() => seekPhaseTL(current - 1)}>⏮</div>
              <div className="tl-btn" id="tlPlay" title="Play/Pause" onClick={togglePlay}>{isPlaying ? '⏸' : '▶'}</div>
              <div className="tl-btn" id="tlStop" title="Stop" onClick={stopAnim}>⏹</div>
              <div className="tl-btn" id="tlNext" title="Suivant" onClick={() => seekPhaseTL(current + 1)}>⏭</div>
            </div>
            <select className="tl-speed" id="tlSpeed" defaultValue="1" onChange={(e) => { speedRef.current = Number(e.target.value); }}>
              <option value="0.5">0.5x</option>
              <option value="1">1x</option>
              <option value="1.5">1.5x</option>
              <option value="2">2x</option>
            </select>
            <div className="tl-progress" id="tlProgress"><div className="tl-progress-bar" id="tlBar" ref={tlBarRef}></div></div>
            <div className="tl-status" id="tlStatus">{isPlaying ? '▶ ' : ''}Phase {current + 1}/{phases.length}</div>
          </div>
        </section>
        {/* ===================== MODALE ENREGISTRER / INSÉRER ===================== */}
        {saveOpen && (
          <div
            onClick={() => !saving && setSaveOpen(false)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4200, padding: '1rem' }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ background: '#fff', borderRadius: 12, padding: '1.2rem 1.3rem', width: 390, maxWidth: '92vw', boxShadow: '0 14px 50px rgba(0,0,0,.35)', borderTop: '4px solid var(--bordeaux, #6B1A2C)' }}
            >
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--bordeaux, #6B1A2C)', marginBottom: '.25rem' }}>💾 Envoyer vers MyBasket</div>
              <div style={{ fontSize: '.8rem', color: '#6b6b6b', marginBottom: '1rem', lineHeight: 1.45 }}>
                La plaquette sera capturée phase par phase, uploadée dans Supabase, puis envoyée dans la page de création choisie.
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '.55rem' }}>
                {exoInsertMode && (
                  <button
                    disabled={!!saving}
                    onClick={saveAndInsertToExo}
                    style={{ padding: '.7rem', borderRadius: 9, border: 'none', background: 'var(--or, #D4A24C)', color: '#0F0F12', fontWeight: 800, fontSize: '.9rem', cursor: saving ? 'wait' : 'pointer' }}
                  >
                    {shootingGridPending ? '💾 Insérer dans la grille de tir' : scoutingPending ? '💾 Insérer au scouting' : '💾 Insérer dans la fiche en cours'}
                  </button>
                )}

                <button
                  disabled={!!saving}
                  onClick={() => saveAndGoCreate('systeme')}
                  style={{ padding: '.7rem', borderRadius: 9, border: 'none', background: 'var(--bordeaux, #6B1A2C)', color: '#fff', fontWeight: 700, fontSize: '.9rem', cursor: saving ? 'wait' : 'pointer', opacity: saving && saving !== 'systeme' ? 0.5 : 1 }}
                >
                  {saving === 'systeme' ? 'Envoi…' : '🗂 Créer un système'}
                </button>

                <button
                  disabled={!!saving}
                  onClick={() => saveAndGoCreate('exercice')}
                  style={{ padding: '.7rem', borderRadius: 9, border: 'none', background: '#F3E3B4', color: '#0F0F12', fontWeight: 800, fontSize: '.9rem', cursor: saving ? 'wait' : 'pointer', opacity: saving && saving !== 'exercice' ? 0.5 : 1 }}
                >
                  {saving === 'exercice' ? 'Envoi…' : '📋 Créer un exercice'}
                </button>

                <button
                  disabled={!!saving}
                  onClick={() => setSaveOpen(false)}
                  style={{ marginTop: '.2rem', padding: '.55rem', borderRadius: 9, border: '1px solid var(--gris-med, #ddd)', background: '#fff', fontWeight: 600, fontSize: '.85rem', cursor: saving ? 'not-allowed' : 'pointer' }}
                >
                  Annuler
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ===================== MODALE JOUEUR ===================== */}
        {editingPlayer && (
          <div
            onClick={() => setEditingId(null)}
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{ width: 340, maxWidth: '92vw', maxHeight: '88vh', overflowY: 'auto', background: '#fff', borderRadius: 12, boxShadow: '0 18px 50px rgba(0,0,0,.35)', borderTop: '4px solid var(--bordeaux)' }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '.7rem 1rem', borderBottom: '1px solid var(--gris-med)' }}>
                <b style={{ fontFamily: 'var(--varsity)', color: 'var(--bordeaux)', fontSize: '.95rem' }}>Joueur {editingPlayer.label}</b>
                <span onClick={() => setEditingId(null)} style={{ cursor: 'pointer', fontSize: '1.2rem', lineHeight: 1, color: 'var(--gris-text)' }}>✕</span>
              </div>

              <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '.7rem' }}>
                <label style={{ fontSize: '.78rem', fontWeight: 600 }}>Nom
                  <input type="text" value={editingPlayer.name || ''} onFocus={pushHistory} onChange={(e) => updatePlayer(editingPlayer.id, { name: e.target.value })}
                    placeholder="Nom du joueur" style={{ width: '100%', marginTop: 4, padding: '.45rem .6rem', border: '1px solid var(--gris-med)', borderRadius: 6, fontFamily: 'inherit', fontSize: '.85rem' }} />
                </label>

                <label style={{ fontSize: '.78rem', fontWeight: 600 }}>Numéro / texte
                  <input type="text" value={editingPlayer.label} onFocus={pushHistory} onChange={(e) => updatePlayer(editingPlayer.id, { label: e.target.value })}
                    style={{ width: '100%', marginTop: 4, padding: '.45rem .6rem', border: '1px solid var(--gris-med)', borderRadius: 6, fontFamily: 'inherit', fontSize: '.85rem' }} />
                </label>

                <div style={{ display: 'flex', gap: '.7rem' }}>
                  <label style={{ fontSize: '.78rem', fontWeight: 600, flex: '0 0 auto' }}>Couleur
                    <input type="color" value={editingPlayer.color || (editingPlayer.team === 'def' ? '#D62828' : '#6B1A2C')} onFocus={pushHistory} onChange={(e) => updatePlayer(editingPlayer.id, { color: e.target.value })}
                      style={{ display: 'block', marginTop: 4, width: 56, height: 32, cursor: 'pointer', border: '1px solid var(--gris-med)', borderRadius: 6 }} />
                  </label>
                  <label style={{ fontSize: '.78rem', fontWeight: 600, flex: 1 }}>Taille
                    <input type="range" min={0.6} max={1.8} step={0.05} value={editingPlayer.size || 1} onPointerDown={pushHistory} onChange={(e) => updatePlayer(editingPlayer.id, { size: parseFloat(e.target.value) })}
                      style={{ width: '100%', marginTop: 10 }} />
                  </label>
                </div>

                <div>
                  <div style={{ fontSize: '.78rem', fontWeight: 600, marginBottom: 4 }}>Photo</div>
                  <div style={{ display: 'flex', gap: '.4rem', flexWrap: 'wrap' }}>
                    <label className="btn btn-outline btn-small" style={{ cursor: 'pointer' }}>
                      {editingPlayer.photo ? 'Changer' : 'Ajouter'}
                      <input type="file" accept="image/*" style={{ display: 'none' }} onChange={(e) => onPhotoFile(editingPlayer.id, e.target.files && e.target.files[0])} />
                    </label>
                    {editingPlayer.photo && (
                      <button className="btn btn-outline btn-small" onClick={() => updatePlayer(editingPlayer.id, { photo: undefined })}>Supprimer photo</button>
                    )}
                  </div>
                </div>

                {/* Association à un joueur réel des équipes */}
                <div>
                  <button className="btn btn-outline btn-small btn-block" style={{ fontWeight: 600 }} onClick={() => (linkOpen ? setLinkOpen(false) : openLinkPanel())}>
                    🔗 Associer à un joueur de mes équipes
                  </button>
                  {editingPlayer.linkedPlayerId && (
                    <div style={{ marginTop: 6, fontSize: '.75rem', display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--gris-bg)', padding: '.4rem .55rem', borderRadius: 6 }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <span>Lié à <b>{editingPlayer.linkedPlayerName}</b> · {editingPlayer.linkedTeamName}</span>
                        <span onClick={() => unlinkPlayer(editingPlayer.id)} style={{ cursor: 'pointer', color: 'var(--rouge)', fontWeight: 600 }}>Dissocier</span>
                      </div>
                      <button className="btn btn-outline btn-small btn-block" onClick={() => (playerBallCount(editingPlayer) >= 2 ? removeBall(editingPlayer.id) : giveBall(editingPlayer.id))}>
                        {playerBallCount(editingPlayer) >= 2 ? '🏀 Enlever les ballons' : playerBallCount(editingPlayer) === 1 ? '🏀 Ajouter un 2e ballon' : '🏀 Donner le ballon à ce joueur'}
                      </button>
                    </div>
                  )}
                  {linkOpen && (
                    <div style={{ marginTop: 6, border: '1px solid var(--gris-med)', borderRadius: 8, overflow: 'hidden' }}>
                      <input type="text" value={linkQuery} onChange={(e) => setLinkQuery(e.target.value)} placeholder="Rechercher (nom, équipe, n°)…"
                        style={{ width: '100%', padding: '.45rem .6rem', border: 'none', borderBottom: '1px solid var(--gris-med)', fontSize: '.82rem', fontFamily: 'inherit', outline: 'none' }} />
                      <div style={{ maxHeight: 200, overflowY: 'auto' }}>
                        {teamPlayers
                          .filter((tp) => { const q = linkQuery.trim().toLowerCase(); if (!q) return true; return (tp.name + ' ' + tp.teamName + ' ' + (tp.number || '') + ' ' + (tp.position || '')).toLowerCase().includes(q); })
                          .map((tp) => (
                            <div key={tp.id} onClick={() => applyLink(tp)}
                              style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '.45rem .6rem', cursor: 'pointer', borderBottom: '1px solid #eee' }}>
                              <span style={{ width: 30, height: 30, borderRadius: '50%', flex: '0 0 auto', background: tp.color || 'var(--bordeaux)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '.7rem', fontWeight: 700, overflow: 'hidden' }}>
                                {tp.photo ? <img src={tp.photo} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : (tp.number || tp.name.slice(0, 1))}
                              </span>
                              <span style={{ flex: 1, minWidth: 0 }}>
                                <span style={{ display: 'block', fontSize: '.82rem', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{tp.name}</span>
                                <span style={{ display: 'block', fontSize: '.7rem', color: 'var(--gris-text)' }}>{tp.teamName}{tp.position ? ' · ' + tp.position : ''}{tp.number ? ' · #' + tp.number : ''}</span>
                              </span>
                            </div>
                          ))}
                        {teamPlayers.length === 0 && <div style={{ padding: '.6rem', fontSize: '.8rem', color: 'var(--gris-text)' }}>Aucun joueur trouvé.</div>}
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ display: 'flex', gap: '.4rem' }}>
                  {playerBallCount(editingPlayer) >= 2
                    ? <button className="btn btn-outline btn-small btn-block" onClick={() => removeBall(editingPlayer.id)}>🏀 Enlever les ballons</button>
                    : <button className="btn btn-outline btn-small btn-block" onClick={() => giveBall(editingPlayer.id)}>
                        {playerBallCount(editingPlayer) === 1 ? '🏀 Ajouter un 2e ballon' : '🏀 Donner le ballon'}
                      </button>}
                </div>

                <div style={{ display: 'flex', gap: '.4rem' }}>
                  <button className="btn btn-outline btn-small" style={{ flex: 1 }} onClick={() => duplicatePlayerById(editingPlayer.id)}>⎘ Dupliquer</button>
                  <button className="btn btn-red btn-small" style={{ flex: 1 }} onClick={() => deletePlayerById(editingPlayer.id)}>🗑 Supprimer</button>
                </div>

<>

  <button
    className="btn btn-outline btn-small btn-block"
    style={{ fontWeight: 600 }}
    onClick={() => setEditingId(null)}
  >
    Fermer
  </button>
</>              </div>
            </div>
          </div>
        )}

        {/* ----- Modale Export PDF / fiche coach ----- */}
        {pdfOpen && (
          <div onClick={() => !generatingPdf && setPdfOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000, padding: '1rem' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '1.1rem 1.2rem', width: 460, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 14px 50px rgba(0,0,0,.35)' }}>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--bordeaux, #6B1A2C)', marginBottom: '.2rem' }}>📄 Fiche exercice (PDF)</div>
              <div style={{ fontSize: '.78rem', color: '#6b6b6b', marginBottom: '.9rem' }}>Génère une fiche A4 (logo, infos, schémas de chaque phase, actions, notes).</div>
              {([
                ['title', 'Titre', false], ['category', 'Catégorie', false], ['level', 'Niveau', false], ['theme', 'Thème', false],
                ['duration', 'Durée', false], ['material', 'Matériel', true], ['objectives', 'Objectifs', true],
                ['instructions', 'Consignes', true], ['variants', 'Variantes', true], ['coaching', 'Coaching points', true],
              ] as [string, string, boolean][]).map(([k, lab, area]) => (
                <div key={k} style={{ marginBottom: '.55rem' }}>
                  <label style={{ display: 'block', fontSize: '.74rem', fontWeight: 700, color: '#444', marginBottom: 2 }}>{lab}</label>
                  {area
                    ? <textarea value={k === 'title' ? title : (sheet as any)[k]} onChange={(e) => k === 'title' ? setTitle(e.target.value) : setSheetField(k as keyof typeof sheet, e.target.value)} rows={2} style={{ width: '100%', resize: 'vertical', padding: '.4rem .5rem', border: '1px solid var(--gris-med, #ddd)', borderRadius: 6, fontSize: '.82rem', fontFamily: 'inherit', boxSizing: 'border-box' }} />
                    : <input value={k === 'title' ? title : (sheet as any)[k]} onChange={(e) => k === 'title' ? setTitle(e.target.value) : setSheetField(k as keyof typeof sheet, e.target.value)} style={{ width: '100%', padding: '.4rem .5rem', border: '1px solid var(--gris-med, #ddd)', borderRadius: 6, fontSize: '.82rem', boxSizing: 'border-box' }} />}
                </div>
              ))}
              <div style={{ display: 'flex', gap: '.5rem', marginTop: '.6rem' }}>
                <button disabled={generatingPdf} onClick={() => setPdfOpen(false)} style={{ flex: 1, padding: '.55rem', borderRadius: 8, border: '1px solid var(--gris-med, #ddd)', background: '#fff', fontWeight: 600, cursor: generatingPdf ? 'not-allowed' : 'pointer' }}>Annuler</button>
                <button disabled={generatingPdf} onClick={genPdf} style={{ flex: 1, padding: '.55rem', borderRadius: 8, border: 'none', background: 'var(--or, #D4A24C)', color: '#0F0F12', fontWeight: 800, cursor: generatingPdf ? 'wait' : 'pointer' }}>{generatingPdf ? 'Génération…' : 'Générer PDF'}</button>
              </div>
            </div>
          </div>
        )}

        {/* ----- Modale Export vidéo ----- */}
        {videoOpen && (
          <div onClick={() => setVideoOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4000 }}>
            <div onClick={(e) => e.stopPropagation()} style={{ background: '#fff', borderRadius: 12, padding: '1.1rem 1.2rem', width: 320, maxWidth: '92vw', boxShadow: '0 14px 50px rgba(0,0,0,.35)' }}>
              <div style={{ fontWeight: 800, fontSize: '1.05rem', color: 'var(--bordeaux, #6B1A2C)', marginBottom: '.2rem' }}>🎬 Export vidéo</div>
              <div style={{ fontSize: '.78rem', color: '#6b6b6b', marginBottom: '.9rem' }}>Toutes les phases sont rejouées et enregistrées (joueurs, ballon, passes, dribbles, cuts, écrans, tirs, objets).</div>

              <div style={{ fontSize: '.78rem', fontWeight: 700, marginBottom: '.3rem' }}>Qualité</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: '.8rem' }}>
                {([['std', 'Standard'], ['hd', 'HD'], ['fhd', 'Full HD']] as const).map(([v, lab]) => (
                  <button key={v} onClick={() => setVidQuality(v)} style={{ flex: 1, padding: '.4rem .2rem', fontSize: '.78rem', fontWeight: 600, borderRadius: 7, cursor: 'pointer', border: '1px solid ' + (vidQuality === v ? 'var(--bordeaux, #6B1A2C)' : 'var(--gris-med, #ddd)'), background: vidQuality === v ? 'var(--bordeaux, #6B1A2C)' : '#fff', color: vidQuality === v ? '#fff' : '#333' }}>{lab}</button>
                ))}
              </div>

              <div style={{ fontSize: '.78rem', fontWeight: 700, marginBottom: '.3rem' }}>Images/seconde</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: '.8rem' }}>
                {([24, 30, 60] as const).map((v) => (
                  <button key={v} onClick={() => setVidFps(v)} style={{ flex: 1, padding: '.4rem .2rem', fontSize: '.78rem', fontWeight: 600, borderRadius: 7, cursor: 'pointer', border: '1px solid ' + (vidFps === v ? 'var(--bordeaux, #6B1A2C)' : 'var(--gris-med, #ddd)'), background: vidFps === v ? 'var(--bordeaux, #6B1A2C)' : '#fff', color: vidFps === v ? '#fff' : '#333' }}>{v} fps</button>
                ))}
              </div>

              <div style={{ fontSize: '.78rem', fontWeight: 700, marginBottom: '.3rem' }}>Format</div>
              <div style={{ display: 'flex', gap: 6, marginBottom: '1rem' }}>
                <button onClick={() => setVidFormat('mp4')} style={{ flex: 1, padding: '.4rem .2rem', fontSize: '.78rem', fontWeight: 600, borderRadius: 7, cursor: 'pointer', border: '1px solid ' + (vidFormat === 'mp4' ? 'var(--bordeaux, #6B1A2C)' : 'var(--gris-med, #ddd)'), background: vidFormat === 'mp4' ? 'var(--bordeaux, #6B1A2C)' : '#fff', color: vidFormat === 'mp4' ? '#fff' : '#333' }}>MP4</button>
                <button disabled title="Bientôt disponible" style={{ flex: 1, padding: '.4rem .2rem', fontSize: '.78rem', fontWeight: 600, borderRadius: 7, border: '1px solid var(--gris-med, #ddd)', background: '#f3f3f3', color: '#bbb', cursor: 'not-allowed' }}>GIF (bientôt)</button>
              </div>

              <div style={{ display: 'flex', gap: '.5rem' }}>
                <button onClick={() => setVideoOpen(false)} style={{ flex: 1, padding: '.55rem', borderRadius: 8, border: '1px solid var(--gris-med, #ddd)', background: '#fff', fontWeight: 600, cursor: 'pointer' }}>Annuler</button>
                <button onClick={recordVideo} style={{ flex: 1, padding: '.55rem', borderRadius: 8, border: 'none', background: 'var(--or, #D4A24C)', color: '#0F0F12', fontWeight: 800, cursor: 'pointer' }}>Exporter</button>
              </div>
            </div>
          </div>
        )}

        {/* ----- Overlay pendant l'enregistrement ----- */}
        {recording && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 4100 }}>
            <div style={{ background: '#fff', borderRadius: 12, padding: '1.1rem 1.4rem', textAlign: 'center', boxShadow: '0 14px 50px rgba(0,0,0,.35)' }}>
              <div style={{ fontSize: '1.6rem', marginBottom: '.3rem' }}>🎥</div>
              <div style={{ fontWeight: 800, color: 'var(--bordeaux, #6B1A2C)' }}>Enregistrement en cours…</div>
              <div style={{ fontSize: '.78rem', color: '#6b6b6b', marginTop: '.3rem' }}>L'animation est rejouée et capturée. Le téléchargement démarre à la fin.</div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}



const CSS = `
@import url('https://fonts.googleapis.com/css2?family=Alfa+Slab+One&family=Roboto:wght@400;500;700;900&display=swap');

:root{
  --bordeaux:#6B1A2C; --bordeaux-d:#4A0F1E; --bordeaux-l:#8B2A3C;
  --or:#D4A24C; --or-d:#B8842C; --or-l:#E8C078;
  --parquet:#E8B96B;
  --noir:#0F0F12;
  --blanc:#FFFFFF;
  --gris-bg:#F5F5F5; --gris-med:#C8C8C8; --gris-text:#6B6B6B;
  --rouge:#E63946;
  --bleu:#1B5E9C;
  --varsity:'Alfa Slab One',serif;
  --body:'Roboto',sans-serif;
  --maxw:1200px;
}
html{font-size:15px}
@media (max-width:1100px){ html{font-size:14px} }

.mb-screen *{margin:0;padding:0;box-sizing:border-box}
.mb-screen{font-family:var(--body);color:var(--noir);background:var(--blanc);line-height:1.45;-webkit-font-smoothing:antialiased;display:flex;flex-direction:column;min-height:100vh;font-size:1rem}
.mb-screen a{text-decoration:none;color:inherit}
.mb-screen img{display:block;max-width:100%}
.mb-screen ul,.mb-screen ol{list-style:none}
.mb-screen button{font-family:inherit}
.mb-screen main{flex:1;width:100%}

/* ---------- PAGES ---------- */
.page{display:none !important;visibility:hidden !important}
.page.active{display:block !important;visibility:visible !important}

/* ---------- BOUTONS GÉNÉRIQUES ---------- */
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.45rem;padding:.6rem 1.25rem;border-radius:999px;font-family:var(--body);font-weight:500;font-size:.92rem;transition:.15s;cursor:pointer;border:none;background:none;color:inherit}
.btn-outline{background:transparent;border:1.5px solid var(--noir);color:var(--noir)}
.btn-outline:hover{background:var(--noir);color:var(--blanc)}
.btn-red{background:var(--rouge);color:var(--blanc)}
.btn-red:hover{background:#B91C2C}
.btn-small{padding:.35rem .85rem;font-size:.82rem}
.btn-block{width:100%}

/* ---------- ÉDITEUR / PLAQUETTE ---------- */
.editor-page{background:#F0EBE3}
.ed-toolbar{background:var(--bordeaux);color:var(--blanc);display:grid;grid-template-columns:1fr auto 1fr;align-items:center;gap:.4rem;padding:.5rem 1rem;border-bottom:2px solid var(--or)}
.toolbar-left{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;justify-content:flex-start;min-width:0}
.toolbar-center{display:flex;justify-content:center;align-items:center;min-width:0}
.toolbar-right{display:flex;align-items:center;gap:.4rem;flex-wrap:wrap;justify-content:flex-end;min-width:0}
.ed-tool{display:flex;flex-direction:column;align-items:center;gap:.15rem;padding:.35rem .75rem;border-radius:4px;cursor:pointer;transition:.15s;color:var(--blanc);font-size:.72rem;font-weight:500}
.ed-tool:hover{background:rgba(255,255,255,.1)}
.ed-tool.active{background:rgba(212,162,76,.3);color:var(--or)}
.ed-tool .icn{font-size:1.15rem}
.ed-title{width:100%;max-width:300px;min-width:160px;text-align:center;background:var(--bordeaux-d);padding:.45rem 1rem;border-radius:4px;color:var(--blanc);border:none;font-weight:500;font-size:.95rem}
.ed-icn-btn{width:34px;height:34px;display:flex;align-items:center;justify-content:center;border-radius:4px;color:var(--blanc);transition:.15s;font-size:1.05rem;cursor:pointer}
.ed-icn-btn:hover{background:rgba(255,255,255,.1)}
.ed-save{background:var(--or);color:var(--bordeaux-d);padding:.45rem 1.1rem;border-radius:6px;font-weight:700;font-size:.85rem;display:flex;align-items:center;gap:.4rem;cursor:pointer}
.ed-save:hover{background:var(--or-l)}
.ed-layout{display:grid;grid-template-columns:minmax(170px,200px) minmax(0,1fr) minmax(200px,240px);min-height:calc(100vh - 180px)}
.ed-left,.ed-right{background:var(--blanc);padding:.7rem;overflow-y:auto;max-height:calc(100vh - 160px);min-width:0}
.ed-left{border-right:1px solid var(--gris-med)}
.ed-right{border-left:1px solid var(--gris-med)}
.ed-tabs{display:flex;border-bottom:2px solid var(--gris-med);margin-bottom:.7rem}
.ed-tab{padding:.4rem .7rem;font-weight:700;font-size:.82rem;color:var(--gris-text);cursor:pointer;border-bottom:3px solid transparent;margin-bottom:-2px}
.ed-tab.active{color:var(--bordeaux);border-bottom-color:var(--bordeaux)}
.ph-counter{font-weight:700;margin-bottom:.5rem;color:var(--noir);font-size:.85rem}
.ph-actions{display:grid;grid-template-columns:repeat(4,1fr);gap:.15rem;margin-bottom:.7rem}
.ph-act{display:flex;flex-direction:column;align-items:center;gap:.1rem;padding:.35rem .15rem;background:var(--blanc);border:1px solid var(--gris-med);border-radius:4px;font-size:.6rem;cursor:pointer;transition:.15s}
.ph-act:hover{border-color:var(--bordeaux);background:rgba(107,26,44,.05)}
.ph-act .ico{font-size:.8rem}
.phases-list{display:flex;flex-direction:column;gap:.4rem;max-height:calc(100vh - 380px);overflow-y:auto;padding-right:.2rem}
.ph-thumb{aspect-ratio:16/12;background:#6B1A2C;background-size:cover;background-position:center;background-repeat:no-repeat;border:2px solid #C8C8C8;border-radius:5px;cursor:pointer;position:relative;transition:.15s;overflow:hidden}
.ph-thumb:hover{border-color:var(--or);transform:scale(1.02)}
.ph-thumb.active{border-color:var(--or);box-shadow:0 0 0 3px rgba(212,162,76,.35)}
.ph-thumb .pnum{position:absolute;bottom:3px;left:3px;background:rgba(0,0,0,.85);color:var(--or);padding:.1rem .35rem;border-radius:3px;font-size:.65rem;font-weight:700;font-family:var(--varsity);letter-spacing:.05em}
.ed-canvas-wrap{display:flex;flex-direction:column;align-items:center;justify-content:flex-start;padding:1rem;background:#F0EBE3;position:relative;min-width:0;overflow:hidden}
#playCanvas{width:100%;max-width:680px;height:auto;border-radius:6px;box-shadow:0 4px 20px rgba(0,0,0,.15);cursor:crosshair;display:block;touch-action:none;background:transparent;aspect-ratio:900/704}
#playCanvas[data-court="full"]{aspect-ratio:704/1100;max-width:480px}
.sec-lab{font-weight:700;font-size:.78rem;margin-bottom:.45rem;letter-spacing:.04em;display:flex;align-items:center;gap:.35rem}
.sec-lab .help{width:13px;height:13px;border:1.5px solid var(--gris-text);color:var(--gris-text);border-radius:50%;font-size:.6rem;display:inline-flex;align-items:center;justify-content:center;cursor:help}
.actions-grid{display:grid;grid-template-columns:1fr 1fr;gap:.3rem;margin-bottom:.9rem}
.act-btn{display:flex;align-items:center;gap:.3rem;padding:.4rem .55rem;background:var(--noir);color:var(--blanc);border-radius:5px;font-size:.72rem;cursor:pointer;transition:.15s}
.act-btn:hover{background:var(--bordeaux)}
.act-btn.active{background:var(--or);color:var(--noir);box-shadow:0 0 0 2px var(--or-d)}
.act-btn .icn{font-family:monospace;font-size:.75rem;color:var(--or)}
.act-btn.active .icn{color:var(--bordeaux-d)}
.players-row{display:grid;grid-template-columns:repeat(6,1fr);gap:.15rem;margin-bottom:.3rem}
.pl-btn{aspect-ratio:1;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:4px;font-weight:700;font-size:.72rem;transition:.15s;border:1.5px solid var(--gris-med);background:var(--blanc);color:var(--noir)}
.pl-btn:hover{border-color:var(--bordeaux);transform:translateY(-1px)}
.pl-btn.active{box-shadow:0 0 0 2px var(--noir)}
.pl-btn.active.s-defense{box-shadow:0 0 0 2px var(--bordeaux)}
.pl-btn.s-circle{border-radius:50%;background:var(--bordeaux);color:var(--or);border-color:var(--or)}
.pl-btn.s-square{background:var(--or);color:var(--noir);border-color:var(--noir)}
.pl-btn.s-defense{background:var(--blanc);color:var(--noir);font-size:.62rem}
.pl-btn.s-ball{background:var(--bordeaux);color:var(--or);border-radius:50%;border-color:var(--or);position:relative}
.pl-btn.s-ball::after{content:'';position:absolute;bottom:-2px;right:-2px;width:7px;height:7px;background:#E8743C;border-radius:50%;border:1px solid var(--noir)}
.misc-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:.25rem}
.misc-btn{aspect-ratio:1;display:flex;align-items:center;justify-content:center;cursor:pointer;border-radius:4px;font-size:.9rem;transition:.15s;border:1.5px solid var(--gris-med);background:var(--blanc)}
.misc-btn:hover{border-color:var(--bordeaux)}
.misc-btn.active{background:var(--or);border-color:var(--or-d)}
.mode-on{background:var(--bordeaux)!important;color:#fff!important;border-color:var(--bordeaux)!important}
.timeline{background:var(--noir);color:var(--blanc);padding:.65rem .85rem;display:flex;align-items:center;gap:.6rem;flex-wrap:wrap}
.tl-controls{display:flex;gap:.2rem;align-items:center}
.tl-btn{width:34px;height:34px;background:rgba(255,255,255,.1);color:var(--blanc);border-radius:4px;display:flex;align-items:center;justify-content:center;cursor:pointer;transition:.15s;font-size:.95rem}
.tl-btn:hover{background:var(--or);color:var(--noir)}
.tl-speed{background:rgba(255,255,255,.1);color:var(--blanc);padding:.35rem .55rem;border-radius:4px;font-size:.78rem;border:none}
.tl-progress{flex:1;height:7px;background:rgba(255,255,255,.15);border-radius:4px;cursor:pointer;position:relative;min-width:120px}
.tl-progress-bar{height:100%;background:var(--or);border-radius:4px;width:0;transition:width .1s linear}
.tl-status{font-size:.78rem;opacity:.85;font-family:monospace;min-width:90px;text-align:right}
.ed-hint{font-size:.7rem;color:var(--gris-text);margin-bottom:.85rem;padding:.4rem .55rem;background:var(--gris-bg);border-radius:4px;line-height:1.4}

@media (max-width:900px){
  .ed-layout{grid-template-columns:1fr}
  .ed-left,.ed-right{border:none;border-top:1px solid var(--gris-med);max-height:none}
}
`;